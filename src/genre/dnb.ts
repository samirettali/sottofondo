import type { GenreDef } from "./schema.ts";

/**
 * Liquid drum & bass.
 *
 * The genre that tests whether the schema really holds, because three of its defining
 * features are structural rather than cosmetic:
 *
 *   - **A two-bar unit.** The pattern is 32 steps, not 16. Bar two varies against bar
 *     one, and the metric curve for 32 steps makes that happen on its own by weighting
 *     the second bar slightly lower.
 *   - **Half-time harmony.** Written at 174, the drums move at 174 and everything tonal
 *     moves at 87. `barsPerChord: 2` is the whole implementation.
 *   - **A fixed snare.** Steps 4 and 12 of each bar never move; everything else varies
 *     around them. That is the anchor listeners track, and it is a mask rather than
 *     anything probabilistic.
 *
 * Tempo from the GiantSteps corpus: the drum-and-bass median is 173 across 139
 * human-annotated tracks. Note the corpus is bimodal — half-time annotations cluster near
 * 87 — which is why the band here is narrow rather than wide.
 *
 * Duncan and Orgs (2024) found that low-frequency amplitude gates whether syncopation
 * increases groove at all: high sub plus high syncopation rates highest, and low sub
 * rates lowest regardless. Hence a sub that holds under the whole phrase rather than
 * a busy bassline.
 */
