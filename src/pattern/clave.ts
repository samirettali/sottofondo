import { floorMod } from "../core/time.ts";

/**
 * Clave and bell timelines.
 *
 * These are a table rather than a formula, and that is the point: son clave is *almost*
 * maximally even, not maximally even, so it is not E(5,16) and is not even a rotation of
 * it — it cannot be derived from Bjorklund at all. E(5,16) is the bossa-nova necklace,
 * and the bossa clave is one of its rotations. Getting this wrong is the commonest error
 * in Euclidean sequencers.
 *
 * Toussaint's account of why son dominates: its interval-vector distance to the other
 * five is the smallest (8.47, against shiko 11.02, soukous 12.48, gahu 14.80), and it is
 * the only one of the sixteen almost-maximally-even 5-in-16 rhythms whose contour is a
 * rotation of its own shadow contour.
 *
 * https://cgm.cs.mcgill.ca/~godfried/publications/clave.pdf
 */

export interface Timeline {
  readonly name: string;
  readonly box: string;
  /** Inter-onset intervals, wrapping. */
  readonly intervals: readonly number[];
  readonly origin: string;
}

export const TIMELINES: readonly Timeline[] = [
  {
    name: "shiko",
    box: "x...x.x...x.x...",
    intervals: [4, 2, 4, 2, 4],
    origin: "West Africa",
  },
  {
    name: "son",
    box: "x..x..x...x.x...",
    intervals: [3, 3, 4, 2, 4],
    origin: "Cuba — the most widespread of the six",
  },
  {
    name: "soukous",
    box: "x..x..x...xx....",
    intervals: [3, 3, 4, 1, 5],
    origin: "Congo",
  },
  {
    name: "rumba",
    box: "x..x...x..x.x...",
    intervals: [3, 4, 3, 2, 4],
    origin: "Cuba",
  },
  {
    name: "bossa",
    box: "x..x..x...x..x..",
    intervals: [3, 3, 4, 3, 3],
    origin: "Brazil — a rotation of E(5,16), the only one of the six that is Euclidean",
  },
  {
    name: "gahu",
    box: "x..x..x...x...x.",
    intervals: [3, 3, 4, 4, 2],
    origin: "Ghana",
  },
  {
    name: "tresillo",
    box: "x..x..x.",
    intervals: [3, 3, 2],
    origin: "Cuba — the 8-pulse ancestor of the 16-pulse claves",
  },
];

export type TimelineName = (typeof TIMELINES)[number]["name"];

function parseBox(box: string): number[] {
  return [...box].map((c) => (c === "x" ? 1 : 0));
}

/** A timeline as a step array, optionally rotated. */
export function timeline(name: string, rot = 0): number[] {
  const t = TIMELINES.find((x) => x.name === name);
  if (t === undefined) throw new Error(`unknown timeline: ${name}`);
  const p = parseBox(t.box);
  const r = floorMod(Math.floor(rot), p.length);
  return [...p.slice(r), ...p.slice(0, r)];
}

/**
 * The 3-2 / 2-3 distinction: a clave played from its second half. In Latin practice the
 * whole arrangement follows whichever side the tune is in, so it is a real parameter
 * rather than a rotation by an arbitrary amount.
 */
export function reverseSides(pattern: readonly number[]): number[] {
  const half = pattern.length / 2;
  if (!Number.isInteger(half)) return [...pattern];
  return [...pattern.slice(half), ...pattern.slice(0, half)];
}

/**
 * Arom's rhythmic oddity, computed rather than looked up: is there a pair of onsets that
 * cuts the cycle into two equal halves? Rotation-invariant, so it is a property of the
 * necklace.
 */
export function hasRhythmicOddity(pattern: readonly number[]): boolean {
  const n = pattern.length;
  if (n % 2 !== 0) return true;
  const half = n / 2;
  for (let i = 0; i < n; i++) {
    if (pattern[i] && pattern[(i + half) % n]) return false;
  }
  return true;
}
