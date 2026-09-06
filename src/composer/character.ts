import { cyrb128, h32 } from "../core/rng.ts";
import { semitone, type Composition, type Hit } from "./procedural.ts";

export interface KickDesign {
  model: "tight" | "round" | "driven";
  midi: number; sweep: number; fall: number; decay: number; click: number; drive: number; gain: number;
}
export interface Character {
  kick: KickDesign; edge: number; space: number; brightness: number;
  hatStep: number; openEvery: number; openTick: number; hatDecay: number;
  arp: boolean; arpStep: number; arpDirection: number; arpVoice: "sawtooth" | "triangle" | "square";
  pad: boolean; chordBars: number; chords: readonly (readonly number[])[];
}
const salt = cyrb128("sound-character/1")[0];
const draw = (seed: number, domain: number, max: number) => h32(seed, salt, domain) % max;

function harmony(c: Composition, chordBars: number): number[][] {
  const { scale, seed } = c.identity;
  // Build triads from the selected tonal collection, rather than choose a stored
  // progression. Pentatonic collections admit fewer complete triads.
  const candidates = scale.flatMap((root, degree) => {
    const third = scale.findIndex(pc => pc === (root + 3) % 12 || pc === (root + 4) % 12);
    const fifth = scale.indexOf((root + 7) % 12);
    return third < 0 || fifth < 0 ? [] : [[degree, third, fifth].sort((a, b) => a - b)];
  });
  const tonic = candidates.find(chord => chord.includes(0) && chord.includes(scale.indexOf(3)) && chord.includes(scale.indexOf(7)))!;
  const result: number[][] = [tonic];
  for (let slot = 1; slot < 3; slot++) {
    const phrase = c.bars.slice(slot * chordBars, (slot + 1) * chordBars).flat().filter(n => n.part === "acid");
    const previous = result.at(-1)!;
    const scores = candidates.map((chord, index) => {
      let cost = 0;
      for (const note of phrase) {
        const pc = semitone(scale, note.degree) % 12;
        const pitches = chord.map(d => scale[d]!);
        if (!pitches.includes(pc)) {
          const semitoneClash = pitches.some(p => (Math.abs(p - pc) % 12 === 1 || Math.abs(p - pc) % 12 === 11));
          cost += (note.velocity >= 85 ? 3 : 1) * note.gate * (semitoneClash ? 3 : 1);
        }
      }
      cost = Math.floor(cost * 20 / Math.max(1, phrase.length));
      cost += chord === previous ? 18 : chord.some(d => previous.includes(d)) ? 0 : 8;
      return { chord, cost, index };
    }).sort((a, b) => a.cost - b.cost || a.index - b.index);
    const acceptable = scores.filter(s => s.cost <= scores[0]!.cost + 18).slice(0, 3);
    result.push(acceptable[draw(seed, 100 + slot, acceptable.length)]!.chord);
  }
  result.push(tonic);
  return result;
}

