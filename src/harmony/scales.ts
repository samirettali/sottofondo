/**
 * Scales, in degree space.
 *
 * Everything harmonic works in **scale degrees**, integers where octave = ±length, and
 * converts to MIDI only at the boundary. A degree can be transposed, inverted and
 * sequenced without ever landing outside the key, which removes an entire class of wrong
 * note by construction. Doing it the other way — MIDI everywhere, snapping to a scale as
 * needed — needs a snap at every step and gets one of them wrong eventually.
 */

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  /** Raga Bhairav: the double-harmonic scale, flat second and sixth with major third and seventh. */
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  /** Raga Kirwani: harmonic minor by another name, kept separate so a preset can say which. */
  kirwani: [0, 2, 3, 5, 7, 8, 11],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;

/**
 * The degree that gives each mode its identity, and the chord that supports it.
 *
 * Without emphasising these a Dorian loop just sounds like Aeolian: the mode is audible
 * only if its characteristic degree is heard early and harmonised. This is the one piece
 * of modal writing that cannot be left to chance.
 */
export const CHARACTERISTIC: Partial<Record<ScaleName, { degree: number; chord: string }>> = {
  dorian: { degree: 5, chord: "IV" }, // the natural 6th over a minor third
  mixolydian: { degree: 6, chord: "bVII" }, // the flat 7th
  lydian: { degree: 3, chord: "II" }, // the sharp 4th
  phrygian: { degree: 1, chord: "bII" }, // the flat 2nd
};

export function scaleOf(name: ScaleName): readonly number[] {
  return SCALES[name];
}

/** Degree to MIDI. `degree` may be negative or beyond an octave; it wraps. */
export function degToMidi(
  degree: number,
  scale: readonly number[],
  root: number,
  octave = 4,
): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const index = ((degree % n) + n) % n;
  return root + 12 * (octave + oct) + (scale[index] ?? 0);
}

/** Nearest degree to a MIDI note, for pulling an arbitrary pitch into the key. */
export function midiToDeg(midi: number, scale: readonly number[], root: number, octave = 4): number {
  const n = scale.length;
  const offset = midi - root - 12 * octave;
  const oct = Math.floor(offset / 12);
  const pc = ((offset % 12) + 12) % 12;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs((scale[i] ?? 0) - pc);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return oct * n + best;
}

/** Move a MIDI note into a register by octaves, without changing its pitch class. */
export function intoRange(midi: number, lo: number, hi: number): number {
  let n = midi;
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}

/** Pitch-class set of a MIDI collection, sorted. */
export function pitchClasses(midi: readonly number[]): number[] {
  return [...new Set(midi.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
}
