import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTestDb } from '../src/db/client.js';
import type Database from 'better-sqlite3';

// Mock UtopiaClient
const mockGetKillmails = vi.fn();
const mockGetCharacters = vi.fn();
const mockGetAssemblies = vi.fn();
const mockGetTribes = vi.fn();

vi.mock('../src/utopia/client.js', () => ({
  UtopiaClient: vi.fn().mockImplementation(() => ({
    getKillmails: mockGetKillmails,
    getCharacters: mockGetCharacters,
    getAssemblies: mockGetAssemblies,
    getTribes: mockGetTribes,
  })),
  getUtopiaClient: vi.fn(() => ({
    getKillmails: mockGetKillmails,
    getCharacters: mockGetCharacters,
    getAssemblies: mockGetAssemblies,
    getTribes: mockGetTribes,
  })),
}));

import { UtopiaTracker } from '../src/utopia/tracker.js';

describe('UtopiaTracker', () => {
  let db: Database.Database;
  let tracker: UtopiaTracker;

  const mockKillmails = {
    items: [
      { id: '0xkill1', killerId: '0xa', killerName: 'sun', victimId: '0xb', victimName: 'moon', reporterId: '0xa', reporterName: 'sun', lossType: 'SHIP', solarSystemId: 30013131, killedAt: Date.now(), shard: 1 },
    ],
  };

  const mockCharacters = {
    items: [
      { id: '0xchar1', name: 'sun', address: '0xaddr1', tribeId: 1000167, tribeName: 'CO86', tribeTicker: 'CO86', createdAt: Date.now() - 3600000 },
    ],
  };

  const mockAssemblies = {
    items: [
      { id: '0xasm1', state: 'ONLINE', ownerId: '0xa', ownerName: 'sun', name: '', typeId: 88092, anchoredAt: Date.now() },
    ],
  };

  const mockTribes = {
    items: [
      { id: 1000167, name: 'Clonebank 86', nameShort: 'CO86', description: '', tribeUrl: '', memberCount: 150, createdAt: Date.now() - 86400000 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db = getTestDb();
    tracker = new UtopiaTracker(db);
    mockGetKillmails.mockResolvedValue(mockKillmails);
    mockGetCharacters.mockResolvedValue(mockCharacters);
    mockGetAssemblies.mockResolvedValue(mockAssemblies);
    mockGetTribes.mockResolvedValue(mockTribes);
  });

  afterEach(() => {
    tracker.stop();
  });

  it('pollAll inserts killmails into utopia_killmails', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_killmails WHERE id = ?').get('0xkill1') as { killer_name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.killer_name).toBe('sun');
  });

  it('pollAll inserts characters into utopia_characters', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_characters WHERE id = ?').get('0xchar1') as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('sun');
  });

  it('pollAll inserts assemblies into utopia_assemblies', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_assemblies WHERE id = ?').get('0xasm1') as { state: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.state).toBe('ONLINE');
  });

  it('pollAll inserts tribes into utopia_tribes', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_tribes WHERE id = ?').get(1000167) as { name_short: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name_short).toBe('CO86');
  });

  it('pollAll upserts on duplicate id', async () => {
    await tracker.pollAll();
    // Change name and poll again
    mockGetCharacters.mockResolvedValue({
      items: [{ ...mockCharacters.items[0], name: 'sun_updated' }],
    });
    await tracker.pollAll();
    const rows = db.prepare('SELECT * FROM utopia_characters WHERE id = ?').all('0xchar1');
    expect(rows).toHaveLength(1);
    expect((rows[0] as { name: string }).name).toBe('sun_updated');
  });

  it('pollAll handles API error gracefully', async () => {
    mockGetKillmails.mockRejectedValue(new Error('Utopia 500'));
    // Should not throw — errors are caught and logged
    await expect(tracker.pollAll()).resolves.not.toThrow();
  });
});
