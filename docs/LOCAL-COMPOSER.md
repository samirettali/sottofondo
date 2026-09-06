# Local composition preview

`/tools/procedural.html` implements the experiment proposed in
[PROCEDURAL-MUSIC-RESEARCH.md](PROCEDURAL-MUSIC-RESEARCH.md). The preview generator
is named `relational-1`. Production recipes and the previous generators remain
frozen. Listening acceptance is pending; the checks below do not establish that
the new music is preferable.

## Listen

The existing development server runs in the composer worktree on port 5196.
From the Mac, use the existing tunnel or start it:

```sh
ssh -N -L 5196:127.0.0.1:5196 andromeda
```

Open <http://localhost:5196/tools/procedural.html>. It starts with **New composer**
and seed 1, with **Sound → Character**. Play, then use the six numbered seed
buttons. They select seeds 1–6 without an audition-based selection process.
The additional **0000001e** button restores the seed the user liked. Switch
**Sound → Original** to hear its sound and arrangement before this update.
Next seed increments the seed; typed words are hashed through the existing
seed parser. Switching restarts at
bar 1. Each new arrangement lasts 32 bars and repeats.

The visible motif shows the opening acid notes. Instrument buttons remove parts
from playback without regenerating the composition. The chart, section strip
and URL update when the seed changes. Copy link preserves seed, composition
selection and palette mode; this remains an experimental preview URL, not a
permanent production recipe.

Under **Compare versions**:

- **Compare sound update** exports Original and Character for the selected
  composition, at the same key, tempo and output gain. Character keeps the
  acid, sub and answering notes; it changes the sound and cymbal arrangement
  and adds harmonic parts to the new composer. This is an orchestration and
  sound comparison, not an isolated kick test. Instrument buttons provide
  live isolation. Fixed mode disables this comparison.

- Previous composer revoices the current acid revision 2 through the same
  instrument adapter and fixed output gain as the new composer. It preserves
  that generator's note/rhythm events, using its first 32 bars. Its complete
  production form is 128 bars; this preview does not compress that whole form
  into 32 bars. Compare motifs and part coordination here, not complete old/new
  production arrangements.
- **Use the same sounds and tempo across seeds** fixes the palette, key to E,
  and tempo to 138 BPM. This helps distinguish compositional variety from
  waveform, drum-kit, tempo and key changes. Register and part presence remain
  compositional decisions.
- **Compare composers** exports 32 bars of both takes, with all instruments
  included even if some are muted live. Order alternates by seed parity. Labels stay hidden
  until revealed. The WAVs use the same output gain without normalisation.

The new preview loads four selected CC0 sample assets (five in Original) from
the app's own `/samples/v2/` directory. Synthesis, composition and playback are local; there
are no remote generation calls or default remote sample banks. The separate
faithful-reference page retains its original preview sample-loading behavior.

## Composition

[`src/composer/procedural.ts`](../src/composer/procedural.ts) is independent of
the old acid algorithm and authored study vocabularies. No calls, replies or
endings are stored as note sequences. The musical rules are authored; the
actual motifs are generated.

1. **Identity.** The seed chooses a tonal collection, one-, two- or four-bar
   motif, rhythmic cell size, density, syncopation, contour targets, repetition
   preference and leap costs. A sparse lead can admit a low supporting voice
   and more answering notes. A dense lead gets fewer answers. Waveform, kit,
   answering voice and filter movement also belong to the seed.
2. **Rhythm.** Candidate onset positions share a generated rhythmic cell but
   receive different endings and reserved gaps. Accents can reinforce the
   quarter-note pulse or sit between its beats. Gate lengths depend on accent,
   density and the next onset. The opening pulse remains grounded in 4/4.
3. **Pitch.** A backward dynamic-programming table evaluates possible
   continuations over two octaves in scale-degree space. It accounts for
   contour, articulation, tonal stability, interval costs and the closing
   constraint. Each addressed draw samples among continuations within a
   seed-specific cost allowance of the best continuation. Every selected
   continuation has a feasible ending. This is bounded cost-guided sampling,
   not an exact implementation of the constrained Markov papers.
4. **Development.** A reply retains the generated rhythm but displaces its
   ending, starts from the call's closing pitch and solves new pitches in the
   context of the call. Contraction creates space; selected accented notes can
   move up an octave on the return. These transformations operate on this
   seed's material. A compact form grammar allocates 32 bars among opening,
   drive, space, build and return, with four length combinations.
