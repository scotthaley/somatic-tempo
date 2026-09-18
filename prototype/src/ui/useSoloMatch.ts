import { useEffect, useState } from "react";
import { aiCommit, aiResolve } from "../ai/client";
import { createDuel } from "../engine/rules";
import type { Action, Side } from "../engine/state";
import { other } from "../engine/state";
import type { Match } from "./match";
import { safeApply } from "./match";

const AI_COMMIT_DELAY = 500;
const AI_FIRST_ACTION_DELAY = 300;
const AI_ACTION_INTERVAL = 750;

/** A duel against the local search AI. The AI only ever runs from here. */
export function useSoloMatch({ human, seed }: { human: Side; seed: number }): Match {
  const [s, setS] = useState(() => createDuel({ seed }));
  const ai = other(human);
  const dispatch = (a: Action) => setS((prev) => safeApply(prev, a));

  // AI commits as soon as a round opens; it never sees the human's commitment.
  const aiMustCommit = s.phase === "commit" && !s.committed[ai];
  useEffect(() => {
    if (!aiMustCommit) return;
    let live = true;
    const round = s.round;
    const started = performance.now();
    aiCommit(s, ai)
      .then((cards) => {
        const wait = Math.max(0, AI_COMMIT_DELAY - (performance.now() - started));
        setTimeout(() => {
          if (!live) return;
          setS((prev) =>
            prev.round === round && prev.phase === "commit" && !prev.committed[ai]
              ? safeApply(prev, { type: "commit", side: ai, cards })
              : prev,
          );
        }, wait);
      })
      .catch((err) => console.error("AI commit failed", err));
    return () => {
      live = false;
    };
  }, [aiMustCommit, s.round]);

  // The AI plays one mini-turn at a time, one action at a time so it can be
  // followed on the board. Keyed on the baton counter, so it re-runs every time
  // the AI's turn comes back around rather than once per round.
  const aiTurn =
    s.phase === "resolve" && s.resolving?.side === ai && !s.resolving.done[ai]
      ? s.resolving.turn
      : null;
  useEffect(() => {
    if (aiTurn === null) return;
    let live = true;
    const timers: number[] = [];
    aiResolve(s, ai)
      .then((actions) => {
        actions.forEach((a, i) => {
          timers.push(
            window.setTimeout(() => {
              if (!live) return;
              // Drop anything that arrives after the baton has already moved on.
              setS((prev) => (prev.resolving?.turn === aiTurn ? safeApply(prev, a) : prev));
            }, AI_FIRST_ACTION_DELAY + i * AI_ACTION_INTERVAL),
          );
        });
      })
      .catch((err) => {
        console.error("AI resolve failed", err);
        if (live) dispatch({ type: "end", side: ai });
      });
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
  }, [aiTurn]);

  return {
    matchId: String(seed),
    s,
    dispatch,
    human,
    spectating: false,
    status: "local",
    pendingCommit: false,
    opponentCommitted: !!s.committed[ai],
    shareUrl: null,
  };
}
