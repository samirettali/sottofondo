# TODO

## Composer v2

- [x] Restore the handwritten acid reference and verify its score against the live REPL
- [x] Isolate phrase/filter/voice changes in a listening preview
- [x] Confirm the explicitly selected Original take with the user
- [x] Evaluate the generated phrase on the reference sound: the user found ill-fitting notes
- [x] Write three distinct acid studies and expose them in a simple listening preview
- [x] Build an independent seeded composer around complete calls, replies and endings
- [x] Compare written/generated studies, verify multiple seeds and export full arrangements
- [x] Analyze three acid composition videos with Gemini 3.8 Flash agentic video; record
      observed workflows, usage, and corrections in `docs/ACID-VIDEO-RESEARCH.md`
- [x] Add a Before/After execution comparison on Pressure and the faithful reference:
      coordinated accents, gates and filter movement, plus optional FM bell replies
- [x] Record the direction correction: fully local composition with distinct seed
      identities, rather than small variations of authored studies
- [x] Research procedural composition through web search, Tavily, Monid and X;
      inspect primary papers and code in `docs/PROCEDURAL-MUSIC-RESEARCH.md`
- [ ] Test the proposed local composer with relationships between parts and newly
      generated motifs; compare quality and seed diversity before production adoption
- [x] Add versioned acid phrasing based on the Acido sotto casa feedback: dense
      related riffs, step dynamics, independent filter/envelope cycles and drum replies
- [x] Compare the new acid revision against the previous composer at identical tempo
- [x] Preserve legacy/v1 recipes and select v2 for new electronic compositions
- [x] Seed immutable palettes, roles, grooves, motifs, harmony and chapter forms
- [x] Add twelve character families, 24 synth patches and three local CC0 kits
- [x] Select related phrase candidates and arrange calls, answers, breaks and returns
- [x] Load only selected assets, with explicit retry and no palette substitution
- [x] Adapt lane names and bass controls to the composition's instruments
- [x] Add six original studies and a 222-clip comparison export
- [x] Verify event determinism, 3,000-seed diversity, compatibility and actual synthesis
- [ ] Complete 30-minute production playback checks for all three electronic genres
- [ ] Human listening comparison: decide whether v2 has the desired musical character

Implementation and listening commands: `docs/COMPOSER.md`.

## Strudel migration

- [x] Version recipes and favourites; preserve unversioned links on the legacy engine
- [x] Add a shared player interface and a lazy Strudel/Superdough backend
- [x] Generate returning motifs and bounded variations for acid, techno and house
- [x] Query rational musical intervals, with sub-step fills and bar-boundary controls
- [x] Compare synthesis and a bundled CC0 sample kit on the same composition
- [x] Keep 303 articulation and route stereo through the existing master
- [x] Add deterministic, legacy snapshot and cross-browser tests
- [x] Add isolated listening renders and a 30-minute soak-test command
- [ ] Human listening comparison: choose whether the new music is preferable

Commands and compatibility rules: `docs/STRUDEL.md`.

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
- [x] Seed in the URL, `?s=<hex>`, read on load
- [ ] Add `?g=<genre>` once presets exist
- [x] **Version the recipe** — `engineVersion + genreVersion + seed`, so changing a
      generator does not silently repoint every saved seed at different music
      (borrowed from Diaspar, see `docs/DESIGN.md`)

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

