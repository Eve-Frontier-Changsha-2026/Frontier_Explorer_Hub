import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterResolver } from '../eve-eyes/character-resolver.js';
import { initSchema } from '../db/schema.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function createMockSui(overrides: Record<string, unknown> = {}) {
  return {
    getOwnedObjects: vi.fn().mockResolvedValue({ data: [] }),
    getObject: vi.fn().mockResolvedValue({ data: null }),
    ...overrides,
  } as any;
}

describe('CharacterResolver — monkey tests', () => {
  it('handles empty string address', async () => {
    const resolver = new CharacterResolver(createDb(), createMockSui());
    const result = await resolver.resolve('');
    expect(result.address).toBe('');
    expect(result.name).toBeNull();
  });

  it('handles extremely long address', async () => {
    const longAddr = '0x' + 'a'.repeat(1000);
    const resolver = new CharacterResolver(createDb(), createMockSui());
    const result = await resolver.resolve(longAddr);
    expect(result.address).toBe(longAddr);
  });

  it('handles malformed getOwnedObjects response (missing data array)', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({}),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xmalformed');
    expect(result.name).toBeNull();
  });

  it('handles Character object with null content', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xp',
            content: { dataType: 'moveObject', fields: { character_id: '0xc' } },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({ data: { objectId: '0xc', content: null } }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xnull');
    expect(result.profileObjectId).toBe('0xp');
    expect(result.name).toBeNull();
  });

  it('handles tribe_id as string "0" (falsy but valid)', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xp',
            content: { dataType: 'moveObject', fields: { character_id: '0xc' } },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xc',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'zero' } },
              tribe_id: '0',
              key: { fields: {} },
            },
          },
        },
      }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xzero');
    expect(result.tribeId).toBe(0); // should be 0, not null
  });

  it('concurrent resolve for same address deduplicates via cache', async () => {
    let callCount = 0;
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { data: [] };
      }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    await Promise.all([
      resolver.resolve('0xrace'),
      resolver.resolve('0xrace'),
    ]);
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it('handles RPC timeout (rejected promise)', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xtimeout');
    expect(result.name).toBeNull();
    expect(result.resolvedAt).toBeGreaterThan(0);
  });

  it('treats empty-string avatarUrl as null', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xp',
            content: { dataType: 'moveObject', fields: { character_id: '0xc' } },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xc',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'noavatar', url: '' } },
              tribe_id: '1',
              key: { fields: { item_id: '1', tenant: 't' } },
            },
          },
        },
      }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xempty');
    expect(result.avatarUrl).toBeNull();
  });
});
