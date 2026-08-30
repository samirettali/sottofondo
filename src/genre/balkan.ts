import type { GenreDef } from "./schema.ts";

/**
 * Kopanitsa — Bulgarian 11/8, grouped 2+2+3+2+2.
 *
 * Written specifically to find out what the schema could not yet do, since everything
 * before it is in 4/4 and most of it in sixteen steps. It cost two clock fields and one
 * function, which is recorded here because the honest version of "genres are data" is
 * knowing exactly where that stops being true.
 *
 * The metre is **additive, not divisive**: eleven eighths laid out as five unequal beats,
 * two short, one long, two short. The tabulated metric curves halve at each binary level
 * and describe that wrongly — they would call step 8, the head of the long beat, weak.
 * So the grouping generates the curve instead, with the long beat taking a slightly
 * stronger accent than the short ones, which is what makes 2+2+3+2+2 audibly itself
 * rather than a rotation of some other arrangement of the same eleven.
 *
 * On a sixteenth grid the grouping is `[4, 4, 6, 4, 4]` — twenty-two steps to the bar.
 *
 * Straight, always: aksak's asymmetry is in the beat lengths themselves, so adding swing
 * on top would be saying the same thing twice and blurring both.
 */
export const balkan: GenreDef = {
  id: "balkan",
  name: "Kopanitsa 11/8",
  refs: [
    "Ivo Papazov — Kopanitsa",
    "Bulgarian State Radio & Television Female Vocal Choir — Kalimankou Denkou",
    "Trakiya Folk Ensemble — Trakijska Kopanica",
  ],
  version: 1,

  clock: {
    // Quarter-note tempo. Kopanitsa is fast: the eighth runs near 300 a minute.
    bpm: { min: 120, max: 160, default: 138 },
    stepsPerBar: 22,
    stepsPerBeat: 4,
    // 2 + 2 + 3 + 2 + 2 eighths, in sixteenths.
    grouping: [4, 4, 6, 4, 4],
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "tupan",
      kitVoice: "kick",
      // The head of every beat. Cumulative from the grouping: 0, 4, 8, 14, 18.
      gen: { type: "mask", steps: [0, 4, 8, 14, 18] },
      density: 0.6,
      vel: { base: 0.9, accent: 1, ghost: 0.55 },
      muteP: 0.08,
      minEnergy: 0.2,
    },
    {
      name: "rim",
      kitVoice: "rim",
      // Against the tupan: the second half of the long beat, and the last short one.
      gen: { type: "mask", steps: [11, 20] },
      density: 0.55,
      vel: { base: 0.55, accent: 0.7, ghost: 0.3 },
      muteP: 0.35,
      minEnergy: 0.35,
    },
    {
      name: "tapan slap",
      kitVoice: "snare",
      gen: { type: "stepClassP", invert: true },
      density: 0.16,
      chaos: 0.15,
      vel: { base: 0.2, accent: 0.3, ghost: 0.1 },
      muteP: 0.4,
      minEnergy: 0.5,
      fill: { amount: 0.4, span: 0.27 },
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      density: 0.5,
      chaos: 0.2,
      accentAt: 0.8,
      vel: { base: 0.24, accent: 0.36, ghost: 0.1 },
      muteP: 0.3,
      densitySwing: 0.2,
    },
    {
      name: "def",
      kitVoice: "cowbell",
      // A frame drum on a seven-step cycle against the bar's twenty-two: coprime, so the
      // two do not realign for seven bars.
      gen: { type: "euclid", k: 3, n: 7 },
      len: 7,
      density: 0.45,
      vel: { base: 0.16, accent: 0.22, ghost: 0.08 },
      muteP: 0.5,
      minEnergy: 0.55,
    },
  ],

  bass: {
    name: "bass",
    wave: "sawtooth",
    // Root and fifth, with the flat second above — the Phrygian colour the mode turns on.
    bags: [
      [0, 0, 0, 7],
      [0, 0, 7, 12],
      [0, 0, 0, 1, 7],
      [0, 0, 5, 7],
    ],
    rootRange: [33, 45],
    gen: { type: "mask", steps: [0, 8, 14] },
    density: 0.55,
    chaos: 0.1,
    accentP: 0.25,
    slideP: 0.05,
    synth: { cutoff: 340, resonance: 5, envMod: 1600, decay: 0.28 },
    muteP: 0.15,
    minEnergy: 0.25,
    filterSwing: 0.6,
  },

  chords: {
    name: "accordion",
    // On the beat heads: this music's harmony marks the metre rather than floating over it.
    gen: { type: "mask", steps: [0, 8, 18] },
    density: 0.5,
    chaos: 0.15,
    register: [55, 79],
    synth: {
      voices: 2,
      detune: 8,
      wave: "sawtooth",
      attack: 0.02,
      decay: 0.45,
      cutoff: 2400,
      resonance: 1,
      envMod: 800,
    },
    muteP: 0.3,
    minEnergy: 0.3,
  },

  tonality: {
    scales: [
      { name: "phrygian", weight: 0.4 },
      { name: "harmonicMinor", weight: 0.35 },
      { name: "minor", weight: 0.25 },
    ],
    keyPrefs: [2, 4, 9, 11], // D, E, A, B — where the folk repertoire tends to sit
    harmony: {
      pool: [
        // The Phrygian cadence: the flat second falling to the tonic.
        { chords: ["i", "bII", "i", "i"], barsPerChord: 2, weight: 2 },
        { chords: ["i", "bVII"], barsPerChord: 2, weight: 1.5 },
        // Harmonic minor gives a major V, which is the other half of the sound.
        { chords: ["i", "V", "i", "i"], barsPerChord: 2, weight: 1.5 },
        { chords: ["i", "bVI", "bVII", "i"], barsPerChord: 2 },
        { chords: ["i"], barsPerChord: 4 }, // a drone, which is also correct here
      ],
      // No walking: the McGill matrix is a corpus of Billboard pop and has nothing to say
      // about a Bulgarian dance.
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8",
      feedback: 0.25,
      wet: 0.12,
      feedbackLowpassHz: 3000,
      sends: ["accordion"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 900, hi: 14000, resonance: 0.7 },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.4,
    newNotesEvery: 32,
    newNotesP: 0.3,
    muteEvery: 8,
    sections: [
      { name: "intro", bars: 8, energy: 0.3 },
      { name: "dance", bars: 16, energy: 0.5, energyTo: 0.8 },
      { name: "fast", bars: 32, energy: 0.9 },
      { name: "breath", bars: 8, energy: 0.35 },
      { name: "fast", bars: 32, energy: 1 },
    ],
  },
};
