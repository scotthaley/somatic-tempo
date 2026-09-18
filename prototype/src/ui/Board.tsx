import { useMemo } from "react";
import { isObstacle } from "../engine/arena";
import { Hex, ReachNode, hexDist, hexKey, hexToPixel, hexesWithin } from "../engine/hex";
import type { DuelState, Side } from "../engine/state";

const SIZE = 38;

function corners(x: number, y: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return `${(x + size * Math.cos(a)).toFixed(1)},${(y + size * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function Glyph({ cls }: { cls: string }) {
  if (cls === "Wizard") {
    return (
      <>
        <polygon points="0,-15 -9,5 9,5" fill="#fff" />
        <rect x={-12} y={5} width={24} height={3} rx={1.5} fill="#fff" />
      </>
    );
  }
  return (
    <>
      <path d="M-11,-3 Q-15,-14 -5,-12 Q-8,-8 -5,-3 Z" fill="#fff" />
      <path d="M11,-3 Q15,-14 5,-12 Q8,-8 5,-3 Z" fill="#fff" />
      <rect x={-7} y={-3} width={14} height={11} rx={4} fill="#fff" />
    </>
  );
}

interface Props {
  s: DuelState;
  human: Side;
  reach: Map<string, ReachNode> | null;
  /** Reach of the hovered card, measured from the human fighter. */
  preview: number | null;
  onHex: (h: Hex) => void;
  opponentLabel?: string;
}

export function Board({ s, human, reach, preview, onHex, opponentLabel = "AI" }: Props) {
  const r = s.arena.radius;
  const hexes = useMemo(() => hexesWithin(r), [r]);
  const w = SIZE * Math.sqrt(3) * (2 * r + 1) + 16;
  const h = SIZE * (3 * r + 2) + 16;
  const me = s.fighters[human];

  return (
    <svg className="board" viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}>
      {hexes.map((hex) => {
        const k = hexKey(hex);
        const { x, y } = hexToPixel(hex, SIZE);
        const obstacle = isObstacle(s.arena, hex);
        const node = reach?.get(k);
        const inPreview = preview !== null && hexDist(hex, me.pos) <= preview && !obstacle;
        const cls = [
          "hex",
          obstacle && "obstacle",
          node && node.cost > 0 && "reachable",
          inPreview && "preview",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <g key={k} onClick={() => node && node.cost > 0 && onHex(hex)}>
            <polygon className={cls} points={corners(x, y, SIZE - 1.5)} />
            {node && node.cost > 0 && (
              <text className="hex-cost" x={x} y={y + 4}>
                {node.cost}
              </text>
            )}
          </g>
        );
      })}
      {s.fighters.map((f, side) => {
        const { x, y } = hexToPixel(f.pos, SIZE);
        const active = s.resolving?.side === side;
        return (
          <g
            key={side}
            className={`fighter-token ${f.cls.toLowerCase()} ${active ? "active" : ""}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
          >
            {active && <circle r={27} className="token-ring" />}
            <circle r={22} className="token" />
            <Glyph cls={f.cls} />
            <text className="token-label" y={36}>
              {side === human ? "YOU" : opponentLabel.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
