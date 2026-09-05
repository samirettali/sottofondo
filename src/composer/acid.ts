import { getPatch, KITS, type DrumId } from "./catalog.ts";
import { degreeMidi, draw, freeze, sectionFor, type Cell, type SongPlan } from "./plan.ts";
import type { ComposerEvent } from "./compose.ts";

export interface AcidPerformance {
  cutoff: readonly number[];
  cutoffBars: number;
  envelope: readonly number[];
  decay: readonly number[];
  accents: readonly number[];
  hats: readonly number[];
  fill: number;
  reply: number;
}

// These are performance gestures, not independent random knob values. Their clocks
// deliberately differ: a four-bar riff can return under a different filter opening.
const CUTOFF = [[.55, 1, 2.15, 4.3], [.7, 2.6, 1.2, 4.6], [1.6, .6, 3.7, 1.1], [.5, 1.35, 3, 5.2]];
const ACCENTS = [[.85, .54, .62, 1], [1, .5, .76, .58], [.7, 1, .5, .8], [1, .62, .86, .5]];
const HATS = [[.44, .18, .3, .18], [.36, .16, .48, .2], [.42, .24, .3, .16], [.32, .18, .46, .22]];
const FILLS = [[10, 12, 14, 15, 15.5], [12, 13.5, 14, 15], [11, 12, 14, 14.5, 15.5], [12, 14, 15, 15.5]];

/** A short tonic-centred riff, then four related variations with distinct cadences.
 * The register jumps and blue notes are intentional; a smooth scalar random walk
 * suppresses precisely the gestures that give this kind of acid line its identity.
 */
function phrase(seed: number, which: number, performance: AcidPerformance): Cell[] {
  const domain = `acid/phrase/${which}`;
  const bag = [0, 0, 0, 6, 6, 1, 2, 3, 4, 5, 7];
  const riff = Array.from({ length: 16 }, (_, step) => step % 4 === 0 ? 0 : bag[draw(seed, `${domain}/pitch`, step, bag.length)]!);
  const rests = Array.from({ length: 14 }, (_, i) => i + 1)
    .sort((a, b) => draw(seed, `${domain}/rest`, a) - draw(seed, `${domain}/rest`, b) || a - b)
    .slice(0, 3 + draw(seed, `${domain}/space`, 0, 3));
  const cells: Cell[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const holes = new Set(rests.map(step => 1 + (step - 1 + bar * 3) % 14));
    for (let step = 0; step < 16; step++) {
      if (holes.has(step)) continue;
      const degree = step === 15 ? [6, 5, 3, 0][bar]! : step === 0 ? 0 :
        bar > 0 && (step + bar) % 5 === 0 ? bag[draw(seed, `${domain}/variation/${bar}`, step, bag.length)]! : riff[step]!;
      const velocity = performance.accents[step % 4]! * (step >= 12 && bar === 3 ? .95 : 1);
      cells.push({ step: bar * 16 + step, degree, length: .8 + draw(seed, `${domain}/gate`, step, 3) * .15,
        velocity, accent: velocity >= .84,
        slide: step < 15 && !holes.has(step + 1) && draw(seed, `${domain}/slide/${bar}`, step, 4) === 0 });
    }
  }
  return cells;
}

export function developAcidPlan(base: SongPlan): SongPlan {
  const seed = base.seed;
  const performance: AcidPerformance = {
    cutoff: CUTOFF[draw(seed, "acid/cutoff", 0, CUTOFF.length)]!,
    cutoffBars: [2, 4][draw(seed, "acid/cutoff-clock", 0, 2)]!,
    envelope: [0, 1, 2, 3].map(i => [.8, 1, 1.25, 1.5][(i + draw(seed, "acid/envelope-phase", 0, 4)) % 4]!),
    decay: [0, 1, 2, 3].map(i => [.55, .85, .6, 1.15][(i + draw(seed, "acid/decay-phase", 0, 4)) % 4]!),
    accents: ACCENTS[draw(seed, "acid/accents", 0, ACCENTS.length)]!,
    hats: HATS[draw(seed, "acid/hats", 0, HATS.length)]!,
    fill: draw(seed, "acid/fill", 0, FILLS.length), reply: draw(seed, "acid/reply", 0, 4),
  };
  return freeze({ ...base, performance, motifBars: 4,
    // Minor blues: tonic, minor third, fourth, tritone, fifth, minor seventh.
    scale: [0, 3, 5, 6, 7, 10], motifs: [phrase(seed, 0, performance), phrase(seed, 1, performance)],
    roles: base.roles.map(role => ({ ...role,
      register: role.id === "bass" ? 36 : role.register,
      density: role.id === "answer" ? .7 : Math.max(.7, role.density),
    })) });
}

/** Phrase-level drum conditions and independently clocked timbral sequences.
 * All lanes share this score before the UI applies any mute or density controls.
 */
