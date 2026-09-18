import { DuelState, MAX_VITALITY, STATUS_INFO, Side, Stack, StatusName } from "../engine/state";

function StatusChips({ stacks }: { stacks: Stack[] }) {
  const groups = new Map<string, { status: StatusName; value?: number; fresh: number; aged: number }>();
  for (const st of stacks) {
    const key = `${st.status}|${st.value ?? ""}`;
    const g = groups.get(key) ?? { status: st.status, value: st.value, fresh: 0, aged: 0 };
    if (st.aged) g.aged += st.amount;
    else g.fresh += st.amount;
    groups.set(key, g);
  }
  if (groups.size === 0) return <div className="chips empty">No statuses</div>;
  return (
    <div className="chips">
      {[...groups.values()].flatMap((g) => {
        const label = `${g.status}${g.value !== undefined ? ` →${g.value}` : ""}`;
        const chip = (kind: "fresh" | "aged", n: number) => (
          <span
            key={`${label}-${kind}`}
            className={`chip ${kind} status-${g.status.toLowerCase()}`}
            title={`${STATUS_INFO[g.status]}\n${
              kind === "aged"
                ? "Aged: expires at the end of this round."
                : "Fresh: survives this round's end, expires next round."
            }`}
          >
            {label} {n}
          </span>
        );
        return [g.fresh > 0 && chip("fresh", g.fresh), g.aged > 0 && chip("aged", g.aged)].filter(Boolean);
      })}
    </div>
  );
}

export function FighterPanel({ s, side, human }: { s: DuelState; side: Side; human: Side }) {
  const f = s.fighters[side];
  const pct = (f.vitality / MAX_VITALITY) * 100;
  const order = s.order ? (s.order[0] === side ? "1st" : "2nd") : null;
  const resolving = s.resolving?.side === side ? s.resolving : null;
  return (
    <div className={`panel fighter ${f.cls.toLowerCase()} ${resolving ? "active" : ""}`}>
      <div className="panel-head">
        <span className="swatch" />
        <b>{f.cls}</b>
        <span className="who">{side === human ? "You" : "AI"}</span>
        {order && <span className="order-pill">{order}</span>}
      </div>
      <div className="vitality">
        <div className="vitality-bar">
          <div className="vitality-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>
          {f.vitality}/{MAX_VITALITY}
        </span>
      </div>
      <StatusChips stacks={f.stacks} />
      <div className="counts">
        Deck {f.deck.length} · Hand {f.hand.length} · Discard {f.discard.length}
      </div>
      {resolving && (
        <div className="moves">
          Movement left: <b>{resolving.budget - resolving.spent}</b> / {resolving.budget}
        </div>
      )}
    </div>
  );
}
