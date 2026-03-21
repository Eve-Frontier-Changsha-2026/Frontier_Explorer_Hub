import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExplorerHubSDK } from "../index";

const listeners: Record<string, Function[]> = {};
vi.stubGlobal("window", {
  addEventListener: (type: string, fn: Function) => {
    listeners[type] = listeners[type] ?? [];
    listeners[type].push(fn);
  },
  removeEventListener: vi.fn(),
  parent: { postMessage: vi.fn() }
});

function simulateResponse(data: unknown) {
  const sentMsg = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
  const reqId = sentMsg?.message?.id;
  listeners.message?.forEach((fn) =>
    fn({ data: { source: "explorer-hub-host", message: { id: reqId, success: true, data } } })
  );
}

describe("ExplorerHubSDK", () => {
  let sdk: ExplorerHubSDK;

  beforeEach(() => {
    (window.parent.postMessage as ReturnType<typeof vi.fn>).mockClear();
    listeners.message = [];
    sdk = new ExplorerHubSDK();
  });

  it("getUser returns user data", async () => {
    const promise = sdk.getUser();
    simulateResponse({ address: "0x1", tier: "premium", subscriptionExpiry: 999 });
    const user = await promise;
    expect(user.address).toBe("0x1");
    expect(user.tier).toBe("premium");
  });

  it("getHeatmap sends correct query", async () => {
    const promise = sdk.getHeatmap({ zoomLevel: 2, regionId: 42 });
    simulateResponse([{ regionId: 42, totalReports: 10 }]);
    const cells = await promise;
    expect(cells).toHaveLength(1);
  });
});
