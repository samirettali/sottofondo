import { initAudio, loadBuffer, registerSynthSounds, samples, setAudioContext, setSuperdoughAudioController, superdough } from "superdough";
import { GENRES } from "../genre/index.ts";
import { formatSeed } from "../core/rng.ts";
import { createMaster, tanhCurve } from "../audio/master.ts";
import { createThreeOh, midiToFrequency, type ThreeOh } from "../audio/threeoh.ts";
import { createDelay } from "../audio/fx.ts";
import { StereoOutput } from "../strudel/output.ts";
import { Transport } from "../strudel/transport.ts";
import type { LaneControl } from "../strudel/compose.ts";
import type { Player } from "../player.ts";
import type { Recipe, SoundMode } from "../recipe.ts";
import type { VoiceView } from "../app.ts";
import { getPatch, KITS, type DrumId, type Sound } from "./catalog.ts";
import { createSongPlan, sectionFor, type ElectronicGenre, type SongPlan } from "./plan.ts";
import { composeSongBar, songPattern, type ComposerEvent } from "./compose.ts";

interface Snapshot { bar: number; controls: Record<string, LaneControl>; swing: number; }
export function requiredAssets(plan: SongPlan): string[] {
  return [...new Set([...Object.values(KITS[plan.kit]), ...(plan.performance ? ["elec_hi_snare"] : []), ...plan.roles.filter(r => !Object.hasOwn(KITS.round, r.id))
    .map(r => getPatch(r.patch).asset).filter((a): a is string => !!a)])].sort();
}
/** Typed catalog boundary. Never feed REPL aliases into the low-level synthesis API. */
export function patchSound(id: string, brightness = 1): Sound {
  const patch = getPatch(id);
  return { ...patch.sound, ...(patch.sound.cutoff ? { cutoff: patch.sound.cutoff * brightness } : {}) };
}

export class ComposerPlayer implements Player {
  readonly recipe: Recipe;
  readonly plan: SongPlan;
  readonly genre;
  readonly seed: number;
  readonly master;
  readonly transport: Transport;
  readonly ready: Promise<void>;
  private readonly output;
  private readonly bassBus: GainNode;
  private readonly duck: GainNode;
  private readonly saturation: WaveShaperNode;
  private delay;
  private bass: ThreeOh | null = null;
  private disposed = false;
  private volume = .5;
  private bpm: number;
  private snapshots: Snapshot[];
  private readonly bassParams;
  private readonly delayParams;
  private viewCache: { bar: number; events: ComposerEvent[] } | null = null;
  error: string | null = null;

