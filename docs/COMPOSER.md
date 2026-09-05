# Composer v2

New acid techno, minimal techno and deep house pieces use `strudel-2`. A seed
selects a musical identity, including instruments, before any bars are generated.
Other genres remain on the legacy engine. Existing unversioned and `strudel-1`
links keep their original implementations; event snapshots pin both references.

## Try it

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5196 --strictPort
```

On andromeda, run this on the Mac and open `http://localhost:5196`:

```sh
ssh -N -L 5196:127.0.0.1:5196 andromeda
```

Web Audio worklets require a secure context. HTTP on a remote hostname does not
qualify; localhost through the tunnel does. Vite also permits the `andromeda` host,
but allowing a hostname does not make HTTP secure.

Open the app without a query string, select one of the three electronic genres,
and request new seeds. The identity label and lane names show the chosen family,
kit and instruments. V2 chooses synths and samples together; it has no sound-mode
selector. Bass controls target the selected bass instrument. A failed instrument
download offers a retry of the same recipe.

For a quick comparison, acid seeds `3` and `4` both choose 142 BPM but use
different kits and lead/support instruments. Seeds `2` and `7` select the Orbital
and Liquid families. Enter these seeds in the app or comparison page.

## Musical model

`Recipe → immutable SongPlan → complete bar score → Strudel Pattern → audio`

Each genre has four palette families. Acid includes liquid, percussive, raw and
orbital voices; techno includes dry, metallic, deep and dub; house includes
electric, organ, dub and percussive. Independent addressed hashes select the kit,
lead/bass/support patches, optional answering voice, register, groove, motif
length, harmonic rhythm, space, drive and articulation. New catalog values are
authored synthesis choices; no sourced legacy preset constants were changed.

The composer creates sixteen candidates for each A/B phrase. Integer costs rank
contour, interval jumps, repeated notes, chord tones on strong positions and note
count. The seed selects among the best four. Motifs last two, four or eight bars;
they undergo displacement, fragmentation, octave variation and closing gestures
in development sections, then return recognisably.

Each 128-bar chapter chooses a form of 8/16/32-bar sections. Presentation introduces
layers, development makes room for answers, contrast removes the main drums,
builds add a filtered rise and a final gap, and returns restore the main motif.
House shares a chord progression across bass, chords and melody. Techno percussion
keeps its absolute phase against the bar. Leads leave space at chord attacks or
answering phrases. Filter brightness follows the section and phrase position.

Parts are computed from the complete arrangement before player controls are
applied. Muting a voice never changes another voice's notes. Density only removes
eligible events. A bounded sixteen-bar cache avoids repeated scoring; direct
queries at distant bars and fragmented queries yield the same event intervals.
Nothing in a decision path depends on a clock or a transcendental function.

This is procedural generation: the seed specifies the composition, and musical
constraints give random choices relationships and repetition. The diversity
test compares palette, groove, roster, relative motif shape and form. It excludes
seed, tempo and key. Passing that test establishes structural variety, not taste.

## Sound and assets

The catalog contains 24 synthetic patches plus three sampled instruments and a
noise texture. Synthesis combines a continuous 303, subtractive voices, FM,
custom partials, supersaws, pitch envelopes, filters, delay and reverb. The 303
retains accumulated accents and connected slides. All instruments use the
existing stereo master and gain staging.

The low-level Superdough API differs from REPL notation: use `fmi`, `cutoff`,
`hcutoff`, `resonance`, and octave-valued `lpenv`. The 303 adapter converts filter
envelopes to cents. Offline probes measure the effects of FM, cutoff and envelope
changes on rendered PCM; type-checking alone cannot catch ignored field names.

Three five-piece kits and three instrument assets occupy 1,044,320 bytes in total,
including base64/JSON overhead. The player requests only its selected kit and
instrument samples. Each JSON records original FLAC bytes, a SHA-256 digest and
an immutable Sonic Pi source URL. See [sample attribution](../public/samples/README.md).
The asset test checks hashes and the 20 MB budget. No remote sample bank is loaded.

Spectral checks of the decoded source files identified the wood bass at MIDI 36,
the bell at MIDI 60, and guitar harmonics around E5/B5, with E5 (MIDI 76) as the
transposition root. Drums play at recorded speed. Superdough already transposes
from its sample root; the adapter must not apply that interval twice.

## Listening and verification

