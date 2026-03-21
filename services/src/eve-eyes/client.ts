import { config } from '../config.js';
import type {
  EveEyesMoveCall,
  EveEyesPaginatedResponse,
  EveEyesTransactionBlock,
  EveModuleName,
} from '../types/index.js';

// ── Rate limiter ──────────────────────────────────────────────

class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0]!;
      const waitMs = this.windowMs - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.timestamps.push(Date.now());
  }
}

// ── Client ────────────────────────────────────────────────────

export interface MoveCallFilters {
  network?: string;
  senderAddress?: string;
  status?: string;
  txDigest?: string;
  packageId?: string;
  moduleName?: EveModuleName;
  functionName?: string;
  callIndex?: number;
}

export interface TransactionBlockFilters {
  network?: string;
  senderAddress?: string;
  status?: string;
  digest?: string;
  transactionKind?: string;
  checkpoint?: string;
}

export class EveEyesClient {
  private baseUrl: string;
  private apiKey: string;
  private rateLimiter: RateLimiter;

  constructor(opts?: { baseUrl?: string; apiKey?: string; rateLimit?: number }) {
    this.baseUrl = opts?.baseUrl ?? config.eveEyesBaseUrl;
    this.apiKey = opts?.apiKey ?? config.eveEyesApiKey;
    // Default: 5 req/sec to be polite
    this.rateLimiter = new RateLimiter(opts?.rateLimit ?? 5, 1000);
  }

  // ── Low-level fetch ───────────────────────────────────────

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    await this.rateLimiter.waitForSlot();

    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`EVE EYES ${res.status}: ${path} — ${body}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Move Calls ────────────────────────────────────────────

  async getMoveCalls(
    filters: MoveCallFilters = {},
    page = 1,
    pageSize = 20,
  ): Promise<EveEyesPaginatedResponse<EveEyesMoveCall>> {
    return this.request('/api/indexer/move-calls', {
      ...filters,
      page,
      pageSize,
    });
  }

  async *iterateMoveCalls(
    filters: MoveCallFilters = {},
    pageSize = 50,
  ): AsyncGenerator<EveEyesMoveCall> {
    let page = 1;
    while (true) {
      const res = await this.getMoveCalls(filters, page, pageSize);
      for (const item of res.items) {
        yield item;
      }
      if (page >= res.pagination.totalPages || res.items.length === 0) break;
      page++;
    }
  }

  // ── Transaction Blocks ────────────────────────────────────

  async getTransactionBlocks(
    filters: TransactionBlockFilters = {},
    page = 1,
    pageSize = 20,
  ): Promise<EveEyesPaginatedResponse<EveEyesTransactionBlock>> {
    return this.request('/api/indexer/transaction-blocks', {
      ...filters,
      page,
      pageSize,
    });
  }

  async *iterateTransactionBlocks(
    filters: TransactionBlockFilters = {},
    pageSize = 50,
  ): AsyncGenerator<EveEyesTransactionBlock> {
    let page = 1;
    while (true) {
      const res = await this.getTransactionBlocks(filters, page, pageSize);
      for (const item of res.items) {
        yield item;
      }
      if (page >= res.pagination.totalPages || res.items.length === 0) break;
      page++;
    }
  }

  // ── Convenience: module activity count ────────────────────

  async getModuleCallCount(
    moduleName: EveModuleName,
    network = 'testnet',
  ): Promise<number> {
    const res = await this.getMoveCalls(
      { moduleName, network },
      1,
      1,
    );
    return res.pagination.total;
  }

  async getModuleCallsBySender(
    moduleName: EveModuleName,
    senderAddress: string,
    network = 'testnet',
  ): Promise<EveEyesPaginatedResponse<EveEyesMoveCall>> {
    return this.getMoveCalls({ moduleName, senderAddress, network });
  }
}

// Singleton
let _client: EveEyesClient | null = null;

export function getEveEyesClient(): EveEyesClient {
  if (!_client) _client = new EveEyesClient();
  return _client;
}
