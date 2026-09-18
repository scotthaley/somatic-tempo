import { describe, expect, it } from "vitest";
import { hexDist, hexKey, reachable } from "./hex";
import { apply, createDuel, reachableNow, step } from "./rules";
import { DuelState, Side, addStack, total } from "./state";

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

/** Play both committed cards in order, then end, for whichever side is resolving. */
const isOver = (s: DuelState) => s.phase === "over";
const resolveSimple = (s: DuelState) => {
  const side = s.resolving!.side;
  step(s, { type: "play", side, index: 0 });
  if (isOver(s)) return;
  step(s, { type: "play", side, index: 1 });
  if (isOver(s)) return;
  step(s, { type: "end", side });
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
    // second strike lands and triggers retaliate
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
    expect(s.resolving!.budget).toBe(2);
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
    expect(s.resolving!.budget).toBe(1);
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
    resolveSimple(s);
    resolveSimple(s);
    expect(s.round).toBe(2);
    expect(total(s.fighters[0], "Exposed")).toBe(1); // fresh last round → survives
    expect(s.fighters[0].stacks.every((st) => st.aged)).toBe(true);
    expect(first).toBeDefined();

    s.fighters[0].hand = ["Brace", "Brace", ...s.fighters[0].hand.slice(2)];
    s.fighters[1].hand = ["Shield", "Shield", ...s.fighters[1].hand.slice(2)];
    commitBoth(s);
    resolveSimple(s);
    resolveSimple(s);
    expect(total(s.fighters[0], "Exposed")).toBe(0); // aged → removed
    expect(total(s.fighters[0], "Warded")).toBe(8); // this round's two Braces are fresh → survive
  });

  it("Burning deals damage at end of round through Warded", () => {
    const s = setup({ hands: [["Shield", "Spark"], ["Brace", "Brace"]], pos: [[0, 0], [3, 0]] });
    addStack(s.fighters[1], "Burning", 3);
    addStack(s.fighters[1], "Warded", 1);
    commitBoth(s);
    resolveSimple(s); // Spark: 2 damage, 1 warded
    resolveSimple(s); // Brace x2: Warded 8, then Burning 3 is absorbed at end of round
    expect(s.fighters[1].vitality).toBe(19);
    expect(total(s.fighters[1], "Warded")).toBe(5);
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
    resolveSimple(s);
    resolveSimple(s);
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
