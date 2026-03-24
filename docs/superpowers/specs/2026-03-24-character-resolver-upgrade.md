# Character Resolver Upgrade — Direct On-Chain Query + Player Info Expansion

**Date**: 2026-03-24
**Status**: Draft
**Scope**: Backend resolver rewrite + frontend character display expansion

## Problem

`CharacterResolver` uses EVE EYES move calls to find character objects, but many addresses have no EVE EYES records. The resolver returns `name: null` for valid EVE Frontier players. Additionally, `CharacterInfo` only exposes `name` — missing tribe, tenant, item ID, and other game metadata available on-chain.

## Solution: Approach A — Pure RPC Direct Query

Replace EVE EYES-based resolution with direct Sui RPC calls:

1. `suix_getOwnedObjects(address, filter: PlayerProfile)` → get `character_id`
2. `sui_getObject(character_id)` → parse all Character fields

### On-Chain Structure (EVE Frontier testnet)

Package: `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75`

```
PlayerProfile (owned by wallet)
  ├─ character_id: address  ──→  Character (shared)
                                    ├─ character_address: address
                                    ├─ key: TenantItemId
                                    │    ├─ item_id: string
                                    │    └─ tenant: string
                                    ├─ metadata: Metadata
                                    │    ├─ name: string
                                    │    ├─ description: string
                                    │    ├─ url: string
                                    │    └─ assembly_id: address
                                    ├─ tribe_id: u64
                                    └─ owner_cap_id: address
```

## Data Model

### CharacterInfo (expanded)

```ts
export interface CharacterInfo {
  address: string;
  name: string | null;
  characterObjectId: string | null;
  profileObjectId: string | null;
  tribeId: number | null;
  itemId: string | null;
  tenant: string | null;
  description: string | null;
  avatarUrl: string | null;
  resolvedAt: number;
}
```

### DB Schema Change

`characters` table adds columns: `profile_object_id`, `tribe_id`, `item_id`, `tenant`, `description`, `avatar_url`. Remove `ttl` column (compute from `resolved_at + TTL`).

**Migration**: SQLite doesn't support DROP COLUMN cleanly. Use `DROP TABLE IF EXISTS characters` + `CREATE TABLE` in schema init — acceptable because character data is a cache (repopulated on next request). No data migration needed.

## Backend: CharacterResolver Rewrite

### resolve(address) Flow

```
1. DB cache check (resolvedAt + TTL > now?)
   ├─ hit → return cached CharacterInfo
   └─ miss ↓

2. suix_getOwnedObjects(address, filter: PlayerProfile type)
   ├─ no result → cache fallback (all null), TTL=1h, return
   └─ found → extract character_id from content.fields ↓

3. sui_getObject(character_id, showContent: true)
   ├─ success → parse: name, tribe_id, key.item_id, key.tenant,
   │             metadata.description, metadata.url
   │             cache to DB with TTL=24h, return CharacterInfo
   └─ failure (network/deleted) → cache fallback with profileObjectId only, TTL=1h, return

Notes:
- Multiple PlayerProfile objects: take first match (one wallet = one character in EVE Frontier)
- tribe_id: u64 on-chain but practical values fit JS number; store as INTEGER in SQLite
- assembly_id and owner_cap_id: intentionally not mapped (internal game engine use)
```

### Config

- `EVE_CHARACTER_PACKAGE_ID` env var (default: `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75`)
- Constructor: `CharacterResolver(db, suiClient)` — removes `EveEyesClient` dependency

### TTL Strategy

- Successful resolve: 24h
- Fallback (no PlayerProfile): 1h (new players get resolved sooner)

## Frontend

### Hook Changes

- `useCharacter(address)` — returns full `CharacterInfo` (replaces `useCharacterName`)
- `useCharacters(addresses)` — returns `Map<string, CharacterInfo>` (replaces `useCharacterNames`)
- Old hooks re-exported as thin wrappers: `useCharacterName` returns `{ name, isLoading, isError }` (unchanged API), `useCharacterNames` returns `Map<string, { name, isLoading }>` (unchanged API)

### CharacterName Component (enhanced)

Existing behavior preserved. Addition:
- Hover tooltip showing tribe_id, tenant, item_id (only non-null fields)
- Pure CSS tooltip (`group` + `hover:` + absolute positioning)

### PlayerCard Component (new)

Full player info card for profiles and detail pages:

```
┌──────────────────────────┐
│  [avatar]  murphy        │
│           tribe #1000167 │
│           utopia         │
│  0xc7f2...ec66           │
│  item: 2112000186        │
└──────────────────────────┘
```

- Avatar: `avatarUrl` if available, else address-based gradient placeholder
- Uses EVE theme tokens (`eve-gold`, `eve-muted`, `eve-panel-border`)
- Usage: wallet connected header, bounty detail creator/hunter sections

## Files Changed

| Layer | File | Change |
|-------|------|--------|
| Types | `services/src/types/index.ts` | CharacterInfo expand |
| Types | `next-monorepo/app/src/types/index.ts` | Sync expand |
| Config | `services/src/config.ts` | Add EVE_CHARACTER_PACKAGE_ID |
| Backend | `services/src/eve-eyes/character-resolver.ts` | Rewrite resolve logic |
| Backend | `services/src/api/server.ts` | Remove EveEyesClient from constructor |
| DB | `services/src/db/schema.ts` | characters table add columns |
| Frontend | `next-monorepo/app/src/hooks/use-character.ts` | useCharacter full info |
| Frontend | `next-monorepo/app/src/components/CharacterName.tsx` | Add tooltip |
| Frontend | `next-monorepo/app/src/components/PlayerCard.tsx` | New component |
| Tests | Corresponding test files | Update + new |

## Testing Strategy

- **Unit**: CharacterResolver with mocked SuiClient responses — verify field parsing
- **Unit**: PlayerCard / CharacterName render with full, partial, and null data
- **Integration**: `/api/character/:address` returns expanded fields
- **Monkey**: nonexistent address, malformed address, missing Character fields, deleted Character object

## Out of Scope

- EVE EYES client changes (retained for region activity)
- Other API routes
- On-chain contract changes
