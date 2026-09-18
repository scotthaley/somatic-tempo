import { CARDS, CardDef, ClassName } from "./cards";
import { shuffleInPlace } from "../engine/rng";

/** Random class pool cards mixed into each starting deck. */
export const POOL_PICKS = 4;

const of = (cls: ClassName, deck: CardDef["deck"]) =>
  Object.values(CARDS)
    .filter((c) => c.cls === cls && c.deck === deck)
    .map((c) => c.name);

export const poolCards = (cls: ClassName) => of(cls, "pool");

/** Two copies of each basic plus one of each class starter. Six cards. */
export function baseDeck(cls: ClassName): string[] {
  return [...of(cls, "basic").flatMap((n) => [n, n]), ...of(cls, "starter")];
}

/** The six-card base plus POOL_PICKS distinct pool cards, drawn with the duel's seed. */
export function buildDeck(cls: ClassName, rand: () => number): { deck: string[]; extras: string[] } {
  const extras = shuffleInPlace([...poolCards(cls)], rand).slice(0, POOL_PICKS);
  return { deck: [...baseDeck(cls), ...extras], extras };
}
