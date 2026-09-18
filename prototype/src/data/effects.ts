import { EffectCtx, attack, damage, gain, push } from "../engine/combat";
import { clearStatus, emit, total } from "../engine/state";

type Effect = (c: EffectCtx) => void;

const me = (c: EffectCtx) => c.s.fighters[c.side];
const foe = (c: EffectCtx) => c.s.fighters[c.opp];

// Card text lives in somatic-tempo-cards.csv; this is its executable form.
export const EFFECTS: Record<string, Effect> = {
  // ── Wizard ──
  Spark: (c) => void attack(c, 2),
  Shield: (c) => gain(c, c.side, "Warded", 2),
  "Arcane Bolt": (c) => void attack(c, c.dist >= 4 ? 6 : 4),
  Repulse: (c) => {
    push(c, 2);
    gain(c, c.opp, "Interrupt", 1);
  },
  Emberbrand: (c) => gain(c, c.opp, "Burning", 3),
  Scorch: (c) => {
    if (attack(c, 5)) gain(c, c.side, "Burning", 1);
  },
  "Arc Lightning": (c) => void attack(c, c.dist >= 4 ? 7 : 4),
  Hex: (c) => gain(c, c.opp, "Exposed", 2),
  Siphon: (c) => {
    const burning = total(foe(c), "Burning");
    if (attack(c, 3) && burning > 0 && foe(c).vitality > 0) {
      clearStatus(foe(c), "Burning");
      damage(c.s, c.opp, burning, "Siphon");
    }
  },
  "Frost Lattice": (c) => gain(c, c.opp, "Snared", 2),
  "Mirror Ward": (c) => {
    gain(c, c.opp, "Interrupt", 1);
    gain(c, c.side, "Warded", 2);
  },
  Counterspell: (c) => gain(c, c.opp, "Interrupt", 2),
  "Phase Step": (c) => emit(c.s, c.side, "info", "Movement ignores obstacles this round."),
  "Sigil of Recoil": (c) => gain(c, c.side, "Retaliate", c.second ? 2 : 1, 5),

  // ── Barbarian ──
  Strike: (c) => void attack(c, 3),
  Brace: (c) => gain(c, c.side, "Warded", 4),
  "Reckless Swing": (c) => {
    if (attack(c, 6)) gain(c, c.side, "Exposed", 1);
  },
  Charge: (c) => void attack(c, 3),
  Bloodrage: (c) => gain(c, c.side, "Enraged", 2),
  Frenzy: (c) => {
    if (attack(c, 4)) gain(c, c.side, "Exposed", 1);
  },
  Cleave: (c) => void attack(c, 8),
  Headbutt: (c) => {
    if (attack(c, 3)) gain(c, c.opp, "Winded", 1);
  },
  Grapple: (c) => {
    if (c.dist === 1) gain(c, c.opp, "Snared", 3);
    else emit(c.s, c.side, "info", "Grapple needs the opponent adjacent — no effect.");
  },
  Stagger: (c) => {
    if (attack(c, 1)) gain(c, c.opp, "Interrupt", 1);
  },
  "Thick Hide": (c) => gain(c, c.side, "Warded", 6),
  Counterblow: (c) => gain(c, c.side, "Retaliate", 2, c.second ? 5 : 3),
  "Second Wind": (c) => {
    me(c).stacks = [];
    emit(c.s, c.side, "status", `${me(c).cls} clears all statuses and charges.`);
  },
  "Last Stand": (c) => {
    if (me(c).vitality <= 7) {
      gain(c, c.side, "Warded", 6);
      gain(c, c.side, "Enraged", 2);
    } else gain(c, c.side, "Warded", 3);
  },
};
