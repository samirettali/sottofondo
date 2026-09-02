import { Engine } from "../src/app.ts";
import { GENRES } from "../src/genre/index.ts";
import type { Ticker } from "../src/core/ticker.ts";

/** Counts the hits an offline render actually schedules, per lane. A sanity check on the harness. */

const log = document.getElementById("log") as HTMLPreElement;
const SINK = "http://127.0.0.1:8787";
const lines: string[] = [];

function manualTicker(): Ticker & { fire(): void } {
  let cb: (() => void) | null = null;
  return { start: (f) => void (cb = f), stop: () => void (cb = null), fire: () => cb?.() };
}

const seconds = 30;
for (const [id, genre] of Object.entries(GENRES)) {
  const ctx = new OfflineAudioContext(2, 48000 * seconds, 48000);
  let now = 0;
  const ticker = manualTicker();
  const engine = new Engine(ctx, genre, 1, { now: () => now, ticker });
  await engine.ready;
  const hits = new Map<number, number>();
  engine.onHit = (lane) => hits.set(lane, (hits.get(lane) ?? 0) + 1);
  engine.start();
  while (now < seconds) {
    now += 0.05;
    ticker.fire();
  }
  engine.stop();
  const names = [
    ...genre.drums.map((d) => d.name),
    ...(genre.bass ? [genre.bass.name] : []),
    ...(genre.chords ? [genre.chords.name] : []),
    ...(genre.lead ? [genre.lead.name] : []),
  ];
  const per = names.map((n, i) => `${n}:${hits.get(i) ?? 0}`).join(" ");
  const line = `${id} bpm=${genre.clock.bpm.default} spb=${genre.clock.stepsPerBar} ${per}`;
  lines.push(line);
  log.textContent += line + "\n";
}
await fetch(`${SINK}/hits.txt`, { method: "POST", body: lines.join("\n") });
