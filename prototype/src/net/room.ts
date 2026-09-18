import type { Action, Side } from "../engine/state";
import type { ClientMessage, ServerMessage } from "./protocol";

export interface Seat {
  clientId: string;
  /** null while that player is disconnected; the seat stays reserved. */
  connId: string | null;
}

export interface RoomState {
  matchId: string;
  seed: number;
  log: Action[];
  seats: [Seat | null, Seat | null];
  /**
   * Commits parked until both sides have sent one. This is the only place the
   * relay knows anything about the game: releasing a commit on arrival would
   * show the second player what the first committed before they choose.
   */
  holds: [Action | null, Action | null];
}

export type Effect =
  | { to: "conn"; connId: string; msg: ServerMessage }
  | { to: "all"; msg: ServerMessage }
  | { to: "others"; connId: string; msg: ServerMessage };

export const createRoom = (matchId: string, seed: number): RoomState => ({
  matchId,
  seed,
  log: [],
  seats: [null, null],
  holds: [null, null],
});

export const sideOf = (r: RoomState, connId: string): Side | null => {
  if (r.seats[0]?.connId === connId) return 0;
  if (r.seats[1]?.connId === connId) return 1;
  return null;
};

const seated = (r: RoomState): [boolean, boolean] => [
  r.seats[0]?.connId != null,
  r.seats[1]?.connId != null,
];

const welcome = (r: RoomState, connId: string, side: Side | null): Effect => ({
  to: "conn",
  connId,
  msg: { t: "welcome", matchId: r.matchId, seed: r.seed, side, log: r.log, seated: seated(r) },
});

/**
 * Seat priority: reclaim your own seat (so a refresh keeps your side), then an
 * unclaimed seat, then a seat whose player has disconnected. Otherwise you
 * spectate. A requested side is honoured only if it is free by the same rules.
 */
function claim(r: RoomState, clientId: string, want?: Side): Side | null {
  const order: Side[] = want === 1 ? [1, 0] : [0, 1];

  for (const side of order) if (r.seats[side]?.clientId === clientId) return side;
  for (const side of order) if (r.seats[side] === null) return side;
  for (const side of order) if (r.seats[side]?.connId === null) return side;
  return null;
}

export function onJoin(
  r: RoomState,
  connId: string,
  hello: Extract<ClientMessage, { t: "hello" }>,
): Effect[] {
  const side = claim(r, hello.clientId, hello.want);
  if (side !== null) r.seats[side] = { clientId: hello.clientId, connId };
  return [welcome(r, connId, side), { to: "others", connId, msg: { t: "seated", seated: seated(r) } }];
}

export function onLeave(r: RoomState, connId: string): Effect[] {
  const side = sideOf(r, connId);
  if (side === null) return [];
  // Keep the seat reserved for this clientId so a refresh reclaims it.
  r.seats[side] = { clientId: r.seats[side]!.clientId, connId: null };
  return [{ to: "all", msg: { t: "seated", seated: seated(r) } }];
}

const reject = (connId: string, code: "not-seated" | "rejected" | "stale", message: string): Effect[] => [
  { to: "conn", connId, msg: { t: "error", code, message } },
];

export function onAct(
  r: RoomState,
  connId: string,
  msg: Extract<ClientMessage, { t: "act" }>,
): Effect[] {
  const side = sideOf(r, connId);
  if (side === null) return reject(connId, "not-seated", "Spectators cannot act.");
  if (msg.action.side !== side) return reject(connId, "rejected", "You may only act as your own side.");

  if (msg.action.type === "commit") {
    // A held commit is not in the log yet, so `at` cannot be checked here;
    // holding at most one commit per side is what makes this idempotent.
    if (r.holds[side]) return [];
    r.holds[side] = msg.action;

    const [a, b] = r.holds;
    if (!a || !b) return [{ to: "others", connId, msg: { t: "committed", side } }];

    // Always side 0 then side 1. Arrival order would give the two clients
    // differently ordered event logs and turn records.
    const from = r.log.length;
    r.log.push(a, b);
    r.holds = [null, null];
    return [{ to: "all", msg: { t: "actions", from, actions: [a, b] } }];
  }

  // Guards against a double-click landing as two moves while the first is
  // still in flight: the client only ever expects its action at the log end.
  if (msg.at !== r.log.length) return reject(connId, "stale", "Action was out of date.");

  const from = r.log.length;
  r.log.push(msg.action);
  return [{ to: "all", msg: { t: "actions", from, actions: [msg.action] } }];
}

/** First click wins; the other client follows. */
export function onRematch(r: RoomState, connId: string, matchId: string, seed: number): Effect[] {
  if (sideOf(r, connId) === null) return reject(connId, "not-seated", "Spectators cannot restart.");
  r.matchId = matchId;
  r.seed = seed;
  r.log = [];
  r.holds = [null, null];
  return [{ to: "all", msg: { t: "reset", matchId, seed } }];
}

export function onMessage(
  r: RoomState,
  connId: string,
  msg: ClientMessage,
  mint: () => { matchId: string; seed: number },
): Effect[] {
  switch (msg.t) {
    case "hello":
      return onJoin(r, connId, msg);
    case "act":
      return onAct(r, connId, msg);
    case "rematch": {
      const next = mint();
      return onRematch(r, connId, next.matchId, next.seed);
    }
  }
}
