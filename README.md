# sottofondo

A browser toy that generates music from a seed, in several genres. Leave it running.

Descended from vitling's [Endless Acid Banger](https://www.vitling.xyz/toys/acid-banger/)
(CC-BY 4.0), generalised so that a genre is data rather than code, and so that a piece
you like is a link you can keep.

## Running it

```sh
npm install
npm run dev
```

Open without query parameters for a new Strudel composition, or use a saved link.
Old `?g=<genre>&s=<seed>` links deliberately keep the legacy engine. New links also
carry engine version, genre version and sound mode. The URL is written as you
change things, so a piece is always a link, and `☆` keeps one in a local shortlist.

```sh
npm run check   # typecheck
npm test        # unit tests
npm run build   # static bundle in dist/
```

Strudel core and Superdough are pinned runtime dependencies, loaded lazily. Vite
and TypeScript build the app; Playwright verifies browser playback.

Acid, minimal techno and deep house now have returning motifs and bounded phrase
variations, with a **Synth / Samples + synth** selector playing the same score.
The other genres and existing bookmarks retain the original engine.
See [the migration guide](docs/STRUDEL.md) for architecture, browser checks and
the three-way listening comparison at `/tools/listen.html`.

## How it works

- **Generation is a pure function of `(seed, bar, voice)`**, hashed rather than drawn from
  a stream. Seeking, looping and offline rendering fall out for free, and no amount of
  clicking around can desynchronise anything.
- **Patterns are keyed on an epoch, not on the bar**, so they repeat long enough to be
  learnt. Chaos is keyed on the bar, so the repetition breathes.
- **Every step carries a velocity, not a boolean.** One threshold comparison then gives
  density, accents, ghost notes and morphing between patterns.
- **A lookahead scheduler** places every event at an absolute `AudioContext` time. The
  timer only decides when to look.
- **A genre is a file.** It picks strategies from an enum and sets numbers; it never
  describes a graph.

`docs/DESIGN.md` is the research behind the numbers — how the original works, the
generation algorithms, and where each constant comes from. `TODO.md` is what is left.

## Status

Local and unfinished. Twenty-one genres: acid, minimal and dub techno, deep and
progressive house, psytrance, liquid drum & bass, lo-fi hip hop, synthwave, chiptune,
ambient, jazz, blues, reggaeton, cumbia, gnawa, a raga in teental, a powwow drum with
flute, a 9/8 karşılama, Balkan brass, and an 11/8 kopanitsa that exists to keep the
schema honest.

The Strudel integration is AGPL-3.0-or-later. See [LICENSE](LICENSE) and
[NOTICE.md](NOTICE.md) for the upstream attribution and CC0 sample provenance.
