import type { PluginPermission } from "@/types";
import type { BridgeRequest } from "./types";

const PERMISSION_MAP: Record<string, PluginPermission> = {
  getUser: "read:heatmap",
  getHeatmap: "read:heatmap",
  getIntel: "read:intel",
  getRegionSummary: "read:heatmap",
  getBounties: "read:bounties",
  requestTransaction: "request:transaction",
  requestPayment: "request:payment"
};

const ALWAYS_ALLOWED: Set<string> = new Set(["getUser"]);

export function checkPermission(
  request: BridgeRequest,
  grantedPermissions: PluginPermission[]
): { allowed: boolean; requiredPermission?: PluginPermission } {
  if (ALWAYS_ALLOWED.has(request.type)) {
    return { allowed: true };
  }

  const required = PERMISSION_MAP[request.type];
  if (!required) {
    return { allowed: false, requiredPermission: undefined };
  }

  return {
    allowed: grantedPermissions.includes(required),
    requiredPermission: required
  };
}
