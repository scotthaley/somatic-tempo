# Arena Dueling Roguelike — Systems Design Doc

**Status:** baseline. Theme-agnostic. Card lists intentionally excluded.

Values marked `[TUNE]` are starting points, not decisions. Sections marked
**OPEN** are unresolved and carry a stated working default so implementation is
never blocked on them.

---

## 1. Concept

A single-player *run* composed of alternating **duels** and **upgrades**. Each
duel is a tactical card game between two characters. Between duels the player
adds cards, weapons, and relics to their build. The run ends on a win or loss
threshold.

Structurally this is an autobattler's run loop (pair by record, fight, draft,
repeat) with the combat replaced by a simultaneous-commitment card duel rather
than a simulated fight.

### Core loop

1. Matchmake against an opponent with a similar win/loss record.
2. Duel them.
3. Choose upgrades from a randomized offering.
4. Repeat until win or loss threshold is reached.

---

## 2. Run structure

| Parameter | Value |
|---|---|
| Wins to complete a run | 7 `[TUNE]` |
| Losses to end a run | 3 `[TUNE]` |
| Record space | 8 × 3 = 24 buckets |

Runs are **independent**. There is no shared lobby, no elimination pool, and no
lockstep round timer. Player A's duel finishing has no bearing on player B's
run. This is the key structural departure from autobattlers and it is what makes
live PvP viable — nobody is ever waiting on another table.

### Matchmaking

Players are paired against others at the same `(wins, losses)` coordinate.
Falls back to adjacent buckets as queue time grows.

Live PvP requires meaningful concurrency — roughly 100+ concurrent players for
tolerable queue times at a ~5 minute duel length. The ghost system below is the
mandatory fallback, not an optional feature.

---

## 3. Opponents: live and ghost

Two opponent sources, ideally indistinguishable to the player.

### Live

Two humans in a real-time duel. Both commit their turn simultaneously; a
server-side timer auto-commits on expiry.

### Ghost

A stored snapshot of another player's build, played by the system. Ghosts give
offline play, instant queues, and disconnect resilience.

**Initial implementation:** heuristic AI piloting the snapshot deck.

**Preferred implementation:** sample from the snapshot owner's recorded play
history — build a distribution over `(game state → card pair)` and play a mixed
strategy. Less exploitable than handcrafted AI because it is actually
distributional, and it preserves the feel of facing a person's tendencies.

**Recording requirement:** log every committed turn with its game state from the
start. The history-based ghost cannot be built retroactively without this data.

> **Design note.** Because both players commit blind and reveal, a duel against a
> recorded commitment carries the same information as a live one for that turn —
> you were never reacting to their current choice, only to their previous ones.
> The only thing ghosts lose is cross-turn adaptation.

---

## 4. Duel: turn structure

The single most important loop in the game.

Each **round**:

1. **Draw** to a hand of 5 `[TUNE]`.
2. **Commit** — each player secretly selects exactly 2 cards.
3. **Resolve initiative** — each player's initiative is the **sum of the speed
   values of their two committed cards**. Lower total acts first.
4. **Reveal order only** — each player is told whether they are 1st or 2nd.
   **The numeric totals are never shown.**
5. **First player resolves** both their cards, in whichever order they choose,
   chosen *after* learning they are first.
6. **Second player resolves** both their cards, in whichever order they choose.
7. **Discard** the 3 unplayed cards, plus the 2 played cards, unless a card has
   `Retain`.

### Rules detail

- **Free ordering.** A player's two cards may be resolved in either order. Speed
  determines *only* which player goes first, never sequencing within a turn.
  Ordering is chosen after initiative is known, making it a genuine second
  decision layer.
- **Hidden magnitude.** A player knows they lost initiative but not by how much.
  Being second could mean off by one or off by nine. This is deliberate: the
  threat signal exists without being a readout of the opponent's payload.
