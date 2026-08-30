import { beatOfStep, beatToTime, setBpm, tempoMap, timeToBeat, type TempoMap, type Track } from "./time.ts";
import { defaultTicker, type Ticker } from "./ticker.ts";

/**
 * The lookahead scheduler.
 *
 * Chris Wilson's two-clock pattern: an imprecise timer decides when to look ahead, and
 * everything it finds is scheduled at an absolute `AudioContext` time. 25 ms between
 * looks, 100 ms of horizon — so a callback arriving 50 ms late still has 50 ms of
 * already-scheduled audio in front of it.
 *
 * The reference implementation this project descends from fires notes at
 * `ctx.currentTime` from a self-rescheduling `setTimeout`, which drifts and jitters by
 * roughly the same amount as the swing and microtiming we intend to parameterise. That
 * is the one thing here that could not have been retrofitted.
 *
 * https://web.dev/articles/audio-scheduling
 */

/** One scheduled hit, handed to the voice that will make the sound. */
export interface StepEvent {
  /** Index into `tracks`. */
  voice: number;
  /** Absolute step index — never wrapped, so it doubles as the phase source. */
  step: number;
  /** Nominal position, before any per-voice nudge. */
  beat: number;
  /** Absolute `AudioContext` time for the nominal position. */
  time: number;
  /**
   * The earliest time this event may be moved to and still be scheduled rather than
   * played late. Nudges and swing that pull a hit *earlier* must respect it.
   */
  earliest: number;
}

export type StepHandler = (event: StepEvent) => void;

export interface ClockOptions {
  /** Seconds of audio scheduled in advance. */
  lookahead?: number;
  /** Milliseconds between wake-ups. */
  tickMs?: number;
  /** Base grid: 4 gives sixteenths. */
  stepsPerBeat?: number;
  ticker?: Ticker;
}

export class Clock {
  private map: TempoMap;
  private readonly cursors: number[] = [];
  private readonly ticker: Ticker;
  private readonly lookahead: number;
  private readonly tickMs: number;
  readonly stepsPerBeat: number;
  private running = false;
  private handler: StepHandler = () => {};
  private readonly now: () => number;
  tracks: Track[];

  constructor(now: () => number, tracks: Track[], opts: ClockOptions = {}) {
    this.now = now;
    this.tracks = tracks;
    this.lookahead = opts.lookahead ?? 0.1;
    this.tickMs = opts.tickMs ?? 25;
    this.stepsPerBeat = opts.stepsPerBeat ?? 4;
    this.ticker = opts.ticker ?? defaultTicker();
    this.map = tempoMap(120, this.now(), 0);
  }

  get bpm(): number {
    return this.map.bpm;
  }

  /** Takes effect at the next scheduled event; already-scheduled audio does not move. */
  setBpm(bpm: number): void {
    this.map = setBpm(this.map, bpm, this.now());
  }

  /** The beat the audio clock is currently passing through. */
  get currentBeat(): number {
    return timeToBeat(this.map, this.now());
  }

  onStep(handler: StepHandler): void {
    this.handler = handler;
  }

  start(bpm = this.map.bpm): void {
    if (this.running) return;
    this.running = true;
    // Anchor beat 0 partway into the first window: far enough ahead that step 0 is
    // scheduled rather than played immediately, near enough that it still falls inside
    // the horizon and leaves room for a voice to nudge it earlier.
    this.map = { bpm, anchorBeat: 0, anchorTime: this.now() + this.lookahead / 2 };
    this.cursors.length = 0;
    for (let i = 0; i < this.tracks.length; i++) this.cursors[i] = 0;
    this.ticker.start(() => this.tick(), this.tickMs);
    this.tick();
  }

  stop(): void {
    this.running = false;
    this.ticker.stop();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Drain every voice up to the horizon.
   *
   * The loop is per voice rather than global: with rate multipliers the number of events
   * inside one window differs from lane to lane, so a single shared cursor would run
   * some lanes dry and others long.
   */
  private tick(): void {
    if (!this.running) return;
    const now = this.now();
    const horizon = now + this.lookahead;
    for (let voice = 0; voice < this.tracks.length; voice++) {
      const track = this.tracks[voice];
      if (track === undefined) continue;
      let step = this.cursors[voice] ?? 0;
      // Guard against a pathological rate producing an unbounded inner loop.
      let budget = 4096;
      for (;;) {
        const beat = beatOfStep(track, step, this.stepsPerBeat);
        const time = beatToTime(this.map, beat);
        if (time >= horizon || budget-- <= 0) break;
        this.handler({ voice, step, beat, time, earliest: now });
        step++;
      }
      this.cursors[voice] = step;
    }
  }
}
