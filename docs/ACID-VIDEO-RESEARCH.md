# Acid composition workflows observed in video

Research date: 2026-09-05. The user requested YouTube video analysis with Gemini
agentic video understanding, then explicitly selected Gemini 3.8 Flash. This is
research for the next composition decision; no generator was changed by this task.

## Method and consumption

Three public YouTube URLs were submitted separately to the Gemini Interactions
API with `model: "gemini-3.8-flash"`, video `processing: "agentic"`,
`thinking_level: "low"` and `max_output_tokens: 3500`. The prompt requested a
transcript/overview first, then selective visual/audio inspection around important
decisions; timestamped observations; stated reasons separated from inference;
and explicit unknowns. It did not tell Gemini which compositional approach to favor.

Agentic mode dynamically selects material; no separate `dynamic` processing enum
was needed. This is documented in Google's
[video guide](https://ai.google.dev/gemini-api/docs/video-understanding#agentic-video-understanding).
All responses identified `gemini-3.8-flash`, completed, and contained paired
`processing_call` / `processing_result` steps. Usage reported image and text tool
inputs, not a separate audio-token entry. Spoken claims below therefore rely on
Gemini's transcript/visual analysis, not an independent listening or note transcription.

| Video | Input | Tool input | Output | Thinking | Processing calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reinier Zonneveld | 370 | 3,520 | 1,501 | 9,769 | 2 |
| Switch Angel | 370 | 12,966 | 1,835 | 1,312 | 4 |
| Mikas | 370 | 7,284 | 1,570 | 15,298 | 4 |
| Total | 1,110 | 23,770 | 4,906 | 26,379 | 10 |

Total reported consumption: **56,165 tokens**. At the current standard introductory
[pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash), charging
input/tool tokens at $0.75/M and output/thinking at $3.75/M gives approximately
**$0.136**. This is a usage-based estimate, not a billing-console receipt. The output
limit did not cap accumulated internal thinking across agentic invocations.
No static comparison was run, so there is no measured savings percentage for this task.

## 1. Switch Angel: random material, then a fixed loop and live performance

[2 Minute Deep Acid in Strudel (from scratch)](https://www.youtube.com/watch?v=HkgV_-nJOuE),
approximately 3:34. Gemini reports these visible/spoken steps:

- **00:00–00:08:** Establishes 140 BPM and a synthesized four-on-the-floor kick.
- **00:10–00:36:** Generates sixteenth-note pitches using `irand`, maps them into
  C minor, and builds a sawtooth acid voice with a lowpass, filter envelope and resonance.
- **00:38–01:06:** Adds kick-triggered ducking and uses `.rib(46,1)` to repeat a
  one-cycle slice of the random pattern.
- **01:08–02:08:** Performs the filter envelope through a slider, then introduces
  a long, detuned supersaw/foghorn sound with FM.
- **02:14–03:18:** Builds a changing pulse/FM riser, brings the kick back, and adds
  distortion and room to develop the texture.

No candidate-rejection sequence is shown. That does not establish whether the
material was rehearsed or selected before recording. This is a live-built loop and
short performance, not an explanation of a complete finished-song arrangement.

**Interpretation:** This is a concrete counterexample to the claim that drawing
individual pitches randomly is inherently the wrong starting point. The random
material becomes a stable repeated object; much of the development is in its
sound, kick relationship and supporting voices. It does not prove every random
sequence is musically successful.

## 2. Reinier Zonneveld: write and articulate the line, then build around it

[Reinier Zonneveld Makes An Acid Techno Track From Scratch](https://www.youtube.com/watch?v=GsL3ggKoyCU),
approximately 23:54. This is DJ Mag's studio session with the producer, also
described on [the publisher's page](https://djmag.com/watch/watch-reinier-zonneveld-make-acid-techno-track-scratch).

- **01:05–03:15:** Starts with melodic/bass material before drums, explaining that
  drums can constrain the initial idea. Uses Ableton MIDI for a modified TB-303;
  adjusts velocities for accents and overlaps notes for slides.
- **04:40–08:50:** Adds an SH-101 layer, changes upper notes, and develops sustained
  layers by adding notes over time.
- **11:20–14:40:** Records/edits kick audio and discusses timing and low-frequency
  relationships with the bass. The detailed tuning and phase explanations in the
  model output were not independently verified and are not generalized as rules.
- **17:50 onward:** Records processed hardware passes and demonstrates changes in
  layer presence and effects. A complete intro-to-outro edit is not shown.

**Interpretation:** The phrase is shaped through pitch, duration, accent and slide
together. Extra instruments have supporting jobs, and recorded performances provide
material for subsequent selection. The visible workflow is manual editing and
auditioning; no randomizer or systematic rejection of candidate phrases is shown.

## 3. Mikas: reshape a preset, separate layers, and record movement

[How to Make Acid Techno Like AFX — Live Electronic Music Tutorial 303](https://www.youtube.com/watch?v=ZXJLLmgOIT8),
We Make Dance Music, approximately 34:19. Gemini reports:

- **03:33–05:15:** Reworks an Alchemy acid preset's step parameters, including
  tuning, dynamics and glide, while auditioning it.
- **08:00–11:45:** Adds kick sidechain and EQ, then separates lower weight from
  the upper acid layer to reduce overlapping frequency content.
- **12:20–16:15:** Adds percussion, expands the working timeline, and records
  hand-operated filter movement using Touch automation, with a separate delay send.
- **18:25–20:20:** Abandons a pad instrument after a technical problem and changes
  instruments rather than stopping the session.
- **26:08–33:30:** Adds fast shakers and sidechain, then sketches a drumless intro
  and the arrival of the drums.

**Interpretation:** A preset provides starting material, but step editing,
articulation, spectral roles and performed automation make the result specific.
The video develops a loop/timeline and sketches an intro; it does not establish the
full finished arrangement. No randomizer use is shown. The pad replacement is an
observed technical workaround, not evidence of melodic candidate selection.

## Corrections to the model's technical explanation

Gemini's reports are evidence extraction aids, not trusted API documentation.
The Strudel details were checked against the pinned `@strudel/core` source and
small direct pattern queries:

- **`duck("2:3:4")` targets orbits 2, 3 and 4**, not musical beats 2, 3 and 4.
  The kick events trigger the gain reduction. See
  [ducking](https://strudel.cc/learn/effects/#duckorbit) and
  `node_modules/@strudel/core/controls.mjs`.
- **`rib(46,1)` loops the interval starting at cycle 46 for one cycle.** The first
  argument is a time offset, not a PRNG seed argument. With deterministic random
  material it selects a repeatable slice. See
  [ribbon](https://strudel.cc/learn/time-modifiers/#ribbon).
- **`beat(2,32).slow(2)` repeats every two cycles**, not every 64 beats. A direct
  query over eight cycles returned onsets `[0.125, 2.125, 4.125, 6.125]`.
  At four beats per cycle, the repetition period is eight beats.
- Labels such as AUDIBLE in Gemini's response are not independently validated
  listening measurements. Exact notes, EQ values and claims about phase coherence
  should not become preset constants on this evidence alone.

## Implications for sottofondo

The earlier diagnosis that note-level randomness itself was the central mistake
was too strong. The user's disliked notes remain valid feedback, but the Switch
Angel example shows another concrete creative workflow using random input.
Authored gesture grammars are one possible generator, not a prerequisite imposed
by these videos. None of the examples establishes that more melodic complexity,
more layers, or a fixed cadence on every fourth bar is necessary.

The strongest shared observation is **a recognizable motif with developed
articulation and sound, plus instruments with related roles**. This suggests testing:

1. A short stable motif evaluated with its actual acid patch and drum context.
2. Accents, gates, slides and filter envelopes designed together where the selected
   synth supports them, with slower timbral performance over repeated notes.
3. Supporting sounds chosen for a specific role: low weight, rhythmic response,
   atmosphere or transition. Their timing and frequency range should fit the lead.
4. Entrances, removals and returns driven by a phrase-level arrangement, leaving
   enough repetition to hear the changes.

These are hypotheses for the next listening comparison, not implemented changes
or an objective quality metric. The user's latest feedback rejects Crosscurrent's
perceived tuning/timing and most of Afterglow, while finding its background sound
pleasant; the likely bell identification has not been explicitly confirmed.
Pressure is deliberately close to the handwritten reference, but the user has
not yet explicitly accepted its generated variations.

## API provenance

Completed interaction IDs, retained for audit without keys or hidden reasoning:

- Reinier: `v1_ChdXWm1jYXFfc0I4aVcyOG9QMzZ5XzRBSRIXV1ptY2FxX3NCOGlXMjhvUDM2eV80QUk`
- Switch Angel: `v1_ChdlNW1jYXZHcUo3Szduc0VQcW9tRzZBbxIXZTVtY2F2R3FKN0s3bnNFUHFvbUc2QW8`
- Mikas: `v1_ChdoSm1jYXE2akY4RGF2ZElQd3UyTG1BURIXaEptY2FxNmpGOERhdmRJUHd1MkxtQVE`
