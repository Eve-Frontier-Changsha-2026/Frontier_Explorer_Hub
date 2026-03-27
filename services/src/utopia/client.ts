import { config } from '../config.js';
import type {
  UtopiaPaginatedResponse,
  UtopiaCharacter,
  UtopiaKillmail,
  UtopiaAssembly,
  UtopiaTribe,
  UtopiaCharacterDetail,
  UtopiaAssemblyDetail,
} from '../types/index.js';

// ── Rate limiter (same pattern as EVE EYES client) ───────────

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

// ── Client ───────────────────────────────────────────────────

export class UtopiaClient {
  private baseUrl: string;
  private rateLimiter: RateLimiter;

  constructor(opts?: { baseUrl?: string; rateLimit?: number }) {
    this.baseUrl = opts?.baseUrl ?? config.utopiaBaseUrl;
    this.rateLimiter = new RateLimiter(opts?.rateLimit ?? 5, 1000);
  }

  private async request<T>(path: string): Promise<T> {
    await this.rateLimiter.waitForSlot();

    const res = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Utopia ${res.status}: ${path} — ${body}`);
    }

    return res.json() as Promise<T>;
  }

  // ── List endpoints (for polling) ─────────────────────────────

  async getKillmails(): Promise<UtopiaPaginatedResponse<UtopiaKillmail>> {
    return this.request('/api/killmails');
  }

  async getCharacters(): Promise<UtopiaPaginatedResponse<UtopiaCharacter>> {
    return this.request('/api/characters');
  }

  async getAssemblies(
    namespace: string,
    state: string,
  ): Promise<UtopiaPaginatedResponse<UtopiaAssembly>> {
    return this.request(`/api/assemblies/${namespace}/${state}`);
  }

  async getTribes(): Promise<UtopiaPaginatedResponse<UtopiaTribe>> {
    return this.request('/api/tribes');
  }

  // ── Detail endpoints (for drill-down, on-demand) ─────────────

  async getCharacterDetail(id: string): Promise<UtopiaCharacterDetail> {
    return this.request(`/api/character/${id}`);
  }

  async getCharacterKills(id: string): Promise<UtopiaPaginatedResponse<UtopiaKillmail>> {
    return this.request(`/api/character/${id}/kills`);
  }

  async getCharacterAssemblies(id: string): Promise<UtopiaPaginatedResponse<UtopiaAssembly>> {
    return this.request(`/api/character/${id}/assemblies`);
  }

  async getAssemblyDetail(id: string): Promise<UtopiaAssemblyDetail> {
    return this.request(`/api/assembly/${id}`);
  }

  async getAssemblyNetwork(id: string): Promise<UtopiaPaginatedResponse<UtopiaAssembly>> {
    return this.request(`/api/assembly/${id}/network`);
  }

  async getTribeDetail(id: number): Promise<UtopiaTribe> {
    return this.request(`/api/tribe/${id}`);
  }

  async getTribeCharacters(id: number): Promise<UtopiaPaginatedResponse<UtopiaCharacter>> {
    return this.request(`/api/tribe/${id}/characters`);
  }
}

// Singleton
let _client: UtopiaClient | null = null;

export function getUtopiaClient(): UtopiaClient {
  if (!_client) _client = new UtopiaClient();
  return _client;
}
