import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import { createComposition, semitone, TICKS, type Composition, type Part } from "../src/composer/procedural.ts";
import { createSongPlan } from "../src/composer/plan.ts";
import { composeSongBar } from "../src/composer/compose.ts";
import { KITS } from "../src/composer/catalog.ts";
import type { ReferenceEvent } from "./acid-reference-score.ts";
import type { AuditionScore } from "./acid-reference-player.ts";

export type Take = "new" | "previous";
export const PARTS: readonly Part[] = ["acid", "kick", "clap", "hat", "open", "perc", "answer", "sub"];
export interface Audition extends AuditionScore {
  composition: Composition; take: Take; fixed: boolean; events: readonly (readonly ReferenceEvent[])[];
}
const DRUMS = { kick: "bd", clap: "cp", hat: "hh", open: "oh", perc: "perc" } as const;

/** One instrument/mix adapter for both composition algorithms. Fixed mode also
 * fixes key, tempo, waveform, drum kit and synth settings across seeds. */
function sound(composition: Composition, part: Part, bar: number, tick: number, velocity: number, fixed: boolean): ReferenceEvent["sound"] {
  const id = composition.identity;
  if (Object.hasOwn(DRUMS, part)) {
    const gain = part === "kick" ? .85 : part === "clap" ? .38 : part === "open" ? .2 : part === "hat" ? .19 : .16;
    return { s: DRUMS[part as keyof typeof DRUMS], bank: "Local", gain: gain * velocity / 100,
      pan: part === "hat" ? .55 : part === "open" ? .45 : .5, orbit: 0,
      ...(part === "clap" ? { room: .12 } : {}) };
  }
  const accent = velocity >= 85;
  if (part === "acid") {
    const section = composition.sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
    const clock = (bar + tick / TICKS) / (fixed ? 4 : id.filterBars);
    const knot = Math.floor(clock) % 4, phase = clock % 1;
    const curve = fixed ? [10, 30, 60, 90] : id.openness;
    const motion = (curve[knot]! * (1 - phase) + curve[(knot + 1) % 4]! * phase) / 100;
    const energy = section.name === "Space" ? .25 : section.name === "Opening" ? .5 : section.name === "Build" ?
      .35 + .65 * (bar - section.start) / section.bars : section.name === "Return" ? 1 : .8;
    const open = .65 * motion + .35 * energy;
    return { s: fixed ? "sawtooth" : id.wave, orbit: 1,
      attack: .002, decay: accent ? .16 : .1, sustain: accent ? .14 : .07, release: .045,
      ftype: "ladder", cutoff: 170 + open * 1500, resonance: 7,
      lpenv: 2.8 + open * 1.5 + (accent ? .8 : 0), lpattack: .001,
      lpdecay: (accent ? .16 : .075) + open * .07, lpsustain: 0, gain: .58 * velocity / 100 };
  }
  if (part === "sub") return { s: "sine", orbit: 2, gain: .36 * velocity / 100, attack: .005, decay: .15, sustain: .1, release: .04 };
  const voice = fixed ? "bell" : id.answer;
  const common = { orbit: 3, gain: .2 * velocity / 100, attack: .003, sustain: 0, release: .08,
    room: .22, delay: .12, delaysync: .1875, delayfeedback: .2, pan: .62 };
  return voice === "bell" ? { ...common, s: "sine", fmi: 1.2, fmh: 2, decay: .26 } :
    voice === "pluck" ? { ...common, s: "triangle", fmi: .6, fmh: 2, decay: .16, cutoff: 2200 } :
      { ...common, s: "sine", fmi: 1.6, fmh: 1, fmdecay: .12, fmsustain: 0, decay: .3 };
}

export function createAudition(seed: number, take: Take = "new", fixed = false, muted: ReadonlySet<string> = new Set()): Audition {
  const composition = createComposition(seed), id = composition.identity;
  const kit = KITS[fixed ? "hard" : id.kit];
  const localSamples = { bd: kit.kick, cp: kit.backbeat, hh: kit.hat, oh: kit.open, perc: kit.perc };
  const bpm = fixed ? 138 : id.bpm, key = fixed ? 4 : id.key;
  const register = id.sub ? 48 : 36;
  const event = (part: Part, bar: number, tick: number, gate: number, velocity: number, midi?: number): ReferenceEvent => ({
    laneId: part, kind: Object.hasOwn(DRUMS, part) ? "drum" : "bass",
    begin: bar + tick / TICKS, end: bar + (tick + gate) / TICKS,
    velocity: velocity / 100, accent: velocity >= 85,
    ...(midi === undefined ? {} : { midi }),
    sound: { ...sound(composition, part, bar, tick, velocity, fixed), ...(midi === undefined ? {} : { note: midi }) },
  });
  const old = take === "previous" ? createSongPlan("acid", seed, 2) : undefined;
  const events = composition.bars.map((notes, bar) => {
    if (!old) return notes.map(n => event(n.part, bar, n.tick, n.gate, n.velocity,
      Object.hasOwn(DRUMS, n.part) ? undefined : (n.part === "acid" ? register : n.part === "sub" ? 24 : 60) + key + semitone(id.scale, n.degree)));
    const mapping: Record<string, Part> = { bass: "acid", lead: "answer", support: "answer", answer: "answer", kick: "kick", backbeat: "clap", hat: "hat", open: "open", perc: "perc" };
    return composeSongBar(old, bar).flatMap(n => {
      const part = mapping[n.laneId];
      if (!part) throw new Error(`Unsupported previous part: ${n.laneId}`);
      const tick = (n.begin - bar) * TICKS, gate = (n.end - n.begin) * TICKS;
      const pitches = n.kind === "drum" ? [undefined] : n.notes ?? [n.midi];
      return pitches.map(p => event(part, bar, tick, gate, n.velocity * 100,
        p === undefined ? undefined : p - old.key + key + (part === "acid" ? register - 36 : 0)));
    });
  });
  const pattern = new Pattern<ReferenceEvent>(({ span }) => {
    const haps: Hap<ReferenceEvent>[] = [];
    // The previous generator can sustain notes across bar boundaries.
    for (let bar = Math.max(0, Math.floor(+span.begin) - 2); bar < Math.ceil(+span.end); bar++) {
      for (const stored of events[bar % 32]!) {
        if (muted.has(stored.laneId)) continue;
        const offset = bar - bar % 32;
        const value = { ...stored, begin: stored.begin + offset, end: stored.end + offset };
        const whole = new TimeSpan(value.begin, value.end), part = whole.intersection(span);
        if (part && +part.end > +part.begin) haps.push(new Hap(whole, part, value));
      }
    }
    return haps.sort((a, b) => +a.whole.begin - +b.whole.begin || (a.value.laneId < b.value.laneId ? -1 : a.value.laneId > b.value.laneId ? 1 : 0));
  });
  return { composition, take, fixed, events, bpm, pattern, localSamples };
}
