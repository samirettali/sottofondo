/**
 * Musical time.
 *
 * Two rules hold everything else together:
 *
 *   1. The step index is an absolute integer that is never wrapped and never
 *      accumulated into. `nextBeat += delta` drifts over hours; `i * delta` does not.
 *      At 16ths and 200 BPM, MAX_SAFE_INTEGER is about 180 million years away.
 *   2. Beats are derived from that integer, and seconds are derived from beats exactly
 *      once, at scheduling time. Nothing musical is ever derived from wall-clock time.
 */

/** Wrap into [0, m). JS `%` is remainder, so a negative rotation breaks it silently. */
export function floorMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

/**
 * A piecewise-constant tempo, anchored so that a BPM change does not retroactively move
 * everything already scheduled. On a change, re-anchor at the current position first.
 */
export interface TempoMap {
  bpm: number;
  /** The beat that `anchorTime` corresponds to. */
  anchorBeat: number;
  /** An `AudioContext.currentTime` value. */
  anchorTime: number;
}

export function tempoMap(bpm: number, atTime = 0, atBeat = 0): TempoMap {
  return { bpm, anchorBeat: atBeat, anchorTime: atTime };
}

export function beatToTime(map: TempoMap, beat: number): number {
  return map.anchorTime + ((beat - map.anchorBeat) * 60) / map.bpm;
}

export function timeToBeat(map: TempoMap, time: number): number {
  return map.anchorBeat + ((time - map.anchorTime) * map.bpm) / 60;
}

/**
 * Re-anchor at `atTime` and adopt a new tempo there. Everything before the anchor keeps
 * the old mapping, so already-scheduled events stay where they were.
 */
export function setBpm(map: TempoMap, bpm: number, atTime: number): TempoMap {
  return { bpm, anchorBeat: timeToBeat(map, atTime), anchorTime: atTime };
}

/**
 * One sequencer lane.
 *
 * `len` different across tracks gives polymeter — grids align, phrase downbeats drift,
 * and the composite repeats after the LCM. `rate` different gives polyrhythm — downbeats
 * align, grids do not. They are genuinely different mechanisms and both are exposed.
 *
 * `rotation` moves the content on the grid; `offsetBeats` delays the lane off the grid.
 * They are not redundant.
 */
export interface Track {
  /** Pattern length in steps. */
  len: number;
  /** Rate multiplier as a fraction: 3/2 plays this lane half again as fast. */
  rateNum: number;
  rateDen: number;
  /** Steps to rotate the pattern content by, on the grid. */
  rotation: number;
  /** Constant offset in beats, off the grid. */
  offsetBeats: number;
}

export function track(len: number, over: Partial<Track> = {}): Track {
  return { len, rateNum: 1, rateDen: 1, rotation: 0, offsetBeats: 0, ...over };
}

/** Which index of this track's pattern step `i` reads. Rotation lives here. */
export function patternIndex(t: Track, i: number): number {
  return floorMod(i - t.rotation, t.len);
}

/**
 * The beat an absolute step index falls on. `stepsPerBeat` is the base grid (4 for
 * 16ths); the rate multiplier scales it per track.
 *
 * The result is deliberately fractional-friendly: fills and flams pass non-integer `i`
 * so they can land between grid positions, which is the difference between a fill that
 * sounds programmed and one that sounds played.
 */
export function beatOfStep(t: Track, i: number, stepsPerBeat = 4): number {
  return t.offsetBeats + (i * t.rateDen) / (stepsPerBeat * t.rateNum);
}

/**
 * How many base-grid steps before every track realigns.
 *
 * Maximal exactly when the lengths are pairwise coprime — 6 against 16 shares a factor
 * of 2 and realigns in 48, not 96. Worth showing in the UI: "repeats in 35 bars" is the
 * single most useful readout a polymetric sequencer can give.
 */
export function compositeCycleSteps(tracks: readonly Track[]): number {
  if (tracks.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const t of tracks) {
    const n = t.len * t.rateDen;
    num = num === 0 ? n : lcm(num, n);
    den = den === 0 ? t.rateNum : gcd(den, t.rateNum);
  }
  return num / den;
}

/**
 * Linn/MPC swing: delay the second sixteenth of each pair, expressed as the ratio of the
 * two durations. 50% is straight, 66.67% is a true triplet, and above 75% the delayed
 * note lands on the following eighth — which is why the range stops there.
 *
 * `amount` scales the effect per voice, so hats can swing fully while the kick stays
 * straight. That per-voice depth is the control producers actually reach for and almost
 * no toy exposes.
 *
 * Returns an offset in beats, to be added to the nominal position.
 */
export function swingOffsetBeats(
  step: number,
  swing: number,
  subdiv: 8 | 16 = 16,
  amount = 1,
  stepsPerBeat = 4,
): number {
  // Which grid position the swing is measured against: 16ths delay every other 16th,
  // 8ths delay every other 8th.
  const pairStride = subdiv === 16 ? stepsPerBeat / 2 : stepsPerBeat;
  const half = pairStride / 2;
  if (half < 1) return 0;
  // Only the exact off-position of each pair moves. A step that falls between the two
  // (a 16th under eighth-note swing, say) is left alone rather than half-swung.
  if (step % half !== 0) return 0;
  if (floorMod(step / half, 2) === 0) return 0;
  const pairBeats = pairStride / stepsPerBeat;
  return (swing - 0.5) * pairBeats * amount;
}

/**
 * Friberg & Sundström's tempo-dependent swing curve, in one line.
 *
 * What is actually held constant in the performances they measured is the *short* note,
 * at roughly 100 ms; the falling ratio drops out of that. The famous 2:1 triplet feel
 * occurs at exactly one tempo, around 200 BPM.
 *
 * Measured on ride cymbals, so the swung pair spans a whole beat (two eighths), not
 * half of one — pass the result as eighth-note swing.
 *
 * Friberg & Sundström, Music Perception 19(3), 2002.
 */
export function autoSwing(bpm: number): number {
  const pairSeconds = 60 / bpm;
  const s = 1 - 0.1 / pairSeconds;
  return Math.min(0.75, Math.max(0.5, s));
}

/** Long-to-short duration ratio for a swing percentage, for display. */
export function swingRatio(swing: number): number {
  return swing / (1 - swing);
}
