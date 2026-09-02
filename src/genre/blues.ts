import type { GenreDef } from "./schema.ts";

/**
 * Blues — a twelve-bar shuffle.
 *
 * The form is the genre: twelve bars of I, IV and V in the one order everyone knows,
 * with the turnaround in the last two. It is written out as a twelve-chord progression
 * at one bar each, which is the first time a pool entry has been longer than four.
 *
 * The shuffle is eighth-note swing at about 62%, on everything. The bass walks the
 * boogie figure — root, third, fifth, sixth — and the lead lives in the blues scale,
 * whose flat fifth is a passing tone and is never landed on.
 */
export const blues: GenreDef = {
  id: "blues",
  name: "Twelve-bar blues",
  refs: [
    "Muddy Waters — Mannish Boy",
    "Howlin' Wolf — Smokestack Lightnin'",
    "Stevie Ray Vaughan — Pride and Joy",
    "John Lee Hooker — Boom Boom",
  ],
  version: 2, // v2: plucked strings instead of filtered saws

  kit: "acoustic",

  clock: {
    bpm: { min: 80, max: 132, default: 104 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.62,
    swingSubdiv: 8,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 6, 8, 14] },
      density: 0.58,
      vel: { base: 0.8, accent: 0.95, ghost: 0.5 },
      swingDepth: 1,
      muteP: 0.1,
      minEnergy: 0.2,
    },
    {
      name: "snare",
      kitVoice: "snare",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 0.9, accent: 1, ghost: 0.6 },
      muteP: 0.1,
      minEnergy: 0.25,
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      // Every eighth, swung: the shuffle lives here.
      gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
      density: 0.6,
      vel: { base: 0.32, accent: 0.42, ghost: 0.18 },
      swingDepth: 1,
      muteP: 0.15,
      minEnergy: 0.2,
    },
    {
      name: "ghost snare",
      kitVoice: "snare",
      gen: { type: "stepClassP", invert: true },
      density: 0.16,
      chaos: 0.2,
      vel: { base: 0.14, accent: 0.22, ghost: 0.07 },
      swingDepth: 1,
      muteP: 0.35,
      minEnergy: 0.45,
      fill: { amount: 0.45, span: 0.25 },
    },
  ],

  bass: {
    name: "bass",
    wave: "triangle",
    // The boogie: root, third, fifth, sixth, up and back.
    bags: [
      [0, 4, 7, 9],
      [0, 4, 7, 9, 12, 9, 7, 4],
      [0, 0, 7, 10],
    ],
    rootRange: [28, 40],
    gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
    density: 0.6,
    chaos: 0.05,
    accentP: 0.15,
    slideP: 0.1,
    synth: { cutoff: 340, resonance: 1.5, envMod: 500, decay: 0.24 },
    timbre: "pluck",
    poly: { cutoff: 1050, level: 1.1, pluck: { damp: 0.55, decay: 1.6, colour: 0.3 } },
    swingDepth: 1,
    muteP: 0.05,
    minEnergy: 0.15,
  },

  chords: {
    name: "guitar",
    // Chunks on the offbeats, swung, with the drummer.
    gen: { type: "mask", steps: [2, 6, 10, 14] },
    density: 0.55,
    chaos: 0.15,
    register: [52, 74],
    synth: {
      // Chunked strings, damped by the picking hand: short decay, dull excitation.
      timbre: "pluck",
      cutoff: 2600,
      pluck: { damp: 0.52, decay: 0.55, colour: 0.6 },
    },
    swingDepth: 1,
    muteP: 0.25,
    minEnergy: 0.3,
  },

  lead: {
    name: "lead guitar",
    gen: { type: "stepClassP" },
    density: 0.36,
    chaos: 0.25,
    register: [60, 84],
    leapiness: 0.8,
    contour: 1.2,
    chordPull: 1,
    synth: {
      // The lead rings on where the comping is choked, which is what makes one guitar
      // sound like two players.
      timbre: "pluck",
      cutoff: 3400,
      level: 1.1,
      pluck: { damp: 0.38, decay: 2, colour: 0.8 },
    },
    swingDepth: 1,
    muteP: 0.3,
    minEnergy: 0.45,
  },

  tonality: {
    scales: [
      { name: "blues", weight: 0.5 },
      { name: "minorPentatonic", weight: 0.3 },
      { name: "mixolydian", weight: 0.2 },
    ],
    keyPrefs: [4, 9, 7, 0], // E, A, G, C
    harmony: {
      pool: [
        // The twelve bars, one chord a bar, with the quick change and the turnaround.
        {
          chords: ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
          barsPerChord: 1,
          weight: 3,
        },
        {
          chords: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "I7"],
          barsPerChord: 1,
        },
        // Minor blues.
        {
          chords: ["i7", "iv7", "i7", "i7", "iv7", "iv7", "i7", "i7", "bVI7", "V7", "i7", "V7"],
          barsPerChord: 1,
        },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8",
      feedback: 0.2,
      wet: 0.1,
      feedbackLowpassHz: 2800,
      sends: ["lead guitar"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 2600, hi: 12000, resonance: 0.5 },
    reverb: { size: 0.4, decay: 1.3, damp: 0.55, wet: 0.18, preDelayMs: 12, sends: ["lead guitar", "guitar", "snare"] },
  },

  arrangement: {
    newPatternEvery: 12,
    newPatternP: 0.45,
    newNotesEvery: 48,
    newNotesP: 0.2,
    muteEvery: 12,
    // Choruses of twelve. Sections are multiples of the form, not of eight.
    sections: [
      { name: "head", bars: 12, energy: 0.45 },
      { name: "verse", bars: 24, energy: 0.55 },
      { name: "solo", bars: 24, energy: 0.7, energyTo: 0.95 },
      { name: "verse", bars: 24, energy: 0.6 },
      { name: "out", bars: 12, energy: 0.5, energyTo: 0.3 },
    ],
  },
};
