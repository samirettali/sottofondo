# Strudel migration

The first migration covers acid, minimal techno and deep house. It produces an
infinite procedural composition with returning motifs, bounded phrase variations,
genre-specific rhythmic relationships and the existing section/energy profiles.
The other genres remain on the original engine.

## Run and compare

```sh
npm ci
npm run dev
```

Open the app without query parameters for a new acid composition. An existing link
with only `g` and `s` deliberately selects the legacy engine. Selecting a genre or
requesting a new seed uses the current engine for that genre.

The sound selector offers **Synth** and **Samples + synth**. Both play the same
score; only the drum source changes. The change is queued at a bar boundary
after the kit has loaded. A failed load leaves the previous sound active; select
the mode again to retry.

At `/tools/listen.html`, choose a genre, seed and section to render three clips:
legacy, synth and samples. Their A/B/C order rotates with the seed. Listen before
revealing the labels. The first eight bars form the opening; development is taken
from the main section; transitions straddle a change into a stripped section.
Each frame renders from the beginning before cropping, preserving prior effect
and accent state. Rendering advances a bar at a time to bound the active graph;
Firefox falls back to scheduling ahead because it lacks offline suspension.
No clip is normalised.

```sh
# With the development server running:
npm run render:comparison
```

This exports 81 WAVs for three genres, three seeds, three sections and three
versions, plus a manifest, under `test-results/listening`. Override `RENDER_DIR`
to keep artifacts elsewhere and `RENDER_URL` for a different server. Each WAV has
its own directory and the neutral filename `clip.wav`.
`RENDER_RESUME=1` reuses complete clip triples after an interrupted export; use it
only when the renderer and music have not changed.

## Architecture

`Recipe → composition → Strudel Pattern → Worker transport → instruments/master`

The UI depends on `Player`, implemented by a legacy adapter and the Strudel
player. It reads transport position, lane views and an oscilloscope through the
interface rather than reaching into the clock/audio graph.

A motif contains two bars of relative pitches, eligibility strengths, accents and
slides. Pitch, rhythm, accent and slide draws have separate hash domains. On
alternate eight-bar phrases, at most eight of 32 positions change. Pattern epochs
allow complete renewal on the existing genre cadence. House shares a harmony
context across bass and chord voicing; its bass leaves kick and chord-stab slots
free. Minimal techno retains a seven-step percussion lane against the main grid.

Composition is stateless; query order, clipping and muting do not consume random
state. Musical time uses Strudel fractions, including sub-step fill events. The
transport retains a 25 ms Worker wake-up and a 150 ms audio horizon, splits queries
at musical boundaries, and schedules onsets chronologically. It discards missed
onsets after a long suspension instead of replaying a backlog.

Live control snapshots are bounded. Density, swing and tempo changes target the
next unscheduled bar; mute, volume and synth parameters respond immediately with
gain/parameter smoothing. Stop clears the transport, effects and 303; Play starts
the selected recipe from bar zero. The instrument mapping preserves per-genre
effect sends. The 303 remains a custom continuous instrument alongside Superdough
synths, samples and Orbit effects.

## Compatibility

New URLs carry `g`, `s`, `e`, `v`, `m`: genre, seed, engine version, genre version,
sound mode. Versions are `legacy-1` and `strudel-1`; new genre profiles start at 1.
An unversioned favourite stays legacy. Explicit unsupported versions fail visibly
and offer a new composition rather than changing the saved piece silently.

Recipes save default musical controls plus the selected sound mode. They do not
record a live performance of slider or mute changes. Reproducibility refers to
musical events, not bit-identical Web Audio output.

## Verification

```sh
npm test
npm run build
npx playwright install
npm run test:browser

# In another terminal, against the built bundle:
npm run preview -- --host 127.0.0.1 --port 5199
npm run test:soak
```

Set `CHROMIUM_BIN` when using a system Chromium instead of Playwright's downloaded
browser. The soak test defaults to 30 minutes, alternates the sound mode every five
minutes, logs live source counts and post-GC heap usage, and verifies all sources
end after Stop. `SOAK_MINUTES` can shorten a local smoke test; it does not replace
the full run. `SOAK_URL` changes the preview address.

On a headless Linux host, Firefox/WebKit also need an audio sink. The official
Playwright container plus a PulseAudio null sink provides one without installing
services on the host. Chromium's headless audio path works without that setup.

Automated checks cover legacy snapshots, recipe/favourite compatibility, distant
queries, query fragmentation, independent voices, mutation limits, polymeter,
tempo-boundary timing, cross-browser event equality and actual browser audio.
The listening matrix supports a human quality judgement; passing the tests does
not establish that a listener prefers the new music.

### Recorded validation — 2026-09-05

- 279 unit tests passed; the legacy snapshots cover all 21 original genres.
- 30 browser checks passed across Chromium, Firefox and WebKit, including audio,
  saved recipes, failed/retried downloads, stale download completion and bounded
  control history while all voices are muted.
- The production player ran for 30 minutes through 917 bars, alternating drum
  modes, without runtime errors. At most 12 tracked sources were active; all had
  ended three seconds after Stop. Post-GC heap was 3,391,008 bytes at minute five
  and 3,417,928 at minute thirty. The later silent-control cleanup and stale-URL
  guard were verified separately in the browser checks.
- All 81 comparison WAVs were exported without normalisation. Minimum clip RMS
  was 0.01176; maximum absolute PCM peak was 0.85007, with no clipped samples.
  This establishes valid output, not musical preference.
- The 375 px mobile viewport had a 375 px document width, with no horizontal
  overflow. Desktop and mobile screenshots were inspected.
- The static build passed: initial JavaScript 120.91 kB (34.43 kB gzip), lazy
  Strudel audio chunk 167.60 kB (60.33 kB gzip), and a separate 321 kB kit payload.

The run's listening artifacts are in `/tmp/sottofondo-listening` on andromeda,
with `manifest.json` identifying each neutral clip. Regenerate them with the
command above; artifacts are not committed.

## Distribution

The application stays a static Vite bundle. Core and Superdough are pinned and
loaded only when a Strudel recipe is opened. No REPL or remote default sample bank
is loaded. See `NOTICE.md`, `LICENSE`, and `public/samples/README.md` for source,
licence and attribution. This migration does not publish the build.
