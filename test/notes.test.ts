import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chooseNoteSet,
  defaultNoteVoice,
  realiseNotes,
  type PitchBag,
} from "../src/pattern/notes.ts";

const LEN = 16;

/** The eight interval bags of the reference implementation, kept as the acid baseline. */
const BAGS: readonly PitchBag[] = [
  [0, 0, 12, 24, 27],
  [0, 0, 0, 12, 10, 19, 26, 27],
  [0, 1, 7, 10, 12, 13],
  [0],
  [0, 0, 0, 12],
  [0, 0, 12, 14, 15, 19],
  [0, 0, 0, 0, 12, 13, 16, 19, 22, 24, 25],
  [0, 0, 0, 7, 12, 15, 17, 20, 24],
];

const ROOT_RANGE = [28, 42] as const;

test("a note set is deterministic and inside the root range", () => {
  for (let epoch = 0; epoch < 50; epoch++) {
    const a = chooseNoteSet(BAGS, ROOT_RANGE, 5, epoch, 0);
    assert.deepEqual(a, chooseNoteSet(BAGS, ROOT_RANGE, 5, epoch, 0));
    assert.ok(a.root >= ROOT_RANGE[0] && a.root <= ROOT_RANGE[1], `root ${a.root}`);
    assert.ok(BAGS.includes(a.bag));
  }
});

test("note sets vary across epochs and cover every bag", () => {
  const bags = new Set<PitchBag>();
  const roots = new Set<number>();
  for (let epoch = 0; epoch < 300; epoch++) {
    const s = chooseNoteSet(BAGS, ROOT_RANGE, 5, epoch, 0);
    bags.add(s.bag);
    roots.add(s.root);
  }
  assert.equal(bags.size, BAGS.length);
  assert.ok(roots.size > 10, `only ${roots.size} distinct roots`);
});

test("repetition in a bag is the weighting", () => {
  // [0,0,0,12] should give the root about three times as often as the octave.
  const set = { root: 36, bag: [0, 0, 0, 12] as PitchBag };
  const voice = defaultNoteVoice({ density: 0.9 });
  let roots = 0;
  let octaves = 0;
  for (let bar = 0; bar < 400; bar++) {
    for (const slot of realiseNotes(voice, set, LEN, 1, bar, 0)) {
      if (slot.midi === 36) roots++;
      else if (slot.midi === 48) octaves++;
    }
  }
  const ratio = roots / octaves;
  assert.ok(ratio > 2.4 && ratio < 3.6, `root:octave was ${ratio.toFixed(2)}`);
});

test("every pitch comes from the bag, transposed by the root", () => {
  const set = { root: 33, bag: [0, 1, 7, 10, 12, 13] as PitchBag };
  const voice = defaultNoteVoice({ density: 0.8 });
  for (let bar = 0; bar < 64; bar++) {
    for (const slot of realiseNotes(voice, set, LEN, 2, bar, 0)) {
      assert.ok(set.bag.includes(slot.midi - set.root), `midi ${slot.midi}`);
    }
  }
});

test("a single-entry bag gives a drone", () => {
  const set = { root: 30, bag: [0] as PitchBag };
  const voice = defaultNoteVoice({ density: 0.8 });
  for (const slot of realiseNotes(voice, set, LEN, 3, 0, 0)) {
    assert.equal(slot.midi, 30);
  }
});

test("accent and slide probabilities are honoured", () => {
  const set = { root: 36, bag: [0, 12] as PitchBag };
  const voice = defaultNoteVoice({ density: 0.9, accentP: 0.3, slideP: 0.1 });
  let notes = 0;
  let accents = 0;
  let slides = 0;
  for (let bar = 0; bar < 500; bar++) {
    for (const slot of realiseNotes(voice, set, LEN, 4, bar, 0)) {
      notes++;
      if (slot.accent) accents++;
      if (slot.slide) slides++;
    }
  }
  assert.ok(Math.abs(accents / notes - 0.3) < 0.04, `accents ${accents / notes}`);
  assert.ok(Math.abs(slides / notes - 0.1) < 0.03, `slides ${slides / notes}`);
});

test("a slide glides the NEXT note, and only when it is adjacent", () => {
  const set = { root: 36, bag: [0, 12] as PitchBag };
  const voice = defaultNoteVoice({ density: 1, slideP: 1 });
  for (let bar = 0; bar < 32; bar++) {
    const slots = realiseNotes(voice, set, LEN, 6, bar, 0);
    for (let i = 0; i < slots.length; i++) {
      const previous = slots[i - 1];
      const adjacent = previous !== undefined && slots[i]!.step === previous.step + 1;
      assert.equal(slots[i]!.glide, adjacent, `bar ${bar} slot ${i}`);
    }
  }
});

test("no slides means no glides", () => {
  const set = { root: 36, bag: [0, 12] as PitchBag };
  const voice = defaultNoteVoice({ density: 1, slideP: 0 });
  for (const slot of realiseNotes(voice, set, LEN, 7, 0, 0)) {
    assert.equal(slot.glide, false);
    assert.equal(slot.slide, false);
  }
});

test("accented notes take the accent velocity", () => {
  const set = { root: 36, bag: [0] as PitchBag };
  const voice = defaultNoteVoice({ density: 0.9 });
  for (const slot of realiseNotes(voice, set, LEN, 8, 3, 0)) {
    if (slot.accent) assert.equal(slot.velocity, voice.vel.accent);
  }
});

test("density still controls how many notes there are", () => {
  const set = { root: 36, bag: [0, 12] as PitchBag };
  const count = (density: number) => {
    let n = 0;
    for (let bar = 0; bar < 100; bar++) {
      n += realiseNotes(defaultNoteVoice({ density }), set, LEN, 9, bar, 0).length;
    }
    return n;
  };
  assert.ok(count(0.3) < count(0.6));
  assert.ok(count(0.6) < count(0.9));
  assert.equal(count(0), 0);
});

test("the same bar always produces the same notes", () => {
  const set = { root: 36, bag: [0, 3, 7, 12] as PitchBag };
  const voice = defaultNoteVoice({ density: 0.7 });
  assert.deepEqual(
    realiseNotes(voice, set, LEN, 12, 41, 0),
    realiseNotes(voice, set, LEN, 12, 41, 0),
  );
});

test("slots come out in step order", () => {
  const set = { root: 36, bag: [0, 12] as PitchBag };
  const voice = defaultNoteVoice({ density: 0.8 });
  for (let bar = 0; bar < 32; bar++) {
    const steps = realiseNotes(voice, set, LEN, 13, bar, 0).map((s) => s.step);
    assert.deepEqual(steps, [...steps].sort((a, b) => a - b));
  }
});