- **Ties** are broken by coin flip. Any deterministic tiebreaker leaks
  information; randomness leaks none.
- **Commitment is total.** No response window, no reactions during resolution.
  All bluffing lives in the commit step.

### Why sum-initiative

- Speed becomes a budget spent across two cards rather than a property of one.
- Two heavy cards stack their slowness, so the greedy turn is *dramatically*
  slower rather than incrementally. Self-limiting without an explicit rule.
- Fast+slow and medium+medium reach the same initiative but produce different
  turns — one weak action plus one strong one versus two solid ones. A real
  composition choice sits underneath the speed choice.

---

## 5. Combat state

Cards read and write persistent state. That state is the substrate every synergy
attaches to, so it needs to exist before cards are authored.

### Position: the arena

A **hex-tiled arena**, roughly circular, `[TUNE]` 8–10 tiles at its widest.
Distance between fighters is hex distance. Cards gate on and scale with it.

Arena size is a balance between two failure modes, and the tuning target is
stated as a feel rather than a number:

- **Too large** — fighters spend the duel chasing each other and engagements are
  rare.
- **Too small** — disengaging is impossible and range-based play has no room to
  exist.

#### Obstacles

The arena contains impassable or costly terrain. These are not decoration — they
are what make the board a puzzle rather than an open field:

- They create **escape routes**, so a cornered fighter has a path out at a cost.
- They enable **cornering**, the primary way an aggressive build converts
  positional advantage into forced engagement.
- They break up sightlines, if line of sight is used (see below).

Obstacle layout should vary between duels. It is a cheap source of per-duel
variety and it stops players solving a single fixed board.

**Movement is not a card effect. Every card carries a movement value.**

Exactly as with speed, a player's movement for the round is the **sum of the
movement values of their two committed cards**. Typical range is 0–2 per card
`[TUNE]`, so a turn supplies 0–4 tiles of movement.

This is deliberate: movement never competes for a deck slot. There is no
"movement card" archetype to build around and no separate resource to balance.
Movement is a second number on every card and therefore a pricing lever on every
card.

#### Spending movement

Movement is a **budget, not a mandate** — a player may spend up to their total,
in any direction, and may spend it **before, between, or after** their two cards.

Spending between cards is the point. Combined with free ordering, two ordinary
cards become a positional puzzle: close the gap, play the short-range card, step
back, play the long-range one. Two cards with identical text produce different
turns depending on how movement is threaded through them.

#### Positioning is contested

Both fighters move, and the second player moves knowing exactly where the first
ended up. This is a further payoff for going second — you position with full
information — and a further risk for going first, since your opponent can close
or escape after seeing your commitment.

The consequence is that a range-gated card can become unplayable mid-turn if the
opponent moved. **It is simply lost.** No partial effect, no refund. Free
ordering and the movement budget are the tools for avoiding this, and using them
well is a core skill expression rather than an edge case to be smoothed over.

#### Kiting

A 2-D board with symmetric movement budgets makes a fleeing fighter hard to
catch, and the round cap is judged on remaining vitality. Landing a hit and then
avoiding engagement is therefore a viable strategy.

**This is accepted for now.** Evasion is a legitimate way to play a duelist, and
whether it is actually dominant or merely available is an empirical question.

Candidates if it proves degenerate in play: a closing arena that shrinks the
playable area over time; escalating pressure on whichever fighter is further from
the center; changing how the round cap is judged; or cards and relics that
punish disengagement.

#### Open positional questions

- **Facing** — whether fighters have an orientation, and whether flank or rear
  attacks differ. Adds meaningful depth and a reason to maneuver rather than just
  close distance, but roughly doubles the positional decision space. *Working
  default: no facing.*
- **Line of sight** — whether obstacles block ranged effects, or only movement.
  LOS makes obstacles matter to both archetypes rather than only to melee.
  *Working default: obstacles block movement only.*
