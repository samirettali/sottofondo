import { Engine } from "./app.ts";
import { formatSeed, parseSeed } from "./core/rng.ts";
import { GENRES, defaultGenre } from "./genre/index.ts";
import { buildUi } from "./ui/ui.ts";

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

let ctx: AudioContext | null = null;
let engine: Engine | null = null;
let teardown: (() => void) | null = null;

/**
 * Rebuild the engine for a new genre or seed.
 *
 * A whole new engine rather than a mutated one: the graph a genre wants differs, and
 * tearing it down is the only way to be sure nothing from the old one is left scheduled.
 * The AudioContext is reused, so this stays inside the original gesture's permission.
 */
function load(genreId: string, seed: number): void {
  if (ctx === null || app === null) return;
  teardown?.();
  engine?.dispose();

  const genre = GENRES[genreId] ?? defaultGenre;
  writeUrl(genre.id, seed);

  engine = new Engine(ctx, genre, seed);
  if (import.meta.env.DEV) Object.assign(window, { engine });
  engine.start();

  teardown = buildUi(app, engine, {
    onGenre: (id) => load(id, seed),
    onSeed: (next) => load(genreId, next),
    onLoad: (g, s) => load(g, s),
  });
}

startButton?.addEventListener(
  "click",
  async () => {
    ctx = new AudioContext();
    await ctx.resume();
    const { genreId, seed } = readUrl();
    load(genreId, seed);
  },
  { once: true },
);
