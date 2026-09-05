import { h32, cyrb128 } from "../core/rng.ts";
import { GENRES } from "../genre/index.ts";
import { FAMILIES, KITS, getPatch, type KitId } from "./catalog.ts";

export type ElectronicGenre = keyof typeof FAMILIES;
export interface Cell { step: number; degree: number; length: number; velocity: number; accent: boolean; slide: boolean; }
export interface Role { id: string; patch: string; register: number; density: number; }
export interface SongPlan {
  study?: true;
  seed: number; genre: ElectronicGenre; family: number; title: string; bpm: number; key: number;
  scale: readonly number[]; swing: number; kit: KitId; groove: number;
  motifBars: number; phraseBars: number; motifs: readonly (readonly Cell[])[];
  roles: readonly Role[]; progression: readonly number[]; chordBars: number;
  tension: number; repetition: number; space: number; drive: number; articulation: number;
}
export interface Section { name: string; start: number; bars: number; energy: number; motif: number; transform: number; }
const key = (s: string) => cyrb128(s)[0];
export const draw = (seed: number, domain: string, index = 0, max = 0x100000000): number => h32(seed, key(domain), index) % max;
const pick = <T>(seed: number, domain: string, xs: readonly T[], index = 0): T => xs[draw(seed, domain, index, xs.length)]!;
export function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

/** Sixteen complete phrase candidates; score relations before choosing among the best four.
 * All decision costs are integers. The weights describe a character, not a universal
 * definition of good melody. Each candidate has its own addressed randomness.
 */
function makeMotif(seed: number, bars: number, which: number, groove: number, tension: number, repetition: number): Cell[] {
  const candidates = Array.from({ length: 16 }, (_, candidate) => {
    const domain = `motif/${which}/${candidate}`;
    const cells: Cell[] = [];
    const length = bars * 16;
    const contour = draw(seed, domain, 0, 4);
    let degree = draw(seed, domain, 1, 5);
    let score = 0;
    for (let step = 0; step < length; step++) {
      // Repeated rhythmic cells make phrases legible; their last bar can answer.
      const local = step % 16;
      const rhythmCell = step < length - 16 ? step % 32 : step;
      const gates = [42, 29, 52, 34, 24, 46, 31, 38];
      const probability = gates[groove]! + (local % 4 === 0 ? 12 : 0);
      if (step && draw(seed, `${domain}/rhythm`, rhythmCell, 100) >= probability) continue;
      const delta = pick(seed, `${domain}/pitch`, [-2, -1, -1, 0, 0, 1, 1, 2, 4], step);
      const previous = degree;
      degree = Math.max(0, Math.min(13, degree + delta));
      const target = contour === 0 ? Math.floor(12 * Math.min(step, length - step) / length) :
        contour === 1 ? Math.floor(8 * step / length) : contour === 2 ? 8 - Math.floor(8 * step / length) : 4;
      score += Math.abs(degree - target) * (2 + tension);
      score += Math.max(0, Math.abs(delta) - 2) * (9 - tension);
      if (degree === previous) score += 8 - repetition;
      if (local % 4 === 0 && degree % 7 !== 0 && degree % 7 !== 2 && degree % 7 !== 4) score += 8 - tension;
      cells.push({ step, degree, length: pick(seed, `${domain}/length`, [1, 1, 2, 3], step),
        velocity: (55 + draw(seed, `${domain}/velocity`, step, 35)) / 100,
        accent: local % 4 === 0 || draw(seed, `${domain}/accent`, step, 5) === 0,
        slide: draw(seed, `${domain}/slide`, step, 7) === 0 });
    }
    score += Math.abs(cells.length - bars * (groove % 3 + 5)) * 12;
    return { cells, score, candidate };
  }).sort((a, b) => a.score - b.score || a.candidate - b.candidate);
  return candidates[draw(seed, `motif/selection/${which}`, 0, 4)]!.cells;
}

