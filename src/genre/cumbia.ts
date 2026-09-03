import type { GenreDef } from "./schema.ts";

/**
 * Cumbia — the Colombian one, at the tempo the sonideros slowed it to.
 *
 * The rhythm is three parts that never change: the guacharaca scraping every eighth
 * with a scrape-and-return, the tambor alegre on the offbeats, and the bombo — the bass
 * drum — on the "and" of two and the "and" of four rather than on the beats. That last
 * is the whole feel: the low drum is *between* the beats, and the bass line answers it.
 *
 * Toussaint lists E(3,4) rotated as cumbia's timeline, which is the guacharaca's
 * scrape-scrape-return in four; here it is a mask because the rotation matters.
 */
export const cumbia: GenreDef = {
  id: "cumbia",
  name: "Cumbia",
  refs: [
    "Los Ángeles Azules — Cómo Te Voy a Olvidar",
    "Lucho Bermúdez — Colombia Tierra Querida",
    "Celso Piña — Cumbia Sobre el Río",
    "Los Mirlos — La Danza de los Mirlos",
  ],
  version: 3, // v3: hand percussion instead of a drum kit, and the llamador keeps time
  // v2: a real accordion and a plucked bass, and the opening states the genre

  kit: "acoustic",

  clock: {
    bpm: { min: 88, max: 104, default: 94 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.53,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "bombo",
      kitVoice: "kick",
      // Between the beats: the and of two, the and of four.
      gen: { type: "mask", steps: [6, 14] },
      density: 0.6,
      vel: { base: 0.85, accent: 1, ghost: 0.5 },
      muteP: 0.1,
      minEnergy: 0.2,
    },
    {
      name: "alegre",
      // Hands on a skin, not a tom.
      kitVoice: "slap",
      gen: { type: "mask", steps: [2, 4, 10, 12] },
      density: 0.55,
      vel: { base: 0.5, accent: 0.65, ghost: 0.3 },
      swingDepth: 1,
      muteP: 0.3,
      minEnergy: 0.35,
    },
    {
      name: "llamador",
      // The caller: a muted hand stroke on the offbeat, not a rimshot.
      kitVoice: "frame",
      // The caller keeps the offbeat eighths, always — which is what the density now says
      // too. It is the lane that makes the pattern cumbia rather than a backbeat.
      gen: { type: "mask", steps: [2, 6, 10, 14] },
      density: 0.9,
      vel: { base: 0.4, accent: 0.5, ghost: 0.25 },
      swingDepth: 1,
      muteP: 0.2,
      minEnergy: 0.3,
    },
    {
      name: "guacharaca",
      // The loudest lane in the preset by a distance, and it was a closed hi-hat: a
      // scraped ridge is what makes the pattern cumbia rather than sixteenths.
      kitVoice: "scrape",
      // Scrape and return: every eighth, with the return lighter.
      gen: { type: "mask", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
      density: 0.55,
      vel: { base: 0.22, accent: 0.32, ghost: 0.1 },
      swingDepth: 1,
      muteP: 0.25,
      minEnergy: 0.25,
    },
    {
      name: "cowbell",
      kitVoice: "cowbell",
      gen: { type: "stepClassP", invert: true },
      density: 0.14,
      chaos: 0.15,
      vel: { base: 0.3, accent: 0.4, ghost: 0.15 },
      muteP: 0.5,
      minEnergy: 0.6,
      fill: { amount: 0.4, span: 0.25 },
    },
  ],

  bass: {
    name: "bass",
    wave: "sawtooth",
    // Root and fifth, answering the bombo on the beats it leaves empty.
    bags: [
      [0, 0, 7],
      [0, 0, 0, 7, 12],
      [0, 7, 0, 5],
    ],
    rootRange: [31, 43],
    gen: { type: "mask", steps: [0, 4, 8, 12] },
    density: 0.58,
    chaos: 0.08,
    accentP: 0.2,
    slideP: 0.05,
    synth: { cutoff: 360, resonance: 2, envMod: 700, decay: 0.3 },
    timbre: "pluck",
    poly: { cutoff: 900, level: 1.5, pluck: { damp: 0.58, decay: 1.5, colour: 0.28 } },
    swingDepth: 0.5,
    muteP: 0.1,
    minEnergy: 0.2,
  },

  chords: {
    name: "acordeón",
    // The accordion comps on the offbeats with the llamador.
    gen: { type: "mask", steps: [2, 6, 10, 14] },
    density: 0.55,
    chaos: 0.1,
    register: [57, 79],
    synth: {
      // A vallenato accordion, comping short: reeds, but the bellows stop between chops.
      timbre: "reed",
      voices: 3,
      detune: 12,
      attack: 0.035,
      sustain: 0.1,
      decay: 0.09,
      cutoff: 2800,
      vibrato: 4,
      level: 1.7,
    },
    swingDepth: 1,
    muteP: 0.3,
    minEnergy: 0.4,
  },

  lead: {
    name: "melody",
    gen: { type: "stepClassP" },
    density: 0.38,
    chaos: 0.15,
    register: [64, 84],
    leapiness: 0.7,
    contour: 1.5,
    chordPull: 2,
    synth: {
      // The same instrument taking the tune, held longer.
      timbre: "reed",
      voices: 3,
      detune: 14,
      attack: 0.03,
      sustain: 0.2,
      decay: 0.1,
      cutoff: 3200,
      vibrato: 7,
      level: 1.7,
    },
    swingDepth: 1,
    muteP: 0.3,
    minEnergy: 0.5,
  },

  tonality: {
    scales: [
      { name: "minor", weight: 0.5 },
      { name: "major", weight: 0.5 },
    ],
    keyPrefs: [9, 2, 4, 7],
    harmony: {
      pool: [
        // Two chords for a whole song is normal and correct here.
        { chords: ["i", "V"], barsPerChord: 2, weight: 3 },
        { chords: ["I", "V"], barsPerChord: 2, weight: 2 },
        { chords: ["i", "iv", "V", "i"], barsPerChord: 2 },
        { chords: ["I", "IV", "V", "I"], barsPerChord: 2 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8",
      feedback: 0.25,
      wet: 0.12,
      feedbackLowpassHz: 3000,
      sends: ["melody"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 2000, hi: 14000, resonance: 0.5 },
    reverb: { size: 0.5, decay: 1.6, damp: 0.5, wet: 0.2, preDelayMs: 15, sends: ["acordeón", "melody", "alegre"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.35,
    newNotesEvery: 32,
    newNotesP: 0.25,
    muteEvery: 8,
    sections: [
      { name: "intro", bars: 8, energy: 0.45 },
      { name: "verse", bars: 16, energy: 0.55 },
      { name: "chorus", bars: 16, energy: 0.8 },
      { name: "verse", bars: 16, energy: 0.6 },
      { name: "chorus", bars: 16, energy: 0.9 },
      { name: "outro", bars: 8, energy: 0.4 },
    ],
  },
};
