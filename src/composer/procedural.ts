import { cyrb128, h32 } from "../core/rng.ts";

// A preview version, independent of the frozen production recipe revisions.
export const PROCEDURAL_VERSION = "relational-1";
export const AUDITION_SEEDS = [1, 2, 3, 4, 5, 6] as const;
export const TICKS = 32;
export type Part = "acid" | "kick" | "clap" | "hat" | "open" | "perc" | "answer" | "sub" | "arp" | "pad";
export interface Note { tick: number; gate: number; degree: number; velocity: number; }
export interface Hit extends Note { part: Part; }
export interface Identity {
  seed: number; bpm: number; key: number; scale: readonly number[]; mode: string;
  motifBars: number; density: number; cell: number; syncopation: number;
  relation: "reinforce" | "interlock"; contour: readonly number[];
  repeat: number; leap: number; freedom: number; sub: boolean;
  wave: "sawtooth" | "square"; kit: "hard" | "dry" | "round";
  answer: "bell" | "pluck" | "keys"; openness: readonly number[]; filterBars: number;
}
export interface Section { name: "Opening" | "Drive" | "Space" | "Build" | "Return"; start: number; bars: number; }
export interface Composition {
  version: typeof PROCEDURAL_VERSION; identity: Identity; sections: readonly Section[];
  motifs: readonly (readonly Note[])[]; bars: readonly (readonly Hit[])[];
}
const domain = new Map<string, number>();
function draw(seed: number, name: string, index: number, max: number): number {
  let hash = domain.get(name);
  if (hash === undefined) { hash = cyrb128(`${PROCEDURAL_VERSION}/${name}`)[0]; domain.set(name, hash); }
  return h32(seed, hash, index) % max;
}
const pick = <T>(seed: number, name: string, values: readonly T[], index = 0): T => values[draw(seed, name, index, values.length)]!;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const MODES = [
  { name: "Minor pentatonic", scale: [0, 3, 5, 7, 10] },
  { name: "Dorian", scale: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Phrygian", scale: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Minor", scale: [0, 2, 3, 5, 7, 8, 10] },
] as const;
export function semitone(scale: readonly number[], degree: number): number {
  return scale[((degree % scale.length) + scale.length) % scale.length]! + 12 * Math.floor(degree / scale.length);
}
/** A conservative vertical vocabulary for sustained supporting notes. Passing
 * acid notes are free to use the other scale degrees while those voices rest. */
export function consonant(scale: readonly number[], a: number, b: number): boolean {
  return [0, 3, 4, 5, 7, 8, 9].includes(((semitone(scale, a) - semitone(scale, b)) % 12 + 12) % 12);
}
export function overlaps(a: Note, b: Note): boolean {
  return a.tick < b.tick + b.gate && b.tick < a.tick + a.gate;
}
function identity(seed: number): Identity {
  const mode = pick(seed, "mode", MODES), density = 6 + draw(seed, "density", 0, 8);
  return {
    seed, bpm: 128 + draw(seed, "tempo", 0, 19), key: draw(seed, "key", 0, 12),
    scale: mode.scale, mode: mode.name, motifBars: pick(seed, "motif-length", [1, 2, 4]),
    density, cell: pick(seed, "rhythmic-cell", [8, 16, 32]), syncopation: draw(seed, "syncopation", 0, 81),
    relation: pick(seed, "rhythmic-relation", ["reinforce", "interlock"]),
    contour: Array.from({ length: 4 }, (_, i) => draw(seed, "contour", i, mode.scale.length + 1)),
    repeat: draw(seed, "repeat", 0, 7), leap: 1 + draw(seed, "leap", 0, 4),
    freedom: 6 + draw(seed, "freedom", 0, 15), sub: density < 10 && draw(seed, "sub", 0, 3) !== 0,
    wave: pick(seed, "wave", ["sawtooth", "square"]), kit: pick(seed, "kit", ["hard", "dry", "round"]),
    answer: density > 10 ? "bell" : pick(seed, "answer", ["bell", "pluck", "keys"]),
    openness: Array.from({ length: 4 }, (_, i) => 10 + draw(seed, "filter-knots", i, 81)),
    filterBars: pick(seed, "filter-period", [3, 5, 8]),
  };
}

