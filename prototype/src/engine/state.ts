import type { ClassName } from "../data/cards";
import type { Arena } from "./arena";
import type { Hex } from "./hex";

export const MAX_VITALITY = 20;
export const HAND_SIZE = 5;
export const MAX_ROUNDS = 15;
export const RETAIN_LIMIT = 1;

export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export type StatusName =
  | "Burning"
  | "Enraged"
  | "Winded"
  | "Snared"
  | "Interrupt"
  | "Retaliate"
  | "Warded"
  | "Exposed";

export const STATUS_INFO: Record<StatusName, string> = {
  Burning: "Takes N damage at end of round.",
  Enraged: "Attacks deal +1 damage per stack.",
  Winded: "Initiative total +2 per stack (slower).",
  Snared: "Movement budget reduced by N.",
  Interrupt: "This fighter's next attack is cancelled. One charge per attack.",
  Retaliate: "When an attack damages this fighter, deal the listed damage back. One charge per hit.",
  Warded: "Prevents incoming damage, one stack per point.",
  Exposed: "The next attack against this fighter deals +2. One charge per attack.",
};

export interface Stack {
  status: StatusName;
  amount: number;
  /** Present at the start of this round → removed at end of round. */
  aged: boolean;
  /** Retaliate return damage. */
  value?: number;
}

export interface Fighter {
  cls: ClassName;
  pos: Hex;
  vitality: number;
  deck: string[];
  hand: string[];
  discard: string[];
  stacks: Stack[];
}

export interface Resolving {
  side: Side;
  budget: number;
  spent: number;
  played: [boolean, boolean];
  ignoreObstacles: boolean;
}

export interface PlayedCard {
  name: string;
  lost: boolean;
}

export interface DuelEvent {
  round: number;
  side: Side | null;
  kind: "round" | "commit" | "order" | "move" | "play" | "lost" | "damage" | "status" | "info" | "end";
  text: string;
}

export type Action =
  | { type: "commit"; side: Side; cards: [number, number] }
  | { type: "move"; side: Side; to: Hex }
  | { type: "play"; side: Side; index: 0 | 1 }
  | { type: "end"; side: Side };

/** One player's round, logged for history-based ghosts (design doc §3). */
export interface TurnRecord {
  round: number;
  side: Side;
  cls: ClassName;
  hand: string[];
  committed: string[];
  initiative: number;
  first: boolean;
  start: {
    vitality: [number, number];
    pos: [Hex, Hex];
    stacks: [Stack[], Stack[]];
  };
  actions: Action[];
}

export interface Metrics {
  initiative: [number, number][];
  first: Side[];
  distanceAtStart: number[];
  lostCards: [number, number];
  playedCards: [number, number];
}

export interface DuelState {
  initialSeed: number;
  seed: number;
  arena: Arena;
  fighters: [Fighter, Fighter];
  round: number;
  maxRounds: number;
  phase: "commit" | "resolve" | "over";
  committed: [string[] | null, string[] | null];
  initiative: [number, number] | null;
  order: [Side, Side] | null;
  resolving: Resolving | null;
  playedThisRound: [PlayedCard[], PlayedCard[]];
  winner: Side | "draw" | null;
  /** Simulation copies skip events, metrics and records. */
  quiet: boolean;
  events: DuelEvent[];
  metrics: Metrics;
  turns: TurnRecord[];
}

export function total(f: Fighter, status: StatusName): number {
  let n = 0;
  for (const s of f.stacks) if (s.status === status) n += s.amount;
  return n;
}

export function addStack(f: Fighter, status: StatusName, amount: number, value?: number) {
  const fresh = f.stacks.find((s) => s.status === status && !s.aged && s.value === value);
  if (fresh) fresh.amount += amount;
  else f.stacks.push({ status, amount, aged: false, value });
}

/** Consume up to n from a status, aged stacks first. Returns the stacks consumed from, one entry per unit. */
export function consume(f: Fighter, status: StatusName, n: number): Stack[] {
  const taken: Stack[] = [];
  const ordered = f.stacks.filter((s) => s.status === status).sort((a, b) => Number(b.aged) - Number(a.aged));
  for (const s of ordered) {
    while (s.amount > 0 && taken.length < n) {
      s.amount--;
      taken.push(s);
    }
    if (taken.length >= n) break;
  }
  f.stacks = f.stacks.filter((s) => s.amount > 0);
  return taken;
}

export function clearStatus(f: Fighter, status: StatusName) {
  f.stacks = f.stacks.filter((s) => s.status !== status);
}

export function emit(s: DuelState, side: Side | null, kind: DuelEvent["kind"], text: string) {
  if (!s.quiet) s.events.push({ round: s.round, side, kind, text });
}

function cloneFighter(f: Fighter): Fighter {
  return {
    ...f,
    pos: { ...f.pos },
    deck: [...f.deck],
    hand: [...f.hand],
    discard: [...f.discard],
    stacks: f.stacks.map((s) => ({ ...s })),
  };
}

export function cloneState(s: DuelState, quiet = true): DuelState {
  const out: DuelState = {
    ...s,
    fighters: [cloneFighter(s.fighters[0]), cloneFighter(s.fighters[1])],
    committed: [s.committed[0] && [...s.committed[0]], s.committed[1] && [...s.committed[1]]],
    initiative: s.initiative && [...s.initiative],
    order: s.order && [...s.order],
    resolving: s.resolving && { ...s.resolving, played: [...s.resolving.played] },
    playedThisRound: [[...s.playedThisRound[0]], [...s.playedThisRound[1]]],
    quiet,
  };
  if (!quiet) {
    // arena is never mutated, so it stays shared
    out.events = [...s.events];
    out.metrics = structuredClone(s.metrics);
    out.turns = structuredClone(s.turns);
  }
  return out;
}
