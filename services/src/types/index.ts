// ── On-chain types (mirror Move structs) ──────────────────────

export interface GridCell {
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  zoomLevel: number; // 0=frontier, 1=region, 2=system
}

export interface IntelReport {
  intelId: string;
  reporter: string;
  location: GridCell;
  rawLocationHash: string;
  intelType: number; // 0=resource, 1=threat, 2=wreckage, 3=population
  severity: number;  // 0-10
  timestamp: number;
  expiry: number;
  visibility: number; // 0=public, 1=private
  depositAmount: number;
}

export interface SubscriptionRecord {
  subscriptionId: string;
  subscriber: string;
  tier: number; // 0=free, 1=premium
  startedAt: number;
  expiresAt: number;
}

export interface UnlockReceiptRecord {
  receiptId: string;
  buyer: string;
  intelId: string;
  unlockedAt: number;
  pricePaid: number;
}

// ── Aggregation types ─────────────────────────────────────────

export interface AggregatedCell {
  cellKey: string;
  zoomLevel: number;
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  totalReports: number;
  reporterCount: number;
  suppressed: boolean; // true if reporterCount < K
  byType: Record<number, number> | null; // Premium only
  avgSeverity: number | null;            // Premium only
  latestTimestamp: number;
  updatedAt: number;
}

export type SubscriptionTier = 'free' | 'premium';

export interface HeatmapQuery {
  zoomLevel: number;
  regionId?: number;
  intelType?: number;
  since?: number;
}

export interface TierGatedResponse<T> {
  tier: SubscriptionTier;
  data: T;
  stale?: boolean; // true if free tier delayed data
  delayed_by_ms?: number;
}

// ── EVE EYES types ────────────────────────────────────────────

export interface EveEyesTransactionBlock {
  id: string;
  digest: string;
  network: string;
  checkpoint: string;
  senderAddress: string;
  transactionKind: string;
  status: string;
  errorMessage: string | null;
  executedAt: string;
  transactionTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface EveEyesMoveCall {
  id: string;
  txDigest: string;
  callIndex: number;
  packageId: string;
  moduleName: string;
  functionName: string;
  rawCall: string;
  transactionTime: string;
  createdAt: string;
  network: string;
  senderAddress: string;
  status: string;
  checkpoint: string;
}

export interface EveEyesPaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    freePageLimit: number;
  };
  auth: { type: string };
}

export type EveModuleName =
  | 'character'
  | 'gate'
  | 'turret'
  | 'storage_unit'
  | 'assembly'
  | 'network_node'
  | 'energy'
  | 'fuel';

export interface EveActivityIndex {
  defenseIndex: number;  // turret calls / window
  infraIndex: number;    // network_node calls / window
  trafficIndex: number;  // gate calls / window
  activePlayers: number; // distinct senderAddress count
  windowStart: number;
  windowEnd: number;
  updatedAt: number;
}

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

export interface SystemCoords {
  objectId: string;
  objectType: 'gate' | 'network_node';
  x: number;
  y: number;
  z: number;
  name: string | null;
  createdByTx: string;
}

// ── Event types (from Move events) ───────────────────────────

export interface IntelSubmittedEvent {
  intelId: string;
  reporter: string;
  location: GridCell;
  intelType: number;
  severity: number;
  timestamp: number;
  visibility: number;
}

export interface SubscriptionCreatedEvent {
  subscriptionId: string;
  subscriber: string;
  tier: number;
  expiresAt: number;
}

export interface IntelUnlockedEvent {
  receiptId: string;
  buyer: string;
  intelId: string;
  pricePaid: number;
  reporterShare: number;
}

// ── Bounty event types (from Move events) ────────────────────

export interface IntelBountyCreatedEvent {
  bounty_id: string;
  meta_id: string;
  creator: string;
  target_region: {
    region_id: number;
    sector_x: number;
    sector_y: number;
    sector_z: number;
  };
  intel_types_wanted: number[];
}

export interface ProofSubmittedEvent {
  bounty_id: string;
  hunter: string;
  proof_url: string;
  submitted_at: string; // u64 as string from JSON
}

export interface ProofRejectedEvent {
  bounty_id: string;
  hunter: string;
  verifier: string;
  reason: string;
  rejected_at: string;
}

export interface ProofResubmittedEvent {
  bounty_id: string;
  hunter: string;
  proof_url: string;
  resubmitted_at: string;
}

export interface DisputeRaisedEvent {
  bounty_id: string;
  hunter: string;
  reason: string;
  disputed_at: string;
}

export interface DisputeResolvedEvent {
  bounty_id: string;
  hunter: string;
  resolved_by: string;
  approved: boolean;
  resolved_at: string;
}

export interface ProofAutoApprovedEvent {
  bounty_id: string;
  hunter: string;
  approved_at: string;
}

// Bounty status codes
export const BOUNTY_STATUS = {
  OPEN: 0,
  CLAIMED: 1,
  PROOF_SUBMITTED: 2,
  PROOF_REJECTED: 3,
  DISPUTED: 4,
  COMPLETED: 5,
} as const;

// ── API auth ──────────────────────────────────────────────────

export interface AuthPayload {
  address: string;
  tier: SubscriptionTier;
  expiresAt: number;
}

// ── SSE (reserved for future C approach) ─────────────────────

export type SSEEventType =
  | 'heatmap:update'
  | 'intel:new'
  | 'bounty:new'
  | 'activity:update';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: number;
}
