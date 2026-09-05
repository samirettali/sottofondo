# Acido sotto casa listening reference

The user preferred the handwritten Strudel piece to both procedural acid
revisions. Increasing note density did not resolve that feedback. The previous
adaptation also changed the oscillator/envelopes, filter model, drum samples,
extra voices and mix processing, so its comparisons did not isolate composition.

`/tools/acid-reference.html` restores the original as a development-only listening
reference. On 2026-09-05 the user confirmed that the explicitly selected Original
take sounded like the Strudel piece. This is subjective agreement, not a claim
of bit-identical Web Audio output. The page now opens with Original selected;
the browser test guards that initial state.

## What stays fixed

- 138 BPM, four written note phrases, the sixteen-bar drum/parameter cycle.
- Per-note sawtooth, ladder filter, the original amplitude and filter envelopes.
- The five index-zero RolandTR909 files resolved by Strudel's sample map.
- A shared Superdough orbit into a fixed output gain of 0.35. No additional
  saturation, compression, ducking, delay, pads or counterlines. No normalisation.

The original code is in `tools/references/acido-sotto-casa.strudel`. It was
executed on strudel.cc and all 622 events in the first sixteen bars were compared
with the local score adapter, including zero-gain drums, note durations and all
explicit sound parameters. `test/acid-reference.test.ts` pins that independent
REPL result. In particular, the last snare bar has attacks at steps 8, 12 and 14;
the repeated clap/open-hat gain patterns reset every sixteen bars.

## Controlled auditions

| Take | Only changed element |
| --- | --- |
| Original | None |
| Biquad filter | `ftype`, keeping all notes and other controls fixed |
| Continuous 303 voice | Our continuous oscillator/envelopes, receiving the original note and parameter sequences |
| Generated phrase | Current acid revision 2 pitches and rests in E, with original note lengths, sound, gains and drums |
| Small seeded edits | Four inner notes swapped; anchors, endings, rests and each bar's pitch pool retained |

Each take starts at bar 1. A/B exports sixteen bars in separate frames, with order
alternating by seed and labels hidden until revealed. These are diagnostic
auditions, not a new default composer. The small-edit mode establishes whether
bounded changes preserve the reference; it does not satisfy the full desired
diversity between generated songs by itself.

The next listening question, after confirming Original, is whether Generated
phrase still sounds worse. That separates the current phrase algorithm from the
sound/mix changes before making another production revision.

## Samples and validation

The preview requests only the five required files from the upstream
[tidal-drum-machines repository](https://github.com/geikha/tidal-drum-machines/tree/15eac73c5e878550f91d864a4863e014799403f1/machines/RolandTR909),
pinned at `15eac73c5e878550f91d864a4863e014799403f1`. Their filenames were checked
against the sample map requested by the live Strudel REPL. The files are not
vendored or labelled CC0: this repository does not provide an explicit sample
licence. Production still uses its existing local CC0 assets. Failed preview
downloads can be retried; another sound is never substituted.

Four unit tests cover the independent REPL snapshot, isolated changes, bounded
edits, fragmented queries and seeking. Three Chromium tests cover all five live
takes, failed-download retry and the complete A/B render/reveal flow. Type checking
and production build passed. Musical preference remains the user's listening
decision; none of these checks establish that a generated take is better.

Strudel documents its [ladder filter and effects](https://strudel.cc/learn/effects/)
and [sample banks](https://strudel.cc/learn/samples/). The pinned Superdough source
is the authority for the low-level parameter names used by this adapter.
