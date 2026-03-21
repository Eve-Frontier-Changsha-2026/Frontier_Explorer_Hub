import { PostMessageTransport } from "./transport";
import type {
  PluginUser,
  HeatmapQuery,
  HeatmapCell,
  TransactionRequest,
  PaymentRequest,
  PaymentReceipt,
  ViewportState
} from "./types";

export type { PluginUser, HeatmapQuery, HeatmapCell, TransactionRequest, PaymentRequest, PaymentReceipt, ViewportState };

export class ExplorerHubSDK {
  private transport: PostMessageTransport;

  constructor(targetOrigin?: string) {
    this.transport = new PostMessageTransport(targetOrigin);
  }

  async getUser(): Promise<PluginUser> {
    return this.transport.request<PluginUser>("getUser");
  }

  async getHeatmap(query: HeatmapQuery): Promise<HeatmapCell[]> {
    return this.transport.request<HeatmapCell[]>("getHeatmap", query);
  }

  async getIntel(intelId: string): Promise<unknown> {
    return this.transport.request("getIntel", { intelId });
  }

  async getRegionSummary(regionId: number): Promise<unknown> {
    return this.transport.request("getRegionSummary", { regionId });
  }

  async getBounties(filter?: { regionId?: number; status?: number }): Promise<unknown> {
    return this.transport.request("getBounties", filter ?? {});
  }

  async requestTransaction(tx: TransactionRequest): Promise<{ txDigest: string }> {
    return this.transport.request("requestTransaction", tx, 60_000);
  }

  async requestPayment(payment: PaymentRequest): Promise<PaymentReceipt> {
    return this.transport.request("requestPayment", payment, 60_000);
  }

  onViewportChange(callback: (viewport: ViewportState) => void): () => void {
    return this.transport.on("viewportChange", callback as (data: unknown) => void);
  }

  onIntelSelect(callback: (intelId: string) => void): () => void {
    return this.transport.on("intelSelect", callback as (data: unknown) => void);
  }

  destroy() {
    this.transport.destroy();
  }
}
