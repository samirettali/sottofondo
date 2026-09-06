import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import type { AcidChain } from "../src/audio/acid-mono.ts";
import type { AuditionScore } from "./acid-reference-player.ts";
import type { ReferenceEvent } from "./acid-reference-score.ts";

export type PieceId = "ferro-1" | "scia-1";
type Sound = ReferenceEvent["sound"];
interface Step { step: number; degree: number; gate: number; accent: boolean; slide: boolean; }
export interface Section { name: string; begin: number; end: number; }
export interface Piece extends AuditionScore {
  id: PieceId; title: string; description: string; bars: number;
  sections: readonly Section[]; parts: Readonly<Record<string, string>>;
  events: readonly ReferenceEvent[];
}
export const PIECE_IDS: readonly PieceId[] = ["ferro-1", "scia-1"];
export function readPiece(value: string | null): PieceId {
  if (value === null) return "ferro-1";
  if (value === "ferro-1" || value === "scia-1") return value;
  throw new Error(`Unknown composition version: ${value}`);
}

// Original, fixed scores for listening acceptance. These phrases are never
// imported into a seeded composer. Numbers are scale degrees; ! accents, >
// connects to the next note, _ holds, and ~ rests. Each row spans one 4/4 bar.
function line(text: string): readonly Step[] {
  const tokens = text.split(" "), notes: Step[] = [];
  if (tokens.length !== 16) throw new Error(`Expected sixteen steps: ${text}`);
  for (const [step, token] of tokens.entries()) {
    if (token === "~") continue;
    if (token === "_") {
      const previous = notes.at(-1);
      if (!previous || previous.step + previous.gate !== step) throw new Error("Hold must follow a note");
      previous.gate++; continue;
    }
    if (!/^-?\d+[!>]?$/.test(token)) throw new Error(`Invalid written note: ${token}`);
    notes.push({ step, degree: Number(token.replace(/[!>]/, "")), gate: 1, accent: token.endsWith("!"), slide: token.endsWith(">") });
  }
  for (const [i, note] of notes.entries()) if (note.slide && (!notes[i + 1] || notes[i + 1]!.accent))
    throw new Error("A written slide needs an unaccented destination in the same bar");
  return notes;
}
const FERRO = [
  line("0! _ ~ 0 0! ~ 6> 4 ~ 0! _ 0 3> 4 ~ 0"),
  line("0! _ ~ 0 0! ~ 6> 4 ~ 0! _ ~ 5> 6 4 0"),
  line("0! _ ~ 0 0! ~ 6> 4 ~ 0! _ 0 3> 4 ~ 0"),
  line("0! _ ~ 0 0! ~ 6> 4 ~ 6! 5 4 1> 0 ~ ~"),
];
const SCIA_LEAD = [
  line("0! ~ 4 7 2! _ 4 ~ 6! ~ 4 2 0 _ ~ ~"),
  line("0! ~ 4 7 2! _ 4 ~ 6! ~ 7 4 2 _ ~ ~"),
  line("0! ~ 4 7 2! _ 4 ~ 9! _ 7 6 4 _ ~ ~"),
  line("7! _ 6 4 2! _ 4 ~ 1 _ 2 ~ 0 _ _ ~"),
];
const SCIA_ACID = [
  line("~ ~ 0! 0 ~ ~ 4> 0 ~ ~ 0! 0 ~ ~ 6> 4"),
  line("~ ~ 0! 0 ~ ~ 4> 0 ~ ~ 0! 0 ~ ~ 4> 0"),
];
const MINOR = [0, 2, 3, 5, 7, 8, 10], BLUES = [0, 3, 5, 6, 7, 10];
const midi = (degree: number, root: number, scale: readonly number[]) =>
  root + scale[((degree % scale.length) + scale.length) % scale.length]! + 12 * Math.floor(degree / scale.length);
const order = (a: ReferenceEvent, b: ReferenceEvent) => a.begin - b.begin || (a.laneId < b.laneId ? -1 : a.laneId > b.laneId ? 1 : 0);
const ramp = (bar: number, from: number, to: number, low: number, high: number) =>
  low + (high - low) * Math.max(0, Math.min(1, (bar - from) / (to - from)));

