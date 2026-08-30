import { intoRange } from "./scales.ts";

/**
 * Roman numerals to pitch classes, and pitch classes to voicings.
 *
 * A chord symbol here is a roman numeral with an optional quality suffix: `i`, `IV`,
 * `bVII`, `ii7`, `V7`, `Imaj7`, `i9`, `IVmaj7`. Case carries the third, as in the
 * literature — lowercase minor, uppercase major — and the suffix carries everything
 * above it.
 */

/** Semitones above the tonic for each numeral. */
const DEGREE_SEMITONES: Record<string, number> = {
  i: 0,
  bii: 1,
  ii: 2,
  biii: 3,
  iii: 4,
  iv: 5,
  bv: 6,
  v: 7,
  bvi: 8,
  vi: 9,
  bvii: 10,
  vii: 11,
};

/** Intervals above the chord root, by quality. */
const QUALITIES: Record<string, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  power: [0, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "13": [0, 4, 7, 10, 14, 21],
  quartal: [0, 5, 10, 15],
};

export interface Chord {
  /** Semitones above the tonic. */
  readonly root: number;
  /** Intervals above the chord root. */
  readonly intervals: readonly number[];
  readonly symbol: string;
}

/**
 * Parse a roman numeral.
 *
 * Throws rather than guessing: a typo in a preset should fail a test, not quietly
 * transpose a progression into something else.
 */
export function parseChord(symbol: string): Chord {
  const match = /^(b|#)?([ivIV]+)(.*)$/.exec(symbol.trim());
  if (match === null) throw new Error(`unparseable chord: ${symbol}`);
  const [, accidental = "", numeral = "", suffix = ""] = match;

  const base = DEGREE_SEMITONES[(accidental === "b" ? "b" : "") + numeral.toLowerCase()];
  if (base === undefined) throw new Error(`unknown degree: ${symbol}`);
  const root = ((base + (accidental === "#" ? 1 : 0)) % 12 + 12) % 12;

  const isMinor = numeral === numeral.toLowerCase();
  const quality = resolveQuality(suffix, isMinor);
  const intervals = QUALITIES[quality];
  if (intervals === undefined) throw new Error(`unknown chord quality: ${symbol}`);

  return { root, intervals, symbol };
}

function resolveQuality(suffix: string, isMinor: boolean): string {
  const s = suffix.trim();
  if (s === "") return isMinor ? "minor" : "major";
  if (s === "7") return isMinor ? "m7" : "7";
  if (s === "9") return isMinor ? "m9" : "9";
  if (s === "6") return isMinor ? "m6" : "6";
  if (s === "add9") return isMinor ? "madd9" : "add9";
  if (s === "°" || s === "dim" || s === "o") return "dim";
  if (s === "ø" || s === "m7b5" || s === "-7b5") return "m7b5";
  return s;
}

/** Chord tones as MIDI, in the given key, without voice leading. */
export function chordTones(chord: Chord, keyRoot: number, octave = 4): number[] {
  const base = keyRoot + 12 * octave + chord.root;
  return chord.intervals.map((i) => base + i);
}

/**
 * Voice a chord as close as possible to the previous one.
 *
 * The cheapest useful voice leading there is: rotate through inversions and take the one
 * whose notes move least in total. Fifteen lines, and it removes the artefact that makes
 * generated harmony sound amateurish — chords jumping around the register between bars
 * because each was voiced from scratch.
 */
export function voiceLead(
  chord: Chord,
  keyRoot: number,
  previous: readonly number[] | null,
  lo: number,
  hi: number,
): number[] {
  const pcs = chord.intervals.map((i) => ((keyRoot + chord.root + i) % 12 + 12) % 12);
  const candidates: number[][] = [];

  // Every inversion, in every octave that fits the register.
  for (let inversion = 0; inversion < pcs.length; inversion++) {
    for (let octave = 0; octave <= 8; octave++) {
      const notes: number[] = [];
      let last = -Infinity;
      for (let i = 0; i < pcs.length; i++) {
        const pc = pcs[(i + inversion) % pcs.length] ?? 0;
        let n = 12 * octave + pc;
        while (n <= last) n += 12; // keep the voicing ascending: no crossing
        notes.push(n);
        last = n;
      }
      if (notes[0]! >= lo && notes.at(-1)! <= hi) candidates.push(notes);
    }
  }

  if (candidates.length === 0) {
    // Nothing fits the register, so fall back to close position folded into it.
    return pcs.map((pc, i) => intoRange(12 * 4 + pc + (i > 0 ? 12 : 0), lo, hi)).sort((a, b) => a - b);
  }
  if (previous === null || previous.length === 0) {
    // No history: take the voicing nearest the middle of the register.
    const centre = (lo + hi) / 2;
    return pick(candidates, (notes) => Math.abs(average(notes) - centre));
  }

  return pick(candidates, (notes) => cost(previous, notes));
}

/** Total motion, plus a bonus for common tones and a penalty for any large single leap. */
function cost(previous: readonly number[], next: readonly number[]): number {
  let total = 0;
  const n = Math.min(previous.length, next.length);
  for (let i = 0; i < n; i++) {
    const move = Math.abs((next[i] ?? 0) - (previous[i] ?? 0));
    total += move;
    if (move === 0) total -= 1.5; // holding a tone is worth more than moving a little
    if (move > 7) total += 4; // one voice should not leap while the others step
  }
  // Voicings of different sizes: charge for the difference rather than ignoring it.
  total += Math.abs(previous.length - next.length) * 2;
  return total;
}

function pick(candidates: number[][], score: (notes: number[]) => number): number[] {
  let best = candidates[0] ?? [];
  let bestScore = Infinity;
  for (const c of candidates) {
    const s = score(c);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

function average(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
