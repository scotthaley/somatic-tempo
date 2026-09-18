import { useEffect, useMemo, useRef, useState } from "react";
import { CARDS, isTargeted, reachOf } from "../data/cards";
import { distance, reachableNow } from "../engine/rules";
import { other } from "../engine/state";
import { Board } from "./Board";
import { CardBack, CardView } from "./CardView";
import { EndScreen } from "./EndScreen";
import { FighterPanel } from "./FighterPanel";
import type { Match } from "./match";

interface Props {
  match: Match;
  onExit: () => void;
  onRematch: () => void;
  onSwap: (() => void) | null;
}

export function Duel({ match, onExit, onRematch, onSwap }: Props) {
  const { s, human, dispatch, spectating, pendingCommit, opponentCommitted } = match;
  const [selected, setSelected] = useState<number[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ai = other(human);
  const opponentLabel = match.shareUrl ? "Them" : "AI";

  useEffect(() => setSelected([]), [s.round, match.matchId]);

  const me = s.fighters[human];
  const myR = s.resolving;
  const myTurn = !spectating && s.phase === "resolve" && myR?.side === human && !myR.done[human];
  const reach = myTurn ? reachableNow(s) : null;
  const myCommit = s.committed[human];
  const myOrder = s.order ? (s.order[0] === human ? "1st" : "2nd") : null;
  const myResolutionDone = myR?.done[human] ?? false;

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
    if (match.status === "connecting") return "Connecting…";
    if (match.status === "disconnected") return "Disconnected — reconnecting…";
    if (match.status === "waiting") return "Waiting for an opponent to join…";
    if (match.status === "opponent-left") return "The opponent left — waiting for them to come back…";
    if (s.phase === "over") return "Duel over";
    if (spectating) return "Spectating";
    if (s.phase === "commit")
      return myCommit || pendingCommit ? "Waiting for the opponent to commit…" : "Commit two cards";
    if (myTurn) return `Your step — you act ${myOrder} this round`;
    if (myResolutionDone) return "You're finished — the opponent is still resolving…";
    return "Opponent's step…";
  }, [s.phase, myCommit, myTurn, myOrder, myResolutionDone, match.status, pendingCommit, spectating]);

  const oppSlots = () => {
    const played = s.playedThisRound[ai];
    if (!s.committed[ai])
      return (
        <div className="opp-waiting">{opponentCommitted ? "locked in" : "choosing…"}</div>
      );
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
        <FighterPanel s={s} side={ai} human={human} opponentLabel={opponentLabel} />
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
          opponentLabel={opponentLabel}
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
        {s.phase === "commit" && !myCommit && !pendingCommit && !spectating && (
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
                  const played = myR ? myR.played[human][i] : false;
                  const lostEntry = s.playedThisRound[human].find((p) => p.name === name && p.lost);
                  return (
                    <CardView
                      key={i}
                      name={name}
                      dimmed={played || (!myTurn && s.phase === "resolve")}
                      lost={played && !!lostEntry}
                      onHover={(h) => setHovered(h ? name : null)}
                    >
                      {myTurn && !played && !myR!.cardThisStep && (
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
                    <div className="rest-label">Rest of hand (kept — you draw back up to 5)</div>
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
                  (() => {
                    const left = myR!.played[human].filter((p) => !p).length;
                    return (
                      <>
                        <div className="summary">
                          Movement left <b>{myR!.budget[human] - myR!.spent[human]}</b>
                          {" · "}
                          Step <b>{myR!.steps[human] + 1}</b> / 2
                        </div>
                        <button className="primary" onClick={() => dispatch({ type: "pass", side: human })}>
                          {left === 0 ? "End turn" : "End step"}
                        </button>
                        {left > 0 && (
                          <button onClick={() => dispatch({ type: "end", side: human })}>
                            Forfeit rest ({left})
                          </button>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <div className="summary muted">{banner}</div>
                )}
              </div>
            </>
          ) : null
        ) : null}
      </footer>

      {match.status === "waiting" && match.shareUrl && (
        <div className="overlay">
          <div className="modal">
            <h2>Waiting for an opponent</h2>
            <p className="muted">Send them this link. The duel starts when they join.</p>
            <div className="share">
              <div className="share-label">Invite link</div>
              <div className="share-row">
                <input readOnly value={match.shareUrl} onFocus={(e) => e.currentTarget.select()} />
                <button
                  className="primary"
                  onClick={() => {
                    navigator.clipboard?.writeText(match.shareUrl!).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button className="ghost" onClick={onExit}>
                ← Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {s.phase === "over" && (
        <EndScreen s={s} human={human} onRematch={onRematch} onSwap={onSwap} onExit={onExit} />
      )}
    </div>
  );
}
