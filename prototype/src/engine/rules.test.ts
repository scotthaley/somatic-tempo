import { describe, expect, it } from "vitest";
import { CARDS } from "../data/cards";
import { POOL_PICKS, baseDeck, poolCards } from "../data/decks";
import { hexDist, hexKey, reachable } from "./hex";
import { apply, createDuel, reachableNow, step } from "./rules";
import { DuelState, HAND_SIZE, Side, addStack, total } from "./state";

/** A duel on an empty board with chosen hands and positions. */
function setup(opts: {
  hands: [string[], string[]];
  pos?: [[number, number], [number, number]];
  vitality?: [number, number];
}): DuelState {
  const s = createDuel({ seed: 42 });
  s.arena = { ...s.arena, obstacles: {} };
  const pos = opts.pos ?? [[0, 0], [1, 0]];
  s.fighters.forEach((f, i) => {
    f.hand = [...opts.hands[i]];
    f.pos = { q: pos[i][0], r: pos[i][1] };
    if (opts.vitality) f.vitality = opts.vitality[i];
  });
  return s;
}

const commitBoth = (s: DuelState) => {
  step(s, { type: "commit", side: 0, cards: [0, 1] });
  step(s, { type: "commit", side: 1, cards: [0, 1] });
};

const isOver = (s: DuelState) => s.phase === "over";
const R = (s: DuelState) => s.resolving!;

/** Plays one card for the side holding the baton, then hands it over. */
const playStep = (s: DuelState, index: 0 | 1) => {
  const side = R(s).side;
  step(s, { type: "play", side, index });
  if (isOver(s)) return;
  step(s, { type: "pass", side });
};

/** Ends the baton holder's mini-turn without playing anything. */
const passStep = (s: DuelState) => step(s, { type: "pass", side: R(s).side });

/**
 * Runs the rest of the round under alternation: whoever holds the baton plays its
 * lowest unplayed card, or ends once it has none left.
 */
const resolveRound = (s: DuelState) => {
  const round = s.round;
  let guard = 0;
  while (s.phase === "resolve" && s.round === round) {
    if (++guard > 20) throw new Error("round did not terminate");
    const side = R(s).side;
    const i = R(s).played[side].findIndex((p) => !p);
    if (i < 0) {
      step(s, { type: "end", side });
      continue;
    }
    step(s, { type: "play", side, index: i as 0 | 1 });
    if (s.phase !== "resolve" || s.round !== round) return;
    step(s, { type: "pass", side });
  }
};

describe("hex", () => {
  it("measures distance", () => {
    expect(hexDist({ q: -3, r: 1 }, { q: 2, r: 1 })).toBe(5);
    expect(hexDist({ q: 0, r: 0 }, { q: 1, r: -1 })).toBe(1);
  });
  it("reaches around obstacles", () => {
    const wall = new Set(["1,0"]);
    const map = reachable({ q: 0, r: 0 }, 3, (h) => !wall.has(hexKey(h)), () => true);
    expect(map.has("2,0")).toBe(true);
    expect(map.get("2,0")!.cost).toBe(3); // detour around the wall
    expect(map.has("1,0")).toBe(false);
  });
});

describe("setup", () => {
  it("starts fighters 5 apart with 5-card hands", () => {
    const s = createDuel({ seed: 7 });
    expect(hexDist(s.fighters[0].pos, s.fighters[1].pos)).toBe(5);
    expect(s.fighters[0].hand).toHaveLength(5);
    expect(s.fighters[0].hand.length + s.fighters[0].deck.length).toBe(10);
  });
});

describe("initiative", () => {
  it("lower speed total acts first, and Winded adds 2 per stack", () => {
    const s = setup({ hands: [["Spark", "Spark"], ["Strike", "Brace"]] });
    commitBoth(s);
    expect(s.order![0]).toBe(0); // 2 vs 5

    const t = setup({ hands: [["Arcane Bolt", "Shield"], ["Strike", "Strike"]] });
    addStack(t.fighters[1], "Winded", 1); // 4 + 2 = 6 vs 5
    commitBoth(t);
    expect(t.order![0]).toBe(0);
  });
});

