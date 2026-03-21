import type Database from 'better-sqlite3';
import type { SuiClient } from '@mysten/sui/client';
import type { EveEyesClient } from './client.js';
import type { CharacterInfo } from '../types/index.js';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class CharacterResolver {
  constructor(
    private db: Database.Database,
    private eveEyes: EveEyesClient,
    private sui: SuiClient,
  ) {}

  async resolve(address: string): Promise<CharacterInfo> {
    // Step 1: check DB cache
    const cached = this.db
      .prepare('SELECT * FROM characters WHERE address = ? AND ttl > ?')
      .get(address, Date.now()) as
      | { address: string; name: string | null; character_object_id: string | null; resolved_at: number; ttl: number }
      | undefined;

    if (cached) {
      return {
        address: cached.address,
        name: cached.name,
        characterObjectId: cached.character_object_id,
        resolvedAt: cached.resolved_at,
        ttl: cached.ttl,
      };
    }

    const now = Date.now();
    const fallback: CharacterInfo = {
      address,
      name: null,
      characterObjectId: null,
      resolvedAt: now,
      ttl: now + TTL_MS,
    };

    try {
      // Step 2: EVE EYES — find character move calls for this address
      const moveCallRes = await this.eveEyes.getMoveCalls(
        { moduleName: 'character', senderAddress: address },
        1,
        1,
      );

      if (moveCallRes.items.length === 0) {
        this.cacheResult(fallback);
        return fallback;
      }

      const txDigest = moveCallRes.items[0]!.txDigest;

      // Step 3: SuiClient — get transaction with object changes
      const txBlock = await this.sui.getTransactionBlock({
        digest: txDigest,
        options: { showObjectChanges: true },
      });

      const objectChanges = txBlock.objectChanges ?? [];
      const charChange = objectChanges.find(
        (c) => 'objectType' in c && typeof c.objectType === 'string' && c.objectType.includes('::character::'),
      );

      if (!charChange || !('objectId' in charChange)) {
        this.cacheResult(fallback);
        return fallback;
      }

      const characterObjId = charChange.objectId;

      // Step 4: SuiClient — get character object content
      const obj = await this.sui.getObject({
        id: characterObjId,
        options: { showContent: true },
      });

      let name: string | null = null;
      if (obj.data?.content && 'fields' in obj.data.content) {
        const fields = obj.data.content.fields as Record<string, unknown>;
        if (typeof fields['name'] === 'string') {
          name = fields['name'];
        }
      }

      const result: CharacterInfo = {
        address,
        name,
        characterObjectId: characterObjId,
        resolvedAt: now,
        ttl: now + TTL_MS,
      };

      // Step 5: Cache to DB
      this.cacheResult(result);
      return result;
    } catch {
      // Step 6: Graceful degradation
      this.cacheResult(fallback);
      return fallback;
    }
  }

  private cacheResult(info: CharacterInfo): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO characters (address, name, character_object_id, resolved_at, ttl)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(info.address, info.name, info.characterObjectId, info.resolvedAt, info.ttl);
  }
}
