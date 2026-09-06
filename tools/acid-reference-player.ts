import { initAudio, loadBuffer, registerSynthSounds, samples, setAudioContext, setSuperdoughAudioController, superdough } from "superdough";
import { StereoOutput } from "../src/strudel/output.ts";
import { Transport } from "../src/strudel/transport.ts";
import { createThreeOh, midiToFrequency, type ThreeOh } from "../src/audio/threeoh.ts";
import { REFERENCE_BPM, referencePattern, type ReferenceEvent, type ReferenceVariant } from "./acid-reference-score.ts";
import type { Pattern } from "@strudel/core";

export interface AuditionScore {
  bpm: number; pattern: Pattern<ReferenceEvent>;
  /** Explicit local bank for composition experiments; the faithful reference
   * still requests its original TR-909 samples when this is absent. */
  localSamples?: Readonly<Record<string, string>>;
}

// The five index-zero files resolved by Strudel's RolandTR909 bank. Preview only:
// do not silently substitute our CC0 kit or vendor an unlicensed sample bank.
const BASE = "https://raw.githubusercontent.com/geikha/tidal-drum-machines/15eac73c5e878550f91d864a4863e014799403f1/machines/RolandTR909/";
export const REFERENCE_SAMPLES = {
  bd: `${BASE}rolandtr909-bd/Bassdrum-01.wav`, cp: `${BASE}rolandtr909-cp/Clap.wav`,
  hh: `${BASE}rolandtr909-hh/hh01.wav`, oh: `${BASE}rolandtr909-oh/Hat%20Open.wav`, sd: `${BASE}rolandtr909-sd/naredrum.wav`,
};
const downloads = new Map<string, Promise<string>>();
function sampleData(url: string): Promise<string> {
  let pending = downloads.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`TR-909 sample download failed (${response.status}).`);
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
      });
    })().catch(error => { downloads.delete(url); throw error; });
    downloads.set(url, pending);
  }
  return pending;
}

export class ReferencePlayer {
  readonly ready: Promise<void>;
  readonly analyser: AnalyserNode;
  readonly transport: Transport;
  private readonly output: StereoOutput;
  private readonly volume: GainNode;
  private bass: ThreeOh | undefined;
  private readonly score: AuditionScore;
  private disposed = false;
  error: string | null = null;

  constructor(private readonly ctx: BaseAudioContext, private readonly variant: ReferenceVariant, seed: number, score?: AuditionScore) {
    this.score = score ?? { bpm: REFERENCE_BPM, pattern: referencePattern(variant, seed) };
    this.volume = ctx.createGain(); this.volume.gain.value = .35;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048;
    this.volume.connect(this.analyser); this.volume.connect(ctx.destination);
    this.output = new StereoOutput(ctx, this.volume);
    this.transport = new Transport(() => ctx.currentTime, this.score.bpm, this.score.pattern,
      async (hap, time, duration, cps) => this.play(hap.value as ReferenceEvent, time, duration, cps),
      error => { this.error = String(error); this.stop(); });
    this.ready = this.init();
  }
  private async init(): Promise<void> {
    if (!this.ctx.audioWorklet) throw new Error("Audio needs HTTPS or localhost. Use the existing SSH tunnel.");
    setAudioContext(this.ctx); setSuperdoughAudioController(this.output);
    await initAudio({ maxPolyphony: this.ctx instanceof OfflineAudioContext ? 100000 : 128 }); registerSynthSounds();
    if (this.score.localSamples) {
      for (const asset of new Set(Object.values(this.score.localSamples))) {
        if (this.disposed) return;
        const response = await fetch(`/samples/v2/${asset}.json`);
        if (!response.ok) throw new Error(`Could not load ${asset}. Try Play again.`);
        const entry = await response.json() as { data: string };
        await loadBuffer(entry.data, this.ctx, `audition_${asset}`);
        await samples({ [`audition_${asset}`]: [entry.data] });
      }
      return;
    }
    for (const [id, url] of Object.entries(REFERENCE_SAMPLES)) {
      if (this.disposed) return;
      const data = await sampleData(url);
      await loadBuffer(data, this.ctx, `reference909_${id}`);
      await samples({ [`reference909_${id}`]: [data] });
    }
  }
  private createBass(): void {
    if (this.variant === "303") this.bass = createThreeOh(this.ctx, this.volume, "sawtooth", { cutoff: 180, resonance: 7, envMod: 3600, decay: .12 });
  }
  start(): void {
    if (this.disposed || this.transport.running) return;
    this.error = null; this.volume.gain.value = .35; this.createBass(); this.transport.start();
  }
  stop(): void {
    this.transport.stop(); this.volume.gain.value = 0;
    this.bass?.dispose(); this.bass = undefined; this.output.reset();
  }
  dispose(): void { this.disposed = true; this.stop(); this.output.dispose(); this.volume.disconnect(); this.analyser.disconnect(); }
  private async play(event: ReferenceEvent, time: number, duration: number, cps: number): Promise<void> {
    if (this.disposed) return;
    if (event.laneId === "acid" && this.bass) {
      this.bass.set({ cutoff: Number(event.sound.cutoff), resonance: Number(event.sound.resonance),
        envMod: Number(event.sound.lpenv) * 1200, decay: Number(event.sound.lpdecay) }, time);
      this.bass.noteOn(time, midiToFrequency(event.midi!), false, false, Number(event.sound.gain));
      this.bass.noteOff(time + duration); return;
    }
    // Preserve the original shared orbit and sample envelopes. No extra mix
    // saturation, compressor, ducking or delay; all audition variants use this bus.
    const { bank, ...sound } = event.sound;
    const asset = this.score.localSamples?.[String(sound.s)];
    if (bank === "Local" && !asset) throw new Error(`Unknown local sample: ${sound.s}`);
    await superdough({ ...sound, ...(bank ? { s: asset ? `audition_${asset}` : `reference909_${sound.s}` } : {}) }, time, duration, cps, event.begin);
  }
  async scheduleRender(end: number, beforeBar?: (bar: number) => Promise<void>): Promise<void> {
    await this.ready; this.createBass();
    const pattern = this.score.pattern, cps = this.score.bpm / 240;
    for (let bar = 0; bar < end; bar++) {
      await beforeBar?.(bar);
      for (const hap of pattern.queryArc(bar, bar + 1)) if (hap.hasOnset()) await this.play(hap.value, +hap.whole.begin / cps, +hap.duration / cps, cps);
    }
    this.bass?.noteOff(end / cps);
  }
}