function rhythm(id: Identity): Note[] {
  const notes: Note[] = [], length = id.motifBars * TICKS;
  // Repeated *generated* cells establish a rhythm. Each bar keeps their emphasis
  // but gets a different ending and a deliberate space for a supporting voice.
  for (let bar = 0; bar < id.motifBars; bar++) {
    const gap = 8 + draw(id.seed, "answer-gap", bar, 10) * 2;
    const positions = Array.from({ length: 16 }, (_, i) => i * 2).filter(t => t !== gap && t !== gap + 2);
    const priority = (t: number) => {
      const emphasis = t % 8 === 0 ? 80 - id.syncopation : t % 4 === 2 ? id.syncopation : 20;
      return emphasis + draw(id.seed, "rhythm-cell", t % id.cell, 90)
        + (t >= 24 ? draw(id.seed, "rhythm-ending", bar * 32 + t, 35) : 0);
    };
    positions.sort((a, b) => priority(b) - priority(a) || a - b);
    const chosen = new Set([0, ...positions.slice(0, id.density - 1)]);
    for (const t of [...chosen].sort((a, b) => a - b)) {
      const onKick = t % 8 === 0;
      const accent = id.relation === "reinforce" ? onKick : t % 8 === 4 || t % 8 === 6;
      const velocity = accent ? 88 + draw(id.seed, "accent", t % id.cell, 13) : 46 + draw(id.seed, "velocity", t % id.cell, 23);
      notes.push({ tick: bar * TICKS + t, gate: 1, degree: 0, velocity });
    }
  }
  return articulate(id, notes, length);
}
function articulate(id: Identity, notes: readonly Note[], length: number): Note[] {
  return notes.map((n, i) => {
    const available = Math.min(TICKS - n.tick % TICKS, (notes[i + 1]?.tick ?? length) - n.tick);
    // The final tick of a gap remains free for the answer and the acid release.
    const desired = n.velocity >= 85 ? (id.density < 10 ? 4 : 2) : 1;
    return { ...n, gate: Math.max(1, Math.min(available - 1, desired)) };
  });
}

/** Backward costs include the closing constraint before the first pitch is
 * sampled. Each draw chooses an acceptable continuation with a known completion;
 * this is bounded cost-guided sampling, not exact Markov inference. */
function pitches(id: Identity, timing: readonly Note[], variant: number, source?: readonly Note[]): Note[] {
  const n = id.scale.length, states = Array.from({ length: n * 2 }, (_, i) => i);
  const count = timing.length, length = id.motifBars * TICKS;
  const close = variant === 1 ? id.scale.indexOf(7) : 0;
  const cost = (i: number, pitch: number): number => {
    if (i === 0 && pitch !== (source?.at(-1)?.degree ?? 0)) return Infinity;
    if (i === count - 1 && pitch % n !== close) return Infinity;
    const note = timing[i]!, pc = id.scale[pitch % n]!;
    const strong = note.velocity >= 85 || note.gate >= 3;
    const knot = Math.min(3, Math.floor(note.tick * 4 / length));
    const target = variant === 1 ? n - id.contour[knot]! : id.contour[knot]!;
    const familiar = source?.find(s => s.tick === note.tick)?.degree;
    return Math.abs(pitch - target) * 2 + ([0, 3, 7].includes(pc) ? 0 : strong ? 10 : 1)
      + (familiar === undefined ? 0 : Math.abs(pitch - familiar) * 2);
  };
  const transition = (a: number, b: number): number => {
    const distance = Math.abs(semitone(id.scale, a) - semitone(id.scale, b));
    return distance > 12 ? Infinity : distance === 0 ? id.repeat : distance === 12 ? 4 + id.leap :
      Math.max(0, distance - 3) * id.leap + (distance === 6 ? 14 : 0);
  };
  const future: number[][] = Array.from({ length: count }, () => []);
  for (let i = count - 1; i >= 0; i--) {
    for (const pitch of states) future[i]![pitch] = cost(i, pitch) + (i === count - 1 ? 0 :
      Math.min(...states.map(next => transition(pitch, next) + future[i + 1]![next]!)));
  }
  const result: Note[] = [];
  for (let i = 0; i < count; i++) {
    const previous = result.at(-1)?.degree;
    const costs = states.map(p => future[i]![p]! + (previous === undefined ? 0 : transition(previous, p)));
    const best = Math.min(...costs);
    if (!Number.isFinite(best)) throw new Error("No admissible melodic continuation");
    const choices = states.filter(p => costs[p]! <= best + id.freedom);
    const weights = choices.map(p => 1 + id.freedom - (costs[p]! - best));
    let ticket = draw(id.seed, `pitch/${variant}`, i, weights.reduce((a, b) => a + b, 0));
    let degree = choices[0]!;
    for (let j = 0; j < choices.length; j++) { ticket -= weights[j]!; if (ticket < 0) { degree = choices[j]!; break; } }
    result.push({ ...timing[i]!, degree });
  }
  return result;
}