- **Area effects** — hexes make blasts, lines, and cones natural. A rich content
  axis, but every area effect multiplies the positional evaluation cost for
  ghost AI. *Working default: single-target only until the baseline is tuned.*

### Vitality

A single pool that depletes within a duel. Reaching zero ends the duel. `[TUNE]`
starting value 20. Resets between duels.

No persistent physical damage carries across duels. A cross-duel injury or wound
system is a plausible later addition but is deliberately out of scope — it adds
run-level complexity and death-spiral risk before the duel itself is proven.

### Status effects

A general, extensible system. Individual statuses are **content, not systems** —
exhaustion, burning, exposed, and so on are card text. They exist primarily as a
balancing lever so fast-and-strong cards can carry a drawback, and as conditions
other cards can read.

Statuses are duel-scoped and clear between duels.

#### Decay rule

One rule governs every status, so players learn it once:

> A status decays **at end of round**, but only if it was present at the
> **start** of that round.

Implementation is a per-stack age flag: at start of round, mark all existing
stacks aged; at end of round, remove aged stacks.

The consequence is the point of the rule. A status applied mid-round — including
by the second player, who applies it after the opponent has already acted — is
unaged and survives into the next round. A slow status card is therefore weaker
than a fast one, but never wasted. Fast application means the effect is live
immediately *and* persists; slow application means the opponent gets a full round
of warning and can plan around it.

**Decay removes the entire stack, not one per round.** Stack count therefore means
*how much the effect absorbs*, never *how long it lasts*. Duration is fixed at
roughly one round of exposure regardless of size. This is deliberate: per-stack
decay would let a large stack lock an opponent out for several consecutive rounds,
and stacking-focused decks are an explicitly unwanted archetype.

#### Reactive charges

A subset of statuses are **charges that modify the next instance of an event**,
consumed on trigger. This is a single primitive with many expressions:

- next attack against you is cancelled (`Interrupt`)
- next attack you make deals bonus damage
- next attack against you cannot be interrupted
- next movement costs nothing

Build the charge framework once — `on <event>, consume one stack, apply
<modifier>` — and these become authored content rather than new systems. Charges
obey the standard decay rule above.

#### UI requirement

Fresh and aged stacks **must be visually distinguishable**. This is not
cosmetic — without it, players cannot predict when an effect expires and the
decay rule reads as random.

### Duel end

Vitality depletion is the primary end condition.

A **hard round cap** acts as backstop so two defensive builds cannot stall
indefinitely. At the cap, higher remaining vitality wins; an exact tie is a draw,
counted as a loss for both players.

Cap value is `[TUNE]` — 15 rounds is a placeholder and expected to move once real
duel lengths are observed. It should sit well above the length of a typical duel
so it is a safety valve rather than a strategic target; if players start building
to reach the cap, it is too low.

**Explicitly rejected:** deck-out as a timer. Running out of cards must not end a
duel — a lean deck should be rewarded, not penalized.

---

## 6. Card anatomy

```
Card {
  id
  speed: int          // contributes to initiative sum; lower = faster
  movement: int       // contributes to movement budget; typically 0-2
  effects: [Effect]   // ordered, resolved as a unit
  conditions: [Cond]  // optional gates or conditional bonuses
  keywords: [Keyword]
  tags: [Tag]         // for synergy targeting: e.g. movement, strike, defensive
}
```

Every card carries **both** a speed and a movement value. Neither is optional and
neither is a separate card type — they are the two universal pricing axes.

### Keywords (starting set)

- **Retain** — not discarded at end of round; carries into the next hand. The
  only way to bank value across rounds. Limit one retained card at a time
  `[TUNE]`.
- **Interrupt N** — applies N interrupt charges to the opponent. Each charge
  cancels one incoming attack and is consumed doing so. See §7.
- **Retaliate N** — applies N retaliate charges to yourself. Each charge lets one
  incoming attack land and deals damage back to the attacker, and is consumed
  doing so. See §7.

