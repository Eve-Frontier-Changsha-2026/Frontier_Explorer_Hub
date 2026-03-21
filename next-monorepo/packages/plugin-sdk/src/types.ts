export interface PluginUser {
  address: string;
  tier: "free" | "premium";
  subscriptionExpiry: number;
}

export interface HeatmapQuery {
  zoomLevel: number;
  regionId?: number;
}

export interface HeatmapCell {
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  zoomLevel: number;
  totalReports: number;
  byType?: Record<number, number>;
  avgSeverity?: number;
}

export interface TransactionRequest {
  type: "unlock_intel" | "submit_intel" | "create_bounty" | "use_plugin";
  [key: string]: unknown;
}

export interface PaymentRequest {
  amount: number;
  description: string;
}

export interface PaymentReceipt {
  txDigest: string;
  amount: number;
  timestamp: number;
}

export interface ViewportState {
  longitude: number;
  latitude: number;
  zoom: number;
}

export type BridgeRequestType =
  | "getUser"
  | "getHeatmap"
  | "getIntel"
  | "getRegionSummary"
  | "getBounties"
  | "requestTransaction"
  | "requestPayment";

export type BridgeEventType = "viewportChange" | "intelSelect";

export interface BridgeRequest {
  id: string;
  type: BridgeRequestType;
  payload: unknown;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BridgeEvent {
  type: BridgeEventType;
  data: unknown;
}

export interface BridgeMessage {
  source: "explorer-hub-sdk" | "explorer-hub-host";
  message: BridgeRequest | BridgeResponse | BridgeEvent;
}