describe("damage pipeline", () => {
  it("Warded absorbs partially", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]] });
    s.fighters[0].cls = "Barbarian";
    addStack(s.fighters[1], "Warded", 2);
    s.fighters[0].hand = ["Strike", "Brace"];
    commitBoth(s);
    // side 0 first (5 vs 6)
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[1].vitality).toBe(19);
    expect(total(s.fighters[1], "Warded")).toBe(0);
  });

  it("Exposed adds 2 and consumes one charge", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]] });
    addStack(s.fighters[1], "Exposed", 2);
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[1].vitality).toBe(15);
    expect(total(s.fighters[1], "Exposed")).toBe(1);
  });

  it("Interrupt cancels before Retaliate, which is not consumed", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]] });
    addStack(s.fighters[0], "Interrupt", 1); // side 0's next attack is cancelled
    addStack(s.fighters[1], "Retaliate", 1, 5);
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[1].vitality).toBe(20);
    expect(s.fighters[0].vitality).toBe(20);
    expect(total(s.fighters[0], "Interrupt")).toBe(0);
    expect(total(s.fighters[1], "Retaliate")).toBe(1);
    // second strike lands and triggers retaliate, after side 1's mini-turn
    step(s, { type: "pass", side: 0 });
    step(s, { type: "end", side: 1 });
    step(s, { type: "play", side: 0, index: 1 });
    expect(s.fighters[1].vitality).toBe(17);
    expect(s.fighters[0].vitality).toBe(15);
    expect(total(s.fighters[1], "Retaliate")).toBe(0);
  });

  it("Retaliate does not trigger when Warded absorbs everything", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]] });
    addStack(s.fighters[1], "Warded", 5);
    addStack(s.fighters[1], "Retaliate", 1, 5);
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[0].vitality).toBe(20);
    expect(total(s.fighters[1], "Retaliate")).toBe(1);
  });

  it("applies the point-blank penalty to ranged attacks at distance 1", () => {
    const s = setup({ hands: [["Arcane Bolt", "Spark"], ["Brace", "Brace"]] });
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 }); // 4 - 2
    expect(s.fighters[1].vitality).toBe(18);
    step(s, { type: "pass", side: 0 });
    step(s, { type: "end", side: 1 });
    step(s, { type: "play", side: 0, index: 1 }); // max(1, 2 - 2)
    expect(s.fighters[1].vitality).toBe(17);
  });

  it("uses the long-range bonus at distance >= 4", () => {
    const s = setup({ hands: [["Arcane Bolt", "Shield"], ["Brace", "Brace"]], pos: [[0, 0], [4, 0]] });
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[1].vitality).toBe(14);
  });
});

describe("reach", () => {
  it("loses an out-of-range card without consuming charges", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]], pos: [[0, 0], [3, 0]] });
    addStack(s.fighters[0], "Interrupt", 1);
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.playedThisRound[0][0].lost).toBe(true);
    expect(total(s.fighters[0], "Interrupt")).toBe(1);
    expect(s.metrics.lostCards[0]).toBe(1);
  });

  it("spends movement between cards", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]], pos: [[0, 0], [3, 0]] });
    commitBoth(s);
    expect(R(s).budget[0]).toBe(2);
    step(s, { type: "move", side: 0, to: { q: 2, r: 0 } });
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[1].vitality).toBe(17);
    expect(reachableNow(s).size).toBe(1); // budget spent
    expect(() => step(s, { type: "move", side: 0, to: { q: 1, r: 0 } })).toThrow();
  });

  it("Snared reduces the movement budget", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]], pos: [[0, 0], [3, 0]] });
    addStack(s.fighters[0], "Snared", 1);
    commitBoth(s);
    expect(R(s).budget[0]).toBe(1);
  });
});

describe("push", () => {
  it("Repulse pushes directly away and stops at obstacles", () => {
    const s = setup({ hands: [["Repulse", "Spark"], ["Brace", "Brace"]] });
    s.arena = { ...s.arena, obstacles: { "3,0": true } };
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[1].pos).toEqual({ q: 2, r: 0 });
    expect(total(s.fighters[1], "Interrupt")).toBe(1);
  });

  it("stops at the arena edge", () => {
    const s = setup({ hands: [["Repulse", "Spark"], ["Brace", "Brace"]], pos: [[2, 0], [3, 0]] });
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.fighters[1].pos).toEqual({ q: 4, r: 0 });
  });
});

