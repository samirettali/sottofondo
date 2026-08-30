# TODO

Multi-genre generative music toy. Research and rationale live in `docs/DESIGN.md` —
read it before touching the generators; the numbers in there are sourced, not invented.

## 0. Scaffolding

- [x] `npm init`, Vite + TypeScript, strict mode, zero runtime dependencies
- [x] `index.html`, `src/main.ts`, dev server runs
- [x] `.gitignore`, `AGENTS.md`
- [x] `npm run build` produces a static `dist/`

## 1. Foundations

These cannot be retrofitted cheaply. Build them first and build them right.

- [x] `src/core/rng.ts` — `h32` integer hash (`Math.imul`), `mulberry32`, `cyrb128`
- [x] `rngFor(seed, bar, voice)` — generation as a **pure function**, no shared stream
- [x] Ban `Math.random` in `src/` outside `rng.ts` (lint rule or a test that greps)
- [x] `src/core/time.ts` — rational time, `beatOfStep`, `beatToTime`, tempo map anchored
      at `(anchorBeat, anchorTime)`, swing, `autoSwing`, polymeter cycle length
- [x] `src/core/clock.ts` — lookahead scheduler: 25 ms tick, 100 ms horizon, absolute
      `AudioContext` times, per-voice cursors
- [x] Move the ticker into a `Worker` so a hidden tab does not stop the sequencer
- [x] `AudioContext` created lazily inside the first user gesture (autoplay policy)
- [ ] Seed in the URL hash, `?g=<genre>&s=<hex>`, read on load

## 2. Pattern layer

- [x] `src/pattern/euclid.ts` — Bjorklund (**not** Bresenham; the rotation is the music)
- [x] Verify against Toussaint's table — all 23 published entries, plus maximal-evenness
      and onset-count properties over every `(k, n)` with n ≤ 32
- [x] `(k, n, rotation)` triples as the stored form, with a named-rhythm table
- [x] `src/pattern/clave.ts` — the six 5-in-16 timelines (son, rumba, bossa, shiko,
      soukous, gahu), 3-2/2-3 sides, Arom's rhythmic oddity. Son is **not** `E(5,16)`,
      and is not even a rotation of it
- [x] `src/pattern/metric.ts` — metric-weight tables for 8, 12 and 16, a generated
      fallback for anything else, and a `syncopation` exponent that reshapes the curve
- [x] `src/pattern/gen.ts` — the `PatternGen` tagged union: `stepClassP`, `mask`,
      `euclid`, `clave`, `none` (the rest land with their genres)
- [x] Per-step `strength: number`, never a boolean — one threshold gives density,
      accents, fills and morphing
- [x] Grids-style density thresholding: `fires ⟺ strength + density > 1`, accent above
      a second threshold
- [x] Chaos as a **per-bar, per-voice** offset rolled at step 0 — not per-step noise

## 3. Synthesis

- [ ] `src/audio/master.ts` — sum → tanh waveshaper → 20 Hz highpass → compressor glue
- [ ] Waveshaper curve indexed `/(n-1)`, normalised to unity (MDN's is neither)
- [ ] `src/audio/voice.ts` — subtractive voice, ADSR helpers with the anchor/cancel
      discipline, always `stop()` (the commonest leak)
- [ ] `src/audio/303.ts` — env mod in **cents into `filter.detune`**, accent shortens the
      envelope, slide as a `setTargetAtTime` time constant
- [ ] 303 accent state machine (the 1 µF cap: consecutive accents sweep higher)
- [ ] Slide starts on the step **after** the marked one
- [ ] `src/audio/drums.ts` — synthesised 808/909 kit, values from the service notes
- [ ] `src/audio/fx.ts` — feedback delay with a lowpass in the loop, tempo-synced
- [ ] Reverb: AudioWorklet FDN (`ConvolverNode` cannot modulate at all); generated IR as
      the fallback while `addModule()` resolves
- [ ] Ducking as a scheduled gain envelope off the kick times (side-chaining is not in
      the spec, and a scheduled envelope sounds better anyway)

## 4. Genres as data

- [ ] `src/genre/schema.ts` — the `GenreDef` type from `docs/DESIGN.md`
- [ ] Unitless preset values, expanded by the engine (`2^(2*(p-0.5))`, cutoff as a MIDI
      note number so it transposes musically)
- [ ] `acid.json` — ported **verbatim** from Endless Acid Banger, as the A/B reference
- [ ] `house.json`
- [ ] `dnb.json`
- [ ] `lofi.json`
- [ ] Per-genre swing table, never one global constant
- [ ] Humanisation: `nudgeMs` signed and constant per bar, `jitterMs` unsigned and
      random, **default 0 everywhere**

## 5. Harmony

Only from house onward. Acid, minimal techno and dub techno have none by design.

- [ ] `src/harmony/scales.ts` — scale-degree space, `degToMidi` at the boundary only
- [ ] `src/harmony/progression.ts` — genre pools + the McGill 12×12 matrix
- [ ] Two transition tables, classical and pop (rock's `V IV I` is nearly as common as
      `IV V I`)
- [ ] `src/harmony/voicing.ts` — closest-inversion voice leading (kills the "chords jump
      around" artefact for ~15 lines)
- [ ] Rootless A/B voicings, drop-2, quartal
- [ ] Available-tension table

## 6. Melody

- [ ] `src/melody/walk.ts` — weight stacking: `stepPrior × narmour × chordTone × contour
      × gravity × cadenceFunnel`
- [ ] Arch contour as the default (~40% of folksongs)
- [ ] Motif transforms in degree space, with an identity budget
- [ ] Bass strategies: `onKick`, `offKick`, `sustain`, `free`, `walk`

## 7. Arrangement

- [ ] `src/arrange/energy.ts` — one `E ∈ [0,1]` per bar driving layer gain windows, drum
      density, cutoff, register, velocity and fill probability **together**
- [ ] Section table with legal bar counts; transitions quantised to the next bar
- [ ] `variationStrength(bar)` — mutate only on phrase boundaries, one element at a time
- [ ] Fills: probability by phrase position, plus `nextBarOneShots` for the crash that
      lands on the following downbeat
- [ ] Marbles-style déjà-vu: `dejaVu > rnd ? hash(seed, i % loopLen) : hash(seed, i)`

## 8. UI

- [ ] Canvas pattern display and an oscilloscope
- [ ] Dials — pointer events, not mouse events (EAB is desktop-only because of this)
- [ ] Genre picker, seed field, "new seed" button, copy-link
- [ ] Sliders: BPM, per-voice density, swing, chaos, filter, FX, sidechain
- [ ] Genre morph: crossfade the numeric fields of two `GenreDef`s
- [ ] Show the composite cycle length ("repeats in 35 bars") when voices are polymetric

## 9. Verification

- [ ] Euclid table test against the paper
- [ ] Determinism test: same seed ⇒ identical event list, across a mute/unmute
- [ ] Seek test: jumping to bar 500 gives the same events as playing there
- [ ] No transcendentals in decision paths (they are not cross-engine exact)
- [ ] Leak check: an hour of playback, node count stays flat
- [ ] **The schema test** — add a 12th genre (footwork, gqom, or a 7/8 Balkan preset)
      with no new code, only a new JSON file

## Later

- [ ] Trap, ambient, synthwave, dub techno, bossa, jazz, chiptune, Detroit/minimal
- [ ] Break slicing (`slice`/`splice`/`chop` semantics, choke groups, 1–3 ms slice fades)
- [ ] WAV export, offline render (must be bit-identical to live playback)
- [ ] Save a seed to a local favourites list
