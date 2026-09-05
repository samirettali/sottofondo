import { GENRES } from "./genre/index.ts";
import { LegacyPlayer, type Player } from "./player.ts";
import { readRecipe, recipe, recipeParams, validateRecipe, type Recipe } from "./recipe.ts";
import { buildUi } from "./ui/ui.ts";

const app = document.getElementById("app");
const startButton = document.getElementById("start") as HTMLButtonElement;
let ctx: AudioContext | null = null;
let engine: Player | null = null;
let teardown: (() => void) | null = null;
let generation = 0;
function writeUrl(r: Recipe): void {
  const url = new URL(location.href);
  url.search = recipeParams(r).toString();
  history.replaceState(null, "", url);
}
function showError(error: unknown): void {
  if (!app) return;
  app.textContent = String(error);
  const reset = document.createElement("button");
  reset.textContent = "Start a new composition";
  reset.onclick = () => void load(recipe("acid", 1));
  app.append(reset);
}
async function load(r: Recipe): Promise<void> {
  const token = ++generation;
  let next: Player | null = null;
  try {
    validateRecipe(r);
    if (!ctx || !app) return;
    teardown?.(); teardown = null;
    engine?.dispose(); engine = null;
    app.textContent = "Loading instruments…";
    next = r.engineVersion === "legacy-1"
      ? new LegacyPlayer(ctx, r, GENRES[r.genre]!)
      : new (await import("./strudel/engine.ts")).StrudelPlayer(ctx, r);
    await next.ready;
    if (token !== generation) { next.dispose(); return; }
    engine = next;
    writeUrl(r);
    engine.start();
    if (import.meta.env.DEV) Object.assign(window, { engine });
    teardown = buildUi(app, engine, {
      onGenre: id => void load(recipe(id, r.seed)),
      onSeed: seed => void load({ ...recipe(r.genre, seed), soundMode: engine?.recipe.soundMode ?? "synth" }),
      onLoad: saved => void load(saved),
      onRecipe: changed => { if (token === generation) writeUrl(changed); },
    });
  } catch (error) {
    next?.dispose();
    if (token === generation) {
      teardown?.(); teardown = null;
      if (engine !== next) engine?.dispose();
      engine = null;
      showError(error);
    }
  }
}
startButton?.addEventListener("click", () => {
  if (startButton.disabled) return;
  startButton.disabled = true;
  startButton.textContent = "Starting audio…";
  void (async () => {
    ctx ??= new AudioContext();
    await ctx.resume();
    await load(readRecipe(new URLSearchParams(location.search)));
  })().catch(showError);
});
