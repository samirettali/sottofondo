import type { GenreDef } from "./schema.ts";

/**
 * Psytrance.
 *
 * The whole genre is the bass: a rolling line on every sixteenth the kick is not on,
 * short and identical, so kick and bass together make a continuous sixteenth pulse. Over
 * that, a 145 BPM four-on-the-floor, offbeat open hats, and leads that are more texture
 * than melody. The GiantSteps psy-trance median is 146.5.
 */
export const psytrance: GenreDef = {
  id: "psytrance",
  name: "Psytrance",
  refs: [
    "Infected Mushroom — Becoming Insane",
    "Astrix — Type 1",
    "Hallucinogen — LSD",
    "Vini Vici — The Tribe",
  ],
  version: 2, // v2: hats and lead are in from the start

  kit: "909",

  clock: {
    bpm: { min: 140, max: 150, default: 145 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 4, 8, 12] },
      density: 0.6,
      vel: { base: 1, accent: 1, ghost: 0.9 },
      muteP: 0.1,
      minEnergy: 0.2,
    },
    {
      name: "open hat",
      kitVoice: "openHat",
      gen: { type: "mask", steps: [2, 6, 10, 14] },
      density: 0.55,
      vel: { base: 0.45, accent: 0.55, ghost: 0.25 },
      muteP: 0.3,
      minEnergy: 0.4,
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      density: 0.55,
      chaos: 0.15,
      vel: { base: 0.22, accent: 0.32, ghost: 0.1 },
      muteP: 0.3,
      minEnergy: 0.5,
      densitySwing: 0.25,
    },
    {
      name: "clap",
      kitVoice: "clap",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.55,
      vel: { base: 0.6, accent: 0.75, ghost: 0.35 },
      muteP: 0.45,
      minEnergy: 0.6,
    },
    {
      name: "perc",
      kitVoice: "rim",
      gen: { type: "stepClassP", invert: true },
      density: 0.15,
      chaos: 0.15,
      vel: { base: 0.25, accent: 0.35, ghost: 0.12 },
      muteP: 0.5,
      minEnergy: 0.65,
      fill: { amount: 0.45, span: 0.25 },
    },
  ],

  bass: {
    name: "rolling bass",
    wave: "sawtooth",
    // One note. The line is rhythm, not melody.
    bags: [[0], [0, 0, 0, 12], [0, 0, 0, 0, 7]],
    rootRange: [28, 38],
    // Every sixteenth the kick is not on.
    gen: { type: "mask", steps: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15] },
    density: 0.6,
    chaos: 0.02,
    accentP: 0.1,
    slideP: 0,
    // Short, hard, filtered: the classic psy bass is a saw through a fast envelope.
    synth: { cutoff: 260, resonance: 6, envMod: 2400, decay: 0.07 },
    muteP: 0,
    minEnergy: 0.15,
    filterSwing: 0.9,
  },

  lead: {
    name: "lead",
    gen: { type: "stepClassP" },
    density: 0.42,
    chaos: 0.2,
    register: [60, 84],
    leapiness: 1.2,
    contour: 0.8,
    chordPull: 1,
    synth: {
      voices: 3,
      detune: 14,
      wave: "sawtooth",
      attack: 0.004,
      decay: 0.14,
      cutoff: 3000,
      resonance: 4,
      envMod: 2200,
    },
    muteP: 0.35,
    minEnergy: 0.55,
    densitySwing: 0.25,
  },

  tonality: {
    scales: [
      { name: "phrygian", weight: 0.5 },
      { name: "minor", weight: 0.3 },
      { name: "harmonicMinor", weight: 0.2 },
    ],
    keyPrefs: [4, 5, 7, 9],
    harmony: {
      pool: [
        { chords: ["i"], barsPerChord: 8, weight: 3 },
        { chords: ["i", "bII"], barsPerChord: 4, weight: 2 },
        { chords: ["i", "i", "bVII", "bII"], barsPerChord: 2 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "3/16",
      feedback: 0.4,
      wet: 0.25,
      feedbackLowpassHz: 6000,
      sends: ["lead", "perc"],
    },
    sidechain: { db: 4, releaseMs: 70, targets: ["rolling bass", "lead"] },
    energyFilter: { type: "lowpass", lo: 900, hi: 18000, resonance: 0.9 },
    reverb: { size: 0.6, decay: 1.6, damp: 0.4, wet: 0.2, preDelayMs: 15, sends: ["lead", "clap"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.4,
    newNotesEvery: 64,
    newNotesP: 0.2,
    muteEvery: 8,
    sections: [
      { name: "intro", bars: 8, energy: 0.45 },
      { name: "build", bars: 16, energy: 0.4, energyTo: 0.85 },
      { name: "drop", bars: 32, energy: 0.9 },
      { name: "break", bars: 16, energy: 0.2 },
      { name: "build", bars: 16, energy: 0.4, energyTo: 1 },
      { name: "drop", bars: 32, energy: 1 },
    ],
  },
};
