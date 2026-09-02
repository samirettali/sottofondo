import type { KitStyleName } from "../audio/drums.ts";
import type { EnergyFilterOptions, NoteValue, TextureOptions } from "../audio/fx.ts";
import type { PolyParams } from "../audio/poly.ts";
import type { ReverbOptions } from "../audio/reverb.ts";
import type { ThreeOhParams } from "../audio/threeoh.ts";
import type { SectionDef } from "../arrange/energy.ts";
import type { FillDef } from "../arrange/fill.ts";
import type { HarmonyDef } from "../harmony/progression.ts";
import type { ScaleName } from "../harmony/scales.ts";
import type { PatternGen } from "../pattern/gen.ts";
import type { PitchBag } from "../pattern/notes.ts";

/**
 * A genre is data.
 *
 * The rule that keeps it that way: a preset selects a strategy from an enum declared
 * here, and sets numbers. It never introduces routing. The moment a preset needs a
 * different graph rather than different values, that graph gets pre-built and named, and
 * the preset picks it by tag. Gibber is the counterexample worth knowing — its presets
 * stopped being data the day one needed to build an effects chain.
 *
 * The test for this schema being finished is that a twelfth genre costs a file and no
 * code. It is not finished yet: the fields here cover what the engine can actually play,
 * and grow as it learns to play more. A schema written ahead of the engine is fiction.
 */

/** Names the kit exposes. A preset addresses voices by name, never by index. */
export type KitVoiceName =
  | "kick"
  | "snare"
  | "clap"
  | "closedHat"
  | "openHat"
  | "rim"
  | "cowbell"
  | "tom"
  | "frame";

export interface DrumVoiceDef {
  /** Shown in the UI. */
  readonly name: string;
  readonly kitVoice: KitVoiceName;
  readonly gen: PatternGen;
  /** Pattern length in steps. Differing lengths across voices give polymeter. */
  readonly len?: number;
  readonly density: number;
  readonly chaos?: number;
  readonly accentAt?: number;
  readonly vel?: { readonly base: number; readonly accent: number; readonly ghost: number };
  readonly syncopation?: number;
  /**
   * How much of the global swing this voice takes, 0..1. Per-voice on purpose: hats
   * swing while the kick stays straight, which is what producers actually do and what a
   * single global swing constant cannot express.
   */
  readonly swingDepth?: number;
  /**
   * Constant displacement in milliseconds, signed, identical every bar. This is the
   * Dilla mechanism — a backbeat consistently early, not a backbeat randomly scattered.
   */
  readonly nudgeMs?: number;
  /**
   * Random displacement in milliseconds. Defaults to zero everywhere, and should stay
   * there: every controlled study finds random microtiming reduces groove, and beyond
   * about 25 ms it reduces it a lot.
   */
  readonly jitterMs?: number;
  /** Probability this voice is muted for an 8-bar block. */
  readonly muteP?: number;
  /** Energy below which this voice is out. */
  readonly minEnergy?: number;
  /** Energy above which it drops out again — how a pad clears the way for a drop. */
  readonly maxEnergy?: number;
  /** How far the energy curve may move this lane's density, 0..1. */
  readonly densitySwing?: number;
  /** Extra density at phrase ends. Suits a hat, a ghost snare or a tom — not a kick. */
  readonly fill?: FillDef;
}

export interface BassDef {
  readonly name: string;
  readonly wave: OscillatorType;
  /** Interval bags, where repetition is the weighting. */
  readonly bags: readonly PitchBag[];
  readonly rootRange: readonly [number, number];
  readonly gen: PatternGen;
  readonly len?: number;
  readonly density: number;
  readonly chaos?: number;
  readonly accentP: number;
  readonly slideP: number;
  readonly synth: ThreeOhParams;
  readonly swingDepth?: number;
  readonly nudgeMs?: number;
  readonly muteP?: number;
  readonly minEnergy?: number;
  readonly maxEnergy?: number;
  readonly densitySwing?: number;
  /** Octaves the energy curve may move this voice's own cutoff, either way from centre. */
  readonly filterSwing?: number;
}

export interface ChordsDef {
  readonly name: string;
  /** Which steps of the bar a chord is struck on. House stabs on the offbeat eighths. */
  readonly gen: PatternGen;
  readonly len?: number;
  readonly density: number;
  readonly chaos?: number;
  /** Where the voicing may sit. Voice leading keeps it inside. */
  readonly register: readonly [number, number];
  readonly synth: Partial<PolyParams>;
  readonly swingDepth?: number;
  readonly nudgeMs?: number;
  readonly muteP?: number;
  readonly minEnergy?: number;
  readonly maxEnergy?: number;
  readonly densitySwing?: number;
  readonly filterSwing?: number;
}

