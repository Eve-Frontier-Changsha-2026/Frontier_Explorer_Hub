/**
 * Standalone script: crawl all gate objects from EVE EYES + SUI RPC
 * and populate eve_systems table + data/eve_systems.json.
 *
 * Usage: npx tsx src/scripts/crawl-eve-systems.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuiClient } from '@mysten/sui/client';
import { config } from '../config.js';
import { EveEyesClient } from '../eve-eyes/client.js';
import { getDb, closeDb } from '../db/client.js';
import type { SystemCoords } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Rate-limited SUI RPC helper ────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('[crawl] Starting EVE systems crawl...');

  const db = getDb();
  const eveClient = new EveEyesClient();
  const suiClient = new SuiClient({ url: config.suiRpcUrl });

  // Already-crawled txDigests for resume support
  const crawled = new Set<string>(
    (
      db.prepare('SELECT created_by_tx FROM eve_systems').all() as Array<{ created_by_tx: string }>
    ).map((r) => r.created_by_tx),
  );
  console.log(`[crawl] Resuming — ${crawled.size} txDigests already in DB`);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO eve_systems (object_id, object_type, x, y, z, name, created_by_tx)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const systems: SystemCoords[] = [];
  let processed = 0;
  let inserted = 0;

  const iterator = eveClient.iterateMoveCalls(
    {
      packageId: config.eveWorldPackageId,
      moduleName: 'gate',
      functionName: 'share_gate',
    },
    50,
  );

  for await (const call of iterator) {
    processed++;

    if (crawled.has(call.txDigest)) {
      if (processed % 100 === 0) {
        console.log(`[crawl] Progress: ${processed} calls processed, ${inserted} new inserts`);
      }
      continue;
    }

    try {
      // Fetch the full transaction to find created objects
      const txBlock = await suiClient.getTransactionBlock({
        digest: call.txDigest,
        options: { showObjectChanges: true },
      });

      const created = (txBlock.objectChanges ?? []).filter(
        (c) => c.type === 'created',
      );

      for (const obj of created) {
        if (obj.type !== 'created') continue;

        // TODO: Filter by exact gate object type once known
        // e.g. obj.objectType === `${config.eveWorldPackageId}::gate::Gate`
        const isGate = obj.objectType?.includes('::gate::') ?? false;
        if (!isGate) continue;

        // Fetch object fields
        const objData = await suiClient.getObject({
          id: obj.objectId,
          options: { showContent: true },
        });

        const content = objData.data?.content;
        if (!content || content.dataType !== 'moveObject') continue;

        // TODO: Replace placeholder field access with actual gate struct fields
        // The gate object likely has position/coords fields — update once
        // on-chain schema is confirmed. For now we try common patterns:
        const fields = content.fields as Record<string, unknown>;
        const x = Number(fields['x'] ?? fields['coord_x'] ?? fields['position_x'] ?? 0);
        const y = Number(fields['y'] ?? fields['coord_y'] ?? fields['position_y'] ?? 0);
        const z = Number(fields['z'] ?? fields['coord_z'] ?? fields['position_z'] ?? 0);
        const name = (fields['name'] as string) ?? null;

        const sys: SystemCoords = {
          objectId: obj.objectId,
          objectType: 'gate',
          x,
          y,
          z,
          name,
          createdByTx: call.txDigest,
        };

        insertStmt.run(sys.objectId, sys.objectType, sys.x, sys.y, sys.z, sys.name, sys.createdByTx);
        systems.push(sys);
        inserted++;

        // Rate limit: ~200ms between SUI RPC calls
        await sleep(200);
      }
    } catch (err) {
      console.error(`[crawl] Error processing tx ${call.txDigest}:`, err);
      // Continue — don't let one bad tx kill the whole crawl
    }

    if (processed % 100 === 0) {
      console.log(`[crawl] Progress: ${processed} calls processed, ${inserted} new inserts`);
    }
  }

  // Also load existing DB entries for the JSON dump
  const allSystems = db
    .prepare('SELECT object_id, object_type, x, y, z, name, created_by_tx FROM eve_systems')
    .all() as Array<{
    object_id: string;
    object_type: string;
    x: number;
    y: number;
    z: number;
    name: string | null;
    created_by_tx: string;
  }>;

  // Write static JSON
  const dataDir = resolve(__dirname, '../../data');
  mkdirSync(dataDir, { recursive: true });
  const outPath = resolve(dataDir, 'eve_systems.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      allSystems.map((r) => ({
        objectId: r.object_id,
        objectType: r.object_type,
        x: r.x,
        y: r.y,
        z: r.z,
        name: r.name,
        createdByTx: r.created_by_tx,
      })),
      null,
      2,
    ),
  );

  console.log(`[crawl] Done. Processed ${processed}, inserted ${inserted}. JSON → ${outPath}`);
  closeDb();
}

main().catch((err) => {
  console.error('[crawl] Fatal error:', err);
  closeDb();
  process.exit(1);
});
