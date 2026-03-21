import { Router } from 'express';
import type Database from 'better-sqlite3';

interface HeatmapRow {
  total_reports: number;
  reporter_count: number;
}

interface ActivityRow {
  defense_index: number;
  infra_index: number;
  traffic_index: number;
  active_players: number;
  window_start: number;
  window_end: number;
  updated_at: number;
}

export function createRegionRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/region/:regionId/summary', (req, res) => {
    const regionId = parseInt(req.params.regionId, 10);
    if (isNaN(regionId)) {
      res.status(400).json({ error: 'Invalid regionId' });
      return;
    }

    // Heatmap totals for this region
    const heatmap = db
      .prepare(
        `SELECT COALESCE(SUM(total_reports), 0) as total_reports,
                COALESCE(SUM(reporter_count), 0) as reporter_count
         FROM heatmap_cache WHERE region_id = ? AND suppressed = 0`,
      )
      .get(regionId) as HeatmapRow;

    // Latest EVE activity
    const activity = db
      .prepare(
        `SELECT defense_index, infra_index, traffic_index, active_players,
                window_start, window_end, updated_at
         FROM region_activity WHERE region_id = ?
         ORDER BY window_end DESC LIMIT 1`,
      )
      .get(regionId) as ActivityRow | undefined;

    res.json({
      regionId,
      heatmap: {
        totalReports: heatmap.total_reports,
        reporterCount: heatmap.reporter_count,
      },
      activity: activity
        ? {
            defenseIndex: activity.defense_index,
            infraIndex: activity.infra_index,
            trafficIndex: activity.traffic_index,
            activePlayers: activity.active_players,
            windowStart: activity.window_start,
            windowEnd: activity.window_end,
            updatedAt: activity.updated_at,
          }
        : null,
    });
  });

  return router;
}
