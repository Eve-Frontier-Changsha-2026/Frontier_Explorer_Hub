export interface GridCell {
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  zoomLevel: number;
}

export interface IntelReport {
  id: string;
  reporter: string;
  location: GridCell;
  intelType: number;
  severity: number;
  timestamp: number;
  expiry: number;
  visibility: number;
}

export interface AggregatedCell {
  cell: GridCell;
  totalReports: number;
  reporterCount: number;
  suppressed: boolean;
  byType?: Record<number, number>;
  avgSeverity?: number;
  latestTimestamp: number;
}

export interface SubscriptionStatus {
  tier: number;
  startedAt: number;
  expiresAt: number;
  isActive: boolean;
  nftId?: string;
}

export interface UnlockReceipt {
  id: string;
  originalBuyer: string;
  intelId: string;
  unlockedAt: number;
  pricePaid: number;
}

export interface BountyRequest {
  bountyId: string;
  creator: string;
  targetRegion: GridCell;
  intelTypesWanted: number[];
  rewardAmount: number;
  deadline: number;
  status: number;
  submissionCount: number;
}

export interface BountyDetail extends BountyRequest {
  metaId: string;
  updatedAt: number;
  events: BountyEvent[];
  hunters: ClaimTicket[];
}

export interface BountyEvent {
  id: number;
  bountyId: string;
  eventType: 'proof_submitted' | 'proof_rejected' | 'proof_resubmitted'
           | 'dispute_raised' | 'dispute_resolved' | 'proof_auto_approved';
  hunter: string;
  actor: string | null;
  detail: ProofDetail | RejectDetail | DisputeDetail | ResolveDetail | null;
  timestamp: number;
  txDigest: string;
}

export interface ClaimTicket {
  hunter: string;
  stakeAmount: number;
}

// NOTE: proofDescription is optional because ProofSubmittedEvent/ProofResubmittedEvent
// do NOT include proof_description — only proof_url. The description is stored on-chain
// in the Bounty's dynamic field but not emitted in events. Timeline will show URL only.
export interface ProofDetail { proofUrl: string; proofDescription?: string }
export interface RejectDetail { reason: string }
export interface DisputeDetail { reason: string }
export interface ResolveDetail { approved: boolean }

export type BountyRole = 'creator' | 'hunter' | 'viewer';

export type PluginPermission =
  | "read:heatmap"
  | "read:intel"
  | "read:viewport"
  | "read:bounties"
  | "request:transaction"
  | "request:payment";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  url: string;
  icon: string;
  permissions: PluginPermission[];
  pricing: { model: string; price: number; revenueSplitBps: number };
  category: string;
}

export interface IntelListing {
  id: string;
  seller: string;
  intelId: string;
  intelType: number;
  regionId: number;
  listingType: number;
  price: number;
  maxBuyers: number;
  soldCount: number;
  expiry: number;
  createdAt: number;
  active: boolean;
}

export interface MarketReceipt {
  id: string;
  buyer: string;
  listingId: string;
  intelId: string;
  purchasedAt: number;
  pricePaid: number;
}

export interface SellerReputation {
  address: string;
  score: number;
  totalSales: number;
  repeatBuyerRate: number;
  guildName?: string;
  survivalDays?: number;
  onChainAge: number;
}

export interface RegionActivity {
  defenseIndex: number;
  infraIndex: number;
  trafficIndex: number;
  activePlayers: number;
  windowStart: number;
  windowEnd: number;
  updatedAt: number;
}

export interface RegionSummary {
  regionId: number;
  heatmap: { totalReports: number; reporterCount: number };
  activity: RegionActivity | null;
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

export type Tier = "free" | "premium";

export interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface SourceMeta {
  provider: "eve-eyes" | "utopia";
  fetchedAt: number;
  stale: boolean;
}

export interface KillEntry {
  id: string;
  killerName: string;
  killerId: string;
  victimName: string;
  victimId: string;
  lossType: string;
  solarSystemId: number;
  killedAt: number;
}

export interface WorldStatus {
  players: {
    registered: number;
    active: number;
    newLast24h: number;
    sources: SourceMeta[];
  };
  combat: {
    kills24h: number;
    activeSystems: number;
    recentKills: KillEntry[];
    sources: SourceMeta[];
  };
  infrastructure: {
    onlineAssemblies: number;
    totalAssemblies: number;
    infraIndex: number;
    sources: SourceMeta[];
  };
  defense: {
    defenseIndex: number;
    sources: SourceMeta[];
  };
  traffic: {
    trafficIndex: number;
    sources: SourceMeta[];
  };
  factions: {
    count: number;
    largest: { name: string; ticker: string; members: number };
    sources: SourceMeta[];
  };
  updatedAt: number;
}

// ── EVE EYES extended types (sync with services/src/types) ───

export interface EveEyesKillmail {
  killmailItemId: string;
  killTimestamp: string;
  lossType: string;
  solarSystemId: string;
  resolutionStatus: string;
  killer: { label: string; username: string; walletAddress: string; characterItemId: string };
  victim: { label: string; username: string; walletAddress: string; characterItemId: string };
}

export interface LeaderboardEntry {
  rank: number;
  tenant: string;
  ownerCharacterItemId: string;
  userId: string;
  walletAddress: string;
  buildingCount: number;
  lastSeenAt: string;
  username: string;
}

export interface EcosystemFeature {
  title: string;
  href: string;
  description: string;
  metric: string;
  supporting: string;
  status: "live" | "locked";
}

export interface SystemSearchResult {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
}

export interface SystemDetail {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
  location: { x: number; y: number; z: number };
  gateLinks: unknown[];
}

// Normalized kill event (merged from both sources)
export interface KillEvent {
  id: string;
  timestamp: number;
  killerName: string;
  victimName: string;
  lossType: string;
  solarSystemId: string | number;
  source: "eve-eyes" | "utopia";
}

// ═══════════════════════════════════════════════
// Intel Market v2
// ═══════════════════════════════════════════════

export interface PublicMeta {
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  intelType: number;
  severity: number;
  expiry: number;
}

export interface IntelListingV2 {
  id: string;
  seller: string;
  title: string;
  publicMetadata: PublicMeta;
  priceMist: number;
  status: number; // 0=ACTIVE, 1=SOLD, 2=EXPIRED, 3=CANCELLED
  buyer: string | null;
  purchasedAt: number | null;
  createdAt: number;
  isSealed: boolean;
}

export interface IntelRequestV2 {
  id: string;
  buyer: string;
  title: string;
  intelType: number;
  regionId: number;
  description: string;
  rewardMist: number;
  deadline: number;
  status: number; // 0=OPEN, 1=REVIEWING, 2=COMPLETED, 3=CANCELLED, 4=EXPIRED
  firstSubmissionAt: number | null;
  submissionCount: number;
  selectedSeller: string | null;
  createdAt: number;
}

export interface IntelSubmissionV2 {
  seller: string;
  submittedAt: number;
}

export interface SellerProfile {
  id: string;
  seller: string;
  totalTrades: number;
  totalScore: number;
  totalWeightedScore: number;
  totalVolumeMist: number;
  createdAt: number;
}

// Listing status
export const LISTING_STATUS = {
  ACTIVE: 0,
  SOLD: 1,
  EXPIRED: 2,
  CANCELLED: 3,
} as const;

// Request status
export const REQUEST_STATUS = {
  OPEN: 0,
  REVIEWING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
} as const;
