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

/** Reposition with whatever movement is left, then end the mini-turn. */
function finishPlan(state: DuelState, side: Side, last: Action): Plan {
  const t = cloneState(state);
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
  const tail: Action[] = hexEq(bestHex, home) ? [] : [{ type: "move", side, to: bestHex }];
  return { actions: [...tail, last], score: bestScore };
}

/**
 * Best way to spend one mini-turn: where to stand, and which of the committed cards
 * to play. Sides alternate, so the planner runs again each time the baton comes back
 * and always sees the opponent's interleaved actions.
 *
 * `maxCandidates` bounds the positions considered for the card.
 */
export function planResolution(
  state: DuelState,
  side: Side,
  opts: { maxCandidates?: number } = {},
): Plan {
  const limit = opts.maxCandidates ?? Infinity;
  const r = state.resolving!;
  const unplayed = ([0, 1] as const).filter((i) => !r.played[side][i]);

  // Nothing left to play: reposition and retire for the round.
  if (unplayed.length === 0) return finishPlan(state, side, { type: "end", side });

  let best: Plan = { actions: [], score: -Infinity };
  for (const index of unplayed) {
    const name = state.committed[side]![index];
    const spots = positional(name) ? candidates(state, side, name, limit) : [state.fighters[side].pos];
    for (const spot of spots) {
      const t = cloneState(state);
      const acts: Action[] = [];
      if (!hexEq(spot, t.fighters[side].pos)) {
        const mv: Action = { type: "move", side, to: spot };
        step(t, mv);
        acts.push(mv);
      }
      const pl: Action = { type: "play", side, index };
      step(t, pl);
      acts.push(pl);
      if (t.phase === "over") {
        const score = evaluate(t, side);
        if (score > best.score) best = { actions: acts, score };
        continue;
      }
      // Kite with whatever movement is left, then hand the baton over.
      const tail = finishPlan(t, side, { type: "pass", side });
      if (tail.score > best.score) best = { actions: [...acts, ...tail.actions], score: tail.score };
    }
  }

  // Every card was out of reach and scored below -Infinity is impossible, but guard anyway:
  // passing without playing is legal and keeps the cards for the next mini-turn.
  if (best.actions.length === 0) return finishPlan(state, side, { type: "pass", side });
  return best;
}
