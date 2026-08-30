import { createKit, type DrumVoice, type Kit } from "./audio/drums.ts";
import {
  createDelay,
  createDucker,
  createEnergyFilter,
  createTexture,
  type Delay,
  type Ducker,
  type EnergyFilter,
  type Texture,
} from "./audio/fx.ts";
import { createMaster, type Master } from "./audio/master.ts";
import { createPoly, type Poly } from "./audio/poly.ts";
import { createThreeOh, midiToFrequency, type ThreeOh } from "./audio/threeoh.ts";
import { energyAt, sectionAt } from "./arrange/energy.ts";
import { isMuted } from "./arrange/epoch.ts";
import { Clock, type StepEvent } from "./core/clock.ts";
import { formatSeed } from "./core/rng.ts";
import { compositeCycleSteps, floorMod, swingOffsetBeats, track } from "./core/time.ts";
import { lanesOf, patternIndexAt, scoreLane, stepsPerBeat, type LaneState } from "./score.ts";
import type { BassDef, ChordsDef, DrumVoiceDef, GenreDef } from "./genre/schema.ts";

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
  /** Live override of the preset's density. */
  density: number;
  /** Set by the UI. Distinct from the arrangement's own mutes. */
  userMuted: boolean;
}

interface RuntimeBass {
  readonly def: BassDef;
  readonly len: number;
  readonly synth: ThreeOh;
  density: number;
  userMuted: boolean;
  /**
   * The cutoff the energy curve swings around. Held separately from the preset so that
   * moving the slider changes what the curve modulates rather than being overwritten by
   * it at the next bar.
   */
  cutoffBase: number;
  /** Whether the previous note left the gate open for a slide. */
  gateOpen: boolean;
}

interface RuntimeChords {
  readonly def: ChordsDef;
  readonly len: number;
  readonly synth: Poly;
  density: number;
  userMuted: boolean;
  cutoffBase: number;
}

/** What a display needs to know about one lane. */
export interface VoiceView {
  readonly name: string;
  /** The lane's own pattern length, which may differ from a bar. */
  readonly len: number;
  readonly density: number;
  readonly userMuted: boolean;
  /** Muted by the arrangement, as opposed to by the user. */
  readonly autoMuted: boolean;
  /** The current bar's pattern as velocities, zero where silent. */
  readonly steps: readonly number[];
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
  readonly texture: Texture;
  readonly energyFilter: EnergyFilter;
  /** The last bar the energy curve was applied for, so it is applied once per bar. */
  private appliedBar = -1;

  private readonly voices: RuntimeVoice[] = [];
  private readonly bass: RuntimeBass | null = null;
  private readonly chords: RuntimeChords | null = null;
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
    // The texture chain sits in front of the master bus, so wow and bit reduction apply
    // to the whole mix rather than to one voice — which is what a tape or a record does.
    this.texture = createTexture(ctx, this.master.input, genre.fx.texture ?? {});
    // The energy filter sits in front of the texture chain, so the sweep is filtered
    // audio rather than filtered vinyl noise.
    this.energyFilter = createEnergyFilter(ctx, this.texture.input, genre.fx.energyFilter);
    const bus = this.energyFilter.input;
    this.ducker = createDucker(ctx, bus, genre.fx.sidechain.db, genre.fx.sidechain.releaseMs);
    this.delay = createDelay(ctx, bus, genre.fx.delay, this.bpm);
    this.kit = createKit(ctx, bus);

    for (const def of genre.drums) {
      this.voices.push({
        name: def.name,
        def,
        len: def.len ?? genre.clock.stepsPerBar,
        out: this.kit[def.kitVoice],
        density: def.density,
        userMuted: false,
      });
    }

    // A voice named in the delay's send list is routed through it; everything else goes
    // to the ducked bus. This is the one piece of routing a preset chooses, and it
    // chooses by name from a fixed pair of destinations rather than describing a graph.
    const destination = (name: string): AudioNode =>
      genre.fx.delay.sends.includes(name) ? this.delay.input : this.ducker.output;