export function createCharacter(c: Composition): Character {
  const seed = c.identity.seed;
  const model = (["tight", "round", "driven"] as const)[draw(seed, 0, 3)]!;
  const weight = draw(seed, 1, 101), edge = draw(seed, 2, 101), space = draw(seed, 3, 101);
  const chordBars = draw(seed, 4, 2) ? 2 : 4;
  // Pitch, tail, transient and saturation are coupled physical choices. These
  // are authored synthesis ranges, not measurements or song templates.
  const kick: KickDesign = {
    model, midi: 24 + c.identity.key + (c.identity.key < 4 ? 12 : 0),
    sweep: model === "tight" ? 4 + edge / 20 : model === "round" ? 1.5 + edge / 100 : 3 + edge / 30,
    fall: model === "tight" ? .016 + weight / 5000 : model === "round" ? .05 + weight / 2000 : .025 + weight / 4000,
    decay: model === "tight" ? .105 + weight / 1500 : model === "round" ? .3 + weight / 400 : .18 + weight / 650,
    click: model === "round" ? .015 + edge / 2500 : .04 + edge / 600,
    drive: model === "driven" ? 2.5 + edge / 20 : model === "tight" ? 1.3 : 1,
    gain: model === "driven" ? .7 : .85,
  };
  const arp = draw(seed, 5, 4) !== 0;
  const character: Character = {
    kick, edge, space, brightness: draw(seed, 6, 101), hatStep: c.identity.density > 10 ? 4 : 2,
    openEvery: [1, 2, 4][draw(seed, 7, 3)]!, openTick: draw(seed, 8, 2) ? 12 : 28,
    hatDecay: .035 + edge / 2000,
    arp, arpStep: draw(seed, 9, 3) === 0 ? 4 : 2, arpDirection: draw(seed, 10, 3),
    arpVoice: (["sawtooth", "triangle", "square"] as const)[draw(seed, 11, 3)]!,
    pad: !arp || space > 25, chordBars, chords: harmony(c, chordBars),
  };
  Object.freeze(kick); character.chords.forEach(Object.freeze); Object.freeze(character.chords);
  return Object.freeze(character);
}

/** Keep the accepted melodic score; give drums a stable repeating role, and
 * derive the new pitched layers from one shared harmonic plan. */
export function arrangeCharacter(c: Composition, character: Character): readonly (readonly Hit[])[] {
  return Object.freeze(c.bars.map((original, bar) => {
    const section = c.sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
    const local = bar - section.start;
    const limit = section.name === "Build" && local === section.bars - 1 ? 16 : 32;
    const notes: Hit[] = original.filter(n => n.part !== "hat" && n.part !== "open").map(n => ({ ...n }));
    const add = (part: Hit["part"], tick: number, gate: number, velocity: number, degree = 0) => {
      if (tick < limit) notes.push({ part, tick, gate: Math.min(gate, limit - tick), velocity, degree });
    };
    // The same hat cell repeats through a section. Open hats no longer appear
    // opportunistically whenever a melodic rest happens to land on an offbeat.
    const openTicks: number[] = [];
    if (section.name === "Drive" || section.name === "Return" || section.name === "Build") {
      if (character.openEvery === 1) openTicks.push(4, 12, 20, 28);
      else if (local % character.openEvery === character.openEvery - 1) openTicks.push(character.openTick);
    }
    const step = section.name === "Space" ? 8 : section.name === "Opening" && local < 2 ? 4 : character.hatStep;
    for (let tick = 0; tick < limit; tick += step) {
      if (!openTicks.includes(tick)) add("hat", tick, 1, (tick % 8 === 4 ? 60 : tick % 4 === 0 ? 35 : 22));
    }
    for (const tick of openTicks) add("open", tick, 2, 48);
    const chord = character.chords[Math.floor(bar / character.chordBars) % character.chords.length]!;
    const active = section.name !== "Opening" || local >= 2;
    if (character.arp && active && section.name !== "Space") {
      const pool = [...chord, chord[0]! + c.identity.scale.length];
      for (let tick = 0; tick < limit; tick += character.arpStep) {
        if (original.some(n => n.part === "answer" && Math.abs(n.tick - tick) < 4)) continue;
        const position = tick / character.arpStep;
        const index = character.arpDirection === 0 ? position % pool.length : character.arpDirection === 1 ?
          pool.length - 1 - position % pool.length : [0, 2, 1, 3][position % 4]!;
        add("arp", tick, 1, tick % 8 === 0 ? 70 : 48, pool[index]!);
      }
    }
    if (character.pad && active) {
      for (const degree of chord) add("pad", 0, Math.min(30, limit - 2), section.name === "Space" ? 68 : 48, degree);
    }
    return Object.freeze(notes.sort((a, b) => a.tick - b.tick || (a.part < b.part ? -1 : a.part > b.part ? 1 : 0)).map(note => Object.freeze(note)));
  }));
}
