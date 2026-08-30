import { floorMod } from "../core/time.ts";

/**
 * Euclidean rhythms.
 *
 * E(k, n) distributes k onsets as evenly as possible over n pulses. Bjorklund derived it
 * for distributing pulses in an accelerator's timing system; Toussaint showed the results
 * are, rotation for rotation, a large fraction of the world's traditional timelines.
 *
 * Bjorklund's construction, not the `floor(i*k/n)` one. Tested over every (k, n) with
 * n <= 64, the cheap formulation is never structurally wrong — it always yields the same
 * necklace — but it differs by a rotation with no closed form, and the rotation is the
 * musical part. E(5,8) is the cinquillo one way and the habanera the other. Both are real
 * rhythms; only one is the one you asked for.
 *
 * Toussaint, "The Euclidean Algorithm Generates Traditional Musical Rhythms",
 * BRIDGES 2005: https://cgm.cs.mcgill.ca/~godfried/publications/banff-extended.pdf
 */
export function bjorklund(pulses: number, steps: number): number[] {
  if (steps <= 0) return [];
  const k = Math.max(0, Math.min(Math.floor(pulses), Math.floor(steps)));
  const n = Math.floor(steps);
  if (k === 0) return new Array<number>(n).fill(0);
  if (k === n) return new Array<number>(n).fill(1);

  let a: number[][] = Array.from({ length: k }, () => [1]);
  let b: number[][] = Array.from({ length: n - k }, () => [0]);
  let i = k;
  let j = n - k;

  // Repeated subtraction: pair each shorter group onto a longer one until one side has
  // at most a single group left. This is Euclid's algorithm with the remainders carried
  // as sequences rather than as numbers.
  while (Math.min(i, j) > 1) {
    if (i > j) {
      const head = a.slice(0, j);
      const tail = a.slice(j);
      a = head.map((x, m) => x.concat(b[m] ?? []));
      b = tail;
      [i, j] = [j, i - j];
    } else {
      const head = b.slice(0, i);
      const tail = b.slice(i);
      a = a.map((x, m) => x.concat(head[m] ?? []));
      b = tail;
      [i, j] = [i, j - i];
    }
  }

  return [...a.flat(), ...b.flat()];
}

/** E(k, n) rotated left by `rot`. Rotation is a first-class parameter, not an afterthought. */
export function euclid(pulses: number, steps: number, rot = 0): number[] {
  const p = bjorklund(pulses, steps);
  if (p.length === 0) return p;
  const r = floorMod(Math.floor(rot), p.length);
  return [...p.slice(r), ...p.slice(0, r)];
}

/** `x..x..x.` form, for tests and for the UI. */
export function toBox(pattern: readonly number[]): string {
  return pattern.map((v) => (v ? "x" : ".")).join("");
}

/** Gaps between onsets, wrapping — Toussaint's interval vector. E(3,8) is (332). */
export function intervalVector(pattern: readonly number[]): number[] {
  const onsets: number[] = [];
  for (let i = 0; i < pattern.length; i++) if (pattern[i]) onsets.push(i);
  if (onsets.length === 0) return [];
  return onsets.map((v, i) =>
    i === onsets.length - 1
      ? pattern.length - v + (onsets[0] ?? 0)
      : (onsets[i + 1] ?? 0) - v,
  );
}

/**
 * Named rhythms, as `(k, n, rotation)`.
 *
 * Almost every traditional timeline is a *rotation* of a Euclidean necklace rather than
 * the necklace itself, so two numbers are not enough to name one. Both Tidal and Strudel
 * keep this correspondence in source comments, which means `euclid("bossa")` cannot be
 * written against them; here it is data.
 *
 * Intervals and attributions from Toussaint's extended paper.
 */
export interface NamedRhythm {
  readonly name: string;
  readonly k: number;
  readonly n: number;
  readonly rot: number;
  /** Where it is played, or who used it. */
  readonly origin: string;
}

export const NAMED_RHYTHMS: readonly NamedRhythm[] = [
  { name: "tresillo", k: 3, n: 8, rot: 0, origin: "Cuba; also ragtime, jazz, EDM" },
  { name: "cinquillo", k: 5, n: 8, rot: 0, origin: "Cuba; Malfuf, Egypt" },
  { name: "habanera", k: 5, n: 8, rot: 6, origin: "Cuba; tango, merengue" },
  { name: "cumbia", k: 3, n: 4, rot: 2, origin: "Colombia; calypso, Trinidad" },
  { name: "baiao", k: 3, n: 4, rot: 0, origin: "Brazil; polos, Bali" },
  { name: "takeFive", k: 2, n: 5, rot: 2, origin: "Brubeck; Holst, Mars" },
  { name: "ruchenitza", k: 3, n: 7, rot: 0, origin: "Bulgaria; Pink Floyd, Money" },
  { name: "aksak", k: 4, n: 9, rot: 0, origin: "Turkey; Brubeck, Rondo a la Turk" },
  { name: "zappa", k: 4, n: 11, rot: 0, origin: "Frank Zappa, Outside Now" },
  { name: "fumeFume", k: 5, n: 12, rot: 10, origin: "West Africa" },
  { name: "columbiaBell", k: 5, n: 12, rot: 3, origin: "Cuba" },
  { name: "standardPattern", k: 7, n: 12, rot: 3, origin: "West Africa; the Ewe bell" },
  { name: "bossaNecklace", k: 5, n: 16, rot: 0, origin: "Brazil" },
  { name: "samba", k: 7, n: 16, rot: 14, origin: "Brazil" },
  { name: "bendir", k: 7, n: 8, rot: 0, origin: "Tuareg, Libya" },
  { name: "akaPygmy", k: 11, n: 24, rot: 0, origin: "Central African Republic" },
];

export function namedRhythm(name: string): number[] {
  const r = NAMED_RHYTHMS.find((x) => x.name === name);
  if (r === undefined) throw new Error(`unknown rhythm: ${name}`);
  return euclid(r.k, r.n, r.rot);
}
