# maiSolver

A **maimai DX chart viewer** — and, ultimately, a **hand-movement solver** — for
[Simai](https://w.atwiki.jp/simai/) (`maidata.txt`) charts, in the spirit of
[Majdata](https://github.com/LingFeng-bbben/MajdataView) and
[AstroDX](https://github.com/2394425147/astrodx).

The long-term goal is to read a chart and show *how to play it with two hands*:
assign every note to a hand and animate the motion. This first milestone is the
**viewer** — parse Simai and render the playfield with notes flying out to the
ring — which is the foundation the solver builds on.

## How to run it

**No installation, no Node, no build step.** The whole app is a single file.

1. Download `index.html` (or open the project folder on your computer).
2. **Double-click `index.html`** — it opens in your web browser and runs.

That's it. A demo chart loads automatically.

## Using the viewer

- **Paste a chart** into the *Chart source* box — either a full `maidata.txt`
  (with `&inote_x=` blocks) or just a raw note body — and click **Load chart**.
- If the chart has multiple difficulties, pick one from the **Difficulty** menu.
- Press **Play** to watch, or drag the **seek** slider / click the mini-timeline
  to scrub to any moment.
- **Speed** slows playback down; **Approach** controls how long notes take to
  travel from the centre to the ring.

Notes fly outward from the centre and land on the ring at their hit time, the
same visual language as the arcade.

## What it understands (Simai)

- Timing: `(bpm)`, `{division}`, `{#seconds}`, `&first` offset, multiple
  `&inote_N` difficulties.
- Notes: tap, hold (`h[x:y]`), break (`b`), EX (`x`).
- Slides: `- ^ < > v p q pp qq s z V w`, chained (`1-3-5`), with `[x:y]`,
  `[bpm#x:y]`, `[#sec]`, `[##sec]` durations.
- Touch: `A`/`B`/`C`/`D`/`E` zones, touch hold (`h`), firework (`f`).
- Each notes: `/` separator.

Curved slides (`p q s z`) are visual approximations of the arcade trajectories;
`- ^ < > v V w` are geometric.

## Roadmap to the hand solver

The viewer already produces a clean, time-stamped note list, which is exactly
the solver's input. Planned next:

1. **Cost model** — hand travel distance, crossover penalties, comfort.
2. **Search** over `(left, right)` hand states to assign each note to a hand
   near-optimally; busy hands (tracing slides / holding) constrain concurrent
   notes.
3. **Hand overlay** — animate two hands moving along the assigned paths on top
   of the existing renderer.

Possible viewer improvements along the way: audio-track sync (load an MP3 so
notes line up with the music) and loading charts from a file instead of pasting.

---

*An earlier modular TypeScript prototype of the parser/renderer (with unit
tests) lives in this repository's git history if it's ever useful to revisit.*
