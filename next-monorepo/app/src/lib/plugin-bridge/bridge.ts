import type {
  PluginBridgeConfig,
  BridgeMessage,
  BridgeRequest,
  BridgeResponse,
  TransactionApprovalCallback,
  PaymentApprovalCallback
} from "./types";
import { checkPermission } from "./permissions";
import * as apiClient from "@/lib/api-client";

export type GetUserDataCallback = () => { address: string; tier: string; subscriptionExpiry: number };

export class PluginBridge {
  private config: PluginBridgeConfig;
  private getUserData: GetUserDataCallback;
  private onTransactionApproval: TransactionApprovalCallback;
  private onPaymentApproval: PaymentApprovalCallback;

  constructor(
    config: PluginBridgeConfig,
    getUserData: GetUserDataCallback,
    onTransactionApproval: TransactionApprovalCallback,
    onPaymentApproval: PaymentApprovalCallback
  ) {
    this.config = config;
    this.getUserData = getUserData;
    this.onTransactionApproval = onTransactionApproval;
    this.onPaymentApproval = onPaymentApproval;
    window.addEventListener("message", this.handleMessage);
  }

  private handleMessage = async (event: MessageEvent) => {
    if (new URL(this.config.pluginUrl).origin !== event.origin) return;

    const msg = event.data as BridgeMessage;
    if (msg?.source !== "explorer-hub-sdk") return;

    const request = msg.message as BridgeRequest;
    if (!request.id || !request.type) return;

    const { allowed, requiredPermission } = checkPermission(request, this.config.permissions);
    if (!allowed) {
      this.sendResponse(request.id, false, undefined, `Permission denied: requires '${requiredPermission}'`);
      return;
    }

    try {
      const data = await this.handleRequest(request);
      this.sendResponse(request.id, true, data);
    } catch (err) {
      this.sendResponse(request.id, false, undefined, err instanceof Error ? err.message : "Unknown error");
    }
  };

  private async handleRequest(request: BridgeRequest): Promise<unknown> {
    const payload = request.payload as Record<string, unknown>;

    switch (request.type) {
      case "getUser":
        return this.getUserData();
      case "getHeatmap":
        return apiClient.getHeatmap(payload.zoomLevel as number, payload.regionId as number | undefined);
      case "getIntel":
        return apiClient.getIntel(payload.intelId as string);
      case "getRegionSummary":
        return apiClient.getRegionSummary(payload.regionId as number);
      case "getBounties":
        return apiClient.getActiveBounties();
      case "requestTransaction":
        return this.onTransactionApproval(this.config.pluginId, payload);
      case "requestPayment":
        return this.onPaymentApproval(this.config.pluginId, payload.amount as number, payload.description as string);
      default:
        throw new Error(`Unknown request type: ${(request as { type: string }).type}`);
    }
  }

  private sendResponse(id: string, success: boolean, data?: unknown, error?: string) {
    const msg: BridgeMessage = {
      source: "explorer-hub-host",
      message: { id, success, data, error } as BridgeResponse
    };
    this.config.iframeRef.contentWindow?.postMessage(msg, "*");
  }

  broadcastViewport(viewport: unknown) {
    const msg: BridgeMessage = {
      source: "explorer-hub-host",
      message: { type: "viewportChange", data: viewport }
    };
    this.config.iframeRef.contentWindow?.postMessage(msg, "*");
  }

  broadcastIntelSelect(intelId: string) {
    const msg: BridgeMessage = {
      source: "explorer-hub-host",
      message: { type: "intelSelect", data: intelId }
    };
    this.config.iframeRef.contentWindow?.postMessage(msg, "*");
  }

  destroy() {
    window.removeEventListener("message", this.handleMessage);
  }
}
