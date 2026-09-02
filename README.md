# banger

A browser toy that generates music from a seed, in several genres.

Descended from vitling's [Endless Acid Banger](https://www.vitling.xyz/toys/acid-banger/)
(CC-BY 4.0), generalised so that a genre is data rather than code, and so that a piece
you like is a link you can keep.

## Running it

```sh
npm install
npm run dev
```

Then `?g=<genre>&s=<seed>` — for example `?g=acid&s=cafe1234`. The URL is written as you
change things, so a piece is always a link, and `☆` keeps one in a local shortlist.

```sh
npm run check   # typecheck
npm test        # unit tests
npm run build   # static bundle in dist/
```

Zero runtime dependencies. Vite and TypeScript are the only build-time ones.

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

Local and unfinished. Nine genres: acid techno, minimal techno, deep house, liquid drum
& bass, lo-fi hip hop, synthwave, ambient, gnawa, and an 11/8 kopanitsa that exists to
keep the schema honest.
