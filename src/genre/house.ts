import type { GenreDef } from "./schema.ts";

/**
 * Deep house.
 *
 * The first preset with harmony, and the first with swing. Three things separate it from
 * the techno above it, and none of them is the drum pattern:
 *
 *   - **Swing on the hats and the bass, never on the kick.** The kick stays on the grid
 *     and everything else leans against it. A global swing setting cannot express this,
 *     which is why swing depth is per voice.
 *   - **The bass plays off the kick**, on the offbeat eighths. That bounce against a
 *     four-on-the-floor kick is house; put the bass on the kick and it is techno.
 *   - **The voicing is the genre, not the progression.** Two chords are enough. Sevenths
 *     and ninths, close together, led so the inner voices barely move.
 *
 * Tempo from the GiantSteps corpus: deep house has a median of 122 with a standard
 * deviation of 8.3, so the band is narrow and centred there.
 *
 * Swing at 56% is inside Linn's useful range — 54% "removes the stiffness", 62% is
 * "looser than a perfect triplet swing". At 122 BPM that is about 15 ms of delay on every
 * second sixteenth.
 */
export const house: GenreDef = {
  id: "house",
  name: "Deep house",
  refs: [
    "Mr. Fingers — Can You Feel It",
    "Kerri Chandler — Rain",
    "Moodymann — Shades of Jae",
    "MK — Burning",
  ],
  version: 2, // v2: the bass follows the chord root; it used to pick its own key

  clock: {
    bpm: { min: 118, max: 126, default: 122 },
    stepsPerBar: 16,
    swing: 0.56,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 4, 8, 12] },
      density: 0.6,
      vel: { base: 1, accent: 1, ghost: 0.85 },
      swingDepth: 0, // the anchor: never swung
      muteP: 0.15,
      // The breakdown is defined by the kick leaving. That absence is the loudest event
      // in a house track.
      minEnergy: 0.25,
    },
    {
      name: "clap",
      kitVoice: "clap",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 0.85, accent: 1, ghost: 0.5 },
      swingDepth: 0,
      muteP: 0.4,
      minEnergy: 0.4,
    },
    {
      name: "open hat",
      kitVoice: "openHat",
      gen: { type: "mask", steps: [2, 6, 10, 14] },
      density: 0.55,
      vel: { base: 0.5, accent: 0.6, ghost: 0.25 },
      swingDepth: 1,
      muteP: 0.35,
    },
    {
      name: "closed hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      density: 0.6,
      chaos: 0.2,
      accentAt: 0.8,
      vel: { base: 0.25, accent: 0.35, ghost: 0.1 },
      swingDepth: 1,
      muteP: 0.35,
      // The hats thicken as the track lifts: this is most of what a build sounds like.
      // No fill here: at peak energy this lane is firing on nearly every sixteenth, so
      // extra density has nowhere to go. The shaker carries the fills instead.
      densitySwing: 0.25,
    },
    {
      name: "shaker",
      kitVoice: "rim",
      // Inverted, so the shaker lands between the beats where it belongs.
      gen: { type: "stepClassP", invert: true },
      // Inverted lanes want a much lower density: almost every step is a likely one.
      density: 0.2,
      chaos: 0.15,
      vel: { base: 0.12, accent: 0.18, ghost: 0.06 },
      swingDepth: 1,
      muteP: 0.5,
      minEnergy: 0.5,
      densitySwing: 0.2,
      fill: { amount: 0.3, span: 0.25 },
    },
  ],

  bass: {
    name: "bass",
    wave: "sawtooth",
    // Root, octave, flat seventh, fifth — the house bass vocabulary, with the root
    // weighted by repetition.
    bags: [
      [0, 0, 0, 12],
      [0, 0, 12, 10],
      [0, 0, 0, 7, 12, 10],
      [0, 0, 3, 7, 10],
    ],
    rootRange: [33, 45], // A1 to A2
    // Off the kick, but not the same four steps every bar: an inverted curve keeps it
    // between the beats and varies it, and it no longer doubles the chord stabs.
    gen: { type: "stepClassP", invert: true },
    density: 0.24,
    chaos: 0.1,
    accentP: 0.25,
    slideP: 0.05,
    // Round and short. A sub with the filter mostly closed, not a squelch.
    synth: { cutoff: 320, resonance: 4, envMod: 1400, decay: 0.22 },
    swingDepth: 1,
    muteP: 0.15,
    minEnergy: 0.3,
    filterSwing: 0.7,
  },

  chords: {
    name: "chords",
    // Two stabs a bar, on the "and" of one and of three. Four was every offbeat, and with
    // the bass on the same four it was a machine, not a groove.
    gen: { type: "mask", steps: [2, 10] },
    density: 0.55,
    chaos: 0.15,
    register: [55, 79], // G3 to G5, where a Rhodes-ish stab sits
    synth: {
      voices: 3,
      detune: 14,
      wave: "sawtooth",
      attack: 0.006,
      decay: 0.4,
      cutoff: 2200,
      resonance: 1.2,
      envMod: 1500,
    },
    swingDepth: 1,
    muteP: 0.3,
    // Chords carry the breakdown, so they stay in when everything else has gone.
    minEnergy: 0.1,
    filterSwing: 1,
  },

  tonality: {
    scales: [
      { name: "minor", weight: 0.5 },
      { name: "dorian", weight: 0.4 },
      { name: "mixolydian", weight: 0.1 },
    ],
    // A, D, F, G minor — where house tends to sit.
    keyPrefs: [9, 2, 5, 7],
    harmony: {
      pool: [
        { chords: ["i7", "bVII", "bVI", "bVII"], barsPerChord: 1, weight: 2 },
        { chords: ["i7", "iv7"], barsPerChord: 2, weight: 2 },
        { chords: ["ii7", "V7", "Imaj7", "Imaj7"], barsPerChord: 1 },
        { chords: ["i9", "iv9"], barsPerChord: 2, weight: 1.5 },
        // Dorian: a major IV over a minor i is the mode's signature, and the reason to
        // reach for Dorian rather than Aeolian at all.
        { chords: ["i7", "IV7"], barsPerChord: 2, weight: 1.5 },
        { chords: ["IVmaj7", "iii7", "vi7", "ii7"], barsPerChord: 1 },
      ],
      // Mostly the pool. Deep house is a handful of vamps, not a Markov chain.
      walkP: 0.1,
      walkLength: 4,
      walkBarsPerChord: 1,
    },
  },

  fx: {
    delay: {
      noteValue: "3/16",
      feedback: 0.3,
      wet: 0.18,
      feedbackLowpassHz: 4000,
      sends: ["chords"],
    },
    // House pumps, and this is where it comes from. 5 dB with a 100 ms release.
    sidechain: { db: 5, releaseMs: 100, targets: ["bass", "chords"] },
    // A lid that comes off as the track lifts. Nearly closed in the breakdown, wide open
    // at the peak — the range is deliberately wide, since house breakdowns filter rather
    // than strip.
    energyFilter: { type: "lowpass", lo: 700, hi: 18000, resonance: 0.9 },
    // A plate-ish room on the stabs and clap. Deep house lives in this space; without it
    // the chords were dry synth sitting on top of the kit.
    reverb: { size: 0.55, decay: 2.2, damp: 0.45, wet: 0.28, preDelayMs: 20, sends: ["chords", "clap", "open hat"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.4,
    // Harmony moves slowly: a key or progression change every 64 bars at most.
    newNotesEvery: 64,
    newNotesP: 0.25,
    muteEvery: 8,
    // DJ-friendly: a long intro of drums only, a breakdown that takes the kick away,
    // and everything in multiples of eight.
    sections: [
      { name: "intro", bars: 16, energy: 0.3 },
      { name: "build", bars: 16, energy: 0.35, energyTo: 0.75 },
      { name: "main", bars: 32, energy: 0.85 },
      { name: "breakdown", bars: 16, energy: 0.15 },
      { name: "build", bars: 8, energy: 0.4, energyTo: 0.9 },
      { name: "main", bars: 32, energy: 0.95 },
      { name: "outro", bars: 16, energy: 0.5, energyTo: 0.3 },
    ],
  },
};
