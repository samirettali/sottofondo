import { createKit, type Kit } from "./audio/drums.ts";
import { createMaster, type Master } from "./audio/master.ts";
import { Clock, type StepEvent } from "./core/clock.ts";
import { formatSeed } from "./core/rng.ts";
import { floorMod, swingOffsetBeats, track } from "./core/time.ts";
import { defaultVoice, realise, type Hit, type VoicePattern } from "./pattern/gen.ts";

/**
 * The engine: clock in, sound out.
 *
 * A voice is a pattern plus the kit voice that renders it. Genre presets will replace
 * the hardcoded table below with data; the wiring does not change when they do.
 */

export interface Voice {
  readonly name: string;
  readonly pattern: VoicePattern;
  /** Index into the kit. */
  readonly kitVoice: number;
  readonly len: number;
  /** Per-voice swing depth, 0..1 — hats swing while the kick stays straight. */
  readonly swingDepth: number;
  /** Constant per-bar displacement in milliseconds. Signed. Not jitter. */
  readonly nudgeMs: number;
  muted: boolean;
}

export interface EngineState {
  seed: number;
  bpm: number;
  swing: number;
  voices: Voice[];
}

/** A placeholder kit layout, until genre presets arrive. Four on the floor, acid-ish. */
export function defaultVoices(): Voice[] {
  const v = (
    name: string,
    kitVoice: number,
    pattern: VoicePattern,
    over: Partial<Voice> = {},
  ): Voice => ({
    name,
    kitVoice,
    pattern,
    len: 16,
    swingDepth: 0,
    nudgeMs: 0,
    muted: false,
    ...over,
  });

  return [
    v("kick", 0, defaultVoice({ type: "mask", steps: [0, 4, 8, 12] }, { density: 0.6 })),
    v("clap", 2, defaultVoice({ type: "mask", steps: [4, 12] }, { density: 0.6 })),
    v(
      "closed hat",
      3,
      defaultVoice({ type: "stepClassP" }, { density: 0.55, chaos: 0.25, accentAt: 0.8 }),
      { swingDepth: 1 },
    ),
    v(
      "open hat",
      4,
      defaultVoice({ type: "mask", steps: [2, 6, 10, 14] }, { density: 0.45 }),
      { swingDepth: 1 },
    ),
  ];
}

export class Engine {
  readonly ctx: AudioContext;
  readonly master: Master;
  readonly kit: Kit;
  readonly clock: Clock;
  readonly state: EngineState;
  /** Called for every hit actually scheduled, so the UI can draw it. */
  onHit: (voice: number, hit: Hit, bar: number, time: number) => void = () => {};

  constructor(ctx: AudioContext, seed: number, bpm = 138) {
    this.ctx = ctx;
    this.master = createMaster(ctx);
    this.kit = createKit(ctx, this.master.input);
    this.state = { seed, bpm, swing: 0.5, voices: defaultVoices() };
    this.clock = new Clock(
      () => ctx.currentTime,
      this.state.voices.map((v) => track(v.len)),
      { stepsPerBeat: 4 },
    );
    this.clock.onStep((e) => this.step(e));
  }

  start(): void {
    this.clock.start(this.state.bpm);
  }

  stop(): void {
    this.clock.stop();
  }

  setBpm(bpm: number): void {
    this.state.bpm = bpm;
    this.clock.setBpm(bpm);
  }

  get seedLabel(): string {
    return formatSeed(this.state.seed);
  }

  /**
   * One scheduler step for one voice.
   *
   * The bar's hits are recomputed here rather than cached. Generation is a pure function
   * of `(seed, bar, voice)`, so recomputing is both cheap and the only way a mid-bar
   * parameter change can take effect without desynchronising anything.
   */
  private step(e: StepEvent): void {
    const voice = this.state.voices[e.voice];
    if (voice === undefined || voice.muted) return;

    const stepInBar = floorMod(e.step, voice.len);
    const bar = Math.floor(e.step / voice.len);
    const hit = realise(voice.pattern, voice.len, this.state.seed, bar, e.voice).find(
      (h) => h.step === stepInBar,
    );
    if (hit === undefined) return;

    const swung = swingOffsetBeats(
      stepInBar,
      this.state.swing,
      16,
      voice.swingDepth,
      this.clock.stepsPerBeat,
    );
    const nominal = e.time + this.beatsToSeconds(swung) + voice.nudgeMs / 1000;
    // A negative nudge must not pull a hit into the past; the horizon is what makes
    // early displacement possible at all.
    const at = Math.max(e.earliest, nominal);

    this.kit.voices[voice.kitVoice]?.play(at, hit.velocity, hit.accent);
    this.onHit(e.voice, hit, bar, at);
  }

  private beatsToSeconds(beats: number): number {
    return (beats * 60) / this.state.bpm;
  }
}
