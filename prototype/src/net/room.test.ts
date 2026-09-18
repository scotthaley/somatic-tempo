import { describe, expect, it } from "vitest";
import { createDuel } from "../engine/rules";
import type { Action } from "../engine/state";
import { foldLog } from "../ui/match";
import { createRoom, onAct, onJoin, onLeave, onRematch, sideOf, type Effect, type RoomState } from "./room";

const hello = (clientId: string, want?: 0 | 1) => ({ t: "hello" as const, clientId, want });
const act = (r: RoomState, connId: string, action: Action) =>
  onAct(r, connId, { t: "act", action, at: r.log.length });

const broadcasts = (fx: Effect[]) => fx.filter((e) => e.to === "all").map((e) => e.msg);
const errors = (fx: Effect[]) => fx.flatMap((e) => (e.msg.t === "error" ? [e.msg] : []));

function twoSeated() {
  const r = createRoom("m1", 99);
  onJoin(r, "cA", hello("a", 0));
  onJoin(r, "cB", hello("b", 1));
  return r;
}

describe("seating", () => {
  it("grants the requested side, then fills, then spectates", () => {
    const r = createRoom("m1", 1);
    onJoin(r, "c1", hello("a", 1));
    expect(sideOf(r, "c1")).toBe(1);
    onJoin(r, "c2", hello("b", 1)); // wanted 1, taken -> gets 0
    expect(sideOf(r, "c2")).toBe(0);
    onJoin(r, "c3", hello("c"));
    expect(sideOf(r, "c3")).toBeNull();
  });

  it("reclaims the same side on refresh, even while the room looks full", () => {
    const r = twoSeated();
    onLeave(r, "cA");
    onJoin(r, "cA2", hello("a")); // same clientId, new connection
    expect(sideOf(r, "cA2")).toBe(0);
    expect(sideOf(r, "cB")).toBe(1);
  });

  it("lets a new player inherit a seat nobody is sitting in", () => {
    const r = twoSeated();
    onLeave(r, "cB");
    onJoin(r, "cC", hello("c"));
    expect(sideOf(r, "cC")).toBe(1);
  });
});

describe("hidden commit", () => {
  const commit0: Action = { type: "commit", side: 0, cards: [0, 1] };
  const commit1: Action = { type: "commit", side: 1, cards: [2, 3] };

  it("withholds the first commit entirely", () => {
    const r = twoSeated();
    const fx = act(r, "cA", commit0);

    expect(r.log).toHaveLength(0);
    expect(broadcasts(fx)).toHaveLength(0);
    // The opponent learns only *that* a commit happened.
    expect(fx.map((e) => e.msg)).toEqual([{ t: "committed", side: 0 }]);
    expect(JSON.stringify(fx)).not.toContain("cards");
  });

  it("releases both commits together, side 0 first, on the second", () => {
    const r = twoSeated();
    act(r, "cB", commit1); // side 1 commits first in wall-clock time
    const fx = act(r, "cA", commit0);

    expect(broadcasts(fx)).toEqual([{ t: "actions", from: 0, actions: [commit0, commit1] }]);
    expect(r.log).toEqual([commit0, commit1]);
    expect(r.holds).toEqual([null, null]);
  });

  it("ignores a second commit from the same side", () => {
    const r = twoSeated();
    act(r, "cA", commit0);
    const fx = act(r, "cA", { type: "commit", side: 0, cards: [2, 3] });
    expect(fx).toHaveLength(0);
    expect(r.holds[0]).toEqual(commit0);
  });

  // This is why the room sorts rather than releasing in arrival order.
  it("commit order is game-equivalent but log-visible", () => {
    const a = foldLog(99, [commit0, commit1]);
    const b = foldLog(99, [commit1, commit0]);

    expect(b.fighters).toEqual(a.fighters);
    expect(b.committed).toEqual(a.committed);
    expect(b.seed).toBe(a.seed);
    expect(b.order).toEqual(a.order);
    expect(b.turns.map((t) => t.side)).not.toEqual(a.turns.map((t) => t.side));
  });
});

describe("rejection", () => {
  it("refuses actions from a spectator", () => {
    const r = twoSeated();
    onJoin(r, "cC", hello("c"));
    const fx = act(r, "cC", { type: "pass", side: 0 });
    expect(errors(fx)[0].code).toBe("not-seated");
    expect(r.log).toHaveLength(0);
  });

  it("refuses acting as the other side", () => {
    const r = twoSeated();
    const fx = act(r, "cA", { type: "pass", side: 1 });
    expect(errors(fx)[0].code).toBe("rejected");
    expect(r.log).toHaveLength(0);
  });

  it("drops a duplicate action sent before the first echoed", () => {
    const r = twoSeated();
    const move: Action = { type: "move", side: 0, to: { q: 0, r: 0 } };
    onAct(r, "cA", { t: "act", action: move, at: 0 });
    // Impatient second click, sent while the first was still in flight.
    const fx = onAct(r, "cA", { t: "act", action: move, at: 0 });
    expect(errors(fx)[0].code).toBe("stale");
    expect(r.log).toHaveLength(1);
  });
});

describe("rematch", () => {
  it("clears the log and reseeds for everyone", () => {
    const r = twoSeated();
    act(r, "cA", { type: "commit", side: 0, cards: [0, 1] });
    const fx = onRematch(r, "cA", "m2", 1234);
    expect(broadcasts(fx)).toEqual([{ t: "reset", matchId: "m2", seed: 1234 }]);
    expect(r.log).toHaveLength(0);
    expect(r.holds).toEqual([null, null]);
    expect(foldLog(r.seed, r.log).round).toBe(createDuel({ seed: 1234 }).round);
  });

  it("is not a spectator's to call", () => {
    const r = twoSeated();
    onJoin(r, "cC", hello("c"));
    expect(errors(onRematch(r, "cC", "m2", 1)).map((e) => e.code)).toEqual(["not-seated"]);
  });
});
