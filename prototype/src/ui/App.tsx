import { useState } from "react";
import { useOnlineMatch } from "../net/useOnlineMatch";
import { normalizeRoomCode, randomRoomCode } from "../net/protocol";
import { POOL_PICKS, baseDeck } from "../data/decks";
import { randomSeed } from "../engine/rng";
import type { Side } from "../engine/state";
import { Duel } from "./Duel";
import { useSoloMatch } from "./useSoloMatch";

type Screen =
  | { kind: "menu" }
  | { kind: "duel"; human: Side; seed: number }
  | { kind: "online"; room: string; want: Side };

/** A room code in the URL is an invitation: join it straight away. */
function initialScreen(): Screen {
  const params = new URLSearchParams(location.search);
  const room = params.get("room");
  const code = room ? normalizeRoomCode(room) : null;
  if (!code) return { kind: "menu" };
  const want = params.get("side") === "1" ? 1 : 0;
  return { kind: "online", room: code, want };
}

function deckSummary(cls: "Wizard" | "Barbarian") {
  const counts = new Map<string, number>();
  for (const c of baseDeck(cls)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const base = [...counts].map(([c, n]) => (n > 1 ? `${c} ×${n}` : c)).join(" · ");
  return `${base} · +${POOL_PICKS} random pool cards`;
}

function SoloDuel(props: {
  human: Side;
  seed: number;
  onExit: () => void;
  onRematch: () => void;
  onSwap: () => void;
}) {
  const match = useSoloMatch({
    human: props.human,
    seed: props.seed,
    onRematch: props.onRematch,
  });
  return (
    <Duel match={match} onExit={props.onExit} onRematch={match.onRematch} onSwap={props.onSwap} />
  );
}

function OnlineDuel(props: { room: string; want: Side; onExit: () => void }) {
  const match = useOnlineMatch({ room: props.room, want: props.want });
  if (!match) {
    return (
      <div className="menu">
        <h1>Somatic Tempo</h1>
        <p className="subtitle">Joining room {props.room}…</p>
        <button className="ghost" onClick={props.onExit}>
          ← Menu
        </button>
      </div>
    );
  }
  return <Duel match={match} onExit={props.onExit} onRematch={match.onRematch} onSwap={null} />;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [joinCode, setJoinCode] = useState("");
  const start = (human: Side) => setScreen({ kind: "duel", human, seed: randomSeed() });

  const goOnline = (room: string, want: Side) => {
    // Put the code in the URL so it is the thing you share, and so a refresh
    // rejoins rather than dumping you back on the menu.
    const url = new URL(location.href);
    url.searchParams.set("room", room);
    history.replaceState(null, "", url);
    setScreen({ kind: "online", room, want });
  };

  const leave = () => {
    const url = new URL(location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("side");
    history.replaceState(null, "", url);
    setScreen({ kind: "menu" });
  };

  if (screen.kind === "online") {
    return <OnlineDuel room={screen.room} want={screen.want} onExit={leave} />;
  }

  if (screen.kind === "duel") {
    return (
      <SoloDuel
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
      <div className="online">
        <button className="primary" onClick={() => goOnline(randomRoomCode(), 0)}>
          Play a friend
        </button>
        <span className="online-or">or join a room</span>
        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            const code = normalizeRoomCode(joinCode);
            if (code) goOnline(code, 1);
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="teal-otter"
            aria-label="Room code"
          />
          <button type="submit" disabled={!normalizeRoomCode(joinCode)}>
            Join
          </button>
        </form>
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
