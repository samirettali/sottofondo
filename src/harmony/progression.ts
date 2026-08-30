import { choose, rngFor, weighted } from "../core/rng.ts";
import { parseChord, type Chord } from "./chords.ts";

/**
 * Choosing a progression.
 *
 * Two sources, and a genre says how much of each it wants:
 *
 *   - a **pool** of hand-written progressions, which is what a genre actually is. Deep
 *     house is not "a Markov chain over roman numerals"; it is a handful of vamps.
 *   - a **transition matrix** for walking somewhere less predictable, from the McGill
 *     Billboard corpus (730 Hot 100 songs, 1958–91).
 *
 * The matrix is worth having because it disagrees with textbook function theory in a way
 * that matters: V→IV is 0.196, and in de Clercq and Temperley's rock corpus `V IV I`
 * appears 292 times against `IV V I`'s 352. The classical prohibition on retrogression
 * simply does not hold in popular music, and a generator that enforces it sounds wrong
 * for every genre this project cares about.
 */

/** Degrees in matrix order. */
export const DEGREES = [
  "I",
  "bII",
  "II",
  "bIII",
  "III",
  "IV",
  "bV",
  "V",
  "bVI",
  "VI",
  "bVII",
  "VII",
] as const;

export type Degree = (typeof DEGREES)[number];

/**
 * McGill Billboard transition probabilities, rows normalised, self-transitions zero by
 * construction.
 *
 * Shaffer, Vasiliev, Devaney & Turner, "A cluster analysis of harmony in the McGill
 * Billboard dataset", Empirical Musicology Review 14(3–4), 2019, Table 2.
 */
// prettier-ignore
export const MCGILL: readonly (readonly number[])[] = [
  /* I     */ [0.000, 0.005, 0.089, 0.044, 0.031, 0.347, 0.002, 0.227, 0.049, 0.107, 0.092, 0.007],
  /* bII   */ [0.441, 0.000, 0.159, 0.043, 0.058, 0.038, 0.066, 0.087, 0.055, 0.000, 0.038, 0.014],
  /* II    */ [0.228, 0.020, 0.000, 0.009, 0.056, 0.125, 0.002, 0.465, 0.010, 0.050, 0.031, 0.003],
  /* bIII  */ [0.162, 0.043, 0.114, 0.000, 0.019, 0.255, 0.000, 0.092, 0.131, 0.009, 0.167, 0.007],
  /* III   */ [0.060, 0.012, 0.162, 0.036, 0.000, 0.279, 0.006, 0.084, 0.000, 0.346, 0.005, 0.008],
  /* IV    */ [0.504, 0.001, 0.052, 0.027, 0.039, 0.000, 0.007, 0.268, 0.024, 0.026, 0.050, 0.001],
  /* bV    */ [0.216, 0.059, 0.054, 0.007, 0.027, 0.216, 0.000, 0.230, 0.056, 0.000, 0.041, 0.095],
  /* V     */ [0.618, 0.001, 0.040, 0.005, 0.030, 0.196, 0.005, 0.000, 0.028, 0.053, 0.024, 0.001],
  /* bVI   */ [0.213, 0.022, 0.002, 0.093, 0.003, 0.096, 0.020, 0.214, 0.000, 0.045, 0.286, 0.006],
  /* VI    */ [0.153, 0.007, 0.273, 0.001, 0.094, 0.286, 0.001, 0.132, 0.017, 0.000, 0.028, 0.008],
  /* bVII  */ [0.399, 0.001, 0.013, 0.057, 0.006, 0.289, 0.000, 0.103, 0.084, 0.041, 0.000, 0.007],
  /* VII   */ [0.209, 0.030, 0.045, 0.030, 0.414, 0.092, 0.045, 0.030, 0.000, 0.046, 0.060, 0.000],
];

export interface ProgressionDef {
  /** Roman numerals, in order. */
  readonly chords: readonly string[];
  /** Bars each chord lasts. */
  readonly barsPerChord: number;
  readonly weight?: number;
}

export interface HarmonyDef {
  /** Weighted pool of progressions. A genre is mostly this. */
  readonly pool: readonly ProgressionDef[];
  /**
   * Probability of walking the McGill matrix instead of taking a pooled progression.
   * Zero for genres whose harmony is a fixed vamp.
   */
  readonly walkP?: number;
  /** Length of a walked progression, in chords. */
  readonly walkLength?: number;
  readonly walkBarsPerChord?: number;
}

export interface Progression {
  readonly chords: readonly Chord[];
  readonly barsPerChord: number;
}

const SALT = { pick: 20, walk: 21 } as const;

/** Pick a progression for a harmonic epoch. Deterministic in its coordinates. */
export function chooseProgression(
  def: HarmonyDef,
  seed: number,
  epoch: number,
  laneIndex: number,
): Progression {
  const rng = rngFor(seed, epoch, laneIndex, SALT.pick);

  if (def.walkP !== undefined && def.walkP > 0 && rng() < def.walkP) {
    const length = def.walkLength ?? 4;
    return {
      chords: walk(length, seed, epoch, laneIndex).map((d) => parseChord(d)),
      barsPerChord: def.walkBarsPerChord ?? 1,
    };
  }

  const chosen = weighted(
    rng,
    def.pool.map((p) => [p, p.weight ?? 1] as const),
  );
  return {
    chords: chosen.chords.map((c) => parseChord(c)),
    barsPerChord: chosen.barsPerChord,
  };
}

/**
 * Walk the transition matrix from the tonic.
 *
 * Always starts and, if it can, ends on I: a walked progression still has to be a
 * progression, and the matrix on its own will happily wander off and stay there.
 */
export function walk(length: number, seed: number, epoch: number, laneIndex: number): Degree[] {
  const rng = rngFor(seed, epoch, laneIndex, SALT.walk);
  const out: Degree[] = ["I"];
  let current = 0;

  for (let i = 1; i < length; i++) {
    const row = MCGILL[current];
    if (row === undefined) break;
    const options = row
      .map((p, index) => [index, p] as const)
      .filter(([, p]) => p > 0);
    if (options.length === 0) break;
    current = weighted(rng, options);
    out.push(DEGREES[current] ?? "I");
  }
  return out;
}

/** Which chord of the progression is sounding in a given bar. */
export function chordAt(progression: Progression, bar: number): Chord {
  const total = progression.chords.length * progression.barsPerChord;
  const index = Math.floor((((bar % total) + total) % total) / progression.barsPerChord);
  const chord = progression.chords[index];
  if (chord === undefined) throw new Error("empty progression");
  return chord;
}

/** How many bars the progression takes to come round. */
export function progressionBars(progression: Progression): number {
  return progression.chords.length * progression.barsPerChord;
}

/** A key for a harmonic epoch: a pitch class, weighted towards the genre's preferences. */
export function chooseKey(
  preferences: readonly number[] | undefined,
  seed: number,
  epoch: number,
  laneIndex: number,
): number {
  const rng = rngFor(seed, epoch, laneIndex, SALT.pick + 1);
  if (preferences === undefined || preferences.length === 0) {
    return Math.floor(rng() * 12);
  }
  return choose(rng, preferences);
}
