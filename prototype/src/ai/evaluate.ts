import { isOpen } from "../engine/arena";
import { hexDist, hexLen, neighbors } from "../engine/hex";
import { DuelState, Fighter, Side, StatusName, other } from "../engine/state";

// Score units: 1 vitality = 10.
const VITALITY = 10;

const STATUS_WEIGHT: Record<StatusName, number> = {
  Warded: 5,
  Retaliate: 0, // valued by return damage below
  Enraged: 6,
  Burning: -9,
  Exposed: -14,
  Snared: -5,
  Winded: -6,
  Interrupt: -14,
};

function statusValue(f: Fighter): number {
  let v = 0;
  for (const st of f.stacks) {
    let w = st.status === "Retaliate" ? (st.value ?? 0) * 1.6 : STATUS_WEIGHT[st.status];
    if (st.aged && st.status !== "Burning") w *= 0.5; // about to decay
    v += w * st.amount;
  }
  return v;
}

/** How happy this fighter is with the current geometry. */
export function positionValue(s: DuelState, side: Side): number {
  const f = s.fighters[side];
  const d = hexDist(f.pos, s.fighters[other(side)].pos);
  if (f.cls === "Wizard") {
    let v = -Math.abs(d - 3.5) * 5;
    if (d <= 1) v -= 12;
    const open = neighbors(f.pos).filter((n) => isOpen(s.arena, n)).length;
    v -= (6 - open) * 2.5; // cornered
    if (hexLen(f.pos) === s.arena.radius) v -= 4;
    return v;
  }
  return -Math.max(0, d - 1) * 6;
}

export function evaluate(s: DuelState, me: Side): number {
  if (s.phase === "over") {
    if (s.winner === "draw") return -3000;
    return s.winner === me ? 100000 - s.round : -100000 + s.round;
  }
  const opp = other(me);
  const a = s.fighters[me];
  const b = s.fighters[opp];
  return (
    (a.vitality - b.vitality) * VITALITY +
    statusValue(a) -
    statusValue(b) +
    positionValue(s, me) -
    positionValue(s, opp)
  );
}
