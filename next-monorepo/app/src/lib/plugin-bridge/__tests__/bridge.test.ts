import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginBridge } from "../bridge";

describe("PluginBridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("can be instantiated and destroyed", () => {
    const iframe = document.createElement("iframe") as HTMLIFrameElement;
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: vi.fn() }
    });

    const bridge = new PluginBridge(
      {
        pluginId: "p1",
        pluginUrl: "https://plugins.example.com/app",
        permissions: ["read:heatmap"],
        iframeRef: iframe
      },
      () => ({ address: "0x1", tier: "free", subscriptionExpiry: 0 }),
      async () => ({ approved: true, txDigest: "0xabc" }),
      async () => ({ approved: true, txDigest: "0xpay" })
    );

    bridge.broadcastIntelSelect("intel-1");
    bridge.destroy();
    expect(true).toBe(true);
  });
});
