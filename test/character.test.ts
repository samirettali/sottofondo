import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createComposition } from "../src/composer/procedural.ts";
import { arrangeCharacter, createCharacter } from "../src/composer/character.ts";
import { createAudition } from "../tools/procedural-score.ts";

test("the liked 0000001e original audition remains exactly reproducible", () => {
  const a = createAudition(30, "new", false, new Set(), "original");
  assert.equal(createHash("sha256").update(JSON.stringify(a.events)).digest("hex"),
    "044c248790b490f14243b5c9e167322bb7e0219f01cf2f30ac459be6fa9028ea");
});

test("1,000 character arrangements preserve the melodic score and coordinate hats and harmony", () => {
  for (let seed = 0; seed < 1000; seed++) {
    const c = createComposition(seed), character = createCharacter(c), arranged = arrangeCharacter(c, character);
    assert.deepEqual(createCharacter(c), character);
    for (const [bar, notes] of arranged.entries()) {
      const melodic = (part: string) => ["acid", "sub", "answer"].includes(part);
      assert.deepEqual(notes.filter(n => melodic(n.part)), c.bars[bar]!.filter(n => melodic(n.part)));
      const chord = character.chords[Math.floor(bar / character.chordBars) % character.chords.length]!;
      const section = c.sections.find(s => bar >= s.start && bar < s.start + s.bars)!;
      const limit = section.name === "Build" && bar === section.start + section.bars - 1 ? 16 : 32;
      for (const note of notes) {
        assert.ok(Number.isInteger(note.tick) && note.tick >= 0 && note.tick + note.gate <= limit);
        assert.ok(Number.isInteger(note.gate) && note.gate > 0 && note.velocity > 0 && note.velocity <= 100);
        if (note.part === "arp" || note.part === "pad") assert.ok(chord.includes(note.degree % c.identity.scale.length));
        if (note.part === "open") {
          assert.equal(note.tick % 8, 4, "open hats occupy offbeats");
          assert.ok(!notes.some(n => n.part === "hat" && n.tick === note.tick));
        }
      }
      const pads = notes.filter(n => n.part === "pad");
      if (pads.length) assert.deepEqual(pads.map(n => n.degree), chord);
      const previous = bar - character.openEvery;
      if (previous >= section.start && limit === 32) {
        const hats = (b: number) => arranged[b]!.filter(n => n.part === "open").map(n => [n.tick, n.velocity]);
        assert.deepEqual(hats(bar), hats(previous), "cymbal cadence repeats within a section");
      }
    }
  }
});

test("character changes sound and orchestration while retaining accepted note timings and pitches", () => {
  const models = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6, 30]) {
    const original = createAudition(seed, "new", false, new Set(), "original"), character = createAudition(seed);
    const melody = (a: typeof original) => a.events.flat().filter(n => ["acid", "answer", "sub"].includes(n.laneId))
      .map(({ sound, ...note }) => note);
    assert.deepEqual(melody(character), melody(original));
    assert.equal(character.bpm, original.bpm);
    models.add(character.character!.kick.model);
    assert.ok(character.events.flat().some(n => n.laneId === "arp" || n.laneId === "pad"));
    assert.ok(!Object.hasOwn(character.localSamples!, "bd"), "synth kick needs no sample");
    assert.deepEqual(createAudition(seed, "new", true).events, createAudition(seed, "new", true, new Set(), "original").events);
  }
  assert.equal(models.size, 3);
});
