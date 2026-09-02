import type { GenreDef } from "./schema.ts";

/**
 * Jazz — a swung combo.
 *
 * Swing here is on the eighth, not the sixteenth, and the amount is what Friberg and
 * Sundström measured for ride cymbals at this tempo: about 62% at 140, holding the short
 * note near 100 ms. The ride carries the time — one, two-and, three, four-and — with the
 * kick feathered so low it is felt rather than heard, and the snare comping in the gaps.
 *
 * Harmony is the ii–V–I machinery at full stretch: rootless voicings, turnarounds, a
 * tritone substitution now and then. The walking bass wants a chromatic approach into
 * the next chord root, which needs a lookahead the score does not do yet; it walks
 * chord tones and steps instead, which is a bassist on a slow night.
 */
export const jazz: GenreDef = {
  id: "jazz",
  name: "Jazz combo",
  refs: [
    "Miles Davis — So What",
    "Bill Evans Trio — Waltz for Debby",
    "Wes Montgomery — Four on Six",
    "Art Blakey — Moanin'",
  ],
  version: 2, // v2: pizzicato bass, an FM piano and a blown horn

  kit: "acoustic",

  clock: {
    bpm: { min: 110, max: 190, default: 140 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.62,
    swingSubdiv: 8,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      // Feathered: on every beat, nearly inaudible.
      gen: { type: "mask", steps: [0, 4, 8, 12] },
      density: 0.55,
      vel: { base: 0.16, accent: 0.3, ghost: 0.1 },
      muteP: 0.2,
      minEnergy: 0.2,
    },
    {
      name: "ride",
      kitVoice: "openHat",
      // One, two-and, three, four-and. The "and"s take the swing.
      gen: { type: "mask", steps: [0, 4, 6, 8, 12, 14] },
      density: 0.6,
      vel: { base: 0.42, accent: 0.5, ghost: 0.25 },
      swingDepth: 1,
      muteP: 0.05,
      minEnergy: 0.1,
    },
    {
      name: "hat pedal",
      kitVoice: "closedHat",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.55,
      vel: { base: 0.3, accent: 0.35, ghost: 0.2 },
      muteP: 0.15,
      minEnergy: 0.2,
    },
    {
      name: "snare comp",
      kitVoice: "snare",
      // In the gaps, on the swung eighths, never on one.
      gen: { type: "stepClassP", invert: true },
      density: 0.2,
      chaos: 0.25,
      vel: { base: 0.3, accent: 0.5, ghost: 0.15 },
      swingDepth: 1,
      muteP: 0.3,
      minEnergy: 0.35,
      densitySwing: 0.2,
      fill: { amount: 0.45, span: 0.25 },
    },
  ],

  bass: {
    name: "upright",
    wave: "triangle",
    // Chord tones and steps: root, fifth, third, seventh, and the second as a passing tone.
    bags: [
      [0, 7, 4, 10],
      [0, 7, 3, 10],
      [0, 0, 7, 12, 2],
      [0, 5, 7, 10],
    ],
    rootRange: [31, 43],
    // Walking: a note on every beat.
    gen: { type: "mask", steps: [0, 4, 8, 12] },
    density: 0.6,
    chaos: 0.05,
    accentP: 0.15,
    slideP: 0.08,
    synth: { cutoff: 300, resonance: 1.5, envMod: 400, decay: 0.42 },
    // A walking bass is pizzicato: gut under a finger, with the body of the instrument
    // ringing after it. A filtered triangle is a synth bass playing walking notes, which
    // is what a blind listener heard.
    timbre: "pluck",
    poly: { cutoff: 1000, level: 1.1, pluck: { damp: 0.58, decay: 2.4, colour: 0.26 } },
    muteP: 0.05,
    minEnergy: 0.15,
  },

  chords: {
    name: "piano",
    // Comping: sparse, off the beats, varied.
    gen: { type: "stepClassP", invert: true },
    density: 0.2,
    chaos: 0.2,
    register: [55, 76],
    synth: {
      // Struck, not swept. Two operators at the octave with a fast index decay is the
      // electric piano every jazz-adjacent record has on it, and the nearest thing to a
      // hammer this engine can make.
      timbre: "fm",
      fmRatio: 1,
      fmIndex: 1.6,
      fmDecay: 0.35,
      decay: 1.4,
      level: 0.85,
    },
    swingDepth: 1,
    muteP: 0.2,
    minEnergy: 0.3,
  },

  lead: {
    name: "horn",
    // Eighth-note lines with breath in them: an arch per phrase, leaps allowed.
    gen: { type: "stepClassP" },
    density: 0.42,
    chaos: 0.25,
    register: [58, 82],
    leapiness: 0.9,
    contour: 1.3,
    chordPull: 1.2,
    synth: {
      // A tenor: slower to speak than a trumpet, darker, and with the breath holding
      // the note up rather than letting it fall away.
      timbre: "brass",
      voices: 1,
      detune: 0,
      attack: 0.055,
      sustain: 0.14,
      decay: 0.3,
      cutoff: 1200,
      envMod: 2000,
      formant: 820,
      vibrato: 12,
      vibratoHz: 5,
    },
    swingDepth: 1,
    muteP: 0.35,
    minEnergy: 0.45,
  },

  tonality: {
    scales: [
      { name: "major", weight: 0.4 },
      { name: "dorian", weight: 0.3 },
      { name: "mixolydian", weight: 0.15 },
      { name: "minor", weight: 0.15 },
    ],
    keyPrefs: [5, 10, 3, 0, 7], // F, Bb, Eb, C, G
    harmony: {
      pool: [
        { chords: ["ii7", "V7", "Imaj7", "Imaj7"], barsPerChord: 1, weight: 3 },
        { chords: ["iii7", "VI7", "ii7", "V7"], barsPerChord: 1, weight: 2 }, // turnaround
        { chords: ["Imaj7", "VI7", "ii7", "V7"], barsPerChord: 1, weight: 2 },
        { chords: ["ii7", "bII7", "Imaj7", "Imaj7"], barsPerChord: 1 }, // tritone sub
        { chords: ["i7", "i7", "i7", "i7", "bII7", "bII7", "i7", "i7"], barsPerChord: 1 }, // So What
        { chords: ["ivm7", "bVII7", "Imaj7", "Imaj7"], barsPerChord: 1 }, // backdoor
      ],
      walkP: 0.15,
      walkLength: 4,
      walkBarsPerChord: 1,
    },
  },

  fx: {
    delay: {
      noteValue: "1/4",
      feedback: 0.1,
      wet: 0.05,
      feedbackLowpassHz: 2500,
      sends: [],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 3000, hi: 14000, resonance: 0.5 },
    reverb: { size: 0.45, decay: 1.5, damp: 0.5, wet: 0.18, preDelayMs: 15, sends: ["horn", "piano", "snare comp", "ride"] },
  },

  arrangement: {
    newPatternEvery: 8,
    newPatternP: 0.5,
    newNotesEvery: 32,
    newNotesP: 0.3,
    muteEvery: 8,
    // Head, solos, head. The energy is who is soloing.
    sections: [
      { name: "head", bars: 16, energy: 0.45 },
      { name: "solo", bars: 32, energy: 0.6, energyTo: 0.9 },
      { name: "trade", bars: 16, energy: 0.75 },
      { name: "head", bars: 16, energy: 0.5 },
    ],
  },
};
