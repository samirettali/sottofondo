import { test } from "node:test";
import assert from "node:assert/strict";

import {
  barChaos,
  defaultVoice,
  realise,
  strengths,
  type VoicePattern,
} from "../src/pattern/gen.ts";
import { byStrength, metricWeight, shapedWeight } from "../src/pattern/metric.ts";

const LEN = 16;
const stepsOf = (hits: { step: number }[]) => hits.map((h) => h.step);

test("metric weight ranks the downbeat above beat 3, above 2 and 4, above the rest", () => {
  const w = (i: number) => metricWeight(i, LEN);
  assert.ok(w(0) > w(8));
  assert.ok(w(8) > w(4));
  assert.ok(w(4) > w(2));
  assert.ok(w(2) > w(1));
});

test("metric weight is defined for any length", () => {
  for (const len of [4, 5, 7, 8, 12, 16, 24, 32]) {
    for (let i = 0; i < len; i++) {
      const w = metricWeight(i, len);
      assert.ok(w > 0 && w <= 1, `len ${len} step ${i} gave ${w}`);
    }
    assert.equal(metricWeight(0, len), 1, `len ${len} downbeat`);
  }
});

test("syncopation changes how far the strong steps outrank the weak ones", () => {
  // The absolute weights all shrink under a higher exponent, so what matters is the
  // ratio between a strong step and a weak one.
  const ratio = (syn: number) => shapedWeight(0, LEN, syn) / shapedWeight(1, LEN, syn);
  assert.ok(ratio(2) > ratio(1), "above 1 should sharpen the hierarchy");
  assert.ok(ratio(0.5) < ratio(1), "below 1 should flatten it");
  assert.equal(ratio(1), metricWeight(0, LEN) / metricWeight(1, LEN));
});

test("byStrength orders the downbeat first and the offbeat sixteenths last", () => {
  const order = byStrength(LEN);
  assert.equal(order[0], 0);
  assert.ok(order.indexOf(8) < order.indexOf(4));
  assert.ok(order.indexOf(4) < order.indexOf(1));
});

test("a mask puts strength only where it was asked to", () => {
  const v = defaultVoice({ type: "mask", steps: [0, 4, 8, 12] });
  const s = strengths(v, LEN, 1, 0, 0);
  for (let i = 0; i < LEN; i++) {
    assert.equal(s[i]! > 0, i % 4 === 0, `step ${i}`);
  }
});

test("a mask still discriminates: the downbeat outweighs the backbeat", () => {
  const v = defaultVoice({ type: "mask", steps: [0, 4, 8, 12] });
  const s = strengths(v, LEN, 1, 0, 0);
  assert.ok(s[0]! > s[8]!);
  assert.ok(s[8]! > s[4]!);
});

test("a euclid generator reproduces its pattern", () => {
  const v = defaultVoice({ type: "euclid", k: 3, n: 8 });
  const s = strengths(v, 8, 1, 0, 0);
  assert.deepEqual(s.map((x) => (x > 0 ? 1 : 0)), [1, 0, 0, 1, 0, 0, 1, 0]);
});

test("a clave generator reproduces its timeline", () => {
  const v = defaultVoice({ type: "clave", name: "son" });
  const s = strengths(v, LEN, 1, 0, 0);
  assert.deepEqual(
    s.map((x) => (x > 0 ? "x" : ".")).join(""),
    "x..x..x...x.x...",
  );
});

test("none is silent at any density", () => {
  const v = defaultVoice({ type: "none" }, { density: 1 });
  assert.deepEqual(realise(v, LEN, 1, 0, 0), []);
});

test("density is a threshold sweep: raising it only ever adds hits", () => {
  const gen = { type: "stepClassP" } as const;
  let previous: number[] = [];
  for (let d = 0; d <= 1.0001; d += 0.05) {
    const hits = stepsOf(realise(defaultVoice(gen, { density: d }), LEN, 7, 3, 0));
    for (const step of previous) {
      assert.ok(hits.includes(step), `step ${step} disappeared at density ${d.toFixed(2)}`);
    }
    previous = hits;
  }
});

