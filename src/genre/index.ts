import { acid } from "./acid.ts";
import { ambient } from "./ambient.ts";
import { balkan } from "./balkan.ts";
import { gnawa } from "./gnawa.ts";
import { synthwave } from "./synthwave.ts";
import { dnb } from "./dnb.ts";
import { house } from "./house.ts";
import { lofi } from "./lofi.ts";
import { techno } from "./techno.ts";
import type { GenreDef } from "./schema.ts";

/**
 * The genre registry.
 *
 * Adding a genre should mean adding a file and one line here. If it ever means touching
 * the engine, the schema is not finished — that is the test, and it is worth running
 * against something awkward (footwork, gqom, a 7/8 Balkan preset) before believing it.
 */
export const GENRES: Readonly<Record<string, GenreDef>> = {
  [acid.id]: acid,
  [techno.id]: techno,
  [house.id]: house,
  [dnb.id]: dnb,
  [lofi.id]: lofi,
  [balkan.id]: balkan,
  [gnawa.id]: gnawa,
  [synthwave.id]: synthwave,
  [ambient.id]: ambient,
};

export const defaultGenre: GenreDef = acid;

export function genreList(): GenreDef[] {
  return Object.values(GENRES);
}
