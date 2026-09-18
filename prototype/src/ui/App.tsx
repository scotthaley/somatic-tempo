import { useState } from "react";
import { POOL_PICKS, baseDeck } from "../data/decks";
import { randomSeed } from "../engine/rng";
import type { Side } from "../engine/state";
import { Duel } from "./Duel";

type Screen = { kind: "menu" } | { kind: "duel"; human: Side; seed: number };

function deckSummary(cls: "Wizard" | "Barbarian") {
  const counts = new Map<string, number>();
  for (const c of baseDeck(cls)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const base = [...counts].map(([c, n]) => (n > 1 ? `${c} ×${n}` : c)).join(" · ");
  return `${base} · +${POOL_PICKS} random pool cards`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const start = (human: Side) => setScreen({ kind: "duel", human, seed: randomSeed() });

  if (screen.kind === "duel") {
    return (
      <Duel
        key={screen.seed}
        human={screen.human}
        seed={screen.seed}
        onExit={() => setScreen({ kind: "menu" })}
        onRematch={() => start(screen.human)}
        onSwap={() => start(screen.human === 0 ? 1 : 0)}
      />
    );
  }

  return (
    <div className="menu">
      <h1>Somatic Tempo</h1>
      <p className="subtitle">Duel prototype · Wizard vs Barbarian</p>
      <div className="choices">
        <button className="choice wizard" onClick={() => start(0)}>
          <span className="choice-label">Play</span>
          <h2>Wizard</h2>
          <p>Rooted while dangerous, mobile while harmless.</p>
          <small>{deckSummary("Wizard")}</small>
        </button>
        <button className="choice barbarian" onClick={() => start(1)}>
          <span className="choice-label">Play</span>
          <h2>Barbarian</h2>
          <p>Moves by attacking. Every defensive card plants you.</p>
          <small>{deckSummary("Barbarian")}</small>
        </button>
      </div>
      <details className="rules">
        <summary>How a round works</summary>
        <ol>
          <li>Draw to 5. Secretly commit exactly 2 cards.</li>
          <li>
            Lower total <b>speed</b> acts first. You only learn whether you're 1st or 2nd, never the
            totals. Ties are a coin flip.
          </li>
          <li>
            On your resolution, play your two cards in either order. Your two cards' <b>movement</b>{" "}
            is a budget you can spend before, between, or after them.
          </li>
          <li>
            Attacks are melee (distance 1) unless they show a range. Out of reach when played → the
            card is lost. Ranged attacks at distance 1 deal −2.
          </li>
          <li>
            Statuses decay at end of round only if they were present at its start. Fresh stacks are
            solid, aged (expiring) stacks are outlined.
          </li>
          <li>Reduce the opponent to 0 vitality. After 15 rounds, higher vitality wins.</li>
        </ol>
      </details>
    </div>
  );
}