test("density admits the strongest steps first", () => {
  const gen = { type: "stepClassP" } as const;
  const sparse = realise(defaultVoice(gen, { density: 0.35 }), LEN, 11, 0, 0);
  const dense = realise(defaultVoice(gen, { density: 0.9 }), LEN, 11, 0, 0);
  const weakestSparse = Math.min(...sparse.map((h) => h.strength));
  const added = dense.filter((h) => !sparse.some((x) => x.step === h.step));
  for (const h of added) {
    assert.ok(h.strength <= weakestSparse + 1e-9, `added a stronger step: ${h.strength}`);
  }
});

test("density 0 is silence and density 1 is everything the generator weighted", () => {
  const gen = { type: "stepClassP" } as const;
  assert.deepEqual(realise(defaultVoice(gen, { density: 0 }), LEN, 5, 0, 0), []);
  const full = realise(defaultVoice(gen, { density: 1 }), LEN, 5, 0, 0);
  const weighted = strengths(defaultVoice(gen), LEN, 5, 0, 0).filter((x) => x > 0).length;
  assert.equal(full.length, weighted);
});

test("stepClassP favours the beats", () => {
  const gen = { type: "stepClassP" } as const;
  let onBeat = 0;
  let offBeat = 0;
  for (let bar = 0; bar < 400; bar++) {
    for (const h of realise(defaultVoice(gen, { density: 0.5 }), LEN, 99, bar, 0)) {
      if (h.step % 4 === 0) onBeat++;
      else offBeat++;
    }
  }
  assert.ok(onBeat > offBeat, `${onBeat} on the beat vs ${offBeat} off it`);
});

test("inverted stepClassP prefers exactly what the beat is not", () => {
  const gen = { type: "stepClassP", invert: true } as const;
  const v = defaultVoice(gen, { density: 0.5 });
  let onBeat = 0;
  let offBeat = 0;
  for (let bar = 0; bar < 400; bar++) {
    for (const h of realise(v, LEN, 55, bar, 0)) {
      if (h.step % 4 === 0) onBeat++;
      else offBeat++;
    }
  }
  assert.ok(offBeat > onBeat * 3, `${offBeat} off the beat vs ${onBeat} on it`);
});

test("inverting is not the same as flattening", () => {
  // Flattening reduces how much the strong positions win by; they still win. Only
  // inverting makes the weak positions the likely ones.
  const flat = defaultVoice({ type: "stepClassP" }, { density: 0.5, syncopation: 0.4 });
  const inverted = defaultVoice({ type: "stepClassP", invert: true }, { density: 0.5 });
  const downbeatRate = (v: VoicePattern) => {
    let hits = 0;
    for (let bar = 0; bar < 300; bar++) {
      if (realise(v, LEN, 12, bar, 0).some((h) => h.step === 0)) hits++;
    }
    return hits / 300;
  };
  assert.ok(downbeatRate(flat) > 0.7, "flattening should still favour the downbeat");
  assert.ok(downbeatRate(inverted) < 0.3, "inverting should avoid the downbeat");
});

test("an inverted lane can still occasionally land on a beat", () => {
  // The floor keeps strong positions unlikely rather than forbidden, so a ghost lane
  // does not become a rigid anti-pattern.
  const v = defaultVoice({ type: "stepClassP", invert: true }, { density: 0.9 });
  let downbeats = 0;
  for (let bar = 0; bar < 300; bar++) {
    if (realise(v, LEN, 31, bar, 0).some((h) => h.step === 0)) downbeats++;
  }
  assert.ok(downbeats > 0, "never lands on the downbeat at all");
});

