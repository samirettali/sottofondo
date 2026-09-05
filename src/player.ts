import { Engine } from "./app.ts";
import type { Recipe, SoundMode } from "./recipe.ts";

/** UI contract; neither a scheduler nor an audio graph leaks through it. */
export interface Player extends Pick<Engine, "genre" | "seed" | "seedLabel" | "tempo" |
  "swingAmount" | "synthState" | "currentBar" | "currentStep" | "compositeCycleBars" |
  "views" | "sectionAt" | "setBpm" | "setSwing" | "setVolume" | "setDensity" |
  "setUserMute" | "setBassParam" | "setDelayParam" | "dispose"> {
  readonly ready: Promise<void>;
  readonly isRunning: boolean;
  readonly scopeSize: number;
  readonly recipe: Recipe;
  readonly error?: string | null;
  start(): void;
  stop(): void;
  readScope(data: Float32Array<ArrayBuffer>): void;
  setSoundMode(mode: SoundMode): Promise<void>;
}
export class LegacyPlayer extends Engine implements Player {
  readonly recipe: Recipe;
  constructor(ctx: AudioContext, r: Recipe, genre: Engine["genre"]) {
    super(ctx, genre, r.seed);
    this.recipe = r;
  }
  get isRunning(): boolean { return this.clock.isRunning; }
  get scopeSize(): number { return this.master.analyser.fftSize; }
  readScope(data: Float32Array<ArrayBuffer>): void { this.master.analyser.getFloatTimeDomainData(data); }
  async setSoundMode(): Promise<void> { throw new Error("Sound modes require a new composition."); }
}