function form(id: Identity): Section[] {
  const drive = 2 + draw(id.seed, "drive-length", 0, 2), space = 1 + draw(id.seed, "space-length", 0, 2);
  const sizes = [1, drive, space, 1, 8 - 1 - drive - space - 1];
  // Eight four-bar blocks, with a guaranteed return. Longer earlier sections
  // leave fewer blocks for the return instead of stretching the preview.
  let start = 0;
  return (["Opening", "Drive", "Space", "Build", "Return"] as const).map((name, i) => {
    const section = { name, start, bars: sizes[i]! * 4 }; start += section.bars; return section;
  });
}

export function composeAccompaniment(id: Identity, acid: readonly Note[], bar: number, section: Section): Hit[] {
  const hits: Hit[] = acid.map(n => ({ ...n, part: "acid" }));
  const local = bar - section.start, last = local === section.bars - 1;
  const cutoff = section.name === "Build" && last ? 16 : TICKS;
  const add = (part: Part, tick: number, gate: number, velocity: number, degree = 0) => {
    if (tick < cutoff) hits.push({ part, tick, gate: Math.min(gate, cutoff - tick), velocity, degree });
  };
  const phase = bar % id.motifBars;
  const acidAt = (tick: number) => acid.find(n => n.tick === tick);
  const kickTicks = section.name === "Space" ? (local === 0 ? [0] : []) : [0, 8, 16, 24];
  for (const tick of kickTicks) add("kick", tick, 4, 95);
  if (section.name !== "Space" && !(section.name === "Opening" && local < 2)) {
    for (const tick of [8, 24]) add("clap", tick, 3, 64 + (acidAt(tick)?.velocity ?? 50) / 5);
  }
  // Hats answer acid accents; a closed and open hat never strike together.
  for (let tick = 0; tick < cutoff; tick += 2) {
    const note = acidAt(tick), beat = tick % 8;
    const open = beat === 4 && !note && section.name !== "Opening" && section.name !== "Space";
    if (open) add("open", tick, 3, 60);
    else if (tick % 4 === 0 || (id.density < 10 ? !note : note && note.velocity < 85)) {
      const v = (beat === 4 ? 56 : 30) + draw(id.seed, "hat-velocity", phase * 32 + tick, 18);
      if (section.name !== "Space" || tick % 8 === 4) add("hat", tick, 1, v);
    }
  }
  const gaps = Array.from({ length: 14 }, (_, i) => 2 + i * 2).filter(tick => !acid.some(n => overlaps(n, { tick: tick - 1, gate: 4, degree: 0, velocity: 0 })));
  const positions = gaps.sort((a, b) => draw(id.seed, "answer-position", phase * 32 + a, 1000) -
    draw(id.seed, "answer-position", phase * 32 + b, 1000) || a - b);
  const supporting: Note[] = [];
  if (id.sub && section.name !== "Space") {
    for (const tick of kickTicks.filter(t => t % 16 === 0)) {
      const gate = 5;
      const choices = [0, id.scale.indexOf(7)].filter(degree => acid.every(n => !overlaps(n, { tick, gate, degree, velocity: 0 }) || consonant(id.scale, degree, n.degree)));
      if (choices.length) {
        const degree = choices[draw(id.seed, "sub-note", phase * 32 + tick, choices.length)]!;
        add("sub", tick, gate, 66, degree); supporting.push({ tick, gate: gate + 1, degree, velocity: 66 });
      }
    }
  }
  if (section.name !== "Opening" || local >= 2) {
    const limit = section.name === "Space" ? 3 : id.density > 10 ? 1 : 2;
    for (const tick of positions.slice(0, limit).sort((a, b) => a - b)) {
      const gate = 2;
      // Reserve two extra ticks for the reply's release (.08 s at up to 146 BPM).
      if (supporting.some(n => overlaps(n, { tick, gate: gate + 2, degree: 0, velocity: 0 }))) continue;
      const prior = [...acid].reverse().find(n => n.tick < tick)?.degree ?? 0;
      const candidates = [0, id.scale.indexOf(3), id.scale.indexOf(7), id.scale.length]
        .filter(d => d >= 0 && consonant(id.scale, d, prior))
        .sort((a, b) => Math.abs(a - prior % id.scale.length) - Math.abs(b - prior % id.scale.length) || a - b);
      const degree = candidates[draw(id.seed, "answer-note", phase * 32 + tick, Math.min(2, candidates.length))] ?? 0;
      add("answer", tick, gate, 65, degree);
      supporting.push({ tick, gate: gate + 2, degree, velocity: 65 });
    }
  }
  if (section.name === "Drive" || section.name === "Return") {
    for (const tick of gaps.slice(-2)) if (!supporting.some(n => overlaps(n, { tick, gate: 1, degree: 0, velocity: 0 }))) add("perc", tick, 1, 42);
  }
  if (last && section.name !== "Opening" && section.name !== "Space") {
    const from = cutoff - 8, hitsInEnding = acid.filter(n => n.tick >= from && n.tick < cutoff).map(n => n.tick);
    for (const tick of [...new Set([...hitsInEnding, cutoff - 2])]) {
      if (!hits.some(n => n.part === "clap" && n.tick === tick)) add("clap", tick, 1, 35 + (tick - from) * 5);
    }
  }
  return hits.filter(n => n.tick < cutoff).map(n => ({ ...n, gate: Math.min(n.gate, cutoff - n.tick) }))
    .sort((a, b) => a.tick - b.tick || (a.part < b.part ? -1 : a.part > b.part ? 1 : 0));
}

