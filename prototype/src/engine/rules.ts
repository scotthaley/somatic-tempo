import { CARDS, isTargeted, reachOf } from "../data/cards";
import { STARTER_DECKS } from "../data/decks";
import { EFFECTS } from "../data/effects";
import { inArena, isObstacle, makeArena } from "./arena";
import { EffectCtx, checkOver, damage } from "./combat";
import { Hex, ReachNode, hexDist, hexEq, hexKey, reachable } from "./hex";
import { makeRng, randomSeed, rollOn, shuffleInPlace } from "./rng";
import {
  Action,
  DuelState,
  Fighter,
  HAND_SIZE,
  MAX_ROUNDS,
  MAX_VITALITY,
  RETAIN_LIMIT,
  Side,
  cloneState,
  emit,
  other,
  total,
} from "./state";
import type { ClassName } from "../data/cards";

export function createDuel(opts: { seed?: number } = {}): DuelState {
  const seed = opts.seed ?? randomSeed();
  const rand = makeRng(seed);
  const arena = makeArena(rand);
  const fighter = (cls: ClassName, pos: Hex): Fighter => ({
    cls,
    pos,
    vitality: MAX_VITALITY,
    deck: shuffleInPlace([...STARTER_DECKS[cls]], rand),
    hand: [],
    discard: [],
    stacks: [],
  });
  const s: DuelState = {
    initialSeed: seed,
    seed: Math.floor(rand() * 2 ** 31),
    arena,
    fighters: [fighter("Wizard", arena.starts[0]), fighter("Barbarian", arena.starts[1])],
    round: 0,
    maxRounds: MAX_ROUNDS,
    phase: "commit",
    committed: [null, null],
    initiative: null,
    order: null,
    resolving: null,
    playedThisRound: [[], []],
    winner: null,
    quiet: false,
    events: [],
    metrics: { initiative: [], first: [], distanceAtStart: [], lostCards: [0, 0], playedCards: [0, 0] },
    turns: [],
  };
  startRound(s);
  return s;
}

/** Pure: returns a new state. Throws on illegal actions. */
export function apply(s: DuelState, action: Action): DuelState {
  const t = cloneState(s, s.quiet);
  step(t, action);
  return t;
}

/** Mutating version of apply, used by simulations. */
export function step(s: DuelState, action: Action) {
  switch (action.type) {
    case "commit":
      return commit(s, action.side, action.cards);
    case "move":
      return move(s, action.side, action.to);
    case "play":
      return play(s, action.side, action.index);
    case "end":
      return endResolve(s, action.side);
  }
}

// ── Round flow ──────────────────────────────────────────────────────────

function startRound(s: DuelState) {
  s.round++;
  for (const f of s.fighters) for (const st of f.stacks) st.aged = true;
  draw(s, 0);
  draw(s, 1);
  s.phase = "commit";
  s.committed = [null, null];
  s.initiative = null;
  s.order = null;
  s.resolving = null;
  s.playedThisRound = [[], []];
  if (!s.quiet) s.metrics.distanceAtStart.push(distance(s));
  emit(s, null, "round", `Round ${s.round}`);
}

function draw(s: DuelState, side: Side) {
  const f = s.fighters[side];
  while (f.hand.length < HAND_SIZE) {
    if (f.deck.length === 0) {
      if (f.discard.length === 0) break;
      f.deck = shuffleInPlace(f.discard, () => rollOn(s));
      f.discard = [];
      emit(s, side, "info", `${f.cls} reshuffles their discard.`);
    }
    f.hand.push(f.deck.pop()!);
  }
}

function commit(s: DuelState, side: Side, [i, j]: [number, number]) {
  const f = s.fighters[side];
  if (s.phase !== "commit") throw new Error("Not the commit phase");
  if (s.committed[side]) throw new Error("Already committed");
  if (i === j || !f.hand[i] || !f.hand[j]) throw new Error("Commit exactly two different cards");

  const names = [f.hand[i], f.hand[j]];
  if (!s.quiet) {
    s.turns.push({
      round: s.round,
      side,
      cls: f.cls,
      hand: [...f.hand],
      committed: names,
      initiative: 0,
      first: false,
      start: {
        vitality: [s.fighters[0].vitality, s.fighters[1].vitality],
        pos: [{ ...s.fighters[0].pos }, { ...s.fighters[1].pos }],
        stacks: [structuredClone(s.fighters[0].stacks), structuredClone(s.fighters[1].stacks)],
      },
      actions: [{ type: "commit", side, cards: [i, j] }],
    });
  }
  f.hand = f.hand.filter((_, k) => k !== i && k !== j);
  s.committed[side] = names;
  emit(s, side, "commit", `${f.cls} commits two cards.`);
  if (s.committed[0] && s.committed[1]) beginResolution(s);
}

export function initiativeOf(s: DuelState, side: Side, names: string[]): number {
  const speed = names.reduce((n, c) => n + CARDS[c].speed, 0);
  return speed + 2 * total(s.fighters[side], "Winded");
}

