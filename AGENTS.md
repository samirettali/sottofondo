# sottofondo

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

## Timbre is data too, and it decides the genre

A voice picks a synthesis strategy by name — `subtractive`, `fm`, `pluck`, `brass`,
`reed` — the same way it already picks a kit or a pattern generator. The strategies live
in `src/audio/poly.ts` (`pluck` is a Karplus-Strong worklet in `src/audio/pluck.ts`), and
a preset sets numbers, never a graph.

This exists because the pattern was never the thing that failed. Balkan brass had the
tuba on the beats and the horns between them and still came back from a blind listener as
"synth-pop | chiptune"; jazz came back as "Eurodance". Everything acoustic was detuned
saws through a lowpass. Changing the timbre and nothing else moved jazz from "Trap: 808
sub-bass" to "Big Band Swing: trumpets, trombones, saxophones, piano, double bass".

Two traps found the hard way, both of them one instrument standing in for another:

- **A long ring on a repeated hit becomes a pitch.** A ride with fixed partials, struck
  three times a second, sums into a drone on its own fundamental, and a drone is a
  synthesizer. Each strike gets a different spread (`RING_SPREAD`, cycled — never rolled).
- **Map a lane to what the instrument *is*.** The gnawa qraqeb are iron castanets and were
  playing `frame`, which is a tap on skin; the whole genre read as a muffled pulse.

## Listening tests

`tools/render.html` renders every preset to a WAV, `tools/probe.html` reports the hits
each lane schedules — the check that a silent-sounding preset is an arrangement problem
and not a harness one. `tools/timbre.html` plays one phrase per timbre, bare.

Handing those renders to a model with no context is a useful instrument and a badly
behaved one:

- **One clip per directory, named neutrally.** Given twenty clips in one directory the
  agent sometimes reads a different file than the one asked about, which produces answers
  that look like wild misjudgements. Isolating each clip changed the verdicts *and* fixed
  the tempo readings.
- **A leading prompt gets a leading answer.** "This is a short instrumental loop, name the
  genre" makes it attach a dance genre to anything; the ambient preset, which has no
  percussion at all, came back as "Disco, 120 BPM". Ask what it hears first, label second.
- **One answer is a sample, not a measurement.** The same file has come back as "Gnawa,
  guembri, qraqeb, 0.95" and as "minimal techno". Take several votes, or believe nothing.
- **Never normalise the clips before comparing.** Rescaling them to a common loudness made
  the fanfare lose every comparison it had just won; the renders come off one master chain
  and are already comparable.

The question that works is not "what genre is this" — that has an unbounded answer space
and the judge confabulates in it — but "which of these two is more like X", best of three,
with the correct answer alternating between A and B. Chance is 50%. As of the last full
run every preset wins its own description: sixteen of them against their nearest
confusable neighbour, and 49 of 63 votes overall. The five that lose to a neighbour lose
because the judge picks the same member of the pair whichever way the question is asked,
and each of them wins against a distant distractor.

## Conventions

- Runtime dependencies are limited to pinned Strudel core and Superdough. Vite and
  TypeScript build the app; Playwright is a development-only verification dependency.
- Scale-degree space internally; convert to MIDI at the very last step.
- `samirettali/sottofondo` on GitHub, public. Repository settings are declared in
  `infra/github`, not clicked.
- Deployed at `sottofondo.samirettali.com`: a static build, rsynced to
  `/home/samir/volumes/side-proxy/sottofondo-web` on andromeda by `npm run deploy`, served
  by the Caddy in `servers/side-proxy` and carried to the internet by the shared
  Cloudflare tunnel. There is no server side to deploy — the whole thing is the bundle.

## Strudel migration

- New acid, techno and house recipes use `strudel-2`; the other genres and unversioned
  links/favourites use `legacy-1`. The existing genre definitions are the frozen legacy
  reference. `test/legacy-snapshot.test.ts` pins event lists from main at `df8152b`.
- A recipe carries engine version, genre version, genre, seed and sound mode. Never
  silently send an unsupported version through the current generator. Keep an older
  implementation available or reject its version explicitly.
- The new composition is independent of audio. Strudel `Pattern`/`Hap`/`TimeSpan`
  describe musical intervals; our Worker transport queries those intervals and splits
  tempo changes at unscheduled bar boundaries. There is no grid-step scheduler in the
  new path. Musical randomness stays in our integer hash, with independent decision
  domains and frozen lane names as IDs, rather than array indices.
- `PROFILES` selects acid/minimal/vamp strategies and phrase/mutation parameters.
  Existing sourced preset values remain shared inputs, never edited to tune the new
  engine. Put new-only changes in the Strudel profile or instrument mapping.
