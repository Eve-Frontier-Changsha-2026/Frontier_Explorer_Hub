import type Database from 'better-sqlite3';
import type { SuiClient } from '@mysten/sui/client';
import type { CharacterInfo } from '../types/index.js';
import { config } from '../config.js';

const TTL_SUCCESS_MS = 24 * 60 * 60 * 1000; // 24h
const TTL_FALLBACK_MS = 1 * 60 * 60 * 1000; // 1h

const PLAYER_PROFILE_TYPE = `${config.eveCharacterPackageId}::character::PlayerProfile`;

export class CharacterResolver {
  constructor(
    private db: Database.Database,
    private sui: SuiClient,
  ) {}

  async resolve(address: string): Promise<CharacterInfo> {
    // Step 1: DB cache check
    const cached = this.getCached(address);
    if (cached) return cached;

    const now = Date.now();
    const fallback = this.makeFallback(address, now);

    try {
      // Step 2: Get PlayerProfile owned by wallet
      const profileRes = await this.sui.getOwnedObjects({
        owner: address,
        filter: { StructType: PLAYER_PROFILE_TYPE },
        options: { showContent: true },
      });

      if (!profileRes.data?.length) {
        this.cacheResult(fallback, TTL_FALLBACK_MS);
        return fallback;
      }

      const profileData = profileRes.data[0]!.data;
      if (!profileData?.content || !('fields' in profileData.content)) {
        this.cacheResult(fallback, TTL_FALLBACK_MS);
        return fallback;
      }

      const profileFields = profileData.content.fields as Record<string, unknown>;
      const characterId = profileFields['character_id'] as string | undefined;
      if (!characterId) {
        this.cacheResult(fallback, TTL_FALLBACK_MS);
        return fallback;
      }

      // Step 3: Get Character shared object
      const charObj = await this.sui.getObject({
        id: characterId,
        options: { showContent: true },
      });

      if (!charObj.data?.content || !('fields' in charObj.data.content)) {
        const partial: CharacterInfo = {
          ...fallback,
          profileObjectId: profileData.objectId,
        };
        this.cacheResult(partial, TTL_FALLBACK_MS);
        return partial;
      }

      const fields = charObj.data.content.fields as Record<string, unknown>;
      const metadata = (fields['metadata'] as { fields?: Record<string, unknown> })?.fields ?? {};
      const key = (fields['key'] as { fields?: Record<string, unknown> })?.fields ?? {};
      const tribeIdRaw = fields['tribe_id'];

      const result: CharacterInfo = {
        address,
        name: typeof metadata['name'] === 'string' ? metadata['name'] : null,
        characterObjectId: characterId,
        profileObjectId: profileData.objectId,
        tribeId: tribeIdRaw != null ? Number(tribeIdRaw) : null,
        itemId: typeof key['item_id'] === 'string' ? key['item_id'] : null,
        tenant: typeof key['tenant'] === 'string' ? key['tenant'] : null,
        description: typeof metadata['description'] === 'string' ? metadata['description'] : null,
        avatarUrl: typeof metadata['url'] === 'string' && metadata['url'] !== '' ? metadata['url'] : null,
        resolvedAt: now,
      };

      this.cacheResult(result, TTL_SUCCESS_MS);
      return result;
    } catch {
      this.cacheResult(fallback, TTL_FALLBACK_MS);
      return fallback;
    }
  }

  private getCached(address: string): CharacterInfo | null {
    const row = this.db
      .prepare('SELECT * FROM characters WHERE address = ? AND resolved_at + cache_ttl > ?')
      .get(address, Date.now()) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      address: row['address'] as string,
      name: row['name'] as string | null,
      characterObjectId: row['character_object_id'] as string | null,
      profileObjectId: row['profile_object_id'] as string | null,
      tribeId: row['tribe_id'] != null ? Number(row['tribe_id']) : null,
      itemId: row['item_id'] as string | null,
      tenant: row['tenant'] as string | null,
      description: row['description'] as string | null,
      avatarUrl: row['avatar_url'] as string | null,
      resolvedAt: row['resolved_at'] as number,
    };
  }

  private makeFallback(address: string, now: number): CharacterInfo {
    return {
      address,
      name: null,
      characterObjectId: null,
      profileObjectId: null,
      tribeId: null,
      itemId: null,
      tenant: null,
      description: null,
      avatarUrl: null,
      resolvedAt: now,
    };
  }

  private cacheResult(info: CharacterInfo, ttlMs: number): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO characters
         (address, name, character_object_id, profile_object_id, tribe_id, item_id, tenant, description, avatar_url, resolved_at, cache_ttl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        info.address, info.name, info.characterObjectId, info.profileObjectId,
        info.tribeId, info.itemId, info.tenant, info.description, info.avatarUrl,
        info.resolvedAt, ttlMs,
      );
  }
}
