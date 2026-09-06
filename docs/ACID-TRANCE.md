# Acid trance ensemble preview

The user liked Character seeds **0000001e** and **9d2371fe**, but found that
individual parts remained similar and some pieces drifted away from acid
trance. This revision expands the instruments and how they play while keeping
an acid lead, a four-on-the-floor kick and deliberate filter development as
the musical anchors. Genre identity is a listening target, not a test verdict.

## Listen and preserve versions

Use the existing development server and SSH tunnel on port 5196. Open:

- [9d2371fe, Acid trance](http://localhost:5196/tools/procedural.html?s=9d2371fe&take=new&palette=trance-1&fixed=0)
- [9d2371fe, Character](http://localhost:5196/tools/procedural.html?s=9d2371fe&take=new&palette=character&fixed=0)
- [0000001e, Acid trance](http://localhost:5196/tools/procedural.html?s=0000001e&take=new&palette=trance-1&fixed=0)

**Version** switches between Acid trance, Character and Original. All restart
at bar 1. The instrument buttons show the selected patch as well as its role;
muting does not regenerate any part. Both liked seeds have dedicated buttons.
Under **Compare versions**, **Compare Acid trance / Character** renders their
complete 32-bar arrangements as anonymous WAVs at the same output gain.
Acid trance uses an authored 138–146 BPM range, so the two clips can have
different lengths. No loudness normalisation is applied.

A fresh visit to `/tools/procedural.html` selects `trance-1`. Existing links
with a seed but no palette retain Character; explicit `palette=original`
and `palette=character` keep their previous meaning. An unknown palette is
rejected. Fixed mode continues to select the old diagnostic sounds at 138 BPM
in E and disables the sound/ensemble comparisons. The previous composition
algorithm can still be revoiced for comparison; it retains its earlier score
and does not receive the new ensemble's supporting phrases.

The old generator and sound functions remain in place. Tests pin both liked
Character event lists and their complete tempo, sample mapping and physical
kick configuration. Original 0000001e has its earlier separate snapshot.
Preservation concerns notes and controls; Web Audio renders are not promised
to be bit-identical. Future revisions must keep this version's implementation
and its instrument definitions available under the existing palette key.

## Instruments and writing

[`trance-voices.ts`](../src/composer/trance-voices.ts) defines 24 local synth
patches. It reuses instrument definitions from the frozen production catalog,
with separate authored adjustments; it does not import the production song
families or phrase templates. No additional samples, dependencies or API calls
are required.

| Role | Available instruments | Writing |
| --- | --- | --- |
| Sequenced lead | 9 pluck, FM, additive-pulse and detuned-saw patches | Running sixteenths, gallops, broken figures or octave pulses |
| Harmony | 10 pads, synthetic choir/strings, gated harmonics and chord stabs | Sustained open voicings, short repeated chords or syncopated stabs |
| Reply | 5 of the lead patches, excluding the active lead's patch | Two short notes at the end of a two- or four-bar phrase |
| Percussion | FM tom, metal rim, resonant tick | A repeating Euclidean cell, taking alternate two-bar turns |
| Transition | Filtered noise rise or noise wash | The end of the build and the first downbeat of the return |

The seed selects five supporting instruments from this library. Entrances,
rests and alternating roles limit simultaneous activity. Adding every patch
to every piece is not the method. Acoustic imitation is not the goal of the
synthetic keys or choir patches.

[`trance.ts`](../src/composer/trance.ts) generates a two- or four-bar contour
over chord-tone indices, then maps it onto the shared harmonic plan. Rhythms
and pitch contours are separate decisions. The main choices are stratified
across adjacent seed groups, with a hashed rotation per group, so browsing
adjacent seeds visits different lead patches and articulations. All choices
use integer hashes; there is no sequential random stream or timing-dependent
musical decision.

The acid, kick and sub note events remain the relational composer's events.
Acid gets stronger filter motion, resonance, envelopes and tempo-synced delay.
The new parts share Character's harmony, with octave spacing for sustained
chords. The lead leaves the reply a phrase-ending gap. It drops out in the
Space section while chords stay, and pitched percussion stops there too.
Hats repeat a stable metric cell; transition noise never appears at an
arbitrary melodic gap. Complete scores are built before mute filtering.

Existing conservative constraints still apply to the original acid/sub
relationship. Chord compatibility with passing acid notes is a soft cost;
reverb/delay tails are not additional voices in the harmonic solver. Musical
fit, balance and acid-trance identity still need listening across seeds.

## Verification

`test/trance.test.ts` checks version preservation, constraints on 1,000 seeds,
instrumentation/rhythm/pitch diversity and seeking/muting/looping. The browser
checks in `test-browser/trance.spec.ts` compare Node and browser scores, block
external requests during live playback, render every selectable instrument
through its actual effects, render eight full arrangements and export the
liked 9d2371fe comparison. The instrument probes use one fixed pitch to avoid
mistaking pitch changes for different synthesis.

```sh
npm run build
npm test
CHROMIUM_BIN=/home/samir/.nix-profile/bin/chromium npm run test:browser -- \
  test-browser/trance.spec.ts --project=chromium
```

Use `--reporter=list,json` and set `PLAYWRIGHT_JSON_OUTPUT_NAME` inside ignored
`test-results/` for the generation, instrument and mix measurements. Comparison
WAVs are isolated there by seed and version. Firefox/WebKit checks remain
pending because their required system libraries are unavailable on this host.

On 2026-09-06, build/type checking and all 321 Node tests passed. Across seeds
0–255, the ensemble check found all 24 instruments, 237 instrument combinations,
256 generated pitch figures and 254 supporting rhythm/arrangement signatures.
These counts do not establish perceptual uniqueness.

All four new Chromium checks passed: live playback and Node/browser equality
on seeds 1–6, 0000001e and 9d2371fe; individual audio probes of all 24 patches;
eight complete 32-bar renders with peaks below 0.95 and RMS above 0.01; and
the Character/Acid trance WAV comparison for 9d2371fe. The existing preview
control and faithful-reference playback checks also passed. New generation
observations were 9.2–15.1 ms on those eight seeds, excluding asset loading and
audio initialization. Desktop and 390px mobile layouts were inspected.
