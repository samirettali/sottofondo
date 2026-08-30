import { createKit, type DrumVoice, type Kit } from "./audio/drums.ts";
import { createDelay, createDucker, type Delay, type Ducker } from "./audio/fx.ts";
import { createMaster, type Master } from "./audio/master.ts";
import { createThreeOh, midiToFrequency, type ThreeOh } from "./audio/threeoh.ts";
import { EPOCHS, epochAt, isMuted, type EpochSpec } from "./arrange/epoch.ts";
import { Clock, type StepEvent } from "./core/clock.ts";
import { formatSeed } from "./core/rng.ts";
import { floorMod, swingOffsetBeats, track } from "./core/time.ts";
import { defaultVoice, realise, type Hit } from "./pattern/gen.ts";
import {
  chooseNoteSet,
  defaultNoteVoice,
  realiseNotes,
  type NoteSlot,
} from "./pattern/notes.ts";
import type { BassDef, DrumVoiceDef, GenreDef } from "./genre/schema.ts";

/**
 * The engine: a genre definition in, sound out.
 *
 * Nothing here knows what acid is. Everything genre-specific lives in the preset; this
 * file is the machine the preset drives. When that stops being true — when a preset needs
 * a graph rather than a number — the graph belongs here, named, and the preset picks it
 * by tag.
 */

interface RuntimeVoice {
  readonly name: string;
  readonly def: DrumVoiceDef;
  readonly len: number;
  readonly out: DrumVoice;
  /** Set by the UI. Distinct from the arrangement's own mutes. */
  userMuted: boolean;
}

interface RuntimeBass {
  readonly def: BassDef;
  readonly len: number;
  readonly synth: ThreeOh;
  userMuted: boolean;
  /** Whether the previous note left the gate open for a slide. */
  gateOpen: boolean;
}

export interface EngineOptions {
  /** Overrides the genre's default tempo. */
  bpm?: number;
}

export class Engine {
  readonly ctx: AudioContext;
  readonly master: Master;
  readonly kit: Kit;
  readonly clock: Clock;
  readonly genre: GenreDef;
  readonly seed: number;
  readonly delay: Delay;
  readonly ducker: Ducker;

  private readonly voices: RuntimeVoice[] = [];
  private readonly bass: RuntimeBass | null = null;
  private readonly patternSpec: EpochSpec;
  private readonly noteSpec: EpochSpec;
  private bpm: number;
  private swing: number;

  /** Called for every hit actually scheduled, so a display can follow along. */
  onHit: (voiceIndex: number, step: number, velocity: number, time: number) => void = () => {};

  constructor(ctx: AudioContext, genre: GenreDef, seed: number, opts: EngineOptions = {}) {
    this.ctx = ctx;
    this.genre = genre;
    this.seed = seed;
    this.bpm = opts.bpm ?? genre.clock.bpm.default;
    this.swing = genre.clock.swing;

    this.master = createMaster(ctx);
    this.ducker = createDucker(
      ctx,
      this.master.input,
      genre.fx.sidechain.db,
      genre.fx.sidechain.releaseMs,
    );
    this.delay = createDelay(ctx, this.master.input, genre.fx.delay, this.bpm);
    this.kit = createKit(ctx, this.master.input);

    for (const def of genre.drums) {
      this.voices.push({
        name: def.name,
        def,
        len: def.len ?? genre.clock.stepsPerBar,
        out: this.kit[def.kitVoice],
        userMuted: false,
      });
    }

    if (genre.bass !== undefined) {
      const def = genre.bass;
      // A voice named in the delay's send list is routed through it; everything else
      // goes to the ducked bus. This is the one piece of routing a preset chooses, and
      // it chooses by name from a fixed pair of destinations.
      const sent = genre.fx.delay.sends.includes(def.name);
      const out = sent ? this.delay.input : this.ducker.output;
      this.bass = {
        def,
        len: def.len ?? genre.clock.stepsPerBar,
        synth: createThreeOh(ctx, out, def.wave, def.synth),
        userMuted: false,
        gateOpen: false,
      };
    }

    this.patternSpec = {
      every: genre.arrangement.newPatternEvery,
      p: genre.arrangement.newPatternP,
      salt: EPOCHS.pattern,
    };
    this.noteSpec = {
      every: genre.arrangement.newNotesEvery,
      p: genre.arrangement.newNotesP,
      salt: EPOCHS.notes,
    };

    const lanes = this.voices.map((v) => track(v.len));
    if (this.bass !== null) lanes.push(track(this.bass.len));
    this.clock = new Clock(() => ctx.currentTime, lanes, {
      stepsPerBeat: genre.clock.stepsPerBar / 4,
    });
    this.clock.onStep((e) => this.step(e));
  }

  /** Index of the bass lane in the clock's track list, or -1. */
  private get bassLane(): number {
    return this.bass === null ? -1 : this.voices.length;
  }

  start(): void {
    this.clock.start(this.bpm);
  }

