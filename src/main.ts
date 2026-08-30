import { Engine } from "./app.ts";
import { formatSeed, parseSeed } from "./core/rng.ts";

/**
 * Entry point.
 *
 * The seed lives in the URL so a piece is a link. The AudioContext is built inside the
 * gesture handler: one constructed before a user gesture starts suspended and stays that
 * way.
 */

function seedFromUrl(): number {
  const params = new URLSearchParams(location.search);
  const s = params.get("s");
  if (s !== null) return parseSeed(s);
  return parseSeed(String(Date.now()));
}

function writeSeedToUrl(seed: number): void {
  const url = new URL(location.href);
  url.searchParams.set("s", formatSeed(seed));
  history.replaceState(null, "", url);
}

const app = document.getElementById("app");
const startButton = document.getElementById("start") as HTMLButtonElement | null;

let engine: Engine | null = null;

startButton?.addEventListener("click", async () => {
  if (engine === null) {
    const ctx = new AudioContext();
    await ctx.resume();
    const seed = seedFromUrl();
    writeSeedToUrl(seed);
    engine = new Engine(ctx, seed);
    if (import.meta.env.DEV) Object.assign(window, { engine });
    engine.start();
    startButton.textContent = "stop";
    const label = document.createElement("p");
    label.id = "seed";
    label.textContent = `seed ${engine.seedLabel} · ${engine.state.bpm} bpm`;
    app?.append(label);
    return;
  }

  if (engine.clock.isRunning) {
    engine.stop();
    startButton.textContent = "start";
  } else {
    engine.start();
    startButton.textContent = "stop";
  }
});
