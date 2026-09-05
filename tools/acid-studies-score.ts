import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import { cyrb128, h32 } from "../src/core/rng.ts";
import type { ReferenceEvent } from "./acid-reference-score.ts";

export type StudyId = "pressure" | "crosscurrent" | "afterglow";
export type StudyTake = "written" | "generated";
type Sound = ReferenceEvent["sound"];
export interface Note { step: number; degree: number; length: number; gain: number; }
interface Vocabulary { calls: readonly string[]; replies: readonly string[]; endings: readonly string[]; }
interface Study {
  title: string; description: string; bpm: number; root: number;
  voice: Sound; cutoff: readonly number[]; decay: readonly number[];
  vocabulary: Vocabulary;
}

// Authored two-beat gestures. A token is a scale degree, ! is an accent, _ holds
// the preceding note, and ~ is silence. Each blue note leads directly to the fifth.
// The vocabulary and all new sound values are composition choices, not edits to
// the sourced legacy presets. Degrees use [0, 3, 5, 6, 7, 10] throughout.
export const STUDIES: Record<StudyId, Study> = {
  pressure: {
    title: "Pressure", description: "A driving sawtooth riff, octave replies and a rising filter over straight sixteenths.",
    bpm: 138, root: 40,
    voice: { s: "sawtooth", attack: .002, decay: .14, sustain: .12, release: .06,
      ftype: "ladder", resonance: 7, lpenv: 4, lpattack: .001, lpsustain: 0 },
    cutoff: [180, 340, 700, 1200], decay: [.12, .18, .12, .25],
    vocabulary: {
      calls: ["0! ~ 0 6! ~ 0 1 0", "0! 0 ~ 6! 0 ~ 1 2", "0! ~ 6! 0 1 ~ 0 0", "0! 6! 0 ~ 0 1 2 0"],
      replies: ["3 4! 2 1 0 ~ 5 6!", "4! ~ 2 1 0 ~ 5 6!", "0 ~ 1 2 4! 2 1 0", "6! 5 4 2 1 ~ 0 0!"],
      endings: ["4! 2 1 0 ~ 5 6 0!", "6! ~ 7 6 5 4 1 0!", "3 4! 2 ~ 1 0 ~ 0!", "4! ~ 6 5 4 2 1 0!"],
    },
  },
  crosscurrent: {
    title: "Crosscurrent", description: "Short square-wave calls, displaced answers and a broken kick pattern. The gaps carry the groove.",
    bpm: 132, root: 38,
    voice: { s: "square", attack: .003, decay: .085, sustain: .04, release: .035,
      ftype: "ladder", resonance: 5, lpenv: 3, lpattack: .001, lpsustain: 0 },
    cutoff: [340, 600, 420, 1000], decay: [.09, .13, .08, .16],
    vocabulary: {
      calls: ["0! _ ~ 0 ~ ~ 4! ~", "~ 0! ~ 0 _ ~ 4! ~", "0! ~ ~ 4! ~ 0 _ ~", "~ 0! _ ~ 0 ~ ~ 4!"],
      replies: ["~ 6! ~ 5 4! _ ~ ~", "~ 1 2! ~ 4 _ 1 ~", "6! ~ 5 ~ 4! _ ~ ~", "~ 4! _ ~ 2 1 ~ 0"],
      endings: ["~ 4! ~ 2 1 ~ 0! _", "6! ~ 4 ~ 1 ~ 0! _", "~ 2 1 ~ 0! _ ~ ~", "4! _ ~ 1 ~ 0! _ ~"],
    },
  },
  afterglow: {
    title: "Afterglow", description: "A softer plucked acid line, a low sine pulse and bell replies in the spaces between phrases.",
    bpm: 126, root: 45,
    voice: { s: "sawtooth", attack: .006, decay: .22, sustain: .02, release: .14,
      ftype: "ladder", resonance: 3, lpenv: 2, lpattack: .002, lpsustain: 0,
      hcutoff: 180, delay: .22, delayfeedback: .32, delaysync: .1875 },
    cutoff: [420, 650, 520, 950], decay: [.18, .24, .2, .32],
    vocabulary: {
      calls: ["0! _ _ ~ ~ 4 _ ~", "0! _ ~ ~ 1 _ 4 ~", "~ ~ 0! _ _ ~ 4 ~", "0! _ _ ~ 5 _ ~ ~"],
      replies: ["6! _ ~ 5 4 _ ~ ~", "~ 4! _ ~ 1 _ ~ ~", "5 _ 4! _ ~ 1 ~ ~", "~ 6! _ ~ 5 4 _ ~"],
      endings: ["4 _ ~ 1 0! _ _ ~", "5 4 _ ~ 0! _ _ ~", "~ 1 _ ~ 0! _ _ ~", "6 5 4 ~ 0! _ _ ~"],
    },
  },
};
export const STUDY_IDS = Object.keys(STUDIES) as StudyId[];
const SCALE = [0, 3, 5, 6, 7, 10];
const choose = (seed: number, id: string, size: number): number => h32(seed, cyrb128(`acid-grammar/1/${id}`)[0]) % size;
export const studyForSeed = (seed: number): StudyId => STUDY_IDS[choose(seed, "identity", STUDY_IDS.length)]!;

