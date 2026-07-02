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

## The hand solver

Tick **Solve** (next to *Auto*) and press **Play**: two hands play the chart on
their own, driven through the same sensor-input pipeline the mouse uses, and
graded live by the achievement engine.

It is a **cost-based search with offline weight auto-tuning** — a hybrid of a
hand-tuned ruleset and a light learning step, deliberately *not* a neural
network (there is no corpus of "correct" hand assignments to train on, the
objective is physical and explicit, and the app ships as one dependency-free
file):

1. **Actions** — each judged note becomes one action; a slide is a single
   action (head tap + trace).
2. **Assignment** — a beam search over `(left, right)` hand states assigns every
   note to a hand, minimising a cost model (travel distance, arm-crossover, and
   heavy penalties for a hand that is still busy tracing/holding).
3. **Motion** — each hand gets a timed motion plan under a hard speed cap
   (`MAX_V`). Because a hand can only move so fast, an over-ambitious assignment
   makes a hand physically *late* and its note misses — so achievement % is a
   real, physical objective.
4. **Auto-tune** — the **Tune** button hill-climbs the cost weights using a
   headless play-through's achievement % as the fitness function.

Genuinely impossible patterns (e.g. four simultaneous taps `2/4/6/8`, which two
hands cannot cover) correctly miss rather than being faked.

Possible improvements: audio-track sync (load an MP3 so notes line up with the
music), loading charts from a file instead of pasting, and richer comfort terms
(hand preference, wrist angle) in the cost model.

---

*An earlier modular TypeScript prototype of the parser/renderer (with unit
tests) lives in this repository's git history if it's ever useful to revisit.*
