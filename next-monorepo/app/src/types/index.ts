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
  id: string;
  requester: string;
  targetRegion: GridCell;
  intelTypesWanted: number[];
  rewardAmount: number;
  deadline: number;
  status: number;
  submissionCount: number;
}

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

export type Tier = "free" | "premium";

export interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}
