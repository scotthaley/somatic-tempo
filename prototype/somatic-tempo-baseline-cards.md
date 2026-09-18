# Baseline Card Set — Prototype 1

Companion to *Somatic Tempo — Systems Design Doc*. Two classes, **Wizard** and
**Barbarian**, each with a 10-card starting deck and a 10-card class pool for
between-duel drafting.

Revised against the hex arena and per-card movement budget (§5, §6 of the design
doc). All numbers are `[TUNE]`.

---

## 0. Assumptions this set makes

Choices the design doc left open or didn't reach. Flagged so they can be
overridden before anything gets built.

| # | Assumption | Why |
|---|---|---|
| 1 | Fighters start **5 hexes apart** on a 9-wide arena | Far enough that the approach is a real phase, close enough that round one isn't dead air |
| 2 | An attack is **melee (adjacent only) unless it carries `Range N`** (§1) | Melee is the default case and needs no keyword |
| 3 | `Range N` appears only on `attack` and targeted-effect cards | Self-buffs and self-charges have no range |
| 4 | **`Snared N`** replaces the old `Pinned` — reduce the target's movement budget by N | The movement budget is now the thing worth attacking |
| 5 | Starting deck is **4 copies of one basic attack + 4 copies of one basic defense + 2 class cards** | Slay the Spire's Strike/Defend shape |
| 6 | Each class has its **own** basic attack and basic defense | The basics are where the class's baseline competence lives |
| 7 | Speed range **1–5**; movement range **0–3** | Initiative totals span 2–10, movement budgets 0–6 |
| 8 | Vitality **20** | Per the design doc |
| 9 | Only `attack` cards consume interrupt/retaliate charges | Per Open Question #9's working default |
| 10 | A card's effects resolve top to bottom as a unit | Needed for unambiguous reading |

---

## 1. Range and reach

**An attack with no `Range` keyword is melee** — it connects only at hex
distance 1. This is the default case and the majority of printed attacks.

**`Range N`** sets a maximum hex distance instead. N is always 2 or greater; a
`Range 1` card would just be a melee card with extra words on it.

**Out of reach.** If distance exceeds a card's reach at the moment it resolves,
the attack does nothing — per §5, it is simply lost, with no partial effect and
no refund. It is also **not an attack event**: it doesn't consume `Interrupt` or
`Retaliate` charges, doesn't trigger `Exposed`, and can't be interrupted.
Whiffing already costs a full card; letting a whiff also strip a charge would
make chaff-stripping free, which §7 specifically prices against.

**Point-blank.** A `Range N` attack suffers **−2 damage, minimum 1** at distance
1. Melee attacks are unaffected. Conditional bonuses that key on distance are
calculated first; the point-blank penalty applies last.

**Reach bands used in this set:**

| Band | Distance | Typical user |
|---|---|---|
| Melee | 1 | Every Barbarian attack |
| Short | 2–3 | Wizard basics and drawback cards |
| Long | 4–5 | Wizard payoff cards |

---

## 2. Movement, and what replaced `Retreat`

Movement is no longer a card effect. Every card carries a movement value; the
two committed cards sum into a budget spendable in any direction, before,
between, or after the cards resolve. The old `Advance` / `Retreat` text is gone
from every card in this set.

**One thing survives, and it's the reason to keep a movement-like effect at
all: moving your *opponent*.** A push ignores their budget, can't be answered by
them spending movement, and lands after they've already committed. That's
categorically different from moving yourself, so `Repulse` stays. Anything that
moved the *caster* has become a movement value instead.

`Snared N` is the other half of that idea — attacking the budget rather than the
position. Both are things a player cannot simply spend their way out of.

### Movement pricing in this set

Per §7 ("movement is priced, not free"), the two classes pay for it in opposite
places:

| | Where the movement lives | Consequence |
|---|---|---|
| Wizard | On **defensive and utility** cards. Every damage card is movement 0 | Casting roots you. A Wizard turn is *shoot* or *reposition*, rarely both |
| Barbarian | On **attack** cards. The defensive cards are movement 0 | Swinging carries you forward. Turtling plants you |

This is the core tension of the matchup and it's expressed entirely through the
movement column:

| Wizard turn | Damage | Move |
|---|---|---|
| `Spark` + `Spark` | 4 | 0 |
| `Spark` + `Shield` | 2 | 2 |
| `Shield` + `Shield` | 0 | 4 |

