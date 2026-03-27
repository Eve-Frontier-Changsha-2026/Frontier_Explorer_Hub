import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UtopiaClient } from '../src/utopia/client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('UtopiaClient', () => {
  let client: UtopiaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new UtopiaClient({ baseUrl: 'https://test.example.com' });
  });

  describe('getKillmails', () => {
    it('fetches and returns killmails', async () => {
      const mockData = {
        items: [
          {
            id: '0xabc',
            killerId: '0x111',
            killerName: 'attacker',
            victimId: '0x222',
            victimName: 'defender',
            reporterId: '0x111',
            reporterName: 'attacker',
            lossType: 'SHIP',
            solarSystemId: 30013131,
            killedAt: 1774426597000,
            shard: 1,
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await client.getKillmails();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].killerName).toBe('attacker');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/killmails',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('getCharacters', () => {
    it('fetches and returns characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: '0x1', name: 'test', address: '0x2', tribeId: 100, tribeName: 'T', tribeTicker: 'TT', createdAt: 1000 }] }),
      });

      const result = await client.getCharacters();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('test');
    });
  });

  describe('getAssemblies', () => {
    it('fetches assemblies with namespace and state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: '0xa', state: 'ONLINE', ownerId: '0xb', ownerName: 'owner', name: '', typeId: 88092, anchoredAt: 1000 }] }),
      });

      const result = await client.getAssemblies('NWN', 'ONLINE');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/assemblies/NWN/ONLINE',
        expect.any(Object),
      );
      expect(result.items[0].state).toBe('ONLINE');
    });
  });

  describe('getTribes', () => {
    it('fetches and returns tribes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: 98000011, name: 'BIBA CORP', nameShort: 'BIBA', description: '', tribeUrl: '', memberCount: 2, createdAt: 1000 }] }),
      });

      const result = await client.getTribes();
      expect(result.items[0].nameShort).toBe('BIBA');
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(client.getKillmails()).rejects.toThrow('Utopia 500');
    });
  });

  describe('rate limiting', () => {
    it('does not exceed rate limit', async () => {
      const fastClient = new UtopiaClient({ baseUrl: 'https://test.example.com', rateLimit: 2 });
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) });
      }

      const start = Date.now();
      await fastClient.getKillmails();
      await fastClient.getCharacters();
      await fastClient.getTribes();
      const elapsed = Date.now() - start;

      // Third request should have waited (~1s for the rate limiter window)
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });

  describe('detail endpoints', () => {
    it('getCharacterDetail fetches single character', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '0xabc', name: 'sun', shard: 1, address: '0x1', profileId: '0x2', tribeId: 100, tribeName: 'T', tribeTicker: 'TT', tribeJoinedAt: 1000, createdAt: 1000 }),
      });

      const result = await client.getCharacterDetail('0xabc');
      expect(result.name).toBe('sun');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/character/0xabc',
        expect.any(Object),
      );
    });

    it('getAssemblyDetail fetches single assembly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '0xdef', state: 'ONLINE', pkTypeState: 'NWN|ONLINE', shard: 1, ownerId: '0x1', ownerName: 'admin', locationHash: 'abc', name: '', dappURL: '', description: '', networkNodeId: '0xdef', itemId: 1000, typeId: 88092, assemblyType: 'NWN', anchoredAt: 1000 }),
      });

      const result = await client.getAssemblyDetail('0xdef');
      expect(result.assemblyType).toBe('NWN');
    });

    it('getTribeDetail fetches single tribe', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 98000011, name: 'BIBA CORP', nameShort: 'BIBA', description: '', tribeUrl: '', memberCount: 2, createdAt: 1000 }),
      });

      const result = await client.getTribeDetail(98000011);
      expect(result.name).toBe('BIBA CORP');
    });
  });
});
