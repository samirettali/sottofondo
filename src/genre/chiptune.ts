import type { GenreDef } from "./schema.ts";

/**
 * Chiptune — the NES's five channels, as far as this engine can honour them.
 *
 * The genre is a hardware constraint: two pulse channels, one triangle with no volume
 * envelope at all, one noise, and no chords — a chord is a pulse channel cycling its
 * notes fast enough that the ear fuses them. No reverb, ever; an echo is written into
 * the pattern as the same note again, quieter.
 *
 * What is honoured: square waves only, a triangle bass, noise drums, an arpeggio in
 * place of chords, a baked-in echo lane, an AABA form, and no room. What is not: the
 * volume is not quantised to sixteen levels and the pulse duty cycle cannot change,
 * which together are a good half of what "sounds like a NES". Both would be code.
 */
export const chiptune: GenreDef = {
  id: "chiptune",
  name: "Chiptune",
  refs: [
    "Koji Kondo — Super Mario Bros. Ground Theme",
    "Hirokazu Tanaka — Tetris (Type A, the Game Boy one)",
    "Rob Hubbard — Monty on the Run",
    "Yuzo Koshiro — Streets of Rage 2: Go Straight",
  ],
  version: 1,

  kit: "909", // noise hats, a short kick: the closest of the four to a noise channel
  velocityBits: 4, // sixteen levels, as the hardware had

  clock: {
    bpm: { min: 130, max: 180, default: 152 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 6, 8, 14] },
      density: 0.58,
      vel: { base: 0.85, accent: 1, ghost: 0.6 },
      muteP: 0.1,
      minEnergy: 0.25,
    },
    {
      name: "snare",
      kitVoice: "snare",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 0.8, accent: 0.95, ghost: 0.5 },
      muteP: 0.15,
      minEnergy: 0.3,
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
      name: "noise fills",
      kitVoice: "snare",
      gen: { type: "stepClassP", invert: true },
      density: 0.14,
      chaos: 0.2,
      vel: { base: 0.25, accent: 0.4, ghost: 0.12 },
      muteP: 0.4,
      minEnergy: 0.55,
      fill: { amount: 0.5, span: 0.25 },
    },
  ],

  bass: {
    name: "triangle",
    wave: "triangle",
    // Root and octave in continuous eighths, gate nearly full: the triangle channel is
    // on or off, with nothing in between.
    bags: [
      [0, 12, 0, 12],
      [0, 0, 12, 7],
      [0, 12, 7, 12],
    ],
    rootRange: [33, 45],
    gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
    density: 0.6,
    chaos: 0.03,
    accentP: 0,
    slideP: 0,
    // Wide open: the triangle has no filter and no envelope, so this one barely moves.
    synth: { cutoff: 3000, resonance: 0.5, envMod: 0, decay: 0.2 },
    muteP: 0.05,
    minEnergy: 0.2,
  },

  chords: {
    name: "echo",
    // Not a chord lane in spirit: a second pulse channel that repeats the arpeggio's
    // harmony a step late and quieter, which is how a NES fakes an echo.
    gen: { type: "mask", steps: [1, 5, 9, 13] },
    density: 0.5,
    chaos: 0.15,
    register: [67, 88],
    synth: {
      voices: 1,
      detune: 0,
      wave: "square",
      duty: 0.125, // thinner than the lead, so the echo sits behind it
      attack: 0.002,
      decay: 0.08,
      cutoff: 6000,
      resonance: 0.5,
      envMod: 0,
    },
    muteP: 0.4,
    minEnergy: 0.5,
  },

  lead: {
    name: "pulse",
    // The melody and the harmony at once: a square running sixteenths through the chord
    // tones, with a leap welcome, since the arpeggio is what the channel is doing.
    gen: { type: "mask", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    density: 0.55,
    chaos: 0.1,
    register: [67, 91],
    leapiness: 1.8,
    contour: 0.6,
    chordPull: 3.5,
    synth: {
      voices: 1,
      detune: 0,
      wave: "square",
      duty: 0.25, // the classic NES lead width
      attack: 0.002,
      decay: 0.11,
      cutoff: 8000,
      resonance: 0.5,
      envMod: 0,
    },
    muteP: 0.15,
    minEnergy: 0.15,
    densitySwing: 0.2,
  },

  tonality: {
    scales: [
      { name: "major", weight: 0.45 },
      { name: "minor", weight: 0.35 },
      { name: "mixolydian", weight: 0.1 },
      { name: "harmonicMinor", weight: 0.1 },
    ],
    keyPrefs: [0, 7, 9, 4], // C, G, A, E
    harmony: {
      pool: [
        { chords: ["I", "V", "vi", "IV"], barsPerChord: 1, weight: 2 },
        { chords: ["I", "IV", "V", "I"], barsPerChord: 1, weight: 2 },
        { chords: ["vi", "IV", "I", "V"], barsPerChord: 1 },
        { chords: ["i", "bVI", "bIII", "bVII"], barsPerChord: 1, weight: 1.5 },
        { chords: ["i", "iv", "v", "i"], barsPerChord: 1 },
        { chords: ["i", "bVII", "bVI", "V"], barsPerChord: 1 }, // the Tetris one
      ],
      walkP: 0.1,
      walkLength: 4,
      walkBarsPerChord: 1,
    },
  },

  fx: {
    // Nothing. A NES has no effects, and the echo is a lane.
    delay: { noteValue: "1/8", feedback: 0, wet: 0, sends: [] },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
  },

  arrangement: {
    newPatternEvery: 8,
    newPatternP: 0.4,
    newNotesEvery: 32,
    newNotesP: 0.35,
    muteEvery: 8,
    // AABA over thirty-two, then again. A game loop has no ending.
    sections: [
      { name: "A", bars: 8, energy: 0.6 },
      { name: "A", bars: 8, energy: 0.65 },
      { name: "B", bars: 8, energy: 0.85 },
      { name: "A", bars: 8, energy: 0.7 },
      { name: "bridge", bars: 8, energy: 0.4 },
    ],
  },
};
