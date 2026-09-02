import { densityAt, energyAt, laneIsIn } from "./arrange/energy.ts";
import { EPOCHS, epochAt, isMuted, type EpochSpec } from "./arrange/epoch.ts";
import { fillBonus } from "./arrange/fill.ts";
import { floorMod } from "./core/time.ts";
import { voiceLead } from "./harmony/chords.ts";
import { chordAt, chooseKey, chooseProgression, type Progression } from "./harmony/progression.ts";
import { defaultVoice, realise } from "./pattern/gen.ts";
import { metricFromGrouping } from "./pattern/metric.ts";
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
  /** Monophonic pitched lanes only. */
  readonly midi?: number;
  /** Chord lanes only: the whole voicing. */
  readonly notes?: readonly number[];
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

export type LaneKind = "drum" | "bass" | "chords";

export interface Lane {
  readonly index: number;
  readonly name: string;
  readonly len: number;
  readonly kind: LaneKind;
}

/**
 * The lanes a genre declares, in the order the engine assigns them: drums, then bass,
 * then chords. The order is part of the contract — a lane's index is a coordinate that
 * feeds the hash, so reordering would change every seed's music.
 */
export function lanesOf(genre: GenreDef): Lane[] {
  const lanes: Lane[] = genre.drums.map((d, index) => ({
    index,
    name: d.name,
    len: d.len ?? genre.clock.stepsPerBar,
    kind: "drum" as const,
  }));
  if (genre.bass !== undefined) {
    lanes.push({
      index: lanes.length,
      name: genre.bass.name,
      len: genre.bass.len ?? genre.clock.stepsPerBar,
      kind: "bass",
    });
  }
  if (genre.chords !== undefined) {
    lanes.push({
      index: lanes.length,
      name: genre.chords.name,
      len: genre.chords.len ?? genre.clock.stepsPerBar,
      kind: "chords",
    });
  }
  return lanes;
}

export function defaultLaneStates(genre: GenreDef): LaneState[] {
  const states = genre.drums.map((d) => ({ density: d.density, userMuted: false }));
  if (genre.bass !== undefined) {
    states.push({ density: genre.bass.density, userMuted: false });
  }
  if (genre.chords !== undefined) {
    states.push({ density: genre.chords.density, userMuted: false });
  }
  return states;
}

interface LaneEnergy {
  readonly muteP?: number;
  readonly minEnergy?: number;
  readonly maxEnergy?: number;
  readonly densitySwing?: number;
}

function defOf(genre: GenreDef, laneIndex: number): LaneEnergy | undefined {
  const lane = lanesOf(genre)[laneIndex];
  if (lane === undefined) return undefined;
  if (lane.kind === "drum") return genre.drums[laneIndex];
  return lane.kind === "bass" ? genre.bass : genre.chords;
}

/**
 * The density a lane actually plays at, once the energy curve has had its say.
 *
 * The user's slider stays the base value; energy moves it around that. Otherwise moving a
 * slider during a build would fight the arrangement instead of steering it.
 */
export function effectiveDensity(
  genre: GenreDef,
  laneIndex: number,
  bar: number,
  base: number,
): number {
  const def = defOf(genre, laneIndex);
  return densityAt(base, energyAt(genre, bar), def?.densitySwing ?? 0);
}

/**
 * A pitch class placed in a register, nearest its centre.
 *
 * Nearest-to-centre rather than lowest-that-fits: a progression whose roots straddle the
 * bottom of the range would otherwise leap an octave between adjacent chords.
 */
export function rootInRange(pitchClass: number, lo: number, hi: number): number {
  const pc = ((pitchClass % 12) + 12) % 12;
  const centre = (lo + hi) / 2;
  let best = pc;
  let bestDistance = Infinity;
  for (let n = pc; n <= hi + 12; n += 12) {
    if (n < lo) continue;
    const d = Math.abs(n - centre);
    if (d < bestDistance) {
      bestDistance = d;
      best = n;
    }
  }
  return best;
}

/** Steps per beat, stated by the genre or assumed to be sixteenths in 4/4. */
export function stepsPerBeat(genre: GenreDef): number {
  return genre.clock.stepsPerBeat ?? genre.clock.stepsPerBar / 4;
}

/**
 * The metric curve for a lane, or null to use the tabulated hierarchies.
 *
 * Only for lanes the length of a bar: a polymetric lane of another length has its own
 * internal metre and the bar's grouping says nothing about it.
 */
function withMetric(genre: GenreDef, len: number): { metric?: readonly number[] } {
  const grouping = genre.clock.grouping;
  if (grouping === undefined || len !== genre.clock.stepsPerBar) return {};
  return { metric: metricFromGrouping(grouping, len) };
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
  const def = defOf(genre, laneIndex);
  // The energy window decides whether a lane belongs in this section at all; the mute
  // roll is the variation *within* a section. Two different jobs, and a lane silenced by
  // the curve should not also be rolling dice.
  if (!laneIsIn(energyAt(genre, bar), def)) return true;
  return isMuted(seed, bar, laneIndex, genre.arrangement.muteEvery, def?.muteP ?? 0);
}

