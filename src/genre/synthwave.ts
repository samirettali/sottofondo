import type { GenreDef } from "./schema.ts";

/**
 * Synthwave, by way of italo disco.
 *
 * Three things make it: the Moroder pulse — a bass in continuous eighths alternating root
 * and octave, staccato, so the gaps are the groove; an arpeggio that is really the chord
 * played one note at a time; and a snare with a reverb that stops dead. The third is
 * approximated here with a big room and a very short decay, which reads as gated without
 * an actual gate. A true gate wants an envelope on the send, which is not built.
 *
 * The harmony is where the eighties live: minor, with the raised leading tone on the
 * dominant, and the Andalusian descent.
 */
export const synthwave: GenreDef = {
  id: "synthwave",
  name: "Synthwave",
  refs: [
    "Kavinsky — Nightcall",
    "Giorgio Moroder / Donna Summer — I Feel Love",
    "Ryan Paris — Dolce Vita",
    "Com Truise — Brokendate",
  ],
  version: 3, // v3: the pulse actually pulses
  // v2: a louder opening

  kit: "808",

  clock: {
    bpm: { min: 100, max: 124, default: 112 },
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    swingSubdiv: 16,
  },

  drums: [
    {
      name: "kick",
      kitVoice: "kick",
      gen: { type: "mask", steps: [0, 8] },
      density: 0.6,
      vel: { base: 0.95, accent: 1, ghost: 0.6 },
      muteP: 0.1,
      minEnergy: 0.25,
    },
    {
      name: "snare",
      kitVoice: "snare",
      gen: { type: "mask", steps: [4, 12] },
      density: 0.6,
      vel: { base: 1, accent: 1, ghost: 0.6 },
      muteP: 0.15,
      minEnergy: 0.3,
    },
    {
      name: "hat",
      kitVoice: "closedHat",
      gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
      density: 0.6,
      vel: { base: 0.3, accent: 0.4, ghost: 0.15 },
      muteP: 0.3,
      minEnergy: 0.4,
    },
    {
      name: "open hat",
      kitVoice: "openHat",
      gen: { type: "mask", steps: [14] },
      density: 0.55,
      vel: { base: 0.35, accent: 0.45, ghost: 0.2 },
      muteP: 0.5,
      minEnergy: 0.55,
    },
    {
      name: "tom",
      kitVoice: "tom",
      gen: { type: "stepClassP", invert: true },
      density: 0.12,
      chaos: 0.1,
      vel: { base: 0.45, accent: 0.6, ghost: 0.25 },
      muteP: 0.5,
      minEnergy: 0.6,
      fill: { amount: 0.5, span: 0.25 },
    },
  ],

  bass: {
    name: "pulse",
    wave: "sawtooth",
    // Root and octave, cycling. The bag is weighted so the octave comes up often.
    bags: [
      [0, 12, 0, 12],
      [0, 12, 0, 7],
      [0, 0, 12, 12, 7],
    ],
    rootRange: [31, 43],
    // Every eighth, always: the pulse is the point, and the density has to say so. At
    // 0.6 the generator dropped enough of them to syncopate the line, and a syncopated
    // bass over a backbeat is funk — which is what three blind verdicts on this preset
    // said. The gaps in the groove come from the note's length, not from missing notes.
    gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
    density: 0.95,
    chaos: 0.05,
    accentP: 0.2,
    slideP: 0.03,
    // Round, not plucked. Moroder's pulse is a Moog: a fat filtered saw with a moderate
    // envelope, and the gaps in the groove come from the note length. At resonance 5 with
    // a twelfth-of-a-second decay it was a thin bright blip on every eighth, which is an
    // NES triangle channel — blind, this preset lost to the chiptune one when the
    // question was which of the two was chiptune.
    synth: { cutoff: 380, resonance: 2, envMod: 900, decay: 0.19 },
    muteP: 0.1,
    minEnergy: 0.2,
    filterSwing: 0.8,
  },

  chords: {
    name: "pad",
    gen: { type: "mask", steps: [0] },
    density: 0.6,
    register: [55, 79],
    synth: {
      voices: 3,
      detune: 18,
      wave: "sawtooth",
      attack: 0.4,
      decay: 3.2,
      cutoff: 1800,
      resonance: 0.8,
      envMod: 900,
    },
    muteP: 0.25,
    minEnergy: 0.1,
    filterSwing: 0.8,
  },

  lead: {
    name: "arp",
    // The chord, one note at a time: chord pull turned up hard, no arch, and leaps
    // welcome so it climbs and falls through the voicing.
    gen: { type: "mask", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
    density: 0.6,
    chaos: 0.05,
    // Down an octave from where it was, which was note-for-note the register the chiptune
    // preset puts its pulse channel in: same octave, same speed, and the two presets were
    // being mistaken for each other in both directions.
    register: [55, 79],
    leapiness: 1.6,
    contour: 0.2,
    chordPull: 4,
    synth: {
      // Three detuned saws, not two squares. A square-wave arpeggio *is* the chiptune
      // sound — asked which of the two presets was 8-bit video game music, a blind
      // listener picked this one over the actual chiptune preset. Synthwave's arp is a
      // wide analogue polysynth; the width is the era.
      voices: 3,
      detune: 16,
      wave: "sawtooth",
      // A chip lead is a bare staccato blip; an analogue arpeggio rings on into the next
      // note and smears into the pad behind it.
      attack: 0.006,
      decay: 0.34,
      cutoff: 2400,
      resonance: 1.2,
      envMod: 900,
      level: 1.15,
    },
    muteP: 0.3,
    minEnergy: 0.45,
  },

  tonality: {
    scales: [
      { name: "minor", weight: 0.5 },
      { name: "harmonicMinor", weight: 0.4 },
      { name: "dorian", weight: 0.1 },
    ],
    keyPrefs: [9, 2, 4], // A, D, E minor
    harmony: {
      pool: [
        { chords: ["i", "bVI", "bIII", "bVII"], barsPerChord: 1, weight: 2 },
        // The Andalusian descent, with the major V from harmonic minor.
        { chords: ["i", "bVII", "bVI", "V"], barsPerChord: 1, weight: 2 },
        { chords: ["i", "iv", "bVI", "V"], barsPerChord: 1 },
        { chords: ["bVI", "bVII", "i", "i"], barsPerChord: 1 },
        { chords: ["i", "bIII", "bVII", "bVI"], barsPerChord: 1 },
      ],
      walkP: 0,
    },
  },

  fx: {
    delay: {
      noteValue: "3/16",
      feedback: 0.35,
      wet: 0.2,
      feedbackLowpassHz: 5000,
      sends: ["arp"],
    },
    sidechain: { db: 3, releaseMs: 90, targets: ["pad", "pulse"] },
    energyFilter: { type: "lowpass", lo: 1200, hi: 18000, resonance: 0.8 },
    // Big and short: the gated-reverb snare, without the gate.
    reverb: { size: 0.9, decay: 0.55, damp: 0.3, wet: 0.35, preDelayMs: 8, sends: ["snare", "pad", "arp"] },
  },

  arrangement: {
    newPatternEvery: 16,
    newPatternP: 0.35,
    newNotesEvery: 32,
    newNotesP: 0.3,
    muteEvery: 8,
    sections: [
      { name: "intro", bars: 8, energy: 0.42 },
      { name: "verse", bars: 16, energy: 0.5 },
      { name: "chorus", bars: 16, energy: 0.85 },
      { name: "verse", bars: 16, energy: 0.55 },
      { name: "chorus", bars: 16, energy: 0.95 },
      { name: "outro", bars: 8, energy: 0.4, energyTo: 0.2 },
    ],
  },
};
