import { rngFor, weighted, type Rng } from "../core/rng.ts";
import { degToMidi, midiToDeg } from "../harmony/scales.ts";

/**
 * A melodic line as a weighted walk over scale degrees.
 *
 * Working in degrees means every note is in the key by construction; the only decisions
 * are *which way* and *how far*. The weights come from what melodic corpora actually show
 * — steps about half the time, thirds a fifth, everything larger rare — with three biases
 * layered on top, each one a few lines:
 *
 *   - Narmour's gap-fill: after a leap, reverse and fill it. After a step, keep going.
 *   - Gravity: a pull back towards the middle of the register, so the line wanders
 *     without pinning itself to a ceiling.
 *   - Contour: an arch across the bar. Huron measured it as the commonest phrase shape
 *     by a wide margin, and defaulting to it is the cheapest thing that makes a
 *     generated line sound like a melody rather than a sequence.
 *
 * Chord tones pull on strong steps, so the line agrees with the harmony where it
 * matters and is free to pass between it elsewhere.
 *
 * Stateless per bar: the walk starts each bar from a degree derived from the coordinates,
 * so seeking gives the bar it would have played. Musically that is a re-anchoring at the
 * bar line, which a phrase does anyway.
 */

export interface WalkOptions {
  readonly scale: readonly number[];
  readonly key: number;
  /** MIDI bounds. */
  readonly lo: number;
  readonly hi: number;
  /** Scales the odds of anything larger than a step. 0.3 for a bass, 1 for a lead. */
  readonly leapiness: number;
  /** 0 = free walk, 4 = the contour is traced literally. */
  readonly contourStrength: number;
  /** Chord pitch classes, and how hard they pull on strong steps. */
  readonly chordPcs: readonly number[];
  readonly chordPull: number;
}

const STEP_WEIGHTS: readonly (readonly [number, number])[] = [
  [0, 0.06],
  [1, 0.24],
  [-1, 0.26],
  [2, 0.1],
  [-2, 0.09],
  [3, 0.05],
  [-3, 0.04],
  [4, 0.04],
  [-4, 0.03],
  [5, 0.015],
  [-5, 0.01],
  [7, 0.02],
  [-7, 0.02],
];

/**
 * Pitches for the given steps of one bar.
 *
 * `steps` are the gated positions (from the pattern generator) and `strong` says which of
 * them sit on a beat, so the chord pull knows where to act.
 */
export function walkBar(
  steps: readonly number[],
  strong: readonly boolean[],
  len: number,
  opts: WalkOptions,
  seed: number,
  bar: number,
  laneIndex: number,
): number[] {
  if (steps.length === 0) return [];
  const rng = rngFor(seed, bar, laneIndex, SALT);
  const n = opts.scale.length;
  const loDeg = midiToDeg(opts.lo, opts.scale, opts.key, 0);
  const hiDeg = midiToDeg(opts.hi, opts.scale, opts.key, 0);
  const centre = (loDeg + hiDeg) / 2;
  const span = Math.max(1, hiDeg - loDeg);

  // Start near the centre, on a chord tone when one is close.
  let degree = Math.round(centre + (rng() - 0.5) * span * 0.4);
  degree = snapToChord(degree, opts, 2);
  let lastInterval = 0;

  const out: number[] = [];
  steps.forEach((step, i) => {
    if (i > 0) {
      const u = step / Math.max(1, len - 1);
      const w = biased(degree, lastInterval, u, opts, loDeg, hiDeg, centre, span, strong[i] ?? false, n);
      const interval = weighted(rng, w);
      degree += interval;
      lastInterval = interval;
    }
    out.push(degToMidi(degree, opts.scale, opts.key, 0));
  });
  return out;
}

const SALT = 30;

function biased(
  degree: number,
  lastInterval: number,
  u: number,
  opts: WalkOptions,
  loDeg: number,
  hiDeg: number,
  centre: number,
  span: number,
  strong: boolean,
  n: number,
): (readonly [number, number])[] {
  const mag = Math.abs(lastInterval);
  const dir = Math.sign(lastInterval);
  const x = (degree - centre) / (span / 2); // -1..1 across the register
  const target = centre + (Math.sin(Math.PI * u) - 0.5) * span * 0.6; // the arch

  return STEP_WEIGHTS.map(([interval, base]) => {
    let w = base;
    if (interval !== 0 && Math.abs(interval) >= 2) w *= opts.leapiness;

    // Narmour: a leap implies reversal and fill; a step implies continuation.
    if (mag >= 3) {
      if (Math.sign(interval) === -dir) w *= 3;
      else if (interval !== 0) w *= 0.25;
      if (Math.abs(interval) > mag) w *= 0.15;
    } else if (mag >= 1 && Math.sign(interval) === dir) {
      w *= 1.4;
    }

    // Gravity: leaning out of the register costs, moving back is rewarded.
    const next = degree + interval;
    if (next < loDeg || next > hiDeg) w *= 0.001;
    else if (Math.sign(interval) === -Math.sign(x)) w *= 1 + 1.5 * x * x;
    else if (interval !== 0) w *= Math.max(0.05, 1 - 1.2 * x * x);

    // Contour: nearer the arch is better, scaled by how obedient the line should be.
    const err = Math.abs(next - target) / span;
    w *= Math.exp(-opts.contourStrength * err);

    // Chord tones on strong steps.
    if (strong && opts.chordPull > 0 && opts.chordPcs.length > 0) {
      const pc = ((degToMidi(next, opts.scale, opts.key, 0) % 12) + 12) % 12;
      if (opts.chordPcs.includes(pc)) w *= 1 + opts.chordPull;
      else w *= 1 / (1 + 0.5 * opts.chordPull);
    }
    void n;
    return [interval, Math.max(1e-6, w)] as const;
  });
}

/** Move a degree to the nearest chord tone within `reach` degrees, if any. */
function snapToChord(degree: number, opts: WalkOptions, reach: number): number {
  if (opts.chordPcs.length === 0) return degree;
  for (let d = 0; d <= reach; d++) {
    for (const candidate of [degree + d, degree - d]) {
      const pc = ((degToMidi(candidate, opts.scale, opts.key, 0) % 12) + 12) % 12;
      if (opts.chordPcs.includes(pc)) return candidate;
    }
  }
  return degree;
}

/** Exposed for tests: the raw prior, so its shape can be asserted. */
export function stepPrior(): readonly (readonly [number, number])[] {
  return STEP_WEIGHTS;
}

export type { Rng };
