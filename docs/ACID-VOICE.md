# Acid articulation listening experiment

The expanded ensemble still lacked the character of the user's references.
This experiment holds the composition fixed while changing acid execution and
drive. It follows the proposed listening experiment in
[the composition research](ACID-COMPOSITION-RESEARCH.html).

## Listen

Run the worktree's development server on port 5196. When accessing andromeda
through SSH, forward it with `ssh -N -L 5196:127.0.0.1:5196 andromeda`.

- [Liked Character seed 9d2371fe, linked mono with Grit](http://localhost:5196/tools/procedural.html?s=9d2371fe&palette=character&voice=mono-link-1&drive=grit)
- [Liked Character seed 0000001e, linked mono with Grit](http://localhost:5196/tools/procedural.html?s=0000001e&palette=character&voice=mono-link-1&drive=grit)

Press **Play**, then use **Hear the acid voice**:

| Control | What changes |
| --- | --- |
| Current voice | The existing per-note Superdough instrument and execution |
| Mono · separate notes | A continuous mono synth, with a fresh envelope for each note |
| Mono · linked notes | The same mono synth, with short connected groups sharing an envelope and gliding between pitches |
| Clean / Grit / Bite | Bypassed, rounded or abrasive distortion treatments, each with fixed tone and output trim |

Changing a control restarts the piece. Toggle the other instruments off to hear
the acid alone. The seed, tempo, pitches, note starts and accompanying parts stay
fixed. Linked notes intentionally extend gates across short gaps; the motif
display continues to show the original score.

**Compare versions → Compare acid articulation** exports two complete 32-bar
recordings, using the selected composition, palette and drive with all parts
audible. Both recordings use the mono instrument: separate versus linked notes.
Listen before pressing **Reveal takes**. The older sound, palette and composer
comparisons continue to use Current voice.

No recording is normalized. Drive treatments use static compensation, which
does not guarantee equal perceived loudness; Grit is quieter in the measured
examples. Comparing Current with a mono option changes both instrument and
execution. Comparing the two mono options isolates the articulation treatment.

## Scope and reproducibility

This is a preview instrument, not a circuit emulation or a production recipe
change. Existing links still use Current voice. New links preserve the explicit
`mono-step-1` or `mono-link-1` voice and `clean`, `grit` or `bite` drive; unknown
values are rejected. Earlier composition and palette versions remain available.

`tools/acid-voice-score.ts` derives a separate articulation plan from the immutable
32-bar score. One addressed integer draw per motif bar selects up to two links.
A link can join adjacent sixteenth-note starts, with at most three notes in a
group, and cannot swallow an accented attack or cross a beat boundary. Longer
rests stay intact. Filter accent charge is computed from musical positions;
the exponential is used only for a continuous sound parameter, never a note
decision. Muting and query order cannot change the plan.

`src/audio/acid-mono.ts` uses a continuous oscillator and the pinned Superdough
ladder processor. Connected notes share an amplitude/filter envelope; internal
pitch transitions use a 20 ms glide time constant. The treatment adds accent
memory, bounded resonance and filter movement, drive, and a filtered delay.
Its controls are authored approximations. The output uses the existing acid
orbit, including ducking from Character's kick.

Automation ends at zero between groups and before the next scheduled curve;
stopping disposes the oscillator, ladder and delay feedback connections. Offline
renders start from bar zero before cropping later sections, preserving the
continuous audio state. This does not claim bit-identical waveforms across
browsers or live/offline rendering.

## Verification and remaining decision

- Build and all 324 Node tests passed, including the frozen prior scores and
  articulation checks across 64 generated seeds plus both liked seeds.
- Four new Chromium checks passed: local playback and URL restoration; twelve
  isolated acid renders; a full 32-bar A/B export; and full mixes including a
  second loop and a cropped render. The existing procedural controls/playback
  regression also passed.
- The twelve isolated renders were audible and numerically distinct. Their last
  half-second fell below 1% of each recording's RMS after the release and delay.
  The four full mixes had peaks between 0.40 and 0.50, below clipping.
- Desktop and 390 px mobile layouts were inspected in Chromium; the controls
  fit without horizontal overflow. Firefox/WebKit checks remain pending.

These checks establish score preservation and working audio, not musical quality.
Human listening must decide which articulation and drive, if any, move the two
liked seeds toward the desired character before production adoption or further
composition changes.

Related experiments: [local composer](LOCAL-COMPOSER.md),
[acid-trance ensemble](ACID-TRANCE.md).