/** Identity is independent of mute state, transport, query order and sound loading. */
export function createSongPlan(genre: ElectronicGenre, seed: number): SongPlan {
  const family = draw(seed, "family", 0, 4);
  const f = FAMILIES[genre][family]!;
  const bass = pick(seed, "bass-patch", f.bass);
  const lead = pick(seed, "lead-patch", f.lead);
  const support = pick(seed, "support-patch", f.support);
  const groove = draw(seed, "groove", 0, 8);
  const motifBars = pick(seed, "motif-length", [2, 4, 8]);
  const tension = draw(seed, "tension", 0, 8);
  const repetition = draw(seed, "repetition", 0, 8);
  const roles: Role[] = [
    ...Object.keys(KITS.round).map(id => ({ id, patch: id, register: 0, density: id === "kick" ? 1 : .7 })),
    { id: "bass", patch: bass, register: 24 + draw(seed, "bass-register", 0, 2) * 12, density: .75 },
    { id: "lead", patch: lead, register: 48 + draw(seed, "lead-register", 0, 2) * 12, density: .75 },
    { id: "support", patch: support, register: getPatch(support).role === "chords" ? 48 : 60, density: .65 },
  ];
  if (draw(seed, "roster", 0, 3) !== 0) roles.push({ id: "answer", patch: pick(seed, "answer-patch", ["glass", "reed", "guitar-sample", "bell-sample"]), register: 60, density: .45 });
  const bpm = GENRES[genre]!.clock.bpm;
  return freeze({ seed, genre, family, title: f.name, bpm: bpm.min + draw(seed, "bpm", 0, bpm.max - bpm.min + 1),
    key: draw(seed, "key", 0, 12), scale: pick(seed, "scale", [[0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 9, 10], [0, 1, 3, 5, 7, 8, 10]]),
    swing: genre === "house" ? .54 + draw(seed, "swing", 0, 5) / 100 : genre === "techno" ? .5 + draw(seed, "swing", 0, 3) / 100 : .5,
    kit: pick(seed, "kit", Object.keys(KITS) as KitId[]), groove, motifBars,
    phraseBars: pick(seed, "phrase-length", [8, 16]),
    motifs: [makeMotif(seed, motifBars, 0, groove, tension, repetition), makeMotif(seed, motifBars, 1, groove, tension, repetition)],
    roles, progression: genre === "house" ? pick(seed, "harmony", [[0, 3, 5, 4], [0, 3, 0, 6], [0, 5, 3, 6], [0, 0, 3, 3]]) : [0],
    chordBars: pick(seed, "harmonic-rhythm", [2, 4, 8]), tension, repetition,
    space: 15 + draw(seed, "space", 0, 60), drive: draw(seed, "drive", 0, 40), articulation: draw(seed, "articulation", 0, 8) });
}

const FORMS = [
  [["present", 8], ["develop", 16], ["return", 32], ["contrast", 16], ["build", 8], ["return", 32], ["release", 16]],
  [["present", 16], ["develop", 32], ["contrast", 8], ["build", 16], ["return", 32], ["contrast", 8], ["release", 16]],
  [["present", 8], ["develop", 8], ["contrast", 16], ["return", 32], ["develop", 16], ["contrast", 16], ["return", 32]],
  [["present", 16], ["contrast", 16], ["develop", 16], ["return", 32], ["contrast", 8], ["build", 8], ["return", 32]],
] as const;
const ENERGY: Record<string, number> = { present: .5, develop: .72, return: .9, contrast: .32, build: .7, release: .45 };
export function planChapter(plan: SongPlan, chapter: number): Section[] {
  let start = chapter * 128;
  return pick(plan.seed, "form", FORMS, chapter).map(([name, bars], i) => {
    const section = { name: chapter > 0 && name === "present" ? "reprise" : name, start, bars,
      energy: ENERGY[name]!, motif: name === "contrast" ? 1 : 0,
      transform: name === "present" || name === "return" ? 0 : draw(plan.seed, `transform/${chapter}`, i, 5) };
    start += bars;
    return section;
  });
}
export function sectionFor(plan: SongPlan, bar: number): Section {
  if (plan.study) {
    const index = Math.floor(bar % 32 / 8);
    return { name: ["present", "develop", "contrast", "return"][index]!, start: Math.floor(bar / 8) * 8,
      bars: 8, energy: [.45,.75,.32,.9][index]!, motif: index === 2 ? 1 : 0, transform: index === 1 ? 1 : 0 };
  }
  return planChapter(plan, Math.floor(bar / 128)).find(s => bar < s.start + s.bars)!;
}
export function degreeMidi(plan: SongPlan, degree: number, register: number): number {
  const n = plan.scale.length;
  return register + plan.key + plan.scale[((degree % n) + n) % n]! + 12 * Math.floor(degree / n);
}