/**
 * A melodic line: a walk over the scale in force, pulled towards chord tones on the beats.
 */
export interface LeadDef {
  readonly name: string;
  readonly gen: PatternGen;
  readonly len?: number;
  readonly density: number;
  readonly chaos?: number;
  readonly register: readonly [number, number];
  /** Scales the odds of anything larger than a step. */
  readonly leapiness: number;
  /** How closely the line traces an arch across the bar. 0 is free. */
  readonly contour: number;
  /** How hard chord tones pull on the beats. */
  readonly chordPull: number;
  readonly synth: Partial<PolyParams>;
  readonly swingDepth?: number;
  readonly nudgeMs?: number;
  readonly muteP?: number;
  readonly minEnergy?: number;
  readonly maxEnergy?: number;
  readonly densitySwing?: number;
}

/**
 * A genre's tonal content: what key, what scale, what chords.
 *
 * Optional, and genuinely so — acid and minimal techno have none, and that is not an
 * omission. Butler's phrase for techno is a "total lack of cadences"; a progression under
 * an acid line destroys it.
 */
export interface TonalityDef {
  readonly scales: readonly { readonly name: ScaleName; readonly weight: number }[];
  /** Pitch classes the genre favours. Omit for no preference. */
  readonly keyPrefs?: readonly number[];
  readonly harmony: HarmonyDef;
}

export interface GenreDef {
  readonly id: string;
  readonly name: string;
  /** Canonical tracks, so the preset can be argued with. */
  readonly refs: readonly string[];
  /**
   * Bumped whenever generation changes in a way that would move existing seeds. A saved
   * seed carries the version it was made under, so improving a generator cannot silently
   * repoint every seed at different music.
   */
  readonly version: number;

  readonly clock: {
    readonly bpm: { readonly min: number; readonly max: number; readonly default: number };
    readonly stepsPerBar: number;
    /**
     * Steps per beat. Four gives sixteenths in 4/4. Stated rather than derived, because
     * an additive metre has no single answer: 7/8 as 3+2+2 has three beats of unequal
     * length in fourteen steps, and `stepsPerBar / 4` describes nothing there.
     */
    readonly stepsPerBeat?: number;
    /**
     * Beat lengths in steps, for additive metres — 3+2+2 eighths on a sixteenth grid is
     * `[6, 4, 4]`. When present it also generates the metric curve, since the tabulated
     * hierarchies assume a divisive metre and get an aksak bar wrong.
     */
    readonly grouping?: readonly number[];
    /** Linn/MPC percentage: 50 is straight, 66.67 a true triplet. */
    readonly swing: number;
    readonly swingSubdiv: 8 | 16;
  };

  /** Which parameter set the drum voices read. Defaults to the 808. */
  readonly kit?: KitStyleName;
  /**
   * Quantise every velocity to this many bits. A NES has four, so sixteen levels; the
   * steps are audible and are part of the sound. Omit for continuous velocity.
   */
  readonly velocityBits?: number;
  readonly drums: readonly DrumVoiceDef[];
  readonly bass?: BassDef;
  readonly chords?: ChordsDef;
  readonly lead?: LeadDef;
  readonly tonality?: TonalityDef;

  readonly fx: {
    readonly delay: {
      readonly noteValue: NoteValue;
      readonly feedback: number;
      readonly wet: number;
      readonly feedbackLowpassHz?: number;
      /** Which voices are sent to it. Drums usually are not. */
      readonly sends: readonly string[];
    };
    readonly sidechain: {
      readonly db: number;
      readonly releaseMs: number;
      readonly targets: readonly string[];
    };
    /** Vinyl noise, tape wow and bit reduction, applied to the whole mix. */
    readonly texture?: TextureOptions;
    /** A filter on the whole mix, swept by the energy curve. */
    readonly energyFilter?: EnergyFilterOptions;
    /** A room, as a send. Lanes named in `sends` go to it as well as to their bus. */
    readonly reverb?: ReverbOptions;
  };

  readonly arrangement: {
    /** Bars between possible pattern regenerations, and the odds each time. */
    readonly newPatternEvery: number;
    readonly newPatternP: number;
    /** Bars between possible key, bag and progression changes. */
    readonly newNotesEvery: number;
    readonly newNotesP: number;
    /** Bars between mute re-rolls. */
    readonly muteEvery: number;
    /**
     * The form. Cycles, since a generative piece has no end. Omit for a flat arrangement
     * driven only by the mute re-rolls above.
     */
    readonly sections?: readonly SectionDef[];
    /**
     * How far the energy curve may move the tempo, as a fraction of the base either way.
     * A gnawa song accelerates for its whole length; nothing in 4/4 dance music does.
     */
    readonly tempoSwing?: number;
  };
}
