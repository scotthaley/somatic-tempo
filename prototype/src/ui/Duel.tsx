import { useEffect, useMemo, useRef, useState } from "react";
import { aiCommit, aiResolve } from "../ai/client";
import { CARDS, isTargeted, reachOf } from "../data/cards";
import { apply, createDuel, distance, reachableNow } from "../engine/rules";
import { Action, DuelState, Side, other } from "../engine/state";
import { Board } from "./Board";
import { CardBack, CardView } from "./CardView";
import { EndScreen } from "./EndScreen";
import { FighterPanel } from "./FighterPanel";

interface Props {
  human: Side;
  seed: number;
  onExit: () => void;
  onRematch: () => void;
  onSwap: () => void;
}

const AI_COMMIT_DELAY = 500;
const AI_FIRST_ACTION_DELAY = 700;
const AI_ACTION_INTERVAL = 750;

function safeApply(prev: DuelState, action: Action): DuelState {
  try {
    return apply(prev, action);
  } catch (err) {
    console.warn("Rejected action", action, err);
    return prev;
  }
}

export function Duel({ human, seed, onExit, onRematch, onSwap }: Props) {
  const [s, setS] = useState(() => createDuel({ seed }));
  const [selected, setSelected] = useState<number[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const ai = other(human);
  const dispatch = (a: Action) => setS((prev) => safeApply(prev, a));

  useEffect(() => setSelected([]), [s.round]);

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

  // AI resolution plays out one action at a time so it can be followed on the board.
  const aiResolveRound = s.phase === "resolve" && s.resolving?.side === ai ? s.round : null;
  useEffect(() => {
    if (aiResolveRound === null) return;
    let live = true;
    const timers: number[] = [];
    aiResolve(s, ai)
      .then((actions) => {
        actions.forEach((a, i) => {
          timers.push(
            window.setTimeout(() => {
              if (live) setS((prev) => safeApply(prev, a));
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
  }, [aiResolveRound]);

  const me = s.fighters[human];
  const myTurn = s.phase === "resolve" && s.resolving?.side === human;
  const reach = myTurn ? reachableNow(s) : null;
  const myCommit = s.committed[human];
  const myOrder = s.order ? (s.order[0] === human ? "1st" : "2nd") : null;
  const myResolutionDone =
    s.phase !== "commit" && s.order !== null && (s.order[0] === human ? s.resolving?.side !== human : false);

  const preview = hovered && isTargeted(CARDS[hovered]) ? reachOf(CARDS[hovered]) : null;

  const toggle = (i: number) =>
    setSelected((sel) => (sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].slice(-2)));

  // Indices refer to the commit-phase hand; ignore any that no longer exist.
  const selectedNames = selected.filter((i) => i < me.hand.length).map((i) => me.hand[i]);
  const selSpeed = selectedNames.reduce((n, c) => n + CARDS[c].speed, 0);
  const selMove = selectedNames.reduce((n, c) => n + CARDS[c].movement, 0);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [s.events.length]);

  const banner = useMemo(() => {
    if (s.phase === "over") return "Duel over";
    if (s.phase === "commit") return myCommit ? "Waiting for the opponent to commit…" : "Commit two cards";
    if (myTurn) return `You act ${myOrder} — resolve your cards`;
    return `Opponent acts ${myOrder === "1st" ? "2nd" : "1st"} — resolving…`;
  }, [s.phase, myCommit, myTurn, myOrder]);

  const oppSlots = () => {
    const played = s.playedThisRound[ai];
    if (!s.committed[ai]) return <div className="opp-waiting">choosing…</div>;
    return [0, 1].map((i) =>
      played[i] ? (
        <CardView key={i} name={played[i].name} lost={played[i].lost} compact />
      ) : (
        <CardBack key={i} />
      ),
    );
  };

  return (
    <div className="duel">
      <header className="topbar">
        <button className="ghost" onClick={onExit}>
          ← Menu
        </button>
        <div className="round">
          Round <b>{s.round}</b> / {s.maxRounds}
        </div>
        <div className={`banner ${myTurn ? "yours" : ""}`}>{banner}</div>
        <div className="distance">
          Distance <b>{distance(s)}</b>
        </div>
      </header>

      <aside className="left">
        <FighterPanel s={s} side={ai} human={human} />
        <div className="panel opp-commit">
          <div className="panel-title">Opponent's cards this round</div>
          <div className="opp-cards">{oppSlots()}</div>
        </div>
        <FighterPanel s={s} side={human} human={human} />
      </aside>

      <main className="center">
        <Board
          s={s}
          human={human}
          reach={reach}
          preview={preview}
          onHex={(to) => dispatch({ type: "move", side: human, to })}
        />
        {myTurn && (
          <div className="board-hint">
            Click a highlighted hex to move (numbers are cost). Hover a card to see its reach.
          </div>
        )}
      </main>

      <aside className="right panel log" ref={logRef}>
        {s.events.map((e, i) =>
          e.kind === "round" ? (
            <div key={i} className="log-round">
              {e.text}
            </div>
          ) : (
            <div
              key={i}
              className={`log-line ${e.side === null ? "neutral" : s.fighters[e.side].cls.toLowerCase()} kind-${e.kind}`}
            >
              {e.text}
            </div>
          ),
        )}
      </aside>

      <footer className="hand-bar">
        {s.phase === "commit" && !myCommit && (
          <>
            <div className="cards">
              {me.hand.map((name, i) => (
                <CardView
                  key={`${i}-${name}`}
                  name={name}
                  selected={selected.includes(i)}
                  onClick={() => toggle(i)}
                  onHover={(h) => setHovered(h ? name : null)}
                />
              ))}
            </div>
            <div className="controls">
              <div className="summary">
                {selected.length === 2 ? (
                  <>
                    Speed <b>{selSpeed}</b> · Move <b>{selMove}</b>
                  </>
                ) : (
                  `Select ${2 - selected.length} more`
                )}
              </div>
              <button
                className="primary"
                disabled={selected.length !== 2}
                onClick={() => {
                  dispatch({ type: "commit", side: human, cards: [selected[0], selected[1]] });
                  setSelected([]);
                }}
              >
                Commit
              </button>
            </div>
          </>
        )}

        {s.phase !== "commit" || myCommit ? (
          myCommit && s.phase !== "over" ? (
            <>
              <div className="cards">
                {myCommit.map((name, i) => {
                  const played = myTurn ? s.resolving!.played[i] : myResolutionDone;
                  const lostEntry = s.playedThisRound[human].find((p) => p.name === name && p.lost);
                  return (
                    <CardView
                      key={i}
                      name={name}
                      dimmed={played || (!myTurn && s.phase === "resolve")}
                      lost={played && !!lostEntry}
                      onHover={(h) => setHovered(h ? name : null)}
                    >
                      {myTurn && !played && (
                        <button
                          className="primary small"
                          onClick={() => {
                            setHovered(null);
                            dispatch({ type: "play", side: human, index: i as 0 | 1 });
                          }}
                        >
                          Play
                        </button>
                      )}
                    </CardView>
                  );
                })}
                {me.hand.length > 0 && (
                  <div className="rest">
                    <div className="rest-label">Rest of hand (discarded at end of round)</div>
                    <div className="rest-cards">
                      {me.hand.map((name, i) => (
                        <CardView key={i} name={name} compact dimmed />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="controls">
                {myTurn ? (
                  <>
                    <div className="summary">
                      Movement left <b>{s.resolving!.budget - s.resolving!.spent}</b>
                    </div>
                    <button
                      className={s.resolving!.played.every(Boolean) ? "primary" : ""}
                      onClick={() => dispatch({ type: "end", side: human })}
                    >
                      {s.resolving!.played.every(Boolean)
                        ? "End turn"
                        : `End turn (forfeit ${s.resolving!.played.filter((p) => !p).length})`}
                    </button>
                  </>
                ) : (
                  <div className="summary muted">{banner}</div>
                )}
              </div>
            </>
          ) : null
        ) : null}
      </footer>

      {s.phase === "over" && (
        <EndScreen s={s} human={human} onRematch={onRematch} onSwap={onSwap} onExit={onExit} />
      )}
    </div>
  );
}
