import type { GenreDef } from "./schema.ts";

/**
 * Progressive house.
 *
 * The genre of the long build: sixteen and thirty-two bar sections, a pluck that arrives
 * before the kick does, a pad under everything, and a drop that is a lift rather than a
 * shock. Beatport's progressive-house median is 128 with a standard deviation of 2.3 —
 * as close to a fixed-tempo genre as exists.
 */
export const progressive: GenreDef = {
  id: "progressive",
  name: "Progressive house",
  refs: [
    "Sasha — Xpander",
    "Eric Prydz — Opus",
    "Deadmau5 — Strobe",
    "Guy J — Lamur",
  ],
  version: 2, // v2: the opening had no drums in it for a minute

  kit: "909",

  clock: {
    bpm: { min: 124, max: 130, default: 128 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.52,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 4, 8, 12] },
      density: 0.6,
      vel: { base: 1, accent: 1, ghost: 0.85 },
      muteP: 0.1,
      minEnergy: 0.35,
    },
    {
      name: "clap",
      kitVoice: "clap",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 0.7, accent: 0.85, ghost: 0.4 },
      muteP: 0.3,
      minEnergy: 0.5,
    },
    {
      name: "open hat",
      kitVoice: "openHat",
      gen: { type: "mask", steps: [2, 6, 10, 14] },
      density: 0.55,
      vel: { base: 0.4, accent: 0.5, ghost: 0.2 },
      swingDepth: 1,
      muteP: 0.35,
      minEnergy: 0.45,
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      density: 0.55,
      chaos: 0.15,
      vel: { base: 0.22, accent: 0.32, ghost: 0.1 },
      swingDepth: 1,
      muteP: 0.3,
      minEnergy: 0.3,
      densitySwing: 0.3,
    },
    {
      name: "perc",
      kitVoice: "rim",
      gen: { type: "stepClassP", invert: true },
      density: 0.14,
      chaos: 0.15,
      vel: { base: 0.2, accent: 0.3, ghost: 0.1 },
      swingDepth: 1,
      muteP: 0.5,
      minEnergy: 0.6,
      fill: { amount: 0.45, span: 0.25 },
    },
  ],

  bass: {
    name: "bass",
    wave: "sawtooth",
    bags: [
      [0, 0, 0, 12],
      [0, 0, 12, 7],
      [0, 0, 0, 0, 10, 12],
    ],
    rootRange: [31, 43],
    // Off the kick, in sixteenths that leave the downbeat alone.
    gen: { type: "mask", steps: [2, 3, 6, 7, 10, 11, 14, 15] },
    density: 0.55,
    chaos: 0.1,
    accentP: 0.15,
    slideP: 0.04,
    synth: { cutoff: 420, resonance: 4, envMod: 1400, decay: 0.14 },
    swingDepth: 0.5,
    muteP: 0.15,
    minEnergy: 0.3,
    filterSwing: 0.9,
  },

  chords: {
    name: "pad",
    gen: { type: "mask", steps: [0] },
    density: 0.6,
    register: [55, 79],
    synth: {
      voices: 3,
      detune: 15,
      wave: "sawtooth",
      attack: 0.6,
      decay: 3.5,
      cutoff: 1400,
      resonance: 0.7,
      envMod: 800,
    },
    muteP: 0.15,
    minEnergy: 0.1,
    filterSwing: 1,
  },

  lead: {
    name: "pluck",
    // The signature: a chord tone on every sixteenth off the beat, filtered and delayed,
    // arriving before the drums and staying through the break.
    gen: { type: "mask", steps: [2, 3, 6, 7, 10, 11, 14, 15] },
    density: 0.55,
    chaos: 0.1,
    register: [67, 88],
    leapiness: 1.4,
    contour: 0.3,
    chordPull: 3.5,
    synth: {
      voices: 2,
      detune: 8,
      wave: "sawtooth",
      attack: 0.003,
      decay: 0.16,
      cutoff: 2400,
      resonance: 2,
      envMod: 1600,
    },
    swingDepth: 0.5,
    muteP: 0.25,
    minEnergy: 0.15,
  },

  tonality: {
    scales: [
      { name: "minor", weight: 0.5 },
      { name: "dorian", weight: 0.3 },
      { name: "major", weight: 0.2 },
    ],
    keyPrefs: [9, 4, 5, 7],
    harmony: {
      pool: [
        { chords: ["i", "bVI", "bIII", "bVII"], barsPerChord: 2, weight: 2 },
        { chords: ["i", "bVII", "bVI", "bVII"], barsPerChord: 2, weight: 2 },
        { chords: ["i7", "iv7"], barsPerChord: 4 },
        { chords: ["vi", "IV", "I", "V"], barsPerChord: 2 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "3/16",
      feedback: 0.45,
      wet: 0.3,
      feedbackLowpassHz: 5000,
      sends: ["pluck"],
    },
    sidechain: { db: 5, releaseMs: 110, targets: ["bass", "pad", "pluck"] },
    energyFilter: { type: "lowpass", lo: 500, hi: 18000, resonance: 1 },
    reverb: { size: 0.8, decay: 3, damp: 0.45, wet: 0.3, preDelayMs: 25, sends: ["pad", "pluck", "clap"] },
  },

  arrangement: {
    newPatternEvery: 32,
    newPatternP: 0.3,
    newNotesEvery: 64,
    newNotesP: 0.2,
    muteEvery: 16,
    sections: [
      { name: "intro", bars: 8, energy: 0.45, energyTo: 0.6 },
      { name: "build", bars: 32, energy: 0.4, energyTo: 0.8 },
      { name: "peak", bars: 32, energy: 0.9 },
      { name: "breakdown", bars: 32, energy: 0.2, energyTo: 0.3 },
      { name: "build", bars: 16, energy: 0.45, energyTo: 1 },
      { name: "peak", bars: 32, energy: 1 },
      { name: "outro", bars: 32, energy: 0.5, energyTo: 0.15 },
    ],
  },
};
