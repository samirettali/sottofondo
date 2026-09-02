import { Engine } from "../src/app.ts";
import { formatSeed, parseSeed } from "../src/core/rng.ts";
import { GENRES } from "../src/genre/index.ts";
import type { Ticker } from "../src/core/ticker.ts";

/**
 * Offline render harness.
 *
 * Not part of the app: a page a headless browser opens to turn seeds into WAVs. The
 * engine needs a real Web Audio implementation (an AudioWorklet, in the reverb's case),
 * so the render happens in a browser and the bytes are POSTed to a local sink.
 *
 * An `OfflineAudioContext` never advances `currentTime` while the graph is being built,
 * so the clock is given a virtual time source and a ticker we pump by hand: the whole
 * piece is scheduled before a single sample is rendered.
 */

const log = document.getElementById("log") as HTMLPreElement;
const say = (s: string): void => {
  log.textContent += s + "\n";
};

const SINK = "http://127.0.0.1:8787";
const RATE = 48000;

/** A ticker whose wake-ups we issue ourselves. */
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

async function render(genreId: string, seed: number, seconds: number): Promise<AudioBuffer> {
  const genre = GENRES[genreId];
  if (genre === undefined) throw new Error(`unknown genre ${genreId}`);

  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
  let now = 0;
  const ticker = manualTicker();
  const engine = new Engine(ctx, genre, seed, { now: () => now, ticker });
  await engine.reverb?.ready;

  engine.start();
  // The clock schedules everything inside `now + lookahead`; walking `now` forward in
  // lookahead-sized steps drains the whole piece into the graph.
  const step = 0.05;
  while (now < seconds) {
    now += step;
    ticker.fire();
  }
  engine.stop();
  return ctx.startRendering();
}

/** 16-bit PCM WAV. */
function wav(buf: AudioBuffer): Blob {
  const chans = buf.numberOfChannels;
  const frames = buf.length;
  const data = new ArrayBuffer(44 + frames * chans * 2);
  const view = new DataView(data);
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames * chans * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chans, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * chans * 2, true);
  view.setUint16(32, chans * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, frames * chans * 2, true);

  const src = Array.from({ length: chans }, (_, c) => buf.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < chans; c++) {
      const x = Math.max(-1, Math.min(1, src[c]![i]!));
      view.setInt16(at, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([data], { type: "audio/wav" });
}

const params = new URLSearchParams(location.search);
const seconds = Number(params.get("sec") ?? 30);
const seeds = (params.get("seeds") ?? "1,2").split(",").map(parseSeed);
const only = params.get("g");
const ids = only === null ? Object.keys(GENRES) : only.split(",");

for (const id of ids) {
  for (const seed of seeds) {
    const name = `${id}-${formatSeed(seed)}.wav`;
    const t0 = performance.now();
    const blob = wav(await render(id, seed, seconds));
    await fetch(`${SINK}/${name}`, { method: "POST", body: blob });
    say(`${name} ${(blob.size / 1024).toFixed(0)} KiB ${(performance.now() - t0).toFixed(0)} ms`);
  }
}
say("DONE");
await fetch(`${SINK}/__done`, { method: "POST", body: "" });