### Conditions

The primary design surface. Cards may gate on, or scale with:

- current hex distance to the opponent
- board state: adjacency to obstacles, proximity to the arena edge, whether the
  opponent is cornered
- whether the player is acting first or second this round
- opponent's active statuses
- own active statuses
- what the opponent played last round
- own tags played earlier this turn (enables same-turn combos via free ordering)

---

## 7. Card design principles

These are the rules the content pipeline should follow. They matter more to game
feel than any individual card.

### Power is conditional, not flat

A card that is flatly better is not interesting — everyone drafts it and no
decision occurs. A card that is enormous *under a condition* is only strong
inside a build that can pay that condition. Drafting then becomes "can my deck
support this?" rather than "is this number bigger?"

**This is the mechanism that makes the draft interesting. Prefer conditional
power to raw stat increases in essentially all cases.**

### Movement is priced, not free

Movement is the third universal axis alongside speed and power, and it must cost
something. A card with 2 movement should be weaker, slower, or more conditional
than an otherwise identical card with 0 — otherwise high-movement cards are
strictly better and the axis collapses.

Priced correctly it produces its own tension:

- **Heavy cards should be low-movement.** Committing two big slow cards roots you
  in place, which is both thematically right and mechanically self-limiting — the
  greedy turn is slow *and* immobile. It is also how cornering becomes a threat:
  a rooted fighter cannot escape a closing opponent.
- **A 0-movement heavy card needs a partner.** If it is range-gated and you are
  out of position, it must be paired with a mobile card to be playable at all.
  That is a composition constraint on the deck without requiring a movement
  archetype.
- **Cheap mobile cards earn their slot** even with weak effects, because they
  supply the budget that lets the expensive cards connect.

Treat movement exactly like speed when pricing: it is a number you spend to get
something else.

### The speed/power/drawback triangle

Three axes keeps the pool from feeling like one slider:

- **Slow + strong + clean** — the baseline heavy card. Payoff for going second.
- **Fast + weak + clean** — the baseline tempo card.
- **Fast + strong + drawback** — available to everyone at a cost (self-status,
  vitality, positional exposure). Not a balance exception.
- **Slow + reactive** — cards that specifically want to go second: punish a
  whiff, capitalize on exposure, counter what just landed.

Going second must buy something. Since the second player has *watched the
opponent's entire turn resolve*, the natural payoff is information: reactive
cards turn "I accept a penalty" into "I bought a read."

**Keep a small number of fast-but-strong outliers in the pool** so that
"they're second, so it's probably the big one" never becomes a reliable
inference over the course of a run.

### Interrupts

Some counter to slow-heavy play is required. Without one, going second costs
almost nothing — you trade hits while dealing more — and slow-heavy becomes the
default build.

**Interrupt is a reactive charge, not an instant cancel.** `Interrupt N` applies
N charges to the opponent; each charge cancels one incoming attack and is
consumed doing so. Charges follow the standard decay rule (§5).

This is what makes fast-light a genuine counter to slow-heavy rather than merely
a tempo preference, and it is the load-bearing piece of the game's
rock-paper-scissors.

The charge model was chosen over instant cancellation for three reasons:

1. **It works from either initiative position.** An instant cancel only functions
   for the player who acts first, since the second player has nothing left to
   cancel. Charges applied from second position simply land unaged and threaten
   the following round.
2. **It is counterable rather than a shutdown.** See below.
3. **It scales.** Multi-charge cards are a natural design axis.

#### Counterplay, and why free ordering carries it

A player holding an interrupt charge has two outs, chosen at resolution time
after seeing the charge land:

- **Strip it.** Lead with a cheap attack to consume the charge, then land the
  real one. Costs a card.
- **Wait it out.** Play setup — movement, buffs, status — and let the charge age
  out. Non-attacks do not consume charges, so the interrupt bought tempo denial
  rather than damage prevention. Which is what it is for.

