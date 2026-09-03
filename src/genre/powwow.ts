import type { GenreDef } from "./schema.ts";

/**
 * Powwow — Northern Plains drum and flute.
 *
 * The drum is the whole rhythm: one large drum played by a circle, every beat, the same
 * weight, with honour beats — a handful of louder strokes — dropped in at the leaders'
 * call. Nothing subdivides it. The flute plays a pentatonic line over it in a separate
 * register, with long notes and slides between them.
 *
 * Two things this preset refuses to do. It does not add a snare, hats or a bassline,
 * because there are none, and a kit under a powwow drum is the one thing everyone gets
 * wrong. And it does not pretend to the voices: the singing is the actual centre of the
 * music and a synth line is not it. The flute is what can honestly be done.
 */
export const powwow: GenreDef = {
  id: "powwow",
  name: "Powwow drum & flute",
  refs: [
    "Northern Cree — Red Skin Girl",
    "Black Lodge Singers",
    "R. Carlos Nakai — Canyon Trilogy",
    "Joanne Shenandoah — Matriarch",
  ],
  version: 3, // v3: the drum has a heartbeat, hard then soft
  // v2: the flute is held and blown rather than struck

  kit: "folk",

  clock: {
    bpm: { min: 88, max: 128, default: 104 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      // The heartbeat: a hard stroke answered by a soft one. Written as two lanes because
      // that is the only way to make the pair unequal, and the inequality is the whole
      // sound — an even pulse on every beat is a four-on-the-floor kick, which is what a
      // blind listener called this preset: minimal techno.
      name: "drum",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 8] },
      density: 0.62,
      vel: { base: 1, accent: 1, ghost: 0.85 },
      muteP: 0,
      minEnergy: 0,
    },
    {
      name: "drum soft",
      kitVoice: "kick",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 0.45, accent: 0.55, ghost: 0.3 },
      // Consistently a hair late, the way a second stroke of a pair falls.
      nudgeMs: 6,
      muteP: 0,
      minEnergy: 0,
    },
    {
      name: "honour beats",
      kitVoice: "kick",
      // Louder strokes on the beat, now and then. Inverted would put them between the
      // beats, which is wrong; a sparse probabilistic lane on the beats is right.
      gen: { type: "stepClassP" },
      density: 0.22,
      chaos: 0.3,
      accentAt: 0.5,
      vel: { base: 0.6, accent: 1, ghost: 0.4 },
      syncopation: 2.5,
      muteP: 0.3,
      minEnergy: 0.45,
    },
    {
      name: "rattle",
      // Shaken, not struck.
      kitVoice: "scrape",
      gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
      density: 0.5,
      vel: { base: 0.2, accent: 0.3, ghost: 0.1 },
      muteP: 0.5,
      minEnergy: 0.55,
    },
  ],

  lead: {
    name: "flute",
    // Long notes, wide spacing, stepwise, an arch per phrase.
    gen: { type: "stepClassP" },
    // The flute is the only melodic voice in the preset, so it cannot be as sparse as an
    // ornament: at 0.3 the generator produced an empty pattern, and since the pattern is
    // held for a whole epoch that left seed 65535 with eight bars of drum and nothing
    // else.
    density: 0.46,
    chaos: 0.15,
    register: [64, 84],
    leapiness: 0.5,
    contour: 2,
    chordPull: 1.5,
    synth: {
      // A cedar flute is almost a pure tone with a slow breath on the front and a wide
      // vibrato: nearly no harmonics, and nothing that moves except the pitch. Held,
      // because a flute does not decay while the player still has air.
      timbre: "reed",
      voices: 1,
      detune: 0,
      wave: "triangle",
      attack: 0.09,
      sustain: 0.45,
      decay: 0.18,
      cutoff: 2000,
      resonance: 0.7,
      vibrato: 22,
      vibratoHz: 4.6,
      // The flute carries the song. Under a drum this loud it was inaudible, and blind
      // listeners reported "no melodic instruments" twice.
      level: 1.8,
    },
    muteP: 0.2,
    minEnergy: 0.2,
  },

  tonality: {
    scales: [
      { name: "minorPentatonic", weight: 0.7 },
      { name: "minor", weight: 0.3 },
    ],
    keyPrefs: [4, 7, 9, 2],
    harmony: {
      pool: [{ chords: ["ipower"], barsPerChord: 16 }],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "1/4",
      feedback: 0.3,
      wet: 0.18,
      feedbackLowpassHz: 2500,
      sends: ["flute"],
    },
    sidechain: { db: 0, releaseMs: 100, targets: [] },
    energyFilter: { type: "lowpass", lo: 2400, hi: 12000, resonance: 0.5 },
    // Outdoors, or a large hall: the drum carries.
    reverb: { size: 0.85, decay: 3, damp: 0.55, wet: 0.3, preDelayMs: 35, sends: ["flute", "drum", "honour beats"] },
  },

  arrangement: {
    newPatternEvery: 32,
    newPatternP: 0.3,
    newNotesEvery: 64,
    newNotesP: 0.15,
    muteEvery: 16,
    sections: [
      { name: "lead-in", bars: 8, energy: 0.42 },
      { name: "song", bars: 32, energy: 0.5, energyTo: 0.7 },
      { name: "push", bars: 16, energy: 0.8, energyTo: 1 },
      { name: "song", bars: 32, energy: 0.6 },
    ],
    tempoSwing: 0.12,
  },
};
