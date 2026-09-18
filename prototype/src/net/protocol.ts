import type { Action, Side } from "../engine/state";

/**
 * The relay carries `Action`s, not game states: seed plus an ordered action log
 * fully determines a duel (see rules.test.ts "is reproducible from a seed"), so
 * both clients replay the same log through the same engine.
 *
 * Note that `commit.cards` and `play.index` are *indices* into the hand and the
 * committed pair. That is safe only because every client holds an identical
 * hand, which holds only because nothing mutates state outside this log. If a
 * card is ever added that draws, discards or reorders the hand mid-round,
 * `commit` must start carrying card names instead of indices.
 */
export type ClientMessage =
  /** Sent on every (re)connect. `clientId` is what reclaims a seat on refresh. */
  | { t: "hello"; clientId: string; want?: Side }
  /** `at` is the log length the client expects this action to land at. */
  | { t: "act"; action: Action; at: number }
  | { t: "rematch" };

export type ServerMessage =
  | {
      t: "welcome";
      matchId: string;
      seed: number;
      /** The side this client controls; null means spectator. */
      side: Side | null;
      log: Action[];
      seated: [boolean, boolean];
    }
  /** Actions appended to the log, starting at index `from`. */
  | { t: "actions"; from: number; actions: Action[] }
  /** A side has locked in. Deliberately carries no card data. */
  | { t: "committed"; side: Side }
  | { t: "seated"; seated: [boolean, boolean] }
  | { t: "reset"; matchId: string; seed: number }
  | { t: "error"; code: "not-seated" | "rejected" | "stale"; message: string };

const ADJECTIVES = [
  "teal", "amber", "brisk", "candid", "dusky", "eager", "fleet", "grim",
  "hollow", "ivory", "jagged", "keen", "lucid", "murky", "noble", "opal",
  "prime", "quiet", "rapid", "stark", "tidal", "umber", "vivid", "wary",
];

const NOUNS = [
  "otter", "falcon", "cinder", "dagger", "ember", "fathom", "glyph", "harbor",
  "ingot", "jasper", "kestrel", "lantern", "marrow", "nettle", "onyx", "pillar",
  "quarry", "ribbon", "sigil", "talon", "urchin", "vellum", "warden", "zephyr",
];

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** A short, speakable room code: "teal-otter". */
export function randomRoomCode(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

/** Accept a user-typed code, or reject it. Rooms are created on first join. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return /^[a-z0-9][a-z0-9-]{0,31}$/.test(code) ? code : null;
}
