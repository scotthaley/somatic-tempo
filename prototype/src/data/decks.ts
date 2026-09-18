import type { ClassName } from "./cards";

const copies = (name: string, n: number) => Array<string>(n).fill(name);

// Baseline doc §0.5: 4 basic attack + 4 basic defense + 2 class cards.
export const STARTER_DECKS: Record<ClassName, string[]> = {
  Wizard: [...copies("Spark", 4), ...copies("Shield", 4), "Arcane Bolt", "Repulse"],
  Barbarian: [...copies("Strike", 4), ...copies("Brace", 4), "Reckless Swing", "Charge"],
};
