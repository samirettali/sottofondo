# Multi-genre generative music toy — research and design

Extends the idea of vitling's *Endless Acid Banger* (EAB) to arbitrary genres, with
tuneable parameters and a reproducible seed.

---

## 1. How Endless Acid Banger works

Source: https://github.com/vitling/acid-banger — 1430 lines of TypeScript, 8 files,
**zero runtime dependencies**, no `package.json`. Licensed **CC-BY 4.0**, not a software
licence; author states it is a finished art project. Forks encouraged, attribution required.

### Architecture

```
Clock (setTimeout)  →  currentStep: NumericParameter (observable)
                       ├─ ThreeOhUnit ×2  → ThreeOh voice → DelayInsert → master
                       ├─ NineOhUnit      → sampler (4 mp3) ─────────────→ master
                       ├─ AutoPilot       (bar counters → regeneration + mutes)
                       └─ UI              (canvas repaint)
```

State is a 30-line observable, `genericParameter<T>`, with a getter/setter and a
subscriber list. `subscribe` fires immediately with the current value. No framework.

### The clock is the weak point

`boilerplate.ts` self-reschedules a `setTimeout` and every voice fires at
`au.currentTime` — no lookahead, no absolute grid. Jitter is main-thread jitter
(±10 ms under GC), and it drifts. `shuffle` is plumbed through `Clock` but called
with `0.0`, so swing is dead code. **You cannot express swing or microtiming on this
clock** — the effects are the same magnitude as the timer error.

### Generation

**303 notes** (`ThreeOhGen`): a root is drawn as `rndInt(15)+16` (MIDI 28–42 after a
+12 round-trip quirk in `textNoteToNumber`), then one of 8 hardcoded interval bags is
chosen:

```ts
[0,0,12,24,27] · [0,0,0,12,10,19,26,27] · [0,1,7,10,12,13] · [0]
[0,0,0,12] · [0,0,12,14,15,19] · [0,0,0,0,12,13,16,19,22,24,25] · [0,0,0,7,12,15,17,20,24]
```

There is no scale object and no weighted distribution — **repetition of `0` is the
weighting**, because note choice is a uniform `choose()`. Octave jumps are baked into
the bag as `12`/`24`/`27`. The bags are modal (b2, b7, minor pentatonic stacks), not
diatonic.

Gate probability per step class: `i%4==0 → 0.6`, `i%3==0 → 0.5`, `i%2==0 → 0.3`,
else `0.1` → **5.8 onsets per 16 steps (36%)**. `accent p=0.3`, `glide p=0.1`.
`density` is a `const 1.0` declared like a knob and never exposed.

**909 drums** (`NineOhGen`): no probability table — a per-instrument *mode* drawn
uniformly, each a hand-written rule. `kickMode ∈ {electro, fourfloor}`,
`hatMode ∈ {offbeats, closed, none}`, `snareMode ∈ {backbeat, skip, none}`.
`"none"` is unreachable in the shipped app because both call sites pass `full=true`.
The whole "electro" idea is one clause: `i%2==0 && i%8!=4 && rand<0.5` — never a kick
where the snare goes.

Velocity does double duty at playback: `sampler.play(0.7*vel, vel*0.5)` — gain **and**
decay time. Quiet hits are also short hits, which is why velocity-0.1 ghosts read as tics.

**AutoPilot**: `measure%64==0 → p=0.2` new note set · `measure%16==0 → p=0.5` per-303
new pattern, `p=0.3` drums · `measure%8==0` mutes (kick `p=0.2`, others `p=0.5`).
Patterns are never edited — mutation is always wholesale regeneration from the same
distribution. There is no notion of intro/build/drop.

**`WanderingParameter`** is the one genuinely reusable idea in the codebase: a bounded
random walk with momentum, stepped every 100 ms. `diff` is velocity not position, so
the walk is smooth; soft restoring force at the 20%/80% bands; detects user interference
by value comparison and backs off 20 s. Step size `scale = (1/400)*(max-min)` —
normalised, so one routine serves every parameter.

### Synthesis

**303 voice**: `Oscillator(saw|square) → Gain(vca) → BiquadFilter(lowpass) → out`.
The clever bit: the envelope is a `ConstantSourceNode` whose offset is scaled by a
GainNode and connected to **`filter.detune`, not `filter.frequency`** — so env mod is
in **cents** (0–8000, up to 6.7 octaves), exponential and musical, and it composes
additively with the Hz cutoff without fighting it. This is why it sounds like a 303.

Accent = higher VCA (0.2 vs 0.15) **and** a 3× shorter filter envelope (`decay/3`).
Slide = the `setTargetAtTime` time constant on `osc.frequency`: 20 ms vs 2 ms. Even
unaccented notes get a 2 ms portamento, which is a large part of the character.
Monophonic, always-running oscillator — no per-note node allocation.

**Drums are samples**, not synthesis, despite `audio.ts` containing an unused and
genuinely good synthesised 909 kick (400→50 Hz in 40 ms). Dead code also includes
`tone()`, `SimpleToneSynth()`, `boilerplate.repeat`.

**One effect only**: a feedback delay slaved to a dotted eighth (`0.75 * 60/bpm`),
fed by the 303s only — drums bypass it. No filter in the feedback path. No reverb, no
distortion. Master bus is a hard-knee 15:1 limiter at −0.5 dB, which is what glues it.

Latent bug: `DelayInsert(delayTime, dryWet, feedback)` called against
`function DelayInsert(time, feedback, wet)` — args swapped. Invisible only because
`subscribe` fires eagerly and overwrites both gains microseconds later.

### Determinism

**None.** Everything goes through global `Math.random()`. To reproduce a piece you need,
in order: (1) a seeded PRNG in `math.ts`; (2) replace ~20 call sites; (3) drive
`WanderingParameter` from the musical clock instead of its own `setInterval`, or the
knobs desync from the bars; (4) a stream per voice so re-rolling one voice doesn't
shift the others.

---

## 2. Research: generation algorithms

### Scheduling — fix this first

Chris Wilson, "A Tale of Two Clocks": https://web.dev/articles/audio-scheduling —
**25 ms `setTimeout` interval, 100 ms lookahead**, everything scheduled at absolute
`AudioContext` times.