test("stepClassP varies bar to bar but repeats for the same bar", () => {
  const v = defaultVoice({ type: "stepClassP" }, { density: 0.5 });
  assert.deepEqual(realise(v, LEN, 3, 12, 0), realise(v, LEN, 3, 12, 0));
  const bars = new Set(
    Array.from({ length: 16 }, (_, b) => stepsOf(realise(v, LEN, 3, b, 0)).join(",")),
  );
  assert.ok(bars.size > 8, `only ${bars.size} distinct bars out of 16`);
});

test("a different voice index gives a different pattern", () => {
  const v = defaultVoice({ type: "stepClassP" }, { density: 0.5 });
  assert.notDeepEqual(stepsOf(realise(v, LEN, 3, 0, 0)), stepsOf(realise(v, LEN, 3, 0, 1)));
});

test("accents land on strong steps, never on the weakest", () => {
  const v = defaultVoice({ type: "stepClassP" }, { density: 0.8 });
  for (let bar = 0; bar < 64; bar++) {
    for (const h of realise(v, LEN, 21, bar, 0)) {
      assert.equal(h.accent, h.strength > v.accentAt);
      if (h.accent) assert.ok(h.velocity === v.vel.accent);
    }
  }
});

test("velocity falls towards the ghost level as strength falls", () => {
  const v = defaultVoice({ type: "stepClassP" }, { density: 0.9 });
  const hits = realise(v, LEN, 4, 1, 0).filter((h) => !h.accent);
  const sorted = [...hits].sort((a, b) => a.strength - b.strength);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i]!.velocity >= sorted[i - 1]!.velocity - 1e-9);
  }
  for (const h of hits) {
    assert.ok(h.velocity >= v.vel.ghost && h.velocity <= v.vel.base + 1e-9);
  }
});

test("chaos is rolled once per bar, so it is constant across the bar", () => {
  const v = defaultVoice({ type: "stepClassP" }, { density: 0.5, chaos: 0.4 });
  const a = barChaos(v, 8, 5, 0);
  assert.equal(a, barChaos(v, 8, 5, 0));
  assert.notEqual(a, barChaos(v, 8, 6, 0));
  assert.notEqual(a, barChaos(v, 8, 5, 1));
});

test("chaos thins bars as often as it thickens them", () => {
  const gen = { type: "stepClassP" } as const;
  const calm = defaultVoice(gen, { density: 0.5 });
  const wild = defaultVoice(gen, { density: 0.5, chaos: 0.5 });
  let thinner = 0;
  let thicker = 0;
  for (let bar = 0; bar < 200; bar++) {
    const d = realise(wild, LEN, 2, bar, 0).length - realise(calm, LEN, 2, bar, 0).length;
    if (d < 0) thinner++;
    if (d > 0) thicker++;
  }
  assert.ok(thinner > 20 && thicker > 20, `${thinner} thinner, ${thicker} thicker`);
});

test("zero chaos is exactly zero, not merely small", () => {
  const v = defaultVoice({ type: "stepClassP" }, { chaos: 0 });
  for (let bar = 0; bar < 32; bar++) assert.equal(barChaos(v, 1, bar, 0), 0);
});

test("realise is a pure function of its arguments", () => {
  const v: VoicePattern = defaultVoice({ type: "stepClassP" }, { density: 0.6, chaos: 0.3 });
  // Interleaving other voices must not perturb this one — there is no shared stream.
  const alone = realise(v, LEN, 77, 9, 2);
  for (let i = 0; i < 50; i++) realise(v, LEN, 77, i, (i % 5) + 3);
  assert.deepEqual(realise(v, LEN, 77, 9, 2), alone);
});

test("hits come out in step order", () => {
  const v = defaultVoice({ type: "stepClassP" }, { density: 0.7 });
  for (let bar = 0; bar < 32; bar++) {
    const steps = stepsOf(realise(v, LEN, 13, bar, 0));
    assert.deepEqual(steps, [...steps].sort((a, b) => a - b));
  }
});
