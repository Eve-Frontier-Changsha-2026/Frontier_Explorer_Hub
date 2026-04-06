import { describe, it, expect } from "vitest";
import { buildScene, buildBackgroundStars, SCENE_SIZE } from "@/lib/system-heatmap-scene";
import type { SystemNode, SystemLink } from "@/types";

function makeNode(id: string, intensity = 50): SystemNode {
  return {
    systemId: id,
    systemName: `SYS-${id}`,
    killCount: 1,
    intelCount: 1,
    gateTraffic: 0,
    marketActivity: 0,
    intensity,
    latestEventAt: Date.now(),
  };
}

describe("buildScene", () => {
  it("positions seed systems at predefined coordinates", () => {
    const nodes = [makeNode("30001719", 50)];
    const result = buildScene(nodes, []);
    const node = result.nodes.find((n) => n.id === "30001719");
    expect(node).toBeDefined();
    expect(node!.x).toBeGreaterThan(0);
    expect(node!.y).toBeGreaterThan(0);
  });

  it("uses hash position for unknown system", () => {
    const nodes = [makeNode("99999999", 30)];
    const result = buildScene(nodes, []);
    expect(result.nodes[0].x).toBeGreaterThanOrEqual(100);
    expect(result.nodes[0].x).toBeLessThanOrEqual(SCENE_SIZE.width - 100);
  });

  it("generates nearest-neighbor links for isolated nodes", () => {
    // Use two systems with close seed positions (30004452 and 30004448 are ~100px apart)
    const nodes = [makeNode("30004452"), makeNode("30004448")];
    const result = buildScene(nodes, []);
    expect(result.links.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty input", () => {
    const result = buildScene([], []);
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("handles single node", () => {
    const result = buildScene([makeNode("30001719")], []);
    expect(result.nodes).toHaveLength(1);
    expect(result.links).toHaveLength(0);
  });
});

describe("buildBackgroundStars", () => {
  it("generates ~620+ stars", () => {
    const nodes = [{ id: "test", x: 400, y: 400 } as any];
    const stars = buildBackgroundStars(nodes);
    expect(stars.length).toBeGreaterThan(600);
  });

  it("all stars within scene bounds", () => {
    const stars = buildBackgroundStars([]);
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(SCENE_SIZE.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(SCENE_SIZE.height);
    }
  });

  it("is deterministic (same output for same input)", () => {
    const a = buildBackgroundStars([]);
    const b = buildBackgroundStars([]);
    expect(a).toEqual(b);
  });
});