| Barbarian turn | Damage (if adjacent) | Move |
|---|---|---|
| `Strike` + `Strike` | 6 | 2 |
| `Strike` + `Brace` | 3 | 1 |
| `Charge` + `Strike` | 6 | 4 |

A fleeing Wizard outruns a closing Barbarian 4 to 2 — but deals nothing while
doing it, and the arena runs out. A Wizard holding distance *and* shooting moves
only 2, which the Barbarian matches. The Barbarian's edge comes from `Charge`;
the Wizard's comes from acting first.

---

## 3. Status glossary

Every status obeys the standard decay rule (§5): it decays at end of round
**only if it was present at the start of that round**, and the whole stack goes
at once.

**Persistent statuses** — stack count is magnitude.

| Status | Effect |
|---|---|
| `Burning N` | At end of round, before decay, target takes N damage |
| `Enraged N` | Your `attack` cards deal +1 damage per stack |
| `Winded N` | Your initiative total is +2 per stack |
| `Snared N` | Your movement budget is reduced by N, minimum 0 |

**Charges** — stack count is how many events it absorbs.

| Charge | Trigger | Effect |
|---|---|---|
| `Interrupt N` | Incoming `attack` | Cancel it. Consume 1 |
| `Retaliate N` | Incoming `attack` deals damage | Deal the listed damage back. Consume 1 |
| `Warded N` | Incoming damage | Prevent it. Each point prevented consumes 1 stack |
| `Exposed N` | Incoming `attack` | It deals +2 damage. Consume 1 |

`Warded` is the only charge consumed fractionally — it's a shield pool, and the
remainder decays normally. If that reads badly in play, make it "prevent all
damage from one attack, consume 1" and halve the values below.

**`Snared` is the sharpest of these in the new system.** A budget is a
per-round resource, so cutting it is pure tempo denial with no way to bank
around it — and because it lands unaged when applied from second position, it
bites on the turn the opponent was planning to close or escape.

---

## 4. The basics

Four copies each. These are ~70% of every hand in the first few duels, so they
are the class's actual feel, not filler.

| Class | Card | Speed | Move | Keywords | Text |
|---|---|---|---|---|---|
| Wizard | **Spark** | 1 | 0 | attack, `Range 3` | 2 damage. |
| Wizard | **Shield** | 2 | 2 | defensive | `Warded 2`. |
| Barbarian | **Strike** | 2 | 1 | attack | 3 damage. |
| Barbarian | **Brace** | 3 | 0 | defensive | `Warded 4`. |

Three axes separate them, and none of them is a card effect:

**Speed.** An all-basics Wizard turn totals 3 initiative, a Barbarian's 5. The
Wizard reliably acts first. That matters more than usual now, because the second
player positions with full knowledge of where the first ended up (§5) — so the
Wizard's initiative edge is partly *given back* as a positioning disadvantage.
Whether those two effects cancel is worth watching directly.

**Movement.** `Spark` at 0 is the whole Wizard problem: their basic attack roots
them. `Strike` at 1 means the Barbarian closes while swinging.

**Value.** `Brace` absorbs twice what `Shield` does, but `Shield` carries the
Wizard's only basic movement. The Barbarian's defense is a wall; the Wizard's is
a step.

### What this composition costs

With only three unique starting cards, the basics don't teach `Interrupt`,
`Retaliate`, or the first/second condition. Those enter through the two class
cards and the draft, which means **prototype 1 won't see `Retaliate` until
someone drafts it.** If you want it tested from round one, the cleanest swap is
`Brace` becoming `Warded 3` + `Retaliate 1` (returns 2).

---

## 5. Wizard

**Identity.** Rooted while dangerous, mobile while harmless. Every turn is a
question of which of those two things to be.

### Starting class cards (2)

| Card | Speed | Move | Keywords | Text |
|---|---|---|---|---|
| **Arcane Bolt** | 3 | 0 | attack, `Range 5` | 4 damage. 6 instead if distance ≥ 4. |
| **Repulse** | 2 | 1 | `Range 2` | Push the opponent 2 hexes directly away. `Interrupt 1`. |

`Arcane Bolt` is the reward for winning the approach outright — the only reason
a Wizard ever wants distance 4+, where `Spark` is dead and `Bolt` is at full
power. `Repulse` is the forced-movement card: it buys distance the Barbarian
cannot spend their way out of, and it's the Wizard's answer to `Grapple`.

