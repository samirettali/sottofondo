import type { GenreDef } from "./schema.ts";

/**
 * Dub techno.
 *
 * A four-on-the-floor kick, a rim, hats drenched in the room, and one chord: a minor
 * ninth struck once a bar on the offbeat and sent into a delay whose feedback path is
 * low-passed, so every repeat comes back darker and more diffuse than the last. That
 * degrading loop is the entire Basic Channel sound, and it is the delay's
 * `feedbackLowpassHz` doing the work.
 *
 * One chord for sixteen bars is not a placeholder; it is the genre.
 */
export const dubtechno: GenreDef = {
  id: "dubtechno",
  name: "Dub techno",
  refs: [
    "Basic Channel — Phylyps Trak",
    "Maurizio — M-4.5",
    "Rhythm & Sound — Never Tell You",
    "Deepchord presents Echospace — The Coldest Season",
  ],
  version: 2, // v2: a shorter opening

  kit: "909",

  clock: {
    bpm: { min: 118, max: 128, default: 123 },
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
      vel: { base: 0.85, accent: 0.9, ghost: 0.7 },
      muteP: 0.1,
      minEnergy: 0.2,
    },
    {
      name: "rim",
      kitVoice: "rim",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.55,
      vel: { base: 0.35, accent: 0.45, ghost: 0.2 },
      muteP: 0.4,
      minEnergy: 0.4,
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "mask", steps: [2, 6, 10, 14] },
      density: 0.55,
      vel: { base: 0.25, accent: 0.32, ghost: 0.12 },
      muteP: 0.3,
      minEnergy: 0.35,
    },
    {
      name: "hat 16ths",
      kitVoice: "closedHat",
      gen: { type: "stepClassP", invert: true },
      density: 0.12,
      chaos: 0.15,
      vel: { base: 0.08, accent: 0.12, ghost: 0.04 },
      muteP: 0.5,
      minEnergy: 0.55,
      densitySwing: 0.2,
      fill: { amount: 0.3, span: 0.25 },
    },
  ],

  bass: {
    name: "sub",
    wave: "sawtooth",
    bags: [[0], [0, 0, 0, 7], [0, 0, 12]],
    rootRange: [28, 38],
    gen: { type: "mask", steps: [0, 8] },
    density: 0.55,
    chaos: 0.1,
    accentP: 0.1,
    slideP: 0.1,
    synth: { cutoff: 150, resonance: 1.5, envMod: 300, decay: 0.7 },
    muteP: 0.15,
    minEnergy: 0.3,
  },

  chords: {
    name: "chord",
    // Once a bar, on the offbeat eighth after the downbeat, and nothing more.
    gen: { type: "mask", steps: [2] },
    density: 0.6,
    chaos: 0.1,
    register: [48, 67],
    synth: {
      voices: 3,
      detune: 12,
      wave: "sawtooth",
      attack: 0.01,
      decay: 0.35,
      cutoff: 1600,
      resonance: 1.2,
      envMod: 700,
    },
    muteP: 0.2,
    minEnergy: 0.15,
    filterSwing: 1.1,
  },

  tonality: {
    scales: [
      { name: "minor", weight: 0.6 },
      { name: "dorian", weight: 0.4 },
    ],
    keyPrefs: [2, 4, 7, 9],
    harmony: {
      pool: [
        { chords: ["i9"], barsPerChord: 16, weight: 3 },
        { chords: ["i7", "iv7"], barsPerChord: 4 },
        { chords: ["i9", "bVImaj7"], barsPerChord: 8 },
      ],
      walkP: 0,
    },
  },

  fx: {
    // The chord goes here, and the delay's darkening loop is the genre.
    delay: {
      noteValue: "3/16",
      feedback: 0.72,
      wet: 0.45,
      feedbackLowpassHz: 1200,
      sends: ["chord", "rim", "hat 16ths"],
    },
    sidechain: { db: 3, releaseMs: 150, targets: ["sub", "chord"] },
    energyFilter: { type: "lowpass", lo: 1200, hi: 12000, resonance: 0.6 },
    reverb: { size: 0.9, decay: 5, damp: 0.6, wet: 0.35, preDelayMs: 30, sends: ["chord", "rim", "hat"] },
  },

  arrangement: {
    newPatternEvery: 32,
    newPatternP: 0.3,
    newNotesEvery: 128,
    newNotesP: 0.15,
    muteEvery: 16,
    sections: [
      { name: "in", bars: 8, energy: 0.45, energyTo: 0.6 },
      { name: "deep", bars: 64, energy: 0.6, energyTo: 0.85 },
      { name: "thin", bars: 32, energy: 0.35 },
      { name: "deep", bars: 64, energy: 0.7, energyTo: 0.95 },
      { name: "out", bars: 32, energy: 0.5, energyTo: 0.25 },
    ],
  },
};
