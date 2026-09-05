import type { Pattern, Hap } from "@strudel/core";
import type { ScoreEvent } from "./compose.ts";
import { defaultTicker, type Ticker } from "../core/ticker.ts";

/** Worker wakeups query arcs, not grid steps. Tempo changes split the arc at a bar. */
export class Transport {
  running = false;
  cursor = 0;
  private anchorCycle = 0;
  private anchorTime = 0;
  private previous: { cycle: number; time: number; speed: number } | undefined;
  private speed: number;
  private busy = false;
  private generation = 0;
  private pending: { bar: number; bpm: number } | undefined;
  private readonly ticker: Ticker;
  private readonly now;
  private readonly pattern;
  private readonly trigger;
  private readonly onError;
  constructor(now: () => number, bpm: number,
    pattern: Pattern<ScoreEvent>,
    trigger: (hap: Hap<ScoreEvent>, time: number, duration: number, cps: number) => Promise<void>,
    onError: (error: unknown) => void, ticker?: Ticker) {
    this.now = now; this.pattern = pattern; this.trigger = trigger; this.onError = onError;
    this.speed = bpm / 240;
    this.ticker = ticker ?? defaultTicker();
  }
  get cycle(): number {
    if (!this.running) return 0;
    const old = this.previous;
    if (old && this.now() < this.anchorTime) return Math.max(0, old.cycle + (this.now() - old.time) * old.speed);
    return Math.max(0, this.anchorCycle + (this.now() - this.anchorTime) * this.speed);
  }
  get nextBar(): number { return Math.ceil(this.cursor + 1e-8); }
  setBpm(bpm: number): void {
    if (!this.running) this.speed = bpm / 240;
    else this.pending = { bar: this.nextBar, bpm };
  }
  start(): void {
    if (this.running) return;
    this.running = true; this.generation++;
    this.cursor = 0; this.anchorCycle = 0; this.anchorTime = this.now() + 0.06;
    this.previous = undefined;
    this.ticker.start(() => { void this.pump(); }, 25);
    void this.pump();
  }
  stop(): void { this.running = false; this.generation++; this.pending = undefined; this.ticker.stop(); }
  async pump(): Promise<void> {
    if (!this.running || this.busy) return;
    this.busy = true;
    const token = this.generation;
    try {
      const horizon = this.now() + 0.15;
      for (let budget = 0; budget < 64 && this.running && token === this.generation; budget++) {
        const at = this.anchorTime + (this.cursor - this.anchorCycle) / this.speed;
        if (at >= horizon) break;
        if (this.pending && this.cursor >= this.pending.bar) {
          this.previous = { cycle: this.anchorCycle, time: this.anchorTime, speed: this.speed };
          this.anchorTime = at; this.anchorCycle = this.cursor;
          this.speed = this.pending.bpm / 240; this.pending = undefined;
        }
        const end = Math.min(this.anchorCycle + (horizon - this.anchorTime) * this.speed,
          Math.floor(this.cursor + 1e-8) + 1, this.pending?.bar ?? Infinity);
        if (end <= this.cursor) break;
        const haps = this.pattern.queryArc(this.cursor, end).filter(h => h.hasOnset());
        this.cursor = end;
        for (const hap of haps) {
          if (!this.running || token !== this.generation) break;
          const time = this.anchorTime + (+hap.whole.begin - this.anchorCycle) / this.speed;
          if (time >= this.now()) await this.trigger(hap, time, +hap.duration / this.speed, this.speed);
        }
      }
    } catch (error) { this.stop(); this.onError(error); }
    finally { this.busy = false; }
  }
}
