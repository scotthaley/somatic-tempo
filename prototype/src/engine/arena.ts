import { Hex, hexDist, hexKey, hexLen, hexesWithin, neighbors } from "./hex";

export const ARENA_RADIUS = 4; // 9 hexes wide

export interface Arena {
  radius: number;
  obstacles: Record<string, true>;
  starts: [Hex, Hex];
}

export const inArena = (a: Arena, h: Hex) => hexLen(h) <= a.radius;
export const isObstacle = (a: Arena, h: Hex) => a.obstacles[hexKey(h)] === true;
export const isOpen = (a: Arena, h: Hex) => inArena(a, h) && !isObstacle(a, h);

// Starts are 5 apart and equidistant from center. The reflection (q,r) -> (-q-r, r)
// swaps them, so mirroring obstacles through it keeps the layout fair for both sides.
const STARTS: [Hex, Hex] = [
  { q: -3, r: 1 },
  { q: 2, r: 1 },
];
const mirror = (h: Hex): Hex => ({ q: -h.q - h.r, r: h.r });

function connected(arena: Arena): boolean {
  const open = hexesWithin(arena.radius).filter((h) => !isObstacle(arena, h));
  const seen = new Set([hexKey(open[0])]);
  const stack = [open[0]];
  while (stack.length) {
    const h = stack.pop()!;
    for (const n of neighbors(h)) {
      const k = hexKey(n);
      if (!seen.has(k) && isOpen(arena, n)) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return seen.size === open.length;
}

export function makeArena(rand: () => number): Arena {
  const candidates = hexesWithin(ARENA_RADIUS).filter(
    (h) => hexDist(h, STARTS[0]) > 1 && hexDist(h, STARTS[1]) > 1,
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    const obstacles: Record<string, true> = {};
    const picks = 3 + Math.floor(rand() * 2); // 3–4 picks → ~5–8 obstacles
    for (let i = 0; i < picks; i++) {
      const h = candidates[Math.floor(rand() * candidates.length)];
      obstacles[hexKey(h)] = true;
      obstacles[hexKey(mirror(h))] = true;
    }
    const arena: Arena = { radius: ARENA_RADIUS, obstacles, starts: STARTS };
    if (connected(arena)) return arena;
  }
  return { radius: ARENA_RADIUS, obstacles: {}, starts: STARTS };
}
