import { test } from "node:test";
import assert from "node:assert/strict";
import { createComposition, composeAccompaniment, consonant, overlaps, semitone, type Note } from "../src/composer/procedural.ts";
import { createAudition } from "../tools/procedural-score.ts";

test("1,000 seeds satisfy range, timing, monophony, supporting harmony and arrangement constraints", () => {
  for (let seed = 0; seed < 1000; seed++) {
    const c = createComposition(seed), id = c.identity;
    assert.equal(c.sections.reduce((sum, s) => sum + s.bars, 0), 32);
    assert.equal(c.sections.at(-1)!.name, "Return");
    for (const [bar, notes] of c.bars.entries()) {
      const acid = notes.filter(n => n.part === "acid");
      assert.ok(acid.length > 0, `silent acid: ${seed}/${bar}`);
      for (const n of notes) {
        assert.ok(Number.isInteger(n.tick) && n.tick >= 0 && n.tick < 32);
        assert.ok(Number.isInteger(n.gate) && n.gate > 0 && n.tick + n.gate <= 32);
        assert.ok(n.velocity > 0 && n.velocity <= 100);
        assert.ok(n.degree >= 0 && n.degree < id.scale.length * 2);
      }
      for (const [i, a] of acid.entries()) for (const b of acid.slice(i + 1)) assert.ok(!overlaps(a, b));
      for (const a of notes.filter(n => n.part === "answer" || n.part === "sub")) {
        for (const b of acid.filter(b => overlaps(a, b))) {
          assert.ok(consonant(id.scale, a.degree, b.degree), `clash: ${seed}/${bar}`);
          assert.notEqual(a.part, "answer", "answers must occupy acid gaps");
        }
      }
      const replies = notes.filter(n => n.part === "answer");
      for (const [i, a] of replies.entries()) for (const b of replies.slice(i + 1)) {
        assert.ok(!overlaps({ ...a, gate: a.gate + 2 }, { ...b, gate: b.gate + 2 }), "reply releases must leave space");
      }
      for (const a of notes.filter(n => n.part === "open")) assert.ok(!notes.some(n => n.part === "hat" && n.tick === a.tick));
      const section = c.sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
      if (section.name === "Build" && bar === section.start + section.bars - 1) assert.ok(notes.every(n => n.tick + n.gate <= 16));
    }
    for (const motif of c.motifs.slice(0, 2)) {
      for (let i = 1; i < motif.length; i++) assert.ok(Math.abs(semitone(id.scale, motif[i]!.degree) - semitone(id.scale, motif[i - 1]!.degree)) <= 12);
    }
  }
});

test("supporting parts respond to the actual acid score, not only to the seed", () => {
  const id = { ...createComposition(4).identity, sub: true };
  const section = { name: "Drive" as const, start: 4, bars: 8 };
  const empty: Note[] = [], dense = Array.from({ length: 16 }, (_, i) => ({ tick: i * 2, gate: 2, velocity: 95, degree: id.scale.indexOf(7) }));
  const a = composeAccompaniment(id, empty, 4, section), b = composeAccompaniment(id, dense, 4, section);
  assert.ok(a.some(n => n.part === "answer"));
  assert.ok(!b.some(n => n.part === "answer"));
  assert.notDeepEqual(a.filter(n => n.part === "hat" || n.part === "open"), b.filter(n => n.part === "hat" || n.part === "open"));
  // A second/minor seventh against the tonic cannot keep a tonic sub underneath.
  const second = { tick: 0, gate: 8, degree: id.scale.length - 1, velocity: 90 };
  const c = composeAccompaniment(id, [second], 4, section);
  assert.ok(c.filter(n => n.part === "sub" && overlaps(n, second)).every(n => consonant(id.scale, n.degree, second.degree)));
  assert.notDeepEqual(c.filter(n => n.part === "sub"), a.filter(n => n.part === "sub"));
});

test("seed diversity survives removing key, tempo, timbre and absolute register", () => {
  const rhythms = new Set<string>(), pitches = new Set<string>(), combinations = new Set<string>(), forms = new Set<string>();
  let nearlyMonotone = 0;
  for (let seed = 1; seed <= 256; seed++) {
    const c = createComposition(seed), n = c.motifs[0]!, scale = c.identity.scale;
    const rhythm = n.map(n => n.tick).join(","), pitch = n.map(n => semitone(scale, n.degree) % 12).join(",");
    rhythms.add(rhythm); pitches.add(pitch); combinations.add(`${rhythm}/${pitch}`);
    forms.add(c.sections.map(s => `${s.name}/${s.bars}`).join(","));
    if (new Set(n.map(n => n.degree % scale.length)).size < 3) nearlyMonotone++;
  }
  assert.ok(rhythms.size > 180, `rhythms: ${rhythms.size}`);
  assert.ok(pitches.size > 220, `pitch sequences: ${pitches.size}`);
  assert.equal(combinations.size, 256);
  assert.ok(forms.size >= 4);
  assert.ok(nearlyMonotone < 32, `tonal collapse: ${nearlyMonotone}/256`);
});

test("seeking, fragmented queries, looping and muting cannot regenerate the composition", () => {
  const muted = new Set<string>(), a = createAudition(5, "new", false, muted);
  const collect = (begin: number, end: number) => a.pattern.queryArc(begin, end).filter(h => h.hasOnset()).map(h => h.value);
  const snapshot = collect(0, 32), future = collect(12, 16);
  collect(500, 504); assert.deepEqual(collect(12, 16), future);
  const fragments = Array.from({ length: 256 }, (_, i) => collect(i / 8, (i + 1) / 8));
  assert.deepEqual(fragments.flat(), snapshot);
  muted.add("acid"); assert.deepEqual(collect(0, 32), snapshot.filter(n => n.laneId !== "acid"));
  muted.clear(); assert.deepEqual(collect(0, 32), snapshot);
  assert.deepEqual(collect(32, 64).map(n => ({ ...n, begin: n.begin - 32, end: n.end - 32 })), snapshot);
  assert.deepEqual(createComposition(5), a.composition);
  assert.ok(Object.isFrozen(a.composition.bars[0]![0]));
});

test("both comparisons use the same local bank, tempo and synthesis adapter", () => {
  for (const fixed of [false, true]) {
    const a = createAudition(7, "new", fixed), b = createAudition(7, "previous", fixed);
    assert.deepEqual(a.localSamples, b.localSamples); assert.equal(a.bpm, b.bpm);
    assert.equal(a.events[0]!.find(n => n.laneId === "acid")!.sound.s, b.events[0]!.find(n => n.laneId === "acid")!.sound.s);
    assert.notDeepEqual(a.events, b.events);
    for (const audition of [a, b]) for (const n of audition.events.flat()) {
      assert.ok(n.end > n.begin);
      if (n.kind === "drum") assert.equal(n.sound.bank, "Local");
      else assert.ok(Number.isFinite(n.sound.note));
    }
  }
});