5. **Original part relationships.** Hats respond to actual acid accents and rests;
   open and closed hats cannot strike together. Pitched answers occupy gaps.
   A sub note is admitted only when compatible with every overlapping acid
   note. Supporting parts reserve space for their short releases. Percussion
   uses remaining gaps, and fills draw on the ending rhythm. A final half-bar
   stop in the build makes room for the return. These parts are constructed
   from the complete score before any mute filtering.

The first cost formulation rewarded repeated tonic notes too strongly and
collapsed many melodies into tonic/octave sequences. It was corrected during
development. The diversity check includes a guard against that specific
failure, as well as rhythmic and relative-pitch coverage.

The original model uses conservative foreground harmonic relationships, not a
psychoacoustic analysis of the finished mix. Short reverb and delay tails are
not modeled as additional contrapuntal voices. It has one generated acid
protagonist and supporting parts, not unrestricted orchestration or learned
corpus statistics.

## Character sound and orchestration

On September 6 the user reported that similar kicks made otherwise different
seeds lack character. They liked seed **0000001e**, but its open cymbal sounded
arbitrary: it landed at tick 20 of alternating active bars only because the
acid happened to leave that position empty. Preserve this seed's original
audition and melodic score as a listening reference.

The user also supplied a liked Gemini-written 142 BPM D-minor acid-trance
example: a saturated 909 kick, regular hats/ride, phrase-ending snare rolls,
an eight-bar crash, a driven acid line with filter motion and delay, rolling
triadic arpeggios and sustained chords. The useful direction is distinct
simultaneous instrumental roles and a harmonic background. Its actual riffs
and Dm–C–B♭–Am progression are not stored as generation templates.

[`src/composer/character.ts`](../src/composer/character.ts) adds a separately
addressed `sound-character/1` design and arrangement pass:

- The kick is synthesized locally from a pitched body and noise transient.
  Tight, round and driven designs couple pitch sweep, tail, transient and
  saturation, with further values chosen by seed. It no longer depends on
  selecting similar kick samples. The numeric ranges are authored sound
  design choices, separate from the sourced legacy preset constants.
- Closed hats maintain a repeating cell. Open hats use regular offbeats or
  a consistent two-/four-bar accent, respect section entrances and exclude
  closed hits on the same tick. Explicit sampler envelopes and a shared choke
  group shorten their tails: a Hap's duration alone does not clip a sample
  in the pinned Superdough sampler.
- Triads are built from the seed's scale. An integer cost ranks middle chords
  against accented acid notes, note lengths and common tones. Tonic chords
  frame a four-slot harmonic cycle; two- or four-bar harmonic rhythm comes
  from the seed. Pentatonic collections allow fewer complete triads, and
  staying on one chord is allowed. Compatibility is a soft preference,
  not a guarantee that every acid note is a chord tone.
- Arpeggios and pads use that same harmonic plan. Register, filtering and
  entrances separate their roles; the arp leaves room for existing answering
  notes and drops out in the Space section. Which layers play, arp direction,
  subdivision and voice also belong to the seed. Pads create sustained space
  where the original algorithm allowed only short replies.
- Acid drive, filter range, resonance and tempo-synced delay vary with the
  design. The kick ducks the pitched orbits briefly. These sound changes do
  not alter original acid, sub or answering note timings, pitches or velocities.

Two pinned-adapter details surfaced in actual audio checks: `ftype: ladder`
also selects the filter implementation for `hcutoff`, and that implementation
is lowpass-only. Combining them at a low cutoff nearly silenced the acid.
Character therefore keeps the acid's ladder without that second filter.
Orbit's duck callback is scheduled 10 ms early; its first offline trigger is
bounded to keep the callback's time nonnegative.

`palette=original` restores the complete pre-update audition; `fixed=1` also
retains the original diagnostic palette. Original seed 0000001e's event list
is pinned by SHA-256 in `test/character.test.ts`. New parts are constructed
before mute filtering, so muting cannot regenerate the arrangement.

These changes expand the experiment's orchestration, not its production
scope. The foreground constraint checks still describe the original voices;
effect tails and sustained chord tension require listening, especially for
the denser seeds. Acceptance of Character is pending.

## Playback and determinism

[`tools/procedural-score.ts`](../tools/procedural-score.ts) converts degrees to
MIDI, applies the shared synthesis adapter and returns Strudel patterns. It
uses the existing per-note ladder sound and `ReferencePlayer` output at gain
0.35. The sound adapter coordinates accent, amplitude/filter envelopes and
section-dependent filter movement. It does not implement connected 303 slides.

