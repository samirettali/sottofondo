import { cyrb128, h32 } from "../core/rng.ts";
import { euclid } from "../pattern/euclid.ts";
import { arrangeCharacter, type Character } from "./character.ts";
import { type Composition, type Hit, type Part } from "./procedural.ts";
import { TRANCE_VOICES, type TranceVoiceId, type VoiceControls } from "./trance-voices.ts";

export const TRANCE_VERSION = "trance-1";
const domains = new Map<string, number>();
function draw(seed: number, name: string, index: number, max: number): number {
  if (!domains.has(name)) domains.set(name, cyrb128(`${TRANCE_VERSION}/${name}`)[0]);
  return h32(seed, domains.get(name)!, index) % max;
}
const pick = <T>(seed: number, name: string, choices: readonly T[]): T => choices[draw(seed, name, 0, choices.length)]!;
// Stratify the major choices so browsing adjacent seeds visits different
// instruments and articulations. The rotation of each group is still hashed.
const spread = <T>(seed: number, name: string, choices: readonly T[]): T =>
  choices[(seed % choices.length + draw(Math.floor(seed / choices.length), name, 0, choices.length)) % choices.length]!;
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export interface TranceDesign {
  readonly version: typeof TRANCE_VERSION;
  readonly bpm: number;
  readonly voices: Readonly<Record<"arp" | "pad" | "answer" | "pulse" | "texture", TranceVoiceId>>;
  readonly motion: "running" | "gallop" | "broken" | "octaves";
  readonly harmony: "wash" | "gated" | "stabs";
  readonly figure: readonly number[];
  readonly rhythm: readonly number[];
  readonly chordTicks: readonly number[];
  readonly pulseTicks: readonly number[];
  readonly replyBars: number;
  readonly entrance: number;
  readonly openStep: number;
  readonly liftBars: number;
}

export function createTrance(c: Composition): TranceDesign {
  const seed = c.identity.seed;
  const motion = spread(seed, "motion", ["running", "gallop", "broken", "octaves"] as const);
  const harmony = spread(seed, "harmony", ["wash", "gated", "stabs"] as const);
  const arp = spread(seed, "arp-voice", ["wire", "spark", "bubble", "nasal", "glass", "needle", "silk", "rave", "pulse"] as const);
  const pads = harmony === "wash" ? ["mist", "halo", "velvet", "sweep"] as const :
    harmony === "gated" ? ["choir", "strings", "organ"] as const : ["dub", "mallet", "epiano"] as const;
  const pad = pick(seed, "pad-voice", pads);
  const answer = pick(seed, "answer-voice", (["glass", "spark", "bubble", "wire", "nasal"] as const).filter(id => id !== arp));
  const rhythm: number[] = [];
  const motifBars = pick(seed, "motif-bars", [2, 4]);
  for (let bar = 0; bar < motifBars; bar++) for (let tick = 0; tick < 32; tick += 2) {
    const step = tick % 8;
    const occupied = motion === "running" || motion === "gallop" && step !== 2 ||
      motion === "broken" && step !== (draw(seed, "broken-beat", Math.floor(tick / 8), 2) ? 0 : 4) ||
      motion === "octaves" && (step % 4 === 0 || step === 6 && (tick + bar * 8) % 16 >= 8);
    if (occupied && !(bar === motifBars - 1 && tick >= 28)) rhythm.push(bar * 32 + tick);
  }
  // A generated contour over chord-tone indices: the timbre does not select
  // a canned arpeggio. The same figure maps onto each current chord.
  const contour = Array.from({ length: motifBars * 4 }, (_, i) => draw(seed, "contour", i, 5));
  const figure: number[] = [];
  const repeatCost = 2 + draw(seed, "repeat", 0, 8);
  for (const [index, tick] of rhythm.entries()) {
    const previous = figure.at(-1) ?? 0, target = contour[Math.floor(tick / 8)]!;
    const scores = [0, 1, 2, 3, 4].map(degree => ({ degree, cost:
      Math.abs(degree - target) * 3 + Math.abs(degree - previous) + (degree === previous ? repeatCost : 0) }));
    const best = Math.min(...scores.map(s => s.cost));
    const choices = scores.filter(s => s.cost <= best + 3);
    figure.push(choices[draw(seed, "figure", index, choices.length)]!.degree);
  }
  const chordRotation = pick(seed, "chord-rotation", [2, 4, 6]);
  const chordTicks = harmony === "wash" ? [0] : harmony === "gated" ?
    Array.from({ length: 8 }, (_, i) => i * 4) :
    euclid(2 + draw(seed, "chord-density", 0, 3), 8, chordRotation).flatMap((hit, i) => hit ? [i * 4 + 2] : []);
  return freeze({ version: TRANCE_VERSION, bpm: 138 + draw(seed, "tempo", 0, 9),
    voices: { arp, pad, answer, pulse: pick(seed, "pulse-voice", ["fm-tom", "metal-rim", "resonant-tick"] as const),
      texture: pick(seed, "texture-voice", ["air", "wash"] as const) },
    motion, harmony, rhythm, figure, chordTicks,
    pulseTicks: euclid(3 + draw(seed, "pulse-density", 0, 3), 16, draw(seed, "pulse-rotation", 0, 16)).flatMap((hit, i) => hit ? [i * 2] : []),
    replyBars: pick(seed, "reply-bars", [2, 4]), entrance: pick(seed, "entrance", [2, 4, 6]),
    openStep: pick(seed, "open-step", [8, 16]), liftBars: pick(seed, "filter-period", [8, 16]),
  });
}

