import { Router } from 'express';
import type Database from 'better-sqlite3';

interface IntelRow {
  intel_id: string;
  reporter: string;
  region_id: number;
  sector_x: number;
  sector_y: number;
  sector_z: number;
  zoom_level: number;
  raw_location_hash: string | null;
  intel_type: number;
  severity: number;
  timestamp: number;
  expiry: number;
  visibility: number;
  deposit_amount: number;
}

export function createIntelRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/intel/:intelId', (req, res) => {
    const { intelId } = req.params;

    const row = db
      .prepare('SELECT * FROM intel_reports WHERE intel_id = ?')
      .get(intelId) as IntelRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Intel report not found' });
      return;
    }

    // Public intel — return full data
    if (row.visibility === 0) {
      res.json({ locked: false, intel: formatIntel(row) });
      return;
    }

    // Private intel — check if caller has unlock receipt
    const address = req.auth.address;
    const receipt = db
      .prepare('SELECT receipt_id FROM unlock_receipts WHERE intel_id = ? AND buyer = ?')
      .get(intelId, address) as { receipt_id: string } | undefined;

    if (receipt || address === row.reporter) {
      res.json({ locked: false, intel: formatIntel(row) });
      return;
    }

    // Locked — return partial data
    res.json({
      locked: true,
      intel: {
        intelId: row.intel_id,
        intelType: row.intel_type,
        severity: row.severity,
        regionId: row.region_id,
        zoomLevel: row.zoom_level,
        timestamp: row.timestamp,
        expiry: row.expiry,
        depositAmount: row.deposit_amount,
      },
    });
  });

  return router;
}

function formatIntel(row: IntelRow) {
  return {
    intelId: row.intel_id,
    reporter: row.reporter,
    regionId: row.region_id,
    sectorX: row.sector_x,
    sectorY: row.sector_y,
    sectorZ: row.sector_z,
    zoomLevel: row.zoom_level,
    rawLocationHash: row.raw_location_hash,
    intelType: row.intel_type,
    severity: row.severity,
    timestamp: row.timestamp,
    expiry: row.expiry,
    visibility: row.visibility,
    depositAmount: row.deposit_amount,
  };
}