export function createPiece(id: PieceId, muted: ReadonlySet<string> = new Set()): Piece {
  readPiece(id);
  const ferro = id === "ferro-1", bars = 48, bpm = ferro ? 144 : 142;
  const events: ReferenceEvent[] = [];
  const acid: { event: ReferenceEvent; slide: boolean }[] = [];
  const parts = ferro ? { kick: "Kick", acid: "Acid riff", drums: "Hats & backbeat", signal: "Low call", space: "Atmosphere" } :
    { kick: "Kick", acid: "Acid bass", drums: "Hats & backbeat", lead: "Main sequence", answer: "High reply", space: "Atmosphere" };
  const add = (laneId: string, bar: number, step: number, gate: number, sound: Sound, degree?: number, root = ferro ? 40 : 45,
    scale: readonly number[] = ferro ? BLUES : MINOR, accent = false): ReferenceEvent => {
    const pitch = degree === undefined ? undefined : midi(degree, root, scale);
    const event: ReferenceEvent = { laneId, begin: bar + step / 16, end: bar + (step + gate) / 16,
      kind: degree === undefined ? "drum" : "bass", velocity: Number(sound.gain), accent,
      sound: { ...sound, ...(pitch === undefined ? {} : { note: pitch }) }, ...(pitch === undefined ? {} : { midi: pitch }) };
    events.push(event); return event;
  };
  const drum = (bar: number, step: number, sample: string, gain: number, controls: Sound = {}) =>
    add("drums", bar, step, sample === "oh" ? 1.65 : .7, { s: sample, bank: "Local", orbit: 0, gain, ...controls });
  const acidNote = (bar: number, n: Step, cutoff: number, gain: number, depth: number, root?: number) => {
    const event = add("acid", bar, n.step, n.gate - .18, {
      s: ferro ? "sawtooth" : "square", orbit: 1, gain: gain * (n.accent ? 1 : .65),
      cutoff, resonance: ferro ? 10 : 7.5, lpenv: depth,
      lpdecay: ferro ? n.accent ? .17 : .11 : .12,
      delay: ferro ? bar >= 20 && bar < 24 ? .32 : .1 : .15,
      delayfeedback: ferro ? .36 : .28, delaysync: .1875,
    }, n.degree, root ?? (ferro ? 40 : 33), ferro ? BLUES : MINOR, n.accent);
    acid.push({ event, slide: n.slide });
  };
  for (let bar = 0; bar < bars; bar++) {
    if (ferro) {
      // The motif stays identifiable while the filter opens over whole phrases.
      // A held suspension and a hard return replace a generic rising snare build.
      const suspended = bar >= 20 && bar < 24;
      const cutoff = bar < 4 ? ramp(bar, 0, 4, 130, 240) : bar < 12 ? ramp(bar, 4, 12, 260, 650) :
        bar < 20 ? ramp(bar, 12, 20, 650, 1450) : suspended ? ramp(bar, 20, 24, 900, 160) :
        bar < 32 ? ramp(bar, 24, 32, 1500, 750) : bar < 40 ? ramp(bar, 32, 40, 600, 1650) : ramp(bar, 40, 47, 650, 140);
      if (!suspended && bar < 46) {
        const phrase = FERRO[bar % 8 === 7 ? 3 : bar % 2]!;
        for (const n of phrase) if ((bar >= 4 || n.step < 8) && !(bar === 39 && n.step >= 12)) acidNote(bar, n, cutoff, .83, 3.2);
      } else if (bar === 20 || bar === 22 || bar === 46) {
        acidNote(bar, { step: 0, degree: bar === 22 ? 6 : 0, gate: bar === 46 ? 8 : 12, accent: true, slide: false }, cutoff, .68, 2.4);
      }
      if (!suspended && bar < 46) for (const step of [0, 4, 8, 12]) if (!(bar === 39 && step >= 12))
        add("kick", bar, step, 1, { s: "character_kick", gain: 1 });
      if (!suspended && bar < 46) {
        for (let step = 0; step < 16; step += bar < 4 || bar >= 44 ? 2 : 1) {
          // The open hat replaces the closed strike at its position; no extra cymbal lane.
          const open = bar >= 12 && bar < 40 && step % 4 === 2;
          drum(bar, step, open ? "oh" : "hh", open ? .15 : [.17, .055, .115, .065][step % 4]!,
            { attack: .001, decay: open ? .11 : .036, sustain: 0, release: .012, clip: 1, cut: 71, hcutoff: 3200, pan: .52 });
        }
        if (bar >= 4 && bar < 44) for (const step of [4, 12]) drum(bar, step, "cp", .36, { room: .12, hcutoff: 600 });
        if ([11, 19, 31, 43].includes(bar)) for (const [i, step] of [13, 14, 15].entries())
          drum(bar, step, "sd", .16 + i * .055, { room: .16, hcutoff: 400 });
      }
      // One recurrent two-hit call; its answer falls in the riff's final silence.
      if ([7, 15, 27, 35].includes(bar)) for (const [i, step] of [14, 15.5].entries())
        for (const degree of [0, 4]) add("signal", bar, step, .7, {
          s: "supersaw", unison: 3, detune: .12, spread: .25, orbit: 3, gain: i ? .3 : .5,
          attack: .003, decay: .13, sustain: .05, release: .06, cutoff: 1900, hcutoff: 300,
          bandf: 850, bandq: 1.1, shape: .2, shapevol: .75, room: .18, delay: .2, delaysync: .1875, delayfeedback: .25,
        }, degree, 52);
      if ([0, 16, 20, 24, 32, 40, 44].includes(bar)) for (const degree of [0, 4, 7])
        add("space", bar, 0, bar === 20 ? 55 : 28, {
          s: "supersaw", unison: 3, detune: .08, spread: .65, orbit: 6, gain: bar === 20 ? .12 : .07,
          attack: .5, decay: .6, sustain: .65, release: .7, cutoff: bar === 20 ? 950 : 560, hcutoff: 420, room: .55,
        }, degree, 52);
      if (bar === 23) for (const step of [8, 10, 12, 13]) drum(bar, step, "sd", .16 + (step - 8) * .025, { room: .25 });
    } else {
      // One four-bar sequence, with a pedal and common-tone harmony. The middle
      // removes the sequence so its quiet answering material becomes the focus.
      const horizon = bar >= 24 && bar < 32;
      const fPedal = bar >= 16 && bar < 24 || bar >= 36 && bar < 40;
      const leadOn = !horizon && bar < 46;
      if (leadOn) for (const n of SCIA_LEAD[bar % 4]!) {
        if (bar === 45 && n.step >= 8) continue;
        add("lead", bar, n.step, n.gate * .76, {
          s: "supersaw", unison: 3, detune: .09, spread: .45, orbit: 5, gain: n.accent ? .67 : .42,
          attack: .002, decay: .18, sustain: .24, release: .1,
          cutoff: bar < 8 ? ramp(bar, 0, 8, 1100, 2600) : bar < 24 ? ramp(bar, 8, 24, 2600, 4400) : 3600,
          hcutoff: 240, resonance: 1.4, lpenv: .7, lpdecay: .12,
          delay: .23, delaysync: .1875, delayfeedback: .32, room: .22,
        }, n.degree, 57, MINOR, n.accent);
      }
      if (bar >= 4 && bar < 46 && !(bar >= 28 && bar < 30)) {
        for (const n of SCIA_ACID[bar % 2]!) {
          if (horizon && n.step >= 8) continue;
          acidNote(bar, n, horizon ? 210 : bar >= 32 ? 650 : ramp(bar, 4, 24, 180, 580), .29, 2.4, 33);
        }
      }
      if (bar < 46 && !(bar >= 28 && bar < 32)) for (const step of [0, 4, 8, 12])
        if (bar >= 2 || step % 8 === 0) add("kick", bar, step, 1, { s: "character_kick", gain: 1 });
      if (bar >= 2 && bar < 46 && !(bar >= 28 && bar < 32)) {
        for (let step = 0; step < 16; step++) {
          const open = bar >= 8 && !horizon && step % 4 === 2;
          if (horizon && step % 4 !== 2) continue;
          drum(bar, step, open ? "oh" : "hh", open ? .16 : [.24, .084, .16, .11][step % 4]!,
            { attack: .001, decay: open ? .1 : .035, sustain: 0, release: .012, clip: 1, cut: 72, hcutoff: 1800, pan: .46 });
        }
        if (bar >= 8 && !horizon) for (const step of [4, 12]) drum(bar, step, "cp", .32, { room: .19, hcutoff: 750 });
        if ([15, 23, 39].includes(bar)) for (const step of [12, 14, 15]) drum(bar, step, "sd", step === 15 ? .26 : .17, { room: .2 });
      }
      if (bar % 4 === 0) {
        // Fmaj7/A and Am share A, C and E; the upper motif can retain its identity.
        const chord = fPedal ? [-2, 0, 2, 4] : [0, 2, 4, 6];
        for (const degree of chord) add("space", bar, 0, bar === 44 ? 40 : 55, {
          s: "supersaw", unison: 3, detune: .07, spread: .7, orbit: 6, gain: horizon ? .115 : .082,
          attack: .42, decay: .5, sustain: .7, release: .65, cutoff: horizon ? 1450 : 900, hcutoff: 300, room: .5,
        }, degree, 57);
      }
      if ([7, 15, 23, 35, 43].includes(bar) || horizon && bar % 2 === 0) {
        const steps = horizon ? [0, 6, 10] : [10, 13, 15];
        for (const [i, step] of steps.entries()) add("answer", bar, step, 1.2, {
          s: "sine", fmi: .65, fmh: 2, orbit: 3, gain: horizon ? .32 : .26,
          attack: .003, decay: .28, sustain: 0, release: .18, cutoff: 3800, hcutoff: 700,
          delay: .3, delaysync: .1875, delayfeedback: .4, room: .38, pan: .64,
        }, [4, 2, 0][i]!, 69);
      }
      if (bar === 31) for (const step of [8, 10, 12]) drum(bar, step, "sd", .17 + (step - 8) * .015, { room: .28 });
    }
  }

  // Compile explicitly written ties for the existing mono instrument. No RNG or
  // scoring heuristic chooses gestures here. Charge depends only on score time.
  let charge = 0, previous = 0;
  const chains: ReferenceEvent[] = [];
  for (let i = 0; i < acid.length; i++) {
    const first = acid[i]!.event, group = [first];
    while (acid[i]!.slide) group.push(acid[++i]!.event);
    const last = group.at(-1)!, sound = first.sound;
    charge *= Math.exp(-(first.begin - previous) * 240 / bpm / .25);
    if (first.accent) charge = Math.min(3, charge + 1);
    previous = first.begin;
    const chain: AcidChain = { gate: last.end - first.begin, window: (acid[i + 1]?.event.begin ?? bars) - first.begin,
      tones: group.map(n => ({ offset: n.begin - first.begin, midi: n.midi!, gain: Number(n.sound.gain),
        cutoff: Number(n.sound.cutoff), resonance: Number(n.sound.resonance) })),
      depth: Number(sound.lpenv), decay: Number(sound.lpdecay), charge, accent: first.accent,
      delay: Number(sound.delay), feedback: Number(sound.delayfeedback), delayCycles: Number(sound.delaysync) };
    chains.push({ ...first, end: last.end, acidChain: chain });
  }
  events.sort(order);
  const scheduled = [...events.filter(n => n.laneId !== "acid"), ...chains].sort(order);
  const pattern = new Pattern<ReferenceEvent>(({ span }) => scheduled.flatMap(value => {
    if (muted.has(value.laneId) || value.begin >= +span.end || value.end <= +span.begin) return [];
    const whole = new TimeSpan(value.begin, value.end), part = whole.intersection(span);
    return part && +part.end > +part.begin ? [new Hap(whole, part, value)] : [];
  }));
  const sections: Section[] = ferro ? [
    { name: "Signal", begin: 0, end: 4 }, { name: "Lock", begin: 4, end: 12 },
    { name: "Pressure", begin: 12, end: 20 }, { name: "Suspension", begin: 20, end: 24 },
    { name: "Release", begin: 24, end: 40 }, { name: "Afterimage", begin: 40, end: 44 }, { name: "Coda", begin: 44, end: 48 },
  ] : [
    { name: "Contour", begin: 0, end: 8 }, { name: "Motion", begin: 8, end: 24 },
    { name: "Horizon", begin: 24, end: 32 }, { name: "Overlap", begin: 32, end: 44 }, { name: "Dissolve", begin: 44, end: 48 },
  ];
  return { id, title: ferro ? "Ferro" : "Scia", bars, bpm, sections, events, pattern, parts,
    description: ferro ? "A short acid riff, a low recurring call, and a held breath before the return." :
      "A moving sequence above acid bass. The background takes the foreground before the theme returns.",
    acidSettings: { voice: "mono-link-1", drive: ferro ? "bite" : "clean" }, acidWave: ferro ? "sawtooth" : "square",
    localSamples: { cp: ferro ? "elec_hi_snare" : "perc_snap2", sd: "elec_hi_snare",
      hh: ferro ? "hat_metal" : "hat_cab", oh: ferro ? "drum_cymbal_open" : "drum_cymbal_pedal" },
    kickDesign: ferro ? { model: "driven", midi: 28, sweep: 5.4, fall: .024, decay: .24, click: .12, drive: 3.8, gain: .92 } :
      { model: "tight", midi: 33, sweep: 5, fall: .018, decay: .155, click: .08, drive: 1.5, gain: 1.08 },
  };
}
