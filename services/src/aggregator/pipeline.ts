import type Database from 'better-sqlite3';
import type {
  AggregatedCell,
  HeatmapQuery,
  SubscriptionTier,
} from '../types/index.js';

/**
 * Deterministic cell key for grouping intel reports into heatmap cells.
 */
export function makeCellKey(
  regionId: number,
  sectorX: number,
  sectorY: number,
  sectorZ: number,
  zoomLevel: number,
): string {
  return `${regionId}:${sectorX}:${sectorY}:${sectorZ}:${zoomLevel}`;
}

/**
 * Run the aggregation pipeline:
 * 1. Purge expired intel
 * 2. Group remaining reports into cells
 * 3. Apply K-anonymity suppression
 * 4. Upsert into heatmap_cache
 */
export function aggregateHeatmap(db: Database.Database, kThreshold: number): void {
  const now = Date.now();

  // 1. Delete expired intel
  db.prepare('DELETE FROM intel_reports WHERE expiry < ?').run(now);

  // 2. Aggregate remaining reports by cell
  const rows = db
    .prepare(
      `SELECT
        region_id, sector_x, sector_y, sector_z, zoom_level,
        COUNT(*)                   AS total_reports,
        COUNT(DISTINCT reporter)   AS reporter_count,
        AVG(severity)              AS avg_severity,
        MAX(timestamp)             AS latest_timestamp,
        intel_type
      FROM intel_reports
      GROUP BY region_id, sector_x, sector_y, sector_z, zoom_level, intel_type`,
    )
    .all() as Array<{
    region_id: number;
    sector_x: number;
    sector_y: number;
    sector_z: number;
    zoom_level: number;
    total_reports: number;
    reporter_count: number;
    avg_severity: number;
    latest_timestamp: number;
    intel_type: number;
  }>;

  // Build per-cell aggregation (merge intel_type counts)
  const cellMap = new Map<
    string,
    {
      regionId: number;
      sectorX: number;
      sectorY: number;
      sectorZ: number;
      zoomLevel: number;
      totalReports: number;
      reporterCount: number;
      avgSeverity: number;
      latestTimestamp: number;
      byType: Record<number, number>;
      severitySum: number;
      severityWeight: number;
    }
  >();

  for (const r of rows) {
    const key = makeCellKey(r.region_id, r.sector_x, r.sector_y, r.sector_z, r.zoom_level);
    let cell = cellMap.get(key);
    if (!cell) {
      cell = {
        regionId: r.region_id,
        sectorX: r.sector_x,
        sectorY: r.sector_y,
        sectorZ: r.sector_z,
        zoomLevel: r.zoom_level,
        totalReports: 0,
        reporterCount: 0,
        avgSeverity: 0,
        latestTimestamp: 0,
        byType: {},
        severitySum: 0,
        severityWeight: 0,
      };
      cellMap.set(key, cell);
    }
    cell.totalReports += r.total_reports;
    cell.byType[r.intel_type] = (cell.byType[r.intel_type] ?? 0) + r.total_reports;
    cell.severitySum += r.avg_severity * r.total_reports;
    cell.severityWeight += r.total_reports;
    if (r.latest_timestamp > cell.latestTimestamp) cell.latestTimestamp = r.latest_timestamp;
  }

  // Compute distinct reporter_count per cell (across all intel types)
  const reporterRows = db
    .prepare(
      `SELECT
        region_id, sector_x, sector_y, sector_z, zoom_level,
        COUNT(DISTINCT reporter) AS reporter_count
      FROM intel_reports
      GROUP BY region_id, sector_x, sector_y, sector_z, zoom_level`,
    )
    .all() as Array<{
    region_id: number;
    sector_x: number;
    sector_y: number;
    sector_z: number;
    zoom_level: number;
    reporter_count: number;
  }>;

  for (const r of reporterRows) {
    const key = makeCellKey(r.region_id, r.sector_x, r.sector_y, r.sector_z, r.zoom_level);
    const cell = cellMap.get(key);
    if (cell) cell.reporterCount = r.reporter_count;
  }

  // 3 + 4. Upsert into heatmap_cache
  const upsert = db.prepare(`
    INSERT INTO heatmap_cache
      (cell_key, zoom_level, region_id, sector_x, sector_y, sector_z,
       total_reports, reporter_count, suppressed, by_type_json, avg_severity,
       latest_timestamp, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cell_key) DO UPDATE SET
      total_reports    = excluded.total_reports,
      reporter_count   = excluded.reporter_count,
      suppressed       = excluded.suppressed,
      by_type_json     = excluded.by_type_json,
      avg_severity     = excluded.avg_severity,
      latest_timestamp = excluded.latest_timestamp,
      updated_at       = excluded.updated_at
  `);

  const upsertAll = db.transaction(() => {
    // Clear stale cells that no longer have reports
    db.prepare('DELETE FROM heatmap_cache').run();

    for (const [key, cell] of cellMap) {
      const suppressed = cell.reporterCount < kThreshold ? 1 : 0;
      const avgSev = cell.severityWeight > 0 ? cell.severitySum / cell.severityWeight : 0;
      upsert.run(
        key,
        cell.zoomLevel,
        cell.regionId,
        cell.sectorX,
        cell.sectorY,
        cell.sectorZ,
        cell.totalReports,
        cell.reporterCount,
        suppressed,
        JSON.stringify(cell.byType),
        avgSev,
        cell.latestTimestamp,
        now,
      );
    }
  });

  upsertAll();
}

/**
 * Query heatmap data with tier-based gating.
 */
export function getHeatmapData(
  db: Database.Database,
  query: HeatmapQuery,
  tier: SubscriptionTier,
): AggregatedCell[] {
  // Free tier: only zoom 0-1
  if (tier === 'free' && query.zoomLevel > 1) {
    return [];
  }

  let sql = 'SELECT * FROM heatmap_cache WHERE zoom_level = ? AND suppressed = 0';
  const params: (number | string)[] = [query.zoomLevel];

  if (query.regionId !== undefined) {
    sql += ' AND region_id = ?';
    params.push(query.regionId);
  }

  if (query.intelType !== undefined) {
    sql += " AND json_extract(by_type_json, '$.' || ?) IS NOT NULL";
    params.push(String(query.intelType));
  }

  if (query.since !== undefined) {
    sql += ' AND latest_timestamp >= ?';
    params.push(query.since);
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    cell_key: string;
    zoom_level: number;
    region_id: number;
    sector_x: number;
    sector_y: number;
    sector_z: number;
    total_reports: number;
    reporter_count: number;
    suppressed: number;
    by_type_json: string | null;
    avg_severity: number | null;
    latest_timestamp: number;
    updated_at: number;
  }>;

  return rows.map((r) => {
    const isFree = tier === 'free';
    return {
      cellKey: r.cell_key,
      zoomLevel: r.zoom_level,
      regionId: r.region_id,
      sectorX: r.sector_x,
      sectorY: r.sector_y,
      sectorZ: r.sector_z,
      totalReports: r.total_reports,
      reporterCount: r.reporter_count,
      suppressed: r.suppressed === 1,
      byType: isFree ? null : (r.by_type_json ? JSON.parse(r.by_type_json) as Record<number, number> : null),
      avgSeverity: isFree ? null : r.avg_severity,
      latestTimestamp: r.latest_timestamp,
      updatedAt: r.updated_at,
    };
  });
}
