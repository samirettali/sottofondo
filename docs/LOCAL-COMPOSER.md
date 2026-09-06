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
and seed 1. Play, then use the six numbered seed buttons. They select seeds 1–6
without an audition-based selection process. Next seed increments the seed;
typed words are hashed through the existing seed parser. Switching restarts at
bar 1. Each new arrangement lasts 32 bars and repeats.

The visible motif shows the opening acid notes. Instrument buttons remove parts
from playback without regenerating the composition. The chart, section strip
and URL update when the seed changes. Copy link preserves seed, composition
selection and palette mode; this remains an experimental preview URL, not a
permanent production recipe.

Under **Compare compositions**:

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
- Render A/B exports 32 bars of both takes, with all instruments included even
  if some are muted live. Order alternates by seed parity. Labels stay hidden
  until revealed. The WAVs use the same output gain without normalisation.

The new preview loads five selected CC0 sample assets from the app's own
`/samples/v2/` directory. Synthesis, composition and playback are local; there
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
5. **Part relationships.** Hats respond to actual acid accents and rests;
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

The current model uses conservative foreground harmonic relationships, not a
psychoacoustic analysis of the finished mix. Short reverb and delay tails are
not modeled as additional contrapuntal voices. It has one generated acid
protagonist and supporting parts, not unrestricted orchestration or learned
corpus statistics. Expanding those dimensions should follow listening evidence.

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

The preview stays on the main thread for now. On andromeda, Chromium measured
5.8–21.3 ms to construct each of the six published auditions, including the
adapter. These six observations exclude asset loading and audio initialization;
they are not a latency percentile or a guarantee on other hardware.

## Verification

On 2026-09-05–06:

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

```sh
npm run build
npm test
CHROMIUM_BIN=/home/samir/.nix-profile/bin/chromium npm run test:browser -- \
  test-browser/procedural.spec.ts test-browser/acid-reference.spec.ts --project=chromium
```

The browser test writes seed 1's two WAVs below `test-results/` in separate
directories. For machine-readable timing and level attachments, also pass
`--reporter=list,json` with `PLAYWRIGHT_JSON_OUTPUT_NAME` pointing inside that
ignored directory.

The next decision is human listening across the published seed set: do the
pieces have distinct identities, do their notes and parts fit, and do they
develop convincingly? Production adoption and wider orchestration remain
pending that comparison.
