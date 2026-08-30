# banger

A browser toy that generates music algorithmically, in several genres, from a seed.
Descended from vitling's *Endless Acid Banger* (CC-BY 4.0), generalised so that a genre
is data rather than code.

- `TODO.md` is the working list. Tick items as they land.
- `docs/DESIGN.md` is the research: how Endless Acid Banger works, the generation
  algorithms, the genre parameter model, and the sources behind every number.
  **Read it before touching a generator.** The constants in the presets are sourced
  (service notes, corpora, published studies) — do not "tidy" them.

## Decisions the code alone will not reveal

- **Generation is a pure function of `(seed, bar, voice)`**, hashed with `Math.imul` —
  never a sequential PRNG stream. A stream desynchronises the moment a voice is muted or
  a voice is added, and it makes seeking impossible. This is why there is no global RNG.
- **`Math.random` is banned outside `src/core/rng.ts`.** One stray call silently destroys
  reproducibility.
- **No transcendentals in decision paths.** `Math.sin`/`pow`/`exp` are explicitly
  implementation-dependent in ECMAScript, so a branch on one can produce different notes
  in different browsers. Use them for continuous parameters only.
- **Nothing derives from wall-clock time.** Not `ctx.currentTime`, not
  `performance.now()`. Musical decisions come from the bar index; timing jitter must
  never be able to change what is played.
- **Per-step velocity is a `number`, never a boolean.** One threshold comparison then
  gives density, accents, fills and pattern morphing.
- **Chaos is rolled once per bar per voice**, at step 0 — not per step. Per-step noise
  sounds sprinkled; per-bar coherence is what reads as musical.
- **Humanisation defaults to zero.** Controlled studies find random microtiming reduces
  groove. `nudgeMs` (signed, constant per bar) is the useful control; `jitterMs` is
  capped low and off by default.
- **Genres are JSON.** A preset picks a strategy from a pre-declared enum; it never
  introduces routing. The test for the schema being finished is that a twelfth genre
  costs a file and no code.

## Conventions

- Zero runtime dependencies. Vite and TypeScript are the only build-time ones.
- Scale-degree space internally; convert to MIDI at the very last step.
- Local only for now — no remote, no GitHub.
