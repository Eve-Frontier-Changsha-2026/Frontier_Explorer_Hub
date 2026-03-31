import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EveEyesClient } from '../src/eve-eyes/client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('EveEyesClient — new endpoints', () => {
  let client: EveEyesClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new EveEyesClient({
      baseUrl: 'https://eve-eyes.test',
      apiKey: 'test-key',
      rateLimit: 100,
    });
  });

  function mockJsonResponse(data: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
    });
  }

  it('getKillmails calls /api/indexer/killmails with params', async () => {
    mockJsonResponse({ items: [] });
    await client.getKillmails(5, 'resolved');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/killmails');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('status')).toBe('resolved');
  });

  it('getLeaderboard calls /api/v1/indexer/building-leaderboard', async () => {
    mockJsonResponse({ ok: true, leaderboard: [] });
    await client.getLeaderboard(10, 'gate');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/indexer/building-leaderboard');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('moduleName')).toBe('gate');
  });

  it('getModuleCallCounts calls /api/indexer/module-call-counts', async () => {
    mockJsonResponse({ modules: [] });
    await client.getModuleCallCounts();
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/module-call-counts');
  });

  it('getModulesSummary calls /api/world/modules-summary', async () => {
    mockJsonResponse({ modules: [] });
    await client.getModulesSummary();
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/modules-summary');
  });

  it('searchSystems calls /api/world/systems/search', async () => {
    mockJsonResponse({ data: [] });
    await client.searchSystems('jita');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/systems/search');
    expect(url.searchParams.get('q')).toBe('jita');
  });

  it('getSystemDetail calls /api/world/systems/:id', async () => {
    mockJsonResponse({ id: 30000142 });
    await client.getSystemDetail(30000142);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/systems/30000142');
  });

  it('getRoute calls /api/world/route', async () => {
    mockJsonResponse({ route: [1, 2, 3] });
    await client.getRoute(30000142, 30002510);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/route');
    expect(url.searchParams.get('originId')).toBe('30000142');
    expect(url.searchParams.get('destinationId')).toBe('30002510');
  });

  it('getTransactionBlockDetail calls /api/indexer/transaction-blocks/:digest', async () => {
    mockJsonResponse({ item: {} });
    await client.getTransactionBlockDetail('abc123');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/transaction-blocks/abc123');
  });

  it('getMoveCallDetail calls /api/indexer/move-calls/:txDigest/:callIndex', async () => {
    mockJsonResponse({ item: {} });
    await client.getMoveCallDetail('abc123', 0);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/move-calls/abc123/0');
  });
});
