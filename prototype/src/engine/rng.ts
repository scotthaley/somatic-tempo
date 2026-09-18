// mulberry32 — small, fast, seedable.
function next(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [a, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

export function makeRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    const [s, v] = next(state);
    state = s;
    return v;
  };
}

/** Draws from an RNG whose state lives on a serializable object. */
export function rollOn(holder: { seed: number }): number {
  const [s, v] = next(holder.seed);
  holder.seed = s;
  return v;
}

export function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
