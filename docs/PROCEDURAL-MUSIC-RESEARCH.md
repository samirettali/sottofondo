# Local procedural composition: research and proposed direction

Research date: 2026-09-05. This records source inspection, not a listening test of
the external systems. No generator was changed as part of this research.

## Requirement and status

The user wants a seed to determine a new composition with its own musical
identity, rather than a small variation of an authored song. Generation must run
entirely locally without model APIs or a generation service. External search
services were requested for this research only.

The handwritten acid reference remains a useful listening benchmark. Pressure
was recognized as similar; Crosscurrent and most of Afterglow were disliked.
The user subsequently rejected extending authored templates as the product
direction. That is distinct from a verdict on the latest execution comparison,
which has not been accepted through listening.

The target is settled; the implementation proposed below is a hypothesis to
test. None of the sources establishes that arbitrary seeds will all produce
good acid tracks, or that every seed will be perceptually unique.

## Relevant working approaches

### Infno: parts influence one another

Nick Collins's [Infno](https://composerprogrammer.com/infno.html) generates
electronic dance music and synthpop in SuperCollider. The
[2008 paper](https://composerprogrammer.com/research/infno.pdf) describes shared
harmony/rhythm, section construction, and `getRelations`: a new part can support
or oppose an existing part, principally rhythmically and also melodically.
Dynamic programming chooses melodic paths using transition, contour, harmonic
and inter-part costs. Run-specific weights and synthesis choices vary character.

This is the closest stylistic precedent. It also uses authored heuristics and
some stored harmonic material; it is not evidence that musical knowledge can be
omitted. The creator offers GPL SuperCollider source. The paper and creator page
were inspected; the source archive could not be opened in this research.

**Transfer:** compose a part in the context of what other parts actually play.
Infno is already cited in [DESIGN.md](DESIGN.md#melody--infnos-dp-cost-table);
the missing step is implementing and testing that relationship adequately.

### Abundant Music: a complete browser composer

The [creator's page](https://krasse.itch.io/abundant-music) explains that the
original server-assisted application was converted to client-only operation.
There is a [browser demo](https://pernyblom.github.io/abundant-music/) and an
[ES6 refactoring of the composer](https://github.com/vedek/abundant-music).

Source inspection confirms that its
[worker](https://github.com/vedek/abundant-music/blob/master/js/worker.js)
constructs and renders seeded compositions locally. Its
[search implementation](https://github.com/vedek/abundant-music/blob/master/js/composer/dfssolver.js)
and [figurator](https://github.com/vedek/abundant-music/blob/master/js/composer/figurator.js)
use bounded search and intersect musical domains informed by harmony, voice
lines and neighboring notes. The fork has an
[MIT license](https://github.com/vedek/abundant-music/blob/master/LICENSE).

**Transfer:** separate form, harmony, voice leading and surface notes, with
constraints between them. It is substantial older code, not an acid library.
Its sequential Mersenne Twister and logarithmic decision costs cannot be copied
unchanged under our reproducibility rules. Neither playback quality nor current
browser compatibility was tested here.

### GEDMAS: learn the structure, then generate compatible parts

[GEDMAS](https://www.metacreation.net/projects/gedmas) is an EDM composition
system. Its [2013 paper](https://ojs.aaai.org/index.php/AIIDE/article/download/12649/12497)
describes a manually transcribed corpus of 24 breakbeat tracks and stages for
form, harmony, instrument entrances, patterns and playback. A first-order
Markov model generates form; patterns depend on the selected context and
incompatible material is regenerated. The implementation uses Max and Ableton.

**Transfer:** distributions for section transitions and instrument presence can
be learned from examples and bundled locally. This needs an appropriate corpus
and transcription effort. Breakbeat statistics are not automatically acid
rules, and the existing implementation is not a browser dependency.

### Constrained Markov models: sample valid new sequences

[Finite-Length Markov Processes with Constraints](https://www.francoispachet.fr/wp-content/uploads/2021/01/pachet-11b.pdf)
(Pachet, Roy and Barbieri, 2011) conditions a Markov process on supported
constraints, such as fixed positions or adjacent relationships. It preserves
the conditional distribution over valid sequences, instead of selecting only
one optimum or repairing the final note afterwards. These guarantees apply to
the constraint classes in the paper, not arbitrary musical rules or taste.

The creator's [Continuator repository](https://github.com/fpachet/continuator)
provides a more recent Python reference, with multiple inference backends.
Its [architecture notes](https://github.com/fpachet/continuator/blob/main/docs/current_architecture.md)
distinguish exact guarantees from approximations; those implementations should
not all be described as the same algorithm.

For returning motifs, [Steerable Music Generation which Satisfies Long-Range
Dependency Constraints](https://transactions.ismir.net/articles/10.5334/tismir.97)
is also relevant: constraints can relate later material to newly generated
earlier material, without specifying the actual phrase in advance.

**Transfer:** sample several acceptable musical possibilities, and make answers
or reprises depend on the generated motif. Small transition tables can run
locally; a corpus-trained model still needs suitable training material.

### ProceduraLiszt: hierarchical constraints in TypeScript

[Harmony in hierarchy: mixed-initiative music composition inspired by WFC](https://graphics.tudelft.nl/Publications-new/2024/VB24/ProceduraLiszt.CR.pdf)
(ICEC 2024) describes a hierarchy of sections, chords and notes, using constraint
propagation inspired by Wave Function Collapse. Its
[TypeScript repository](https://github.com/ProceduraLisztDevs/proceduraliszt)
contains the hierarchy and constraints, and has a
[browser demo](https://proceduralisztdevs.github.io/proceduraliszt/#/proceduraliszt/).
The package manifest and WFC selection/canvas code were inspected.

**Transfer:** constraints can span musical levels and can be implemented in our
language. The paper leaves effectiveness and creativity evaluation for future
work; this is not demonstrated acid quality. No root license was found in the
inspected tree, so source availability alone does not establish reuse rights.
A complete WFC framework is not justified for our first experiment.

## Useful ingredients that do not solve composition alone

- [Total Serialism](https://github.com/tmhglnd/total-serialism) offers JavaScript
  generators and transformations, including Euclidean rhythms, L-systems,
  cellular automata and Markov models. These are useful building blocks; the
  application still has to decide how they form a piece.
- [WolframTones](https://tones.wolfram.com/about/faqs) demonstrates cellular
  automata mapped into musical material. A common generative substrate is an
  interesting source of relationships, but does not establish that the desired
  harmony or arrangement emerges automatically.
- [Quality-Diversity Search in Sound Generation](https://arxiv.org/abs/2606.09780)
  (2026) explores diverse sound objects through evolutionary search. It is not
  evidence for complete song generation. Maintaining diverse acceptable
  candidates is a useful design idea; adding MAP-Elites and an audio evaluator
  would be excessive before we have a convincing composition baseline.
- [A Functional Taxonomy of Music Generation Systems](https://arxiv.org/abs/1812.04186)
  helps distinguish tasks such as accompaniment, melody and full composition.
  A melody generator or a live-coding performance is not, by itself, evidence
  of an autonomous arranger.

## What the current implementation actually lacks

This is not a proposal to add a hierarchy or candidate scoring for the first
time. Those already exist:

- [`makeMotif`](../src/composer/plan.ts) scores 16 candidate phrases and selects
  among the best four. Its costs assess the candidate's contour, intervals,
  repetition, metrical pitch preference and density; they do not inspect another
  instrument's actual notes. Scoring candidates independently is different from
  searching for a combination that works together.
- `createSongPlan` already selects sound families, patches, registers, groove,
  scale and motif length. However,
  [`developAcidPlan`](../src/composer/acid.ts) replaces the motifs, fixes their
  length at four bars, fixes the interval collection to `[0, 3, 5, 6, 7, 10]`,
  sets the bass register to 36 and imposes a high density floor. The key and
  several other choices still vary, but part of the earlier breadth is erased.
- [`acid-studies-score.ts`](../tools/acid-studies-score.ts) recombines finite
  authored calls, replies and endings. That bounds the output around the three
  written pieces regardless of the number of seeds.
- [`acid-performance-score.ts`](../tools/acid-performance-score.ts) changes
  articulation and filters while preserving the score, except for the optional
  bell's answering gap. It is an execution experiment, not a new composer.

These facts explain constraints on variety. They do not independently prove
which change will sound better; that still needs listening.

## Proposed next experiment

Build a small local composer that generates an acid phrase and its supporting
parts together, then develops that material into a short arrangement. Reuse the
existing deterministic addressing, event representation, renderer and preview
infrastructure. Keep old recipe versions frozen.

1. **Generate an identity with compatible choices.** The seed selects rhythmic
   emphasis, space, motif length, tonal vocabulary, instrumentation and a
   development policy. Do not choose each parameter independently when they
   constrain one another. Begin with a bounded acid sound palette; broaden it
   after the composition comparison establishes a baseline.
2. **Generate rhythm and notes under shared constraints.** Construct new onset
   and rest patterns, pitches and articulations. Distinguish hard requirements
   (valid range, available durations, section boundaries) from stylistic
   preferences. Support voices can reinforce selected accents, answer in gaps
   or deliberately oppose a rhythm. Harmonic preferences must account for
   simultaneous notes and duration, not just membership in one scale.
3. **Keep several valid solutions.** Start with bounded conditional search and
   integer costs, drawing from an acceptable set using addressed hashes. Avoid
   one universal score that pushes every seed toward the same contour and
   density. A full generic solver or a corpus model is optional later work,
   not a prerequisite for this experiment.
4. **Develop the generated material.** Repetition, contraction, displacement,
   register changes, answers, entrances and breaks should refer to this seed's
   motif and rhythmic spaces. Arrange contrast and returns without inserting
   stored Pressure phrases. Coordinate filter and accent movement with those
   events; retain the useful execution work as a separate layer.
5. **Compare before expanding.** Use a fixed, published seed set and the same
   renderer and gain for old/new composition comparisons. Listen both within
   each piece (identity and development) and across seeds (distinctness). A
   separate full-palette comparison can assess orchestration. Do not count
   transposition, tempo changes or event hashes alone as musical diversity.

Parts may depend on the immutable score of other parts, never on whether those
parts are currently muted. Give decisions stable seed/section/voice/candidate
addresses and use bounded iteration counts, so a wall-clock timeout cannot
choose a different result. Measure generation latency in the browser before
choosing a search budget or moving work into a Worker. No latency claim is
established by this source review.

Meaningful acceptance evidence includes reproducibility across seek/query/mute
orders, hard-constraint checks, failures on a broad seed sample, and human
listening without cherry-picking only the strongest seeds. Numerical coverage
can reveal collapse onto a few patterns; it cannot certify musical quality.
This research does not require an external model to judge the results.

## Search provenance and limits

All four requested discovery routes were used. Technical conclusions above
come from linked creator pages, papers and inspected source, not generated
search answers. External applications were not run or auditioned.

| Route | Work performed | Reported usage |
| --- | --- | --- |
| Normal web search | Algorithmic composition, EDM, local browser composers, constraints and diversity; opened primary sources | No billing figure exposed |
| Tavily | Two advanced searches: local complete composers; constrained/evolutionary composition and diversity | 4 credits total |
| Monid | Discovered academic-paper endpoints; searched `constrained Markov music generation` through `api.kadec0.xyz` `/v1/papers` | One completed call, USD 0.022 |
| X Search | One CLI request for creator posts about local procedural composition | CLI reported 163,306 input tokens, 7,817 output tokens and 28 hosted search calls; no USD total exposed |

Tavily request IDs: `c9d4d6f3-9721-4e48-94bc-2a614a485fe9` and
`7b06b82b-1856-48b4-9c98-ee625c6d8b81`. Monid run:
`01M1SY8QYCHG58H5AR7YXFAE6Y`. The installed Monid CLI was older than its skill;
version 0.1.7 was invoked ephemerally without replacing the Nix-managed tool.

Monid's strongest relevant result was the functional taxonomy; other hits were
weak matches. X returned mostly live-coding and sound demonstrations, including
these [Strudel](https://x.com/bromethazine/status/2088303092789817756)
[posts](https://x.com/de_henne/status/2089594035472158868). Their direct pages
could not be independently retrieved, so they remain discovery leads, not
verified accounts of composition algorithms. The unexpectedly large hosted
search count means a per-query cost estimate should not be substituted for an
actual bill. No additional X request was made.
