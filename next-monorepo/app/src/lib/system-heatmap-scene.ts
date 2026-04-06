import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import type { SystemNode, SystemLink } from "@/types";

export interface SceneNode extends SimulationNodeDatum {
  id: string;
  label: string;
  intensity: number;
  killCount: number;
  intelCount: number;
  gateTraffic: number;
  marketActivity: number;
  latestEventAt: number;
}

export interface SceneLink extends SimulationLinkDatum<SceneNode> {
  source: string;
  target: string;
}

export const SCENE_SIZE = { width: 1600, height: 1040 };

// Seed positions (hand-tuned, from frontier-trade-routes)
const SEED_POSITIONS: Record<string, { x: number; y: number }> = {
  "30001719": { x: 236, y: 840 },
  "30004452": { x: 372, y: 472 },
  "30004448": { x: 448, y: 420 },
  "30004453": { x: 548, y: 454 },
  "30004449": { x: 594, y: 372 },
  "30004451": { x: 650, y: 304 },
  "30004455": { x: 680, y: 452 },
  "30004454": { x: 756, y: 484 },
  "30004450": { x: 818, y: 388 },
  "30000007": { x: 1016, y: 286 },
  "30000006": { x: 1124, y: 248 },
  "30000005": { x: 1266, y: 214 },
  "30000004": { x: 1384, y: 178 },
};

function hashPosition(id: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const x = 100 + ((hash >>> 0) % (SCENE_SIZE.width - 200));
  const y = 100 + ((hash >>> 16) % (SCENE_SIZE.height - 200));
  return { x, y };
}

export function buildScene(systems: SystemNode[], links: SystemLink[]): { nodes: SceneNode[]; links: SceneLink[] } {
  const nodes: SceneNode[] = systems.map((s) => {
    const seed = SEED_POSITIONS[s.systemId];
    const pos = seed ?? hashPosition(s.systemId);
    return {
      id: s.systemId,
      label: s.systemName,
      intensity: s.intensity,
      killCount: s.killCount,
      intelCount: s.intelCount,
      gateTraffic: s.gateTraffic,
      marketActivity: s.marketActivity,
      latestEventAt: s.latestEventAt,
      x: pos.x,
      y: pos.y,
      ...(seed ? { fx: pos.x, fy: pos.y } : {}),
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const sceneLinks: SceneLink[] = links
    .filter((l) => nodeIds.has(l.from) && nodeIds.has(l.to))
    .map((l) => ({ source: l.from, target: l.to }));

  // Add nearest-neighbor links for isolated nodes
  const linked = new Set<string>();
  for (const l of sceneLinks) {
    linked.add(`${l.source}::${l.target}`);
    linked.add(`${l.target}::${l.source}`);
  }

  for (const node of nodes) {
    const neighbors = nodes
      .filter((n) => n.id !== node.id && !linked.has(`${node.id}::${n.id}`))
      .map((n) => ({ n, d: Math.hypot((node.x ?? 0) - (n.x ?? 0), (node.y ?? 0) - (n.y ?? 0)) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .filter(({ d }) => d < 340);

    for (const { n } of neighbors) {
      const key = [node.id, n.id].sort().join("::");
      if (!linked.has(key)) {
        linked.add(key);
        linked.add(key.split("::").reverse().join("::"));
        sceneLinks.push({ source: node.id, target: n.id });
      }
    }
  }

  // Run simulation
  const sim = forceSimulation(nodes)
    .force("link", forceLink(sceneLinks).id((d) => (d as SceneNode).id).distance(120).strength(0.3))
    .force("charge", forceManyBody().strength(-200))
    .force("center", forceCenter(SCENE_SIZE.width / 2, SCENE_SIZE.height / 2).strength(0.05))
    .force("collide", forceCollide(40))
    .stop();

  // Run 120 ticks then release pinned nodes
  for (let i = 0; i < 120; i++) sim.tick();
  for (const node of nodes) {
    delete node.fx;
    delete node.fy;
  }

  return { nodes, links: sceneLinks };
}

// ── Background stars ─────────────────────────────────────────────

export interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

export function buildBackgroundStars(nodes: SceneNode[]): BackgroundStar[] {
  let seed = 30001719;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const stars: BackgroundStar[] = [];
  for (let i = 0; i < 620; i++) {
    stars.push({
      x: Math.round(random() * SCENE_SIZE.width),
      y: Math.round(random() * SCENE_SIZE.height),
      size: 0.35 + random() * 1.7,
      alpha: 0.12 + random() * 0.42,
    });
  }

  for (const node of nodes) {
    for (let i = 0; i < 22; i++) {
      const angle = random() * Math.PI * 2;
      const spread = 12 + random() * 84;
      stars.push({
        x: Math.round((node.x ?? 0) + Math.cos(angle) * spread),
        y: Math.round((node.y ?? 0) + Math.sin(angle) * spread),
        size: 0.4 + random() * 1.8,
        alpha: 0.16 + random() * 0.36,
      });
    }
  }

  return stars.filter(
    (s) => s.x >= 0 && s.x <= SCENE_SIZE.width && s.y >= 0 && s.y <= SCENE_SIZE.height
  );
}
