import test from "node:test";
import assert from "node:assert/strict";
import { recipe, readRecipe, recipeParams, validateRecipe } from "../src/recipe.ts";

test("unversioned links keep the legacy engine; a fresh visit gets Strudel", () => {
  assert.equal(readRecipe(new URLSearchParams("g=acid&s=deadbeef")).engineVersion, "legacy-1");
  assert.equal(readRecipe(new URLSearchParams()).engineVersion, "strudel-2");
  assert.equal(recipe("jazz", 1).engineVersion, "legacy-1");
});
test("versioned recipes preserve engine, genre, seed and sound mode", () => {
  for (const genre of ["acid", "techno", "house"]) for (const soundMode of ["synth", "samples"] as const) {
    const r = { ...recipe(genre, 0xdeadbeef), soundMode };
    assert.deepEqual(readRecipe(recipeParams(r)), r);
  }
});
test("unsupported recipes fail instead of silently changing the music", () => {
  for (const query of ["g=acid&e=strudel-8", "g=acid&e=strudel-1&v=9", "g=acid&e=strudel-1&m=missing", "g=jazz&e=strudel-1"])
    assert.throws(() => readRecipe(new URLSearchParams(query)));
  assert.throws(() => validateRecipe({ ...recipe("acid", 1, true), soundMode: "samples" }));
});