function beginResolution(s: DuelState) {
  const init: [number, number] = [
    initiativeOf(s, 0, s.committed[0]!),
    initiativeOf(s, 1, s.committed[1]!),
  ];
  const first: Side = init[0] < init[1] ? 0 : init[1] < init[0] ? 1 : rollOn(s) < 0.5 ? 0 : 1;
  s.initiative = init;
  s.order = [first, other(first)];
  s.phase = "resolve";
  if (!s.quiet) {
    s.metrics.initiative.push(init);
    s.metrics.first.push(first);
    for (const t of s.turns) {
      if (t.round !== s.round) continue;
      t.initiative = init[t.side];
      t.first = t.side === first;
    }
  }
  // Order only. The totals are never announced.
  emit(s, first, "order", `${s.fighters[first].cls} acts first.`);
  startResolve(s, first);
}

function startResolve(s: DuelState, side: Side) {
  const f = s.fighters[side];
  const names = s.committed[side]!;
  const movement = names.reduce((n, c) => n + CARDS[c].movement, 0);
  s.resolving = {
    side,
    budget: Math.max(0, movement - total(f, "Snared")),
    spent: 0,
    played: [false, false],
    ignoreObstacles: names.includes("Phase Step"),
  };
}

function record(s: DuelState, action: Action) {
  if (s.quiet) return;
  for (let k = s.turns.length - 1; k >= 0; k--) {
    const t = s.turns[k];
    if (t.round === s.round && t.side === action.side) {
      t.actions.push(action);
      return;
    }
  }
}

function assertResolving(s: DuelState, side: Side) {
  if (s.phase !== "resolve" || !s.resolving || s.resolving.side !== side) {
    throw new Error("Not this side's resolution");
  }
}

export function distance(s: DuelState): number {
  return hexDist(s.fighters[0].pos, s.fighters[1].pos);
}

/** Hexes the resolving fighter can end a move on with the budget left. */
export function reachableNow(s: DuelState): Map<string, ReachNode> {
  const r = s.resolving;
  if (!r) return new Map();
  const f = s.fighters[r.side];
  const foe = s.fighters[other(r.side)].pos;
  return reachable(
    f.pos,
    r.budget - r.spent,
    (h) => inArena(s.arena, h) && !hexEq(h, foe) && (r.ignoreObstacles || !isObstacle(s.arena, h)),
    (h) => !isObstacle(s.arena, h),
  );
}

function move(s: DuelState, side: Side, to: Hex) {
  assertResolving(s, side);
  const node = reachableNow(s).get(hexKey(to));
  if (!node) throw new Error("Hex not reachable");
  if (node.cost === 0) return;
  const f = s.fighters[side];
  f.pos = { ...node.hex };
  s.resolving!.spent += node.cost;
  record(s, { type: "move", side, to });
  emit(s, side, "move", `${f.cls} moves ${node.cost} (distance now ${distance(s)}).`);
}

function play(s: DuelState, side: Side, index: 0 | 1) {
  assertResolving(s, side);
  const r = s.resolving!;
  if (r.played[index]) throw new Error("Card already played");
  r.played[index] = true;
  record(s, { type: "play", side, index });

  const name = s.committed[side]![index];
  const card = CARDS[name];
  const f = s.fighters[side];
  const dist = distance(s);
  const lost = isTargeted(card) && dist > reachOf(card);
  s.playedThisRound[side].push({ name, lost });
  if (!s.quiet) s.metrics.playedCards[side]++;

  emit(s, side, "play", `${f.cls} plays ${name}.`);
  if (lost) {
    if (!s.quiet) s.metrics.lostCards[side]++;
    emit(s, side, "lost", `${name} is out of reach (distance ${dist}) and is lost.`);
    return;
  }
  const ctx: EffectCtx = { s, side, opp: other(side), dist, second: s.order![1] === side, card };
  EFFECTS[name](ctx);
  checkOver(s);
}

function endResolve(s: DuelState, side: Side) {
  assertResolving(s, side);
  const r = s.resolving!;
  record(s, { type: "end", side });
  r.played.forEach((p, i) => {
    if (!p) {
      s.playedThisRound[side].push({ name: s.committed[side]![i], lost: true });
      emit(s, side, "lost", `${s.committed[side]![i]} is forfeited.`);
    }
  });
  if (side === s.order![0]) startResolve(s, s.order![1]);
  else endRound(s);
}

function endRound(s: DuelState) {
  s.resolving = null;
  for (const side of s.order!) {
    const burning = total(s.fighters[side], "Burning");
    if (burning > 0) damage(s, side, burning, "Burning");
  }
  checkOver(s);
  if (s.phase === "over") return;

  for (const f of s.fighters) f.stacks = f.stacks.filter((st) => !st.aged);

  s.fighters.forEach((f, side) => {
    f.discard.push(...s.committed[side]!);
    const kept: string[] = [];
    for (const name of f.hand) {
      if (CARDS[name].retain && kept.length < RETAIN_LIMIT) kept.push(name);
      else f.discard.push(name);
    }
    f.hand = kept;
  });

  if (s.round >= s.maxRounds) {
    const [a, b] = [s.fighters[0].vitality, s.fighters[1].vitality];
    s.winner = a === b ? "draw" : a > b ? 0 : 1;
    s.phase = "over";
    emit(
      s,
      null,
      "end",
      s.winner === "draw"
        ? "Round cap reached with vitality tied. Draw."
        : `Round cap reached. ${s.fighters[s.winner].cls} wins on vitality.`,
    );
    return;
  }
  startRound(s);
}
