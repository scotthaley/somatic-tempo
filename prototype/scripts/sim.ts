// Headless AI-vs-AI duels: sanity-checks the engine and prints balance numbers.
// Usage: pnpm sim [duels=40]
import { chooseCommit } from "../src/ai/commit";
import { planResolution } from "../src/ai/plan";
import { isObstacle, inArena } from "../src/engine/arena";
import { hexEq } from "../src/engine/hex";
import { createDuel, step } from "../src/engine/rules";
import { DuelState, MAX_VITALITY } from "../src/engine/state";

const duels = Number(process.argv[2] ?? 40);
// Per-class commit search settings, e.g. SAMPLES=12 CANDIDATES=6
const commitOpts = {
  samples: Number(process.env.SAMPLES ?? 6),
  planCandidates: Number(process.env.CANDIDATES ?? 3),
};

function check(s: DuelState) {
  const [a, b] = s.fighters;
  if (hexEq(a.pos, b.pos)) throw new Error("fighters share a hex");
  for (const f of s.fighters) {
    if (!inArena(s.arena, f.pos) || isObstacle(s.arena, f.pos)) throw new Error("illegal position");
    if (f.vitality < 0 || f.vitality > MAX_VITALITY) throw new Error("vitality out of bounds");
    if (f.stacks.some((st) => st.amount <= 0)) throw new Error("empty stack");
  }
}

const wins = { Wizard: 0, Barbarian: 0, draw: 0 };
const rounds: number[] = [];
let firstCount = [0, 0];
let lost = [0, 0];
let played = [0, 0];
const distances: Record<number, number> = {};
const started = Date.now();

for (let i = 0; i < duels; i++) {
  const s = createDuel({ seed: 1000 + i });
  let guard = 0;
  while (s.phase !== "over") {
    if (++guard > 2000) throw new Error("duel did not terminate");
    if (s.phase === "commit") {
      step(s, { type: "commit", side: 0, cards: chooseCommit(s, 0, commitOpts) });
      step(s, { type: "commit", side: 1, cards: chooseCommit(s, 1, commitOpts) });
    } else {
      const side = s.resolving!.side;
      for (const a of planResolution(s, side).actions) {
        step(s, a);
        check(s);
      }
    }
    check(s);
  }
  if (s.winner === "draw") wins.draw++;
  else wins[s.fighters[s.winner!].cls]++;
  rounds.push(s.round);
  for (const f of s.metrics.first) firstCount[f]++;
  for (const d of s.metrics.distanceAtStart) distances[d] = (distances[d] ?? 0) + 1;
  lost = lost.map((n, k) => n + s.metrics.lostCards[k]);
  played = played.map((n, k) => n + s.metrics.playedCards[k]);
  process.stdout.write(".");
}

const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
console.log(`\n\n${duels} duels in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log("Wins:", wins);
console.log(`Rounds: avg ${avg.toFixed(1)}, min ${Math.min(...rounds)}, max ${Math.max(...rounds)}`);
console.log(`Acted first — Wizard: ${firstCount[0]}, Barbarian: ${firstCount[1]}`);
console.log(
  `Cards lost to range — Wizard: ${lost[0]}/${played[0]}, Barbarian: ${lost[1]}/${played[1]}`,
);
console.log("Distance at round start:", distances);