export function composeAcidBar(p: SongPlan, bar: number): ComposerEvent[] {
  const perf = p.performance!;
  const section = sectionFor(p, bar);
  const local = bar - section.start;
  const cycle = local % 16;
  const intro = section.name === "present" || section.name === "reprise";
  const contrast = section.name === "contrast";
  const build = section.name === "build";
  const last = local === section.bars - 1;
  const breakStep = build && last ? 8 : cycle === 15 ? 8 : 16;
  const energy = build ? .35 + .6 * local / section.bars : section.energy;
  const events: ComposerEvent[] = [];
  const add = (id: string, patchId: string, step: number, length: number, velocity: number, extra: Partial<ComposerEvent> = {}) => {
    if (build && last && step >= breakStep) return;
    const drum = Object.hasOwn(KITS.round, id);
    const swing = step % 2 === 1 && id !== "kick" && id !== "backbeat" ? (p.swing - .5) / 8 : 0;
    events.push({ laneId: id, patchId, kind: drum ? "drum" : id === "bass" ? "bass" : "chords",
      begin: bar + step / 16 + swing, end: Math.min(bar + (step + length) / 16 + swing, section.start + section.bars),
      velocity, accent: velocity >= .84, brightness: .7 + energy * .5, space: p.space / 100,
      pan: id === "hat" ? .1 : id === "open" ? -.1 : id === "bass" || id === "kick" ? 0 : (draw(p.seed, `pan/${id}`, 0, 61) - 30) / 100,
      densityRank: draw(p.seed, `density/${id}`, (bar % 32) * 32 + Math.round(step * 2), 100) / 100, ...extra });
  };
  const drum = (id: DrumId, step: number, velocity: number, length = .65, extra: Partial<ComposerEvent> = {}) =>
    add(id, `sample:${KITS[p.kit][id]}`, step, length, velocity, { instrument: id, ...extra });

  if (!contrast) for (const step of [0, 4, 8, 12]) if (step < breakStep) drum("kick", step, .96);
  if (!contrast && (!intro || local >= 4)) for (const step of [4, 12])
    drum("backbeat", step, cycle < 12 ? .72 : .86, 1.2, { room: .12 });
  for (let step = 0; step < 16; step++) {
    if (contrast && step % 4 !== 2) continue;
    drum("hat", step, perf.hats[step % 4]! * (contrast ? .65 : 1), .45);
  }
  if (!contrast && section.name !== "release" && (!intro || local >= 8)) {
    for (const step of [2, 6, 10, 14]) drum("open", step, cycle < 12 ? .48 : .6, 1.4);
  }
  // A small fourth-bar reply, a longer eighth-bar roll, and a half-bar kick gap
  // before each sixteen-bar return. Fills keep their own snare voice and room send.
  if (!contrast && local % 4 === 3) {
    const positions = local % 8 === 7 ? [8, 10, ...FILLS[perf.fill]!] : FILLS[perf.fill]!;
    for (const step of [...new Set(positions)]) drum("perc", step, .34 + (step - 8) / 20, .6,
      { patchId: "sample:elec_hi_snare", room: .15 });
  } else if (!intro && !contrast && local % 2 === 1) {
    for (const step of [3 + perf.reply, 11 + perf.reply]) drum("perc", step, .32, .8);
  }

  const cells = p.motifs[section.motif]!.filter(cell => Math.floor(cell.step / 16) === bar % 4);
  for (const role of p.roles.filter(role => !Object.hasOwn(KITS.round, role.id))) {
    const patch = getPatch(role.patch);
    if (role.id === "bass") {
      for (const cell of cells) {
        let step = cell.step % 16;
        if (contrast && step >= 8) continue;
        if (section.transform === 1) step = (step + 2) % 16;
        const degree = cell.degree + (section.transform === 3 && step >= 12 ? p.scale.length : 0);
        add(role.id, role.patch, step, cell.length, cell.velocity, {
          midi: degreeMidi(p, degree, role.register), slide: cell.slide,
          brightness: perf.cutoff[Math.floor(bar / perf.cutoffBars) % 4]! * (contrast ? .5 : .8 + energy * .3),
          envelope: perf.envelope[Math.floor(bar / 4) % 4]!, decay: perf.decay[bar % 4]!, expression: cell.velocity,
        });
      }
    } else if (role.id === "lead" || role.id === "answer") {
      // Counterlines occupy phrase endings instead of doubling every acid note.
      if (intro && local < 8) continue;
      if (role.id === "lead" ? local % 4 < 2 : local % 8 !== 7) continue;
      const positions = role.id === "answer" ? [9, 12 + perf.reply] : [2 + perf.reply, 10 + perf.reply];
      for (const [i, step] of positions.entries()) {
        const degree = cells[(i * 3 + perf.reply) % cells.length]!.degree % p.scale.length;
        add(role.id, role.patch, step, 1.4, role.id === "answer" ? .38 : .42,
          { notes: [degreeMidi(p, degree, role.register)], space: Math.min(.8, p.space / 100 + .15) });
      }
    } else if (patch.role === "pad") {
      if (bar % 4 === 0 && (!intro || local >= 4)) add(role.id, role.patch, 0, 28, .4,
        { notes: [degreeMidi(p, 0, role.register), degreeMidi(p, 4, role.register)] });
    } else if (local % 4 === 2 && (!intro || local >= 4)) {
      add(role.id, role.patch, 6 + perf.reply, 4, .38, { notes: [degreeMidi(p, 0, role.register)] });
    }
  }
  if (build && !last && local >= section.bars - 4) add("support", "air", 0, 15, .4,
    { notes: [72], brightness: .5 + local / section.bars });

  const bass = events.filter(event => event.kind === "bass").sort((a, b) => a.begin - b.begin);
  for (let i = 0; i < bass.length; i++) {
    const event = bass[i]!, next = bass[i + 1];
    if (next && event.slide && next.begin - event.begin <= 2 / 16) { event.end = next.begin; next.glide = true; }
    else { event.slide = false; if (next) event.end = Math.min(event.end, next.begin); }
  }
  return events.sort((a, b) => a.begin - b.begin || (a.laneId < b.laneId ? -1 : a.laneId > b.laneId ? 1 : 0));
}
