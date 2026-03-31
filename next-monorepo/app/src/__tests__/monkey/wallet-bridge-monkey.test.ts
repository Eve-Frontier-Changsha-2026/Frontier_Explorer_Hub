import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WalletBridgeHost } from "@/lib/wallet-bridge/host";
import { WALLET_BRIDGE_SOURCE_CHILD } from "@/lib/wallet-bridge/types";

describe("wallet-bridge-monkey", () => {
  let host: WalletBridgeHost;
  let iframe: HTMLIFrameElement;
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.fn();
    iframe = {
      contentWindow: { postMessage: postMessageSpy },
    } as unknown as HTMLIFrameElement;
    host = new WalletBridgeHost(iframe);
  });

  afterEach(() => {
    host.destroy();
  });

  describe("malformed messages", () => {
    it("ignores null data", () => {
      const handler = vi.fn();
      host.onConnectRequest(handler);
      window.dispatchEvent(
        new MessageEvent("message", {
          data: null,
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores string data", () => {
      const handler = vi.fn();
      host.onConnectRequest(handler);
      window.dispatchEvent(
        new MessageEvent("message", {
          data: "just a string",
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores object with missing type", () => {
      const handler = vi.fn();
      host.onConnectRequest(handler);
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { source: WALLET_BRIDGE_SOURCE_CHILD },
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores sign-request with missing id", () => {
      const handler = vi.fn();
      host.onSignRequest(handler);
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            source: WALLET_BRIDGE_SOURCE_CHILD,
            type: "wallet:sign-request",
            txBytes: "AQID",
          },
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores sign-request with missing txBytes", () => {
      const handler = vi.fn();
      host.onSignRequest(handler);
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            source: WALLET_BRIDGE_SOURCE_CHILD,
            type: "wallet:sign-request",
            id: "req-1",
          },
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("origin spoofing", () => {
    it("rejects subdomain spoofing", () => {
      const handler = vi.fn();
      host.onConnectRequest(handler);
      const spoofOrigins = [
        "https://bounty-escrow-protocol.vercel.app.evil.com",
        "https://evil.bounty-escrow-protocol.vercel.app",
        "https://bounty-escrow-protocolxvercel.app",
        "http://bounty-escrow-protocol.vercel.app", // http instead of https
      ];
      for (const origin of spoofOrigins) {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { source: WALLET_BRIDGE_SOURCE_CHILD, type: "wallet:connect-request" },
            origin,
          })
        );
      }
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("rapid fire", () => {
    it("handles 100 rapid connect requests without error", () => {
      const handler = vi.fn();
      host.onConnectRequest(handler);
      for (let i = 0; i < 100; i++) {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { source: WALLET_BRIDGE_SOURCE_CHILD, type: "wallet:connect-request" },
            origin: "https://bounty-escrow-protocol.vercel.app",
          })
        );
      }
      expect(handler).toHaveBeenCalledTimes(100);
    });

    it("handles 100 rapid sign requests", () => {
      const handler = vi.fn();
      host.onSignRequest(handler);
      for (let i = 0; i < 100; i++) {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              source: WALLET_BRIDGE_SOURCE_CHILD,
              type: "wallet:sign-request",
              id: `req-${i}`,
              txBytes: "AQID",
            },
            origin: "https://astro-logistics-network.vercel.app",
          })
        );
      }
      expect(handler).toHaveBeenCalledTimes(100);
    });
  });

  describe("iframe edge cases", () => {
    it("broadcastState does not throw when iframe contentWindow is null", () => {
      const brokenIframe = { contentWindow: null } as unknown as HTMLIFrameElement;
      const brokenHost = new WalletBridgeHost(brokenIframe);
      expect(() => brokenHost.broadcastState("0x1", "testnet")).not.toThrow();
      brokenHost.destroy();
    });

    it("sendSignResponse does not throw when iframe contentWindow is null", () => {
      const brokenIframe = { contentWindow: null } as unknown as HTMLIFrameElement;
      const brokenHost = new WalletBridgeHost(brokenIframe);
      expect(() => brokenHost.sendSignResponse("req-1", { error: "test" })).not.toThrow();
      brokenHost.destroy();
    });
  });
});
