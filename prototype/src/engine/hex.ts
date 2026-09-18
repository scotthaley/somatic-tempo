// Axial hex coordinates (pointy-top).
export interface Hex {
  q: number;
  r: number;
}

export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const ORIGIN: Hex = { q: 0, r: 0 };

export const hexKey = (h: Hex) => `${h.q},${h.r}`;
export const hexEq = (a: Hex, b: Hex) => a.q === b.q && a.r === b.r;
export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

export function hexDist(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const hexLen = (h: Hex) => hexDist(h, ORIGIN);

export const neighbors = (h: Hex): Hex[] => DIRS.map((d) => hexAdd(h, d));

export function hexesWithin(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

export interface ReachNode {
  hex: Hex;
  cost: number;
}

/**
 * Breadth-first reachability within a movement budget.
 * `canPass` gates traversal; `canEnter` gates which hexes may be ended on.
 * The start hex is always included at cost 0.
 */
export function reachable(
  from: Hex,
  budget: number,
  canPass: (h: Hex) => boolean,
  canEnter: (h: Hex) => boolean,
): Map<string, ReachNode> {
  const seen = new Map<string, ReachNode>([[hexKey(from), { hex: from, cost: 0 }]]);
  let frontier = [from];
  for (let cost = 1; cost <= budget && frontier.length; cost++) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of neighbors(h)) {
        const k = hexKey(n);
        if (seen.has(k) || !canPass(n)) continue;
        seen.set(k, { hex: n, cost });
        next.push(n);
      }
    }
    frontier = next;
  }
  const out = new Map<string, ReachNode>();
  for (const [k, node] of seen) {
    if (node.cost === 0 || canEnter(node.hex)) out.set(k, node);
  }
  return out;
}

/** The hex direction that best matches the straight line from `from` to `to`. */
export function nearestDir(from: Hex, to: Hex): Hex {
  const a = hexToPixel(from, 1);
  const b = hexToPixel(to, 1);
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  let best = DIRS[0];
  let bestDot = -Infinity;
  for (const d of DIRS) {
    const p = hexToPixel(d, 1);
    const dot = p.x * vx + p.y * vy;
    if (dot > bestDot + 1e-9) {
      bestDot = dot;
      best = d;
    }
  }
  return best;
}
