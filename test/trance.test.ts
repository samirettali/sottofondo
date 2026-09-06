import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createComposition } from "../src/composer/procedural.ts";
import { createCharacter } from "../src/composer/character.ts";
import { arrangeTrance, createTrance } from "../src/composer/trance.ts";
import { TRANCE_VOICES } from "../src/composer/trance-voices.ts";
import { createAudition, readPalette } from "../tools/procedural-score.ts";

test("both liked Character seeds remain frozen when the new version is added", () => {
  for (const [seed, expected, configuration] of [
    [30, "894c62c0430e6c574cee0aa934a5c8ec54484b1f8b1290c4e809d7e287e5b8fb", "775053f075de9034f56698544ed4476b31a50647d11f1f42181509d8a87b0fe7"],
    [0x9d2371fe, "28a6e73acba8b19cf7c962d180a5a2fe72f9a8f867bb8ef5dd4bd15178df083e", "a24f489830e955bb6b5e218e5e65d108ba30f3977db8b2a117d0f8f54b1895d2"],
  ] as const) {
    const a = createAudition(seed, "new", false, new Set(), "character");
    assert.equal(createHash("sha256").update(JSON.stringify(a.events)).digest("hex"), expected);
    assert.equal(createHash("sha256").update(JSON.stringify({ events: a.events, bpm: a.bpm, localSamples: a.localSamples, kickDesign: a.kickDesign })).digest("hex"), configuration);
    const t = createAudition(seed, "new", false, new Set(), "trance-1");
    const acid = (a: typeof t) => a.events.flat().filter(n => n.laneId === "acid").map(({ sound, ...event }) => event);
    assert.deepEqual(acid(t), acid(a));
    assert.notDeepEqual(t.events, a.events);
  }
  assert.equal(readPalette(null), "character");
  assert.throws(() => readPalette("trance-99"), /Unknown sound version/);
});

test("1,000 trance ensembles retain the acid and pulse, share harmony and reserve phrase space", () => {
  for (let seed = 0; seed < 1000; seed++) {
    const c = createComposition(seed), character = createCharacter(c), t = createTrance(c);
    const bars = arrangeTrance(c, character, t), scale = c.identity.scale;
    assert.deepEqual(t, createTrance(c));
    assert.ok(t.bpm >= 138 && t.bpm <= 146);
    assert.notEqual(t.voices.arp, t.voices.answer);
    for (const [bar, notes] of bars.entries()) {
      const section = c.sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
      const limit = section.name === "Build" && bar === section.start + section.bars - 1 ? 16 : 32;
      const chord = character.chords[Math.floor(bar / character.chordBars) % character.chords.length]!;
      for (const part of ["acid", "kick", "sub"]) assert.deepEqual(notes.filter(n => n.part === part), c.bars[bar]!.filter(n => n.part === part));
      for (const n of notes) {
        assert.ok(Number.isInteger(n.tick) && n.tick >= 0 && n.tick + n.gate <= limit);
        assert.ok(Number.isInteger(n.gate) && n.gate > 0 && n.velocity > 0 && n.velocity <= 100);
        if (["arp", "pad", "answer", "pulse"].includes(n.part)) assert.ok(chord.includes(n.degree % scale.length));
        if (n.part === "open") {
          assert.equal(n.tick % 8, 4);
          assert.ok(!notes.some(other => other.part === "hat" && other.tick === n.tick));
        }
        if (n.part === "texture") assert.ok(section.name === "Build" || section.name === "Return" && bar === section.start);
      }
      if (notes.some(n => n.part === "answer")) assert.ok(notes.filter(n => n.part === "arp").every(n => n.tick + n.gate <= 22));
      if (section.name === "Drive" && bar >= t.entrance) assert.ok(notes.some(n => n.part === "arp"));
      if (section.name === "Space") assert.ok(!notes.some(n => n.part === "arp" || n.part === "pulse"));
    }
    assert.ok(Object.isFrozen(bars[0]![0]));
  }
});

test("ensemble diversity includes instrumentation, rhythmic roles and pitch figures", () => {
  const voices = new Set<string>(), ensembles = new Set<string>(), figures = new Set<string>(), rhythms = new Set<string>();
  for (let seed = 0; seed < 256; seed++) {
    const c = createComposition(seed), t = createTrance(c), bars = arrangeTrance(c, createCharacter(c), t);
    Object.values(t.voices).forEach(id => voices.add(id));
    ensembles.add(Object.values(t.voices).join("/"));
    figures.add(t.figure.join(","));
    rhythms.add(bars.map(notes => notes.filter(n => ["arp", "pad", "answer", "pulse"].includes(n.part)).map(n => `${n.part}:${n.tick}:${n.gate}`).join(",")).join("/"));
  }
  assert.equal(voices.size, Object.keys(TRANCE_VOICES).length);
  assert.ok(ensembles.size >= 220, `ensembles: ${ensembles.size}`);
  assert.ok(figures.size >= 240, `figures: ${figures.size}`);
  assert.ok(rhythms.size >= 200, `arranged rhythms: ${rhythms.size}`);
});

test("new ensembles seek, loop and mute without changing other parts or their sounds", () => {
  const muted = new Set<string>(), a = createAudition(0x9d2371fe, "new", false, muted, "trance-1");
  const query = (begin: number, end: number) => a.pattern.queryArc(begin, end).filter(h => h.hasOnset()).map(h => h.value);
  const original = query(0, 32);
  query(500, 504);
  assert.deepEqual(Array.from({ length: 128 }, (_, i) => query(i / 4, (i + 1) / 4)).flat(), original);
  muted.add("arp"); assert.deepEqual(query(0, 32), original.filter(n => n.laneId !== "arp"));
  muted.clear(); assert.deepEqual(query(32, 64).map(n => ({ ...n, begin: n.begin - 32, end: n.end - 32 })), original);
  assert.deepEqual(createAudition(30, "new", true, new Set(), "trance-1").events, createAudition(30, "new", true).events);
});
