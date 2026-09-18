import { CARDS, isTargeted, reachOf } from "../data/cards";
import { hexDist, hexEq, Hex } from "../engine/hex";
import { reachableNow, step } from "../engine/rules";
import { Action, DuelState, Side, cloneState, other } from "../engine/state";
import { evaluate, positionValue } from "./evaluate";

export interface Plan {
  actions: Action[];
  score: number;
}

/** Cards whose outcome depends on where you stand when you play them. */
const positional = (name: string) => isTargeted(CARDS[name]) || name === "Grapple";

function candidates(s: DuelState, side: Side, name: string, limit: number): Hex[] {
  const nodes = [...reachableNow(s).values()];
  if (!Number.isFinite(limit) || nodes.length <= limit) return nodes.map((n) => n.hex);
  const card = CARDS[name];
  const f = s.fighters[side];
  const foe = s.fighters[other(side)].pos;
  const home = f.pos;
  const scored = nodes.map((n) => {
    const d = hexDist(n.hex, foe);
    let v = d <= reachOf(card) ? 100 : 0;
    if (card.range !== null && d === 1) v -= 30;
    if ((name === "Arcane Bolt" || name === "Arc Lightning") && d >= 4) v += 30;
    if (name === "Grapple" && d === 1) v += 100;
    f.pos = n.hex;
    v += positionValue(s, side) - n.cost * 0.5;
    f.pos = home;
    return { hex: n.hex, v };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, limit).map((x) => x.hex);
}

/**
 * Best way to resolve the committed pair: card order, and where to stand before,
 * between and after the cards. `maxCandidates` bounds the search per card.
 */
export function planResolution(
  state: DuelState,
  side: Side,
  opts: { maxCandidates?: number } = {},
): Plan {
  const limit = opts.maxCandidates ?? Infinity;
  const r = state.resolving!;
  const names = state.committed[side]!;
  const unplayed = ([0, 1] as const).filter((i) => !r.played[i]);
  const orders: (0 | 1)[][] =
    unplayed.length === 2 ? (names[0] === names[1] ? [[0, 1]] : [[0, 1], [1, 0]]) : [unplayed];

  let best: Plan = { actions: [{ type: "end", side }], score: -Infinity };

  const finish = (t: DuelState, actions: Action[]) => {
    if (t.phase === "over") {
      const score = evaluate(t, side);
      if (score > best.score) best = { actions, score };
      return;
    }
    const f = t.fighters[side];
    const home = f.pos;
    let bestHex = home;
    let bestScore = -Infinity;
    for (const n of reachableNow(t).values()) {
      f.pos = n.hex;
      const sc = evaluate(t, side) - n.cost * 0.1;
      if (sc > bestScore) {
        bestScore = sc;
        bestHex = n.hex;
      }
    }
    f.pos = home;
    if (bestScore > best.score) {
      const tail: Action[] = hexEq(bestHex, home) ? [] : [{ type: "move", side, to: bestHex }];
      best = { actions: [...actions, ...tail, { type: "end", side }], score: bestScore };
    }
  };

  const search = (t: DuelState, remaining: (0 | 1)[], actions: Action[]) => {
    if (t.phase === "over" || remaining.length === 0) return finish(t, actions);
    const [index, ...rest] = remaining;
    const name = t.committed[side]![index];
    const spots = positional(name) ? candidates(t, side, name, limit) : [t.fighters[side].pos];
    for (const spot of spots) {
      const u = cloneState(t);
      const acts = [...actions];
      if (!hexEq(spot, u.fighters[side].pos)) {
        const mv: Action = { type: "move", side, to: spot };
        step(u, mv);
        acts.push(mv);
      }
      const pl: Action = { type: "play", side, index };
      step(u, pl);
      acts.push(pl);
      search(u, rest, acts);
    }
  };

  for (const order of orders) search(cloneState(state), order, []);
  return best;
}
