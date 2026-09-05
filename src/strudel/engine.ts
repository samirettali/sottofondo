import { initAudio, loadBuffer, registerSynthSounds,
  samples, setAudioContext, setSuperdoughAudioController, superdough } from "superdough";
import { GENRES } from "../genre/index.ts";
import { formatSeed } from "../core/rng.ts";
import { energyAt, sectionAt } from "../arrange/energy.ts";
import { createMaster } from "../audio/master.ts";
import { createThreeOh, midiToFrequency, type ThreeOh } from "../audio/threeoh.ts";
import { createDelay } from "../audio/fx.ts";
import type { Player } from "../player.ts";
import type { Recipe, SoundMode } from "../recipe.ts";
import type { VoiceView } from "../app.ts";
import { composeBar, compositionPattern, scoreLanes, type LaneControl, type ScoreEvent } from "./compose.ts";
import { Transport } from "./transport.ts";
import { StereoOutput } from "./output.ts";

const DRUM_SYNTHS: Record<string, Record<string, unknown>> = {
  kick: { s: "sine", note: 33, penv: 28, pattack: 0, pdecay: 0.028, decay: 0.23, gain: 0.9 },
  snare: { s: "white", hpf: 450, lpf: 6500, decay: 0.14, gain: 0.4 },
  clap: { s: "white", hpf: 900, lpf: 4500, decay: 0.1, gain: 0.32 },
  closedHat: { s: "white", hpf: 8000, decay: 0.035, gain: 0.24 },
  openHat: { s: "white", hpf: 7000, decay: 0.18, gain: 0.26 },
  rim: { s: "triangle", note: 92, decay: 0.025, gain: 0.3 },
  cowbell: { s: "square", note: 72, fm: 1.4, fmh: 1.48, lpf: 4000, decay: 0.09, gain: 0.18 },
};
interface Snapshot { bar: number; controls: Record<string, LaneControl>; swing: number; mode: SoundMode; }

/** Strudel/Superdough owns event synthesis; the continuous 303 is a scheduled instrument adapter. */
export class StrudelPlayer implements Player {
  recipe: Recipe;
  readonly genre;
  readonly seed: number;
  readonly ready: Promise<void>;
  readonly master;
  readonly transport: Transport;
  private readonly controller;
  private readonly lanes;
  private readonly bassBus: GainNode;
  private delay;
  private bass: ThreeOh | null = null;
  private disposed = false;
  private volume = 0.5;
  private bpm: number;
  private snapshots: Snapshot[];
  private samplesReady = false;
  private modeRequest = 0;
  private readonly bassParams;
  private readonly delayParams;
  error: string | null = null;

