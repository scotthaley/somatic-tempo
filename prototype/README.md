# Somatic Tempo — Duel Prototype

A playable prototype of the duel from `../duel-roguelike-design.md`, using the rules and
starting decks in `somatic-tempo-baseline-cards.md`. You play a Wizard or a Barbarian against a
local heuristic AI. There are no draft, relics or runs yet.

## Run

```sh
pnpm install
pnpm tauri dev      # desktop app
pnpm dev            # or just the browser at http://localhost:1420
```

## Share

```sh
pnpm tauri build --bundles app,dmg   # → src-tauri/target/release/bundle/{macos,dmg}
pnpm build                            # → dist/ (static site, runs in any browser)
```

- The macOS build is unsigned. Testers need to right-click → Open the first time.
- Windows and Linux builds have to be built on those platforms (or in CI).
- `dist/` can be dropped on any static host (itch.io, Netlify, GitHub Pages).

## Other scripts

```sh
pnpm test                               # engine rules tests
pnpm sim 40                             # 40 AI-vs-AI duels: invariants + balance numbers
SAMPLES=16 CANDIDATES=8 pnpm sim 30     # deeper AI search
```

## Layout

| Path | What |
| --- | --- |
| `somatic-tempo-cards.csv` | Card stats (speed, movement, range, type, keywords, text). Edit numbers here. |
| `src/data/effects.ts` | What each card does. Add a function here when you add a card to the CSV. |
| `src/data/decks.ts` | Starting decks. Swap pool cards in here to test them. |
| `src/engine/` | Pure rules engine. `rules.ts` (round flow), `combat.ts` (damage pipeline), `state.ts` (types, statuses, constants such as vitality, hand size, round cap). |
| `src/ai/` | Heuristic AI, run in a Web Worker. |
| `src/ui/` | React + SVG UI. |
| `scripts/sim.ts` | Headless AI-vs-AI runner. |

## Rules as implemented

Everything follows the two design docs. Where they were silent, the prototype assumes:

- **Interrupt charges sit on the fighter whose attack they cancel.** The design doc says
  "applies N charges to the opponent", so `Repulse`, `Mirror Ward` and `Counterspell` put the charge
  on the opponent, and it shows in their status chips.
- **An interrupted attack cancels the whole card**, including self-drawbacks such as Scorch's
  Burning or Reckless Swing's Exposed, and riders such as Headbutt's Winded.
- **Order of an attack:**
  1. Interrupt, which cancels the attack.
  2. Base damage, plus conditional bonuses, plus Enraged, plus Exposed (+2).
  3. Point-blank −2 (minimum 1).
  4. Warded absorbs damage.
  5. Retaliate triggers, only if damage got through.
- **Charges are consumed oldest first**, so aged stacks are used before fresh ones.
- **Retaliate, Burning and Siphon's bonus** are non-attack damage. They go through Warded but
  don't trigger Exposed, Interrupt or Retaliate.
- **Movement** can't pass through the opponent. Phase Step ignores obstacles for the whole
  resolution if it is committed.
- **Forfeits:** ending your resolution with an unplayed card forfeits it.
- **Push** goes along the hex direction closest to the pusher→target line. It stops at obstacles,
  the arena edge, or the pusher.
- **Arena:** radius-4 hex (9 wide). Starts are 5 apart. Each duel gets a random obstacle layout,
  mirrored so it is fair to both starts.
- **Retain** keeps at most 1 unplayed Retain card in hand. The reshuffle is free.

## Playtest data

The end-of-duel screen shows a few §9 metrics:

- initiative totals
- who acted first
- cards lost to reach
- distance per round

**Copy log JSON** exports every committed turn (hand, commitment, initiative, start-of-round state,
and each move/play action). That is the recording format the history-based ghost AI will need.

## The AI

- **Commit:** for each distinct pair in hand, it samples opponent hands from the cards the opponent
  could hold (never their real hand or commitment). It guesses the opponent's pair, simulates the
  round with a shallow resolution planner, and softmaxes over the averaged scores.
- **Resolve:** it searches both card orders and every place to stand before, between and after
  the cards, then scores the result.
- **Evaluation:** vitality, statuses, and each class's preferred range. The Wizard likes distance
  3–4 and dislikes being cornered. The Barbarian wants to be adjacent.

These weights live in `src/ai/evaluate.ts`.