describe("statuses over rounds", () => {
  it("a status applied mid-round survives into the next round, then decays", () => {
    const s = setup({ hands: [["Reckless Swing", "Brace"], ["Shield", "Shield"]] });
    s.fighters[0].cls = "Barbarian";
    s.fighters[1].cls = "Wizard";
    commitBoth(s);
    const first = s.order![0];
    resolveRound(s);
    expect(s.round).toBe(2);
    expect(total(s.fighters[0], "Exposed")).toBe(1); // fresh last round → survives
    expect(s.fighters[0].stacks.every((st) => st.aged)).toBe(true);
    expect(first).toBeDefined();

    s.fighters[0].hand = ["Brace", "Brace", ...s.fighters[0].hand.slice(2)];
    s.fighters[1].hand = ["Shield", "Shield", ...s.fighters[1].hand.slice(2)];
    commitBoth(s);
    resolveRound(s);
    expect(total(s.fighters[0], "Exposed")).toBe(0); // aged → removed
    expect(total(s.fighters[0], "Warded")).toBe(8); // this round's two Braces are fresh → survive
  });

  it("Burning is absorbed by Warded at end of round", () => {
    const s = setup({ hands: [["Shield", "Spark"], ["Brace", "Brace"]], pos: [[0, 0], [3, 0]] });
    addStack(s.fighters[1], "Burning", 3);
    addStack(s.fighters[1], "Warded", 1);
    commitBoth(s);
    // Alternating, side 1's first Brace lands before the Spark, so the Spark is
    // fully absorbed — a defence played later can still blunt an earlier attack.
    resolveRound(s);
    expect(s.fighters[1].vitality).toBe(20);
    expect(total(s.fighters[1], "Warded")).toBe(4); // 1 + 4 + 4 - 2 spark - 3 burning
  });
});

describe("duel end", () => {
  it("ends immediately at 0 vitality", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]], vitality: [20, 3] });
    commitBoth(s);
    step(s, { type: "play", side: 0, index: 0 });
    expect(s.phase).toBe("over");
    expect(s.winner).toBe(0);
    expect(() => step(s, { type: "play", side: 0, index: 1 })).toThrow();
  });

  it("round cap awards the higher vitality", () => {
    const s = setup({ hands: [["Shield", "Shield"], ["Brace", "Brace"]], vitality: [12, 10] });
    s.round = s.maxRounds;
    commitBoth(s);
    resolveRound(s);
    expect(s.phase).toBe("over");
    expect(s.winner).toBe(0);
  });

  it("apply does not mutate the input state", () => {
    const s = setup({ hands: [["Strike", "Strike"], ["Brace", "Brace"]] });
    const t = apply(s, { type: "commit", side: 0 as Side, cards: [0, 1] });
    expect(s.committed[0]).toBeNull();
    expect(t.committed[0]).toEqual(["Strike", "Strike"]);
  });
});

