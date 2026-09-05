# Acid studies and gesture-based generation

The user confirmed the handwritten reference, then reported that some notes in
the Generated phrase take did not fit. That take kept the reference sound and
drums, implicating composition as well as the previously changed renderer.
On 2026-09-05 the user agreed to start from three authored pieces and derive
musical rules from them instead of extending the note-by-note generator again.

`/tools/acid-studies.html` is the resulting listening prototype. It includes
three written compositions and a first seeded grammar for each. It does not
import the old composition algorithms or change the main app's recipe version.
The production composer remains revision 2 while the musical direction is
evaluated. Acceptance of these studies is still pending human listening.
Subsequent feedback disliked Crosscurrent's perceived tuning/timing and most of
Afterglow, but liked a background sound, likely its bell. Pressure was recognized
as close to the original. The following [video research](ACID-VIDEO-RESEARCH.md)
also qualifies the rationale: note-level randomness is not inherently unsuccessful,
and authored gestures remain one hypothesis rather than a settled requirement.

## Listen

Use the same development server and SSH tunnel as the reference page:

```sh
# In the composer worktree on andromeda:
npm run dev -- --host 127.0.0.1 --port 5196 --strictPort

# On the Mac, if the existing tunnel is not already running:
ssh -N -L 5196:127.0.0.1:5196 andromeda
```

Open `http://localhost:5196/tools/acid-studies.html`. Leave Version on Written
and use Piece to hear all three. Each develops over 32 bars and then repeats:

| Study | Written musical identity |
| --- | --- |
| Pressure | 138 BPM, E, dense sawtooth acid, octave replies, straight sixteenth hats and a rising ladder filter |
| Crosscurrent | 132 BPM, D, short square-wave calls, syncopated answers, broken kicks and larger gaps |
| Afterglow | 126 BPM, A, a softer filtered pluck, low sine pulse and FM bell replies occupying reserved gaps |

Choose Generated to hear a variation of the selected study. Next seed switches
to Generated and increments the seed; if playback is running, it restarts at bar
1. Selecting Seed chooses the piece also lets the seed choose among the three
identities. Copy link preserves the piece, version and seed. This is a preview
link, not a permanent production recipe format.

Compare recordings exports Written and Generated as anonymous A/B clips. Both
span the complete 32-bar arrangement at the study's tempo, with the same fixed
output gain and no normalisation. Reveal takes identifies them afterwards.

## Composition rules

`tools/acid-studies-score.ts` contains the authored vocabulary and the new pure
composer. It depends on the integer hash and Strudel's pattern representation;
it does not call `createSongPlan`, `developAcidPlan`, the old note walk or the
legacy preset strategies. The reference event interface is a type-only import.

Each study has four two-beat calls, four replies and four endings. A gesture
keeps its notes, rests, holds and accents together. Pitch uses scale degrees in
the minor-blues collection; conversion to MIDI happens when emitting events.
The two blue-note gestures resolve their quiet tritone immediately to an
accented fifth. Every closing gesture reaches the tonic. These are constraints
of these compositions, not a universal definition of good acid music.

A seed chooses a call, reply, ending and one of four constructions. The composer
then repeats the statement, fragments or echoes its opening, optionally raises
a whole reply by an octave, and closes the fourth bar. It never draws an
individual pitch or rest. The call chooses a tight or open delivery that links
note gates and drum articulation; Crosscurrent also links its hat pattern and
swing to that delivery. Afterglow removes the acid's entire second half-bar
where the bell answers, and derives the bell's closing pitches from the ending.

The seed selects a 32-bar form with introduction, groove, space, build and
return, plus a phase for the four-bar filter gestures. Drum entrances, fills,
the final half-bar build gap and the return share that form. Complete events
are deterministic functions of the plan and bar, with no clock-based decisions.
No new humanisation or per-step randomness is introduced.

This vocabulary is deliberately finite. It recombines authored material and
develops motifs, rather than selecting one of three fixed recordings. Among
seeds 0–255, relative pitch/rhythm/duration shapes number 190 for Pressure,
190 for Crosscurrent and 195 for Afterglow, excluding sound, tempo, key and
arrangement. Different seeds can still share a motif. These counts establish
combinatorial variety only; they do not establish musical quality or satisfy
the eventual breadth of the full application on their own.

## Playback and verification

The existing reference player now accepts an optional Strudel pattern and tempo.
Without those arguments the original reference path is unchanged. The studies
use Superdough synths and the same five pinned TR-909 preview samples, routed
through the existing fixed-gain output. Acid, sub and bell have separate orbits
so their echo settings do not compete. No dependency or sample asset was added.
Sample provenance and the preview-only scope remain as documented in
[the reference](ACID-REFERENCE.md#samples-and-validation).

Five unit tests cover gesture spans and tension resolution, recurring statements
and closures over 1,500 plans, relative motif variety, arrangement breaks and
reserved answering space, plus fragmented queries and seeking to bar 600.
All 305 repository unit tests passed, along with the production build and a
separate strict type check of the new tool/player/render path.

Three Chromium tests cover all six live takes and switching, seed/URL restoration,
and full 32-bar written/generated A/B exports for the three studies. The three
existing reference browser tests also pass, including sample-download retry.
Additional full-length generated renders use seeds 7 and 42 for each study.
Audio checks measure actual PCM for silence and clipping without normalising it.
They do not replace the listening decision.

## Next listening decision

First establish which written studies have the desired character and whether any
notes still sound out of place. Then judge generated versions of those studies
over several seeds. Expand the accepted vocabulary and promote the composer to
a new versioned production recipe only after that comparison. Existing links
must retain their prior music, and production assets must have suitable provenance.