**Charge count is what defeats the stripping hedge.** A single charge is cheap to
strip: commit chaff plus the real card and lead with chaff. Two charges means
stripping costs the entire turn. Multi-charge cards are therefore not "more of
the same" — they are specifically the answer to an opponent who can see the
charge coming. This is what makes interrupt viable when applied from second
position.

#### Design constraints on the class

- Interrupt cards are fast and **low-payload**. The effect is the tempo denial,
  not the damage.
- Rare enough in the pool that a slow-heavy player cannot assume one is coming;
  common enough that they cannot assume one is not.
- **Interrupt-stacking must not be a viable archetype.** Whole-stack decay (§5)
  is the primary guard. Keep charge counts per card low (1–2), and do not print
  cards that generate charges as a repeatable engine.
- Statuses and setup cards are unaffected by interrupt, so an interrupted player
  is redirected rather than frozen. A consequence worth noticing on purpose:
  attack-light builds are naturally interrupt-resistant.

#### Retaliate

Retaliate is the mirror of interrupt and uses the same charge framework. Each
charge lets one incoming attack land normally and deals damage back to the
attacker.

The two keywords are deliberately mechanically similar. The choice between them
is the interesting part:

|  | Interrupt | Retaliate |
|---|---|---|
| Incoming damage | Cancelled | Lands |
| Outgoing damage | None | Dealt back |
| Denies the attacker's card | Yes | No |
| Nature | Tempo denial | Attrition |

**The counterplay math is where they actually diverge.** Both charges can be
stripped by leading with a cheap attack, but the cost differs sharply:

- Stripping an **interrupt** with chaff is nearly free. The chaff is cancelled,
  so you lose the card and nothing more.
- Stripping a **retaliate** with chaff costs vitality. The chaff lands, but you
  take the retaliate damage to clear the charge — and if your chaff deals less
  than the retaliate returns, stripping is a losing trade outright.

So interrupt folds to the cheap-attack hedge while retaliate resists it. Both
remain equally vulnerable to the other out: play setup and let the charge age
away.

This makes retaliate the stronger charge against an opponent holding spare weak
cards, and interrupt the stronger charge against an opponent committing a single
heavy one. Retaliate damage should be tuned against typical chaff damage, since
that ratio is the entire balance of the keyword.

**Interaction:** if an attack meets both an interrupt and a retaliate charge on
the same target, interrupt resolves first. The attack is cancelled, no damage is
dealt, and **the retaliate charge is not consumed** — retaliate triggers on damage
taken, and none was. Holding both is therefore strong but consistent, and costs
two cards to assemble.

### Combo reliability

Draw-5 same-hand combo probability, both specific cards in one hand:

| Deck size | P(both in hand) |
|---|---|
| 10 | ~22% |
| 15 | ~9% |
| 20 | ~5% |

Formula: `20 / (N × (N−1))`.

Consequence: **the backbone of the synergy design must be state-based combos
across turns, not same-hand combos.** Card A applies a status / opens a guard /
moves to a position; card B cashes it in on a later turn. Only requires both in
the deck, not both in the same draw.

Same-hand combos become the high-end payoff — rarer, more explosive, and the
reason free ordering exists. A card that is mediocre alone and devastating when
sequenced behind the right partner in a single turn.

**Duplicates must be draftable.** Running two copies is the only consistency fix
for a same-hand combo, and trading deck leanness for reliability is a genuine
drafting decision.

---

## 8. Deck and progression

### Starting deck

`[TUNE]` 10 cards. Generic, low-power, teaches the basic verbs.

### Between-duel upgrades

Offered after every duel, win or lose.

- **Card additions:** choose 1 of 3 offered `[TUNE]`, possibly 2 picks per round.
- **Weapons / relics:** persistent modifiers. Alter card behavior, hand size,
  starting position, status interactions. These are where cross-card synergies
  and archetype identity should mostly live.
