import type { GenreDef } from "./schema.ts";

/**
 * Acid techno — the baseline.
 *
 * Ported from vitling's Endless Acid Banger (CC-BY 4.0) as closely as this engine's
 * shape allows, so there is a known-good reference to A/B every later genre against. The
 * numbers below are its numbers, not invented ones: the eight interval bags verbatim,
 * accent 0.3, slide 0.1, cutoff 30–700 Hz around 400, resonance 15, env mod 4000 cents,
 * decay 0.5 s, dotted-eighth delay, and the 64/16/8-bar autopilot cadence.
 *
 * Two deliberate departures. Its gate probabilities (0.6/0.5/0.3/0.1 by metric class)
 * become a density against the metric curve, because that generalises and they do not.
 * And its drums are 909 samples; these are synthesised.
 *
 * There is no harmony here, and that is not an omission. Acid and techno reject
 * functional harmony — Butler's phrase is a "total lack of cadences" — and a chord
 * progression under an acid line destroys it. The `bass` voice is the whole tonal
 * content.
 */
export const acid: GenreDef = {
  id: "acid",
  name: "Acid techno",
  refs: [
    "Phuture — Acid Tracks",
    "Hardfloor — Acperience 1",
    "Josh Wink — Higher State of Consciousness",
    "Emmanuel Top — Turkish Bazar",
  ],
  version: 1,

  clock: {
    bpm: { min: 130, max: 145, default: 138 },
    stepsPerBar: 16,
    swing: 0.5, // straight. Acid does not shuffle.
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 4, 8, 12] },
      density: 0.6,
      vel: { base: 0.95, accent: 1, ghost: 0.6 },
      muteP: 0.2, // the kick drops out far less often than anything else
    },
    {
      name: "clap",
      kitVoice: "clap",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      muteP: 0.5,
    },
    {
      name: "open hat",
      kitVoice: "openHat",
      // The offbeat open hat is the genre's signature and is not negotiable, so it is a
      // mask rather than anything probabilistic.
      gen: { type: "mask", steps: [2, 6, 10, 14] },
      density: 0.5,
      vel: { base: 0.4, accent: 0.55, ghost: 0.2 },
      muteP: 0.5,
    },
    {
      name: "closed hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      density: 0.55,
      chaos: 0.25,
      accentAt: 0.8,
      vel: { base: 0.25, accent: 0.4, ghost: 0.1 },
      muteP: 0.5,
      densitySwing: 0.2,
      // No fill. The reference has none, and this preset has no sparse decorative lane
      // to put one on — at peak energy the hat is near-saturated, so the extra density
      // would have nowhere to go even if it were declared.
    },
  ],

  bass: {
    name: "303",
    wave: "sawtooth",
    // Verbatim from the reference implementation. Repetition is the weighting: bag 7
    // gives the root four chances in eleven and spreads the rest over the octave above,
    // which is the classic acid shape of a hammered root with occasional reaches upward.
    // The bags are modal rather than diatonic — b2, b7, minor pentatonic stacks.
    bags: [
      [0, 0, 12, 24, 27],
      [0, 0, 0, 12, 10, 19, 26, 27],
      [0, 1, 7, 10, 12, 13],
      [0], // a single-note drone line
      [0, 0, 0, 12],
      [0, 0, 12, 14, 15, 19],
      [0, 0, 0, 0, 12, 13, 16, 19, 22, 24, 25],
      [0, 0, 0, 7, 12, 15, 17, 20, 24],
    ],
    rootRange: [28, 42], // E1 to F#2
    gen: { type: "stepClassP" },
    // At density 0.5 a step fires with exactly its metric weight, which sums to 5.6
    // onsets per bar — the reference's gate probabilities work out at 5.8.
    density: 0.5,
    chaos: 0.1,
    accentP: 0.3,
    slideP: 0.1,
    synth: { cutoff: 400, resonance: 15, envMod: 4000, decay: 0.5 },
    muteP: 0,
    // The 303's cutoff is the whole show, so the curve moves it more than a full octave
    // either way. This is the closest thing here to the reference's wandering knobs.
    filterSwing: 1.2,
  },

  fx: {
    delay: {
      noteValue: "3/16", // dotted eighth, the acid and dub default
      feedback: 0.35,
      wet: 0.25,
      sends: ["303"], // drums stay dry, as in the reference
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] }, // acid does not pump
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.5,
    newNotesEvery: 64,
    newNotesP: 0.2,
    muteEvery: 8,
    // Gentler than the others on purpose. The reference implementation has no form at
    // all — it re-rolls mutes every eight bars and that is the whole arrangement — and
    // that suits acid, where the interest is in the filter rather than the structure.
    // This adds a shallow arc without turning it into a dance-floor build.
    sections: [
      { name: "intro", bars: 16, energy: 0.4 },
      { name: "rise", bars: 32, energy: 0.55, energyTo: 0.85 },
      { name: "peak", bars: 32, energy: 0.9 },
      { name: "strip", bars: 16, energy: 0.45 },
    ],
  },
};
