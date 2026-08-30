import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  addFavourite,
  favouriteLabel,
  isFavourited,
  loadFavourites,
  removeFavourite,
} from "../src/ui/favourites.ts";

/** A localStorage stand-in, so the module can be tested outside a browser. */
function installStorage(behaviour: "ok" | "throws" = "ok"): Map<string, string> {
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string): string | null {
      if (behaviour === "throws") throw new Error("blocked");
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (behaviour === "throws") throw new Error("blocked");
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  return store;
}

beforeEach(() => {
  installStorage();
});

test("an empty store yields an empty list", () => {
  assert.deepEqual(loadFavourites(), []);
});

test("saving and loading round-trips", () => {
  addFavourite("acid", 0xcafe);
  const list = loadFavourites();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.genre, "acid");
  assert.equal(list[0]?.seed, 0xcafe);
  assert.ok(isFavourited("acid", 0xcafe));
  assert.ok(!isFavourited("acid", 0xbeef));
  assert.ok(!isFavourited("house", 0xcafe));
});

test("the newest is first, and re-saving moves it there rather than duplicating", () => {
  addFavourite("acid", 1);
  addFavourite("house", 2);
  addFavourite("acid", 1);
  const list = loadFavourites();
  assert.equal(list.length, 2, "re-saving duplicated the entry");
  assert.equal(list[0]?.seed, 1);
});

test("removing works, and removing something absent is harmless", () => {
  addFavourite("acid", 1);
  addFavourite("house", 2);
  assert.equal(removeFavourite("acid", 1).length, 1);
  assert.ok(!isFavourited("acid", 1));
  assert.equal(removeFavourite("acid", 999).length, 1);
});

test("the list is capped", () => {
  for (let i = 0; i < 200; i++) addFavourite("acid", i);
  const list = loadFavourites();
  assert.ok(list.length <= 64, `${list.length} entries`);
  assert.equal(list[0]?.seed, 199, "the newest should survive the cap");
});

test("corrupt stored data is ignored rather than thrown", () => {
  const store = installStorage();
  for (const bad of ["not json", "{}", "[1,2,3]", '[{"genre":"acid"}]', "null"]) {
    store.set("banger:favourites", bad);
    assert.deepEqual(loadFavourites(), [], `survived: ${bad}`);
  }
});

test("a partly valid list keeps only the valid entries", () => {
  const store = installStorage();
  store.set(
    "banger:favourites",
    JSON.stringify([
      { genre: "acid", seed: 7, savedAt: 1 },
      { genre: "house", seed: "nope", savedAt: 2 },
      { genre: 5, seed: 3, savedAt: 3 },
    ]),
  );
  const list = loadFavourites();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.genre, "acid");
});

// Storage genuinely throws in some browsers and private modes, and a toy that will not
// start because it could not read a bookmark list is a poor trade.
test("storage that throws degrades to an empty list rather than breaking", () => {
  installStorage("throws");
  assert.deepEqual(loadFavourites(), []);
  assert.doesNotThrow(() => addFavourite("acid", 1));
  assert.doesNotThrow(() => removeFavourite("acid", 1));
  assert.equal(isFavourited("acid", 1), false);
});

test("labels are readable and stable", () => {
  assert.equal(favouriteLabel({ genre: "acid", seed: 0xcafe1234, savedAt: 0 }), "acid cafe1234");
});