```js
while (nextNoteTime < ctx.currentTime + scheduleAhead) { scheduleNote(step, nextNoteTime); advance(); }
```

This composes perfectly with the Tidal model below: **the lookahead window is the query arc.**

### Pattern representation — steal Tidal's

McLean, FARM@ICFP 2014: https://slab.org/tmp/p63.pdf

```haskell
type Query a = State -> [Event a]
data Pattern a = Pattern { nature :: Analog | Digital, query :: Query a }
```

A pattern *is* its query function. `fast`, `slow`, `rev`, `early`, `late` transform the
query timespan before delegating and transform the returned times back — so every time
manipulation is composable, invertible, and needs no buffering. Time is **rational**,
not float, so musical fractions stay exact. Events carry both a `whole` and a `part`,
so a fragment clipped by a query still knows its true extent.

Licensing: Tidal GPL-3.0, Strudel AGPL-3.0, both moved to Codeberg June 2025. Ideas
free, code not. `@strudel/core` would give a battle-tested engine on day one at the
cost of AGPL.

Worth reimplementing from Strudel: the **named probability vocabulary**
(`almostNever` 0.1, `rarely` 0.25, `sometimes` 0.5, `often` 0.75, `almostAlways` 0.9) —
a better API than passing floats; `off` (superimpose offset in time); `degradeBy`;
`grow`/`shrink`, which are literally a build-up and a breakdown as pattern combinators.
Continuous signals (`sine`, `perlin`, `rand`) that only become discrete when `segment`ed
are exactly how to express filter automation and per-bar energy sampling.

### Rhythm

**Euclidean** — Toussaint, BRIDGES 2005: https://cgm.cs.mcgill.ca/~godfried/publications/banff-extended.pdf ·
Bjorklund's note (only live copy): https://web.archive.org/web/20161222131610if_/https://ics-web.sns.ornl.gov/timing/Rep-Rate%20Tech%20Note.pdf ·
Demaine et al. 2009 proved a rhythm is maximally even **iff** it is Euclidean or a rotation of one.

| E(k,n) | Box | IOI | Name |
|---|---|---|---|
| E(3,8) | `x..x..x.` | 332 | tresillo / habanera |
| E(5,8) | `x.xx.xx.` | 21212 | cinquillo |
| E(5,16) | `x..x..x..x..x...` | 33334 | **bossa-nova necklace** |
| E(7,12) | `x.xx.x.xx.x.` | 2122122 | rot.3 = standard African bell |
| E(7,16) | `x..x.x.x..x.x.x.` | 3223222 | samba necklace |
| E(9,16) | `x.xx.x.x.xx.x.x.` | 212221222 | rumba palitos |

**Store `(k, n, rotation)` triples, not `(k, n)`** — most named rhythms live in the
rotations; E(7,12) alone has seven culturally distinct ones. Both Strudel and Tidal
encode this table *as comments*, so `euclid("bossa")` is impossible upstream. Making it
an addressable object is a one-line improvement nobody has made.

**Son clave is NOT E(5,16)** — E(5,16) is bossa. The six 5-in-16 timelines must be
table-driven: Shiko 4-2-4-2-4 · **Son 3-3-4-2-4** · Soukous 3-3-4-1-5 · Rumba 3-4-3-2-4 ·
Bossa 3-3-4-3-3 · Gahu 3-3-4-4-2. https://cgm.cs.mcgill.ca/~godfried/publications/clave.pdf

**Mutable Instruments Grids** — the single highest-value item for a drum engine.
Source: https://github.com/pichenettes/eurorack/tree/master/grids

```cpp
// 5x5 grid of nodes, each with three 32-step velocity tables from analysed breakbeats.
// X/Y are 8-bit: top 2 bits select the 2x2 block, low bits are the lerp fraction.
level = U8Mix(U8Mix(a, b, x << 2), U8Mix(c, d, y << 2), y << 2);
if (level > ~density[i]) { hit(); if (level > 192) accent(); }
```

Per-step velocity curves, bilinearly interpolated across a 2D style space, gated by a
per-instrument **density threshold**, with a second higher threshold promoting a hit to
an accent. Two knobs navigate a continuous space of patterns. **And the density
threshold is exactly where the energy curve hooks into the drums.**

**Marbles' déjà-vu** — https://pichenettes.github.io/mutable-instruments-documentation/modules/marbles/ —
a ring buffer of past random draws, with a knob crossfading between fresh draws and
replays. Moves continuously from noise → a loop that sometimes varies → an exact loop.
~15 lines, and it is the difference between a toy with phrases and a noise generator.

### Melody — Infno's DP cost table

Nick Collins, ICMC 2008: https://composerprogrammer.com/research/infno.pdf ·
source (SuperCollider, GPL): https://composerprogrammer.com/code/infnor1.zip

24 chromatic candidates per step over two octaves, Viterbi forward/backward.
`cost(i,j) = α·transition + β·contour + γ·penalty`, with **α, β, γ redrawn in 0.0–1.0
for each run** so every run has a different character:

| Cost | Value |
|---|---|
| repetition | accumulates, 1–10 per prior repetition |
| tritone transition | 0–20 |
| transition | \|distance from previous\| × (0–2) |
| contour | \|distance from the part's ideal contour\| |
| chromatic tone | 8–25 |
| diatonic tone | 4–10 |
| chord tone | half note 1–4, quarter 0.0–2.5, other 0.0–0.5 |
| voice interaction | landing on another voice's note, 0–10 |

Infno's other transferable idea, `getRelations`: given a preference list of
`[voice, chanceOfOpposition]` pairs, a new voice finds the first existing voice that
influences its material. **Parts are generated in arbitrary order but are not
independent.** And its techno rule, verbatim: *"adding one extra element every four
measures."*

**sharp11-improv** — https://github.com/jsrmath/sharp11-improv — independent
probabilistic knobs over a chord chart: `dissonance`, `changeDir`, `jumpiness`, `rests`,
`rhythmicVariety`, `range`. **Every parameter accepts either a fixed value or a
`[start, end]` pair linearly interpolated across the improvisation.** That is the energy
curve already implemented at the note-generator level.

