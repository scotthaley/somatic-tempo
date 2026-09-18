import csv from "../../somatic-tempo-cards.csv?raw";

export type ClassName = "Wizard" | "Barbarian";
export type CardType = "attack" | "defensive" | "control" | "status" | "movement";

export interface CardDef {
  name: string;
  cls: ClassName;
  deck: "basic" | "starter" | "pool";
  speed: number;
  movement: number;
  /** null = melee for attacks, self/untargeted otherwise. */
  range: number | null;
  type: CardType;
  keywords: string[];
  text: string;
  role: string;
  retain: boolean;
}

function parseCsv(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

function load(): Record<string, CardDef> {
  const [header, ...rows] = parseCsv(csv);
  const col = (name: string) => header.indexOf(name);
  const out: Record<string, CardDef> = {};
  for (const r of rows) {
    const keywords = r[col("keywords")]
      .split(/[;,]/)
      .map((k) => k.trim())
      .filter(Boolean);
    const range = r[col("range")].trim();
    const def: CardDef = {
      name: r[col("card")],
      cls: r[col("class")] as ClassName,
      deck: r[col("deck")] as CardDef["deck"],
      speed: Number(r[col("speed")]),
      movement: Number(r[col("movement")]),
      range: range === "" ? null : Number(range),
      type: r[col("type")] as CardType,
      keywords,
      text: r[col("text")],
      role: r[col("role")],
      retain: keywords.includes("Retain"),
    };
    out[def.name] = def;
  }
  return out;
}

export const CARDS = load();

/** Needs the opponent within reach, or the card is lost. */
export const isTargeted = (c: CardDef) => c.type === "attack" || c.range !== null;
export const reachOf = (c: CardDef) => c.range ?? 1;
