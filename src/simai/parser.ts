// Simai / maidata.txt parser.
//
// This parses the common Simai subset used by AstroDX / Majdata charts into a
// flat, time-stamped note list (see ./types.ts). It is intentionally permissive:
// unknown constructs produce a warning rather than throwing, so a partially
// understood chart still renders.

import type {
  Button,
  Chart,
  ChartMeta,
  HoldNote,
  Note,
  SlideNote,
  SlideSegment,
  SlideShape,
  TapNote,
  TouchArea,
  TouchHoldNote,
  TouchNote,
} from "./types";

const SLIDE_SHAPE_CHARS = new Set(["-", "^", "<", ">", "v", "p", "q", "s", "z", "w", "V"]);
const TOUCH_AREAS = new Set(["A", "B", "C", "D", "E"]);

/** Seconds for one comma step at the given BPM and beat division (`{division}`). */
export function beatSeconds(bpm: number, division: number): number {
  return (60 / bpm) * (4 / division);
}

function toButton(ch: string): Button {
  const n = Number(ch);
  if (!Number.isInteger(n) || n < 1 || n > 8) {
    throw new Error(`invalid button position: ${JSON.stringify(ch)}`);
  }
  return n as Button;
}

/**
 * Top-level entry point. Parses a full maidata.txt and returns the chosen
 * difficulty's chart. `difficulty` is the Simai inote slot (1..7); when omitted
 * the highest-numbered chart present is used.
 */
export function parseMaidata(text: string, difficulty?: number): Chart {
  const fields = extractFields(text);

  const first = parseFloatSafe(fields.get("first")) ?? 0;
  const bpm = parseFloatSafe(fields.get("bpm")) ?? undefined;

  // Collect available inote_N bodies.
  const inotes = new Map<number, string>();
  for (const [key, value] of fields) {
    const m = /^inote_(\d+)$/.exec(key);
    if (m) inotes.set(Number(m[1]), value);
  }
  // Plain `&inote` (no number) is sometimes used too.
  if (fields.has("inote")) inotes.set(0, fields.get("inote")!);

  let chosen = difficulty;
  if (chosen === undefined || !inotes.has(chosen)) {
    chosen = [...inotes.keys()].sort((a, b) => b - a)[0];
  }

  const meta: ChartMeta = {
    title: fields.get("title"),
    artist: fields.get("artist"),
    designer: fields.get("des") ?? fields.get("designer"),
    first,
    level: chosen !== undefined ? fields.get(`lv_${chosen}`) : undefined,
    bpm,
  };

  const body = chosen !== undefined ? inotes.get(chosen)! : "";
  return parseSimaiBody(body, meta);
}

/** Split a maidata.txt into its `&key=value` fields (values may span lines). */
function extractFields(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  // Each field starts with `&` at a line start; value runs until the next such marker.
  const parts = text.split(/^&/m);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    const value = part.slice(eq + 1).replace(/\r/g, "");
    fields.set(key, value.trim());
  }
  return fields;
}

