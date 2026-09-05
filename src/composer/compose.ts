import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import type { ScoreEvent, LaneControl } from "../strudel/compose.ts";
import { KITS, getPatch, type DrumId } from "./catalog.ts";
import { degreeMidi, draw, sectionFor, type SongPlan } from "./plan.ts";
import { composeAcidBar } from "./acid.ts";

export interface ComposerEvent extends ScoreEvent {
  patchId: string; brightness: number; space: number; pan: number; densityRank: number;
  envelope?: number; decay?: number; expression?: number; room?: number;
}
const HATS = [[2,6,10,14],[0,2,4,6,8,10,12,14],[1,3,6,9,11,14],[2,5,6,10,13,14],
  [2,6,7,10,14],[0,3,6,8,11,14],[2,4,6,10,12,14],[1,2,6,9,10,14]];
const BACKBEATS = [[4,12],[4,12,15],[4,12],[4,11,12],[4,12],[4,12,14],[4,12],[4,10,12]];
const SUPPORT = [[2,10],[3,11],[2,7,14],[6,12],[2,8,11],[3,10,15],[6],[2,9]];

/** Compose all related parts before applying the player's mute/density controls. */
export function composeSongBar(p: SongPlan, bar: number): ComposerEvent[] {
  if (bar < 0) return [];
  if (p.performance) return composeAcidBar(p, bar);
  const section = sectionFor(p, bar);
  const inSection = bar - section.start;
  const last = inSection === section.bars - 1;
  const phrase = Math.floor(bar / p.phraseBars);
  const motifIndex = section.motif;
  const motif = p.motifs[motifIndex]!;
  const localBar = bar % p.motifBars;
  const root = p.progression[Math.floor(bar / p.chordBars) % p.progression.length]!;
  const energy = section.name === "build" ? .35 + .6 * inSection / section.bars : section.energy;
  const events: ComposerEvent[] = [];
  const add = (id: string, patchId: string, step: number, length: number, velocity: number,
    extra: Partial<ComposerEvent> = {}) => {
    if (last && section.name === "build" && step >= 8) return;
    const tonal = !Object.hasOwn(KITS.round, id);
    if (id === "bass" || id === "lead" || id === "answer") length *= .8 + p.articulation / 10;
    const offset = step % 2 === 1 && id !== "kick" && id !== "backbeat" ? (p.swing - .5) / 8 : 0;
    const begin = bar + step / 16 + offset;
    events.push({ laneId: id, patchId, kind: tonal ? id === "bass" ? "bass" : "chords" : "drum",
      begin, end: Math.min(bar + (step + length) / 16 + offset, section.start + section.bars), velocity,
      accent: velocity >= .85, brightness: .55 + energy * .6 + (phrase % 4) * .06,
      space: p.space / 100, pan: id === "bass" || id === "kick" ? 0 : (draw(p.seed, `pan/${id}`, 0, 61) - 30) / 100,
      densityRank: draw(p.seed, `density/${id}`, (bar % 32) * 32 + Math.round(step * 2), 100) / 100, ...extra });
  };
  for (const id of Object.keys(KITS.round) as DrumId[]) {
    if (section.name === "contrast" && (id === "kick" || id === "backbeat" || id === "open")) continue;
    if ((section.name === "present" || section.name === "reprise") && inSection < 4 && (id === "open" || id === "perc")) continue;
    if (section.name === "release" && id === "open") continue;
    const positions = id === "kick" ? [0,4,8,12] : id === "backbeat" ? BACKBEATS[p.groove]! :
      id === "hat" ? HATS[p.groove]! : id === "open" ? p.groove % 2 ? [6,14] : [2,10] :
      Array.from({ length: 16 }, (_, i) => i).filter(i => ((bar * 16 + i + p.groove) % [7,5,12,9][p.groove % 4]!) < (p.groove % 2 + 1));
    for (const step of positions) {
      const vel = id === "kick" ? .92 : id === "backbeat" ? step === 4 || step === 12 ? .78 : .38 :
        .45 + draw(p.seed, `velocity/${id}`, (bar % 2) * 16 + step, 35) / 100;
      add(id, `sample:${KITS[p.kit][id]}`, step, id === "open" ? 3 : .7, vel, { instrument: id });
      if (last && id === "hat" && step >= 12 && section.name !== "contrast")
        add(id, `sample:${KITS[p.kit][id]}`, step + .5, .35, vel * .6, { instrument: id });
    }
  }
  const bassSteps = p.genre === "acid" ? motif.filter(c => Math.floor(c.step / 16) === localBar).map(c => c.step % 16) :
    SUPPORT[(p.groove + 3) % SUPPORT.length]!.filter(step => step % 4 !== 0);
  const supportSteps = SUPPORT[p.groove]!;
  for (const role of p.roles.filter(r => !Object.hasOwn(KITS.round, r.id))) {
    const patch = getPatch(role.patch);
    if (role.id === "bass") {
      if (section.name === "contrast" && p.genre !== "house") continue;
      for (const [index, step] of bassSteps.entries()) {
        const cell = motif.find(c => c.step === localBar * 16 + step);
        const degree = p.genre === "acid" ? cell?.degree ?? 0 : root + (index % 3 === 2 ? 4 : 0);
        add(role.id, role.patch, step, p.genre === "acid" ? cell?.length ?? 1 : 2.5,
          cell?.accent ? .94 : .73, { midi: degreeMidi(p, degree, role.register), slide: p.genre === "acid" && (cell?.slide ?? false) });
      }
    } else if (role.id === "lead" || role.id === "answer") {
      if (role.id === "answer" && (energy < .6 || inSection % 8 < 4)) continue;
      if (role.id === "lead" && p.roles.some(r => r.id === "answer") && inSection % 8 >= 6 && energy > .6) continue;
      if (section.name === "release" && role.id === "lead" && inSection % 4 >= 2) continue;
      const cells = p.motifs[role.id === "answer" ? 1 - motifIndex : motifIndex]!;
      for (const c of cells.filter(c => Math.floor(c.step / 16) === localBar)) {
        let step = c.step % 16;
        if (section.transform === 1) step = (step + 2) % 16;
        if (section.transform === 2 && step >= 8) continue;
        // House lead answers chord stabs; bass and support are generated independently of mute.
        if (p.genre === "house" && supportSteps.includes(step)) continue;
        if (p.genre === "techno" && bassSteps.includes(step) && step % 2 === 0) continue;
        let degree = c.degree + root;
        if (section.transform === 3) degree += 7;
        if (section.transform === 4 && step >= 12) degree = root + 4;
        add(role.id, role.patch, step, Math.min(c.length * (section.name === "contrast" ? 2 : 1), 6), c.velocity,
          { notes: [degreeMidi(p, degree, role.register)] });
      }
    } else if (patch.role === "chords") {
      if (section.name === "present" && inSection < 2) continue;
      // Close inversions keep upper voices near the shared register as roots move.
      const notes = [0,2,4,6].map(d => degreeMidi(p, root + d, role.register));
      while (notes[0]! > role.register + p.key + 6) { notes.unshift(notes.pop()! - 12); }
      for (const step of supportSteps) add(role.id, role.patch, step, section.name === "contrast" ? 7 : 2, .66, { notes });
    } else if (patch.role === "pad") {
      if (bar % 2 === 0 && (energy < .6 || inSection >= 8)) add(role.id, role.patch, 0, 28, .6,
        { notes: [degreeMidi(p, root, role.register), degreeMidi(p, root + 4, role.register)] });
    } else if (bar % 4 === 2) add(role.id, role.patch, 6, 6, .6, { notes: [degreeMidi(p, root, role.register)] });
  }
  if (section.name === "build" && inSection >= section.bars - 4 && !last) {
    add("support", "air", 0, 15, .35 + inSection / section.bars * .4, { notes: [72], brightness: .4 + inSection / section.bars * 1.6 });
  }
  const bass = events.filter(e => e.kind === "bass").sort((a,b) => a.begin - b.begin);
  for (let i = 0; i < bass.length; i++) {
    const current = bass[i]!; const next = bass[i + 1];
    if (current.slide && next && next.begin - current.begin <= 3 / 16) { current.end = next.begin; next.glide = true; }
    else { current.slide = false; if (next) current.end = Math.min(current.end, next.begin); }
  }
  return events.sort((a,b) => a.begin - b.begin || (a.laneId < b.laneId ? -1 : a.laneId > b.laneId ? 1 : 0));
}

