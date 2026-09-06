import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import { createSongPlan, degreeMidi, draw } from "../src/composer/plan.ts";
import type { ScoreEvent } from "../src/strudel/compose.ts";
import type { AcidChain } from "../src/audio/acid-mono.ts";

export type ReferenceVariant = "original" | "biquad" | "303" | "generated" | "variation";
export const VARIANTS: Record<ReferenceVariant, string> = {
  original: "Original", biquad: "Biquad filter", "303": "Continuous 303 voice",
  generated: "Generated phrase", variation: "Small seeded edits",
};
export const REFERENCE_BPM = 138;
const SCALE = [0, 3, 5, 6, 7, 10];
// Exact score supplied in the conversation, in E minor-blues degree space.
export const PHRASES: readonly (readonly (number | null)[])[] = [
  [0,null,0,6,null,0,1,0,3,null,2,1,0,null,5,6],
  [0,0,null,6,0,null,1,2,null,3,2,1,0,-1,null,6],
  [0,null,6,0,1,null,0,3,2,1,null,6,5,null,1,0],
  [0,6,0,null,3,2,1,0,null,5,6,null,7,6,5,0],
];
export interface ReferenceEvent extends ScoreEvent { sound: Record<string, string | number | number[]>; acidChain?: AcidChain; }

/** Swap two inner notes in each of two bars. Anchors, rests, endings, pitch pool,
 * synth, drums and automation stay fixed. This is an audition of one hypothesis,
 * not a replacement for the production composer or a claim of musical quality.
 */
function variation(seed: number): (number | null)[][] {
  const result = PHRASES.map(bar => [...bar]);
  const first = draw(seed, "reference/first-bar", 0, 4);
  for (const bar of [first, (first + 1 + draw(seed, "reference/other-bar", 0, 3)) % 4]) {
    const notes = result[bar]!;
    const positions = notes.map((degree, step) => ({ degree, step }))
      .filter(({ degree, step }) => degree !== null && step % 4 !== 0 && step < 12)
      .sort((a, b) => draw(seed, `reference/swap/${bar}`, a.step) - draw(seed, `reference/swap/${bar}`, b.step) || a.step - b.step);
    const a = positions[0]!, b = positions.find(item => item.degree !== a.degree)!;
    [notes[a.step], notes[b.step]] = [notes[b.step]!, notes[a.step]!];
  }
  return result;
}

export function referenceBar(bar: number, variant: ReferenceVariant = "original", seed = 1): ReferenceEvent[] {
  if (bar < 0) return [];
  const phrase = variant === "variation" ? variation(seed)[bar % 4]! : PHRASES[bar % 4]!;
  const plan = variant === "generated" ? createSongPlan("acid", seed, 2) : undefined;
  const steps = plan ? plan.motifs[0]!.filter(c => Math.floor(c.step / 16) === bar % 4)
    .map(c => ({ step: c.step % 16, midi: degreeMidi({ ...plan, key: 4 }, c.degree, 36) })) :
    phrase.flatMap((degree, step) => degree === null ? [] : [{ step, midi: 40 + SCALE[((degree % 6) + 6) % 6]! + 12 * Math.floor(degree / 6) }]);
  const events: ReferenceEvent[] = [];
  const add = (laneId: string, step: number, length: number, sound: ReferenceEvent["sound"], midi?: number) => {
    events.push({ laneId, kind: laneId === "acid" ? "bass" : "drum", begin: bar + step / 16, end: bar + (step + length) / 16,
      velocity: 1, accent: false, ...(midi === undefined ? {} : { midi }), sound });
  };
  const quarter = Math.floor(bar / 4) % 4;
  for (const { step, midi } of steps) add("acid", step, 1, {
    s: "sawtooth", note: midi, attack: .002, decay: .14, sustain: .12, release: .06,
    ftype: variant === "biquad" ? "12db" : "ladder", cutoff: [180,350,700,1200][quarter]!, resonance: 7,
    lpenv: [3,4,5,6][quarter]!, lpattack: .001, lpdecay: [.12,.18,.12,.25][bar % 4]!, lpsustain: 0,
    gain: [.55,.35,.4,.65][step % 4]!,
  }, midi);
  for (const step of bar % 16 === 15 ? [0,4] : [0,4,8,12]) add("kick", step, 4, { s: "bd", bank: "RolandTR909", gain: .85 });
  for (const step of [4,12]) add("clap", step, 4, { s: "cp", bank: "RolandTR909", room: .12, gain: [0,.35,.35,.45][quarter]! });
  for (let step = 0; step < 16; step++) add("hat", step, 1, { s: "hh", bank: "RolandTR909", gain: [.18,.08,.12,.08][step % 4]!, pan: .55 });
  for (const step of [2,6,10,14]) add("open", step, 2, { s: "oh", bank: "RolandTR909", gain: [0,0,.22,.28][quarter]!, pan: .45 });
  if (bar % 4 === 3) for (const [step, length] of [[8,4],[12,2],[14,2]]) add("snare", step!, length!, { s: "sd", bank: "RolandTR909", gain: .25, room: .15 });
  return events;
}

export function referencePattern(variant: ReferenceVariant, seed: number): Pattern<ReferenceEvent> {
  const cache = new Map<number, ReferenceEvent[]>();
  return new Pattern(({ span }) => {
    const haps: Hap<ReferenceEvent>[] = [];
    for (let bar = Math.max(0, Math.floor(+span.begin)); bar < Math.ceil(+span.end); bar++) {
      let events = cache.get(bar);
      if (!events) { events = referenceBar(bar, variant, seed); cache.set(bar, events); if (cache.size > 16) cache.delete(cache.keys().next().value!); }
      for (const event of events) {
        const whole = new TimeSpan(event.begin, event.end), part = whole.intersection(span);
        if (part && +part.end > +part.begin) haps.push(new Hap(whole, part, event));
      }
    }
    return haps.sort((a, b) => +a.whole.begin - +b.whole.begin);
  });
}