  constructor(private readonly ctx: BaseAudioContext, r: Recipe) {
    this.recipe = r; this.seed = r.seed; this.genre = GENRES[r.genre]!;
    this.bpm = this.genre.clock.bpm.default;
    this.lanes = scoreLanes(this.genre);
    this.bassParams = { ...this.genre.bass!.synth };
    this.delayParams = { ...this.genre.fx.delay };
    this.master = createMaster(ctx);
    this.controller = new StereoOutput(ctx, this.master.input);
    this.bassBus = ctx.createGain(); this.bassBus.connect(this.master.input);
    this.delay = createDelay(ctx, this.bassBus, this.delayParams, this.bpm);
    this.snapshots = [{ bar: 0, controls: Object.fromEntries(this.lanes.map(l => [l.id, { density: l.density, muted: false }])),
      swing: this.genre.clock.swing, mode: r.soundMode }];
    const pattern = compositionPattern(r, bar => this.snapshot(bar).controls, bar => this.snapshot(bar).swing);
    this.transport = new Transport(() => ctx.currentTime, this.bpm, pattern,
      async (hap, time, duration, cps) => {
        await this.play(hap.value, time, duration, cps);
        this.prune();
      }, error => { this.error = String(error); this.stop(); });
    this.ready = this.init();
  }
  private async init(): Promise<void> {
    setAudioContext(this.ctx);
    setSuperdoughAudioController(this.controller);
    await initAudio({ maxPolyphony: this.ctx instanceof OfflineAudioContext ? 100000 : 128 });
    if (this.disposed) return;
    registerSynthSounds();
    this.connectOutput();
    if (this.recipe.soundMode === "samples") await this.loadSamples();
  }
  private connectOutput(): void {
    const output = this.controller.output.destinationGain;
    output.disconnect(); output.connect(this.master.input);
  }
  private async loadSamples(): Promise<void> {
    if (this.samplesReady) return;
    const response = await fetch("/samples/kit.json");
    if (!response.ok) throw new Error("Could not load the drum kit.");
    const manifest = await response.json() as { entries: Record<string, { data: string }> };
    const map: Record<string, string[]> = {};
    for (const [id, entry] of Object.entries(manifest.entries)) {
      const name = `sotto_${id}`;
      await loadBuffer(entry.data, this.ctx, name);
      map[name] = [entry.data];
    }
    await samples(map);
    this.samplesReady = true;
  }
  private snapshot(bar: number): Snapshot {
    for (let i = this.snapshots.length - 1; i >= 0; i--) if (this.snapshots[i]!.bar <= bar) return this.snapshots[i]!;
    return this.snapshots[0]!;
  }
  private update(change: (state: Snapshot) => void): void {
    const bar = this.isRunning ? this.transport.nextBar : 0;
    const last = this.snapshots[this.snapshots.length - 1]!;
    const next: Snapshot = { ...last, bar,
      controls: Object.fromEntries(Object.entries(last.controls).map(([id, c]) => [id, { ...c }])) };
    change(next);
    if (last.bar === bar) this.snapshots.pop();
    this.snapshots.push(next);
    // Controls still need bounded history when every lane is silent.
    this.prune();
  }
  private prune(): void {
    while (this.snapshots.length > 2 && this.snapshots[1]!.bar < this.currentBar - 1) this.snapshots.shift();
  }
  get isRunning(): boolean { return this.transport.running; }
  get seedLabel(): string { return formatSeed(this.seed); }
  get tempo(): number { return this.bpm; }
  get swingAmount(): number { return this.snapshots[this.snapshots.length - 1]!.swing; }
  get currentBar(): number { return Math.floor(this.transport.cycle); }
  get currentStep(): number { return Math.floor(this.transport.cycle * 16) % 16; }
  get compositeCycleBars(): number { return this.lanes.some(l => l.len === 7) ? 7 : 2; }
  get scopeSize(): number { return this.master.analyser.fftSize; }
  private get bassOutput(): AudioNode {
    return this.genre.fx.delay.sends.includes(this.genre.bass!.name) ? this.delay.input : this.bassBus;
  }
  get synthState() { return { bass: { ...this.bassParams }, chords: null, delay: { ...this.delayParams } }; }
  readScope(data: Float32Array<ArrayBuffer>): void { this.master.analyser.getFloatTimeDomainData(data); }
  sectionAt(bar = this.currentBar) {
    return sectionAt(this.genre.arrangement.sections ?? [], bar) ?? { name: "main", energy: 0.5, bar, bars: 0 };
  }
  views(bar = this.currentBar): VoiceView[] {
    const state = this.snapshot(bar);
    const events = composeBar(this.recipe, bar, state.controls);
    return this.lanes.map(l => ({ name: l.name, len: l.len, density: state.controls[l.id]!.density,
      userMuted: state.controls[l.id]!.muted, autoMuted: !events.some(e => e.laneId === l.id),
      steps: Array.from({ length: 16 }, (_, i) => Math.max(0, ...events.filter(e => e.laneId === l.id &&
        Math.floor((e.begin - bar) * 16) === i).map(e => e.velocity))) }));
  }
  start(): void {
    if (this.disposed || this.isRunning) return;
    this.error = null;
    const latest = this.snapshots[this.snapshots.length - 1]!;
    this.snapshots = [{ ...latest, bar: 0 }];
    this.master.setVolume(this.volume);
    this.delay.dispose();
    this.delay = createDelay(this.ctx, this.bassBus, this.delayParams, this.bpm);
    this.bass = createThreeOh(this.ctx, this.bassOutput, this.genre.bass!.wave, this.bassParams);
    this.connectOutput();
    this.transport.setBpm(this.bpm);
    this.transport.start();
  }
  stop(): void {
    this.transport.stop();
    this.master.setVolume(0);
    this.bass?.dispose(); this.bass = null;
    this.delay.dispose();
    this.controller.reset();
    this.connectOutput();
  }
  dispose(): void {
    this.disposed = true; this.modeRequest++;
    this.stop(); this.controller.dispose(); this.master.dispose(); this.bassBus.disconnect();
  }
  setBpm(bpm: number): void { this.bpm = bpm; this.transport.setBpm(bpm); }
  setSwing(swing: number): void { this.update(s => { s.swing = swing; }); }
  setVolume(value: number): void { this.volume = value; if (this.isRunning) this.master.setVolume(value); }
  setDensity(index: number, density: number): void {
    const lane = this.lanes[index]; if (lane) this.update(s => { s.controls[lane.id]!.density = density; });
  }
  setUserMute(index: number, muted: boolean): void {
    const lane = this.lanes[index]; if (!lane) return;
    for (const s of this.snapshots) s.controls[lane.id]!.muted = muted;
    if (lane.id === "bass") this.bassBus.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.005);
    const orbit = this.controller.nodes[String(index)];
    if (orbit) (orbit.output as GainNode).gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.005);
  }
  setBassParam(name: "cutoff" | "resonance" | "envMod" | "decay", value: number): void {
    this.bassParams[name] = value; this.bass?.set({ [name]: value });
  }
  setDelayParam(name: "wet" | "feedback", value: number): void {
    this.delayParams[name] = value; this.delay.set({ [name]: value });
  }
  async setSoundMode(mode: SoundMode): Promise<void> {
    const request = ++this.modeRequest;
    if (mode === "samples") await this.loadSamples();
    if (this.disposed || request !== this.modeRequest) return;
    this.update(s => { s.mode = mode; });
    this.recipe = { ...this.recipe, soundMode: mode };
  }
  async play(event: ScoreEvent, time: number, duration: number, cps: number): Promise<void> {
    if (this.disposed) return;
    const bar = Math.floor(event.begin);
    const state = this.snapshot(bar);
    if (state.controls[event.laneId]?.muted) return;
    const energy = energyAt(this.genre, bar);
    const orbit = this.lanes.findIndex(l => l.id === event.laneId);
    const effects = {
      orbit,
      ...(this.genre.fx.delay.sends.includes(event.laneId) ? {
        delay: this.delayParams.wet, delayfeedback: this.delayParams.feedback, delaysync: 3 / 16,
      } : {}),
      ...(this.genre.fx.reverb?.sends.includes(event.laneId) ? {
        room: this.genre.fx.reverb.wet, roomsize: this.genre.fx.reverb.decay,
      } : {}),
    };
    if (event.kind === "bass") {
      this.delay.setTempo(cps * 240, time);
      this.bass?.set({ cutoff: this.bassParams.cutoff * 2 ** ((energy - 0.5) * 2 * (this.genre.bass!.filterSwing ?? 0)) }, time);
      this.bass?.noteOn(time, midiToFrequency(event.midi!), event.accent, event.glide ?? false);
      // A connected note cancels this gate-off at its own onset. If the next query
      // misses its deadline, the fallback gate still prevents a stuck oscillator.
      this.bass?.noteOff(time + duration);
      return;
    }
    if (event.kind === "drum") {
      const sound = state.mode === "samples" ? { s: `sotto_${event.instrument}`, gain: event.instrument === "kick" ? 0.85 : 0.45 }
        : DRUM_SYNTHS[event.instrument!]!;
      await superdough({ attack: 0.001, sustain: 0, release: 0.01, ...sound, ...effects,
        velocity: event.velocity }, time, duration, cps, event.begin);
    } else {
      for (const note of event.notes!) {
        await superdough({ s: "triangle", note, fm: 0.7, fmh: 2, attack: 0.005, decay: 0.35,
          sustain: 0.15, release: 0.15, lpf: 1300 + energy * 2500, gain: 0.2, velocity: event.velocity,
          ...effects }, time, duration, cps, event.begin);
      }
    }
  }

  /** Offline execution uses the same pattern and instrument path, in onset order. */
  async scheduleRender(begin: number, end: number, beforeBar?: (bar: number) => Promise<void>): Promise<void> {
    await this.ready;
    this.bass = createThreeOh(this.ctx, this.bassOutput, this.genre.bass!.wave, this.bassParams);
    const pattern = compositionPattern(this.recipe);
    const cps = this.bpm / 240;
    for (let bar = begin; bar < end; bar++) {
      await beforeBar?.(bar);
      for (const hap of pattern.queryArc(bar, Math.min(end, bar + 1))) {
        if (!hap.hasOnset()) continue;
        await this.play(hap.value, (+hap.whole.begin - begin) / cps, +hap.duration / cps, cps);
      }
    }
    this.bass.noteOff((end - begin) / cps);
  }
}
