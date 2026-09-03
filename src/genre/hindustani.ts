import type { GenreDef } from "./schema.ts";

/**
 * Hindustani — a raga over teental.
 *
 * Teental is sixteen matras in four groups of four, which is the one Indian tala that a
 * sixteen-step grid says without translation. The theka — dha dhin dhin dha, dha dhin
 * dhin dha, dha tin tin ta, ta dhin dhin dha — is two voices of one drum: the bayan's
 * bass (dha, dhin) and the dayan's ring (tin, ta). The third group is the khali, the
 * open one, where the bass drops out; that is the thing to hear, and it is a mask.
 *
 * There is no harmony at all in the Western sense: a tanpura drone on the tonic and the
 * fifth, and a melody that lives entirely in the raga's scale. The chord lane is the
 * drone, and the progression is one chord for the whole piece by design.
 */
export const hindustani: GenreDef = {
  id: "hindustani",
  name: "Raga in teental",
  refs: [
    "Ravi Shankar — Raga Jog",
    "Zakir Hussain — Making Music",
    "Nikhil Banerjee — Raga Bhairavi",
    "Hariprasad Chaurasia — Raga Yaman",
  ],
  version: 2, // v2: sitar and tanpura are plucked strings, and the alap is shorter

  kit: "folk",

  clock: {
    bpm: { min: 76, max: 132, default: 92 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    grouping: [4, 4, 4, 4],
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "bayan",
      // The heel slides on the head after the strike and the pitch bends up. That gliss
      // is the tabla; a kick drum in its place is a hip-hop record.
      kitVoice: "bend",
      // dha and dhin: every matra except the khali group.
      gen: { type: "mask", steps: [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15] },
      density: 0.55,
      // A tabla sits under the melody, not on top of it: the bayan alone was twelve
      // decibels louder than the sitar and the tanpura together.
      vel: { base: 0.42, accent: 0.62, ghost: 0.24 },
      accentAt: 0.9,
      muteP: 0.05,
      minEnergy: 0.15,
    },
    {
      name: "dayan",
      kitVoice: "slap",
      // The ring: on every matra, loudest on sam, and alone through the khali.
      gen: { type: "mask", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
      density: 0.55,
      vel: { base: 0.35, accent: 0.5, ghost: 0.2 },
      muteP: 0.05,
      minEnergy: 0,
    },
    {
      name: "tihai",
      kitVoice: "rim",
      // The cadential figure at the phrase end, three times over — approximated by a
      // fill that crowds the last beat.
      gen: { type: "stepClassP", invert: true },
      density: 0.1,
      chaos: 0.1,
      vel: { base: 0.3, accent: 0.45, ghost: 0.15 },
      muteP: 0.4,
      minEnergy: 0.5,
      fill: { amount: 0.5, span: 0.25 },
    },
  ],

  chords: {
    name: "tanpura",
    // Sa and Pa, re-struck every bar and left ringing: the drone never stops.
    gen: { type: "mask", steps: [0, 8] },
    density: 0.6,
    register: [48, 67],
    synth: {
      // A tanpura is plucked as well, and the long ringing tail is the whole drone —
      // four strings sounded slowly, never damped.
      timbre: "pluck",
      cutoff: 2600,
      level: 1.3,
      pluck: { damp: 0.28, decay: 6, colour: 0.55 },
    },
    muteP: 0,
    minEnergy: 0,
  },

  lead: {
    name: "sitar",
    // Stepwise, ornamented, and nearly continuous once the piece opens up.
    gen: { type: "stepClassP" },
    density: 0.5,
    chaos: 0.15,
    register: [60, 84],
    leapiness: 0.35,
    contour: 1.4,
    chordPull: 1,
    synth: {
      // The jawari — the sloping bridge that makes a sitar buzz — is a long, bright
      // string with very little damping. Karplus-Strong gets there; a filtered saw
      // never did.
      timbre: "pluck",
      cutoff: 4200,
      level: 1.6,
      pluck: { damp: 0.34, decay: 2.6, colour: 0.85 },
    },
    muteP: 0.2,
    minEnergy: 0.25,
    densitySwing: 0.3,
  },

  tonality: {
    scales: [
      { name: "bhairav", weight: 0.3 },
      { name: "kirwani", weight: 0.25 },
      { name: "dorian", weight: 0.2 }, // Kafi
      { name: "lydian", weight: 0.15 }, // Yaman
      { name: "minor", weight: 0.1 }, // Asavari
    ],
    keyPrefs: [0, 1, 2, 4], // C, C#, D, E — sitar tonics
    harmony: {
      // One chord, forever. The scale carries everything.
      pool: [{ chords: ["Ipower"], barsPerChord: 16 }],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/4",
      feedback: 0.2,
      wet: 0.1,
      feedbackLowpassHz: 3000,
      sends: ["sitar"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 1800, hi: 14000, resonance: 0.5 },
    reverb: { size: 0.65, decay: 2.4, damp: 0.5, wet: 0.24, preDelayMs: 20, sends: ["sitar", "tanpura", "dayan"] },
  },

  arrangement: {
    newPatternEvery: 32,
    newPatternP: 0.3,
    newNotesEvery: 128,
    newNotesP: 0.1,
    muteEvery: 16,
    // Alap into gat: the drone alone, the melody enters, the tabla enters, the tempo
    // lifts through the drut.
    sections: [
      { name: "alap", bars: 8, energy: 0.3, energyTo: 0.45 },
      { name: "gat", bars: 32, energy: 0.4, energyTo: 0.6 },
      { name: "drut", bars: 32, energy: 0.7, energyTo: 1 },
      { name: "tihai", bars: 8, energy: 1 },
    ],
    tempoSwing: 0.25,
  },
};