  stop(): void {
    this.clock.stop();
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    this.clock.setBpm(bpm);
    this.delay.setTempo(bpm);
  }

  get tempo(): number {
    return this.bpm;
  }

  get seedLabel(): string {
    return formatSeed(this.seed);
  }

  get voiceNames(): string[] {
    const names = this.voices.map((v) => v.name);
    if (this.bass !== null) names.push(this.bass.def.name);
    return names;
  }

  setUserMute(index: number, muted: boolean): void {
    if (index === this.bassLane && this.bass !== null) this.bass.userMuted = muted;
    else {
      const v = this.voices[index];
      if (v !== undefined) v.userMuted = muted;
    }
  }

  private step(e: StepEvent): void {
    if (e.voice === this.bassLane) this.bassStep(e);
    else this.drumStep(e);
  }

  private drumStep(e: StepEvent): void {
    const voice = this.voices[e.voice];
    if (voice === undefined || voice.userMuted) return;

    const stepInBar = floorMod(e.step, voice.len);
    const bar = Math.floor(e.step / voice.len);
    if (isMuted(this.seed, bar, e.voice, this.genre.arrangement.muteEvery, voice.def.muteP ?? 0)) {
      return;
    }

    const hit = this.hitsFor(voice, bar, e.voice).find((h) => h.step === stepInBar);
    if (hit === undefined) return;

    const at = this.displace(e, stepInBar, voice.def.swingDepth ?? 0, voice.def.nudgeMs ?? 0);
    voice.out.play(at, hit.velocity, hit.accent);
    // The kick drives the ducking, from its scheduled time rather than from a detector.
    if (voice.def.kitVoice === "kick" && this.genre.fx.sidechain.db > 0) this.ducker.duck(at);
    this.onHit(e.voice, stepInBar, hit.velocity, at);
  }

  private bassStep(e: StepEvent): void {
    const bass = this.bass;
    if (bass === null || bass.userMuted) return;

    const stepInBar = floorMod(e.step, bass.len);
    const bar = Math.floor(e.step / bass.len);
    if (isMuted(this.seed, bar, e.voice, this.genre.arrangement.muteEvery, bass.def.muteP ?? 0)) {
      return;
    }

    const slot = this.slotsFor(bass, bar, e.voice).find((s) => s.step === stepInBar);
    const at = this.displace(e, stepInBar, bass.def.swingDepth ?? 0, bass.def.nudgeMs ?? 0);

    if (slot === undefined) {
      // Close the gate on a rest — unless the previous note slid into this step, in
      // which case the gate is deliberately still open.
      if (bass.gateOpen) bass.gateOpen = false;
      else bass.synth.noteOff(at);
      return;
    }

    bass.synth.noteOn(at, midiToFrequency(slot.midi), slot.accent, slot.glide);
    bass.gateOpen = slot.slide;
    this.onHit(e.voice, stepInBar, slot.velocity, at);
  }

  /** Swing and constant displacement, clamped so nothing is scheduled into the past. */
  private displace(e: StepEvent, stepInBar: number, swingDepth: number, nudgeMs: number): number {
    const swung = swingOffsetBeats(
      stepInBar,
      this.swing,
      this.genre.clock.swingSubdiv,
      swingDepth,
      this.clock.stepsPerBeat,
    );
    const seconds = (swung * 60) / this.bpm + nudgeMs / 1000;
    return Math.max(e.earliest, e.time + seconds);
  }

  private hitsFor(voice: RuntimeVoice, bar: number, voiceIndex: number): Hit[] {
    const epoch = epochAt(this.seed, bar, this.patternSpec);
    const pattern = defaultVoice(voice.def.gen, {
      density: voice.def.density,
      chaos: voice.def.chaos ?? 0,
      accentAt: voice.def.accentAt ?? 0.75,
      ...(voice.def.vel === undefined ? {} : { vel: voice.def.vel }),
      ...(voice.def.syncopation === undefined ? {} : { syncopation: voice.def.syncopation }),
    });
    // Pattern from the epoch so it repeats; chaos from the bar so the repetition
    // breathes.
    return realise(pattern, voice.len, this.seed, epoch, voiceIndex, bar);
  }

  private slotsFor(bass: RuntimeBass, bar: number, voiceIndex: number): NoteSlot[] {
    const patternEpoch = epochAt(this.seed, bar, this.patternSpec);
    const noteEpoch = epochAt(this.seed, bar, this.noteSpec);
    const noteSet = chooseNoteSet(
      bass.def.bags,
      bass.def.rootRange,
      this.seed,
      noteEpoch,
      voiceIndex,
    );
    const voice = defaultNoteVoice({
      gen: bass.def.gen,
      density: bass.def.density,
      chaos: bass.def.chaos ?? 0,
      accentP: bass.def.accentP,
      slideP: bass.def.slideP,
    });
    return realiseNotes(voice, noteSet, bass.len, this.seed, patternEpoch, voiceIndex);
  }
}