/**
 * The harmony in force at a bar: key, scale and progression, all on the note epoch.
 *
 * Returned whole rather than per-lane so that chords and any future melody read the same
 * harmony from the same coordinates, rather than each deriving its own and drifting.
 */
export function harmonyAt(
  genre: GenreDef,
  seed: number,
  bar: number,
): { key: number; progression: Progression } | null {
  const tonality = genre.tonality;
  if (tonality === undefined) return null;
  const epoch = epochAt(seed, bar, specs(genre).notes);
  // Lane index 0 deliberately: the harmony belongs to the piece, not to a voice.
  return {
    key: chooseKey(tonality.keyPrefs, seed, epoch, 0),
    progression: chooseProgression(tonality.harmony, seed, epoch, 0),
  };
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
      density: effectiveDensity(genre, laneIndex, bar, state.density),
      chaos: drum.chaos ?? 0,
      accentAt: drum.accentAt ?? 0.75,
      ...(drum.vel === undefined ? {} : { vel: drum.vel }),
      ...(drum.syncopation === undefined ? {} : { syncopation: drum.syncopation }),
      ...withMetric(genre, len),
    });
    // Pattern from the epoch so it repeats; chaos from the bar so it breathes; the fill
    // bonus is per step, so it thickens the end of the bar without touching the rest.
    const epoch = epochAt(seed, bar, pattern);
    const bonus = fillBonus(drum.fill, len, bar) ?? undefined;
    return realise(voice, len, seed, epoch, laneIndex, bar, bonus).map((hit) => ({
      lane: laneIndex,
      name: drum.name,
      patternStep: hit.step,
      velocity: hit.velocity,
      accent: hit.accent,
    }));
  }

  const lane = lanesOf(genre)[laneIndex];
  if (lane?.kind === "chords") return scoreChords(genre, laneIndex, seed, bar, state);

  const bass = genre.bass;
  if (bass === undefined) return [];
  const len = bass.len ?? genre.clock.stepsPerBar;
  const chosen = chooseNoteSet(
    bass.bags,
    bass.rootRange,
    seed,
    epochAt(seed, bar, notes),
    laneIndex,
  );
  // With a tonality, the bass root is the current chord's root — the bag supplies the
  // intervals above it, the harmony supplies where it sits. Without one (acid, techno)
  // the bass is the whole tonal content and keeps its own root.
  const harmony = harmonyAt(genre, seed, bar);
  const noteSet =
    harmony === null
      ? chosen
      : {
          bag: chosen.bag,
          root: rootInRange(
            harmony.key + chordAt(harmony.progression, bar).root,
            bass.rootRange[0],
            bass.rootRange[1],
          ),
        };
  const voice = defaultNoteVoice({
    gen: bass.gen,
    density: effectiveDensity(genre, laneIndex, bar, state.density),
    chaos: bass.chaos ?? 0,
    accentP: bass.accentP,
    slideP: bass.slideP,
    ...withMetric(genre, len),
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

/**
 * One bar of chords.
 *
 * The voicing is led from the previous bar's chord rather than from nothing, and that
 * previous voicing is recomputed rather than remembered — generation stays pure, and
 * seeking to bar 500 gives the voicing it would have had. The chain is only as deep as
 * the progression is long, since a full cycle brings it back to the same chord.
 */
function scoreChords(
  genre: GenreDef,
  laneIndex: number,
  seed: number,
  bar: number,
  state: LaneState,
): LaneEvent[] {
  const def = genre.chords;
  const harmony = harmonyAt(genre, seed, bar);
  if (def === undefined || harmony === null) return [];

  const len = def.len ?? genre.clock.stepsPerBar;
  const voice = defaultVoice(def.gen, {
    density: effectiveDensity(genre, laneIndex, bar, state.density),
    chaos: def.chaos ?? 0,
    ...withMetric(genre, len),
  });
  const epoch = epochAt(seed, bar, specs(genre).pattern);
  const hits = realise(voice, len, seed, epoch, laneIndex, bar);
  if (hits.length === 0) return [];

  const notes = voicingAt(genre, seed, bar, harmony, def.register);
  return hits.map((hit) => ({
    lane: laneIndex,
    name: def.name,
    patternStep: hit.step,
    velocity: hit.velocity,
    accent: hit.accent,
    notes,
  }));
}

/** The voicing for a bar, led from the bars before it inside one progression cycle. */
function voicingAt(
  genre: GenreDef,
  seed: number,
  bar: number,
  harmony: { key: number; progression: Progression },
  register: readonly [number, number],
): number[] {
  const cycle = harmony.progression.chords.length * harmony.progression.barsPerChord;
  const start = bar - (((bar % cycle) + cycle) % cycle);
  let previous: number[] | null = null;
  let voicing: number[] = [];
  for (let b = start; b <= bar; b += harmony.progression.barsPerChord) {
    voicing = voiceLead(
      chordAt(harmony.progression, b),
      harmony.key,
      previous,
      register[0],
      register[1],
    );
    previous = voicing;
  }
  return voicing;
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
