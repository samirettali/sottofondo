import { Engine } from "./app.ts";
import { formatSeed, parseSeed } from "./core/rng.ts";
import { GENRES, defaultGenre } from "./genre/index.ts";

/**
 * Entry point.
 *
 * Genre and seed live in the URL, so a piece is a link. The AudioContext is built inside
 * the gesture handler: one constructed before a user gesture starts suspended and stays
 * that way.
 */

function readUrl(): { genreId: string; seed: number } {
  const params = new URLSearchParams(location.search);
  const g = params.get("g");
  const s = params.get("s");
  return {
    genreId: g !== null && g in GENRES ? g : defaultGenre.id,
    seed: s !== null ? parseSeed(s) : parseSeed(String(Date.now())),
  };
}

function writeUrl(genreId: string, seed: number): void {
  const url = new URL(location.href);
  url.searchParams.set("g", genreId);
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
    const { genreId, seed } = readUrl();
    const genre = GENRES[genreId] ?? defaultGenre;
    writeUrl(genre.id, seed);

    engine = new Engine(ctx, genre, seed);
    if (import.meta.env.DEV) Object.assign(window, { engine });
    engine.start();

    startButton.textContent = "stop";
    const label = document.createElement("p");
    label.id = "status";
    label.textContent = `${genre.name} · seed ${engine.seedLabel} · ${engine.tempo} bpm`;
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
