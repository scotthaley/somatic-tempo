import { describe, expect, it } from "vitest";
import { chooseCommit } from "../ai/commit";
import { planResolution } from "../ai/plan";
import { createDuel } from "../engine/rules";
import { makeRng } from "../engine/rng";
import type { Action, DuelState, Side } from "../engine/state";
import { foldLog, safeApply } from "../ui/match";
import { createRoom, onAct, onJoin, type Effect } from "./room";

/**
 * Plays a whole duel through the relay: the AI supplies both sides' actions,
 * the room orders them, and two independent clients rebuild state from nothing
 * but the seed and the broadcast log — which is exactly what two browsers do.
 */
function playThroughRoom(seed: number) {
  const rand = makeRng(seed ^ 0x5bd1);
  const r = createRoom("m", seed);
  onJoin(r, "cA", { t: "hello", clientId: "a", want: 0 });
  onJoin(r, "cB", { t: "hello", clientId: "b", want: 1 });

  const conn: Record<Side, string> = { 0: "cA", 1: "cB" };
  const clients: DuelState[] = [createDuel({ seed }), createDuel({ seed })];
  const snapshots: DuelState[] = [];

  const deliver = (fx: Effect[]) => {
    for (const e of fx) {
      if (e.to !== "all" || e.msg.t !== "actions") continue;
      const batch = e.msg.actions;
      for (let i = 0; i < clients.length; i++) clients[i] = batch.reduce(safeApply, clients[i]);
    }
  };

  const send = (side: Side, action: Action) =>
    deliver(onAct(r, conn[side], { t: "act", action, at: r.log.length }));

  // The driver only ever reads what a client can see.
  let guard = 0;
  while (clients[0].phase !== "over" && guard++ < 400) {
    const s = clients[0];
    if (s.phase === "commit") {
      for (const side of [0, 1] as Side[]) {
        if (!s.committed[side]) send(side, { type: "commit", side, cards: chooseCommit(s, side, { rand }) });
      }
      snapshots.push(clients[0]);
    } else {
      const side = s.resolving!.side;
      if (s.resolving!.done[side]) break;
      for (const a of planResolution(s, side).actions) send(side, a);
    }
  }

  return { room: r, clients, snapshots, guard };
}

describe("relay replay", () => {
  it.each([7, 99, 4242])("two clients converge over a whole duel (seed %i)", (seed) => {
    const { room, clients, snapshots } = playThroughRoom(seed);

    expect(clients[0].phase).toBe("over");
    expect(snapshots.length).toBeGreaterThan(2);
    // Independently folded, byte-identical — no desync anywhere in the match.
    expect(clients[1]).toEqual(clients[0]);
    // And a third party rebuilding from seed + log lands in the same place.
    expect(foldLog(seed, room.log)).toEqual(clients[0]);
  });

  it("a late joiner rebuilds the live state from the log", () => {
    const { room, clients } = playThroughRoom(99);
    const mid = Math.floor(room.log.length / 2);

    const incumbent = room.log.slice(0, mid).reduce(safeApply, createDuel({ seed: 99 }));
    const latecomer = foldLog(99, room.log.slice(0, mid));
    expect(latecomer).toEqual(incumbent);

    // Catching up on the rest converges on the finished match.
    expect(room.log.slice(mid).reduce(safeApply, latecomer)).toEqual(clients[0]);
  });

  it("the log is the whole match: nothing leaks in from outside it", () => {
    const { room, clients } = playThroughRoom(7);
    // Replaying twice from scratch must not drift (catches any hidden global
    // RNG or module-level state the engine might grow later).
    expect(foldLog(7, room.log)).toEqual(foldLog(7, room.log));
    expect(foldLog(7, room.log).winner).toBe(clients[0].winner);
  });
});
