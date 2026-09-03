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

- Zero runtime dependencies. Vite and TypeScript are the only build-time ones.
- Scale-degree space internally; convert to MIDI at the very last step.
- `samirettali/sottofondo` on GitHub, public. Repository settings are declared in
  `infra/github`, not clicked.
- Deployed at `sottofondo.samirettali.com`: a static build, rsynced to
  `/home/samir/volumes/side-proxy/sottofondo-web` on andromeda by `npm run deploy`, served
  by the Caddy in `servers/side-proxy` and carried to the internet by the shared
  Cloudflare tunnel. There is no server side to deploy — the whole thing is the bundle.
