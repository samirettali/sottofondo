import { choose, rngFor, valueAt } from "../core/rng.ts";
import { realise, type VoicePattern } from "./gen.ts";

/**
 * Note patterns for the 303-style voice.
 *
 * The 303's sequencer has five parallel lanes — pitch, rest, accent, slide and extended
 * gate — and that shape is worth keeping, because slide and extend both act on the gate
 * rather than on the pitch. The reference implementation carries only pitch, accent and
 * glide; adding extend gives legato runs for nothing.
 */

export interface NoteSlot {
  readonly step: number;
  readonly midi: number;
  readonly accent: boolean;
  /** This note slides *into the next one*: the gate stays open across the boundary. */
  readonly slide: boolean;
  /** True when the previous slot slid into this one, so this note glides in. */
  readonly glide: boolean;
  readonly velocity: number;
}

/**
 * A pitch bag: intervals in semitones above a root, with **repetition as weighting**.
 *
 * There is no scale object and no probability table. `[0,0,0,12,13,16]` gives the root a
 * one-in-two chance because it appears three times out of six. Octave jumps are entries
 * in the bag rather than a separate decision, which is why acid lines leap without ever
 * sounding like an arpeggiator sweeping ranges.
 */
export type PitchBag = readonly number[];

export interface NoteSet {
  readonly root: number;
  readonly bag: PitchBag;
}

/** Pick a root and a bag for a stretch of bars. Changes rarely — see the arrangement. */
export function chooseNoteSet(
  bags: readonly PitchBag[],
  rootRange: readonly [number, number],
  seed: number,
  epoch: number,
  voiceIndex: number,
): NoteSet {
  const rng = rngFor(seed, epoch, voiceIndex, SALT.noteSet);
  const [lo, hi] = rootRange;
  const root = lo + Math.floor(rng() * (hi - lo + 1));
  return { root, bag: choose(rng, bags) };
}

const SALT = { pitch: 10, accent: 11, slide: 12, noteSet: 13 } as const;

export interface NoteVoice extends VoicePattern {
  readonly accentP: number;
  readonly slideP: number;
}

export function defaultNoteVoice(over: Partial<NoteVoice> = {}): NoteVoice {
  return {
    gen: { type: "stepClassP" },
    density: 0.5,
    chaos: 0,
    accentAt: 2, // accents come from accentP here, not from the strength threshold
    vel: { base: 0.8, accent: 1, ghost: 0.4 },
    accentP: 0.3,
    slideP: 0.1,
    ...over,
  };
}

/**
 * One bar of notes.
 *
 * Gating reuses the drum generator, so density, chaos and the metric curve behave
 * identically for a bassline and a hi-hat. Only pitch, accent and slide are extra.
 */
export function realiseNotes(
  voice: NoteVoice,
  noteSet: NoteSet,
  len: number,
  seed: number,
  bar: number,
  voiceIndex: number,
): NoteSlot[] {
  const gated = realise(voice, len, seed, bar, voiceIndex);
  const pitchRng = rngFor(seed, bar, voiceIndex, SALT.pitch);

  const slots = gated.map((hit) => {
    const midi = noteSet.root + choose(pitchRng, noteSet.bag);
    const accent = valueAt(seed, bar, voiceIndex, SALT.accent + hit.step * 31) < voice.accentP;
    const slide = valueAt(seed, bar, voiceIndex, SALT.slide + hit.step * 37) < voice.slideP;
    return {
      step: hit.step,
      midi,
      accent,
      slide,
      glide: false,
      velocity: accent ? voice.vel.accent : hit.velocity,
    };
  });

  // A slide marks the *following* note as glided. The 303's slide signal goes high a
  // sixteenth after the slid note starts, which is why the glide is heard on the note
  // after the one with the light on — not, as the folklore has it, because the sequencer
  // looks ahead.
  return slots.map((slot, i) => {
    const previous = slots[i - 1];
    const adjacent = previous !== undefined && slot.step === previous.step + 1;
    return adjacent && previous.slide ? { ...slot, glide: true } : slot;
  });
}
