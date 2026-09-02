import type { GenreDef } from "./schema.ts";

/**
 * Anatolian — a karşılama in 9/8, grouped 2+2+2+3.
 *
 * The shared ground of Turkish and Kurdish dance music: the aksak nine, with the long
 * beat last, a darbuka playing dum on the beat heads and tek in the gaps, and a melody in
 * makam Hicaz — the flat second and the major third that no Western scale has together.
 * The saz and the zurna both live in it; the lead here is a saz, being the one a synth can
 * approximate without lying.
 *
 * Eighteen steps to the bar, grouped `[4, 4, 4, 6]`. The long beat at the end is what
 * makes a karşılama; put it first and it is a different dance.
 */
export const turkish: GenreDef = {
  id: "turkish",
  name: "Karşılama 9/8",
  refs: [
    "Selim Sesler — Keşan'a Giden Yollar",
    "Aynur Doğan — Keçe Kurdan",
    "Burhan Öçal — Oriental Percussion",
    "Ahmet Aslan — Veyv i Ali",
  ],
  version: 2, // v2: kanun and saz are plucked, and the taksim no longer swallows the band

  kit: "folk",

  clock: {
    bpm: { min: 110, max: 150, default: 128 },
    stepsPerBar: 18,
    stepsPerBeat: 4,
    grouping: [4, 4, 4, 6],
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "dum",
      kitVoice: "kick",
      // The beat heads, with the long beat's second half marked.
      gen: { type: "mask", steps: [0, 4, 8, 12, 15] },
      density: 0.6,
      vel: { base: 0.85, accent: 1, ghost: 0.5 },
      muteP: 0.05,
      minEnergy: 0.15,
    },
    {
      name: "tek",
      kitVoice: "frame",
      // The high stroke in the gaps.
      gen: { type: "mask", steps: [2, 6, 10, 14, 16] },
      density: 0.58,
      vel: { base: 0.45, accent: 0.6, ghost: 0.25 },
      muteP: 0.15,
      minEnergy: 0.25,
    },
    {
      name: "fills",
      kitVoice: "frame",
      gen: { type: "stepClassP", invert: true },
      density: 0.16,
      chaos: 0.2,
      vel: { base: 0.25, accent: 0.38, ghost: 0.12 },
      muteP: 0.35,
      minEnergy: 0.5,
      densitySwing: 0.25,
      fill: { amount: 0.5, span: 0.3 },
    },
    {
      name: "davul",
      kitVoice: "snare",
      gen: { type: "mask", steps: [8, 12] },
      density: 0.55,
      vel: { base: 0.5, accent: 0.65, ghost: 0.3 },
      muteP: 0.25,
      minEnergy: 0.35,
    },
    {
      name: "zil",
      kitVoice: "rim",
      gen: { type: "euclid", k: 5, n: 9 },
      len: 9,
      density: 0.45,
      vel: { base: 0.2, accent: 0.28, ghost: 0.1 },
      muteP: 0.5,
      minEnergy: 0.6,
    },
  ],

  bass: {
    name: "bass",
    wave: "sawtooth",
    bags: [
      [0, 0, 0, 7],
      [0, 0, 7, 1],
      [0, 0, 0, 5, 7],
    ],
    rootRange: [33, 45],
    gen: { type: "mask", steps: [0, 8, 12] },
    density: 0.56,
    chaos: 0.1,
    accentP: 0.25,
    slideP: 0.05,
    synth: { cutoff: 320, resonance: 4, envMod: 1200, decay: 0.24 },
    // A bass guitar in the band, not an acid line.
    timbre: "pluck",
    poly: { cutoff: 1100, pluck: { damp: 0.56, decay: 1.6, colour: 0.3 } },
    muteP: 0.15,
    minEnergy: 0.3,
  },

  chords: {
    name: "kanun",
    gen: { type: "mask", steps: [0, 8, 12] },
    density: 0.55,
    chaos: 0.1,
    register: [55, 76],
    synth: {
      // A kanun is seventy-odd strings under the fingers: bright, short, plucked.
      timbre: "pluck",
      cutoff: 5200,
      pluck: { damp: 0.3, decay: 1.3, colour: 0.9 },
    },
    muteP: 0.3,
    minEnergy: 0.35,
  },

  lead: {
    name: "saz",
    gen: { type: "stepClassP" },
    density: 0.55,
    chaos: 0.15,
    register: [62, 84],
    leapiness: 0.45,
    contour: 1.5,
    chordPull: 1,
    synth: {
      // A saz is a long-necked lute with wire strings: less bright than the kanun and
      // ringing much longer.
      timbre: "pluck",
      cutoff: 3800,
      pluck: { damp: 0.4, decay: 2.2, colour: 0.7 },
    },
    muteP: 0.15,
    minEnergy: 0.3,
    densitySwing: 0.2,
  },

  tonality: {
    scales: [
      { name: "hicaz", weight: 0.55 },
      { name: "harmonicMinor", weight: 0.25 }, // Nihavend, near enough
      { name: "phrygian", weight: 0.2 }, // Kürdi
    ],
    keyPrefs: [2, 9, 4, 7],
    harmony: {
      pool: [
        // Hicaz sits on a major tonic with a flat second above it.
        { chords: ["I", "bII", "I", "I"], barsPerChord: 2, weight: 2 },
        { chords: ["I", "iv", "bII", "I"], barsPerChord: 2, weight: 1.5 },
        { chords: ["i", "bII", "i", "V"], barsPerChord: 2 },
        { chords: ["i", "bVII", "bVI", "i"], barsPerChord: 2 },
        { chords: ["Ipower"], barsPerChord: 8 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8",
      feedback: 0.22,
      wet: 0.12,
      feedbackLowpassHz: 3000,
      sends: ["saz"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 1600, hi: 14000, resonance: 0.6 },
    reverb: { size: 0.6, decay: 2.2, damp: 0.45, wet: 0.22, preDelayMs: 20, sends: ["saz", "kanun", "tek", "fills"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.4,
    newNotesEvery: 32,
    newNotesP: 0.3,
    muteEvery: 8,
    sections: [
      { name: "taksim", bars: 8, energy: 0.45 },
      { name: "dance", bars: 16, energy: 0.5, energyTo: 0.75 },
      { name: "fast", bars: 32, energy: 0.9 },
      { name: "breath", bars: 8, energy: 0.35 },
      { name: "fast", bars: 32, energy: 1 },
    ],
    tempoSwing: 0.1,
  },
};
