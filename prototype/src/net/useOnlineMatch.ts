import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import { createDuel } from "../engine/rules";
import type { Action, DuelState, Side } from "../engine/state";
import type { Match, MatchStatus } from "../ui/match";
import { safeApply } from "../ui/match";
import type { ClientMessage, ServerMessage } from "./protocol";

const PARTY = "duel-room";
const HOST = import.meta.env.VITE_PARTY_HOST || "localhost:8787";

/** Stable across reloads, so refreshing reclaims the same side. */
function clientId(): string {
  const KEY = "somatic-tempo.clientId";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const made = crypto.randomUUID();
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    return crypto.randomUUID(); // private browsing: a new seat each reload
  }
}

interface Net {
  matchId: string;
  seed: number;
  side: Side | null;
  seated: [boolean, boolean];
  s: DuelState;
  /** How many actions of the log we have applied. */
  applied: number;
}

/**
 * A duel against another browser, relayed through a room.
 *
 * State only ever advances on an echo from the room, never optimistically.
 * That is not merely simpler: our own commit must not take effect until the
 * opponent's arrives, so an optimistic client would have to roll back. Every
 * client folds the identical ordered log, so they cannot diverge.
 */
export function useOnlineMatch({ room, want }: { room: string; want: Side }): Match | null {
  const [net, setNet] = useState<Net | null>(null);
  const [status, setStatus] = useState<MatchStatus>("connecting");
  const [pendingCommit, setPendingCommit] = useState(false);
  const [opponentCommitted, setOpponentCommitted] = useState(false);
  const socket = useRef<PartySocket | null>(null);
  /** Distinguishes "nobody has joined yet" from "they were here and left". */
  const everPaired = useRef(false);

  useEffect(() => {
    const ws = new PartySocket({ host: HOST, party: PARTY, room });
    socket.current = ws;

    const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));

    const onOpen = () => {
      setStatus("connecting");
      send({ t: "hello", clientId: clientId(), want });
    };

    const onMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      switch (msg.t) {
        case "welcome": {
          everPaired.current = false;
          setPendingCommit(false);
          setOpponentCommitted(false);
          setNet({
            matchId: msg.matchId,
            seed: msg.seed,
            side: msg.side,
            seated: msg.seated,
            s: msg.log.reduce(safeApply, createDuel({ seed: msg.seed })),
            applied: msg.log.length,
          });
          break;
        }
        case "actions": {
          setNet((prev) => {
            if (!prev) return prev;
            // A gap means we missed a broadcast; reconnect for a fresh welcome.
            if (msg.from !== prev.applied) {
              ws.reconnect();
              return prev;
            }
            return {
              ...prev,
              s: msg.actions.reduce(safeApply, prev.s),
              applied: prev.applied + msg.actions.length,
            };
          });
          // Commits are only ever released as a pair, so both flags clear here.
          if (msg.actions.some((a) => a.type === "commit")) {
            setPendingCommit(false);
            setOpponentCommitted(false);
          }
          break;
        }
        case "committed":
          setOpponentCommitted(true);
          break;
        case "seated":
          setNet((prev) => (prev ? { ...prev, seated: msg.seated } : prev));
          break;
        case "reset":
          setPendingCommit(false);
          setOpponentCommitted(false);
          setNet((prev) =>
            prev
              ? {
                  ...prev,
                  matchId: msg.matchId,
                  seed: msg.seed,
                  s: createDuel({ seed: msg.seed }),
                  applied: 0,
                }
              : prev,
          );
          break;
        case "error":
          // "stale" means our view of the log was behind; the echo we are
          // missing will not arrive on its own, so resync.
          console.warn("Room rejected a message:", msg.code, msg.message);
          if (msg.code === "stale") ws.reconnect();
          if (msg.code === "rejected") setPendingCommit(false);
          break;
      }
    };

    const onClose = () => setStatus("disconnected");

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    return () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
      ws.close();
      socket.current = null;
    };
  }, [room, want]);

  // Connection status is derived, so it cannot drift from who is actually here.
  useEffect(() => {
    if (!net) return;
    const both = net.seated[0] && net.seated[1];
    if (both) everPaired.current = true;
    // A spectator is never waiting on anyone.
    if (both || net.side === null) setStatus("playing");
    else setStatus(everPaired.current ? "opponent-left" : "waiting");
  }, [net?.seated[0], net?.seated[1], net?.side]);

  const dispatch = useCallback(
    (action: Action) => {
      const ws = socket.current;
      if (!ws || !net || net.side === null || action.side !== net.side) return;
      // Don't put anything on the wire the engine would refuse anyway.
      if (safeApply(net.s, action) === net.s) return;
      if (action.type === "commit") setPendingCommit(true);
      ws.send(JSON.stringify({ t: "act", action, at: net.applied } satisfies ClientMessage));
    },
    [net],
  );

  const onRematch = useCallback(() => {
    socket.current?.send(JSON.stringify({ t: "rematch" } satisfies ClientMessage));
  }, []);

  if (!net) return null;

  return {
    matchId: net.matchId,
    s: net.s,
    dispatch,
    human: net.side ?? 0,
    spectating: net.side === null,
    status,
    pendingCommit,
    opponentCommitted,
    shareUrl: `${location.origin}${location.pathname}?room=${room}`,
    onRematch,
  };
}
