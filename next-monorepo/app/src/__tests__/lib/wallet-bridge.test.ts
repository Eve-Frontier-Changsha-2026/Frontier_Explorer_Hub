import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  type WalletStateMessage,
  type WalletDisconnectMessage,
  type WalletConnectRequest,
  type WalletSignRequest,
  type WalletSignResponse,
  isAllowedOrigin,
  WALLET_BRIDGE_SOURCE_HOST,
  WALLET_BRIDGE_SOURCE_CHILD,
} from "@/lib/wallet-bridge/types";
import { WalletBridgeHost } from "@/lib/wallet-bridge/host";

describe("wallet-bridge types", () => {
  it("WALLET_BRIDGE_SOURCE_HOST is 'feh-wallet-host'", () => {
    expect(WALLET_BRIDGE_SOURCE_HOST).toBe("feh-wallet-host");
  });

  it("WALLET_BRIDGE_SOURCE_CHILD is 'feh-wallet-child'", () => {
    expect(WALLET_BRIDGE_SOURCE_CHILD).toBe("feh-wallet-child");
  });

  it("isAllowedOrigin accepts default portal origins", () => {
    expect(isAllowedOrigin("https://bounty-escrow-protocol.vercel.app")).toBe(true);
    expect(isAllowedOrigin("https://wreckage-insurance-protocol.vercel.app")).toBe(true);
    expect(isAllowedOrigin("https://astro-logistics-network.vercel.app")).toBe(true);
    expect(isAllowedOrigin("https://industrial-auto-os.vercel.app")).toBe(true);
  });

  it("isAllowedOrigin accepts localhost for dev", () => {
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
  });

  it("isAllowedOrigin rejects unknown origins", () => {
    expect(isAllowedOrigin("https://evil.com")).toBe(false);
    expect(isAllowedOrigin("https://fake-bounty-escrow.vercel.app")).toBe(false);
  });

  it("type guards compile correctly", () => {
    const state: WalletStateMessage = {
      source: "feh-wallet-host",
      type: "wallet:state",
      address: "0x123",
      network: "testnet",
    };
    expect(state.type).toBe("wallet:state");

    const disconnect: WalletDisconnectMessage = {
      source: "feh-wallet-host",
      type: "wallet:disconnect",
    };
    expect(disconnect.type).toBe("wallet:disconnect");

    const connectReq: WalletConnectRequest = {
      source: "feh-wallet-child",
      type: "wallet:connect-request",
    };
    expect(connectReq.type).toBe("wallet:connect-request");

    const signReq: WalletSignRequest = {
      source: "feh-wallet-child",
      type: "wallet:sign-request",
      id: "req-1",
      txBytes: "base64encodedtx",
    };
    expect(signReq.id).toBe("req-1");

    const signRes: WalletSignResponse = {
      source: "feh-wallet-host",
      type: "wallet:sign-response",
      id: "req-1",
      digest: "digest123",
    };
    expect(signRes.digest).toBe("digest123");

    const signErr: WalletSignResponse = {
      source: "feh-wallet-host",
      type: "wallet:sign-response",
      id: "req-1",
      error: "user rejected",
    };
    expect(signErr.error).toBe("user rejected");
  });
});

describe("WalletBridgeHost", () => {
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

  it("broadcastState sends wallet:state to iframe", () => {
    host.broadcastState("0xabc", "testnet");
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:state",
        address: "0xabc",
        network: "testnet",
      },
      "*"
    );
  });

  it("broadcastDisconnect sends wallet:disconnect to iframe", () => {
    host.broadcastDisconnect();
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:disconnect",
      },
      "*"
    );
  });

  it("handleMessage ignores messages from disallowed origins", () => {
    const handler = vi.fn();
    host.onConnectRequest(handler);
    const event = new MessageEvent("message", {
      data: { source: WALLET_BRIDGE_SOURCE_CHILD, type: "wallet:connect-request" },
      origin: "https://evil.com",
    });
    window.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it("handleMessage ignores messages with wrong source", () => {
    const handler = vi.fn();
    host.onConnectRequest(handler);
    const event = new MessageEvent("message", {
      data: { source: "something-else", type: "wallet:connect-request" },
      origin: "https://bounty-escrow-protocol.vercel.app",
    });
    window.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it("handleMessage fires onConnectRequest for valid connect-request", () => {
    const handler = vi.fn();
    host.onConnectRequest(handler);
    const event = new MessageEvent("message", {
      data: { source: WALLET_BRIDGE_SOURCE_CHILD, type: "wallet:connect-request" },
      origin: "https://bounty-escrow-protocol.vercel.app",
    });
    window.dispatchEvent(event);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("handleMessage fires onSignRequest for valid sign-request", () => {
    const handler = vi.fn();
    host.onSignRequest(handler);
    const event = new MessageEvent("message", {
      data: {
        source: WALLET_BRIDGE_SOURCE_CHILD,
        type: "wallet:sign-request",
        id: "req-42",
        txBytes: "AQID",
      },
      origin: "https://astro-logistics-network.vercel.app",
    });
    window.dispatchEvent(event);
    expect(handler).toHaveBeenCalledWith("req-42", "AQID");
  });

  it("sendSignResponse sends success response", () => {
    host.sendSignResponse("req-42", { digest: "digest" });
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:sign-response",
        id: "req-42",
        digest: "digest",
      },
      "*"
    );
  });

  it("sendSignResponse sends error response", () => {
    host.sendSignResponse("req-42", { error: "user rejected" });
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:sign-response",
        id: "req-42",
        error: "user rejected",
      },
      "*"
    );
  });

  it("destroy removes message listener", () => {
    const handler = vi.fn();
    host.onConnectRequest(handler);
    host.destroy();
    const event = new MessageEvent("message", {
      data: { source: WALLET_BRIDGE_SOURCE_CHILD, type: "wallet:connect-request" },
      origin: "https://bounty-escrow-protocol.vercel.app",
    });
    window.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
  });
});
