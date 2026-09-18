import { apply, createDuel } from "../engine/rules";
import type { Action, DuelState, Side } from "../engine/state";

export type MatchStatus =
  | "local"
  | "connecting"
  | "waiting"
  | "playing"
  | "opponent-left"
  | "disconnected";

/**
 * What a duel needs to be played, however the opponent's actions arrive.
 * `useSoloMatch` drives it from the local AI; `useOnlineMatch` from a relay
 * room. `Duel` renders one of these and never knows which it got.
 */
export interface Match {
  /** Changes when a rematch starts; used to remount and reset selection. */
  matchId: string;
  s: DuelState;
  dispatch(a: Action): void;
  /** The side this client controls, and the side the board is oriented for. */
  human: Side;
  /** A spectator watches the log but cannot act. */
  spectating: boolean;
  status: MatchStatus;
  /** Our commit is sent but not yet revealed: hide the hand, disable Commit. */
  pendingCommit: boolean;
  /** The opponent has locked in. Carries no card information. */
  opponentCommitted: boolean;
  /** Link to hand to an opponent; null in solo. */
  shareUrl: string | null;
}

/**
 * Apply an action, ignoring illegal ones. Every client runs this over the same
 * ordered log, so a rejected action is rejected identically everywhere and the
 * clients stay in lockstep.
 */
export function safeApply(prev: DuelState, action: Action): DuelState {
  try {
    return apply(prev, action);
  } catch (err) {
    console.warn("Rejected action", action, err);
    return prev;
  }
}

/** Rebuild a duel from its seed and the ordered actions taken so far. */
export function foldLog(seed: number, log: Action[]): DuelState {
  return log.reduce(safeApply, createDuel({ seed }));
}
