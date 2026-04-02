# Wallet Bridge (Portal ↔ Embedded dApps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow portal-embedded dApps (iframes) to use the parent Hub's connected wallet for address display and transaction signing via a postMessage bridge.

**Architecture:** Hub acts as wallet host — when a child iframe sends a `wallet:connect-request`, Hub replies with the current wallet state (address + network). When a child sends `wallet:sign-request` with serialized TX bytes, Hub signs via its connected wallet and returns the result. A confirmation dialog prevents unauthorized signing. Origin whitelist guards all messages.

**Tech Stack:** React, Zustand, @mysten/dapp-kit (`useCurrentAccount`, `useSignAndExecuteTransaction`), postMessage API, vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `src/lib/wallet-bridge/types.ts` | Protocol message types + origin whitelist |
| **Create:** `src/lib/wallet-bridge/host.ts` | `WalletBridgeHost` class — listens for child requests, broadcasts wallet state |
| **Create:** `src/hooks/use-wallet-bridge.ts` | React hook — instantiates host, syncs with dapp-kit wallet state |
| **Create:** `src/components/portal/WalletSignDialog.ts` | Confirmation dialog for sign requests from children |
| **Modify:** `src/components/portal/PortalPreview.tsx` | Attach bridge host to iframe |
| **Modify:** `src/app/portal/[id]/page.tsx` | Attach bridge host to fullscreen iframe |
| **Create:** `src/__tests__/lib/wallet-bridge.test.ts` | Unit tests for host + protocol |
| **Create:** `src/__tests__/hooks/use-wallet-bridge.test.ts` | Hook tests |
| **Create:** `src/__tests__/monkey/wallet-bridge-monkey.test.ts` | Monkey tests (malformed messages, origin spoofing, rapid fire) |
| **Create:** `docs/wallet-bridge-protocol.md` | Protocol spec for child projects to implement their consumer |

---

### Task 1: Protocol Types + Origin Whitelist

**Files:**
- Create: `src/lib/wallet-bridge/types.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/wallet-bridge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/wallet-bridge.test.ts`
Expected: FAIL — module `@/lib/wallet-bridge/types` not found

- [ ] **Step 3: Implement types**

Create `src/lib/wallet-bridge/types.ts`:

```ts
// ── Source identifiers ──
export const WALLET_BRIDGE_SOURCE_HOST = "feh-wallet-host" as const;
export const WALLET_BRIDGE_SOURCE_CHILD = "feh-wallet-child" as const;

// ── Host → Child messages ──
export interface WalletStateMessage {
  source: typeof WALLET_BRIDGE_SOURCE_HOST;
  type: "wallet:state";
  address: string;
  network: string;
}

export interface WalletDisconnectMessage {
  source: typeof WALLET_BRIDGE_SOURCE_HOST;
  type: "wallet:disconnect";
}

export interface WalletSignResponse {
  source: typeof WALLET_BRIDGE_SOURCE_HOST;
  type: "wallet:sign-response";
  id: string;
  digest?: string;
  error?: string;
}

export type HostMessage = WalletStateMessage | WalletDisconnectMessage | WalletSignResponse;

// ── Child → Host messages ──
export interface WalletConnectRequest {
  source: typeof WALLET_BRIDGE_SOURCE_CHILD;
  type: "wallet:connect-request";
}

export interface WalletSignRequest {
  source: typeof WALLET_BRIDGE_SOURCE_CHILD;
  type: "wallet:sign-request";
  id: string;
  txBytes: string; // base64-encoded TransactionBlock bytes
}

export type ChildMessage = WalletConnectRequest | WalletSignRequest;

// ── Origin whitelist ──
const ALLOWED_ORIGINS = new Set([
  "https://bounty-escrow-protocol.vercel.app",
  "https://wreckage-insurance-protocol.vercel.app",
  "https://astro-logistics-network.vercel.app",
  "https://industrial-auto-os.vercel.app",
]);

export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow localhost for dev (any port)
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" && url.protocol === "http:") return true;
  } catch {
    // invalid URL
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/wallet-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/wallet-bridge/types.ts src/__tests__/lib/wallet-bridge.test.ts
git commit -m "feat(wallet-bridge): add protocol types and origin whitelist"
```

---

### Task 2: WalletBridgeHost Class

**Files:**
- Create: `src/lib/wallet-bridge/host.ts`
- Modify: `src/__tests__/lib/wallet-bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/lib/wallet-bridge.test.ts`:

