import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getTestDb } from '../src/db/client.js';
import { createApp } from '../src/api/server.js';
import { config } from '../src/config.js';
import { BOUNTY_STATUS } from '../src/types/index.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let app: ReturnType<typeof createApp>;

function makeToken(address: string): string {
  return jwt.sign({ address }, config.jwtSecret);
}

beforeAll(() => {
  db = getTestDb();
  app = createApp({ db });

  const now = Date.now();
  // Seed bounties
  db.prepare(`
    INSERT INTO bounties (bounty_id, meta_id, creator, region_id, sector_x, sector_y, sector_z,
      intel_types_wanted, reward_amount, deadline, status, submission_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-1', 'meta-1', '0xcreator', 1, 10, 20, 5, '[0,1]', 1_000_000_000, now + 86400000,
    BOUNTY_STATUS.PROOF_SUBMITTED, 1, now, now);

  db.prepare(`
    INSERT INTO bounties (bounty_id, meta_id, creator, region_id, sector_x, sector_y, sector_z,
      intel_types_wanted, reward_amount, deadline, status, submission_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-2', 'meta-2', '0xother', 2, 0, 0, 0, '[2]', 500_000_000, now + 172800000,
    BOUNTY_STATUS.OPEN, 0, now - 1000, now - 1000);

  // Expired bounty
  db.prepare(`
    INSERT INTO bounties (bounty_id, meta_id, creator, region_id, sector_x, sector_y, sector_z,
      intel_types_wanted, reward_amount, deadline, status, submission_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-expired', 'meta-3', '0xcreator', 1, 0, 0, 0, '[0]', 100, now - 1000,
    BOUNTY_STATUS.OPEN, 0, now - 86400000, now - 86400000);

  // Seed bounty_events
  db.prepare(`
    INSERT INTO bounty_events (bounty_id, event_type, hunter, actor, detail, timestamp, tx_digest)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-1', 'proof_submitted', '0xhunter', null,
    '{"proofUrl":"https://proof.example"}', now, 'tx-submit');
});

afterAll(() => { db.close(); });

describe('GET /api/bounties/active', () => {
  it('returns non-expired active bounties', async () => {
    const token = makeToken('0xanyone');
    const res = await request(app).get('/api/bounties/active').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(2); // bounty-1 + bounty-2, not expired
    expect(res.body.bounties.map((b: { bountyId: string }) => b.bountyId).sort())
      .toEqual(['bounty-1', 'bounty-2']);
  });
});

describe('GET /api/bounties/:bountyId', () => {
  it('returns bounty with events', async () => {
    const token = makeToken('0xanyone');
    const res = await request(app).get('/api/bounties/bounty-1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounty.bountyId).toBe('bounty-1');
    expect(res.body.bounty.events.length).toBe(1);
    expect(res.body.bounty.events[0].eventType).toBe('proof_submitted');
  });

  it('returns 404 for unknown bounty', async () => {
    const token = makeToken('0xanyone');
    const res = await request(app).get('/api/bounties/nonexistent').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/bounties/by-creator/:address', () => {
  it('returns bounties by creator', async () => {
    const token = makeToken('0xcreator');
    const res = await request(app).get('/api/bounties/by-creator/0xcreator').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(2); // bounty-1 + bounty-expired
  });
});

describe('GET /api/bounties/by-hunter/:address', () => {
  it('returns bounties where hunter has events', async () => {
    const token = makeToken('0xhunter');
    const res = await request(app).get('/api/bounties/by-hunter/0xhunter').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(1);
    expect(res.body.bounties[0].bountyId).toBe('bounty-1');
  });

  it('returns empty for unknown hunter', async () => {
    const token = makeToken('0xnobody');
    const res = await request(app).get('/api/bounties/by-hunter/0xnobody').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(0);
  });
});