**WolframTones** — https://tones.wolfram.com/ — one CA run, several different *reader
functions* over the same state, each a synchronised voice (bass reads the leftmost lit
cell, lead reads run-lengths, hats read row parity). One `Uint8Array` drives a coherent
multi-instrument arrangement, and the voices are automatically related because they
share a substrate. Infno's "parts are not independent" property, for free.

### Structure

**8 bars is the atomic phrase**; section boundaries land nowhere else. Section lengths
come from a small legal set, never a free integer. Two-tier fills: bar 8 subtle, bar 16
stronger and contrasting.

| Genre | Intro | Build | Drop 1 | Break | Build 2 | Drop 2 | Outro |
|---|---|---|---|---|---|---|---|
| DnB 174 | 32 | 16 | 64 | 32 | 16 | 64 | 32 |
| Dubstep 140 | 32 | 16 | 32 | 32 | 16 | 32 | 32 |
| Trance 138 | 32–64 | 32 | 32–64 | 64–96 | 16–32 | 32 | 32–64 |

Scale bar-counts by tempo so section *duration* stays roughly constant.
One concrete trick worth encoding: **drop the final 2 beats of the last build bar to
silence** before the drop downbeat.

**Vertical layering, from game audio** — https://alessandrofama.com/tutorials/fmod/fmod-studio/vertical-reorchestration —
each stem's gain is automated against a **parameter, not against playback time**, with
differently-shaped curves per stem so they enter and leave at different thresholds.
So: per-instrument `(minEnergy, maxEnergy)` windows, and the activation matrix generates
itself from the energy curve. Transitions quantise to the next bar, never fire immediately.

Variation strength as a pure function of position, scaled by section energy:

```ts
bar % 32 === 0 ? 1.0 : bar % 16 === 0 ? 0.7 : bar % 8 === 0 ? 0.45 : bar % 4 === 0 ? 0.2 : 0
```

Tension modelling if you want to go deeper: Farbood's parametric model (Music Perception
29(4) 2012) is the closest real precedent — harmony, pitch height, melodic expectation,
dynamics, onset frequency, tempo, meter, rhythmic regularity and syncopation weighted
into one continuous curve, calibrated against human tension-slider data, and driven in
Hyperscore by a curve the user literally draws.

Concrete numbers from https://www.edmprod.com/tension/ : builds 8–32 bars · risers work
with **1–5 semitones**, more does not help · master highpass 30→175 Hz, snare rolls
30→300 Hz · **cut level 5–10% in the last bars** so the drop's return to unity reads bigger.

Accelerating rolls — use the continuous form, it is the same exponential as a filter sweep
applied to inter-onset time:

```ts
let t = start; while (t < end) { hits.push(t); t += 1 / (r0 * 2 ** ((t - start) / T)); }
```

### Seeding

`mulberry32` / `sfc32` / `xoshiro128**`. The architecture matters more than the
algorithm: **generation must be a pure function of `(seed, bar, voice)`**, not a
sequential stream — a stream breaks the moment the user mutes a track or you add a voice.
Sonic Pi's `use_random_seed` is the proof of concept: all randomness rewinds on each run,
so a piece is reproducible while still sounding random.

vitling already solved shareable seeds in his own *autotracker*:
`{key, scale, progression, bpm, songIndex, seedCode}` → **5 bytes of style + 4 bytes of
RNG seed** as a hex save code. Copy that for URL presets.

### Synthesis notes worth knowing up front

- **`ConvolverNode` has no real-time parameter control.** Changing the reverb means
  rebuilding the buffer, renormalising and re-partitioning the FFT — a glitch, not a
  modulation. For a toy where room size should *move*, use an AudioWorklet FDN
  (≥8 channels, diffuser at 20/40/80/160 ms, ~85% feedback), with a generated IR as the
  fallback while `addModule()` resolves.
- The render-quantum floor on delays inside a cycle (2.67 ms @48 kHz) makes
  Schroeder/Freeverb/Karplus-Strong impossible with native nodes — and a cycle *without*
  a `DelayNode` **silently mutes every node in it**, no error, no warning.
- MDN's `makeDistortionCurve` is neither unity-gain nor correctly indexed
  (`/ numSamples` should be `/ (numSamples - 1)`).
- The `DynamicsCompressor` look-ahead is 6.0 ms (spec `delayTime: 0.006`), not the
  commonly-cited 6.4 ms.
- OpenAIR is offline; use EchoThief or Voxengo if you want real IRs.

