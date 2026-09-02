import type { GenreDef } from "./schema.ts";

/**
 * Gnawa — Moroccan trance music.
 *
 * Three instruments and a voice: the guembri, a three-string bass lute that carries a
 * pentatonic ostinato and is the whole harmonic content; the qraqeb, iron castanets that
 * play a triplet-feel pattern against the guembri's duple, so the music is always
 * pulling two ways at once; and the tbel, a bass drum. Over that, a call-and-response
 * between the maalem and the chorus.
 *
 * A lila runs for hours, and each song within it does one thing: start slow and get
 * faster. The energy curve here drives the tempo as well as the density, which no
 * earlier preset needed — it is the first use of `tempoSwing`.
 *
 * The metre is 6/8 heard as two dotted-quarter beats, twelve steps to the bar grouped
 * `[6, 6]`. The qraqeb hemiola sits inside that as a three-against-two the grouping
 * does not describe, so it is a mask rather than a curve.
 */
export const gnawa: GenreDef = {
  id: "gnawa",
  name: "Gnawa",
  refs: [
    "Maalem Mahmoud Guinia — Colours of the Night",
    "Hamid El Kasri — Marhaba",
    "Maalem Mustapha Baqbou",
    "Nass El Ghiwane — Ya Sah (for the chaabi side)",
  ],
  version: 1,

  kit: "folk",

  clock: {
    // Dotted-quarter tempo. Starts around 90 and climbs past 130 by the end of a song;
    // the tempoSwing below does the climbing.
    bpm: { min: 84, max: 132, default: 96 },
    stepsPerBar: 12,
    stepsPerBeat: 6,
    grouping: [6, 6],
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "tbel",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 6] },
      density: 0.6,
      vel: { base: 0.85, accent: 1, ghost: 0.5 },
      muteP: 0.15,
      minEnergy: 0.3,
    },
    {
      name: "qraqeb",
      kitVoice: "frame",
      // The hemiola: a three-feel across the two beats. Written out because a curve
      // cannot say it.
      gen: { type: "mask", steps: [0, 2, 3, 6, 8, 9] },
      density: 0.62,
      vel: { base: 0.5, accent: 0.65, ghost: 0.3 },
      muteP: 0.1,
      minEnergy: 0.2,
    },
    {
      name: "qraqeb 2",
      kitVoice: "frame",
      // The second pair answers in the gaps.
      gen: { type: "stepClassP", invert: true },
      density: 0.22,
      chaos: 0.15,
      vel: { base: 0.28, accent: 0.4, ghost: 0.15 },
      muteP: 0.4,
      minEnergy: 0.45,
      densitySwing: 0.25,
      fill: { amount: 0.4, span: 0.25 },
    },
    {
      name: "bendir",
      kitVoice: "snare",
      gen: { type: "mask", steps: [3, 9] },
      density: 0.55,
      vel: { base: 0.4, accent: 0.55, ghost: 0.25 },
      muteP: 0.4,
      minEnergy: 0.5,
    },
    {
      name: "clap",
      kitVoice: "clap",
      // Handclaps arrive late and on the beats, when the room has joined in.
      gen: { type: "mask", steps: [0, 6] },
      density: 0.55,
      vel: { base: 0.35, accent: 0.45, ghost: 0.2 },
      muteP: 0.5,
      minEnergy: 0.75,
    },
  ],

  bass: {
    name: "guembri",
    wave: "square", // a plucked, thumpy string: square with the filter mostly shut
    // Minor pentatonic above the root, root-heavy. The guembri also slaps the skin, which
    // the accent stands in for.
    bags: [
      [0, 0, 0, 3, 5, 7],
      [0, 0, 7, 10, 12],
      [0, 0, 0, 3, 7, 12],
      [0, 0, 5, 7, 10, 12],
    ],
    rootRange: [33, 45],
    gen: { type: "stepClassP" },
    density: 0.58,
    chaos: 0.08,
    accentP: 0.35,
    slideP: 0.08,
    synth: { cutoff: 380, resonance: 3, envMod: 900, decay: 0.16 },
    muteP: 0,
    minEnergy: 0,
    densitySwing: 0.15,
  },

  lead: {
    name: "voice",
    // The maalem's call: short, pentatonic, mostly stepwise, and sparse enough to leave
    // room for the answer it is not able to sing.
    gen: { type: "stepClassP" },
    density: 0.32,
    chaos: 0.15,
    register: [60, 76],
    leapiness: 0.5,
    contour: 1.8,
    chordPull: 0.8,
    synth: {
      voices: 1,
      detune: 0,
      wave: "triangle",
      attack: 0.03,
      decay: 0.5,
      cutoff: 1800,
      resonance: 1,
      envMod: 300,
    },
    muteP: 0.3,
    minEnergy: 0.35,
  },

  tonality: {
    scales: [
      { name: "minorPentatonic", weight: 0.7 },
      { name: "minor", weight: 0.3 },
    ],
    keyPrefs: [2, 4, 7, 9],
    harmony: {
      // Nothing moves. A gnawa song is one mode over one root; the interest is in the
      // ostinato and the tempo.
      pool: [
        { chords: ["i"], barsPerChord: 8, weight: 3 },
        { chords: ["i", "i", "i", "bVII"], barsPerChord: 2 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8",
      feedback: 0.2,
      wet: 0.1,
      feedbackLowpassHz: 2500,
      sends: ["voice"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 1600, hi: 14000, resonance: 0.6 },
    reverb: { size: 0.6, decay: 2, damp: 0.5, wet: 0.2, preDelayMs: 18, sends: ["voice", "bendir", "qraqeb 2"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.35,
    newNotesEvery: 64,
    newNotesP: 0.15,
    muteEvery: 8,
    // One long climb. There is no drop in a lila, only more.
    sections: [
      { name: "open", bars: 16, energy: 0.2, energyTo: 0.35 },
      { name: "call", bars: 32, energy: 0.4, energyTo: 0.65 },
      { name: "gather", bars: 32, energy: 0.7, energyTo: 0.9 },
      { name: "trance", bars: 32, energy: 1 },
      { name: "rest", bars: 8, energy: 0.3 },
    ],
    // The tempo follows the energy: roughly 84 at the bottom to 130 at the top.
    tempoSwing: 0.22,
  },
};