export function gesture(text: string): Note[] {
  const notes: Note[] = [];
  const tokens = text.split(" ");
  if (tokens.length !== 8) throw new Error("A gesture must span eight sixteenths");
  for (const [step, token] of tokens.entries()) {
    if (token === "~") continue;
    if (token === "_") {
      const prior = notes.at(-1);
      if (!prior || prior.step + prior.length !== step) throw new Error("A hold must follow a note");
      prior.length++; continue;
    }
    const degree = Number(token.replace("!", ""));
    if (!Number.isInteger(degree)) throw new Error("Invalid scale degree");
    notes.push({ step, degree, length: 1, gain: token.endsWith("!") ? .62 : [.48,.32,.4,.35][step % 4]! });
  }
  return notes;
}

export interface StudyPlan {
  id: StudyId; take: StudyTake; seed: number; bpm: number;
  motif: readonly (readonly Note[])[];
  // These choices affect multiple related parts; no individual note is rolled.
  delivery: "tight" | "open"; form: readonly number[]; opening: number;
  decisions: { call: number; reply: number; ending: number; construction: number; lift: boolean; };
}
const FORM = [[4,12,4,4,8], [4,8,4,4,12], [8,8,4,4,8]];

/** Assemble statement, repetition, answer and closure before choosing sounds.
 * Seeded choices act on complete gestures. The repeated statement remains intact;
 * octave displacement affects an entire reply and closure always reaches tonic.
 */
export function createStudy(id: StudyId, take: StudyTake = "written", seed = 2): StudyPlan {
  const spec = STUDIES[id];
  const draw = (name: string, n: number): number => take === "written" ? 0 : choose(seed, `${id}/${name}`, n);
  const call = draw("call", spec.vocabulary.calls.length), reply = draw("reply", spec.vocabulary.replies.length);
  const ending = draw("ending", spec.vocabulary.endings.length), construction = draw("construction", 4);
  const lift = draw("reply-register", 2) === 1;
  const a = gesture(spec.vocabulary.calls[call]!), b = gesture(spec.vocabulary.replies[reply]!);
  const close = gesture(spec.vocabulary.endings[ending]!);
  const lifted = b.map(n => ({ ...n, degree: n.degree + (lift ? 6 : 0), gain: n.gain * .9 }));
  // Fragmentation leaves the complete opening figure intact. Pressure repeats
  // that figure; the two spacious studies leave its second half for the drums.
  const head = a.filter(n => n.step < 4).map(n => ({ ...n, length: Math.min(n.length, 4 - n.step) }));
  const echo = id === "pressure" ? [...head, ...head.map(n => ({ ...n, step: n.step + 4, gain: n.gain * .85 }))] : head;
  const layouts = [
    [a,b, a,lifted, echo,b, a,close],
    [a,b, a,b, a,lifted, echo,close],
    [a,b, echo,b, a,lifted, a,close],
    [a,b, a,lifted, a,b, echo,close],
  ];
  const cells = layouts[construction]!;
  const motif = Array.from({ length: 4 }, (_, bar) =>
    [0,1].flatMap(half => cells[bar * 2 + half]!.map(n => Object.freeze({ ...n, step: n.step + half * 8 }))));
  const delivery = call % 2 === 0 ? "tight" : "open";
  return Object.freeze({ id, take, seed, bpm: spec.bpm, motif: Object.freeze(motif.map(bar => Object.freeze(bar))),
    delivery, form: Object.freeze([...FORM[draw("form", FORM.length)]!]), opening: draw("filter-opening", 3),
    decisions: Object.freeze({ call, reply, ending, construction, lift }) });
}

type Section = "introduce" | "groove" | "space" | "build" | "return";
export function studySection(plan: StudyPlan, bar: number): { name: Section; local: number; length: number } {
  let local = ((bar % 32) + 32) % 32;
  const names: Section[] = ["introduce", "groove", "space", "build", "return"];
  for (const [i, length] of plan.form.entries()) {
    if (local < length) return { name: names[i]!, local, length };
    local -= length;
  }
  throw new Error("Invalid study form");
}
const midi = (root: number, degree: number): number => root + SCALE[((degree % 6) + 6) % 6]! + 12 * Math.floor(degree / 6);

