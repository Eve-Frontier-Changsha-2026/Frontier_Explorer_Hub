import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterResolver } from '../eve-eyes/character-resolver.js';
import { initSchema } from '../db/schema.js';

// Mock SuiClient
function createMockSui(overrides: Record<string, unknown> = {}) {
  return {
    getOwnedObjects: vi.fn().mockResolvedValue({ data: [] }),
    getObject: vi.fn().mockResolvedValue({ data: null }),
    ...overrides,
  } as any;
}

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

describe('CharacterResolver', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  it('returns fallback for address with no PlayerProfile', async () => {
    const sui = createMockSui();
    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xnoone');

    expect(result.address).toBe('0xnoone');
    expect(result.name).toBeNull();
    expect(result.characterObjectId).toBeNull();
    expect(result.profileObjectId).toBeNull();
    expect(result.tribeId).toBeNull();
    expect(sui.getOwnedObjects).toHaveBeenCalledOnce();
  });

  it('resolves full character info from PlayerProfile → Character', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xprofile1',
            content: {
              dataType: 'moveObject',
              fields: { character_id: '0xchar1' },
            },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xchar1',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: {
                fields: { name: 'murphy', description: 'A pilot', url: 'https://avatar.png' },
              },
              tribe_id: '1000167',
              key: {
                fields: { item_id: '2112000186', tenant: 'utopia' },
              },
            },
          },
        },
      }),
    });

    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xplayer');

    expect(result.name).toBe('murphy');
    expect(result.characterObjectId).toBe('0xchar1');
    expect(result.profileObjectId).toBe('0xprofile1');
    expect(result.tribeId).toBe(1000167);
    expect(result.itemId).toBe('2112000186');
    expect(result.tenant).toBe('utopia');
    expect(result.description).toBe('A pilot');
    expect(result.avatarUrl).toBe('https://avatar.png');
  });

  it('returns cached result on second call', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xprofile1',
            content: {
              dataType: 'moveObject',
              fields: { character_id: '0xchar1' },
            },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xchar1',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'cached', description: '', url: '' } },
              tribe_id: '1',
              key: { fields: { item_id: '1', tenant: 't' } },
            },
          },
        },
      }),
    });

    const resolver = new CharacterResolver(db, sui);
    await resolver.resolve('0xcached');
    const second = await resolver.resolve('0xcached');

    expect(second.name).toBe('cached');
    expect(sui.getOwnedObjects).toHaveBeenCalledOnce(); // only 1 RPC call
  });

  it('falls back gracefully on RPC error', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockRejectedValue(new Error('RPC down')),
    });

    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xfail');

    expect(result.name).toBeNull();
    expect(result.resolvedAt).toBeGreaterThan(0);
  });

  it('handles Character with missing metadata fields', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xprofile1',
            content: {
              dataType: 'moveObject',
              fields: { character_id: '0xchar1' },
            },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xchar1',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'sparse' } },
              // no tribe_id, no key
            },
          },
        },
      }),
    });

    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xsparse');

    expect(result.name).toBe('sparse');
    expect(result.tribeId).toBeNull();
    expect(result.itemId).toBeNull();
    expect(result.tenant).toBeNull();
  });
});