### Class pool (10)

| Card | Speed | Move | Keywords | Text | Role |
|---|---|---|---|---|---|
| **Emberbrand** | 3 | 0 | status, `Range 4` | `Burning 3` on the opponent. | Engine |
| **Scorch** | 2 | 0 | attack, `Range 2` | 5 damage. You gain `Burning 1`. | Fast + strong + drawback |
| **Arc Lightning** | 5 | 0 | attack, `Range 5` | 7 damage if distance ≥ 4, else 4. | Slow + strong |
| **Hex** | 3 | 1 | status, `Range 4` | `Exposed 2` on the opponent. | Setup |
| **Siphon** | 4 | 0 | attack, `Range 3` | 3 damage. If the opponent has `Burning`, remove the whole stack and deal that much again. | Cross-turn payoff |
| **Frost Lattice** | 4 | 1 | status, `Range 4` | `Snared 2` on the opponent. | Movement denial |
| **Mirror Ward** | 2 | 1 | defensive | `Interrupt 1`. `Warded 2`. | Efficient defense |
| **Counterspell** | 1 | 1 | defensive | `Interrupt 2`. | Anti-strip |
| **Phase Step** | 1 | 3 | movement, **Retain** | Your movement ignores obstacles this round. | Escape, banked |
| **Sigil of Recoil** | 4 | 0 | defensive | `Retaliate 1` — returns 5. `Retaliate 2` instead if you are second this round. | Slow + reactive |

**Notes.**
- **Every damage card here is movement 0.** That's the class's price and it
  should stay uniform — if even one ranged attack carries movement, the Wizard
  becomes a true kiter and §5's kiting concern stops being hypothetical.
- `Frost Lattice` is the new keystone. `Snared 2` cuts a Barbarian's basics turn
  from 2 movement to 0, which is the difference between closing and standing
  still. Watch its pick rate; if it's near 100%, movement denial is too strong
  against a class whose whole game is the budget.
- `Phase Step` at movement 3 is the only card in either list to break the
  design doc's 0–2 band, plus obstacle-ignoring on top. Deliberate — it's the
  Wizard's single get-out-of-a-corner card, and its cost is that it does
  literally nothing else.
- `Siphon` + `Emberbrand` is the intended state-based combo — both in deck, not
  both in hand. `Scorch`'s self-`Burning` is what makes it a real choice.

---

## 6. Barbarian

**Identity.** Moves by attacking. Every melee card carries a step, so closing
and fighting are the same action — but every defensive card plants them.

### Starting class cards (2)

| Card | Speed | Move | Keywords | Text |
|---|---|---|---|---|
| **Reckless Swing** | 2 | 0 | attack | 6 damage. You gain `Exposed 1`. |
| **Charge** | 3 | 3 | attack | 3 damage. |

`Charge` is the class's closing tool and the second card here to break the 0–2
movement band. It's what beats a Wizard holding distance at 2 movement per turn.
`Reckless Swing` is the opposite pole: the highest damage in either starting
deck, at movement 0 and a `+2 Exposed` on the next hit taken. Committing both is
4 movement and 9 damage but strips all defense — a legitimately greedy turn.

### Class pool (10)

| Card | Speed | Move | Keywords | Text | Role |
|---|---|---|---|---|---|
| **Bloodrage** | 2 | 1 | status | `Enraged 2` on yourself. | Engine |
| **Frenzy** | 1 | 2 | attack | 4 damage. You gain `Exposed 1`. | Fast + strong + drawback |
| **Cleave** | 5 | 0 | attack | 8 damage. | Slow + strong |
| **Headbutt** | 2 | 1 | attack | 3 damage. `Winded 1` on the opponent. | Tempo denial |
| **Grapple** | 3 | 2 | — | If adjacent: `Snared 3` on the opponent. | Matchup crux |
| **Stagger** | 1 | 2 | attack | 1 damage. `Interrupt 1`. | Low-payload interrupt |
| **Thick Hide** | 3 | 0 | defensive | `Warded 6`. | Durability |
| **Counterblow** | 4 | 0 | defensive | `Retaliate 2` — returns 3 each, or 5 each if you are second this round. | Slow + reactive |
| **Second Wind** | 4 | 1 | defensive, **Retain** | Remove all statuses and charges from yourself. | Reset |
| **Last Stand** | 3 | 0 | defensive | `Warded 3`. If your vitality ≤ 7: `Warded 6` and `Enraged 2` instead. | Conditional payoff |