/** One lead plus complementary rhythms, not a full stack of every available
 * instrument. The score is complete before muting and uses a fixed 4/4 grid. */
export function arrangeTrance(c: Composition, character: Character, t: TranceDesign): readonly (readonly Hit[])[] {
  const base = arrangeCharacter(c, character), n = c.identity.scale.length;
  const motifBars = Math.ceil((t.rhythm.at(-1)! + 1) / 32);
  return freeze(base.map((original, bar) => {
    const section = c.sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
    const local = bar - section.start, last = local === section.bars - 1;
    const limit = section.name === "Build" && last ? 16 : 32;
    const notes: Hit[] = original.filter(note => ["acid", "kick", "clap", "sub"].includes(note.part)).map(note => ({ ...note }));
    const add = (part: Part, tick: number, gate: number, velocity: number, degree = 0) => {
      if (tick < limit) notes.push({ part, tick, gate: Math.min(gate, limit - tick), degree, velocity });
    };
    const chord = character.chords[Math.floor(bar / character.chordBars) % character.chords.length]!;
    const pool = [...chord, chord[0]! + n, chord[1]! + n];
    const driving = section.name === "Drive" || section.name === "Build" || section.name === "Return";
    const opens = driving ? Array.from({ length: 32 / t.openStep }, (_, i) => 4 + i * t.openStep) : [];
    for (let tick = 0; tick < limit; tick += section.name === "Space" || bar < 2 ? 4 : 2) {
      if (!opens.includes(tick)) add("hat", tick, 1, tick % 8 === 4 ? 54 : tick % 4 === 0 ? 32 : 19);
    }
    opens.forEach(tick => add("open", tick, 2, 48));
    // The echo owns the end of its phrase; the lead leaves it a real gap.
    const reply = (bar + 1) % t.replyBars === 0 && (driving || section.name === "Space");
    if (reply && limit === 32) {
      for (const [i, tick] of [24, 28].entries()) add("answer", tick, 2, 64 - i * 10, pool[(bar + i) % 3]!);
    }
    if (bar >= t.entrance && section.name !== "Space") {
      for (const [index, onset] of t.rhythm.entries()) {
        if (Math.floor(onset / 32) !== bar % motifBars) continue;
        const tick = onset % 32;
        if (reply && tick >= 22) continue;
        add("arp", tick, t.motion === "octaves" ? 2 : 1, tick % 8 === 0 ? 80 : tick % 4 === 0 ? 65 : 51, pool[t.figure[index]!]!);
      }
    }
    if (bar >= 2) {
      const ticks = section.name === "Space" ? [0, 16] : t.chordTicks;
      for (const tick of ticks) {
        const gate = section.name === "Space" ? 13 : t.harmony === "wash" ? 28 : t.harmony === "gated" ? 2 : 3;
        // Open voicing for sustained chords; compact voicing for short stabs.
        for (const [i, degree] of chord.entries()) add("pad", tick, gate, section.name === "Space" ? 78 : 66,
          degree + (t.harmony === "wash" && i === 1 ? n : 0));
      }
    }
    if (driving && bar >= t.entrance + 2 && !(section.name === "Build" && last)) {
      // Percussion takes alternate two-bar turns with the melodic echo.
      if (Math.floor(local / 2) % 2 === 0) for (const tick of t.pulseTicks) {
        if (reply && tick >= 22) continue;
        add("pulse", tick, 1, tick % 8 === 0 ? 62 : 43, chord[(tick / 2) % 3]!);
      }
    }
    if (section.name === "Build" && local >= section.bars - 2) add("texture", 0, limit - 2, last ? 65 : 48);
    if (section.name === "Return" && local === 0) add("texture", 0, 6, 48);
    return notes.sort((a, b) => a.tick - b.tick || (a.part < b.part ? -1 : a.part > b.part ? 1 : 0));
  }));
}

