import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import { cyrb128, h32 } from "../src/core/rng.ts";
import { referenceBar, type ReferenceEvent } from "./acid-reference-score.ts";
import { studyBar, studySection, type StudyPlan } from "./acid-studies-score.ts";

export type AcidSource = StudyPlan | "reference";
const CURVES: readonly (readonly number[])[] = [
  [.08,.12,.2,.38,.62,.36,.24,.32,.44,.56,.7,.88,1,.84,.5,.18,.08],
  [.1,.3,.48,.64,.35,.2,.3,.48,.65,.85,1,.82,.64,.46,.28,.15,.1],
  [.12,.16,.24,.32,.44,.56,.72,.9,.6,.36,.5,.74,1,.7,.44,.24,.12],
];
const hash = cyrb128("acid-performance/1/filter-gesture")[0];

/** A repeatable knob performance, sampled at each onset. The ladder's own
 * envelope still moves within the note. These are authored audition values,
 * not measured 303 parameters or changes to any production recipe.
 */
function openness(source: AcidSource, bar: number, step: number): number {
  const seed = source === "reference" || source.take === "written" ? 2 : source.seed;
  const curve = CURVES[h32(seed, hash) % CURVES.length]!;
  const local = bar % 16, fraction = step / 16;
  const value = curve[local]! + (curve[local + 1]! - curve[local]!) * fraction;
  if (source === "reference") return value;
  const section = studySection(source, bar);
  if (section.name === "introduce") return .08 + value * .4;
  if (section.name === "space") return .08 + value * .18;
  if (section.name === "build") return .2 + .75 * (section.local + fraction) / section.length;
  if (section.name === "return") return .45 + value * .55;
  return value;
}

/** Keep the complete pitch/onset score. The optional bell alone reserves an
 * answering gap; enabling it must not regenerate the remaining acid or drums.
 * This per-note synth does not implement connected 303 slides.
 */
export function performedBar(source: AcidSource, bar: number, bell = false): ReferenceEvent[] {
  if (bar < 0) return [];
  if (source !== "reference" && source.id !== "pressure") throw new Error("Performance is available for Pressure and Acido sotto casa");
  const baseline = source === "reference" ? referenceBar(bar) : studyBar(source, bar);
  const section = source === "reference" ? undefined : studySection(source, bar);
  // Answer at most once per eight bars. Never fill the deliberate pre-return stop.
  const reply = bell && bar % 8 === 7 && (source === "reference" || section?.name === "groove" || section?.name === "return");
  const acid = baseline.filter(e => e.laneId === "acid");
  const events = baseline.flatMap(event => {
    if (event.laneId !== "acid") return [event];
    const step = (event.begin - bar) * 16;
    if (reply && step >= 8) return [];
    const open = openness(source, bar, step);
    const accent = Number(event.sound.gain) >= .5;
    const next = acid.find(e => e.begin > event.begin)?.begin ?? bar + 1;
    const room = next - event.begin;
    // Accented notes open both envelopes and their gates; quiet notes release
    // sooner. A rest permits a longer note, without shifting the next onset.
    const gate = Math.min(room * .92, (accent ? 1.35 : .62) / 16);
    const gain = Number(event.sound.gain) * (accent ? 1.03 : .94);
    return [{ ...event, end: event.begin + gate, velocity: gain, accent, sound: {
      ...event.sound, gain, orbit: 1, cutoff: 170 + 1530 * open,
      resonance: 7.4 - open * .8, lpenv: 2.8 + open * 1.4 + (accent ? 1 : 0),
      lpdecay: (accent ? .16 : .075) + open * .08,
      decay: accent ? .16 : .09, sustain: accent ? .14 : .055, release: accent ? .065 : .035,
    } }];
  });
  if (reply) {
    // Same FM bell as Afterglow, transposed to E. A fifth and tonic answer in
    // the upper register. Its echo may continue under the following acid phrase.
    for (const [i, step] of [10,14].entries()) {
      const degree = i === 0 ? 10 : 6;
      const midi = 40 + [0,3,5,6,7,10][degree % 6]! + 12 * Math.floor(degree / 6), gain = i === 0 ? .2 : .15;
      events.push({ laneId: "bell", kind: "bass", begin: bar + step / 16, end: bar + (step + 1.5) / 16,
        midi, velocity: gain, accent: false, sound: {
          s: "sine", note: midi, fmi: 1.2, fmh: 2, attack: .002, decay: .32, sustain: 0, release: .18,
          gain, room: .35, delay: .25, delaysync: .1875, delayfeedback: .35, pan: i === 0 ? .35 : .65, orbit: 3,
        } });
    }
  }
  return events.sort((a,b) => a.begin - b.begin || (a.laneId < b.laneId ? -1 : a.laneId > b.laneId ? 1 : 0));
}

export function performedPattern(source: AcidSource, bell = false): Pattern<ReferenceEvent> {
  return new Pattern(({ span }) => {
    const haps: Hap<ReferenceEvent>[] = [];
    for (let bar = Math.max(0, Math.floor(+span.begin)); bar < Math.ceil(+span.end); bar++) {
      for (const event of performedBar(source, bar, bell)) {
        const whole = new TimeSpan(event.begin, event.end), part = whole.intersection(span);
        if (part && +part.end > +part.begin) haps.push(new Hap(whole, part, event));
      }
    }
    return haps;
  });
}