**Notes.**
- **`Cleave` at movement 0 and speed 5 is the design doc's rooted-heavy card
  made literal.** Commit it and you are standing still, slowly, next to someone
  who wants to leave. It should only be correct when the Wizard is already
  cornered — if it's drafted and played freely, the movement pricing is too soft.
- `Grapple` carries movement 2 *and* `Snared 3`, so it closes and then removes
  the escape in one card. It's the direct counter to `Phase Step` and the first
  thing to nerf if the matchup skews Barbarian — levers in order: drop it to
  movement 1, reduce to `Snared 2`, or make it speed 4. Note `Repulse` beats it
  regardless, by design.
- **No card in this pool carries `Range`, on purpose.** A thrown axe is the
  obvious first addition if the Barbarian can't close on a drafted-up Wizard, but
  adding one now would blur the axis the prototype is meant to test.
- `Second Wind` clears your own `Warded` and `Retaliate` too. Intended; it's a
  panic button for `Snared` and `Burning`, not a free reset.

---

## 7. Sanity checks

**The approach.** From 5 hexes, a Barbarian playing `Charge` + `Strike` closes 4
and is adjacent next turn. A Wizard playing `Shield` + `Shield` opens 4 and deals
nothing. A Wizard playing `Spark` + `Shield` deals 2 and moves 2, matching the
Barbarian's basic closing rate exactly — so the Barbarian only gains ground by
drawing `Charge` or by the Wizard choosing damage over distance. That's the
intended pressure.

**Cornering.** On a 9-wide arena, a Wizard fleeing at net +2 per turn hits the
edge in three or four turns having dealt nothing. That's the brake on kiting,
and it's structural rather than a rule. If it turns out a Wizard can circle
indefinitely, obstacle density is the first lever, then §5's closing-arena idea.

**Damage budget.** Adjacent, a Barbarian basics turn deals 6 against the Wizard's
2 (`Spark` point-blanked). At range 3, it's 0 against 4. Against 20 vitality with
`Warded` absorbing roughly a third, duels should run 8–11 rounds early. If duel
one brushes the 15-round cap, cut starting vitality to 16 rather than inflating
the basics.

**Movement budget distribution.** Wizard turns span 0–4 (and 0–6 with
`Phase Step`); Barbarian turns span 0–4 (and 0–5 with `Charge` + `Frenzy`). The
distributions overlap heavily but sit on opposite cards — the Wizard buys
movement by not attacking, the Barbarian by not defending. Log which, because
that's the whole design claim in one metric.

**Draft math.** 10 starting cards plus 1–2 per round reaches ~20 by a 7-win run,
so a 10-card pool gets mostly seen. Deliberate for a prototype: the point is to
observe every card at least once.

---

## 8. What this prototype is actually testing

1. **Is movement priced correctly, or is it just a stat?** The design claim is
   that a 0-movement heavy card is a real cost. The tell is `Cleave` and
   `Reckless Swing`: if players commit them freely and still control position,
   the movement axis isn't doing work and every card can go up a point.
2. **Does hex distance settle, or oscillate?** §9 already calls for the
   distribution. The specific thing to watch here is whether it *bimodally*
   splits — Wizard duels living at 3–5 and Barbarian duels at 1 — which is the
   healthy outcome, versus collapsing to one value across both.
3. **Is `Snared` too strong?** It's the only thing in the game that attacks a
   per-round budget with no way to bank around it, and two cards apply it. If
   `Frost Lattice` and `Grapple` are first picks every time, the status needs a
   cap or a floor (e.g. movement can never be reduced below 1).
4. **Do the two charge types feel different?** `Interrupt` and `Retaliate` are
   mechanically parallel by design. Wizard leans interrupt, Barbarian leans
   retaliate. If players can't articulate the choice, collapse them into one
   keyword. Retaliate won't appear until drafted — see §4.
5. **Is the class fantasy legible from the starting deck alone?** Three unique
   cards is a thin signal, but it's the same thin signal Slay the Spire ships.
   If neither class reads as itself before the first draft, the fix is stronger
   class cards, not more of them.

**Not in scope, and should be cut if it creeps in:** weapons, relics, card
removal, upgrade merging, facing, line of sight, area effects, and any
cross-duel persistence.