```ts
import { WalletBridgeHost } from "@/lib/wallet-bridge/host";
import { WALLET_BRIDGE_SOURCE_CHILD, WALLET_BRIDGE_SOURCE_HOST } from "@/lib/wallet-bridge/types";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/wallet-bridge.test.ts`
Expected: FAIL — module `@/lib/wallet-bridge/host` not found

- [ ] **Step 3: Implement WalletBridgeHost**

Create `src/lib/wallet-bridge/host.ts`:

```ts
import {
  type ChildMessage,
  type WalletSignRequest,
  type WalletSignResponse,
  WALLET_BRIDGE_SOURCE_CHILD,
  WALLET_BRIDGE_SOURCE_HOST,
  isAllowedOrigin,
} from "./types";

type ConnectRequestHandler = () => void;
type SignRequestHandler = (id: string, txBytes: string) => void;

export class WalletBridgeHost {
  private iframe: HTMLIFrameElement;
  private connectHandler: ConnectRequestHandler | null = null;
  private signHandler: SignRequestHandler | null = null;

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    window.addEventListener("message", this.handleMessage);
  }

  onConnectRequest(handler: ConnectRequestHandler) {
    this.connectHandler = handler;
  }

  onSignRequest(handler: SignRequestHandler) {
    this.signHandler = handler;
  }

  broadcastState(address: string, network: string) {
    this.iframe.contentWindow?.postMessage(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:state",
        address,
        network,
      },
      "*"
    );
  }

  broadcastDisconnect() {
    this.iframe.contentWindow?.postMessage(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:disconnect",
      },
      "*"
    );
  }

  sendSignResponse(
    id: string,
    result: { digest?: string; error?: string }
  ) {
    const msg: WalletSignResponse = {
      source: WALLET_BRIDGE_SOURCE_HOST,
      type: "wallet:sign-response",
      id,
      ...result,
    };
    this.iframe.contentWindow?.postMessage(msg, "*");
  }

  private handleMessage = (event: MessageEvent) => {
    if (!isAllowedOrigin(event.origin)) return;

    const data = event.data as ChildMessage;
    if (!data || data.source !== WALLET_BRIDGE_SOURCE_CHILD) return;

    switch (data.type) {
      case "wallet:connect-request":
        this.connectHandler?.();
        break;
      case "wallet:sign-request": {
        const req = data as WalletSignRequest;
        if (req.id && req.txBytes) {
          this.signHandler?.(req.id, req.txBytes);
        }
        break;
      }
    }
  };

  destroy() {
    window.removeEventListener("message", this.handleMessage);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/wallet-bridge.test.ts`