- **Removal:** deliberately **scarce**. This is the primary regulator of deck
  size.

### Deck size is self-regulating

Additions are the default and removal is rare, so the deck grows with greed. A
10-card start with 1–2 additions per round reaches ~20 by the end of a 7-win run,
meaning a card added early appears in roughly a quarter of hands — enough for a
build to cohere without a single card dominating.

**Upgrade power curve `[TUNE]`:** keep the ratio of upgrade-card power to
starter-card power *shallow* (~1.2×, not ~2×). If new cards vastly outclass
starters, bloat is costless and every offer is an auto-take. A shallow curve
makes passing on a card a real option and gives scarce removal its value.

### Hand size — **OPEN**

Drawing 6 instead of 5 is a very large power increase in a system with otherwise
fixed throughput — it improves selection, combo assembly, and speed-budget
flexibility simultaneously. If offered as an upgrade at all, it should be rare
and expensive. Excluded by default until the baseline is tuned.

### Shuffle cost — **OPEN**

If the discard reshuffles for free the instant the deck empties, a lean deck
cycles so fast that discarding is near-costless and the player sees their best
card almost every round. The shuffle cost is the ceiling on how lean a deck can
profitably go.

**Working default:** free reshuffle. Instrument it, then add a cost (lost draw,
status, initiative penalty) if lean decks prove dominant.

---

## 9. Balance validation

Metrics that should be tracked from the first playable build, because several
core systems fail silently:

- **Distribution of initiative totals.** If it collapses toward one end, the
  speed budget is fake and players have found a dominant tempo bracket.
- **Win rate by went-first vs. went-second.** Should be near even. A meaningful
  skew means the payoff for going second is mispriced.
- **Cards drafted vs. cards never played.** Identifies dead conditionals — cards
  whose condition is too rare to ever pay off.
- **Final deck size distribution.** If it clusters tightly, either removal or the
  upgrade power curve is doing all the work and the draft has no real choice in
  it.
- **Distribution of hex distance over a duel.** If it collapses to one value and
  stays there, movement is either too cheap (everyone reaches ideal range
  immediately) or too scarce (nobody can change the engagement).
- **Win rate of high-movement / low-power builds.** The read on whether kiting is
  dominant or merely viable.
- **Lost-card rate on range-gated cards.** Near zero means range gates are not
  binding; high means the movement budget is too tight to recover from an
  opponent's repositioning.
- **Interrupt card pick rate and charge hit rate.** Too high and slow-heavy is
  unplayable; too low and the rock-paper-scissors has no third leg.
- **Interrupt charge fate — consumed by a real attack, stripped by chaff, or aged
  out.** A heavy skew toward stripping means charge counts are too low to matter;
  a heavy skew toward consumption means the counterplay is not readable.
- **Rounds in which a player takes no attack action.** Rising over a run means
  interrupt is locking opponents out rather than redirecting them.

---

## 10. Open questions summary

| # | Question | Working default |
|---|---|---|
| 1 | Arena size and obstacle density | Hex arena, 8–10 tiles wide, varied obstacle layout per duel |
| 2 | Kiting viability | Accepted as a strategy for now; candidates noted in §5 |
| 3 | Facing | None |
| 4 | Line of sight | Obstacles block movement only |
| 5 | Area effects | Single-target only until baseline is tuned |
| 6 | Round cap value | 15 rounds `[TUNE]`; higher vitality wins |
| 7 | Shuffle cost | Free; instrument and revisit |
| 8 | Hand size as an upgrade | Excluded until baseline is tuned |
| 9 | What event consumes an interrupt or retaliate charge | Cards tagged `attack`; setup and status cards pass through |
| 10 | Ghost fidelity | Heuristic AI; record play data for history-based ghosts later |
| 11 | Cross-duel persistence (injuries, fatigue, repair economy) | None; deliberately deferred |