    if (genre.bass !== undefined) {
      const def = genre.bass;
      this.bass = {
        def,
        len: def.len ?? genre.clock.stepsPerBar,
        synth: createThreeOh(ctx, destination(def.name), def.wave, def.synth),
        density: def.density,
        userMuted: false,
        cutoffBase: def.synth.cutoff,
        gateOpen: false,
      };
    }

    if (genre.chords !== undefined) {
      const def = genre.chords;
      this.chords = {
        def,
        len: def.len ?? genre.clock.stepsPerBar,
        synth: createPoly(ctx, destination(def.name), def.synth),
        density: def.density,
        userMuted: false,
        cutoffBase: def.synth.cutoff ?? 1800,
      };
    }

    const lanes = this.voices.map((v) => track(v.len));
    if (this.bass !== null) lanes.push(track(this.bass.len));
    if (this.chords !== null) lanes.push(track(this.chords.len));
    this.clock = new Clock(() => ctx.currentTime, lanes, {
      stepsPerBeat: stepsPerBeat(genre),
    });
    this.clock.onStep((e) => this.step(e));
  }

  /** Index of the bass lane in the clock's track list, or -1. */
  private get bassLane(): number {
    return this.bass === null ? -1 : this.voices.length;
  }

  private get chordLane(): number {
    if (this.chords === null) return -1;
    return this.voices.length + (this.bass === null ? 0 : 1);
  }

  start(): void {
    this.clock.start(this.bpm);
  }

  stop(): void {
    this.clock.stop();
  }

  /**
   * Tear the whole graph down.
   *
   * Required before building a second engine on the same context: the master chain is
   * connected to the destination and the 303's oscillator never stops on its own, so an
   * abandoned engine keeps playing and keeps everything downstream of it alive.
   */
  dispose(): void {
    this.stop();
    this.bass?.synth.dispose();
    this.chords?.synth.dispose();
    this.energyFilter.dispose();
    this.texture.dispose();
    this.master.dispose();
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
    return lanesOf(this.genre).map((lane) => lane.name);
  }

  setUserMute(index: number, muted: boolean): void {
    if (index === this.bassLane && this.bass !== null) this.bass.userMuted = muted;
    else if (index === this.chordLane && this.chords !== null) this.chords.userMuted = muted;
    else {
      const v = this.voices[index];
      if (v !== undefined) v.userMuted = muted;
    }
  }

  setDensity(index: number, density: number): void {
    const clamped = Math.max(0, Math.min(1, density));
    if (index === this.bassLane && this.bass !== null) this.bass.density = clamped;
    else if (index === this.chordLane && this.chords !== null) this.chords.density = clamped;
    else {
      const v = this.voices[index];
      if (v !== undefined) v.density = clamped;
    }
  }

  get swingAmount(): number {
    return this.swing;
  }

  setSwing(swing: number): void {
    this.swing = Math.max(0.5, Math.min(0.75, swing));
  }

  setVolume(v: number): void {
    this.master.setVolume(v);
  }

  /** Which bar the audio clock is currently in. */
  get currentBar(): number {
    const stepsPerBar = this.genre.clock.stepsPerBar;
    const step = this.clock.currentBeat * this.clock.stepsPerBeat;
    return Math.max(0, Math.floor(step / stepsPerBar));
  }

  /**
   * How many bars before every lane's pattern realigns.
   *
   * Maximal when the lane lengths are pairwise coprime. Worth showing: with a seven-step
   * lane against sixteen there is no other way to know the combination will not come
   * round for seven bars.
   */
  get compositeCycleBars(): number {
    const steps = compositeCycleSteps(this.clock.tracks);
    return Math.max(1, Math.round(steps / this.genre.clock.stepsPerBar));
  }

  /** Where the arrangement is: the section name and the energy there. */
  sectionAt(bar = this.currentBar): { name: string; energy: number; bar: number; bars: number } {
    const sections = this.genre.arrangement.sections;
    const at = sections === undefined ? null : sectionAt(sections, bar);
    return at === null
      ? { name: "—", energy: energyAt(this.genre, bar), bar: 0, bars: 0 }
      : { name: at.name, energy: at.energy, bar: at.bar, bars: at.bars };
  }

  /** Step within the current bar, for a playhead. */
  get currentStep(): number {
    const step = Math.floor(this.clock.currentBeat * this.clock.stepsPerBeat);
    return floorMod(step, this.genre.clock.stepsPerBar);
  }

  /** A snapshot of every lane, for the display. Cheap: generation is pure. */
  views(bar = this.currentBar): VoiceView[] {
    const out: VoiceView[] = [];
    const muteEvery = this.genre.arrangement.muteEvery;
    const perBar = this.genre.clock.stepsPerBar;

    /**
     * A lane is always drawn as one bar, whatever its own length. A seven-step lane is
     * shown tiled across the bar and lands somewhere different in the next one, which is
     * the whole point of a polymetric lane and is invisible if each lane is drawn as its
     * own cycle.
     */
    const spread = (velocities: readonly number[], len: number): number[] =>
      Array.from(
        { length: perBar },
        (_, i) => velocities[patternIndexAt(this.genre, len, bar, i)] ?? 0,
      );

    lanesOf(this.genre).forEach((lane) => {
      const state = this.laneState(lane.index);
      const own = new Array<number>(lane.len).fill(0);
      // Scored unmuted, so the display can show what a muted lane would be playing.
      for (const ev of scoreLane(this.genre, lane.index, this.seed, bar, {
        density: state.density,
        userMuted: false,
      })) {
        own[ev.patternStep] = ev.velocity;
      }
      const def = this.genre.drums[lane.index] ?? this.genre.bass;
      out.push({
        name: lane.name,
        len: lane.len,
        density: state.density,
        userMuted: state.userMuted,
        autoMuted: isMuted(this.seed, bar, lane.index, muteEvery, def?.muteP ?? 0),
        steps: spread(own, lane.len),
      });
    });

    return out;
  }

  private laneState(index: number): LaneState {
    if (index === this.bassLane && this.bass !== null) {
      return { density: this.bass.density, userMuted: this.bass.userMuted };
    }
    if (index === this.chordLane && this.chords !== null) {
      return { density: this.chords.density, userMuted: this.chords.userMuted };
    }
    const v = this.voices[index];
    return v === undefined
      ? { density: 0, userMuted: true }
      : { density: v.density, userMuted: v.userMuted };
  }

  private step(e: StepEvent): void {
    this.applyEnergy(e);
    if (e.voice === this.bassLane) this.bassStep(e);
    else if (e.voice === this.chordLane) this.chordStep(e);
    else this.drumStep(e);
  }

  /**
   * Move everything the energy curve drives, once per bar, at the bar's own time.
   *
   * Scheduled at the event's time rather than at `currentTime`, so the sweep lands with
   * the music rather than whenever the scheduler happened to wake up. Once per bar
   * because that is how often the curve moves; per step would be thousands of redundant
   * automation events on a param list that is scanned linearly.
   */
  private applyEnergy(e: StepEvent): void {
    const bar = Math.floor(e.step / this.genre.clock.stepsPerBar);
    if (bar === this.appliedBar) return;
    this.appliedBar = bar;

    const energy = energyAt(this.genre, bar);
    this.energyFilter.setEnergy(energy, e.time);

    const swing = (base: number, octaves: number): number =>
      base * 2 ** ((energy - 0.5) * 2 * octaves);

    const bassSwing = this.bass?.def.filterSwing ?? 0;
    if (this.bass !== null && bassSwing > 0) {
      this.bass.synth.set({ cutoff: swing(this.bass.cutoffBase, bassSwing) }, e.time);
    }
    const chordSwing = this.chords?.def.filterSwing ?? 0;
    if (this.chords !== null && chordSwing > 0) {
      this.chords.synth.set({ cutoff: swing(this.chords.cutoffBase, chordSwing) }, e.time);
    }
  }

  /** What the synth sliders should show. */
  get synthState(): {
    bass: { cutoff: number; resonance: number; envMod: number; decay: number } | null;
    chords: { cutoff: number; decay: number } | null;
    delay: { wet: number; feedback: number };
  } {
    return {
      bass:
        this.bass === null
          ? null
          : {
              cutoff: this.bass.cutoffBase,
              resonance: this.bass.synth.params.resonance,
              envMod: this.bass.synth.params.envMod,
              decay: this.bass.synth.params.decay,
            },
      chords:
        this.chords === null
          ? null
          : { cutoff: this.chords.cutoffBase, decay: this.chords.synth.params.decay },
      delay: { wet: this.genre.fx.delay.wet, feedback: this.genre.fx.delay.feedback },
    };
  }

  setBassParam(name: "cutoff" | "resonance" | "envMod" | "decay", value: number): void {
    if (this.bass === null) return;
    if (name === "cutoff") {
      // Moving the base moves what the energy curve swings around, and takes effect at
      // once rather than waiting for the next bar.
      this.bass.cutoffBase = value;
      this.bass.synth.set({ cutoff: value });
      return;
    }
    this.bass.synth.set({ [name]: value });
  }

  setChordParam(name: "cutoff" | "decay", value: number): void {
    if (this.chords === null) return;
    if (name === "cutoff") this.chords.cutoffBase = value;
    this.chords.synth.set({ [name]: value });
  }

  setDelayParam(name: "wet" | "feedback", value: number): void {
    this.delay.set({ [name]: value });
  }

  private chordStep(e: StepEvent): void {
    const chords = this.chords;
    if (chords === null) return;

    const patternStep = floorMod(e.step, chords.len);
    const stepInBar = floorMod(e.step, this.genre.clock.stepsPerBar);
    const bar = Math.floor(e.step / this.genre.clock.stepsPerBar);

    const hit = scoreLane(this.genre, e.voice, this.seed, bar, this.laneState(e.voice)).find(
      (ev) => ev.patternStep === patternStep,
    );
    if (hit?.notes === undefined) return;

    const at = this.displace(e, stepInBar, chords.def.swingDepth ?? 0, chords.def.nudgeMs ?? 0);
    chords.synth.play(at, hit.notes, hit.velocity);
    this.onHit(e.voice, stepInBar, hit.velocity, at);
  }

  private drumStep(e: StepEvent): void {
    const voice = this.voices[e.voice];
    if (voice === undefined) return;

    // The bar is global — floor(step / stepsPerBar) — not floor(step / voice.len). A
    // seven-step lane still lives in the same bars as everything else; keying its epochs
    // and mutes on its own cycle would make it change pattern more than twice as often
    // as the rest of the kit, which is not what a polymetric lane means.
    const patternStep = floorMod(e.step, voice.len);
    const stepInBar = floorMod(e.step, this.genre.clock.stepsPerBar);
    const bar = Math.floor(e.step / this.genre.clock.stepsPerBar);

    const hit = scoreLane(this.genre, e.voice, this.seed, bar, this.laneState(e.voice)).find(
      (ev) => ev.patternStep === patternStep,
    );
    if (hit === undefined) return;

    const at = this.displace(e, stepInBar, voice.def.swingDepth ?? 0, voice.def.nudgeMs ?? 0);
    voice.out.play(at, hit.velocity, hit.accent);
    // The kick drives the ducking, from its scheduled time rather than from a detector.
    if (voice.def.kitVoice === "kick" && this.genre.fx.sidechain.db > 0) this.ducker.duck(at);
    this.onHit(e.voice, stepInBar, hit.velocity, at);
  }

  private bassStep(e: StepEvent): void {
    const bass = this.bass;
    if (bass === null) return;

    const patternStep = floorMod(e.step, bass.len);
    const stepInBar = floorMod(e.step, this.genre.clock.stepsPerBar);
    const bar = Math.floor(e.step / this.genre.clock.stepsPerBar);

    const slot = scoreLane(this.genre, e.voice, this.seed, bar, this.laneState(e.voice)).find(
      (ev) => ev.patternStep === patternStep,
    );
    const at = this.displace(e, stepInBar, bass.def.swingDepth ?? 0, bass.def.nudgeMs ?? 0);

    if (slot === undefined || slot.midi === undefined) {
      // Close the gate on a rest — unless the previous note slid into this step, in
      // which case the gate is deliberately still open.
      if (bass.gateOpen) bass.gateOpen = false;
      else bass.synth.noteOff(at);
      return;
    }

    bass.synth.noteOn(at, midiToFrequency(slot.midi), slot.accent, slot.glide ?? false);
    bass.gateOpen = slot.slide ?? false;
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

}
