import type Database from 'better-sqlite3';

// Seed systems from frontier-trade-routes (known EVE Frontier solar systems)
const SEED_NAMES: Record<string, string> = {
  '30001719': 'ONT-MT7',
  '30004452': 'IN3-K3D',
  '30004448': 'EH1-FQC',
  '30004453': 'ULV-77D',
  '30004449': 'U1S-HBD',
  '30004451': 'E27-HSD',
  '30004455': 'E5V-0BD',
  '30004454': 'O3V-49D',
  '30004450': 'OBQ-6JD',
  '30000007': 'UR7-5FN',
  '30000006': 'OFC-3FN',
  '30000005': 'I9T-0FN',
  '30000004': 'O3H-1FN',
};

function systemName(id: string): string {
  return SEED_NAMES[id] ?? `SYS-${id.slice(-6)}`;
}

interface SystemBucket {
  killCount: number;
  intelCount: number;
  gateTraffic: number;
  marketActivity: number;
  latestEventAt: number;
}

export function aggregateSystemHeatmap(db: Database.Database): void {
  const now = Date.now();
  const buckets = new Map<string, SystemBucket>();

  function getBucket(id: string): SystemBucket {
    let b = buckets.get(id);
    if (!b) {
      b = { killCount: 0, intelCount: 0, gateTraffic: 0, marketActivity: 0, latestEventAt: 0 };
      buckets.set(id, b);
    }
    return b;
  }

  // 1. Killmails
  const kills = db.prepare(
    'SELECT solar_system_id, COUNT(*) as cnt, MAX(killed_at) as latest FROM utopia_killmails GROUP BY solar_system_id'
  ).all() as Array<{ solar_system_id: number; cnt: number; latest: number }>;

  for (const row of kills) {
    const b = getBucket(String(row.solar_system_id));
    b.killCount = row.cnt;
    b.latestEventAt = Math.max(b.latestEventAt, row.latest);
  }

  // 2. Intel reports (non-expired)
  const intel = db.prepare(
    'SELECT region_id, COUNT(*) as cnt, MAX(timestamp) as latest FROM intel_reports WHERE expiry > ? GROUP BY region_id'
  ).all(now) as Array<{ region_id: number; cnt: number; latest: number }>;

  for (const row of intel) {
    const b = getBucket(String(row.region_id));
    b.intelCount = row.cnt;
    b.latestEventAt = Math.max(b.latestEventAt, row.latest);
  }

  // 3. Gate traffic (from region_activity — traffic_index as proxy)
  const gateActivity = db.prepare(
    'SELECT region_id, traffic_index, window_end FROM region_activity WHERE region_id IS NOT NULL ORDER BY window_end DESC'
  ).all() as Array<{ region_id: number; traffic_index: number; window_end: number }>;

  const seenGateRegions = new Set<number>();
  for (const row of gateActivity) {
    if (seenGateRegions.has(row.region_id)) continue;
    seenGateRegions.add(row.region_id);
    const b = getBucket(String(row.region_id));
    b.gateTraffic = Math.round(row.traffic_index);
    b.latestEventAt = Math.max(b.latestEventAt, row.window_end);
  }

  // 4. Market activity (bounties as proxy)
  const market = db.prepare(
    'SELECT region_id, COUNT(*) as cnt, MAX(updated_at) as latest FROM bounties GROUP BY region_id'
  ).all() as Array<{ region_id: number; cnt: number; latest: number }>;

  for (const row of market) {
    const b = getBucket(String(row.region_id));
    b.marketActivity = row.cnt;
    b.latestEventAt = Math.max(b.latestEventAt, row.latest);
  }

  // Upsert all
  const upsert = db.prepare(`
    INSERT INTO heatmap_systems (system_id, system_name, kill_count, intel_count, gate_traffic, market_activity, intensity, latest_event_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(system_id) DO UPDATE SET
      system_name = excluded.system_name,
      kill_count = excluded.kill_count,
      intel_count = excluded.intel_count,
      gate_traffic = excluded.gate_traffic,
      market_activity = excluded.market_activity,
      intensity = excluded.intensity,
      latest_event_at = excluded.latest_event_at,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const [id, b] of buckets) {
      const intensity = Math.min(100, b.killCount * 20 + b.intelCount * 15 + b.gateTraffic * 5 + b.marketActivity * 3);
      upsert.run(id, systemName(id), b.killCount, b.intelCount, b.gateTraffic, b.marketActivity, intensity, b.latestEventAt, now);
    }
  });

  tx();
}