Expected: PASS (all tests from Task 1 + Task 2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/wallet-bridge/host.ts src/__tests__/lib/wallet-bridge.test.ts
git commit -m "feat(wallet-bridge): add WalletBridgeHost class"
```

---

### Task 3: useWalletBridge Hook

**Files:**
- Create: `src/hooks/use-wallet-bridge.ts`
- Create: `src/__tests__/hooks/use-wallet-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/hooks/use-wallet-bridge.test.ts`:

```ts
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
    const handler = vi.fn();

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/hooks/use-wallet-bridge.test.ts`
Expected: FAIL — module `@/hooks/use-wallet-bridge` not found

- [ ] **Step 3: Implement the hook**

Create `src/hooks/use-wallet-bridge.ts`:

```ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/bcs";
import { WalletBridgeHost } from "@/lib/wallet-bridge/host";
import { SUI_NETWORK } from "@/lib/constants";

interface PendingSign {
  id: string;
  txBytes: string;
}

export function useWalletBridge(iframe: HTMLIFrameElement | null) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const hostRef = useRef<WalletBridgeHost | null>(null);
  const [pendingSign, setPendingSign] = useState<PendingSign | null>(null);

  // Create/destroy host when iframe changes
  useEffect(() => {
    if (!iframe) return;

    const host = new WalletBridgeHost(iframe);
    hostRef.current = host;

    host.onConnectRequest(() => {
      if (account?.address) {
        host.broadcastState(account.address, SUI_NETWORK);
      } else {
        host.broadcastDisconnect();
      }
    });

    host.onSignRequest((id, txBytes) => {
      setPendingSign({ id, txBytes });
    });

    // Broadcast initial state
    if (account?.address) {
      host.broadcastState(account.address, SUI_NETWORK);
    }

    return () => {
      host.destroy();
      hostRef.current = null;
    };
  }, [iframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-broadcast when account changes
  useEffect(() => {
    if (!hostRef.current) return;
    if (account?.address) {
      hostRef.current.broadcastState(account.address, SUI_NETWORK);
    } else {
      hostRef.current.broadcastDisconnect();
    }
  }, [account?.address]);

  const approvePendingSign = useCallback(async () => {
    if (!pendingSign || !hostRef.current) return;
    const { id, txBytes } = pendingSign;
    try {
      const tx = Transaction.from(fromBase64(txBytes));
      const result = await signAndExecute({ transaction: tx as never });
      hostRef.current.sendSignResponse(id, {
        digest: result.digest,
      });
    } catch (err) {
      hostRef.current.sendSignResponse(id, {
        error: err instanceof Error ? err.message : "Signing failed",
      });
    }
    setPendingSign(null);
  }, [pendingSign, signAndExecute]);

  const rejectPendingSign = useCallback(() => {
    if (!pendingSign || !hostRef.current) return;
    hostRef.current.sendSignResponse(pendingSign.id, {
      error: "User rejected the transaction",
    });
    setPendingSign(null);
  }, [pendingSign]);

  return {
    host: hostRef.current,
    pendingSign,
    approvePendingSign,
    rejectPendingSign,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/hooks/use-wallet-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-wallet-bridge.ts src/__tests__/hooks/use-wallet-bridge.test.ts
git commit -m "feat(wallet-bridge): add useWalletBridge hook with sign approve/reject"
```

---

### Task 4: WalletSignDialog Component

**Files:**
- Create: `src/components/portal/WalletSignDialog.tsx`

- [ ] **Step 1: Write the failing test**

Append a new describe block in `src/__tests__/components/portal-components.test.tsx`:

```ts
import { WalletSignDialog } from "@/components/portal/WalletSignDialog";

describe("WalletSignDialog", () => {
  it("renders transaction details and action buttons", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <WalletSignDialog
        txBytes="AQID"
        siteName="Bounty Escrow Protocol"
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    expect(screen.getByText(/Bounty Escrow Protocol/)).toBeTruthy();
    expect(screen.getByText(/requests a transaction/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /reject/i })).toBeTruthy();
  });

  it("calls onApprove when Approve is clicked", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <WalletSignDialog
        txBytes="AQID"
        siteName="Test Site"
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("calls onReject when Reject is clicked", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <WalletSignDialog
        txBytes="AQID"
        siteName="Test Site"
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onReject).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/portal-components.test.tsx`
Expected: FAIL — module `@/components/portal/WalletSignDialog` not found

- [ ] **Step 3: Implement the dialog**

Create `src/components/portal/WalletSignDialog.tsx`:

```tsx
"use client";

interface WalletSignDialogProps {
  txBytes: string;
  siteName: string;
  onApprove: () => void;
  onReject: () => void;
}

export function WalletSignDialog({ txBytes, siteName, onApprove, onReject }: WalletSignDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="border border-eve-panel-border bg-eve-panel p-4 max-w-md w-full mx-4">
        <h3 className="text-sm text-eve-cold uppercase tracking-wide">Transaction Request</h3>
        <p className="mt-2 text-xs text-eve-text">
          <span className="text-eve-gold">{siteName}</span> requests a transaction signature.
        </p>
        <div className="mt-3 p-2 bg-[rgba(8,11,16,0.6)] border border-eve-panel-border overflow-x-auto">
          <p className="text-[0.66rem] text-eve-muted font-mono break-all">
            {txBytes.length > 120 ? `${txBytes.slice(0, 120)}...` : txBytes}
          </p>
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={onReject}
            className="text-xs border border-eve-panel-border text-eve-muted px-3 py-1.5 cursor-pointer hover:text-eve-text hover:border-eve-danger"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="text-xs border border-eve-gold/60 text-eve-gold px-3 py-1.5 cursor-pointer hover:bg-eve-gold/10"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/portal-components.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/WalletSignDialog.tsx src/__tests__/components/portal-components.test.tsx
git commit -m "feat(wallet-bridge): add WalletSignDialog confirmation component"
```

---

### Task 5: Integrate Bridge into PortalPreview

**Files:**
- Modify: `src/components/portal/PortalPreview.tsx`

- [ ] **Step 1: Modify PortalPreview to use wallet bridge**

Edit `src/components/portal/PortalPreview.tsx` — add bridge hook + sign dialog:

```tsx
"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletBridge } from "@/hooks/use-wallet-bridge";
import { WalletSignDialog } from "./WalletSignDialog";

interface PortalPreviewProps {
  url: string;
  name: string;
  linkId: string;
}

export function PortalPreview({ url, name, linkId }: PortalPreviewProps) {
  const router = useRouter();
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const iframeRef = useCallback((node: HTMLIFrameElement | null) => { setIframeEl(node); }, []);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [retryKey, setRetryKey] = useState(0);

  const { pendingSign, approvePendingSign, rejectPendingSign } = useWalletBridge(iframeEl);

  useEffect(() => {
    setStatus("loading");
    const timer = setTimeout(() => {
      setStatus((prev) => (prev === "loading" ? "failed" : prev));
    }, 5000);

    const handleLoad = () => {
      clearTimeout(timer);
      setStatus("loaded");
    };
    iframeEl?.addEventListener("load", handleLoad);

    return () => {
      clearTimeout(timer);
      iframeEl?.removeEventListener("load", handleLoad);
    };
  }, [url, retryKey, iframeEl]);

  const handleRetry = () => {
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col h-full min-h-[300px]">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-eve-panel-border">
        <p className="text-xs text-eve-cold truncate">{name}</p>
        <button
          onClick={() => router.push(`/portal/${linkId}`)}
          className="text-[0.66rem] text-eve-muted hover:text-eve-text border border-eve-panel-border px-2 py-0.5 cursor-pointer"
        >
          Fullscreen →
        </button>
      </div>

      <div className="flex-1 relative">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-eve-panel">
            <p className="text-xs text-eve-muted animate-pulse-dot">Loading...</p>
          </div>
        )}
        {status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-eve-panel gap-2">
            <p className="text-xs text-eve-muted">This site may not allow embedding</p>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="text-[0.66rem] border border-eve-panel-border text-eve-muted px-2 py-1 cursor-pointer hover:text-eve-text"
              >
                Retry
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.66rem] border border-eve-panel-border text-eve-muted px-2 py-1 hover:text-eve-text"
              >
                Open in Tab ↗
              </a>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={`${url}-${retryKey}`}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          allow="clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className={`w-full h-full border-0 ${status === "failed" ? "hidden" : ""}`}
          title={`Preview: ${name}`}
        />
      </div>

      {pendingSign && (
        <WalletSignDialog
          txBytes={pendingSign.txBytes}
          siteName={name}
          onApprove={approvePendingSign}
          onReject={rejectPendingSign}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run portal tests to verify nothing broke**

Run: `npx vitest run portal`
Expected: PASS (existing tests still pass; new dialog test passes)

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/PortalPreview.tsx
git commit -m "feat(wallet-bridge): integrate bridge into PortalPreview"
```

---

### Task 6: Integrate Bridge into Fullscreen Portal Page

**Files:**
- Modify: `src/app/portal/[id]/page.tsx`

- [ ] **Step 1: Modify fullscreen page to use wallet bridge**

Edit `src/app/portal/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePortalStore } from "@/stores/portal-store";
import { useUIStore } from "@/stores/ui-store";
import { PortalFullscreenBar } from "@/components/portal/PortalFullscreenBar";
import { useWalletBridge } from "@/hooks/use-wallet-bridge";
import { WalletSignDialog } from "@/components/portal/WalletSignDialog";

export default function PortalFullscreenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const getLinkById = usePortalStore((s) => s.getLinkById);
  const addToast = useUIStore((s) => s.addToast);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const link = getLinkById(id);
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const iframeRef = useCallback((node: HTMLIFrameElement | null) => { setIframeEl(node); }, []);

  const { pendingSign, approvePendingSign, rejectPendingSign } = useWalletBridge(iframeEl);

  useEffect(() => {
    if (!link) {
      addToast({ type: "warning", message: "Portal link not found" });
      router.replace("/portal");
    }
  }, [link, router, addToast]);

  if (!link) return null;

  return (
    <div className={`fixed top-0 right-0 bottom-0 z-30 flex flex-col bg-eve-panel transition-all duration-200 ${
      collapsed ? "left-14" : "left-[200px]"
    }`}>
      <PortalFullscreenBar name={link.name} url={link.url} />
      <iframe
        ref={iframeRef}
        src={link.url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        allow="clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        className="flex-1 w-full border-0"
        title={link.name}
      />
      {pendingSign && (
        <WalletSignDialog
          txBytes={pendingSign.txBytes}
          siteName={link.name}
          onApprove={approvePendingSign}
          onReject={rejectPendingSign}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all portal tests**

Run: `npx vitest run portal`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/\\[id\\]/page.tsx
git commit -m "feat(wallet-bridge): integrate bridge into fullscreen portal page"
```

---

### Task 7: Monkey Tests

**Files:**
- Create: `src/__tests__/monkey/wallet-bridge-monkey.test.ts`

- [ ] **Step 1: Write monkey tests**

Create `src/__tests__/monkey/wallet-bridge-monkey.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
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
```

- [ ] **Step 2: Run monkey tests**

Run: `npx vitest run src/__tests__/monkey/wallet-bridge-monkey.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/monkey/wallet-bridge-monkey.test.ts
git commit -m "test(wallet-bridge): add monkey tests for malformed messages, origin spoofing, rapid fire"
```

---

### Task 8: Protocol Documentation for Child Projects

**Files:**
- Create: `docs/wallet-bridge-protocol.md`

- [ ] **Step 1: Write protocol documentation**

Create `docs/wallet-bridge-protocol.md`:

```markdown
# Wallet Bridge Protocol

Frontier Explorer Hub provides a postMessage-based wallet bridge for portal-embedded dApps.
When your app is loaded inside the Hub's portal iframe, you can use the parent's connected wallet
instead of asking the user to connect again.

## Detection

```ts
const isInIframe = window.self !== window.top;
```

If `isInIframe` is true, activate bridge mode.

## Message Format

All messages use `window.postMessage`. Each message has a `source` and `type` field.

### Source Identifiers

| Direction | source value |
|-----------|-------------|
| Hub → Child | `"feh-wallet-host"` |
| Child → Hub | `"feh-wallet-child"` |

### Child → Hub Messages

#### `wallet:connect-request`

Request the current wallet state. Hub will respond with `wallet:state` or `wallet:disconnect`.

```ts
window.parent.postMessage({
  source: "feh-wallet-child",
  type: "wallet:connect-request",
}, "*");
```

#### `wallet:sign-request`

Request a transaction signature. Hub will show a confirmation dialog to the user.

```ts
window.parent.postMessage({
  source: "feh-wallet-child",
  type: "wallet:sign-request",
  id: crypto.randomUUID(),       // unique request ID
  txBytes: "<base64-encoded TX>", // Transaction.build() → toBase64()
}, "*");
```

### Hub → Child Messages

#### `wallet:state`

Sent in response to `connect-request`, and whenever the wallet state changes.

```ts
{
  source: "feh-wallet-host",
  type: "wallet:state",
  address: "0x...",
  network: "testnet" | "mainnet"
}
```

#### `wallet:disconnect`

Sent when the user disconnects their wallet.

```ts
{
  source: "feh-wallet-host",
  type: "wallet:disconnect"
}
```

#### `wallet:sign-response`

Sent in response to `sign-request`.

```ts
// Success — TX was executed by parent, digest is the on-chain transaction hash
{
  source: "feh-wallet-host",
  type: "wallet:sign-response",
  id: "<matching request ID>",
  digest: "..."
}

// Error (user rejected or signing failed)
{
  source: "feh-wallet-host",
  type: "wallet:sign-response",
  id: "<matching request ID>",
  error: "User rejected the transaction"
}
```

## Allowed Origins

The Hub only accepts messages from these origins:

- `https://bounty-escrow-protocol.vercel.app`
- `https://wreckage-insurance-protocol.vercel.app`
- `https://astro-logistics-network.vercel.app`
- `https://industrial-auto-os.vercel.app`
- `http://localhost:*` (dev only)

## Example: Minimal Child Implementation

```ts
// 1. Listen for wallet state
let walletAddress: string | null = null;
let walletNetwork: string | null = null;

window.addEventListener("message", (event) => {
  const { data } = event;
  if (data?.source !== "feh-wallet-host") return;

  switch (data.type) {
    case "wallet:state":
      walletAddress = data.address;
      walletNetwork = data.network;
      break;
    case "wallet:disconnect":
      walletAddress = null;
      walletNetwork = null;
      break;
    case "wallet:sign-response":
      // Handle sign result by matching data.id
      break;
  }
});

// 2. Request initial state
window.parent.postMessage({
  source: "feh-wallet-child",
  type: "wallet:connect-request",
}, "*");

// 3. Request a signature (parent executes the TX and returns digest)
function requestSign(txBytes: string): Promise<{ digest: string }> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { data } = event;
      if (data?.source !== "feh-wallet-host") return;
      if (data.type !== "wallet:sign-response" || data.id !== id) return;
      window.removeEventListener("message", handler);
      if (data.error) reject(new Error(data.error));
      else resolve({ digest: data.digest });
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({
      source: "feh-wallet-child",
      type: "wallet:sign-request",
      id,
      txBytes,
    }, "*");
  });
}
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/wallet-bridge-protocol.md
git commit -m "docs: add wallet bridge protocol spec for child projects"
```

---

### Task 9: Run Full Test Suite + Type Check

- [ ] **Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors (existing test-file errors are pre-existing)

- [ ] **Step 2: Run full frontend test suite**

Run: `npx vitest run --no-coverage`
Expected: All tests pass

- [ ] **Step 3: Fix any failures and commit**

If any failures, fix and commit with descriptive message.