export function tranceRegister(part: Part): number { return part === "pad" || part === "pulse" ? 48 : part === "answer" ? 72 : 60; }

export function tranceSound(c: Composition, character: Character, t: TranceDesign, part: Part, bar: number, tick: number,
  velocity: number, base: VoiceControls): VoiceControls {
  const section = c.sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
  if (part === "acid") {
    const phase = ((bar + tick / 32) % t.liftBars) / t.liftBars;
    const opening = section.name === "Opening" ? .2 : section.name === "Space" ? .1 : section.name === "Return" ? .8 :
      section.name === "Build" ? (bar - section.start + tick / 32) / section.bars : .45;
    const open = .25 * phase + .75 * opening;
    return { ...base, cutoff: 240 + open * (2600 + character.brightness * 12), resonance: 8 + character.edge / 30,
      lpenv: 4 + character.edge / 35, lpdecay: velocity >= 85 ? .2 : .11,
      decay: velocity >= 85 ? .2 : .13, shape: .1 + character.edge / 330, shapevol: .8,
      delay: .12 + character.space / 650, delayfeedback: .38, delaysync: .1875 };
  }
  if (!(part in t.voices)) return base;
  const id = t.voices[part as keyof TranceDesign["voices"]], instrument = TRANCE_VOICES[id];
  const mix = part === "arp" ? .78 : part === "pad" ? .8 : part === "answer" ? .64 : .68;
  const orbit = part === "arp" ? 5 : part === "pad" ? 6 : part === "answer" ? 3 : part === "pulse" ? 7 : 8;
  const sound: VoiceControls = { ...instrument.sound, orbit, gain: Number(instrument.sound.gain) * mix * velocity / 100,
    pan: part === "arp" ? .4 : part === "answer" ? .64 : part === "pulse" ? .58 : .5,
    room: part === "pad" ? .35 : part === "texture" ? .25 : .14,
  };
  if (part === "arp" || part === "answer") Object.assign(sound, { delay: part === "answer" ? .3 : .22,
    delayfeedback: .34, delaysync: t.motion === "gallop" ? .125 : .1875, hcutoff: 400 });
  if (part === "pad" && section.name === "Space") Object.assign(sound, { attack: .08, sustain: .5, release: .2 });
  if (part === "texture") Object.assign(sound, section.name === "Build" ?
    { attack: .5, decay: .3, sustain: .4, cutoff: 3800 + 500 * (bar - section.start), lpenv: 1, lpattack: .9, lpsustain: 1 } :
    { attack: .003, decay: .35, sustain: 0 });
  return sound;
}
