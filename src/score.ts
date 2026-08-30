import { EPOCHS, epochAt, isMuted, type EpochSpec } from "./arrange/epoch.ts";
import { floorMod } from "./core/time.ts";
import { defaultVoice, realise } from "./pattern/gen.ts";
import { chooseNoteSet, defaultNoteVoice, realiseNotes } from "./pattern/notes.ts";
import type { GenreDef } from "./genre/schema.ts";

/**
 * The score: what is played, with no reference to audio at all.
 *
 * Keeping musical events separate from audio scheduling is what makes this testable
 * without an AudioContext, makes an offline render provably identical to live playback,
 * and makes it impossible for a timing decision to leak into a note choice.
 *
 * Every function here is pure in `(genre, seed, bar, lane state)`.
 */

export interface LaneEvent {
  readonly lane: number;
  readonly name: string;
  /** Index into the lane's own pattern, which may be shorter than a bar. */
  readonly patternStep: number;
  readonly velocity: number;
  readonly accent: boolean;
  /** Pitched lanes only. */
  readonly midi?: number;
  /** This note holds into the next step. */
  readonly slide?: boolean;
  /** This note glides in from the previous one. */
  readonly glide?: boolean;
}

/** Live state a lane carries that is not in the preset. */
export interface LaneState {
  readonly density: number;
  readonly userMuted: boolean;
}

export interface Lane {
  readonly index: number;
  readonly name: string;
  readonly len: number;
  readonly pitched: boolean;
}

/** The lanes a genre declares, in the order the engine assigns them. */
export function lanesOf(genre: GenreDef): Lane[] {
  const lanes: Lane[] = genre.drums.map((d, index) => ({
    index,
    name: d.name,
    len: d.len ?? genre.clock.stepsPerBar,
    pitched: false,
  }));
  if (genre.bass !== undefined) {
    lanes.push({
      index: lanes.length,
      name: genre.bass.name,
      len: genre.bass.len ?? genre.clock.stepsPerBar,
      pitched: true,
    });
  }
  return lanes;
}

export function defaultLaneStates(genre: GenreDef): LaneState[] {
  const states = genre.drums.map((d) => ({ density: d.density, userMuted: false }));
  if (genre.bass !== undefined) {
    states.push({ density: genre.bass.density, userMuted: false });
  }
  return states;
}

function specs(genre: GenreDef): { pattern: EpochSpec; notes: EpochSpec } {
  return {
    pattern: {
      every: genre.arrangement.newPatternEvery,
      p: genre.arrangement.newPatternP,
      salt: EPOCHS.pattern,
    },
    notes: {
      every: genre.arrangement.newNotesEvery,
      p: genre.arrangement.newNotesP,
      salt: EPOCHS.notes,
    },
  };
}

/** Whether a lane sounds at all in this bar. */
export function laneSilent(
  genre: GenreDef,
  laneIndex: number,
  seed: number,
  bar: number,
  state: LaneState,
): boolean {
  if (state.userMuted) return true;
  const def = genre.drums[laneIndex] ?? genre.bass;
  const muteP = def === undefined ? 0 : (def.muteP ?? 0);
  return isMuted(seed, bar, laneIndex, genre.arrangement.muteEvery, muteP);
}

/** One lane's events for one bar. */
export function scoreLane(
  genre: GenreDef,
  laneIndex: number,
  seed: number,
  bar: number,
  state: LaneState,
): LaneEvent[] {
  if (laneSilent(genre, laneIndex, seed, bar, state)) return [];
  const { pattern, notes } = specs(genre);
  const drum = genre.drums[laneIndex];

  if (drum !== undefined) {
    const len = drum.len ?? genre.clock.stepsPerBar;
    const voice = defaultVoice(drum.gen, {
      density: state.density,
      chaos: drum.chaos ?? 0,
      accentAt: drum.accentAt ?? 0.75,
      ...(drum.vel === undefined ? {} : { vel: drum.vel }),
      ...(drum.syncopation === undefined ? {} : { syncopation: drum.syncopation }),
    });
    // Pattern from the epoch so it repeats; chaos from the bar so it breathes.
    const epoch = epochAt(seed, bar, pattern);
    return realise(voice, len, seed, epoch, laneIndex, bar).map((hit) => ({
      lane: laneIndex,
      name: drum.name,
      patternStep: hit.step,
      velocity: hit.velocity,
      accent: hit.accent,
    }));
  }

  const bass = genre.bass;
  if (bass === undefined) return [];
  const len = bass.len ?? genre.clock.stepsPerBar;
  const noteSet = chooseNoteSet(
    bass.bags,
    bass.rootRange,
    seed,
    epochAt(seed, bar, notes),
    laneIndex,
  );
  const voice = defaultNoteVoice({
    gen: bass.gen,
    density: state.density,
    chaos: bass.chaos ?? 0,
    accentP: bass.accentP,
    slideP: bass.slideP,
  });
  const epoch = epochAt(seed, bar, pattern);
  return realiseNotes(voice, noteSet, len, seed, epoch, laneIndex).map((slot) => ({
    lane: laneIndex,
    name: bass.name,
    patternStep: slot.step,
    velocity: slot.velocity,
    accent: slot.accent,
    midi: slot.midi,
    slide: slot.slide,
    glide: slot.glide,
  }));
}

/** Every lane's events for one bar. */
export function scoreBar(
  genre: GenreDef,
  seed: number,
  bar: number,
  states: readonly LaneState[],
): LaneEvent[] {
  return lanesOf(genre).flatMap((lane) =>
    scoreLane(genre, lane.index, seed, bar, states[lane.index] ?? { density: 0, userMuted: true }),
  );
}

/** Which step of its own pattern a lane reads at a given position in the bar. */
export function patternIndexAt(
  genre: GenreDef,
  len: number,
  bar: number,
  stepInBar: number,
): number {
  return floorMod(bar * genre.clock.stepsPerBar + stepInBar, len);
}