At `/tools/composer.html`, compare v2 with frozen v1 synthesis using the same
genre/seed. Select opening, development or transition; the latter straddles the
first contrast section. Both versions render all preceding bars before cropping,
preserving effect and accent state. Their tempos may differ. A/B order alternates
with the seed and labels remain hidden until revealed.

The six studies have authored two-bar phrases and a 32-bar presentation,
development, contrast and return. They use the production instrument catalog and
renderer. They are original material, not transcriptions of reference tracks.

```sh
npm test
npm run build
npm run test:browser
npm run render:composer

# Against a production preview in another terminal:
npm run preview -- --host 127.0.0.1 --port 5195 --strictPort
SOAK_ENGINE=strudel-2 SOAK_GENRE=acid SOAK_URL=http://127.0.0.1:5195 npm run test:soak
# Repeat with SOAK_GENRE=techno and SOAK_GENRE=house.
```

The export creates 216 comparison clips (12 seeds × 3 genres × 3 sections × 2
versions), six studies and a manifest. Each WAV has its own directory and the
neutral name `clip.wav`; levels are never normalised. `RENDER_DIR` and `RENDER_URL`
override the output directory and development server. `RENDER_SEEDS` can shorten
a smoke run. `CHROMIUM_BIN` selects a system browser. Tools are development pages,
not part of the production interface.
`RENDER_RESUME=1` reuses complete groups from the manifest after an interrupted
export; only use it when the music and renderer have not changed.

The soak defaults to 30 real minutes, records active sources and post-GC heap,
checks for runtime errors and verifies cleanup after Stop. Three genre processes
can run concurrently. Browser tests also exercise saved recipes, explicit asset
failure/retry, cross-browser event equality and synthesis behavior.
The monitor retains each source wrapper until `ended` fires and counts the live
set. This makes the cleanup check inspect nodes rather than infer their lifetime
from cumulative counters while explicitly forcing garbage collection.

## Recorded validation — 2026-09-05

- 292 unit tests passed, including frozen legacy/v1 snapshots, query fragmentation,
  distant seeking, swing/slide boundaries and independent lane controls.
- For each genre, 998 of 999 adjacent pairs across 1,000 seeds differed in at least
  three of the five tested musical dimensions. Tempo and key were excluded.
- 48 browser checks passed across Chromium, Firefox and WebKit. They cover actual
  audio, FM/filter/envelope probes, recipe compatibility, selected-asset loading,
  retry, restart and bounded control history with every lane muted.
- The revised live-source soak monitor reached minute 29 for all three genres
  without reported runtime errors; post-GC heaps were approximately 3.3–3.5 MB.
  The session interruption made the final results unavailable, so the full
  30-minute check, including source cleanup after Stop, remains unverified.
- All 222 isolated WAVs were exported without normalisation. Minimum RMS was
  0.02124, maximum RMS 0.15765, and maximum absolute PCM peak 0.65871. A scan of
  every 16-bit PCM sample found zero saturated samples. The files and identifying
  manifest are in `/tmp/sottofondo-composer-validated` on andromeda.
- A 375 px viewport had a 375 px document width. Mobile and desktop screenshots
  were inspected. HTTP on the allowed `andromeda` hostname returned status 200 and
  the explicit secure-context/tunnel instructions instead of an `addModule` error.
- The final static build passed. Initial JavaScript is 122.17 kB (34.86 kB gzip),
  shared Strudel code 156.37 kB (55.74 kB gzip), and the lazy v2 player 20.53 kB
  (7.92 kB gzip). The eighteen asset payloads total 663,046 bytes when gzipped
  individually, including metadata.

## Research references

- [Strudel getting started](https://strudel.cc/workshop/getting-started/): musical
  patterns, layering and cycle-based transformations.
- [ChrisZDK acidpoly](https://github.com/ChrisZDK/strudel-tracks/blob/main/acidpoly.js)
  and [Serene](https://github.com/ChrisZDK/strudel-tracks/blob/main/Serene.js): source
  examples of electronic arrangement and timbral contrast. These were read as
  code, not evaluated as listening-test results or copied into the studies.
- [Infno](https://composerprogrammer.com/research/infno.pdf): generative electronic
  composition with musical constraints and candidate evaluation. Our cost
  function is an independent implementation with authored weights.
- [Strudel synths](https://strudel.cc/learn/synths/) and
  [effects](https://strudel.cc/learn/effects/): available synthesis vocabulary.
  The pinned Superdough 1.3.0 source defines the actual low-level parameter names.

Human listening remains the acceptance test for musical character. Automated
diversity, valid PCM and stable playback cannot establish listener preference.
