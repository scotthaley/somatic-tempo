import type { ReactNode } from "react";
import { CARDS, isTargeted } from "../data/cards";

interface Props {
  name: string;
  selected?: boolean;
  dimmed?: boolean;
  lost?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onHover?: (hovering: boolean) => void;
  children?: ReactNode;
}

export function reachLabel(name: string): string {
  const c = CARDS[name];
  if (c.range !== null) return `Range ${c.range}`;
  return isTargeted(c) ? "Melee" : "Self";
}

export function CardView({ name, selected, dimmed, lost, compact, onClick, onHover, children }: Props) {
  const c = CARDS[name];
  const cls = [
    "card",
    c.cls.toLowerCase(),
    selected && "selected",
    dimmed && "dimmed",
    lost && "lost",
    compact && "compact",
    onClick && "clickable",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <div className="card-name">{name}</div>
      <div className="card-stats">
        <span title="Speed — summed with your other card; lower acts first">
          <b>{c.speed}</b> spd
        </span>
        <span title="Movement — summed into this round's budget">
          <b>{c.movement}</b> mov
        </span>
        <span title="Reach">{reachLabel(name)}</span>
      </div>
      <div className="card-type">
        {c.type}
        {c.keywords.length > 0 && <> · {c.keywords.join(", ")}</>}
      </div>
      {!compact && <div className="card-text">{c.text}</div>}
      {lost && <div className="card-lost">lost</div>}
      {children}
    </div>
  );
}

export function CardBack({ label }: { label?: string }) {
  return (
    <div className="card back compact">
      <span>{label ?? "?"}</span>
    </div>
  );
}
