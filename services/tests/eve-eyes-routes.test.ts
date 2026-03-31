import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getTestDb } from '../src/db/client.js';
import { createApp } from '../src/api/server.js';
import type Database from 'better-sqlite3';

// Mock the EveEyesClient singleton
vi.mock('../src/eve-eyes/client.js', () => {
  const mockClient = {
    getKillmails: vi.fn().mockResolvedValue({ items: [{ killmailItemId: '1', killTimestamp: '2026-03-30T21:17:32.000Z', lossType: 'SHIP', solarSystemId: '30013131', resolutionStatus: 'resolved', killer: { label: 'sun', username: 'sun', walletAddress: '0xa', characterItemId: '1' }, victim: { label: 'moon', username: 'moon', walletAddress: '0xb', characterItemId: '2' } }] }),
    getLeaderboard: vi.fn().mockResolvedValue({ ok: true, apiVersion: 'v1', auth: { type: 'apiKey' }, leaderboard: [{ rank: 1, tenant: 'utopia', ownerCharacterItemId: '1', userId: '1', walletAddress: '0xa', buildingCount: 54, lastSeenAt: '2026-03-26T12:48:36Z', username: 'lacal' }] }),
    getModulesSummary: vi.fn().mockResolvedValue({ modules: [{ title: 'Atlas', href: '/atlas', description: 'Search systems', metric: '24502 systems', supporting: '2213 constellations', status: 'live' }] }),
    searchSystems: vi.fn().mockResolvedValue({ data: [{ id: 30000142, name: 'EHK-KH7', constellationId: 20000011, regionId: 10000005 }] }),
    getSystemDetail: vi.fn().mockResolvedValue({ id: 30000142, name: 'EHK-KH7', constellationId: 20000011, regionId: 10000005, location: { x: 0, y: 0, z: 0 }, gateLinks: [] }),
    getRoute: vi.fn().mockResolvedValue({ route: [30000142, 30000143, 30002510] }),
    getTransactionBlockDetail: vi.fn().mockResolvedValue({ item: { digest: 'abc' } }),
    getTransactionMoveCalls: vi.fn().mockResolvedValue({ items: [] }),
    getMoveCallDetail: vi.fn().mockResolvedValue({ item: {} }),
  };
  return {
    getEveEyesClient: () => mockClient,
    EveEyesClient: vi.fn(),
    __mockClient: mockClient,
  };
});

let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  db = getTestDb();
});

beforeEach(() => {
  // Fresh app per test to avoid rate limit (10 req/min free tier)
  app = createApp({ db });
});

afterAll(() => {
  db.close();
});

describe('EVE Eyes proxy routes', () => {
  it('GET /api/eve-eyes/killmails returns killmails', async () => {
    const res = await request(app).get('/api/eve-eyes/killmails');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].killmailItemId).toBe('1');
  });

  it('GET /api/eve-eyes/leaderboard returns leaderboard', async () => {
    const res = await request(app).get('/api/eve-eyes/leaderboard?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toHaveLength(1);
  });

  it('GET /api/eve-eyes/modules-summary returns modules', async () => {
    const res = await request(app).get('/api/eve-eyes/modules-summary');
    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(1);
  });

  it('GET /api/eve-eyes/systems/search returns results', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/search?q=EHK');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/eve-eyes/systems/search requires q param', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/search');
    expect(res.status).toBe(400);
  });

  it('GET /api/eve-eyes/systems/:id returns system detail', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/30000142');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('EHK-KH7');
  });

  it('GET /api/eve-eyes/systems/:id rejects non-numeric id', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/abc');
    expect(res.status).toBe(400);
  });

  it('GET /api/eve-eyes/route returns route', async () => {
    const res = await request(app).get('/api/eve-eyes/route?originId=30000142&destinationId=30002510');
    expect(res.status).toBe(200);
    expect(res.body.route).toHaveLength(3);
  });

  it('GET /api/eve-eyes/route requires both params', async () => {
    const res = await request(app).get('/api/eve-eyes/route?originId=30000142');
    expect(res.status).toBe(400);
  });

  it('GET /api/eve-eyes/tx/:digest returns tx detail', async () => {
    const res = await request(app).get('/api/eve-eyes/tx/abc123');
    expect(res.status).toBe(200);
  });

  it('GET /api/eve-eyes/tx/:digest/move-calls returns move calls', async () => {
    const res = await request(app).get('/api/eve-eyes/tx/abc123/move-calls');
    expect(res.status).toBe(200);
  });

  it('GET /api/eve-eyes/move-call/:txDigest/:callIndex returns detail', async () => {
    const res = await request(app).get('/api/eve-eyes/move-call/abc123/0');
    expect(res.status).toBe(200);
  });
});