- Import core's pinned source modules rather than its umbrella entry: the latter pulls
  in a Kabelsalat UMD entry that fails under Node's ESM loader. Browser and Node tests
  exercise the same Pattern implementation.
- Superdough's multichannel output assigns `destination.maxChannelCount`, which can be
  zero on WebKit. `StereoOutput` keeps upstream Orbit effects but routes stereo into
  our master without assigning that value. Its source-module helpers and the bundled
  synth have separate context singletons; both are set to the same context.
- Keep the continuous 303 adapter: independent per-note oscillators do not preserve
  its accent accumulation and connected slides. A slide's fallback gate-off is
  cancelled by the next note, so a missed scheduling deadline cannot leave a drone.
- Synth and samples modes change only the drum sound source, on a bar boundary.
  The CC0 kit is a lazy same-origin JSON payload containing original FLAC bytes in
  base64, immutable source URLs and SHA-256 hashes. Never load default remote banks.
- Offline comparisons run each render in a fresh iframe because Superdough's node
  pools are global and cannot safely cross AudioContexts. The live app reuses one
  AudioContext and disposes one player before creating the next.
- `tools/listen.html` compares three versions at fixed gain without normalisation.
  `npm run render:comparison` exports 81 isolated clips; `npm run test:soak` runs a
  30-minute production-build playback check. See `docs/STRUDEL.md` for commands.

## Composer v2

- The user requires composition to run entirely locally, without generation APIs.
  Different seeds should create distinct musical identities; small variations of
  authored studies do not meet the goal. The studies remain listening references,
  not the accepted production direction. Research and a proposed constraint-based
  experiment: `docs/PROCEDURAL-MUSIC-RESEARCH.md`.
- Pressure and the faithful reference have an opt-in execution comparison in
  `/tools/acid-studies.html`: `performance=shaped` coordinates gates, accents and
  filter envelopes; `bell=1` reserves occasional answering gaps. Baseline scores
  and production recipes stay frozen. Scope and listening instructions:
  `docs/ACID-STUDIES.md#execution-comparison`.
- Gemini 3.8 Flash analyzed three acid-making videos with agentic video processing.
  Switch Angel uses random pitches then a fixed ribbon; randomness alone is not
  the established cause of weak output. Observations and corrected model claims:
  `docs/ACID-VIDEO-RESEARCH.md`.
- The user found ill-fitting notes even with the reference renderer and approved a
  composition-first approach. Three written acid studies and their independent
  gesture-based generator are at `/tools/acid-studies.html`. Crosscurrent and most
  of Afterglow were disliked; Pressure was recognized as similar to the original.
  Rules, preview scope and listening history: `docs/ACID-STUDIES.md`.
- The user confirmed the explicitly selected Original take in `/tools/acid-reference.html`
  sounds like the handwritten Strudel piece. Diagnose composition separately from
  sound there; scope, sample provenance and results: `docs/ACID-REFERENCE.md`.
- New acid uses genre revision 2 within `strudel-2`; revision 1 is frozen for
  saved recipes and the authored studies. `src/composer/acid.ts` adds dense related
  phrases, independently clocked timbral gestures and phrase-level drum conditions.
  The 303's optional velocity defaults to 1 to preserve older audio behavior.
- Keep `recipe()` as the frozen v1 recipe factory; use `currentRecipe()` for new
  compositions. V2 has `soundMode: auto`: the seed owns the palette. Explicit v1
  links retain their synthesis/sample selector and original event/audio mapping.
- `src/composer/plan.ts` builds an immutable song identity and addressed 128-bar
  chapters. Candidate phrases use integer costs. Parts are composed together before
  mute/density filtering; neither controls nor asset completion can regenerate them.
- Superdough's low-level fields are `fmi`, `cutoff`, `hcutoff`, `resonance`.
  REPL aliases `fm`, `lpf`, `hpf`, `lpq` are ignored here. `lpenv` is in octaves;
  the custom 303 uses cents. Sample banks default to MIDI 36; do not transpose both
  the note and playback speed. Actual audio probes guard these boundaries.
- The v2 catalog is authored data, separate from the frozen sourced genre presets.
  Local CC0 assets have immutable source URLs and SHA-256 hashes. Load only the
  selected kit/instruments and fail explicitly rather than substitute a different
  palette. The sampled bass, bell and guitar roots were checked spectrally.
- `tools/composer.html` compares v2/v1 and six authored 32-bar studies with the same
  instrument renderer. `npm run render:composer` exports 222 isolated WAVs without
  normalisation. Architecture, research and verification: `docs/COMPOSER.md`.
