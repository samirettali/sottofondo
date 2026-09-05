import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GENRES } from "../src/genre/index.ts";
import { scoreBar, defaultLaneStates } from "../src/score.ts";

// Captured from main at df8152b, before integrating Strudel.
const golden: Record<string, string> = {
  acid: "a1a3248d19eb788ca24c028355222c595c3d0214eb7edbfbe86396dc22a4c394",
  techno: "7ff59a5117e320e9dd41623cbf7c90b12fdfc7bd298708a288c2ddc43634c2d3",
  house: "6b8ac95fe3149629705efe6ac76d57175000282c219d06db6465a135bcda5bcc",
  dnb: "45df3a558ce2c866c367da2c3a21c94096b1c656bb6dee6e51e15a98e46d68c4",
  lofi: "a98c05e572f4be423edce7f3deae1b26e65d5010ee9bde8a3f9953d8a95c28a0",
  balkan: "9b8e4212522c5079b12806f310b32ef36efb7637833e52dc47c2f40c2327a542",
  gnawa: "9cc132bcac973a8435885edfd1cee2c171293066ec1858bc07af1895c160c7ab",
  synthwave: "f6353e2a82773f4c83d90f9192cb2f38a5fb8a8a1a27e2d1f41bd1e0387101f3",
  ambient: "a90b2fd717853cb4eb7cc6d709d01314247ce65a9061c3eb69901ec1339af481",
  psytrance: "7d13cd669602dadc25858d5ffe671247cf5f948798eaae23350643d946647b1f",
  dubtechno: "3d2f14d888460efad02e4e56f3bec8c4a80059dccf65b24f4dceb02c91405987",
  reggaeton: "f2cab50e9b4e73ab70ea132a7bafb20f62d1bf7e03beaa622bce6c383d15191f",
  cumbia: "b3f4e0c110d1951012a848d53031ac295ee41850eda6ddc6ecbe3044ba5c4ef4",
  hindustani: "d1cdc1ba9d85e434c93bcf261d709906bc7edf5f426077c0a5c7198fe6f1de1a",
  powwow: "b17abe4bc5d1c18a4bc74780a0b54f964d5354e36a1e4510ca4b98327d37bac3",
  progressive: "f4ec8054b255c55f79474f358e7c96081c2c73f6a1a1f9ae2e65d5f1624ffbed",
  jazz: "5f49183d293df7dea5af7aecbca993d90454c48d85631e8349c888a3b2bd8fc6",
  blues: "7ddc89b4c8ed6397415224034956d8681377e8e972e1a64d6ecfd6adb57aaa6c",
  turkish: "bd283b8bbac056f9928a69e0b2838d6a20e71431582059b39096f13f6b413b49",
  gypsy: "5c5be9104cf8c2a404f79bc2bc005c5dbfe3a76ea0cbf2c0e362a7c9dae24cb1",
  chiptune: "0ceb0e25ff967439150340a128d99c063f451fe0347765ee1f0f767ee58b3320",
};
test("all legacy genres retain their pre-migration event lists", () => {
  assert.deepEqual(Object.keys(GENRES).sort(), Object.keys(golden).sort());
  for (const [id, g] of Object.entries(GENRES)) {
    const events = [1, 2, 0xcafe1234].flatMap(seed => [0, 40, 600].map(bar => scoreBar(g, seed, bar, defaultLaneStates(g))));
    assert.equal(createHash("sha256").update(JSON.stringify(events)).digest("hex"), golden[id], id);
  }
});