export function createComposition(seed: number): Composition {
  const id = identity(seed >>> 0), timing = rhythm(id), call = pitches(id, timing, 0);
  // An answer retains generated rhythmic cells but displaces its ending. Its
  // first pitch is constrained by the call's cadence; the rest is solved afresh.
  const replyTiming = timing.map(n => ({ ...n, tick: n.tick % TICKS >= 24 ?
    Math.floor(n.tick / TICKS) * TICKS + 24 + (n.tick % 8 + 2) % 8 : n.tick }))
    .sort((a, b) => a.tick - b.tick);
  const reply = pitches(id, articulate(id, replyTiming, id.motifBars * TICKS), 1, call);
  const sparse = articulate(id, call.filter((n, i) => n.velocity >= 85 || i % 3 === 0), id.motifBars * TICKS);
  const lift = call.map(n => ({ ...n, degree: n.velocity >= 85 ? n.degree % id.scale.length + id.scale.length : n.degree }));
  const motifs = [call, reply, sparse, lift], sections = form(id);
  const bars = Array.from({ length: 32 }, (_, bar) => {
    const section = sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
    const cycle = Math.floor((bar - section.start) / id.motifBars);
    const index = section.name === "Space" ? 2 : section.name === "Return" && cycle % 2 ? 3 :
      section.name !== "Opening" && cycle % 3 === 2 ? 1 : 0;
    let acid = motifs[index]!.filter(n => Math.floor(n.tick / TICKS) === bar % id.motifBars)
      .map(n => ({ ...n, tick: n.tick % TICKS }));
    if (section.name === "Opening" && bar < 2) acid = acid.filter(n => n.tick < 24);
    return composeAccompaniment(id, acid, bar, section);
  });
  return freeze({ version: PROCEDURAL_VERSION, identity: id, sections, motifs, bars });
}
