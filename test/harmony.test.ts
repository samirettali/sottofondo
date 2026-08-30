import { test } from "node:test";
import assert from "node:assert/strict";

import { chordTones, parseChord, voiceLead } from "../src/harmony/chords.ts";
import {
  CHARACTERISTIC,
  SCALES,
  degToMidi,
  intoRange,
  midiToDeg,
  pitchClasses,
  scaleOf,
} from "../src/harmony/scales.ts";

test("scales are ascending, start on the tonic and stay inside an octave", () => {
  for (const [name, scale] of Object.entries(SCALES)) {
    assert.equal(scale[0], 0, `${name} does not start on the tonic`);
    for (let i = 1; i < scale.length; i++) {
      assert.ok(scale[i]! > scale[i - 1]!, `${name} is not ascending`);
    }
    assert.ok(scale.at(-1)! < 12, `${name} exceeds an octave`);
  }
});

test("the modes are rotations of the major scale", () => {
  const rotate = (n: number) =>
    Array.from({ length: 7 }, (_, i) => ((SCALES.major[(i + n) % 7]! - SCALES.major[n]!) + 12) % 12);
  assert.deepEqual(rotate(1), [...SCALES.dorian]);
  assert.deepEqual(rotate(2), [...SCALES.phrygian]);
  assert.deepEqual(rotate(3), [...SCALES.lydian]);
  assert.deepEqual(rotate(4), [...SCALES.mixolydian]);
  assert.deepEqual(rotate(5), [...SCALES.minor]);
  assert.deepEqual(rotate(6), [...SCALES.locrian]);
});

test("the pentatonics contain no semitones and no tritone", () => {
  // This is why they are the safe fallback for dense or generated simultaneities.
  for (const name of ["majorPentatonic", "minorPentatonic"] as const) {
    const scale = SCALES[name];
    for (let i = 0; i < scale.length; i++) {
      for (let j = i + 1; j < scale.length; j++) {
        const interval = (scale[j]! - scale[i]! + 12) % 12;
        assert.notEqual(interval, 1, `${name} has a semitone`);
        assert.notEqual(interval, 6, `${name} has a tritone`);
        assert.notEqual(interval, 11, `${name} has a major seventh`);
      }
    }
  }
});

test("the characteristic degree really is the one that defines each mode", () => {
  for (const [name, info] of Object.entries(CHARACTERISTIC)) {
    const scale = scaleOf(name as keyof typeof SCALES);
    const reference = name === "lydian" || name === "mixolydian" ? SCALES.major : SCALES.minor;
    assert.notEqual(
      scale[info.degree],
      reference[info.degree],
      `${name}'s characteristic degree matches its reference scale`,
    );
  }
});

test("degrees convert to MIDI and back", () => {
  const scale = scaleOf("minor");
  assert.equal(degToMidi(0, scale, 0, 4), 48); // C4 in this convention
  assert.equal(degToMidi(7, scale, 0, 4), 60); // an octave up
  assert.equal(degToMidi(-7, scale, 0, 4), 36);
  for (let d = -14; d <= 14; d++) {
    assert.equal(midiToDeg(degToMidi(d, scale, 3, 4), scale, 3, 4), d, `degree ${d}`);
  }
});

test("a degree never lands outside the scale", () => {
  const scale = scaleOf("dorian");
  const allowed = new Set(scale);
  for (let d = -20; d <= 20; d++) {
    const pc = ((degToMidi(d, scale, 5, 4) - 5) % 12 + 12) % 12;
    assert.ok(allowed.has(pc), `degree ${d} produced pitch class ${pc}`);
  }
});

test("intoRange preserves the pitch class", () => {
  for (const n of [0, 37, 60, 127]) {
    const moved = intoRange(n, 48, 72);
    assert.ok(moved >= 48 && moved <= 72, `${n} -> ${moved}`);
    assert.equal(((moved - n) % 12 + 12) % 12, 0);
  }
});

