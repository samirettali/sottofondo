import type { GenreDef } from "./schema.ts";

/**
 * Ambient.
 *
 * The other end of the engine: no drums at all, attacks measured in seconds, a room
 * measured in tens of them, and harmony that changes once a minute if it changes. The
 * energy curve still runs, but between 0.25 and 0.6 — it thins and thickens a texture
 * rather than building anything.
 *
 * Quartal and added-ninth voicings, wide register, no cadence anywhere: the pitch set is
 * chosen once and never left. Eno's Airports pieces are loops of unrelated lengths that
 * never realign; the chord lane at 32 steps against a lead at 24 is the same idea on a
 * grid, and the readout will say so.
 */
export const ambient: GenreDef = {
  id: "ambient",
  name: "Ambient",
  refs: [
    "Brian Eno — 1/1",
    "Stars of the Lid — Requiem for Dying Mothers",
    "Aphex Twin — Selected Ambient Works Volume II",
    "Tim Hecker — Ravedeath, 1972",
  ],
  version: 2, // v2: a shorter opening

  kit: "acoustic",

  clock: {
    bpm: { min: 48, max: 72, default: 58 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [],

  bass: {
    name: "drone",
    wave: "sawtooth",
    bags: [[0], [0, 0, 0, 7], [0, 0, 12]],
    rootRange: [26, 38],
    // One note a bar, held: the decay is long and the filter nearly shut.
    gen: { type: "mask", steps: [0] },
    density: 0.6,
    chaos: 0,
    accentP: 0,
    slideP: 0.4,
    synth: { cutoff: 160, resonance: 1, envMod: 300, decay: 1.2 },
    muteP: 0.1,
    minEnergy: 0,
  },

  chords: {
    name: "pad",
    // Once every two bars, and long enough that the next one arrives before this has
    // gone — the voices always overlap, there is never a gap.
    gen: { type: "mask", steps: [0] },
    len: 32,
    density: 0.6,
    chaos: 0.05,
    register: [48, 84],
    synth: {
      voices: 4,
      detune: 7,
      wave: "triangle",
      attack: 2.4,
      decay: 7,
      cutoff: 1500,
      resonance: 0.5,
      envMod: 400,
    },
    muteP: 0.15,
    minEnergy: 0,
    filterSwing: 0.6,
  },

  lead: {
    name: "bell",
    // A note every few seconds, stepwise, slow to arrive. Against the pad's 32 steps
    // this lane's 24 give a cycle of six bars before the two line up.
    gen: { type: "stepClassP" },
    len: 24,
    density: 0.16,
    chaos: 0.1,
    register: [72, 91],
    leapiness: 0.4,
    contour: 0.6,
    chordPull: 1.5,
    synth: {
      voices: 1,
      detune: 0,
      wave: "sine",
      attack: 0.9,
      decay: 4,
      cutoff: 6000,
      resonance: 0.5,
      envMod: 0,
    },
    muteP: 0.3,
    minEnergy: 0.3,
  },

  tonality: {
    scales: [
      { name: "lydian", weight: 0.3 },
      { name: "major", weight: 0.25 },
      { name: "dorian", weight: 0.25 },
      { name: "minor", weight: 0.2 },
    ],
    harmony: {
      pool: [
        { chords: ["Imaj7"], barsPerChord: 8, weight: 2 },
        { chords: ["Iadd9", "IVadd9"], barsPerChord: 8, weight: 2 }, // the Lydian shimmer
        { chords: ["i", "bVI"], barsPerChord: 8 },
        { chords: ["Iquartal", "IVquartal"], barsPerChord: 8 },
        { chords: ["i9", "bIIImaj7"], barsPerChord: 8 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/2",
      feedback: 0.6,
      wet: 0.3,
      feedbackLowpassHz: 1800,
      sends: ["bell"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 1400, hi: 9000, resonance: 0.5 },
    reverb: { size: 1, decay: 11, damp: 0.6, wet: 0.55, preDelayMs: 60, sends: ["pad", "bell", "drone"] },
  },

  arrangement: {
    newPatternEvery: 32,
    newPatternP: 0.3,
    newNotesEvery: 64,
    newNotesP: 0.2,
    muteEvery: 16,
    sections: [
      { name: "still", bars: 16, energy: 0.35, energyTo: 0.5 },
      { name: "swell", bars: 32, energy: 0.45, energyTo: 0.6 },
      { name: "still", bars: 32, energy: 0.5, energyTo: 0.25 },
    ],
  },
};