describe("alternation", () => {
  it("passes the baton after each mini-turn, and allows one card per step", () => {
    const s = setup({ hands: [["Spark", "Spark"], ["Strike", "Brace"]] });
    commitBoth(s);
    expect(R(s).side).toBe(0); // speed 2 vs 5

    step(s, { type: "play", side: 0, index: 0 });
    expect(R(s).side).toBe(0); // playing does not hand over by itself
    expect(() => step(s, { type: "play", side: 0, index: 1 })).toThrow();

    step(s, { type: "pass", side: 0 });
    expect(R(s).side).toBe(1);
    expect(() => step(s, { type: "play", side: 0, index: 1 })).toThrow();

    playStep(s, 0);
    expect(R(s).side).toBe(0);
    playStep(s, 1);
    expect(R(s).side).toBe(1);
  });

  it("lets a side play its committed cards in either order", () => {
    const s = setup({ hands: [["Arcane Bolt", "Spark"], ["Strike", "Brace"]] });
    commitBoth(s);
    expect(() => step(s, { type: "play", side: 0, index: 1 })).not.toThrow();
    expect(R(s).played[0]).toEqual([false, true]);
  });

  it("carries unspent movement between a side's two mini-turns", () => {
    const s = setup({ hands: [["Shield", "Shield"], ["Brace", "Brace"]], pos: [[0, 0], [3, 0]] });
    commitBoth(s);
    expect(R(s).side).toBe(0); // speed 4 vs 6
    expect(R(s).budget[0]).toBe(4);

    step(s, { type: "move", side: 0, to: { q: 1, r: 0 } });
    expect(R(s).side).toBe(0); // moving never hands over
    playStep(s, 0);
    playStep(s, 0); // side 1

    expect(R(s).side).toBe(0);
    expect(R(s).budget[0] - R(s).spent[0]).toBe(3);
  });

  it("refuses moves on the opponent's mini-turn", () => {
    const s = setup({ hands: [["Spark", "Spark"], ["Strike", "Brace"]], pos: [[0, 0], [3, 0]] });
    commitBoth(s);
    playStep(s, 0);
    expect(R(s).side).toBe(1);
    expect(() => step(s, { type: "move", side: 0, to: { q: 1, r: 0 } })).toThrow();
  });

  it("lets the other side finish alone after a forfeit", () => {
    const s = setup({ hands: [["Spark", "Spark"], ["Strike", "Brace"]], pos: [[0, 0], [1, 0]] });
    commitBoth(s);
    step(s, { type: "end", side: 0 });
    expect(R(s).done[0]).toBe(true);
    expect(s.playedThisRound[0].every((c) => c.lost)).toBe(true);
    expect(s.playedThisRound[0]).toHaveLength(2);

    expect(R(s).side).toBe(1);
    playStep(s, 0);
    expect(R(s).side).toBe(1); // a finished opponent is skipped
    playStep(s, 1);
    expect(s.round).toBe(2);
  });

  it("forfeits cards left over when a side passes both mini-turns", () => {
    const s = setup({ hands: [["Spark", "Spark"], ["Strike", "Brace"]], pos: [[0, 0], [1, 0]] });
    commitBoth(s);
    passStep(s); // side 0 holds
    playStep(s, 0); // side 1
    passStep(s); // side 0 again — out of steps
    expect(R(s).done[0]).toBe(true);
    expect(s.playedThisRound[0].filter((c) => c.lost)).toHaveLength(2);
  });

  it("scopes Phase Step to the whole round, whichever card is played first", () => {
    const s = setup({ hands: [["Phase Step", "Spark"], ["Brace", "Brace"]], pos: [[0, 0], [4, 0]] });
    s.arena = { ...s.arena, obstacles: { "1,0": true } };
    commitBoth(s);
    playStep(s, 1); // Spark first, out of reach and lost
    playStep(s, 0); // side 1
    expect(R(s).side).toBe(0);
    // Phase Step lets movement pass through the wall at 1,0 (cost 2, not a cost-3 detour),
    // though it still cannot stop on it.
    expect(reachableNow(s).get(hexKey({ q: 2, r: 0 }))!.cost).toBe(2);
    expect(reachableNow(s).has(hexKey({ q: 1, r: 0 }))).toBe(false);
  });

  it("keeps `second` tied to the initiative order, not the baton", () => {
    const s = setup({ hands: [["Sigil of Recoil", "Shield"], ["Strike", "Strike"]] });
    commitBoth(s);
    expect(R(s).side).toBe(1); // speed 4 vs 6, so side 0 is second
    playStep(s, 0);
    step(s, { type: "play", side: 0, index: 0 });
    expect(total(s.fighters[0], "Retaliate")).toBe(2);
  });
});

describe("hand carryover", () => {
  it("keeps the uncommitted rest of the hand and draws back up to five", () => {
    const s = createDuel({ seed: 5 });
    const kept = s.fighters[0].hand.slice(2);
    commitBoth(s);
    const committed = [...s.committed[0]!];
    resolveRound(s);

    expect(s.round).toBe(2);
    for (const name of kept) expect(s.fighters[0].hand).toContain(name);
    expect(s.fighters[0].hand).toHaveLength(HAND_SIZE);
    for (const name of committed) expect(s.fighters[0].discard).toContain(name);
    const f = s.fighters[0];
    expect(f.hand.length + f.deck.length + f.discard.length).toBe(10);
  });
});

describe("deck construction", () => {
  it("builds six fixed cards plus four distinct pool cards", () => {
    const s = createDuel({ seed: 1 });
    for (const f of s.fighters) {
      const all = [...f.hand, ...f.deck];
      expect(all).toHaveLength(10);

      const counts = new Map<string, number>();
      for (const c of all) counts.set(c, (counts.get(c) ?? 0) + 1);
      for (const c of baseDeck(f.cls)) expect(counts.get(c)).toBeGreaterThanOrEqual(1);
      for (const c of all.filter((n) => CARDS[n].deck === "basic")) expect(counts.get(c)).toBe(2);
      for (const c of all.filter((n) => CARDS[n].deck === "starter")) expect(counts.get(c)).toBe(1);

      expect(f.extras).toHaveLength(POOL_PICKS);
      expect(new Set(f.extras).size).toBe(POOL_PICKS);
      for (const c of f.extras) expect(poolCards(f.cls)).toContain(c);
      expect(all.filter((n) => CARDS[n].deck === "pool").sort()).toEqual([...f.extras].sort());
    }
  });

  it("is reproducible from the seed, and varies across seeds", () => {
    expect(createDuel({ seed: 99 }).fighters[0].extras).toEqual(
      createDuel({ seed: 99 }).fighters[0].extras,
    );
    const rolls = [1, 2, 3, 4, 5].map((n) => createDuel({ seed: n }).fighters[0].extras.join());
    expect(new Set(rolls).size).toBeGreaterThan(1);
  });
});
