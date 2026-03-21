import type { PluginPermission } from "@/types";
import type { BridgeMessage, BridgeRequest, BridgeResponse, BridgeEvent } from "@explorer-hub/plugin-sdk/src/types";

export type { BridgeMessage, BridgeRequest, BridgeResponse, BridgeEvent };

export interface PluginBridgeConfig {
  pluginId: string;
  pluginUrl: string;
  permissions: PluginPermission[];
  iframeRef: HTMLIFrameElement;
}

export type TransactionApprovalCallback = (
  pluginId: string,
  request: unknown
) => Promise<{ approved: boolean; txDigest?: string }>;

export type PaymentApprovalCallback = (
  pluginId: string,
  amount: number,
  description: string
) => Promise<{ approved: boolean; txDigest?: string }>;
