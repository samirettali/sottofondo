import { GENRES, defaultGenre } from "./genre/index.ts";
import { formatSeed, parseSeed } from "./core/rng.ts";

export type SoundMode = "synth" | "samples";
export interface Recipe {
  readonly genre: string;
  readonly seed: number;
  readonly engineVersion: "legacy-1" | "strudel-1";
  readonly genreVersion: number;
  readonly soundMode: SoundMode;
}
export const migrated = (id: string): boolean => ["acid", "techno", "house"].includes(id);
export function recipe(genre: string, seed: number, legacy = false): Recipe {
  const preset = Object.hasOwn(GENRES, genre) ? GENRES[genre] : undefined;
  if (!preset) throw new Error(`Unknown genre: ${genre}`);
  const old = legacy || !migrated(genre);
  return { genre, seed: seed >>> 0, engineVersion: old ? "legacy-1" : "strudel-1",
    genreVersion: old ? preset.version : 1, soundMode: "synth" };
}
export function validateRecipe(r: Recipe): Recipe {
  if (!Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff) throw new Error("Invalid recipe seed.");
  const expected = recipe(r.genre, r.seed, r.engineVersion === "legacy-1");
  if (r.engineVersion !== expected.engineVersion || r.genreVersion !== expected.genreVersion ||
      !["synth", "samples"].includes(r.soundMode) || (r.engineVersion === "legacy-1" && r.soundMode !== "synth")) {
    throw new Error("This recipe version is not supported by this build.");
  }
  return r;
}
export function readRecipe(params: URLSearchParams): Recipe {
  const genre = params.get("g") ?? defaultGenre.id;
  const seed = parseSeed(params.get("s") ?? "1");
  const base = recipe(genre, seed, params.get("e") === "legacy-1" ||
    (!params.has("e") && (params.has("g") || params.has("s"))));
  return validateRecipe({ ...base,
    engineVersion: (params.get("e") ?? base.engineVersion) as Recipe["engineVersion"],
    genreVersion: params.has("v") ? Number(params.get("v")) : base.genreVersion,
    soundMode: (params.get("m") ?? "synth") as SoundMode });
}
export function recipeParams(r: Recipe): URLSearchParams {
  return new URLSearchParams({ g: r.genre, s: formatSeed(r.seed), e: r.engineVersion,
    v: String(r.genreVersion), m: r.soundMode });
}
export function recipeKey(r: Recipe): string { return recipeParams(r).toString(); }
