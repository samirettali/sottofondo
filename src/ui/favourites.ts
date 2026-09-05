import { formatSeed } from "../core/rng.ts";
import { recipe, recipeKey, validateRecipe, type Recipe } from "../recipe.ts";

/**
 * Saved seeds.
 *
 * Local to the browser, which is the honest scope: there is no account and no server, and
 * the URL is already the shareable form. This is a shortlist, not a library.
 *
 * Every read and write is wrapped: storage throws outright in a few real situations — a
 * browser set to block site data, some private modes — and a toy that cannot start
 * because it could not read a favourites list would be a poor trade.
 */

const KEY = "sottofondo:favourites";
/** What the key was called before the project was renamed. Read once, never written. */
const OLD_KEY = "banger:favourites";
const LIMIT = 64;

export interface Favourite {
  readonly genre: string;
  readonly seed: number;
  /** Epoch milliseconds, for ordering. */
  readonly savedAt: number;
  readonly recipe?: Recipe;
}

export function favouriteRecipe(f: Favourite): Recipe {
  if (f.recipe) return f.recipe;
  try { return recipe(f.genre, f.seed, true); }
  catch { return { genre: f.genre, seed: f.seed, engineVersion: "legacy-1", genreVersion: 0, soundMode: "synth" }; }
}

export function loadFavourites(): Favourite[] {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate rather than trust: this is data a previous version wrote, and versions
    // change.
    return parsed.filter(isFavourite).slice(0, LIMIT);
  } catch {
    return [];
  }
}

function isFavourite(x: unknown): x is Favourite {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  if (f["recipe"] !== undefined) {
    const r = f["recipe"];
    if (!r || typeof r !== "object") return false;
    const value = r as Record<string, unknown>;
    if (value["genre"] !== f["genre"] || value["seed"] !== f["seed"] ||
        typeof value["engineVersion"] !== "string" || typeof value["genreVersion"] !== "number" ||
        typeof value["soundMode"] !== "string") return false;
  }
  return (
    typeof f["genre"] === "string" &&
    typeof f["seed"] === "number" &&
    Number.isFinite(f["seed"]) &&
    typeof f["savedAt"] === "number"
  );
}

function save(list: readonly Favourite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // Out of quota, or storage blocked. Losing a bookmark is not worth an error.
  }
}

/** Add, or move to the front if it is already there. */
export function addFavourite(genre: string, seed: number, r?: Recipe): Favourite[] {
  if (r) validateRecipe(r);
  const without = loadFavourites().filter((f) => !matches(f, genre, seed, r));
  const list = [{ genre, seed, savedAt: Date.now(), ...(r ? { recipe: r } : {}) }, ...without].slice(0, LIMIT);
  save(list);
  return list;
}

export function removeFavourite(genre: string, seed: number, r?: Recipe): Favourite[] {
  const list = loadFavourites().filter((f) => !matches(f, genre, seed, r));
  save(list);
  return list;
}

export function isFavourited(genre: string, seed: number, r?: Recipe): boolean {
  return loadFavourites().some((f) => matches(f, genre, seed, r));
}

function matches(f: Favourite, genre: string, seed: number, r?: Recipe): boolean {
  if (f.genre !== genre || f.seed !== seed) return false;
  if (!r) return !f.recipe;
  try { return recipeKey(favouriteRecipe(f)) === recipeKey(r); } catch { return false; }
}

/** How a favourite reads in the list. */
export function favouriteLabel(f: Favourite): string {
  return `${f.genre} ${formatSeed(f.seed)}${f.recipe?.engineVersion === "strudel-2" ? " · composed" : f.recipe?.engineVersion === "strudel-1" ? ` · ${f.recipe.soundMode}` : ""}`;
}
