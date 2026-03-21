import { describe, it, expect } from "vitest";
import { checkPermission } from "../permissions";
import type { BridgeRequest } from "../types";

const makeReq = (type: string): BridgeRequest => ({ id: "1", type: type as never, payload: {} });

describe("checkPermission", () => {
  it("always allows getUser", () => {
    expect(checkPermission(makeReq("getUser"), []).allowed).toBe(true);
  });

  it("blocks getHeatmap without read:heatmap", () => {
    const result = checkPermission(makeReq("getHeatmap"), []);
    expect(result.allowed).toBe(false);
    expect(result.requiredPermission).toBe("read:heatmap");
  });

  it("allows getHeatmap with read:heatmap", () => {
    expect(checkPermission(makeReq("getHeatmap"), ["read:heatmap"]).allowed).toBe(true);
  });

  it("blocks requestTransaction without request:transaction", () => {
    expect(checkPermission(makeReq("requestTransaction"), ["read:heatmap"]).allowed).toBe(false);
  });

  it("allows requestPayment with correct permission", () => {
    expect(checkPermission(makeReq("requestPayment"), ["request:payment"]).allowed).toBe(true);
  });
});
