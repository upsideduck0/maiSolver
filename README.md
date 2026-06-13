# maiSolver

A web-based **maimai DX chart viewer** — and, ultimately, a **hand-movement
solver** — for [Simai](https://w.atwiki.jp/simai/) (`maidata.txt`) charts, in the
spirit of [Majdata](https://github.com/LingFeng-bbben/MajdataView) and
[AstroDX](https://github.com/2394425147/astrodx).

The long-term goal is to read a chart and show *how to play it with two hands*:
assign every note to a hand and animate the motion. This first milestone is the
**viewer** — parse Simai and render the playfield with notes flying out to the
ring, synced to audio — which is the foundation the solver builds on.

## Status

| Layer | State |
| --- | --- |
| Simai parser (taps, holds, slides, touch, BPM/division, breaks/ex, each) | ✅ working, unit-tested |
| Canvas playfield renderer with note approach animation | ✅ working |
| Audio-synced playback + transport UI | ✅ working |
| Hand-assignment solver | ⏳ next milestone |

## Quick start

```bash
npm install
npm run dev      # open the printed localhost URL
```

A demo chart loads automatically. Use **Load → Chart** to open your own
`maidata.txt`, optionally attach an audio file, pick a difficulty, and press
**Play** (or Space). The *Note approach* slider controls how long notes take to
travel from the centre to the ring.

```bash
npm test         # parser unit tests (Vitest)
npm run build    # typecheck + production build
```

## How it works

The pipeline is three independent, separately testable layers:

1. **Parse** — `src/simai/parser.ts` turns `maidata.txt` into a flat, timed
   note list (`src/simai/types.ts`). It tracks `(bpm)` and `{division}` changes
   to convert beats to seconds, and is deliberately permissive: unrecognised
   syntax produces a warning instead of failing.
2. **Lay out** — `src/geometry/` maps the 8 buttons and A–E touch sensors to
   coordinates, and converts each slide shape into a sampled polyline
   (`slidePaths.ts`) for drawing and constant-speed star animation.
3. **Render & play** — `src/render/renderer.ts` draws the playfield on a 2D
   canvas each frame; `src/engine/player.ts` owns the clock and keeps it in sync
   with the audio track.

### Playfield convention

Outer buttons are numbered **1–8 clockwise**, with the gap between **8 and 1 at
the top** (12 o'clock) and between **4 and 5 at the bottom**. Button 1 sits at
67.5° (upper-right). Notes spawn near the centre and reach the ring exactly at
their hit time.

## Supported Simai subset

- Timing: `(bpm)`, `{division}`, `{#seconds}`, `&first` offset, multiple
  `&inote_N` difficulties.
- Notes: tap, hold (`h[x:y]`), break (`b`), EX (`x`), forced star (`$`).
- Slides: `- ^ < > v p q pp qq s z V w`, chained (`1-3-5`), with `[x:y]`,
  `[bpm#x:y]`, `[#sec]`, `[##sec]` durations.
- Touch: `A`/`B`/`C`/`D`/`E` zones, touch hold (`h`), firework (`f`).
- Each notes: `/` separator and the adjacent-digit shorthand (`15`).

Curved slides (`p q pp qq s z w`) are rendered as faithful approximations of the
arcade trajectories — good enough to read, with room to refine later.

## Roadmap to the hand solver

The viewer exposes a clean note timeline, which is exactly the solver's input.
Planned next:

1. **Cost model** — hand travel distance, crossover penalties, comfort.
2. **DP / search** over `(left, right)` hand states to assign each note to a
   hand near-optimally; busy hands (tracing slides / holding) constrain
   concurrent notes.
3. **Hand overlay** — animate two hands moving along the assigned paths on top
   of the existing renderer.
