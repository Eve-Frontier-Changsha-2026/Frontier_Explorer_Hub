import { Router } from 'express';
import type Database from 'better-sqlite3';
import { config } from '../../config.js';
import type { AggregatedCell, TierGatedResponse } from '../../types/index.js';

/**
 * Local stub for getHeatmapData — reads directly from heatmap_cache.
 * TODO: Replace with import from ../../aggregator/pipeline.js when Track C merges.
 */
function getHeatmapData(
  db: Database.Database,
  query: { zoomLevel: number; regionId?: number; intelType?: number; since?: number },
  tier: 'free' | 'premium',
): AggregatedCell[] {
  let sql = `SELECT * FROM heatmap_cache WHERE zoom_level = ?`;
  const params: (number | string)[] = [query.zoomLevel];

  if (query.regionId !== undefined) {
    sql += ` AND region_id = ?`;
    params.push(query.regionId);
  }
  if (query.since !== undefined) {
    sql += ` AND latest_timestamp >= ?`;
    params.push(query.since);
  }

  sql += ` AND suppressed = 0`;

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

  return rows.map((r) => ({
    cellKey: r.cell_key,
    zoomLevel: r.zoom_level,
    regionId: r.region_id,
    sectorX: r.sector_x,
    sectorY: r.sector_y,
    sectorZ: r.sector_z,
    totalReports: r.total_reports,
    reporterCount: r.reporter_count,
    suppressed: r.suppressed === 1,
    byType: tier === 'premium' && r.by_type_json ? (JSON.parse(r.by_type_json) as Record<number, number>) : null,
    avgSeverity: tier === 'premium' ? r.avg_severity : null,
    latestTimestamp: r.latest_timestamp,
    updatedAt: r.updated_at,
  }));
}

export function createHeatmapRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/heatmap/:zoomLevel', (req, res) => {
    const zoomLevel = parseInt(req.params.zoomLevel, 10);
    if (isNaN(zoomLevel) || zoomLevel < 0 || zoomLevel > 2) {
      res.status(400).json({ error: 'zoomLevel must be 0, 1, or 2' });
      return;
    }

    const tier = req.auth.tier;

    // Free tier: zoom 2 restricted
    if (tier === 'free' && zoomLevel === 2) {
      res.status(403).json({ error: 'Premium subscription required for system-level zoom' });
      return;
    }

    const query = {
      zoomLevel,
      regionId: req.query.regionId ? parseInt(req.query.regionId as string, 10) : undefined,
      intelType: req.query.intelType ? parseInt(req.query.intelType as string, 10) : undefined,
      since: req.query.since ? parseInt(req.query.since as string, 10) : undefined,
    };

    const data = getHeatmapData(db, query, tier);

    const response: TierGatedResponse<AggregatedCell[]> = {
      tier,
      data,
      stale: tier === 'free',
      delayed_by_ms: tier === 'free' ? config.freeTierDelayMs : undefined,
    };

    res.json(response);
  });

  return router;
}
