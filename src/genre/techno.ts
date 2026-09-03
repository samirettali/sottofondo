import type { GenreDef } from "./schema.ts";

/**
 * Detroit and minimal techno.
 *
 * Written as a test of the claim that a genre costs a file and no code. It exercises
 * three things acid does not: a tempo band, a sidechain, and a polymetric lane.
 *
 * The kick has no variation whatsoever, which is the point — constancy is what the rest
 * moves against. All the variation lives in one auxiliary lane, the way the analysed
 * corpora have it: a rigid core with a single voice rotating underneath.
 *
 * The percussion runs a seven-step Euclidean figure against everything else's sixteen,
 * so the two grids align only every 112 steps — seven bars. That drift is the whole
 * mechanism of minimal techno, and it costs one number here.
 *
 * Harmony: none. Butler's phrase for techno is a "total lack of cadences", and the
 * research is consistent that its energy comes from filter and density rather than from
 * chord movement.
 */
export const techno: GenreDef = {
  id: "techno",
  name: "Minimal techno",
  refs: [
    "Jeff Mills — The Bells",
    "Robert Hood — Minus",
    "Plastikman — Spastik",
    "Model 500 — No UFO's",
  ],
  version: 2, // v2: the bass used to be a minute away

  kit: "909",

  clock: {
    // Beatport medians put techno at 126 and minimal at 127.5, with a standard deviation
    // of 1.6 — this is an effectively fixed-tempo genre, so the band is narrow.
    bpm: { min: 125, max: 132, default: 128 },
    stepsPerBar: 16,
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
      muteP: 0.1, // it almost never leaves
    },
    {
      name: "rim",
      kitVoice: "rim",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.55,
      vel: { base: 0.5, accent: 0.65, ghost: 0.3 },
      muteP: 0.4,
      minEnergy: 0.4,
    },
    {
      name: "closed hat",
      kitVoice: "closedHat",
      gen: { type: "mask", steps: [2, 6, 10, 14] },
      density: 0.55,
      vel: { base: 0.35, accent: 0.45, ghost: 0.2 },
      muteP: 0.3,
    },
    {
      name: "ghost hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      density: 0.35,
      chaos: 0.2,
      vel: { base: 0.12, accent: 0.18, ghost: 0.06 },
      muteP: 0.5,
      minEnergy: 0.5,
      densitySwing: 0.2,
    },
    {
      name: "perc",
      kitVoice: "cowbell",
      // E(3,7) — Ruchenitza. Seven steps against sixteen, so the composite cycle is 112
      // steps and the figure lands somewhere new in the bar for seven bars running.
      gen: { type: "euclid", k: 3, n: 7 },
      len: 7,
      density: 0.5,
      vel: { base: 0.22, accent: 0.3, ghost: 0.12 },
      muteP: 0.45,
      // The last element to arrive, and the first to go.
      minEnergy: 0.65,
    },
  ],

  bass: {
    name: "bass",
    wave: "square",
    // Root and octave, with a fifth. Minimal techno's bass says almost nothing on
    // purpose; the movement is in the filter.
    bags: [[0], [0, 0, 12], [0, 0, 0, 7], [0, 0, 12, 7, 12]],
    rootRange: [28, 40],
    gen: { type: "stepClassP" },
    density: 0.42, // sparser than acid: short stabs, not a running line
    chaos: 0.15,
    accentP: 0.2,
    slideP: 0.02,
    // Low cutoff and a short envelope: stabby rather than squelchy.
    synth: { cutoff: 260, resonance: 9, envMod: 2200, decay: 0.2 },
    muteP: 0.15,
    minEnergy: 0.45,
    densitySwing: 0.15,
    filterSwing: 1,
  },

  fx: {
    delay: {
      noteValue: "3/16",
      feedback: 0.45,
      wet: 0.2,
      feedbackLowpassHz: 2500, // repeats darken, the dub inheritance
      sends: ["perc"],
    },
    // Detroit does not pump, but a couple of dB gives the kick room.
    sidechain: { db: 2, releaseMs: 120, targets: ["bass"] },
    // Techno's energy is in the filter, since nothing else about it changes much. A
    // narrower range than house: this is a long slow opening, not a drop.
    energyFilter: { type: "lowpass", lo: 1200, hi: 16000, resonance: 0.7 },
    // Detroit's stab sits in a hall; the kick and hats stay dry and close.
    // Dry and close. The hypnosis in minimal techno comes from having nothing to hide
    // behind, and three and a half seconds of tail on the bass made this preset sound
    // like the dub techno one — asked which of the two was Basic Channel, a blind
    // listener picked this. The long room belongs to that preset, not this one.
    reverb: { size: 0.6, decay: 1.5, damp: 0.6, wet: 0.12, preDelayMs: 20, sends: ["perc", "rim"] },
  },

  arrangement: {
    // Longer than acid: techno arranges by accretion, one element every sixteen bars,
    // and nothing "drops".
    newPatternEvery: 32,
    newPatternP: 0.3,
    newNotesEvery: 64,
    newNotesP: 0.15,
    muteEvery: 16,
    // No drop. Techno arranges by accretion: energy climbs slowly, holds a long time,
    // dips once, and climbs again. The kick never leaves.
    sections: [
      { name: "intro", bars: 8, energy: 0.45, energyTo: 0.6 },
      { name: "layer", bars: 32, energy: 0.55, energyTo: 0.75 },
      { name: "peak", bars: 64, energy: 0.85 },
      { name: "strip", bars: 16, energy: 0.4 },
      { name: "peak", bars: 64, energy: 0.95 },
      { name: "outro", bars: 32, energy: 0.6, energyTo: 0.3 },
    ],
  },
};
