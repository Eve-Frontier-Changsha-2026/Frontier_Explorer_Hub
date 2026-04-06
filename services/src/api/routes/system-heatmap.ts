import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { SystemHeatmapNode, SystemHeatmapLink } from '../../types/index.js';

function getSystemNodes(db: Database.Database): SystemHeatmapNode[] {
  const rows = db.prepare(
    'SELECT * FROM heatmap_systems ORDER BY intensity DESC'
  ).all() as Array<{
    system_id: string; system_name: string; kill_count: number; intel_count: number;
    gate_traffic: number; market_activity: number; intensity: number;
    latest_event_at: number; updated_at: number;
  }>;

  return rows.map((r) => ({
    systemId: r.system_id,
    systemName: r.system_name,
    killCount: r.kill_count,
    intelCount: r.intel_count,
    gateTraffic: r.gate_traffic,
    marketActivity: r.market_activity,
    intensity: r.intensity,
    latestEventAt: r.latest_event_at,
    updatedAt: r.updated_at,
  }));
}

function getSystemLinks(db: Database.Database): SystemHeatmapLink[] {
  const rows = db.prepare(`
    SELECT DISTINCT a.solar_system_id AS sys_a, b.solar_system_id AS sys_b
    FROM utopia_killmails a
    JOIN utopia_killmails b ON a.killer_id = b.killer_id AND a.solar_system_id < b.solar_system_id
    LIMIT 100
  `).all() as Array<{ sys_a: number; sys_b: number }>;

  return rows.map((r) => ({
    from: String(r.sys_a),
    to: String(r.sys_b),
  }));
}

export function createSystemHeatmapRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/heatmap/systems', (_req, res) => {
    const systems = getSystemNodes(db);
    const links = getSystemLinks(db);

    res.json({
      systems,
      links,
      generatedAt: new Date().toISOString(),
    });
  });

  return router;
}
