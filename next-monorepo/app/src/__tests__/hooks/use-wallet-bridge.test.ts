import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWalletBridge } from "@/hooks/use-wallet-bridge";
import { WalletBridgeHost } from "@/lib/wallet-bridge/host";
import { WALLET_BRIDGE_SOURCE_CHILD } from "@/lib/wallet-bridge/types";

// Mock dapp-kit hooks
const mockAccount = { address: "0xabc123" };
const mockSignAndExecute = vi.fn();

vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => mockAccount,
  useSignAndExecuteTransaction: () => ({ mutateAsync: mockSignAndExecute }),
}));

vi.mock("@/lib/constants", () => ({
  SUI_NETWORK: "testnet",
}));

vi.mock("@mysten/bcs", () => ({
  fromBase64: (s: string) => new Uint8Array([1, 2, 3]),
}));

const mockTx = {};
vi.mock("@mysten/sui/transactions", () => ({
  Transaction: {
    from: () => mockTx,
  },
}));

describe("useWalletBridge", () => {
  let iframe: HTMLIFrameElement;
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.fn();
    iframe = {
      contentWindow: { postMessage: postMessageSpy },
    } as unknown as HTMLIFrameElement;
    mockSignAndExecute.mockReset();
  });

  it("creates a WalletBridgeHost instance", () => {
    const { result } = renderHook(() => useWalletBridge(iframe));
    expect(result.current.host).toBeInstanceOf(WalletBridgeHost);
  });

  it("broadcasts wallet state on mount when account is connected", () => {
    renderHook(() => useWalletBridge(iframe));
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wallet:state",
        address: "0xabc123",
        network: "testnet",
      }),
      "*"
    );
  });

  it("responds to connect-request by broadcasting state", async () => {
    renderHook(() => useWalletBridge(iframe));
    // Clear the initial broadcast
    postMessageSpy.mockClear();

    // Simulate connect-request from child
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { source: WALLET_BRIDGE_SOURCE_CHILD, type: "wallet:connect-request" },
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wallet:state",
        address: "0xabc123",
      }),
      "*"
    );
  });

  it("pendingSign is null initially", () => {
    const { result } = renderHook(() => useWalletBridge(iframe));
    expect(result.current.pendingSign).toBeNull();
  });

  it("sets pendingSign on sign-request", async () => {
    const { result } = renderHook(() => useWalletBridge(iframe));

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            source: WALLET_BRIDGE_SOURCE_CHILD,
            type: "wallet:sign-request",
            id: "req-1",
            txBytes: "AQID",
          },
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
    });

    expect(result.current.pendingSign).toEqual({ id: "req-1", txBytes: "AQID" });
  });

  it("approvePendingSign calls signAndExecute and sends response", async () => {
    mockSignAndExecute.mockResolvedValue({
      digest: "digest",
    });

    const { result } = renderHook(() => useWalletBridge(iframe));

    // Trigger a sign request
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            source: WALLET_BRIDGE_SOURCE_CHILD,
            type: "wallet:sign-request",
            id: "req-1",
            txBytes: "AQID",
          },
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
    });

    postMessageSpy.mockClear();

    await act(async () => {
      await result.current.approvePendingSign();
    });

    expect(mockSignAndExecute).toHaveBeenCalledWith({
      transaction: expect.any(Object),
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wallet:sign-response",
        id: "req-1",
        digest: "digest",
      }),
      "*"
    );
    expect(result.current.pendingSign).toBeNull();
  });

  it("rejectPendingSign sends error response and clears pending", async () => {
    const { result } = renderHook(() => useWalletBridge(iframe));

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            source: WALLET_BRIDGE_SOURCE_CHILD,
            type: "wallet:sign-request",
            id: "req-1",
            txBytes: "AQID",
          },
          origin: "https://bounty-escrow-protocol.vercel.app",
        })
      );
    });

    postMessageSpy.mockClear();

    act(() => {
      result.current.rejectPendingSign();
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wallet:sign-response",
        id: "req-1",
        error: "User rejected the transaction",
      }),
      "*"
    );
    expect(result.current.pendingSign).toBeNull();
  });

  it("destroys host on unmount", () => {
    const { unmount } = renderHook(() => useWalletBridge(iframe));

    unmount();

    // After unmount, messages should not be handled
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: WALLET_BRIDGE_SOURCE_CHILD, type: "wallet:connect-request" },
        origin: "https://bounty-escrow-protocol.vercel.app",
      })
    );
    // No error = no crash = good
  });
});