export function studyBar(plan: StudyPlan, bar: number): ReferenceEvent[] {
  if (bar < 0) return [];
  const spec = STUDIES[plan.id], section = studySection(plan, bar);
  const phraseBar = bar % 4, space = section.name === "space", build = section.name === "build";
  const last = section.local === section.length - 1;
  const intro = section.name === "introduce";
  const turnaround = bar % 8 === 7;
  const gap = build && last ? 8 : turnaround ? 14 : 16;
  const bright = spec.cutoff[(Math.floor(bar / 4) + plan.opening) % 4]! *
    (space ? .65 : build ? .65 + section.local * .3 : section.name === "return" ? 1.15 : 1);
  const events: ReferenceEvent[] = [];
  const add = (laneId: string, step: number, length: number, sound: Sound, degree?: number, root = spec.root) => {
    if (build && last && step >= gap) return;
    // The syncopated delivery opens both the acid gate and the offbeat hats.
    const swing = plan.id === "crosscurrent" && plan.delivery === "open" && step % 2 === 1 ? .12 : 0;
    const begin = bar + (step + swing) / 16;
    const pitch = degree === undefined ? undefined : midi(root, degree);
    events.push({ laneId, kind: degree === undefined ? "drum" : "bass", begin,
      end: bar + Math.min(16, step + swing + length) / 16, velocity: Number(sound.gain ?? 1), accent: Number(sound.gain) >= .6,
      ...(pitch === undefined ? {} : { midi: pitch }), sound: { ...sound, ...(pitch === undefined ? {} : { note: pitch }) } });
  };
  const drum = (id: string, step: number, gain: number, sound: Sound = {}) =>
    add(id, step, id === "oh" ? 2 : 1, { s: id, bank: "RolandTR909", gain, ...sound });

  const notes = plan.motif[phraseBar]!;
  for (const n of notes) {
    if (space && n.step >= 8) continue;
    // The bell answers only after the acid stops; reserve the complete second half.
    if (plan.id === "afterglow" && phraseBar === 3 && !intro && n.step >= 8) continue;
    add("acid", n.step, n.length * (plan.delivery === "tight" ? .8 : .95), {
      ...spec.voice, cutoff: bright, lpdecay: spec.decay[phraseBar]!,
      lpenv: Number(spec.voice.lpenv) + (build ? section.local * .3 : Math.floor(bar / 4) % 2),
      gain: n.gain * (plan.id === "crosscurrent" ? .8 : 1), orbit: 1,
    }, n.degree);
  }

  if (!space) {
    const kicks = plan.id === "crosscurrent" ? phraseBar % 2 === 0 ? [0,6,10] : [0,7,10,14] : [0,4,8,12];
    for (const step of kicks) if (step < gap) drum("bd", step, plan.id === "afterglow" ? .72 : .85);
    if (!intro || section.local >= 2) for (const step of [4,12]) drum("cp", step, .3, { room: .12 });
  }
  const hats = plan.id === "pressure" ? Array.from({ length: 16 }, (_, i) => i) :
    plan.id === "crosscurrent" ? plan.delivery === "tight" ? [0,2,5,8,10,13] : [0,3,6,8,11,14] : [2,6,10,14];
  for (const step of hats) if (!space || step % 4 === 2)
    drum("hh", step, [.18,.075,.12,.075][step % 4]! * (space ? .7 : 1), { pan: .55 });
  if (!intro && !space) {
    const open = plan.id === "pressure" ? [2,6,10,14] : plan.id === "crosscurrent" ? [2,10] : [6,14];
    for (const step of open) drum("oh", step, plan.delivery === "open" ? .21 : .17, { pan: .45 });
  }
  if (!space && phraseBar === 3) {
    const fills = plan.id === "pressure" ? turnaround ? [8,10,12,14,15,15.5] : [12,14,15] :
      plan.id === "crosscurrent" ? [11,14,15.5] : [12,15];
    for (const step of fills) drum("sd", step, .15 + (step - 8) * .014, { room: .15 });
  }
  if (build && !last) for (const step of [10,11,14,15]) drum("sd", step, .11 + section.local * .025);

  if (plan.id === "afterglow") {
    // The sub shares the tonal centre and leaves the second half of the bar open.
    if (!space) add("sub", 0, 5, { s: "sine", gain: .3, attack: .006, decay: .3, sustain: 0, release: .1, orbit: 2 }, 0, spec.root - 12);
    if (!intro && phraseBar === 3) {
      const ending = notes.at(-1)!;
      for (const [i, step] of [10,14].entries()) add("bell", step, 1.5, {
        s: "sine", fmi: 1.2, fmh: 2, attack: .002, decay: .32, sustain: 0, release: .18,
        gain: i === 0 ? .2 : .15, room: .35, delay: .25, delaysync: .1875, delayfeedback: .35, pan: i === 0 ? .35 : .65, orbit: 3,
      }, ending.degree + (i === 0 ? 10 : 6));
    }
  }
  return events.sort((a,b) => a.begin - b.begin || (a.laneId < b.laneId ? -1 : a.laneId > b.laneId ? 1 : 0));
}

export function studyPattern(plan: StudyPlan): Pattern<ReferenceEvent> {
  return new Pattern(({ span }) => {
    const haps: Hap<ReferenceEvent>[] = [];
    for (let bar = Math.max(0, Math.floor(+span.begin)); bar < Math.ceil(+span.end); bar++) {
      for (const event of studyBar(plan, bar)) {
        const whole = new TimeSpan(event.begin, event.end), part = whole.intersection(span);
        if (part && +part.end > +part.begin) haps.push(new Hap(whole, part, event));
      }
    }
    return haps;
  });
}