- [x] `src/audio/master.ts` — sum → tanh waveshaper → 20 Hz highpass → compressor glue
- [x] Waveshaper curve indexed `/(n-1)`, normalised to unity (MDN's is neither)
- [x] `src/audio/env.ts` — ADSR helpers with the anchor/cancel discipline, seeded noise
      buffer, always `stop()` (the commonest leak)
- [x] `src/audio/drums.ts` — synthesised 808/909 kit: kick, snare, clap, closed and open
      hat, rim, cowbell
- [x] `src/app.ts` — engine wiring the clock to the kit; audible end to end
- [ ] `src/audio/voice.ts` — subtractive voice for pitched parts
- [ ] `src/audio/303.ts` — env mod in **cents into `filter.detune`**, accent shortens the
      envelope, slide as a `setTargetAtTime` time constant
- [ ] 303 accent state machine (the 1 µF cap: consecutive accents sweep higher)
- [ ] Slide starts on the step **after** the marked one
- [x] `src/audio/fx.ts` — feedback delay with a lowpass in the loop, tempo-synced
- [x] Reverb: AudioWorklet FDN, 8 lines, Householder loop, per-lane sends
- [x] Master gain staging: trim before the shaper, gentler drive, glue not squash
- [x] Kit styles: 808, 909, acoustic, folk — one parameter set per genre
- [x] Ducking as a scheduled gain envelope off the kick times (side-chaining is not in
      the spec, and a scheduled envelope sounds better anyway)
- [x] `src/audio/threeoh.ts` — 303 voice with a stateful accent

## 4. Genres as data

- [x] `src/genre/schema.ts` — the `GenreDef` type, cut down to what the engine can
      actually play; it grows as the engine learns more
- [x] `src/genre/acid.ts` — ported from Endless Acid Banger as the A/B reference, with
      tests pinning the bags, register, accent and slide odds, autopilot cadence and the
      5.8-onsets-per-bar note density
- [x] `src/genre/index.ts` — the registry
- [ ] Unitless preset values, expanded by the engine (`2^(2*(p-0.5))`, cutoff as a MIDI
      note number so it transposes musically)
- [x] `techno.ts` — minimal techno, with a polymetric perc lane
- [x] `house.ts` — deep house: the first with harmony, swing and a sidechain
- [x] `dnb.ts` — liquid drum & bass: two-bar patterns, half-time harmony, fixed snare
- [x] `lofi.ts` — lo-fi hip hop: the Dilla nudge, swing 58%, vinyl and wow
- [x] Per-genre swing, never one global constant — and per-voice depth on top of it
- [x] Texture: vinyl noise, tape wow, bit-depth reduction on the whole mix
- [ ] Sample-rate reduction — needs an AudioWorklet, being a function of time rather
      than of amplitude
- [x] Humanisation: `nudgeMs` signed and constant per bar, `jitterMs` unsigned and
      random, **default 0 everywhere**

## 5. Harmony

Only from house onward. Acid, minimal techno and dub techno have none by design.

- [x] `src/harmony/scales.ts` — scale-degree space, `degToMidi` at the boundary only
- [x] `src/harmony/chords.ts` — roman numerals, and closest-inversion voice leading
- [x] `src/harmony/progression.ts` — genre pools + the McGill 12×12 matrix
- [x] `src/audio/poly.ts` — polyphonic chord voice
- [ ] Rootless A/B voicings, drop-2, quartal (needed for jazz and lo-fi)
- [ ] Available-tension table
- [x] The bass follows the current chord's root (it used to pick its own key — the main
      reason house and the 11/8 preset sounded wrong)
- [x] `tonality.scales` is read by the lead. The bass still draws from interval bags
      above the chord root

## 6. Melody

- [x] `src/melody/walk.ts` — weight stacking: `stepPrior × narmour × chordTone × contour
      × gravity`; no cadence funnel yet
- [x] Arch contour as the default (~40% of folksongs)
- [x] `lead` lane kind, used by the 11/8 preset
- [x] The scale is chosen to cover the progression, not drawn independently of it
- [ ] A scale per chord, so a secondary dominant (VI7, III7) gets its own Mixolydian
      instead of the lead sliding past its chromatic third
- [ ] Motif transforms in degree space, with an identity budget
- [ ] Bass strategies: `onKick`, `offKick`, `sustain`, `free`, `walk`

## 7. Arrangement

