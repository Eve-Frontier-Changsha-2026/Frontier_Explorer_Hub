import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { SuiClient } from '@mysten/sui/client';

interface BountyRow {
  bounty_id: string;
  meta_id: string;
  creator: string;
  region_id: number;
  sector_x: number;
  sector_y: number;
  sector_z: number;
  intel_types_wanted: string;
  reward_amount: number;
  deadline: number;
  status: number;
  submission_count: number;
  created_at: number;
  updated_at: number;
}

interface EventRow {
  id: number;
  bounty_id: string;
  event_type: string;
  hunter: string;
  actor: string | null;
  detail: string | null;
  timestamp: number;
  tx_digest: string;
}

function formatBounty(row: BountyRow) {
  return {
    bountyId: row.bounty_id,
    metaId: row.meta_id,
    creator: row.creator,
    targetRegion: {
      regionId: row.region_id,
      sectorX: row.sector_x,
      sectorY: row.sector_y,
      sectorZ: row.sector_z,
    },
    intelTypesWanted: JSON.parse(row.intel_types_wanted),
    rewardAmount: row.reward_amount,
    deadline: row.deadline,
    status: row.status,
    submissionCount: row.submission_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatEvent(row: EventRow) {
  return {
    id: row.id,
    bountyId: row.bounty_id,
    eventType: row.event_type,
    hunter: row.hunter,
    actor: row.actor,
    detail: row.detail ? JSON.parse(row.detail) : null,
    timestamp: row.timestamp,
    txDigest: row.tx_digest,
  };
}

export function createBountiesRouter(db: Database.Database, suiClient?: SuiClient): Router {
  const router = Router();

  const stmts = {
    active: db.prepare(
      'SELECT * FROM bounties WHERE status < 5 AND deadline > ? ORDER BY created_at DESC',
    ),
    detail: db.prepare('SELECT * FROM bounties WHERE bounty_id = ?'),
    events: db.prepare(
      'SELECT * FROM bounty_events WHERE bounty_id = ? ORDER BY timestamp ASC',
    ),
    byCreator: db.prepare(
      'SELECT * FROM bounties WHERE creator = ? ORDER BY created_at DESC',
    ),
    byHunter: db.prepare(
      `SELECT DISTINCT b.* FROM bounties b
       JOIN bounty_events e ON b.bounty_id = e.bounty_id
       WHERE e.hunter = ? ORDER BY b.updated_at DESC`,
    ),
  };

  router.get('/bounties/active', (_req, res) => {
    const rows = stmts.active.all(Date.now()) as BountyRow[];
    res.json({ bounties: rows.map(formatBounty) });
  });

  router.get('/bounties/by-creator/:address', (req, res) => {
    const rows = stmts.byCreator.all(req.params.address) as BountyRow[];
    res.json({ bounties: rows.map(formatBounty) });
  });

  router.get('/bounties/by-hunter/:address', (req, res) => {
    const rows = stmts.byHunter.all(req.params.address) as BountyRow[];
    res.json({ bounties: rows.map(formatBounty) });
  });

  // NOTE: This must come AFTER /by-creator and /by-hunter to avoid :bountyId matching those paths
  router.get('/bounties/:bountyId', async (req, res) => {
    try {
      const row = stmts.detail.get(req.params.bountyId) as BountyRow | undefined;
      if (!row) { res.status(404).json({ error: 'Bounty not found' }); return; }
      const events = stmts.events.all(req.params.bountyId) as EventRow[];

      // Supplement with on-chain claim ticket data
      let hunters: { hunter: string; stakeAmount: number }[] = [];
      if (suiClient) {
        try {
          const obj = await suiClient.getObject({
            id: req.params.bountyId,
            options: { showContent: true },
          });
          const fields = (obj.data?.content as { fields: Record<string, unknown> })?.fields;
          if (fields?.['active_hunter_stakes']) {
            const stakes = fields['active_hunter_stakes'] as { fields?: { contents?: Array<{ fields: { key: string; value: string } }> } };
            const contents = stakes?.fields?.contents ?? [];
            hunters = contents.map((entry) => ({
              hunter: entry.fields.key,
              stakeAmount: Number(entry.fields.value),
            }));
          }
        } catch (err) {
          console.warn(`[bounties] Failed to fetch claim tickets for ${req.params.bountyId}:`, err);
        }
      }

      res.json({
        bounty: { ...formatBounty(row), events: events.map(formatEvent), hunters },
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
