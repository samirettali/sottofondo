import type { GenreDef } from "./schema.ts";

/**
 * Reggaeton.
 *
 * One rhythm, the dembow: kick on every beat, snare on the tresillo — the third, the
 * sixth-and-a-half, the eleventh sixteenth, then the twelfth — which is E(3,8) with a
 * backbeat stitched on. The kick is four-on-the-floor and the snare is the syncopation,
 * which is the reverse of most dance music and the whole reason it moves the way it does.
 *
 * The tresillo is the clave module's `tresillo` timeline, played over sixteen by tiling
 * its eight; the snare adds step 12 so the second half closes on the backbeat.
 */
export const reggaeton: GenreDef = {
  id: "reggaeton",
  name: "Reggaeton",
  refs: [
    "Daddy Yankee — Gasolina",
    "Tego Calderón — Pa' Que Retozen",
    "Bad Bunny — Safaera",
    "Shabba Ranks — Dem Bow",
  ],
  version: 1,

  kit: "808",

  clock: {
    bpm: { min: 88, max: 100, default: 94 },
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
      vel: { base: 1, accent: 1, ghost: 0.8 },
      muteP: 0.1,
      minEnergy: 0.2,
    },
    {
      name: "snare",
      kitVoice: "snare",
      // The dembow: tresillo across both halves, closing on the backbeat.
      gen: { type: "mask", steps: [3, 6, 11, 12] },
      density: 0.6,
      vel: { base: 0.9, accent: 1, ghost: 0.6 },
      muteP: 0.05,
      minEnergy: 0.25,
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
      density: 0.55,
      vel: { base: 0.3, accent: 0.4, ghost: 0.15 },
      muteP: 0.3,
      minEnergy: 0.4,
    },
    {
      name: "hat 16ths",
      kitVoice: "closedHat",
      gen: { type: "stepClassP", invert: true },
      density: 0.18,
      chaos: 0.2,
      vel: { base: 0.15, accent: 0.22, ghost: 0.08 },
      muteP: 0.4,
      minEnergy: 0.6,
      densitySwing: 0.25,
      fill: { amount: 0.45, span: 0.25 },
    },
    {
      name: "rim",
      kitVoice: "rim",
      gen: { type: "clave", name: "tresillo" },
      density: 0.5,
      vel: { base: 0.3, accent: 0.4, ghost: 0.15 },
      muteP: 0.5,
      minEnergy: 0.55,
    },
  ],

  bass: {
    name: "808 bass",
    wave: "sawtooth",
    bags: [
      [0, 0, 0, 12],
      [0, 0, 0, 7, 12],
      [0, 0, 3, 0, 7],
    ],
    rootRange: [26, 38],
    // With the kick, mostly, and held.
    gen: { type: "mask", steps: [0, 4, 8, 12] },
    density: 0.55,
    chaos: 0.12,
    accentP: 0.2,
    slideP: 0.25,
    synth: { cutoff: 200, resonance: 2, envMod: 500, decay: 0.55 },
    muteP: 0.1,
    minEnergy: 0.2,
  },

  chords: {
    name: "synth",
    gen: { type: "mask", steps: [3, 6, 11] },
    density: 0.55,
    chaos: 0.1,
    register: [55, 79],
    synth: {
      voices: 2,
      detune: 10,
      wave: "square",
      attack: 0.005,
      decay: 0.3,
      cutoff: 2200,
      resonance: 1.5,
      envMod: 900,
    },
    muteP: 0.3,
    minEnergy: 0.4,
  },

  lead: {
    name: "lead",
    gen: { type: "stepClassP" },
    density: 0.34,
    chaos: 0.15,
    register: [62, 81],
    leapiness: 0.7,
    contour: 1.2,
    chordPull: 1.5,
    synth: {
      voices: 2,
      detune: 8,
      wave: "sawtooth",
      attack: 0.008,
      decay: 0.35,
      cutoff: 2800,
      resonance: 1.5,
      envMod: 700,
    },
    muteP: 0.35,
    minEnergy: 0.55,
  },

  tonality: {
    scales: [
      { name: "minor", weight: 0.6 },
      { name: "harmonicMinor", weight: 0.4 },
    ],
    keyPrefs: [9, 4, 7, 2],
    harmony: {
      pool: [
        { chords: ["i", "bVI", "bIII", "bVII"], barsPerChord: 1, weight: 2 },
        { chords: ["i", "bVII", "bVI", "V"], barsPerChord: 1, weight: 2 },
        { chords: ["i", "iv"], barsPerChord: 2 },
        { chords: ["bVI", "bVII", "i", "i"], barsPerChord: 1 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8T",
      feedback: 0.3,
      wet: 0.15,
      feedbackLowpassHz: 4000,
      sends: ["lead"],
    },
    sidechain: { db: 3, releaseMs: 90, targets: ["808 bass", "synth"] },
    energyFilter: { type: "lowpass", lo: 1500, hi: 18000, resonance: 0.7 },
    reverb: { size: 0.5, decay: 1.4, damp: 0.5, wet: 0.2, preDelayMs: 12, sends: ["snare", "synth", "lead"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.35,
    newNotesEvery: 32,
    newNotesP: 0.25,
    muteEvery: 8,
    sections: [
      { name: "intro", bars: 8, energy: 0.3 },
      { name: "verse", bars: 16, energy: 0.55 },
      { name: "hook", bars: 16, energy: 0.85 },
      { name: "verse", bars: 16, energy: 0.6 },
      { name: "hook", bars: 16, energy: 0.95 },
      { name: "outro", bars: 8, energy: 0.35 },
    ],
  },
};
