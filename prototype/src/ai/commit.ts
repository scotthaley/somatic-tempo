import { CARDS, reachOf } from "../data/cards";
import { hexDist } from "../engine/hex";
import { step } from "../engine/rules";
import { DuelState, HAND_SIZE, Side, cloneState, other, total } from "../engine/state";
import { evaluate } from "./evaluate";
import { planResolution } from "./plan";

// Rough per-card value used only to guess what the opponent might commit.
const EST: Record<string, { dmg?: number; def?: number; util?: number }> = {
  Spark: { dmg: 2 },
  Shield: { def: 2 },
  "Arcane Bolt": { dmg: 5 },
  Repulse: { util: 4 },
  Emberbrand: { util: 4 },
  Scorch: { dmg: 4 },
  "Arc Lightning": { dmg: 6 },
  Hex: { util: 3 },
  Siphon: { dmg: 4 },
  "Frost Lattice": { util: 4 },
  "Mirror Ward": { def: 2, util: 3 },
  Counterspell: { util: 4 },
  "Phase Step": { util: 2 },
  "Sigil of Recoil": { def: 3 },
  Strike: { dmg: 3 },
  Brace: { def: 4 },
  "Reckless Swing": { dmg: 5 },
  Charge: { dmg: 3 },
  Bloodrage: { util: 3 },
  Frenzy: { dmg: 3.5 },
  Cleave: { dmg: 8 },
  Headbutt: { dmg: 3.5 },
  Grapple: { util: 3 },
  Stagger: { dmg: 1, util: 2 },
  "Thick Hide": { def: 6 },
  Counterblow: { def: 4 },
  "Second Wind": { util: 2 },
  "Last Stand": { def: 3 },
};

export interface CommitOptions {
  samples?: number;
  temperature?: number;
  /** Positions considered per card when simulating resolutions. */
  planCandidates?: number;
  rand?: () => number;
}

function pairsOf(hand: string[]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      const key = [hand[i], hand[j]].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([i, j]);
    }
  }
  return out;
}

function softmaxPick<T>(items: T[], scores: number[], temperature: number, rand: () => number): T {
  const max = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - max) / temperature));
  let roll = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Cheap static guess at how attractive a pair is. */
export function pairHeuristic(s: DuelState, side: Side, names: string[]): number {
  const f = s.fighters[side];
  const d = hexDist(f.pos, s.fighters[other(side)].pos);
  const movement = Math.max(0, names.reduce((n, c) => n + CARDS[c].movement, 0) - total(f, "Snared"));
  let v = 0;
  for (const name of names) {
    const card = CARDS[name];
    const est = EST[name] ?? {};
    const inReach = card.type !== "attack" || d - movement <= reachOf(card);
    if (inReach) v += (est.dmg ?? 0) * 1.2;
    v += (est.def ?? 0) * 0.6 + (est.util ?? 0);
    v -= card.speed * 0.4;
  }
  if (f.cls === "Wizard" && d <= 2) v += movement * 1.2;
  if (f.cls === "Barbarian" && d > 1) v += Math.min(movement, d - 1) * 1.5;
  return v;
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Chooses two hand indices. Each distinct pair is played out against sampled
 * opponent hands (drawn from cards the opponent could be holding), with both
 * sides resolving via a cheap planner, and the averaged outcomes are softmaxed.
 */
export function chooseCommit(state: DuelState, side: Side, opts: CommitOptions = {}): [number, number] {
  const samples = opts.samples ?? 12;
  const temperature = opts.temperature ?? 8;
  const planCandidates = opts.planCandidates ?? 3;
  const rand = opts.rand ?? Math.random;
  const opp = other(side);
  const foe = state.fighters[opp];
  // Hidden information: the AI knows the opponent's deck composition, not their hand.
  const pool = [...foe.deck, ...foe.hand, ...(state.committed[opp] ?? [])];
  const handSize = Math.min(HAND_SIZE, pool.length);

  const pairs = pairsOf(state.fighters[side].hand);
  const worlds = Array.from({ length: samples }, () => ({
    hand: shuffled(pool, rand).slice(0, handSize),
    seed: Math.floor(rand() * 2 ** 31),
  }));

  const scores = pairs.map((pair) => {
    let sum = 0;
    for (const world of worlds) {
      const t = cloneState(state);
      t.seed = world.seed;
      t.committed[opp] = null;
      t.fighters[opp].hand = [...world.hand];
      step(t, { type: "commit", side, cards: pair });

      const oppPairs = pairsOf(t.fighters[opp].hand);
      const oppScores = oppPairs.map((p) =>
        pairHeuristic(t, opp, [t.fighters[opp].hand[p[0]], t.fighters[opp].hand[p[1]]]),
      );
      step(t, { type: "commit", side: opp, cards: softmaxPick(oppPairs, oppScores, 2, rand) });

      const round = t.round;
      while (t.phase === "resolve" && t.round === round) {
        const plan = planResolution(t, t.resolving!.side, { maxCandidates: planCandidates });
        for (const a of plan.actions) step(t, a);
      }
      sum += evaluate(t, side);
    }
    return sum / samples;
  });

  return softmaxPick(pairs, scores, temperature, rand);
}
