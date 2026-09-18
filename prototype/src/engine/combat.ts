import type { CardDef } from "../data/cards";
import { isOpen } from "./arena";
import { hexAdd, hexDist, hexEq, nearestDir } from "./hex";
import {
  DuelState,
  Side,
  StatusName,
  addStack,
  consume,
  emit,
  other,
  total,
} from "./state";

export interface EffectCtx {
  s: DuelState;
  side: Side;
  opp: Side;
  /** Hex distance when the card was played. */
  dist: number;
  /** Acting second this round. */
  second: boolean;
  card: CardDef;
}

export function checkOver(s: DuelState) {
  if (s.phase === "over") return;
  const dead0 = s.fighters[0].vitality <= 0;
  const dead1 = s.fighters[1].vitality <= 0;
  if (!dead0 && !dead1) return;
  s.winner = dead0 && dead1 ? "draw" : dead0 ? 1 : 0;
  s.phase = "over";
  s.resolving = null;
  emit(
    s,
    null,
    "end",
    s.winner === "draw" ? "Both fighters fall. Draw." : `${s.fighters[s.winner].cls} wins.`,
  );
}

/** Non-attack damage (also the final step of an attack). Warded absorbs first. */
export function damage(s: DuelState, target: Side, amount: number, source: string): number {
  const f = s.fighters[target];
  const warded = consume(f, "Warded", amount).length;
  const dealt = amount - warded;
  f.vitality = Math.max(0, f.vitality - dealt);
  emit(
    s,
    target,
    "damage",
    `${f.cls} takes ${dealt} from ${source}${warded ? ` (${warded} warded)` : ""}.`,
  );
  return dealt;
}

/**
 * Resolve an attack from ctx.side. Returns false if it was cancelled by Interrupt,
 * in which case the rest of the card does nothing.
 */
export function attack(c: EffectCtx, base: number): boolean {
  const { s, side, opp, card } = c;
  const attacker = s.fighters[side];
  const target = s.fighters[opp];

  if (consume(attacker, "Interrupt", 1).length) {
    emit(s, side, "status", `${card.name} is cancelled by Interrupt.`);
    return false;
  }

  let dmg = base + total(attacker, "Enraged");
  if (consume(target, "Exposed", 1).length) dmg += 2;
  const dist = hexDist(attacker.pos, target.pos);
  if (card.range !== null && dist === 1) dmg = Math.max(1, dmg - 2); // point-blank, applied last

  const dealt = damage(s, opp, dmg, card.name);
  if (dealt > 0 && target.vitality > 0) {
    const [charge] = consume(target, "Retaliate", 1);
    if (charge) damage(s, side, charge.value ?? 0, "Retaliate");
  }
  return true;
}

export function gain(c: EffectCtx, who: Side, status: StatusName, amount: number, value?: number) {
  const f = c.s.fighters[who];
  addStack(f, status, amount, value);
  const suffix = value !== undefined ? ` (returns ${value})` : "";
  emit(c.s, who, "status", `${f.cls} gains ${status} ${amount}${suffix}.`);
}

/** Push the opponent directly away, stopping at obstacles, the edge, or the pusher. */
export function push(c: EffectCtx, hexes: number) {
  const { s } = c;
  const me = s.fighters[c.side];
  const foe = s.fighters[other(c.side)];
  const dir = nearestDir(me.pos, foe.pos);
  let moved = 0;
  for (let i = 0; i < hexes; i++) {
    const next = hexAdd(foe.pos, dir);
    if (!isOpen(s.arena, next) || hexEq(next, me.pos)) break;
    foe.pos = next;
    moved++;
  }
  emit(s, c.opp, "move", `${foe.cls} is pushed ${moved} hex${moved === 1 ? "" : "es"}.`);
}