test("roman numerals parse, with case carrying the third", () => {
  assert.deepEqual(parseChord("I").intervals, [0, 4, 7]);
  assert.deepEqual(parseChord("i").intervals, [0, 3, 7]);
  assert.equal(parseChord("IV").root, 5);
  assert.equal(parseChord("V").root, 7);
  assert.equal(parseChord("bVII").root, 10);
  assert.equal(parseChord("bVI").root, 8);
  assert.equal(parseChord("bII").root, 1);
});

test("suffixes carry everything above the third", () => {
  assert.deepEqual(parseChord("V7").intervals, [0, 4, 7, 10]);
  assert.deepEqual(parseChord("ii7").intervals, [0, 3, 7, 10]);
  assert.deepEqual(parseChord("Imaj7").intervals, [0, 4, 7, 11]);
  assert.deepEqual(parseChord("i9").intervals, [0, 3, 7, 10, 14]);
  assert.deepEqual(parseChord("Iadd9").intervals, [0, 4, 7, 14]);
  assert.deepEqual(parseChord("Isus4").intervals, [0, 5, 7]);
});

test("a bad chord symbol throws rather than transposing quietly", () => {
  assert.throws(() => parseChord("Q7"));
  assert.throws(() => parseChord("Ifoo"));
  assert.throws(() => parseChord(""));
});

test("chord tones land in the key", () => {
  // ii7 in C is D F A C.
  assert.deepEqual(chordTones(parseChord("ii7"), 0, 4), [50, 53, 57, 60]);
  // V7 in C is G B D F.
  assert.deepEqual(chordTones(parseChord("V7"), 0, 4), [55, 59, 62, 65]);
});

test("voicings stay in the register and ascend", () => {
  let previous: number[] | null = null;
  for (const symbol of ["i7", "iv7", "bVI", "V7", "i7"]) {
    const notes = voiceLead(parseChord(symbol), 9, previous, 55, 79);
    assert.ok(notes[0]! >= 55 && notes.at(-1)! <= 79, `${symbol} left the register: ${notes}`);
    for (let i = 1; i < notes.length; i++) {
      assert.ok(notes[i]! > notes[i - 1]!, `${symbol} has crossed voices`);
    }
    previous = notes;
  }
});

test("a voicing keeps the chord's pitch classes", () => {
  const chord = parseChord("Imaj7");
  const notes = voiceLead(chord, 5, null, 55, 79);
  assert.deepEqual(
    pitchClasses(notes),
    pitchClasses(chord.intervals.map((i) => 5 + chord.root + i)),
  );
});

// The artefact this exists to remove.
test("voice leading keeps chords from jumping around the register", () => {
  const progression = ["i7", "iv7", "bVII", "bIIImaj7", "i7", "V7"];
  let previous: number[] | null = null;
  let ledMotion = 0;
  let naiveMotion = 0;

  for (const symbol of progression) {
    const chord = parseChord(symbol);
    const led = voiceLead(chord, 9, previous, 55, 79);
    const naive = chordTones(chord, 9, 4);
    if (previous !== null) {
      ledMotion += totalMotion(previous, led);
      naiveMotion += totalMotion(previous, naive);
    }
    previous = led;
  }
  assert.ok(ledMotion < naiveMotion, `led ${ledMotion} vs naive ${naiveMotion} semitones`);
  // And in absolute terms: no voice should be leaping about.
  assert.ok(ledMotion / (progression.length - 1) < 12, `${ledMotion} semitones of motion`);
});

test("voice leading is deterministic", () => {
  const chord = parseChord("V7");
  const previous = [55, 59, 62, 67];
  assert.deepEqual(voiceLead(chord, 0, previous, 55, 79), voiceLead(chord, 0, previous, 55, 79));
});

test("an impossibly narrow register still yields notes", () => {
  const notes = voiceLead(parseChord("Imaj9"), 0, null, 60, 62);
  assert.ok(notes.length > 0);
  for (const n of notes) assert.ok(Number.isFinite(n));
});

function totalMotion(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += Math.abs(b[i]! - a[i]!);
  return sum;
}
