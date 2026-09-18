# Somatic Tempo — Duel Prototype

A playable prototype of the duel from `../duel-roguelike-design.md`, using the rules and
starting decks in `somatic-tempo-baseline-cards.md`. You play a Wizard or a Barbarian against a
local heuristic AI. There are no draft, relics or runs yet.

## Prototype 2 variant

This branch deviates from §4 of the design doc in three ways, to playtest them:

1. **Sides alternate single cards** instead of the first player resolving both of its cards before
   the second player acts at all.
2. **The hand carries over.** Only the two committed cards are discarded; you draw back up to 5.
3. **Starting decks are 6 fixed cards plus 4 random class pool cards**, rolled from the duel's seed.

Compare against `main` with `pnpm sim 40` on each branch.

## Run

```sh
pnpm install
pnpm tauri dev      # desktop app
pnpm dev            # or just the browser at http://localhost:1420
```

## Share

The prototype is deployed on every push to `prototype2`:

**https://scotthaley.github.io/somatic-tempo/**

```sh
pnpm build                            # → dist/ (static site, runs in any browser)
pnpm tauri build --bundles app,dmg   # → src-tauri/target/release/bundle/{macos,dmg}
```

- `dist/` can be dropped on any static host; `base` is `"./"` so a subpath works.
- The macOS build is unsigned. Testers need to right-click → Open the first time.
- Windows and Linux builds have to be built on those platforms (or in CI).

## Playing someone else

"Play a friend" mints a room code, puts it in the URL, and shows an invite
link. The other player opens that link and takes the free side. A refresh
rejoins; a third visitor spectates.

```sh
pnpm room:dev      # the relay, on localhost:8787
pnpm dev           # the game, on localhost:1420 — talks to the relay above
pnpm room:deploy   # push the relay to Cloudflare
pnpm room:check    # typecheck the worker
```

The relay is deliberately dumb: it orders and rebroadcasts `Action`s and holds
no rules, because seed plus an ordered action log fully determines a duel, so
both browsers replay the same log through the same engine. Two consequences
worth knowing:

- **It is trivially cheatable.** Each client holds the whole state, opponent's
  hand included. That is the right trade for playtesting and the wrong one for
  anything public.
- **Commits are the exception.** The room withholds each commit until both have
  arrived, then releases them side 0 first. Releasing on arrival would show the
  second player what the first committed, and releasing in arrival order would
  give the two clients differently ordered logs.

Clients apply nothing until the room echoes it back, so they cannot diverge.
`src/net/replay.test.ts` plays whole duels through the room and asserts two
independently folded clients stay byte-identical.

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
| `src/data/decks.ts` | Deck construction: the fixed 6-card base plus `POOL_PICKS` random pool cards. |
| `src/engine/` | Pure rules engine. `rules.ts` (round flow), `combat.ts` (damage pipeline), `state.ts` (types, statuses, constants such as vitality, hand size, round cap). |
| `src/ai/` | Heuristic AI, run in a Web Worker. |
| `src/net/` | Online play: the wire protocol, the (pure, tested) room logic, and the client that folds the log. |
| `server/` | Cloudflare worker wrapping the room logic in a Durable Object. |
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
- **Alternating play.** The sum of committed speeds still sets the order, lower first. Sides then
  trade **mini-turns**: any moves, at most one card, any moves, ended by *End step*. Each side gets
  two mini-turns, so the cards resolve first, second, first, second.
- **Movement** is pooled per side for the whole round (the two cards' movement minus Snared) and
  carries between that side's two mini-turns. It can't pass through the opponent. Phase Step ignores
  obstacles for that side's whole round, whichever of its cards is played first.
- **Forfeits:** *Forfeit rest* drops every card you haven't played and retires you for the round;
  the other side then plays out its remaining mini-turns alone. Passing both mini-turns without
  playing forfeits the same way.
- **Push** goes along the hex direction closest to the pusher→target line. It stops at obstacles,
  the arena edge, or the pusher.
- **Arena:** radius-4 hex (9 wide). Starts are 5 apart. Each duel gets a random obstacle layout,
  mirrored so it is fair to both starts.
- **The hand carries over.** Only the two committed cards go to the discard; everything else stays
  and you draw back up to 5. That makes the **Retain** keyword inert — it is still on the cards but
  nothing reads it. The reshuffle is free.
- **Decks** are 2 copies of each basic, 1 of each class starter, and 4 distinct cards drawn from
  that class's 10-card pool using the duel's seed. Still 10 cards. The picks are named at the top of
  the event log and on each fighter panel, so a seed reproduces a duel exactly.

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
- **Resolve:** it plans one mini-turn at a time — where to stand, which card to play, where to kite
  to — and re-plans each time the baton returns, so it reacts to the opponent's interleaved cards.
- **Evaluation:** vitality, statuses, and each class's preferred range. The Wizard likes distance
  3–4 and dislikes being cornered. The Barbarian wants to be adjacent.

These weights live in `src/ai/evaluate.ts`.