- [x] `src/arrange/energy.ts` — one `E ∈ [0,1]` per bar driving lane windows and density
- [x] Section table per genre, cycling, with the form matching how the genre arranges
- [x] `variationStrength(bar)` — drives fills at phrase ends
- [x] Fills: density increase on a sparse lane. A mask lane and a saturated lane both
      cannot fill, and tests now enforce that a preset does not declare an inert one
- [ ] Rolls and ratchets — need onsets between grid positions, which the scheduler
      matches by integer step. A real change, not a parameter
- [x] Drive filter cutoff from the energy curve too: a mix filter plus per-voice swing
- [ ] Quantise section changes to the next bar in the scheduler (they already land on
      bar boundaries, but nothing enforces it)
- [ ] A crash landing on the downbeat *after* a fill — needs the score to emit events
      belonging to the next bar, and there is no crash voice in the kit yet
- [ ] Marbles-style déjà-vu: `dejaVu > rnd ? hash(seed, i % loopLen) : hash(seed, i)`

## 8. UI

- [x] Canvas pattern display and an oscilloscope
- [x] Range inputs rather than dials — keyboard-reachable and touch-usable, which the
      reference's mouse-only dials are not
- [x] Genre picker, seed field, "new seed" button
- [x] Sliders: BPM, swing, volume, per-voice density; per-voice mute
- [x] Every lane drawn one bar wide, so a polymetric lane visibly drifts
- [x] Copy-link button
- [x] Sliders for the 303: cutoff (logarithmic), resonance, env mod, decay
- [x] Sliders for FX: delay wet and feedback
- [x] Show the composite cycle length ("repeats every 7 bars")
- [x] Show the section and energy
- [ ] Sidechain depth slider
- [ ] Genre morph: crossfade the numeric fields of two `GenreDef`s

## 9. Verification

- [ ] Euclid table test against the paper
- [x] `src/score.ts` — musical events separated from audio scheduling, so all of the
      below can be tested without an AudioContext
- [x] Determinism test: same seed ⇒ identical event list, across a mute/unmute and across
      a density change on another lane
- [x] Seek test: jumping to bar 600 gives the same events as playing there
- [x] No transcendentals in decision paths (they are not cross-engine exact)
- [ ] Leak check: an hour of playback, node count stays flat
- [ ] **The schema test** — add a 12th genre (footwork, gqom, or a 7/8 Balkan preset)
      with no new code, only a new JSON file

## Later

- [x] Synthwave, ambient, gnawa
- [x] Tempo driven by the energy curve (`tempoSwing`), for the gnawa climb
- [ ] A true gated reverb: an envelope on the send, triggered per hit. Synthwave fakes it
      with a big room and a very short decay
- [x] Psytrance, dub techno, reggaeton, cumbia, raga in teental, powwow — all six cost
      no engine code, only two raga scales
- [x] Progressive house, jazz, blues, 9/8 karşılama, Balkan brass — two more scales
      (Hicaz, Hungarian minor), no engine code
- [ ] Walking bass with a chromatic approach into the next chord root — needs a
      one-chord lookahead in the score. Jazz walks chord tones and steps meanwhile
- [x] Chiptune — square, triangle, noise, an arpeggio for chords, an echo lane, no room
- [x] Chiptune's other half: `velocityBits` quantises every velocity in the score, and
      `duty` on a poly voice builds a band-limited pulse from its Fourier series
- [ ] Trap (hat rolls need sub-step onsets), bossa
- [ ] Break slicing (`slice`/`splice`/`chop` semantics, choke groups, 1–3 ms slice fades)
- [x] Offline render — `tools/render.html`, a page a headless browser opens; the WAVs go
      to a local sink. Not bit-identical to live playback and cannot be: Chrome's graph
      rounds differently run to run, so two renders of one seed differ by about 4 LSB in
      32768. That is −76 dB. Compare renders by sample magnitude, never by hash.
- [ ] WAV export from the UI itself, with a button
- [x] Save a seed to a local favourites list