export const dnb: GenreDef = {
  id: "dnb",
  name: "Liquid drum & bass",
  refs: [
    "LTJ Bukem — Horizons",
    "Calibre — Mystic",
    "Goldie — Inner City Life",
    "High Contrast — Global Love",
  ],
  version: 1,

  clock: {
    bpm: { min: 168, max: 178, default: 174 },
    stepsPerBar: 16,
    swing: 0.52, // barely there; liquid leans, jungle does not
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      // The two-step: bar one on 1 and the "and of 3", bar two adding a pickup.
      gen: { type: "mask", steps: [0, 10, 16, 22, 26] },
      len: 32,
      density: 0.55,
      vel: { base: 0.95, accent: 1, ghost: 0.6 },
      muteP: 0.1,
      // The breakdown takes the drums out completely — filtering them is a house move,
      // not a drum & bass one.
      minEnergy: 0.25,
    },
    {
      name: "snare",
      kitVoice: "snare",
      // Fixed. Everything else in the kit varies around these four hits.
      gen: { type: "mask", steps: [4, 12, 20, 28] },
      len: 32,
      density: 0.6,
      vel: { base: 1, accent: 1, ghost: 0.7 },
      muteP: 0.05,
      minEnergy: 0.25,
    },
    {
      name: "ghost snare",
      kitVoice: "snare",
      // Inverted: ghosts belong where the beat is not. Breakbeat genres exploit the
      // metrically weak positions, which is precisely what four-on-the-floor avoids.
      gen: { type: "stepClassP", invert: true },
      len: 32,
      // Much lower than an upright lane wants. Inverted, almost every step is a likely
      // one, so the same density that gives a hat eight hits gives this twenty.
      density: 0.14,
      chaos: 0.12,
      vel: { base: 0.16, accent: 0.24, ghost: 0.08 },
      muteP: 0.4,
      minEnergy: 0.4,
      densitySwing: 0.1,
      // The ghosts crowd in at phrase ends: the genre's own way of filling, and it needs
      // no separate voice.
      fill: { amount: 0.4, span: 0.25 },
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      len: 32,
      density: 0.5,
      chaos: 0.2,
      accentAt: 0.75,
      vel: { base: 0.3, accent: 0.4, ghost: 0.12 },
      swingDepth: 1,
      muteP: 0.3,
      minEnergy: 0.25,
      densitySwing: 0.2,
    },
    {
      name: "ride",
      kitVoice: "openHat",
      gen: { type: "euclid", k: 5, n: 8 }, // cinquillo, riding under the two-step
      len: 8,
      density: 0.35,
      vel: { base: 0.14, accent: 0.2, ghost: 0.07 },
      swingDepth: 1,
      muteP: 0.5,
    },
  ],

  bass: {
    name: "sub",
    // A sine would be truer, but the 303 voice with the filter shut is close and keeps
    // one synth doing the work of two.
    wave: "sawtooth",
    // Root and fifth, an octave below anything else. The sub says very little.
    bags: [[0], [0, 0, 0, 12], [0, 0, 0, 0, 7], [0, 0, 0, 7, 12]],
    rootRange: [24, 36], // C1 to C2
    // Sparse and long: one or two notes a bar, held.
    gen: { type: "mask", steps: [0, 10, 16, 26] },
    len: 32,
    density: 0.5,
    chaos: 0.1,
    accentP: 0.15,
    slideP: 0.3, // the slide between sub notes is a genre signature
    synth: { cutoff: 180, resonance: 2, envMod: 600, decay: 0.9 },
    muteP: 0.1,
    minEnergy: 0.3,
  },

  chords: {
    name: "pad",
    // Sustained, one hit per two bars, under the whole phrase.
    gen: { type: "mask", steps: [0] },
    len: 32,
    density: 0.6,
    register: [55, 79],
    synth: {
      voices: 3,
      detune: 9,
      wave: "sawtooth",
      attack: 0.35, // a slow attack, so it swells rather than stabs
      decay: 2.4,
      cutoff: 1400,
      resonance: 0.8,
      envMod: 900,
    },
    muteP: 0.25,
    // The pad is what the breakdown is made of, so it is the one voice that stays.
    minEnergy: 0,
  },

  tonality: {
    scales: [
      { name: "dorian", weight: 0.4 },
      { name: "minor", weight: 0.4 },
      { name: "mixolydian", weight: 0.2 },
    ],
    keyPrefs: [5, 7, 9, 0], // F, G, A, C
    harmony: {
      pool: [
        // Two-chord vamps at half the drum rate: four bars of drums per chord.
        { chords: ["i9", "bVImaj9"], barsPerChord: 2, weight: 2 },
        { chords: ["ii9", "v9"], barsPerChord: 2, weight: 1.5 },
        { chords: ["i7", "IVmaj7"], barsPerChord: 2, weight: 1.5 },
        { chords: ["i7", "bVIImaj7", "bVImaj7", "bVIImaj7"], barsPerChord: 2 },
        { chords: ["ii7", "V7", "Imaj7", "Imaj7"], barsPerChord: 2 },
      ],
      walkP: 0.05,
      walkLength: 4,
      walkBarsPerChord: 2,
    },
  },

  fx: {
    delay: {
      noteValue: "3/16",
      feedback: 0.35,
      wet: 0.22,
      feedbackLowpassHz: 3500,
      sends: ["pad"],
    },
    // Drum & bass does not pump. A couple of dB keeps the sub out of the kick's way.
    sidechain: { db: 2, releaseMs: 60, targets: ["sub"] },
    // A highpass rather than a lowpass, and it runs the other way: the breakdown is thin
    // and airy, the drop returns the bottom end. Taking the low end away and giving it
    // back is the loudest gesture the genre has.
    // Note the values descend: `lo` is the cutoff at energy zero. The highpass is high
    // in the breakdown and drops out of the way for the drop.
    energyFilter: { type: "highpass", lo: 260, hi: 20, resonance: 0.7 },
  },

  arrangement: {
    // Sections are long, and at 174 BPM 32 bars is only about 44 seconds.
    newPatternEvery: 32,
    newPatternP: 0.4,
    newNotesEvery: 64,
    newNotesP: 0.25,
    muteEvery: 16,
    // The genre's own shape: a drums-only DJ intro, a build, a 32-bar drop, and a
    // breakdown that removes the drums entirely rather than filtering them.
    sections: [
      { name: "intro", bars: 16, energy: 0.35 },
      { name: "build", bars: 16, energy: 0.4, energyTo: 0.85 },
      { name: "drop", bars: 32, energy: 0.9 },
      { name: "breakdown", bars: 32, energy: 0.12 },
      { name: "build", bars: 16, energy: 0.4, energyTo: 0.95 },
      { name: "drop", bars: 32, energy: 1 },
      { name: "outro", bars: 16, energy: 0.4, energyTo: 0.25 },
    ],
  },
};