function parseFloatSafe(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

interface Ctx {
  bpm: number;
  secPerComma: number;
  warnings: string[];
}

/**
 * Parse a Simai note body (the value of an `&inote_N` field). Exposed directly
 * so callers can feed a raw chart body without the surrounding metadata.
 */
export function parseSimaiBody(body: string, meta: ChartMeta): Chart {
  const ctx: Ctx = {
    bpm: meta.bpm ?? 120,
    secPerComma: beatSeconds(meta.bpm ?? 120, 4),
    warnings: [],
  };
  let division = 4;
  let t = meta.first;
  const notes: Note[] = [];
  let group = "";

  const flush = () => {
    const text = group.trim();
    group = "";
    if (text) parseGroup(text, t, ctx, notes);
  };

  let i = 0;
  const n = body.length;
  while (i < n) {
    const ch = body[i];
    if (ch === ",") {
      flush();
      t += ctx.secPerComma;
      i++;
    } else if (ch === "(") {
      // BPM change, applies to subsequent timing.
      const close = body.indexOf(")", i);
      const val = parseFloat(body.slice(i + 1, close));
      if (Number.isFinite(val) && val > 0) {
        ctx.bpm = val;
        ctx.secPerComma = beatSeconds(ctx.bpm, division);
      }
      i = close === -1 ? n : close + 1;
    } else if (ch === "{") {
      const close = body.indexOf("}", i);
      const content = body.slice(i + 1, close).trim();
      if (content.startsWith("#")) {
        const sec = parseFloat(content.slice(1));
        if (Number.isFinite(sec) && sec > 0) ctx.secPerComma = sec;
      } else {
        const div = parseInt(content, 10);
        if (Number.isFinite(div) && div > 0) {
          division = div;
          ctx.secPerComma = beatSeconds(ctx.bpm, division);
        }
      }
      i = close === -1 ? n : close + 1;
    } else if (ch === "E" && !/[0-9]/.test(body[i + 1] ?? "")) {
      // Standalone E marks the end of the chart (E1..E8 are touch notes).
      break;
    } else if (ch === "|" && body[i + 1] === "|") {
      // Line comment.
      const nl = body.indexOf("\n", i);
      i = nl === -1 ? n : nl + 1;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      group += ch;
      i++;
    }
  }
  flush();

  notes.sort((a, b) => a.time - b.time);
  const duration = notes.reduce((max, note) => Math.max(max, noteEndTime(note)), t);
  return { meta, notes, duration, warnings: ctx.warnings };
}

function noteEndTime(note: Note): number {
  switch (note.kind) {
    case "hold":
    case "touchHold":
      return note.time + note.duration;
    case "slide":
      return note.time + note.delay + note.duration;
    default:
      return note.time;
  }
}

/** Parse one comma-delimited slot, which may contain several `/`-separated each-notes. */
function parseGroup(text: string, time: number, ctx: Ctx, out: Note[]): void {
  // `/` is the explicit each separator; backtick is a "pseudo each" we treat alike.
  const tokens = text.split(/[/`]/).map((s) => s.trim()).filter(Boolean);
  for (const token of tokens) {
    try {
      parseToken(token, time, ctx, out);
    } catch (err) {
      ctx.warnings.push(`could not parse "${token}" at ${time.toFixed(3)}s: ${(err as Error).message}`);
    }
  }
}

function parseToken(token: string, time: number, ctx: Ctx, out: Note[]): void {
  const first = token[0];

  // Touch notes start with a sensor-area letter.
  if (TOUCH_AREAS.has(first) && (first === "C" || /[1-8]/.test(token[1] ?? ""))) {
    out.push(parseTouch(token, time, ctx));
    return;
  }

  // "Both" shorthand: a run of digits (with optional shared flags) becomes
  // several simultaneous taps, e.g. `15`, `38b`.
  const both = /^([1-8]{2,})([bx$]*)$/.exec(token);
  if (both) {
    const flags = both[2];
    for (const d of both[1]) {
      out.push({
        kind: "tap",
        time,
        pos: toButton(d),
        break: flags.includes("b") || undefined,
        ex: flags.includes("x") || undefined,
        star: flags.includes("$") || undefined,
      });
    }
    return;
  }

  parseButtonNote(token, time, ctx, out);
}

/** Parse a single position-based note: tap, hold, or slide (possibly chained). */
function parseButtonNote(token: string, time: number, ctx: Ctx, out: Note[]): void {
  const start = toButton(token[0]);
  let i = 1;

  let isBreak = false;
  let isEx = false;
  let isStar = false;
  let isHold = false;
  let holdDuration: number | undefined;
  const segments: SlideSegment[] = [];
  let slideDuration = 0;
  let curStart = start;

  while (i < token.length) {
    const ch = token[i];
    if (ch === "b") {
      isBreak = true;
      i++;
    } else if (ch === "x") {
      isEx = true;
      i++;
    } else if (ch === "$") {
      isStar = true;
      i++;
    } else if (ch === "h") {
      isHold = true;
      i++;
    } else if (ch === "[") {
      const close = token.indexOf("]", i);
      const content = token.slice(i + 1, close);
      const seconds = bracketSeconds(content, ctx.bpm);
      if (isHold && segments.length === 0) holdDuration = seconds;
      else slideDuration += seconds;
      i = close === -1 ? token.length : close + 1;
    } else if (SLIDE_SHAPE_CHARS.has(ch)) {
      const seg = readSegment(token, i, curStart);
      segments.push(seg.segment);
      curStart = seg.segment.end;
      i = seg.next;
    } else {
      // Unknown character — skip but record it.
      ctx.warnings.push(`skipped '${ch}' in "${token}"`);
      i++;
    }
  }

  if (segments.length > 0) {
    if (slideDuration <= 0) slideDuration = beatSeconds(ctx.bpm, 4); // default one beat
    const slide: SlideNote = {
      kind: "slide",
      time,
      start,
      segments,
      delay: 60 / ctx.bpm, // star waits one beat before moving
      duration: slideDuration,
      hasHead: true,
      break: isBreak || undefined,
      ex: isEx || undefined,
    };
    out.push(slide);
    return;
  }

  if (isHold) {
    const hold: HoldNote = {
      kind: "hold",
      time,
      pos: start,
      duration: holdDuration ?? beatSeconds(ctx.bpm, 4),
      break: isBreak || undefined,
      ex: isEx || undefined,
    };
    out.push(hold);
    return;
  }

  const tap: TapNote = {
    kind: "tap",
    time,
    pos: start,
    break: isBreak || undefined,
    ex: isEx || undefined,
    star: isStar || undefined,
  };
  out.push(tap);
}

/** Read one slide segment beginning at index `i` (which points at the shape char). */
function readSegment(token: string, i: number, from: Button): { segment: SlideSegment; next: number } {
  let shape: SlideShape;
  const ch = token[i];
  if (ch === "p" && token[i + 1] === "p") {
    shape = "pp";
    i += 2;
  } else if (ch === "q" && token[i + 1] === "q") {
    shape = "qq";
    i += 2;
  } else {
    shape = ch as SlideShape;
    i += 1;
  }

  let vertex: Button | undefined;
  if (shape === "V") {
    vertex = toButton(token[i]);
    i += 1;
  }
  const end = toButton(token[i]);
  i += 1;

  // `from` is implied by the chain; kept for clarity / future per-segment timing.
  void from;
  return { segment: { shape, vertex, end }, next: i };
}

/**
 * Convert a bracket duration spec to seconds.
 *   [x:y]        y notes of 1/x length at the current BPM
 *   [bpm#x:y]    same, but using the given BPM
 *   [#s]         s seconds (literal)
 *   [bpm#s]      s seconds (literal; bpm ignored for length)
 *   [x##s]       s seconds (literal, custom-timed variant)
 */
export function bracketSeconds(content: string, currentBpm: number): number {
  if (content.includes("##")) {
    const after = content.split("##")[1];
    return parseFloat(after) || 0;
  }
  let bpm = currentBpm;
  let body = content;
  if (content.includes("#")) {
    const [a, b] = content.split("#");
    const maybeBpm = parseFloat(a);
    if (a !== "" && Number.isFinite(maybeBpm)) bpm = maybeBpm;
    body = b;
  }
  if (body.includes(":")) {
    const [x, y] = body.split(":").map(Number);
    if (!x || !Number.isFinite(y)) return 0;
    return (60 / bpm) * (4 / x) * y;
  }
  return parseFloat(body) || 0;
}

function parseTouch(token: string, time: number, ctx: Ctx): TouchNote | TouchHoldNote {
  const area = token[0] as TouchArea;
  let i = 1;
  let index = 1;
  if (/[1-8]/.test(token[i] ?? "")) {
    index = Number(token[i]);
    i++;
  }

  let firework = false;
  let isHold = false;
  let duration: number | undefined;
  while (i < token.length) {
    const ch = token[i];
    if (ch === "f") {
      firework = true;
      i++;
    } else if (ch === "h") {
      isHold = true;
      i++;
    } else if (ch === "[") {
      const close = token.indexOf("]", i);
      duration = bracketSeconds(token.slice(i + 1, close), ctx.bpm);
      i = close === -1 ? token.length : close + 1;
    } else {
      i++;
    }
  }

  if (isHold) {
    return {
      kind: "touchHold",
      time,
      area,
      index,
      duration: duration ?? beatSeconds(ctx.bpm, 4),
      firework: firework || undefined,
    };
  }
  return { kind: "touch", time, area, index, firework: firework || undefined };
}
