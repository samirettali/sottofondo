# Two written pieces before further generation work

The user found the mono articulation/drive experiment closer in timbre to acid
trance, but still lacking its character. That result does not validate the
current compositional heuristics. The agreed next step is two original written
pieces in the existing engine, followed by listening and selective changes to
understand which musical relationships matter. Generalization into a local
generator depends on that feedback.

## Listen

- [Ferro](http://localhost:5196/tools/written.html?piece=ferro-1): 144 BPM,
  48 bars, 80 seconds. An insistent acid foreground, rooted in E, with a
  recurring low call and a held suspension before the return. The Blade rave
  reference motivates this direction.
- [Scia](http://localhost:5196/tools/written.html?piece=scia-1): 142 BPM,
  48 bars, about 81 seconds. A four-bar upper sequence above compact acid bass,
  with atmosphere taking the foreground in the middle. The supplied Colin
  McRae recording motivates this direction.

These are original compositions, not transcriptions of the references. They
play through once and finish. Use the existing port 5196 SSH tunnel, if needed:
`ssh -N -L 5196:127.0.0.1:5196 andromeda`.

Start with **Full mix**. **Focus on the riff** retains kick and acid in Ferro,
and kick, acid bass and main sequence in Scia. Individual instrument buttons
affect upcoming notes; sustained notes and effects already sounding finish
their tails. Changes do not rewrite the score or restart the transport.
Selecting the other piece stops playback; press its Play button to begin.

**Export WAV** renders the entire composition with all instruments, irrespective
of the live mute selection, at the same gain without normalization. The final
bars reserve space for release and delay tails. Versioned links select the
composition; they do not store a temporary solo/mute mix.

## What was composed together

| Decision | Ferro | Scia |
| --- | --- | --- |
| Foreground | Repeating low acid figure with octave responses and a chromatic approach to the fifth | A written four-bar sequence with a recurring head, a higher third-bar answer and a descending ending |
| Articulation | Explicit accents, held attacks and selected two-note slides | Short upper notes over a separate, offbeat acid bass figure |
| Foundation | Driven E kick with a longer body | Short A kick; the bass keeps an A pedal under the harmonic color changes |
| Support | A recurring two-hit low call in phrase-ending gaps; sparse sustained background | Am7 and Fmaj7/A support share upper notes; occasional descending high replies |
| Development | 4-bar signal, 8-bar lock, 8-bar pressure, 4-bar suspension, 16-bar release, 4-bar afterimage, 4-bar coda | 8-bar contour, 16-bar motion, 8-bar horizon, 12-bar overlap, 4-bar dissolve |
| Percussion | Stable subdivisions, open hats replacing closed strikes, selected phrase-ending fills | A softer regular hat texture, restrained backbeat, and fills at specific entrances |

Filter trajectories, phrase changes, gates and supporting entrances were written
with these roles in mind. The pieces do not share the previous composer's
Opening → Drive → Space → Build → Return form. Their notes are kept in degree
space until the renderer boundary. Sound values are authored choices, not new
claims about historical production settings or edits to sourced genre presets.

## Implementation and verification

`tools/authored-pieces-score.ts` contains both fixed scores and their explicit
articulation. Neither a seed nor an automatic scoring function selects their
phrases. Nothing imports their phrases into a generator. Strudel Pattern/Hap
objects feed the existing `ReferencePlayer`, continuous mono ladder instrument,
Superdough synths, native kick and bundled CC0 percussion. No new audio engine,
dependency, remote instrument bank or generation API is introduced.

The new listening page is `/tools/written.html`. The shared render harness accepts
`piece=ferro-1` or `piece=scia-1`, rejects unknown versions, and retains earlier
render routes. This is a development preview; production recipes are unchanged.

- Build and 327 Node tests passed, including complete/fragmented score queries,
  finite endings, written tie preservation and live mute invariance.
- Chromium checks cover both local playback paths and URL restoration, both
  full WAV exports, all eleven isolated instrument entrances, and Scia's complete
  live playback, automatic ending and restart in the same AudioContext.
- Isolated renders revealed that Scia's lead was too low relative to its acid
  bass. Lead/bass balance, short replies, atmosphere and hat levels were revised
  before repeating the audio checks. Render levels establish technical presence
  and headroom; they do not establish perceived balance or musical quality.
- Desktop and 390 px mobile layouts were inspected. The compact mobile section
  strip uses numbers with the current section named below it. Firefox/WebKit
  playback remains unverified in this environment.

## Acceptance and next experiment

Neither piece has listening acceptance yet. Ask whether either has the desired
character, which passages work, and whether removing accompaniment helps or
hurts. If one convinces, change one relationship at a time on that piece before
turning any observation into a generator rule. A fixed written example is an
acceptance reference, not a source of riffs for seeded variations.

Background: [composition research](ACID-COMPOSITION-RESEARCH.html),
[acid voice experiment](ACID-VOICE.md), [local composer](LOCAL-COMPOSER.md).
