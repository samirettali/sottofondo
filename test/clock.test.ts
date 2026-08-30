import { test } from "node:test";
import assert from "node:assert/strict";

import { Clock, type StepEvent } from "../src/core/clock.ts";
import type { Ticker } from "../src/core/ticker.ts";
import { track } from "../src/core/time.ts";

/** A ticker the test drives by hand, so nothing depends on real elapsed time. */
function manualTicker(): Ticker & { fire(): void } {
  let cb: (() => void) | null = null;
  return {
    start(onTick) {
      cb = onTick;
    },
    stop() {
      cb = null;
    },
    fire() {
      cb?.();
    },
  };
}

function harness(tracks = [track(16)], lookahead = 0.1) {
  let now = 0;
  const ticker = manualTicker();
  const events: StepEvent[] = [];
  const clock = new Clock(() => now, tracks, { lookahead, ticker });
  clock.onStep((e) => events.push(e));
  return {
    clock,
    events,
    advance(seconds: number) {
      now += seconds;
      ticker.fire();
    },
    get now() {
      return now;
    },
  };
}

test("nothing is dispatched before start", () => {
  const h = harness();
  h.advance(1);
  assert.equal(h.events.length, 0);
});

test("start schedules exactly one lookahead window", () => {
  const h = harness();
  h.clock.start(120); // a sixteenth is 0.125 s, so 100 ms of horizon holds one
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0]?.step, 0);
});

test("events arrive in step order with no gaps and no repeats", () => {
  const h = harness();
  h.clock.start(120);
  for (let i = 0; i < 40; i++) h.advance(0.025);
  const steps = h.events.map((e) => e.step);
  assert.deepEqual(steps, steps.map((_, i) => i));
  assert.ok(steps.length > 4, `only ${steps.length} events in a second`);
});

test("every event is scheduled ahead of the audio clock, never late", () => {
  const h = harness();
  h.clock.start(140);
  for (let i = 0; i < 200; i++) h.advance(0.025);
  for (const e of h.events) {
    assert.ok(e.time >= e.earliest, `step ${e.step} scheduled ${e.earliest - e.time}s late`);
  }
});

test("a late wake-up is absorbed by the horizon rather than dropping events", () => {
  const h = harness();
  h.clock.start(120);
  const before = h.events.length;
  h.advance(0.09); // a badly delayed tick, still inside the 100 ms horizon
  const steps = h.events.slice(before).map((e) => e.step);
  assert.deepEqual(steps, [1]);
  for (const e of h.events) assert.ok(e.time >= e.earliest);
});

test("sixteenths land on the right beats at 120 BPM", () => {
  const h = harness();
  h.clock.start(120);
  for (let i = 0; i < 20; i++) h.advance(0.05);
  const beats = h.events.slice(0, 5).map((e) => e.beat);
  assert.deepEqual(beats, [0, 0.25, 0.5, 0.75, 1]);
});

test("each voice keeps its own cursor, so rate multipliers stay independent", () => {
  const h = harness([track(16), track(12, { rateNum: 3, rateDen: 2 })]);
  h.clock.start(120);
  for (let i = 0; i < 40; i++) h.advance(0.025);
  const straight = h.events.filter((e) => e.voice === 0);
  const triplet = h.events.filter((e) => e.voice === 1);
  // Three against two: the faster lane must emit half again as many events.
  const ratio = triplet.length / straight.length;
  assert.ok(Math.abs(ratio - 1.5) < 0.15, `ratio was ${ratio}`);
  assert.deepEqual(straight.map((e) => e.step), straight.map((_, i) => i));
  assert.deepEqual(triplet.map((e) => e.step), triplet.map((_, i) => i));
});

test("a tempo change does not move already-scheduled events", () => {
  const h = harness();
  h.clock.start(120);
  for (let i = 0; i < 8; i++) h.advance(0.025);
  const scheduled = h.events.map((e) => ({ step: e.step, time: e.time }));
  h.clock.setBpm(180);
  h.advance(0.025);
  for (const { step, time } of scheduled) {
    const now = h.events.find((e) => e.step === step);
    assert.equal(now?.time, time, `step ${step} moved`);
  }
});

test("a tempo change applies to what follows", () => {
  const h = harness();
  h.clock.start(120);
  h.advance(0.025);
  const beforeCount = h.events.length;
  h.clock.setBpm(240); // twice as fast: twice as many sixteenths per window
  for (let i = 0; i < 16; i++) h.advance(0.025);
  const after = h.events.length - beforeCount;
  // 0.4 s at 240 BPM is 6.4 sixteenths, plus the events already inside the horizon.
  assert.ok(after >= 6, `only ${after} events after doubling the tempo`);
});

test("stop halts dispatch and start resumes from the top", () => {
  const h = harness();
  h.clock.start(120);
  for (let i = 0; i < 8; i++) h.advance(0.025);
  h.clock.stop();
  const atStop = h.events.length;
  h.advance(1);
  assert.equal(h.events.length, atStop);

  h.clock.start(120);
  assert.equal(h.events.at(-1)?.step, 0);
});

test("currentBeat tracks the audio clock", () => {
  const h = harness();
  h.clock.start(120);
  h.advance(0.5);
  // Beat 0 sits half a lookahead after the start, hence the offset from a round 1.0.
  assert.ok(Math.abs(h.clock.currentBeat - 0.9) < 1e-9, `${h.clock.currentBeat}`);
});

test("start is idempotent while running", () => {
  const h = harness();
  h.clock.start(120);
  const after = h.events.length;
  h.clock.start(120);
  assert.equal(h.events.length, after);
});