TR-808 service notes (https://archive.org/stream/synthmanual-roland-tr-808-service-notes/rolandtr-808servicenotes_djvu.txt):
BD 56 Hz, decay 50/300/800 ms · CB 540 Hz · RS 1667 Hz · CL ~2500 Hz · CH 50 ms ·
OH 90/450/600 ms. **Accent is a per-voice amplitude multiplier of ~2–4× (6–11 dB), not
a per-step velocity** — model it as a boolean lane with a per-voice gain ratio, as EAB does.

TR-303 sequencer data model — five parallel tracks: **pitch, rest, accent, slide,
extended gate**. EAB's `{note, accent, glide}` is missing `extend`; adding it gives
legato runs for free. And the slide starts **on the step after** the marked one
(Whittle: https://www.firstpr.com.au/rwi/dfish/303-slide.html). The 303 accent is also
*stateful* — a 1 µF cap that doesn't fully discharge, so consecutive accented notes
sweep progressively higher (https://www.firstpr.com.au/rwi/dfish/303-unique.html).

---

## 3. Research: what actually makes a genre

### Genre is not a well-defined variable

MetaMIDI (ISMIR 2021, https://archives.ismir.net/ismir2021/paper/000022.pdf) matched
436,631 MIDI files against 32M Spotify clips: **genre metadata from different sources
agrees at 1.1% mean similarity**, versus 73.7% for title/artist. Spotify maintains
5,000+ genres. Every product that succeeds treats genre as *a bundle name over a
curated parameter set*. Don't be principled about the taxonomy — ship named presets.

### Prior art that models genre as data

**Band-in-a-Box `.STY`** is the deepest: a sparse grid of patterns, each cell carrying a
**weight 1–8** (9 = always, 0 = delete) plus conjunctive **eligibility masks** —
bar mask (1–8, plus pre-fill/fill/post-fill), beat mask, roman-numeral mask, chord type,
interval-to-next, range, push %, transpose limits, voice leading. Selection is literally
`w_i / Σw`. Its genre descriptor is seven fields plus a **1–100 intensity score**
orthogonal to the categorical label.

Its best transferable idea is **macro notes**: symbolic pitches replaced by a function at
playback. Bass `#76` = semitone below the next root, `#77` = next root, `#79` = best fifth.
A fixed riff becomes chord-aware without knowing any harmony.

**Ableton `.stacks`** is the cleanest small artifact — the official `Jazzy.stacks` is
**663 bytes, 23 interval arrays, zero code**:
`[0,3,7,10] [0,4,7,11] [0,5,10,15] [0,3,7,10,14,17] [0,7,14,18,21]` is the entire
harmonic identity of "jazzy".

**MMA** (https://github.com/infojunkie/mma/tree/master/lib/stdlib) is the only open style
language, ~124 genre files, with **per-track** `Rtime` (± ticks) and `RVolume` (± velocity %) —
`8beat1.mma` sets `RVolume 10` on hats and snare but `5` on kick and bass. Nothing in
JS-land has per-voice humanisation amounts.

**Gibber states the boundary condition:** its presets are not JSON because values can be
functions and presets carry a `presetInit(audio)` hook that builds FX chains. **A preset
stops being data the moment it needs to change routing rather than parameter values.**

### The schema

```ts
type GenreDef = {
  id: string; name: string; refs: string[];

  clock: {
    bpm: {min, max, default};
    meter: [number, number];
    stepsPerBar: 16 | 24 | 32 | 48;
    feel: "straight" | "shuffle8" | "shuffle16" | "triplet";
    swing: { pct: number;            // MPC semantics: 50 = straight
             subdiv: 8 | 16;
             appliesTo: VoiceId[] }; // per-voice, never global
    halfTime: boolean;               // written vs felt tempo (dnb, trap)
  };

  voices: Record<VoiceId, {
    gen: PatternGen;
    density: number;                          // 0..1, multiplies all probabilities
    vel: { base, accent, ghost, jitter };
    accentSteps?: number[]; ghostP?: number;
    nudgeMs: number;    // signed, CONSTANT per bar — the Dilla mechanism
    jitterMs: number;   // >=0, random, added LATE only
    mutable: boolean; muteP: number;
  }>;

  harmony: {
    scales: Weighted<ScaleName>[];
    keyPrefs?: number[];
    progressions: Weighted<{ degrees, barsPerChord, quality? }>[];
    voicing: { strategy: "triad"|"stack7"|"rootless"|"quartal"|"power"|"arpOnly";
               extensions: number[]; register: [number, number]; voiceLead: boolean };
    harmonicRhythm: number;   // chords per bar; 0 = static/drone
  };

  bass: { register, strategy: BassStrategy, gate, glideP, glideMs,
          kickLock: "onKick"|"offKick"|"sustain"|"free", accentP };

  lead: { enabled, scaleSource: "chord"|"key", register, notesPerBar: [n,n],
          contour: "arch"|"descending"|"random-walk"|"static",
          motifBars, motifRepeatP, callResponse };

  sound: Record<VoiceId, { engine: EngineId; params: Record<string, number> }>;

  fx: { reverb: {sizeSec, wet, preDelayMs};
        delay:  {noteValue: "3/16"|"1/8"|"1/8T"|"1/4"|"1/2", feedback, wet, fbLowpassHz?};
        sidechain: {db, releaseMs, targets};
        sat, bitDepth?, srReduceHz?, vinylNoiseDb?, wowHz?, wowCents? };

  arrangement: { sectionBars, entries: {voice, bar}[],
                 newPatternEvery, newPatternP, newNotesEvery, newNotesP, muteEvery,
                 build?: {bars, effects} };
};

type PatternGen =
  | {type:"stepClassP"; p:{q,e,s,other}}          // EAB's model, generalised
  | {type:"mask";   steps: number[]}
  | {type:"euclid"; k, n, rot}
  | {type:"clave";  name:"son"|"rumba"|"bossa"|"shiko"|"soukous"|"gahu"|"tresillo"}
  | {type:"corpus"; set:"giantsteps"; pattern:string}
  | {type:"break";  source:"amen"|"funkyDrummer"; chopP, reverseP}
  | {type:"roll";   divs:number[]; rollP; rampVel}    // trap hats
  | {type:"walk";   approach:"chromatic"|"scalar"|"fifth"}
  | {type:"none"};
```

**Pure data, no branch in the engine:** tempo/meter/grid · swing % and its targets ·
step-class probabilities · velocities · Euclidean triples · step masks · scale sets ·
progressions as degrees · registers · gates · glide · all FX amounts · sidechain dB ·
section lengths and entry bars · all mutation probabilities · 303 cutoff/res/envMod/decay.

**Needs a named code strategy the preset selects by enum** — declare these up front;
a preset picks one, it never adds one: half-time reinterpretation · trap hat rolls
(subdivision changes within a beat) · break chopping · walking bass with chromatic
approach (needs lookahead at the next chord root — BiaB's `#76`) · rootless voicings
with voice leading (needs previous-chord state) · arpeggiator-as-chord for chiptune ·
the 303 accent state machine · dub techno's degrading feedback chain (that is *routing* —
pre-build it, the preset only sets `feedback` and `fbLowpassHz`).

**Sliders** (persist across seeds): BPM · per-voice density · swing · 303 cutoff/res/
envMod/decay · delay wet+feedback · reverb wet · sidechain dB · volume · **chaos** (a
global multiplier on every `*P` in `arrangement`) · **genre morph** (crossfade the
numeric fields of two `GenreDef`s — works because everything is unitless or in real
units; only the enum strategies snap rather than blend).

**Derived per seed**: root and octave · which scale · which progression · Euclidean
rotation · the note bag · every step coin flip · accent and glide placement · mute
schedule · chop order · section variants · pattern-change events.

**Keep preset values unitless and let the engine expand them** — `2^(2*(p-0.5))` for
pitch, `(1/400)*(max-min)` for wander, and Sonic Pi's trick of expressing cutoff as a
**MIDI note number** (30–130) rather than Hz so it transposes musically. That is what
lets one wander/randomise/UI routine serve every parameter, and what makes morphing possible.

### The musicology that changes the defaults

**Quantise by default. Random humanisation is negative-value.** Every controlled study
found the quantised version equal or best:

- Frühauf, Kopiez & Platz (2013), *Musicae Scientiae* 17(2) — deviations of −25/−15/0/
  +15/+25 ms on kick and snare, N=93. Quantised rated highest; ratings fall monotonically;
  **early shifts worse than late**; **snare deviations worse than kick**; genre expertise
  had no effect.
- Davies, Madison, Silva & Gouyon (2013), *Music Perception* 30(5) — *"microtiming causes
  a decrease in groove for all cases, except when the MT-style is Jazz."* **5 ms was never
  distinguishable from quantised.** The highest-rated stimulus in the whole study was the
  **deadpan** funk example.
- Skaansar, Laeng & Danielsen (2019) — asynchrony → larger pupil dilation, worse tapping;
  participants preferred on-the-grid. **Bass-after-drums beat drums-after-bass.**

So: default `jitterMs: 0` in every genre, cap it at ~8 ms, label the slider honestly.
The value is in **`nudgeMs` — signed, constant, per-voice**, which is the Dilla
configuration, not random jitter. (For the record: Keil's 1987 paper contains no
milliseconds. Any ms figure attributed to it is folklore.)

**Spend the complexity budget on syncopation, and then repeat it.** Witek et al. (2014),
*PLOS ONE* 9(4):e94446 — 50 breaks, syncopation index 0–81, **no microtiming in any
stimulus**. Inverted U, quadratic beats linear; **wanting to move: Medium > Low > High;
pleasure: Medium > Low ≈ High**; R² = .347 / .427 with syncopation as the only contributor.

But Sioros et al. (2022) is the qualifier that matters: *"a moderate level of syncopation
increases groove, **but only for certain syncopation patterns**"* — what differs between
real and algorithmic syncopation is the *distribution* across instruments and metrical
positions, the counter-metre figures formed, and the number of pickup notes. **That is
precisely why per-genre step masks and clave tables beat a generic "syncopation amount"
slider.**

And Vuust & Witek (2014): groove is Bayesian prediction-error minimisation between rhythm
and metre, so **the complexity must be continuously repeated** to be learnable. **An
engine that varies its pattern every bar destroys the mechanism.** EAB's
`newPatternEvery 16` is well-chosen; do not lower it.

**Timbre is a timing parameter** (Danielsen). P-centre by attack: fast attack →
3.85/9.05 ms after onset; **slow attack → 12.52/24.51 ms**. Rise times: kick 2 ms,
snare 18 ms, cabasa 33 ms, synth bass 43 ms. Genre expertise changes the beat bin itself:
mean P-centre **EDM/hip-hop producers 26 ms · jazz 37 ms · folk fiddlers 40 ms**.
Perceptual floor ~5 ms; asynchrony detection in a groove context ~20–30 ms.
Per Martinsen, on techno: *"the extension of the rise time by slowly opening a hi-hat
changes the whole groove"* — in super-quantised genres, groove is changed by **envelope**,
not placement. And **sidechain is a groove control, not a mix control**
(https://www.mtosmt.org/issues/mto.20.26.2/mto.20.26.2.brovighanssen.html).

**Butler** (*Unlocking the Groove*, pp. 81–89) is the genre split itself: **"diatonic"**
asymmetrical patterns (3+3+2, maximally even) characterise house-derived genres;
**"syncopated"** patterns characterise breakbeat genres. p. 184: techno's **"total lack
of cadences"** — do not add chord progressions to acid or minimal techno, it destroys them.
From "Turning the Beat Around" (*MTO* 7/6): Krebs's intensity rule — **displacement by
1 or 3 sixteenths is strong, by 2 is weak**. One line, and it is a metric-dissonance
generator.

### Tempo, grounded

GiantSteps Tempo dataset, 664 human-annotated tracks (https://zenodo.org/records/1414996) —
trust the **medians**, the dataset is biased toward tempo-ambiguous tracks:

| style | n | median | σ |
|---|---:|---:|---:|
| deep-house | 24 | 122 | 8.3 |
| house | 23 | 126 | 26.9 |
| tech-house | 22 | 126 | 5.3 |
| techno | 61 | 126 | 13.7 |
| minimal | 8 | 127.5 | 1.6 |
| dubstep | 76 | 140 | 23.7 |
| trance | 74 | 140 | 7.3 (hard floor at 130) |
| drum-and-bass | 139 | **173** | 28.0 |

Beatport catalogue percentiles (n=1301) show most subgenres are **effectively
fixed-tempo**: Big Room σ=0.7, Progressive House σ=2.3, Electro House σ=2.5.
Ship `{min, max, default}` with max−min ≤ 8 for house/techno. DnB and dubstep are
**explicitly bimodal** (DnB p25=87, p75=160) — decide half-time vs double-time with a
`halfTime` boolean, never fudge it with a wide range.

Folklore checked: house 120–130 ✅ · dnb 160–180 ✅ · dubstep 138–142 ✅ (tightest peak
in the data) · techno 125–150 ⚠️ central mass is 120–130 · **trap and lo-fi have no
academic source at all** — those numbers are producer convention.

Preferred tempo: Van Noorden & Moelants (1999) — perceptual-motor resonance is
**500–550 ms = 109–120 BPM**, not exactly 120.

### Swing arithmetic

Δ = `300*(s−50)/T` ms, where s = swing % and T = BPM. At 90 BPM:

| Swing % | Δ (ms) | % of a 16th | long:short |
|---|---|---|---|
| 54 | 13.3 | 8% | 1.174 |
| 58 | 26.7 | 16% | 1.381 |
| 62 | 40.0 | 24% | 1.632 |
| 66 | 53.3 | 32% | **1.941** |
| 66.67 | 55.6 | 33.3% | 2.000 |

**66% is not triplet swing — 66.67% is.** Every MPC at nominal "66" produces 1.941.
(Akai MPC60 manual, ch.3 p.44.) Linn's own recommendation: 54% "removes the stiffness
from perfect 1/16-note timing"; 62% "more relaxed than a perfect triplet swing".

Jazz swing is tempo-dependent — Friberg & Sundström (2002), *Music Perception* 19(3):
the ratio falls roughly linearly with tempo, **the short note stays ≈100 ms above
150 BPM**, and the 2:1 triplet feel occurs at **one tempo only, ~200 BPM**:

```ts
ratio = clamp((60000/bpm - 100) / 100, 1.0, 3.5)   // 150→3.0 · 200→2.0 · 250→1.4
```

(Equivalent to the `autoSwing` percentage above — same curve, expressed as a ratio
rather than as a Linn percentage.)

Soloists swing *less* than the drummer (ratios 1.0–2.0), and in 20 of 21 excerpts the
soloist plays **after** the ride on downbeats while offbeats stay synchronised.
Contested by Honing & de Haas (2008), who find ~2.2:1 at slow tempi with no 100 ms floor —
ship the Friberg rule and expose the ratio as a slider.

Measured from the Groove MIDI Dataset (13.6 h, 1,150 performances,
https://magenta.withgoogle.com/datasets/groove) — **four to six numbers per genre are
enough to separate them**:

| style | sd(microtiming) | swing% | mean vel |
|---|---|---|---|
| jazz | 0.236 | 57.6 | 0.54 |
| blues | 0.290 | 58.1 | 0.43 |
| punk | 0.166 | 52.6 | 0.60 |
| rock | 0.187 | 50.9 | 0.59 |
| hiphop | 0.167 | 50.2 | 0.59 |
| funk | 0.162 | 49.8 | 0.52 |
| latin | 0.201 | 48.8 | 0.47 |

This also puts a number on Strudel's hardcoded `swing(n) = swingBy(1/3, n)`:
jazz ≈ `swingBy(0.30)`, rock ≈ `swingBy(0.036)`. **A single global swing constant covers
roughly one genre.**

---

## 4. The eleven genre recipes

Step indices 0-based over 16 steps/bar. Velocities 0–1.

| Genre | BPM | Swing | Grid | Kick | Snare/clap | Hat | Bass (MIDI) | Harm. rhythm | Rev / delay / SC |
|---|---|---|---|---|---|---|---|---|---|
| Acid techno | 130–145 | 50 | 16 | `0,4,8,12` | `4,12` | 16ths .25 + OH offbeat | 28–42 | **0** | 0.8 s / 3-16 / 0 dB |
| Deep house | 120–124 | **54–58** | 16 | `0,4,8,12` | `4,12` | 16ths .25 + OH .5 | 33–45 | 1 | 2.2 s / 3-16 / **5 dB** |
| Detroit/minimal | 125–132 | 50–52 | 16/32 | `0,4,8,12` | `4,12` sparse | offbeat 8ths .35 | 28–40 | 0–0.25 | **3.5 s** / 3-16 / 1 dB |
| DnB / liquid | 170–176 | 50–54 | 16×2 | `0,10` | **`4,12` fixed** | 8ths .4/.25 + ghosts | 24–36 | 0.5 | 3 s / 3-16 / 2 dB |
| Lo-fi / boom bap | 78–92 | **54–62** | 16 | `0,10` | `4,12` + ghosts .3 | 8ths .45 + 16ths .4 | 33–45 | 1 | 1.5 s / — / 0 dB |
| Trap | 130–150 (½) | 50 | 16 + rolls | sparse sync. | **`8` only** | 16ths + rolls p .2 | 24–36 | 0.5 | 2 s / 1-8T / **8 dB** |
| Ambient | 50–80 / free | — | free | — | — | — | 24–40 | 0.06–0.25 | **10 s** / 2.5 s / 0 dB |
| Synthwave / italo | 100–128 | 50 | 16 | `0,4,8,12` or `0,8` | `4,12` **gated** | 16ths .3 + OH .45 | 28–45 | 1 | 1.5 s gated / 3-16 / 3 dB |
| Dub techno | 120–128 | 50 | 16 | `0,4,8,12` soft | `4,12` wet | offbeat 8ths .25 | 28–38 | 0–0.25 | **5 s + fb loop** / 3-16 fb .75 / 3 dB |
| Bossa | 120–140 | **50** | 16×2 | `0,3,8,12` | clave `0,3,6,10,13` | 8ths .3/.22 | 28–45 | 1–2 | 1.5 s / — / 0 dB |
| Jazz swing | 120–200 | **formula** | 12 | feathered .15 | comping p .25 | ride swung | 28–45 | 1–2 | 1.5 s / — / 0 dB |
| Chiptune | 140–180 | 50–58 | 16 (6 ticks) | `0,8` | `4,12` | 8ths | 28–45 | 0.5–1 | **none** / faked / 0 dB |

Per-genre detail worth carrying into the presets:

- **Acid**: keep EAB's eight interval bags verbatim, they are well-chosen. `accentP 0.30`,
  `glideP 0.10`, glide 60 ms. **No harmony at all** — static tonal centre. Reuse EAB's
  autopilot numbers as the default `arrangement` block for all four-on-the-floor genres.
- **Deep house**: swing applies to **hats and bass only, never the kick**. Bass is
  `kickLock: "offKick"` on `[2,6,10,14]` — that offbeat bounce against the four-on-floor
  kick *is* house. Chords as offbeat stabs, `rootless`, extensions `[7,9]`.
  Progressions: `i7–VII–VI–VII` · `i7–iv7` · `ii7–V7–Imaj7` · `vi–IV–I–V`.
- **Detroit/minimal**: kick has **no variation whatsoever** — constancy is the point.
  Variation lives in one auxiliary lane (`technominimal_CCM` in the GiantSteps corpus has
  a constantly rotating accent voice over a rigid core). Detroit harmony is lush
  (`i7–VImaj7`, `i–VI–VII`); minimal has one chord or none. Nothing "drops" — one element
  enters or leaves every 16 bars, 7–9 minute tracks.
- **DnB**: two-bar unit. Snare `[4,12]` is **fixed**; everything varies around it.
  Kick bar 1 `[0,10]`, bar 2 `[0,6,10]` with `p=0.5` on 6. Sub `kickLock: "sustain"`.
  Harmony at half the drum rate. Model as **rhythmic streams** (bass/snare/hat roles),
  not one grid — breakbeat genres emphasise metrically weak locations (Panteli, ISMIR 2014).
  Duncan & Orgs (2024): **low-frequency amplitude gates whether syncopation increases
  groove at all**.
- **Lo-fi**: `nudgeMs` is the whole recipe — hat 0, **snare −14 (constant, every bar)**,
  bass −35 (or −100 for the Dilla anticipation), `jitterMs 0` everywhere. Peterson's
  measurements: "Keep It On" synth bass anticipates ~100 ms; "Come Get It" snare and hat
  nominally simultaneous sound 70 ms apart; "Fall In Love" snares are *on* the beat but
  reverb-drenched so they hold full volume >30 ms — **timbral, not temporal**.
  Vinyl noise −30 to −24 dBFS, bitcrush 10–12 bit, SR reduce to 22–32 kHz, wow 0.3–0.6 Hz
  / 5–15 cents. Borrowed minor iv is the signature harmonic move.
- **Trap**: `halfTime: true`. Snare on `[8]` only. Hat rolls
  `{divs:[3,6,8,12], rollP:0.2, rampVel:true}` — **triplet rolls matter as much as binary**.
  The 808 *is* the bass and shares note events with the kick (`kickLock: "onKick"`),
  pitch envelope +18–24 st decaying over 30–50 ms, amp decay 0.5–1.5 s,
  **glide 60–120 ms at `p=0.5`**, saturation 10–20%.
- **Ambient**: `bpm: 0` and a Poisson process at 0.2–1.0 events/s. Attack 1–4 s, release
  3–10 s, LFO at **0.02–0.05 Hz**. Reverb 6–15 s wet 0.5–0.7. Use EAB's
  `WanderingParameter` at `scaleFactor 1/4000`. No cadences, fixed 5–7 pitch-class set.
- **Synthwave**: the Moroder pulse — continuous 8ths or 16ths alternating root/octave/fifth,
  **gate 0.50** (the gaps are the groove), `kickLock: "free"`. Gated reverb on the clap:
  1.5 s hard-gated at 200–400 ms. Andalusian `i–VII–VI–V` with the raised leading tone.
- **Dub techno**: the chord chain is the genre and it is *routing* — pre-build
  `stab → HPF 300 → pingPong(fb .65–.80, feedbackPath: LPF 1.2 kHz + sat 5%) → hall(4–6 s)`.
  One stab per bar on step `[2]`, nothing more. Expose only `feedback` and `fbLowpassHz`.
- **Bossa**: **straight 16ths, swing 50** — the common and audible mistake is swinging it.
  Clave `[0,3,6,10,13]` = 3-3-4-3-3. Bass is root on the dotted quarter, fifth on the
  "and of 2". `Imaj7–II7–ii7–V7`.
- **Jazz**: the swing formula above; ride uses it, lead uses Benadon's BUR band 0.9–1.4
  and lands 40–60 ms late on downbeats. Feathered kick at vel 0.12–0.18. Walking bass
  needs the chromatic-approach lookahead. Rootless A-form (3-5-7-9) and B-form (7-9-3-13)
  alternating so guide tones move by step; `voiceLead: true` is mandatory.
- **Chiptune**: the constraint *is* the genre — **4 channels** (2 pulse, 1 triangle,
  1 noise) with a voice-stealing allocator, more convincing than any sample choice.
  Volume is **4-bit: quantise every velocity to n/15**. Chords are impossible, so
  `arpOnly`: one pulse cycles root→3rd→5th at **1 tick (~16.7 ms)** and the ear fuses it.
  No reverb, no delay — write the echo as an extra note 3 ticks later at half volume.
  Vibrato with a **100 ms onset delay** is what makes it sound like a tracker.

## 5. Corpora to load directly

- **GiantSteps drum-pattern-datasets** — https://github.com/GiantSteps/drum-pattern-datasets —
  **51 EDM subgenre archetypes with textbook attribution**, plain text, GM note numbers
  per step. The best genre-labelled rhythm corpus that exists. Pattern length is
  per-genre: house 16 steps, techno and breaks 32. `FR-3-patterns` adds 12 ballroom
  styles including bossanova. (`EDM-literature-patterns` and `House-Techno-Breakbeat`
  are byte-identical duplicates.)
- **Bardet's 200/260 Drum Machine Patterns, digitised** —
  https://github.com/stephenhandley/DrumMachinePatterns — 268 patterns, 24 style families,
  JSON. Instructive limitation: Swing1 and Jazz1 share an *identical* ride pattern and
  differ only in tempo and feel, **neither of which that schema carries** — the argument
  for putting tempo and swing in the genre object, not the pattern.
- **Groove MIDI Dataset** — its `info.csv` header is the most reusable genre schema found:
  `drummer,session,id,style,bpm,beat_type,time_signature,...` where `style` is a two-level
  `primary/secondary` string (18 primaries, 77 full strings).
- **Hooktheory Trends API** — https://www.hooktheory.com/api/trends/docs — the only free,
  live, genre-aware harmonic dataset with **published probabilities**. ~76–79k songs, a
  chord-transition Markov tree over HTTP in roman numerals. Root I 0.189, IV 0.172,
  V 0.157, vi 0.147; after IV→I, V is 0.436. 33-genre vocabulary with stable integer IDs
  plus five 0–100 complexity metrics. Rate limit 10 req/10 s.
- **Strudel `tidal-drum-machines.json`** — 71 machines, 683 sound keys. Use its names
  (`bd sd hh oh ht lt cr cp perc rim mt cb rd sh tb`) as the `VoiceId` keys; it is the
  de-facto standard for browser live-coding.

Worth noting as a sanity check on ambition: **Magenta Studio ships five plugins and every
one exposes exactly one continuous knob — temperature.** Google shipped a production
generative-music product with zero genre parameters.

---

## 6. Proposed build

### Order

1. **Scheduler** — lookahead (25 ms / 100 ms), absolute `AudioContext` times, rational
   time internally. Everything else depends on this and it cannot be retrofitted cheaply.
2. **Seeded PRNG** — generation as a pure function of `(seed, bar, voice)`. URL is
   `?g=acid&s=<hex>` from day one, in vitling's own autotracker format.
3. **Pattern layer** — `PatternGen` union: step masks, step-class probabilities,
   Euclidean `(k,n,rot)`, clave table. Grids-style velocity-map interpolation for drums.
4. **Genre presets as JSON** — port acid verbatim from EAB first, so there is a known-good
   reference to A/B against, then house, dnb, lo-fi.
5. **Energy curve + arrangement** — one 0–1 scalar per bar driving per-instrument gain
   windows, drum density thresholds, filter cutoff and variation probability.
6. **Harmony engine** — only when a genre needs it (house onward). Acid, minimal and dub
   techno deliberately have none.

### Two things nobody upstream has done, both cheap

- Make the **genre→parameter mapping an addressable data structure** rather than a
  comment (Strudel/Tidal), a checkpoint filename, or a CSV column.
- Ship a **per-genre swing table** instead of one hardcoded constant.

### The test for "is the schema done"

Adding genre #12 must require **no new code, only a new JSON file**. Test it with
something awkward — gqom, footwork, or a 7/8 Balkan preset — before calling it done.

### The 300-line kernel

If only six things get built, these account for most of the perceived quality:

1. Pattern as a pure function of `(seed, bar, voice)`, hashed with `Math.imul`.
2. Per-step `strength: number` instead of booleans, with one threshold comparison giving
   density, accents, fills and morphing — plus a 16-entry metric-weight table.
3. The weight-stacking melody generator: `stepPrior × narmour × chordTone × contour ×
   gravity × cadenceFunnel`, normalised. A log-linear model dressed as a Markov chain,
   ~40 lines, no training data, every knob musically meaningful.
4. A McGill-matrix chord loop voiced by closest-inversion.
5. `autoSwing(bpm)`, one line.
6. One energy scalar driving layers, density, register, cutoff and fill probability together.

L-systems, cellular automata and constraint solvers belong behind a mode switch, not in
the backbone.

### Concrete pieces worth having on hand

**Auto-swing** — one constant reproduces Friberg & Sundström's published curve, because
what is actually held constant is the short note at ≈100 ms. Measured on ride cymbals,
so the swung pair spans a whole beat (two eighths), not half of one:

```ts
const autoSwing = (bpm: number) => {
  const pair = 60 / bpm;                        // a beat, split into two swung eighths
  return clamp(1 - 0.100 / pair, 0.50, 0.75);   // 100→3:1 · 200→exactly 2:1 · 300→straight
};
```

**Melodic step prior** — corpora are step-dominated, and the asymmetry is deliberate
(descents are longer and gentler because of the arch):

```ts
const STEP_WEIGHTS = { 0:0.06, 1:0.24, '-1':0.26, 2:0.10, '-2':0.09,
                       3:0.05, '-3':0.04, 4:0.04, '-4':0.03, 7:0.02, '-7':0.02 };
```

Huron measured >6000 Essen folksongs: the **arch contour is ~40%**, the single most common
shape. Defaulting the phrase contour to `sin(πu)` is the cheapest change that makes a
generated line sound like a melody.

**McGill Billboard transition matrix** (730 Hot 100 songs, 1958–91, Shaffer et al. 2019,
*Empirical Musicology Review* 14(3–4) Table 2) — ~144 floats for statistically real pop
harmony. The headline entries: **V→I 0.618 · IV→I 0.504 · ii→V 0.465 · I→IV 0.347 ·
♭VII→I 0.399 · ♭VI→♭VII 0.286 · vi→IV 0.286 · vi→ii 0.273**. Five chord types
(maj/min triad, dom7, min7, maj7) cover **85.7%** of the corpus.

And the thing that matters more than the matrix: de Clercq & Temperley's rock corpus has
`V IV I` at **292 instances** against `IV V I` at 352. **Classical function theory's
D→S prohibition simply does not hold in rock** — ship two transition tables, classical
and pop, and let the genre pick.

**Naming trap** — Tidal's `every n f` is `when ((== 0) . (mod n))`, so it fires on the
**first** bar of each group, not the last. `every' 4 3` is the drummer's "fill on bar 4".
Strudel renamed these `firstOf` / `lastOf` for exactly this reason. Use the Strudel names.

**Elektron trig conditions** are the better UI for the same algebra: `A:B` = "plays on
repeat A of every B", i.e. `(repeat-1) mod B == A-1`. `4:4` is the fill bar, `1:8` the
crash on the 8-bar downbeat. Two behaviours to copy: the condition **overrides**
probability rather than multiplying with it, and `PRE`/`NEI` chain one bit of conditional
state through the bar so a single coin flip at step 1 branches the rest of it coherently.
**That coherence is what makes probabilistic sequencing sound musical rather than
sprinkled, and it costs one boolean per track.**

Same principle in Grids: chaos is a **per-bar, per-instrument** density offset re-rolled
at step 0, not per-step noise. A bar stays coherent — hats get busier for a whole bar
instead of sprinkling randomly.

**Bjorklund vs Bresenham** — tested over all 2080 `(k,n)` pairs with n ≤ 64: the
Bresenham/`floor(i·k/n)` formulation is **never structurally wrong**, it always yields the
same necklace, and differs only by a rotation — with no closed form for the offset.
The rotation is the musical part, so use Bjorklund. `E(5,8)` bjorklund is `x.xx.xx.`
(cinquillo); bresenham gives `x.x.xx.x` (habanera). Both are real rhythms; only one is
the one you asked for.

**Marbles' déjà-vu maps onto stateless hashing for free**, which is the nicest
consequence of the whole architecture:

```ts
value(i) = dejaVu > rnd() ? hash(seed, i % loopLen) : hash(seed, i);
```

### Six rules to build to

1. Weighted selection + conjunctive eligibility masks is the whole Band-in-a-Box engine.
   `pick(candidates where masks match, weighted by w)` gives fills, endings, 2-bar
   groupings and post-fill variation **with no genre-specific code**.
2. Separate the categorical genre label from a **continuous intensity axis** (BiaB's
   1–100). "Deep house at 20" and "deep house at 80" are different presets sharing a schema.
3. Keep preset values **unitless** and let the engine expand them.
4. **Enum tags, not routing.** Pre-declare every synthesis and effect topology.
5. **Kit and pattern orthogonal from day one** — `Loop = Kit × Sequence`.
6. **Humanisation is one-sided.** `nudgeMs` signed and constant, `jitterMs` unsigned and
   random, default 0 everywhere.