  constructor(private readonly ctx: BaseAudioContext, recipe: Recipe, plan?: SongPlan) {
    this.recipe = recipe; this.seed = recipe.seed;
    this.plan = plan ?? createSongPlan(recipe.genre as ElectronicGenre, recipe.seed, recipe.genreVersion);
    this.genre = GENRES[recipe.genre]!;
    this.bpm = this.plan.bpm;
    const patch = getPatch(this.plan.roles.find(r => r.id === "bass")!.patch);
    this.bassParams = { cutoff: patch.sound.cutoff ?? 1200, resonance: patch.sound.resonance ?? 1,
      envMod: (patch.sound.lpenv ?? 0) * 1200, decay: patch.sound.decay };
    this.delayParams = { wet: .08 + this.plan.space / 500, feedback: .2 + this.plan.space / 300, noteValue: "3/16" as const, feedbackLowpassHz: 2400 };
    this.master = createMaster(ctx);
    this.output = new StereoOutput(ctx, this.master.input);
    this.bassBus = ctx.createGain(); this.bassBus.connect(this.master.input);
    this.delay = createDelay(ctx, this.bassBus, this.delayParams, this.bpm);
    this.duck = ctx.createGain(); this.duck.connect(this.delay.input);
    this.saturation = ctx.createWaveShaper(); this.saturation.curve = tanhCurve(1 + this.plan.drive / 12);
    this.saturation.connect(this.duck);
    this.snapshots = [{ bar: 0, swing: this.plan.swing,
      controls: Object.fromEntries(this.plan.roles.map(r => [r.id, { density: r.density, muted: false }])) }];
    const pattern = songPattern(this.plan, bar => this.snapshot(bar).controls, bar => this.snapshot(bar).swing);
    this.transport = new Transport(() => ctx.currentTime, this.bpm, pattern,
      async (hap, time, duration, cps) => { await this.play(hap.value as ComposerEvent, time, duration, cps); this.prune(); },
      error => { this.error = String(error); this.stop(); });
    this.ready = this.init();
  }
  private async init(): Promise<void> {
    if (!this.ctx.audioWorklet) throw new Error("AudioWorklet requires HTTPS or localhost. For remote development, use an SSH tunnel.");
    setAudioContext(this.ctx); setSuperdoughAudioController(this.output);
    await initAudio({ maxPolyphony: this.ctx instanceof OfflineAudioContext ? 100000 : 128 });
    registerSynthSounds();
    for (const asset of requiredAssets(this.plan)) {
      if (this.disposed) return;
      const response = await fetch(`/samples/v2/${asset}.json`);
      if (!response.ok) throw new Error(`Could not load ${asset}. Retry to keep this composition's instruments.`);
      const entry = await response.json() as { data: string };
      await loadBuffer(entry.data, this.ctx, `v2_${asset}`);
      await samples({ [`v2_${asset}`]: [entry.data] });
    }
  }
  private snapshot(bar: number): Snapshot {
    for(let i=this.snapshots.length-1;i>=0;i--) if(this.snapshots[i]!.bar<=bar) return this.snapshots[i]!;
    return this.snapshots[0]!;
  }
  private update(change: (snapshot: Snapshot) => void): void {
    const last = this.snapshots.at(-1)!;
    const next = { ...last, bar: this.isRunning ? this.transport.nextBar : 0,
      controls: Object.fromEntries(Object.entries(last.controls).map(([id,c]) => [id, { ...c }])) };
    change(next);
    if (last.bar === next.bar) this.snapshots.pop();
    this.snapshots.push(next); this.prune();
  }
  private prune(): void { while (this.snapshots.length > 2 && this.snapshots[1]!.bar < this.currentBar - 2) this.snapshots.shift(); }
  get isRunning(): boolean { return this.transport.running; }
  get tempo(): number { return this.bpm; }
  get seedLabel(): string { return formatSeed(this.seed); }
  get currentBar(): number { return Math.floor(this.transport.cycle); }
  get currentStep(): number { return Math.floor(this.transport.cycle * 16) % 16; }
  get compositeCycleBars(): number { return this.plan.motifBars; }
  get swingAmount(): number { return this.snapshots.at(-1)!.swing; }
  get scopeSize(): number { return this.master.analyser.fftSize; }
  get synthState() { return { bass: { ...this.bassParams }, chords: null, delay: { ...this.delayParams } }; }
  get identityLabel(): string { return `${this.plan.title} · ${this.plan.kit} kit`; }
  get bassLabel(): string { return getPatch(this.plan.roles.find(r => r.id === "bass")!.patch).label; }
  readScope(data: Float32Array<ArrayBuffer>): void { this.master.analyser.getFloatTimeDomainData(data); }
  sectionAt(bar = this.currentBar) {
    const s = sectionFor(this.plan, bar);
    return { name: s.name, bar: bar - s.start, bars: s.bars, energy: s.energy };
  }
  views(bar = this.currentBar): VoiceView[] {
    if (this.viewCache?.bar !== bar) this.viewCache = { bar, events: composeSongBar(this.plan, bar) };
    const controls = this.snapshot(bar).controls;
    return this.plan.roles.map(r => {
      const c = controls[r.id]!;
      const events = this.viewCache!.events.filter(e => e.laneId === r.id && e.densityRank < Math.min(1,c.density/.7));
      return { name: Object.hasOwn(KITS.round,r.id) ? r.id : `${r.id}: ${getPatch(r.patch).label}`, len: 16,
        density: c.density, userMuted: c.muted, autoMuted: events.length === 0,
        steps: Array.from({ length: 16 }, (_,i) => Math.max(0,...events.filter(e => Math.floor((e.begin-bar)*16) === i).map(e => e.velocity))) };
    });
  }
  private createBass(): void {
    const patch = getPatch(this.plan.roles.find(r => r.id === "bass")!.patch);
    if (patch.source === "303") this.bass = createThreeOh(this.ctx, this.saturation, patch.sound.s as OscillatorType, this.bassParams);
  }
  start(): void {
    if (this.disposed || this.isRunning) return;
    this.error = null;
    this.snapshots = [{ ...this.snapshots.at(-1)!, bar: 0 }];
    this.delay.dispose(); this.duck.disconnect();
    this.delay = createDelay(this.ctx, this.bassBus, this.delayParams, this.bpm); this.duck.connect(this.delay.input);
    this.duck.gain.value = 1;
    this.createBass(); this.master.setVolume(this.volume);
    this.transport.setBpm(this.bpm); this.transport.start();
  }
  stop(): void {
    this.transport.stop(); this.master.setVolume(0);
    this.bass?.dispose(); this.bass = null; this.delay.dispose(); this.output.reset();
  }
  dispose(): void {
    this.disposed = true; this.stop(); this.output.dispose(); this.master.dispose();
    this.bassBus.disconnect(); this.duck.disconnect(); this.saturation.disconnect();
  }
  setBpm(value: number): void { this.bpm = value; this.transport.setBpm(value); }
  setSwing(value: number): void { this.update(s => { s.swing = value; }); }
  setVolume(value: number): void { this.volume = value; if(this.isRunning) this.master.setVolume(value); }
  setDensity(index: number, value: number): void { const role=this.plan.roles[index]; if(role) this.update(s=>{s.controls[role.id]!.density=value;}); }
  setUserMute(index: number, muted: boolean): void {
    const role = this.plan.roles[index]; if(!role) return;
    this.snapshots.forEach(s=>{s.controls[role.id]!.muted=muted;});
    if(role.id === "bass") this.bassBus.gain.setTargetAtTime(muted?0:1,this.ctx.currentTime,.005);
    const orbit=this.output.nodes[String(index)];
    if(orbit) orbit.output.gain.setTargetAtTime(muted?0:1,this.ctx.currentTime,.005);
  }
  setBassParam(name: "cutoff"|"resonance"|"envMod"|"decay", value: number): void { this.bassParams[name]=value; this.bass?.set({[name]:value}); }
  setDelayParam(name: "wet"|"feedback", value: number): void { this.delayParams[name]=value; this.delay.set({[name]:value}); }
  async setSoundMode(mode: SoundMode): Promise<void> { if(mode!=="auto") throw new Error("This composition chooses its own palette."); }
  async play(event: ComposerEvent, time: number, duration: number, cps: number): Promise<void> {
    if(this.disposed || this.snapshot(Math.floor(event.begin)).controls[event.laneId]?.muted) return;
    const orbit = this.plan.roles.findIndex(r=>r.id===event.laneId);
    if(event.laneId === "kick") {
      const targets = this.plan.roles.map((r,i)=>r.id==="support" || r.id==="lead" || r.id==="bass" ? i : -1).filter(i=>i>=0);
      this.output.duck(targets,time,.01,.15,this.plan.genre==="house"?.4:.18);
      this.duck.gain.cancelScheduledValues(time); this.duck.gain.setValueAtTime(.7,time); this.duck.gain.linearRampToValueAtTime(1,time+.13);
    }
    if(event.kind === "bass" && this.bass) {
      this.delay.setTempo(cps*240,time);
      this.bass.set({ ...this.bassParams, cutoff: this.bassParams.cutoff * event.brightness,
        envMod: this.bassParams.envMod * (event.envelope ?? 1), decay: this.bassParams.decay * (event.decay ?? 1) },time);
      this.bass.noteOn(time,midiToFrequency(event.midi!),event.accent,event.glide??false,event.expression??1);
      this.bass.noteOff(time+duration); return;
    }
    const drum = event.patchId.startsWith("sample:");
    const patch = drum ? null : getPatch(event.patchId);
    const s = drum ? { s:`v2_${event.patchId.slice(7)}`, gain:event.laneId==="kick"?.85:.42,
      attack:.001,decay:.2,sustain:0,release:.04 } : patchSound(event.patchId,event.brightness);
    const sound = { ...s, ...(event.kind==="bass" ? { cutoff:this.bassParams.cutoff*event.brightness, resonance:this.bassParams.resonance,
      lpenv:this.bassParams.envMod/1200*(event.envelope??1), lpdecay:this.bassParams.decay*(event.decay??1), decay:this.bassParams.decay*(event.decay??1) } : {}) };
    const notes = event.notes ?? [event.midi ?? 60];
    for(const note of notes) {
      // Unpitched samples play at their recorded speed; Superdough's sample root is MIDI 36.
      await superdough({ ...sound, orbit, note: drum || (patch?.asset && patch.rootMidi === undefined) ? 36 : note,
        velocity:event.velocity, pan:.5+event.pan,
        ...(patch?.rootMidi === undefined ? {} : { speed:2**((36-patch.rootMidi)/12) }),
        ...(event.room === undefined ? {} : { room:event.room, roomsize:1.2 }),
        ...(drum || event.kind==="bass" ? {} : { delay:this.delayParams.wet, delayfeedback:this.delayParams.feedback,
          delaysync:3/16, room:event.space*.45, roomsize:1+event.space*2 }),
      },time,duration,cps,event.begin);
    }
  }
  async scheduleRender(begin: number,end: number,beforeBar?: (bar:number)=>Promise<void>): Promise<void> {
    await this.ready; this.createBass();
    const pattern=songPattern(this.plan); const cps=this.bpm/240;
    for(let bar=begin;bar<end;bar++) { await beforeBar?.(bar);
      for(const hap of pattern.queryArc(bar,bar+1)) if(hap.hasOnset()) await this.play(hap.value,(+hap.whole.begin-begin)/cps,+hap.duration/cps,cps);
    }
    this.bass?.noteOff((end-begin)/cps);
  }
}
