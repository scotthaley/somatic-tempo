import { useState } from "react";
import type { DuelState, Side } from "../engine/state";

interface Props {
  s: DuelState;
  human: Side;
  onRematch: () => void;
  /** null when switching sides is not ours to choose (online). */
  onSwap: (() => void) | null;
  onExit: () => void;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function EndScreen({ s, human, onRematch, onSwap, onExit }: Props) {
  const [copied, setCopied] = useState(false);
  const m = s.metrics;
  const title = s.winner === "draw" ? "Draw" : s.winner === human ? "Victory" : "Defeat";
  const avgInit = (side: Side) =>
    m.initiative.length ? (m.initiative.reduce((n, i) => n + i[side], 0) / m.initiative.length).toFixed(1) : "–";
  const firsts = (side: Side) => m.first.filter((f) => f === side).length;
  const name = (side: Side) => `${s.fighters[side].cls}${side === human ? " (you)" : ""}`;

  const exportLog = async () => {
    const payload = {
      seed: s.initialSeed,
      human: s.fighters[human].cls,
      winner: s.winner === "draw" ? "draw" : s.fighters[s.winner!].cls,
      rounds: s.round,
      final: s.fighters.map((f) => ({ cls: f.cls, vitality: f.vitality })),
      metrics: m,
      turns: s.turns,
      events: s.events,
    };
    setCopied(await copy(JSON.stringify(payload, null, 2)));
  };

  return (
    <div className="overlay">
      <div className="modal">
        <h2 className={`result ${title.toLowerCase()}`}>{title}</h2>
        <p className="muted">
          {s.round} rounds · {s.fighters[0].cls} {s.fighters[0].vitality} – {s.fighters[1].vitality}{" "}
          {s.fighters[1].cls}
        </p>
        <table className="stats">
          <thead>
            <tr>
              <th />
              <th>{name(0)}</th>
              <th>{name(1)}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Avg initiative total</td>
              <td>{avgInit(0)}</td>
              <td>{avgInit(1)}</td>
            </tr>
            <tr>
              <td>Rounds acting first</td>
              <td>{firsts(0)}</td>
              <td>{firsts(1)}</td>
            </tr>
            <tr>
              <td>Cards lost to reach / played</td>
              <td>
                {m.lostCards[0]} / {m.playedCards[0]}
              </td>
              <td>
                {m.lostCards[1]} / {m.playedCards[1]}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="distance-trace">
          <span className="muted">Distance at round start</span>
          <div>{m.distanceAtStart.join(" → ")}</div>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onRematch}>
            Rematch
          </button>
          {onSwap && <button onClick={onSwap}>Switch class</button>}
          <button onClick={exportLog}>{copied ? "Copied!" : "Copy log JSON"}</button>
          <button className="ghost" onClick={onExit}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
