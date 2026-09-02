import type { GenreDef } from "./schema.ts";

/**
 * Balkan brass — the Romani fanfare, Fanfare Ciocărlia and everything Magic Mamaliga
 * plays in the wrong key on purpose.
 *
 * A tuba on the beats and a helicon answering off them, snare and bass drum flat out, a
 * wall of trumpets and saxes on the offbeats, and a solo horn on top in the Hungarian
 * minor — harmonic minor with the fourth raised, which gives the two augmented seconds
 * everyone hears as "gypsy". Fast: a čoček or hora at 180 and up, in two.
 *
 * The 2/4 is written as sixteen sixteenths at a quarter-note tempo, so the beat the
 * tuba plays is every fourth step and the brass hits between them.
 */
export const gypsy: GenreDef = {
  id: "gypsy",
  name: "Balkan brass",
  refs: [
    "Fanfare Ciocărlia — Asfalt Tango",
    "Boban Marković Orkestar — Đurđevdan",
    "Kočani Orkestar — L'Orient Est Rouge",
    "Taraf de Haïdouks — Dumbala Dumba",
  ],
  version: 2, // v2: the band is brass rather than saws

  kit: "acoustic",

  clock: {
    bpm: { min: 150, max: 210, default: 184 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "bass drum",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 8] },
      density: 0.6,
      vel: { base: 0.9, accent: 1, ghost: 0.6 },
      muteP: 0.05,
      minEnergy: 0.15,
    },
    {
      name: "snare",
      kitVoice: "snare",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 0.85, accent: 1, ghost: 0.5 },
      muteP: 0.1,
      minEnergy: 0.25,
    },
    {
      name: "snare rolls",
      kitVoice: "snare",
      gen: { type: "stepClassP", invert: true },
      density: 0.2,
      chaos: 0.25,
      vel: { base: 0.22, accent: 0.35, ghost: 0.1 },
      muteP: 0.3,
      minEnergy: 0.45,
      densitySwing: 0.3,
      fill: { amount: 0.5, span: 0.3 },
    },
    {
      name: "cymbal",
      kitVoice: "openHat",
      gen: { type: "mask", steps: [0, 8] },
      density: 0.5,
      vel: { base: 0.3, accent: 0.4, ghost: 0.15 },
      muteP: 0.5,
      minEnergy: 0.6,
    },
  ],

  bass: {
    name: "tuba",
    wave: "sawtooth",
    // A tuba, not a 303 playing tuba notes. The formant is the whole difference: a
    // trumpet's peak sits above a kilohertz, a tuba's around 300, and a low brass line
    // given the trumpet's peak comes back as a bass drum.
    timbre: "brass",
    poly: {
      cutoff: 850,
      envMod: 1500,
      formant: 320,
      attack: 0.045,
      sustain: 0.16,
      decay: 0.22,
      vibrato: 6,
      level: 1,
    },
    // Root and fifth, oompah: the octave for the helicon's answer.
    bags: [
      [0, 7, 0, 7],
      [0, 7, 12, 7],
      [0, 0, 7, 5],
    ],
    rootRange: [31, 43],
    // On every beat, the fifth on the weak ones falling out of the bag.
    gen: { type: "mask", steps: [0, 4, 8, 12] },
    density: 0.6,
    chaos: 0.05,
    accentP: 0.3,
    slideP: 0.02,
    synth: { cutoff: 380, resonance: 2, envMod: 700, decay: 0.16 },
    muteP: 0.05,
    minEnergy: 0.15,
  },

  chords: {
    name: "brass",
    // The section, on the offbeats, short and loud. Wide detune for a section of six.
    gen: { type: "mask", steps: [2, 6, 10, 14] },
    density: 0.58,
    chaos: 0.1,
    register: [55, 76],
    synth: {
      timbre: "brass",
      voices: 3,
      detune: 14,
      // Short and hard, but still blown: the section punches the offbeat and stops.
      attack: 0.028,
      sustain: 0.05,
      decay: 0.14,
      cutoff: 1400,
      resonance: 1.4,
      envMod: 2400,
      formant: 1050,
      vibrato: 8,
    },
    muteP: 0.15,
    minEnergy: 0.3,
  },

  lead: {
    name: "trumpet",
    // Fast, ornamented, always going somewhere: high density, arch, steps with the odd
    // leap up to the augmented second.
    gen: { type: "stepClassP" },
    density: 0.6,
    chaos: 0.15,
    register: [64, 88],
    leapiness: 0.6,
    contour: 1.6,
    chordPull: 1,
    synth: {
      timbre: "brass",
      voices: 2,
      detune: 6,
      attack: 0.04,
      sustain: 0.08,
      decay: 0.18,
      cutoff: 1600,
      resonance: 1.6,
      envMod: 2600,
      formant: 1250,
      vibrato: 16,
    },
    muteP: 0.15,
    minEnergy: 0.35,
    densitySwing: 0.2,
  },

  tonality: {
    scales: [
      { name: "hungarianMinor", weight: 0.45 },
      { name: "harmonicMinor", weight: 0.35 },
      { name: "hicaz", weight: 0.2 },
    ],
    keyPrefs: [2, 9, 4, 7],
    harmony: {
      pool: [
        { chords: ["i", "V", "i", "V"], barsPerChord: 1, weight: 3 },
        { chords: ["i", "iv", "V", "i"], barsPerChord: 1, weight: 2 },
        { chords: ["i", "bVI", "V", "i"], barsPerChord: 1 },
        { chords: ["i", "V"], barsPerChord: 2 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8",
      feedback: 0.15,
      wet: 0.08,
      feedbackLowpassHz: 3500,
      sends: ["trumpet"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 2200, hi: 16000, resonance: 0.6 },
    // A street, not a hall: short and bright.
    reverb: { size: 0.4, decay: 1.1, damp: 0.35, wet: 0.2, preDelayMs: 10, sends: ["brass", "trumpet", "snare"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.45,
    newNotesEvery: 32,
    newNotesP: 0.3,
    muteEvery: 8,
    sections: [
      { name: "intro", bars: 8, energy: 0.5 },
      { name: "tune", bars: 16, energy: 0.65 },
      { name: "solo", bars: 16, energy: 0.8, energyTo: 0.95 },
      { name: "tune", bars: 16, energy: 0.75 },
      { name: "faster", bars: 16, energy: 1 },
    ],
    tempoSwing: 0.08,
  },
};
