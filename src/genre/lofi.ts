import type { GenreDef } from "./schema.ts";

/**
 * Lo-fi hip hop, by way of boom bap.
 *
 * This preset exists to exercise the one microtiming control that the research says is
 * worth having. Every controlled study finds *random* microtiming reduces groove — beyond
 * about 25 ms it reduces it a lot, and the quantised version usually rates highest — so
 * `jitterMs` stays at zero here as everywhere else.
 *
 * What does work is `nudgeMs`: a **constant, signed** displacement that repeats
 * identically every bar. That is the Dilla configuration, and Peterson's measurements of
 * the records are specific about it — the hi-hat stays on the grid, the snare sits
 * consistently early, and a synth bass can anticipate by as much as a 32nd. It is not
 * looseness; it is a second grid, held exactly.
 *
 * Swing is Linn's 58%: past the 54% that merely "removes the stiffness", short of the 62%
 * that is "looser than a perfect triplet swing". Note 66% is not triplet swing — 66.67%
 * is — which is why the number here is a ratio and not a fraction of a beat.
 *
 * The tempo has no academic source; 78–92 is producer convention and is flagged as such.
 */
export const lofi: GenreDef = {
  id: "lofi",
  name: "Lo-fi hip hop",
  refs: [
    "J Dilla — Get Dis Money",
    "Nujabes — Feather",
    "Gang Starr — Mass Appeal",
    "Pete Rock & CL Smooth — T.R.O.Y.",
  ],
  version: 1,

  clock: {
    bpm: { min: 76, max: 92, default: 84 },
    stepsPerBar: 16,
    swing: 0.58,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      // Boom bap: the downbeat and the "and of 3", with a pickup before the backbeat.
      gen: { type: "mask", steps: [0, 3, 10] },
      density: 0.55,
      vel: { base: 0.95, accent: 1, ghost: 0.55 },
      swingDepth: 0,
      nudgeMs: 0, // the kick is on the grid
      muteP: 0.1,
    },
    {
      name: "snare",
      kitVoice: "snare",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 1, accent: 1, ghost: 0.6 },
      swingDepth: 0,
      // The Dilla move: consistently early, every bar, by the same amount. Peterson
      // measured the snare on "Keep It On (This Beat)" ahead of the grid throughout.
      nudgeMs: -14,
      muteP: 0.08,
    },
    {
      name: "ghost snare",
      kitVoice: "snare",
      gen: { type: "stepClassP", invert: true },
      density: 0.18,
      chaos: 0.15,
      vel: { base: 0.14, accent: 0.2, ghost: 0.07 },
      swingDepth: 1,
      nudgeMs: -14, // ghosts follow the backbeat's grid, not the kick's
      muteP: 0.35,
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "stepClassP" },
      density: 0.55,
      chaos: 0.2,
      accentAt: 0.78,
      vel: { base: 0.28, accent: 0.38, ghost: 0.12 },
      swingDepth: 1,
      nudgeMs: 0, // the reference grid everything else is heard against
      muteP: 0.25,
    },
    {
      name: "open hat",
      kitVoice: "openHat",
      gen: { type: "mask", steps: [6, 14] },
      density: 0.4,
      vel: { base: 0.3, accent: 0.4, ghost: 0.15 },
      swingDepth: 1,
      muteP: 0.5,
    },
  ],

  bass: {
    name: "bass",
    wave: "sawtooth",
    // Upright-ish: root, fifth, octave, with the flat seventh for movement.
    bags: [
      [0, 0, 0, 7],
      [0, 0, 12, 7, 10],
      [0, 0, 0, 3, 7],
      [0, 0, 5, 7, 10],
    ],
    rootRange: [33, 45],
    gen: { type: "stepClassP" },
    density: 0.4,
    chaos: 0.12,
    accentP: 0.2,
    slideP: 0.1,
    synth: { cutoff: 300, resonance: 3, envMod: 900, decay: 0.35 },
    swingDepth: 1,
    // The anticipation Peterson measured at around a 32nd. At 84 BPM a 32nd is 89 ms;
    // this is deliberately gentler, since the sub here is shorter than a Rhodes bass.
    nudgeMs: -35,
    muteP: 0.15,
  },

  chords: {
    name: "rhodes",
    gen: { type: "stepClassP" },
    density: 0.35,
    chaos: 0.15,
    register: [55, 75],
    synth: {
      voices: 2,
      detune: 6,
      wave: "triangle", // closer to an electric piano than a saw
      attack: 0.012,
      decay: 1.1,
      cutoff: 2600,
      resonance: 0.7,
      envMod: 700,
    },
    swingDepth: 1,
    nudgeMs: -8,
    muteP: 0.3,
  },

  tonality: {
    scales: [
      { name: "dorian", weight: 0.35 },
      { name: "minor", weight: 0.35 },
      { name: "mixolydian", weight: 0.2 },
      { name: "lydian", weight: 0.1 },
    ],
    harmony: {
      pool: [
        { chords: ["ii7", "V7", "Imaj7", "Imaj7"], barsPerChord: 1, weight: 2 },
        { chords: ["Imaj9", "vi9"], barsPerChord: 2, weight: 2 },
        // The borrowed minor iv: the signature lo-fi turn, and the one chord that makes
        // a major loop sound wistful rather than cheerful.
        { chords: ["Imaj7", "iv7"], barsPerChord: 2, weight: 1.5 },
        { chords: ["iii7", "VI7", "ii7", "V7"], barsPerChord: 1 },
        // Backdoor ii-V.
        { chords: ["iv9", "bVII9", "Imaj7", "Imaj7"], barsPerChord: 1 },
      ],
      walkP: 0.1,
      walkLength: 4,
      walkBarsPerChord: 1,
    },
  },

  fx: {
    delay: {
      noteValue: "1/8",
      feedback: 0.25,
      wet: 0.12,
      feedbackLowpassHz: 2200,
      sends: ["rhodes"],
    },
    sidechain: { db: 0, releaseMs: 120, targets: [] }, // no pumping
    // A gentle lid, and no lower than 2 kHz: the genre is already dark, and closing it
    // further just sounds broken.
    energyFilter: { type: "lowpass", lo: 2200, hi: 9000, resonance: 0.6 },
    texture: {
      vinylDb: -30,
      wowHz: 0.45,
      wowCents: 12,
      bitDepth: 11,
    },
  },

  arrangement: {
    // Short loops, changing rarely. The genre is a loop, not an arrangement.
    newPatternEvery: 32,
    newPatternP: 0.35,
    newNotesEvery: 32,
    newNotesP: 0.3,
    muteEvery: 8,
    // Barely a form. The genre is a loop that thins out and comes back, not a track that
    // builds — so the range is narrow and there is no drop anywhere in it.
    sections: [
      { name: "loop", bars: 16, energy: 0.5 },
      { name: "open", bars: 16, energy: 0.62 },
      { name: "strip", bars: 8, energy: 0.28 },
      { name: "loop", bars: 16, energy: 0.55 },
    ],
  },
};