export function songPattern(plan: SongPlan, controls: (bar: number) => Readonly<Record<string, LaneControl>> = () => ({}),
  swing: (bar: number) => number = () => plan.swing): Pattern<ComposerEvent> {
  // Bounded cache only stores immutable base scores. Query order never changes decisions.
  const cache = new Map<number, ComposerEvent[]>();
  return new Pattern(({ span }) => {
    const haps: Hap<ComposerEvent>[] = [];
    for (let bar = Math.max(0, Math.floor(+span.begin) - 2); bar < Math.ceil(+span.end); bar++) {
      let base = cache.get(bar);
      if (!base) { base = composeSongBar(plan, bar); cache.set(bar, base); if (cache.size > 16) cache.delete(cache.keys().next().value!); }
      const state = controls(bar);
      for (const event of base) {
        const c = state[event.laneId];
        const density = c?.density ?? plan.roles.find(r => r.id === event.laneId)?.density ?? 1;
        if (c?.muted || density <= 0 || event.densityRank >= Math.min(1, density / .7)) continue;
        const step = Math.floor((event.begin - bar) * 16 + 1e-8);
        const offset = step % 2 && event.laneId !== "kick" && event.laneId !== "backbeat" ? (swing(bar) - plan.swing) / 8 : 0;
        const endStep = Math.floor((event.end - bar) * 16 + 1e-8);
        const endOffset = event.slide ? (endStep % 2 ? (swing(bar) - plan.swing) / 8 : 0) : offset;
        const whole = new TimeSpan(event.begin + offset, event.end + endOffset);
        const part = whole.intersection(span);
        if (part && +part.end > +part.begin) haps.push(new Hap(whole, part, event));
      }
    }
    return haps.sort((a,b) => +a.whole.begin - +b.whole.begin || (a.value.laneId < b.value.laneId ? -1 : a.value.laneId > b.value.laneId ? 1 : 0));
  });
}
