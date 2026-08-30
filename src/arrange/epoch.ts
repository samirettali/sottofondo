import { valueAt } from "../core/rng.ts";

/**
 * Epochs: how a pattern persists, and when it changes.
 *
 * Generation is a pure function of its coordinates, so the obvious thing — key a pattern
 * on the bar number — produces a *different pattern every bar*. That is not generative
 * music, it is noise with a pulse. Groove depends on the listener learning the pattern,
 * so the complexity has to be repeated to be heard at all.
 *
 * So patterns are keyed on an **epoch** instead: a counter that advances only at phrase
 * boundaries, and only when a coin comes up. The epoch is computed from the bar rather
 * than accumulated, so seeking still works — jump to bar 500 and you get the pattern that
 * would have been playing there.
 *
 * The reference implementation regenerates each 303 line with probability 0.5 every 16
 * bars and the drums with probability 0.3; those cadences are well chosen and are the
 * defaults the presets inherit. Lowering them is the fastest way to make the output stop
 * sounding like music.
 */

export interface EpochSpec {
  /** Bars between decision points. */
  readonly every: number;
  /** Probability of advancing at each one. */
  readonly p: number;
  /** Separates independent epoch clocks that share a seed. */
  readonly salt: number;
}

/**
 * How many times this clock has advanced by `bar`.
 *
 * Linear in `bar / every`, which for any realistic session is a few hundred iterations —
 * cheaper than the memo that would replace it, and it keeps the function pure.
 */
export function epochAt(seed: number, bar: number, spec: EpochSpec): number {
  if (spec.every <= 0 || spec.p <= 0) return 0;
  if (spec.p >= 1) return Math.floor(bar / spec.every);
  let epoch = 0;
  for (let b = spec.every; b <= bar; b += spec.every) {
    if (valueAt(seed, b, spec.salt, EPOCH_SALT) < spec.p) epoch++;
  }
  return epoch;
}

/** The bar at which the current epoch began, for phrase-relative decisions. */
export function epochStart(seed: number, bar: number, spec: EpochSpec): number {
  if (spec.every <= 0 || spec.p <= 0) return 0;
  const current = epochAt(seed, bar, spec);
  let start = 0;
  let epoch = 0;
  for (let b = spec.every; b <= bar; b += spec.every) {
    if (spec.p >= 1 || valueAt(seed, b, spec.salt, EPOCH_SALT) < spec.p) {
      epoch++;
      if (epoch === current) {
        start = b;
        break;
      }
    }
  }
  return start;
}

const EPOCH_SALT = 0x5c0;

/** Salts for the epoch clocks a genre runs. */
export const EPOCHS = {
  pattern: 1,
  notes: 2,
  mute: 3,
} as const;

/**
 * Whether a voice is muted for the block containing `bar`.
 *
 * Re-rolled on a fixed cadence rather than on a coin per bar: a voice that vanishes for
 * one bar and returns sounds like a dropout, one that vanishes for eight sounds like an
 * arrangement.
 */
export function isMuted(
  seed: number,
  bar: number,
  voiceIndex: number,
  every: number,
  muteP: number,
): boolean {
  if (muteP <= 0 || every <= 0) return false;
  const block = Math.floor(bar / every);
  return valueAt(seed, block, voiceIndex, MUTE_SALT) < muteP;
}

const MUTE_SALT = 0x11de;

/**
 * How strongly this bar should differ from the ones around it, from its position in the
 * phrase alone. Zero everywhere except at phrase boundaries, strongest at 32 bars.
 *
 * Used for fills and for scaling variation; the two-tier shape (a subtle marker
 * mid-phrase, a stronger one to close it) is what a drummer does and costs one
 * expression.
 */
export function variationStrength(bar: number): number {
  if (bar % 32 === 31) return 1;
  if (bar % 16 === 15) return 0.7;
  if (bar % 8 === 7) return 0.45;
  if (bar % 4 === 3) return 0.2;
  return 0;
}
