import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import { GENRES } from "../genre/index.ts";
import { energyAt, laneIsIn } from "../arrange/energy.ts";
import { epochAt } from "../arrange/epoch.ts";
import { cyrb128, rngFor, choose, valueAt } from "../core/rng.ts";
import { defaultVoice, realise } from "../pattern/gen.ts";
import { harmonyAt, rootInRange } from "../score.ts";
import { chordAt } from "../harmony/progression.ts";
import { voiceLead } from "../harmony/chords.ts";
import type { Recipe } from "../recipe.ts";
import type { GenreDef } from "../genre/schema.ts";

export const PROFILES = {
  acid: { strategy: "acid", motifBars: 2, phraseBars: 8, mutationBudget: 8, fillLane: "closed hat" },
  techno: { strategy: "minimal", motifBars: 2, phraseBars: 8, mutationBudget: 8, fillLane: "ghost hat" },
  house: { strategy: "vamp", motifBars: 2, phraseBars: 8, mutationBudget: 8, fillLane: "shaker" },
} as const;
export interface LaneControl { density: number; muted: boolean; }
export interface ScoreEvent extends Record<string, unknown> {
  laneId: string; kind: "drum" | "bass" | "chords";
  begin: number; end: number; velocity: number; accent: boolean;
  midi?: number; notes?: number[]; glide?: boolean; slide?: boolean;
  instrument?: string;
}
export interface ScoreLane { id: string; name: string; len: number; density: number; }
export function scoreLanes(g: GenreDef): ScoreLane[] {
  return [...g.drums.map(d => ({ id: d.name, name: d.name, len: d.len ?? 16, density: d.density })),
    { id: "bass", name: g.bass!.name, len: 32, density: g.bass!.density },
    ...(g.chords ? [{ id: "chords", name: "chords", len: 16, density: g.chords.density }] : [])];
}
const voiceKey = (id: string): number => cyrb128(id)[0];
const clamp = (n: number): number => Math.max(0, Math.min(1, n));

/** Relative pitches and eligibility are independent of arrangement and playback order. */
export function motif(r: Recipe, bar: number): { pitch: number; strength: number; accent: boolean; slide: boolean }[] {
  const g = GENRES[r.genre]!;
  const profile = PROFILES[r.genre as keyof typeof PROFILES];
  const length = profile.motifBars * 16;
  const a = g.arrangement;
  const epoch = epochAt(r.seed, bar, { every: a.newPatternEvery, p: a.newPatternP, salt: 0x310 });
  const bag = choose(rngFor(r.seed, epoch, voiceKey("bass"), 1), g.bass!.bags);
  const phrase = Math.floor(bar / profile.phraseBars);
  // A phrase returns to the original motif on alternate repetitions.
  const altered = phrase % 2 === 0 ? new Set<number>() : new Set(
    Array.from({ length }, (_, i) => i).sort((a, b) =>
      valueAt(r.seed, phrase, a, 92) - valueAt(r.seed, phrase, b, 92)).slice(0, profile.mutationBudget));
  return Array.from({ length }, (_, step) => {
    let pitch = choose(rngFor(r.seed, epoch, voiceKey("bass"), 100 + step), bag);
    let strength = valueAt(r.seed, epoch, voiceKey("bass"), 1000 + step);
    let accent = valueAt(r.seed, epoch, voiceKey("bass"), 2000 + step) < g.bass!.accentP;
    const slide = valueAt(r.seed, epoch, voiceKey("bass"), 3000 + step) < g.bass!.slideP;
    if (altered.has(step)) {
      const change = step % 3;
      if (change === 0) pitch += 12;
      if (change === 1) accent = !accent;
      if (change === 2) strength = 0;
    }
    return { pitch, strength, accent, slide };
  });
}

