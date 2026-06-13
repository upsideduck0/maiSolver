// Core type definitions for parsed Simai charts.
//
// A Simai chart describes maimai DX gameplay. Positions on the outer ring are
// numbered 1..8 clockwise, with the gap between buttons 8 and 1 at the top
// (12 o'clock) and the gap between 4 and 5 at the bottom (6 o'clock).

/** Outer-ring button position, 1..8 clockwise. */
export type Button = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Slide trajectory symbols, exactly as they appear in Simai.
 *   -   straight line to target
 *   ^   shortest arc along the ring
 *   <   counter-clockwise arc (as drawn on screen)
 *   >   clockwise arc
 *   v   straight to centre then straight out to target
 *   p   curved loop (clockwise-ish "p" shape)
 *   q   curved loop (mirror of p)
 *   pp  wide "p" loop
 *   qq  wide "q" loop
 *   s   thunder / "S" zig-zag across the field
 *   z   thunder / "Z" zig-zag across the field
 *   V   through a vertex: turn at one button, end at another (uses two targets)
 *   w   fan slide (three parallel stars)
 */
export type SlideShape =
  | "-"
  | "^"
  | "<"
  | ">"
  | "v"
  | "p"
  | "q"
  | "pp"
  | "qq"
  | "s"
  | "z"
  | "V"
  | "w";

/** Touch sensor groups. A = outer (same as buttons), B = inner, C = centre, D/E = corners. */
export type TouchArea = "A" | "B" | "C" | "D" | "E";

export type NoteKind = "tap" | "hold" | "slide" | "touch" | "touchHold";

interface NoteBase {
  kind: NoteKind;
  /** Hit time in seconds from the start of the audio (already includes the chart offset). */
  time: number;
  /** True if this note is a BREAK note (extra score / different visuals). */
  break?: boolean;
  /** True if this note is an EX note (lenient judgement). */
  ex?: boolean;
}

export interface TapNote extends NoteBase {
  kind: "tap";
  pos: Button;
  /** Forced star shape (a `$` tap that looks like a slide head but has no slide). */
  star?: boolean;
}

export interface HoldNote extends NoteBase {
  kind: "hold";
  pos: Button;
  /** Hold length in seconds. */
  duration: number;
}

export interface SlideSegment {
  shape: SlideShape;
  /** Turn/vertex button for the `V` shape; undefined otherwise. */
  vertex?: Button;
  end: Button;
}

export interface SlideNote extends NoteBase {
  kind: "slide";
  /** Where the star begins (also where the head tap is shown). */
  start: Button;
  /** One or more chained segments, e.g. `1-3-5` has two segments. */
  segments: SlideSegment[];
  /** Seconds the star waits at `start` before it begins travelling. */
  delay: number;
  /** Seconds the star spends travelling along the whole path. */
  duration: number;
  /** Whether the chart drew an explicit tap/star head at the start (almost always true). */
  hasHead: boolean;
}

export interface TouchNote extends NoteBase {
  kind: "touch";
  area: TouchArea;
  /** 1..8 for A/B/D/E; 1 for the single centre C. */
  index: number;
  firework?: boolean;
}

export interface TouchHoldNote extends NoteBase {
  kind: "touchHold";
  area: TouchArea;
  index: number;
  duration: number;
  firework?: boolean;
}

export type Note = TapNote | HoldNote | SlideNote | TouchNote | TouchHoldNote;

export interface ChartMeta {
  title?: string;
  artist?: string;
  designer?: string;
  /** Audio offset in seconds applied to every note (Simai `&first`). */
  first: number;
  /** Difficulty label, e.g. "13+". */
  level?: string;
  /** First BPM declared in the chart. */
  bpm?: number;
}

export interface Chart {
  meta: ChartMeta;
  notes: Note[];
  /** Total chart length in seconds (time of the last note/event). */
  duration: number;
  /** Non-fatal parser warnings, useful for debugging charts. */
  warnings: string[];
}
