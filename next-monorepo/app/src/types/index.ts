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

export type Tier = "free" | "premium";

export interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}