Random decisions use integer hashes addressed by version, seed, decision domain
and position. The domain cache stores string hashes, not random state. Search
has a fixed finite state space; elapsed time never selects a result. The full
32-bar score is immutable, and Strudel queries repeat it with absolute event
times. Query order, seeking and muting cannot change its notes.

The preview stays on the main thread for now. Before the Character update,
Chromium on andromeda measured 5.8–21.3 ms to construct each of the six published auditions, including the
adapter. These six observations exclude asset loading and audio initialization;
they are not a latency percentile or a guarantee on other hardware.

## Verification

Baseline (Original), measured on 2026-09-05–06:

- Type checking and production build passed. The preview controller and render
  entry are included in the normal TypeScript check.
- All 314 Node tests passed. The final release-spacing adjustment also passed
  the five focused procedural tests.
- 1,000 seeds passed timing, pitch range, melodic interval, monophony,
  supporting harmony, release spacing, hat exclusion and arrangement checks.
- Among seeds 1–256, there were 254 onset sequences, 256 pitch-class sequences
  and 256 combined signatures after excluding tempo, key, timbre and absolute
  register. Seven had fewer than three pitch classes. These are coverage
  results, not perceptual uniqueness or quality scores.
- Four new Chromium checks passed: Node/browser score equality, live playback
  of six seeds, URL/control/mute behavior, failed-local-asset retry and render
  comparisons. External HTTP requests were blocked during score and playback
  checks. Three existing faithful-reference browser tests also passed after
  extending the shared player with an explicit local sample option.
- Complete new arrangements for seeds 1–6 and the 32-bar previous-composer
  excerpt for seed 1 rendered successfully. New peaks were 0.277–0.387 and RMS
  values 0.028–0.093 at the fixed output gain. No clip normalisation was applied.
- Desktop and 390px mobile layouts were inspected. The mobile page has no
  horizontal overflow, and arrangement labels fit their segments.
- Firefox and WebKit score checks could not launch because this server lacks
  their required system libraries. This run verifies Chromium and Node;
  cross-engine verification remains pending. No system packages were changed.

Character update, measured on 2026-09-06:

- All 317 Node tests passed; the final sound-mapping correction also passed
  type checking and the eight focused composition tests. Across 1,000 seeds,
  the added arrangement preserves the original melodic notes, respects timing
  and section limits, repeats its open-hat cadence and shares arp/pad chords.
- Seven Chromium preview checks passed, including full local playback and
  exports, URL restoration, isolated kick synthesis/disposal and isolated
  acid/arp/pad effect chains. The three existing faithful-reference checks
  also passed after the shared player extension.
- Full Character arrangements for seeds 1–6 and 0000001e had peaks
  0.304–0.406 and RMS 0.036–0.059 at the existing 0.35 output gain. Original
  0000001e rendered at peak 0.322 / RMS 0.085. The original/new composer pair
  for seed 1 and the Original/Character sound pair for 0000001e exported
  successfully, without clip normalisation.
- Isolated kick tails 150–250 ms after onset had RMS 0.0000 (tight), 0.0137
  (round) and 0.0055 (driven). Cancelling a future hit produced silence and
  each source group disposed exactly once. These are physical differences,
  not perceptual ratings.
- On seeds 1 and 0000001e, isolated acid RMS was 0.012–0.020 and arp/pad RMS
  was 0.0036–0.0042 over bars 3–4. This check caught the ladder/highpass issue
  described above; checking only the complete mix had missed the quiet lead.
- Six generation observations in Chromium were 9.1–27.9 ms, including the
  new sound and event adapter. Desktop and mobile controls were inspected.
  Firefox/WebKit verification and musical acceptance remain pending.

```sh
npm run build
npm test
CHROMIUM_BIN=/home/samir/.nix-profile/bin/chromium npm run test:browser -- \
  test-browser/procedural.spec.ts test-browser/acid-reference.spec.ts --project=chromium
```

The browser test writes the seed 1 composer pair and 0000001e sound pair below
`test-results/` in separate directories. For timing and level attachments, also pass
`--reporter=list,json` with `PLAYWRIGHT_JSON_OUTPUT_NAME` pointing inside that
ignored directory.

The next decision is human listening across the published seed set: do the
pieces have distinct identities, do their notes and parts fit, and do they
develop convincingly? Production adoption remains pending that comparison.
