/**
 * Deterministic randomness.
 *
 * Generation is a pure function of `(seed, bar, voice)` — never a sequential stream.
 * A stream is a function of how many draws have happened so far in exact order, so it
 * desynchronises the moment a voice is muted, a voice is added, or the user opens a
 * panel that happens to consume a number. Hashing the coordinates instead buys:
 *
 *   - seeking: bar 500 sounds the same whether you played there or jumped there
 *   - looping: bar 8 is bar 8 forever
 *   - offline render bit-identical to live playback
 *   - "regenerate" is `seed + 1`
 *
 * Everything here is integer arithmetic via `Math.imul`, which is exactly specified and
 * identical across engines. `Math.sin`, `Math.pow` and friends are explicitly
 * implementation-dependent in ECMAScript and must never appear in a decision path.
 *
 * The global generator is banned everywhere else in `src/`; `test/rng.test.ts` greps for
 * it.
 */

/** A generator of uniform values in [0, 1). */
export type Rng = () => number;

const U32 = 4294967296;

/**
 * Integer avalanche hash over a list of 32-bit inputs.
 *
 * The mixing constants are the usual xxHash/murmur finalisers: multiply by a large odd
 * constant, xor-shift, repeat. Two inputs differing in one bit produce unrelated
 * outputs, which is what lets `(seed, bar, voice)` triples act as independent draws.
 */
export function h32(...xs: number[]): number {
  let h = 0x9e3779b1;
  for (const x of xs) {
    h ^= Math.imul(x | 0, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 15), 0xc2b2ae3d);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x2545f491);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * mulberry32 — 32 bits of state, period 2^32, the fastest of the usual candidates.
 *
 * Adequate here because each generator is short-lived: one is built per bar per voice
 * and asked for a few dozen numbers. The 2^32 period would matter for a single stream
 * driving an entire piece, which is exactly the design we are avoiding.
 *
 * Source: bryc, https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / U32;
  };
}

/**
 * sfc32 — 128 bits of state, passes PractRand to 32 TB. Use where a long-lived stream
 * is genuinely unavoidable; prefer `rngFor` everywhere else.
 *
 * Source: bryc, as above.
 */
export function sfc32(a: number, b: number, c: number, d: number): Rng {
  let s0 = a | 0;
  let s1 = b | 0;
  let s2 = c | 0;
  let s3 = d | 0;
  return () => {
    const t = ((s0 + s1) | 0) + s3 | 0;
    s3 = (s3 + 1) | 0;
    s0 = s1 ^ (s1 >>> 9);
    s1 = (s2 + (s2 << 3)) | 0;
    s2 = (s2 << 21) | (s2 >>> 11);
    s2 = (s2 + t) | 0;
    return (t >>> 0) / U32;
  };
}

/**
 * cyrb128 — string to four 32-bit seeds, for turning a human-typed or URL-carried seed
 * into machine state.
 *
 * Source: bryc, as above.
 */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * The generator for one (bar, voice) cell. Fresh and independent every call — nothing
 * upstream carries state, so nothing upstream can desynchronise.
 *
 * `salt` separates several independent decisions within the same cell (gates from
 * accents from slides) without them sharing a stream.
 */
export function rngFor(seed: number, bar: number, voice: number, salt = 0): Rng {
  return mulberry32(h32(seed, bar, voice, salt));
}

/** A single uniform value in [0, 1) for one coordinate. No generator allocated. */
export function valueAt(seed: number, bar: number, voice: number, salt = 0): number {
  return h32(seed, bar, voice, salt) / U32;
}

/** Uniform integer in [0, max). */
export function rndInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

/** Uniform element. Throws on an empty list rather than returning undefined. */
export function choose<T>(rng: Rng, xs: readonly T[]): T {
  const x = xs[Math.floor(rng() * xs.length)];
  if (x === undefined) throw new Error("choose: empty list");
  return x;
}

/**
 * Weighted choice over `[item, weight]` pairs — the Band-in-a-Box selection rule,
 * `w_i / Σw`. Weights need not be normalised.
 */
export function weighted<T>(rng: Rng, xs: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of xs) total += w;
  let r = rng() * total;
  for (const [item, w] of xs) {
    r -= w;
    if (r <= 0) return item;
  }
  const last = xs[xs.length - 1];
  if (last === undefined) throw new Error("weighted: empty list");
  return last[0];
}

/** Parse a seed from a URL fragment or user input. Any string is acceptable. */
export function parseSeed(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  const hex = /^[0-9a-f]{1,8}$/i.exec(trimmed);
  if (hex) return parseInt(trimmed, 16) >>> 0;
  return cyrb128(trimmed)[0];
}

/** Render a seed for display and for the URL. */
export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, "0");
}