export function composeBar(r: Recipe, bar: number, controls: Readonly<Record<string, LaneControl>> = {}): ScoreEvent[] {
  if (bar < 0) return [];
  const g = GENRES[r.genre]!;
  const profile = PROFILES[r.genre as keyof typeof PROFILES];
  if (!profile) throw new Error("No Strudel profile for this genre");
  const energy = energyAt(g, bar);
  const events: ScoreEvent[] = [];
  const epoch = epochAt(r.seed, bar, { every: g.arrangement.newPatternEvery, p: g.arrangement.newPatternP, salt: 0x311 });
  for (const d of g.drums) {
    const state = controls[d.name] ?? { density: d.density, muted: false };
    if (state.muted || !laneIsIn(energy, d)) continue;
    const len = d.len ?? 16;
    const density = clamp(state.density + (energy - 0.5) * 2 * (d.densitySwing ?? 0));
    const hits = realise(defaultVoice(d.gen, { density, chaos: d.chaos ?? 0,
      ...(d.vel ? { vel: d.vel } : {}), ...(d.accentAt === undefined ? {} : { accentAt: d.accentAt }) }),
      len, r.seed, epoch, voiceKey(d.name), bar);
    for (let step = 0; step < 16; step++) {
      const hit = hits.find(h => h.step === (bar * 16 + step) % len);
      if (!hit) continue;
      const begin = bar + step / 16;
      events.push({ laneId: d.name, kind: "drum", instrument: d.kitVoice, begin, end: begin + 1 / 32,
        velocity: hit.velocity, accent: hit.accent });
      if (d.name === profile.fillLane && bar % profile.phraseBars === profile.phraseBars - 1 && step >= 12 && step % 2 === 0) {
        events.push({ laneId: d.name, kind: "drum", instrument: d.kitVoice,
          begin: begin + 1 / 32, end: begin + 3 / 64, velocity: hit.velocity * 0.65, accent: false });
      }
    }
  }
  const bass = g.bass!;
  const state = controls.bass ?? { density: bass.density, muted: false };
  const harmony = harmonyAt(g, r.seed, bar);
  const chord = harmony ? chordAt(harmony.progression, bar) : null;
  const root = harmony && chord ? rootInRange(harmony.key + chord.root, ...bass.rootRange)
    : bass.rootRange[0] + Math.floor(valueAt(r.seed, 0, voiceKey("key")) * (bass.rootRange[1] - bass.rootRange[0] + 1));
  const cells = motif(r, bar);
  if (!state.muted && state.density > 0 && laneIsIn(energy, bass)) {
    const notes: ScoreEvent[] = [];
    for (let step = 0; step < 16; step++) {
      const cell = cells[(bar % profile.motifBars) * 16 + step]!;
      if (cell.strength === 0 || (profile.strategy === "minimal" && step % 2 === 1)) continue;
      // House bass answers the kick and leaves the chord-stab positions open.
      if (profile.strategy === "vamp" && (step % 4 === 0 || step === 2 || step === 10)) continue;
      const prior = step % 4 === 0 ? 0.3 : step % 2 === 0 ? 0.15 : 0;
      const density = clamp(state.density + (energy - 0.5) * (bass.densitySwing ?? 0));
      if (cell.strength + density + prior <= 1) continue;
      const pitch = profile.strategy === "vamp" && chord
        ? chord.intervals[Math.abs(cell.pitch) % chord.intervals.length]! : cell.pitch;
      notes.push({ laneId: "bass", kind: "bass", begin: bar + step / 16, end: bar + step / 16 + 3 / 64,
        midi: root + pitch, velocity: cell.accent ? 0.9 : 0.65, accent: cell.accent, slide: cell.slide, glide: false });
    }
    if (notes.length === 0 && state.density > 0) notes.push({ laneId: "bass", kind: "bass",
      begin: bar + (profile.strategy === "vamp" ? 3 / 16 : 0), end: bar + (profile.strategy === "vamp" ? 6 / 16 : 3 / 16),
      midi: root, velocity: 0.65, accent: false });
    for (let i = 0; i < notes.length - 1; i++) {
      if (notes[i]!.slide && notes[i + 1]!.begin - notes[i]!.begin <= 2 / 16) {
        notes[i]!.end = notes[i + 1]!.begin;
        notes[i + 1]!.glide = true;
      } else notes[i]!.slide = false;
    }
    if (notes.length) notes[notes.length - 1]!.slide = false;
    events.push(...notes);
  }
  if (g.chords && harmony && chord) {
    const def = g.chords;
    const state = controls.chords ?? { density: def.density, muted: false };
    if (!state.muted && state.density > 0 && laneIsIn(energy, def)) {
      const cycle = harmony.progression.chords.length * harmony.progression.barsPerChord;
      let previous: number[] | null = null;
      for (let b = bar - bar % cycle; b <= bar; b += harmony.progression.barsPerChord) {
        previous = voiceLead(chordAt(harmony.progression, b), harmony.key, previous, ...def.register);
      }
      for (const step of [2, 10]) events.push({ laneId: "chords", kind: "chords", begin: bar + step / 16,
        end: bar + (step + (energy < 0.3 ? 8 : 3)) / 16, notes: previous!, velocity: 0.5, accent: false });
    }
  }
  return events.sort((a, b) => a.begin - b.begin || a.laneId.localeCompare(b.laneId));
}

/** Exact binary subdivisions, including rolls; query clipping never moves the onset. */
export function compositionPattern(r: Recipe, controls: (bar: number) => Readonly<Record<string, LaneControl>> = () => ({}),
  swing: (bar: number) => number = () => GENRES[r.genre]!.clock.swing): Pattern<ScoreEvent> {
  return new Pattern(({ span }) => {
    const out: Hap<ScoreEvent>[] = [];
    for (let bar = Math.max(0, Math.floor(+span.begin) - 1); bar < Math.ceil(+span.end); bar++) {
      for (const e of composeBar(r, bar, controls(bar))) {
        const g = GENRES[r.genre]!;
        const depth = e.kind === "drum" ? g.drums.find(d => d.name === e.laneId)?.swingDepth ?? 0 :
          e.kind === "chords" ? g.chords?.swingDepth ?? 0 : g.bass!.swingDepth ?? 0;
        const step = Math.floor((e.begin - bar) * 16);
        const offset = step % 2 === 1 ? (swing(bar) - 0.5) * depth / 8 : 0;
        const endStep = Math.round((e.end - bar) * 16);
        const endOffset = e.slide ? (endStep % 2 === 1 ? (swing(bar) - 0.5) * depth / 8 : 0) : offset;
        const whole = new TimeSpan(e.begin + offset, e.end + endOffset);
        const part = whole.intersection(span);
        if (part && +part.end > +part.begin) out.push(new Hap(whole, part, e));
      }
    }
    return out.sort((a, b) => +a.whole.begin - +b.whole.begin || a.value.laneId.localeCompare(b.value.laneId));
  });
}
