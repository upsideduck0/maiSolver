import { describe, expect, it } from "vitest";
import { beatSeconds, bracketSeconds, parseMaidata, parseSimaiBody } from "./parser";
import type { ChartMeta, HoldNote, SlideNote, TapNote, TouchNote } from "./types";

const meta: ChartMeta = { first: 0, bpm: 120 };

describe("timing helpers", () => {
  it("computes seconds per comma from bpm and division", () => {
    expect(beatSeconds(120, 4)).toBeCloseTo(0.5); // a quarter note at 120bpm
    expect(beatSeconds(120, 8)).toBeCloseTo(0.25);
    expect(beatSeconds(60, 4)).toBeCloseTo(1);
  });

  it("parses bracket duration specs", () => {
    expect(bracketSeconds("4:1", 120)).toBeCloseTo(0.5); // one quarter note
    expect(bracketSeconds("8:1", 120)).toBeCloseTo(0.25);
    expect(bracketSeconds("4:2", 120)).toBeCloseTo(1.0);
    expect(bracketSeconds("#2", 120)).toBeCloseTo(2.0); // literal seconds
    expect(bracketSeconds("160#4:1", 160)).toBeCloseTo(0.375);
  });
});

describe("tap timing", () => {
  it("advances time one comma per beat", () => {
    const chart = parseSimaiBody("(120){4}1,2,3,4", meta);
    const taps = chart.notes as TapNote[];
    expect(taps.map((n) => n.pos)).toEqual([1, 2, 3, 4]);
    expect(taps.map((n) => n.time)).toEqual([0, 0.5, 1.0, 1.5]);
  });

  it("respects the &first offset", () => {
    const chart = parseSimaiBody("(120){4}1,2", { first: 1.25, bpm: 120 });
    expect(chart.notes[0].time).toBeCloseTo(1.25);
    expect(chart.notes[1].time).toBeCloseTo(1.75);
  });

  it("changes division mid-stream", () => {
    const chart = parseSimaiBody("(120){4}1,{8}2,3", meta);
    const times = chart.notes.map((n) => n.time);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(0.5); // still one quarter to reach the 2nd
    expect(times[2]).toBeCloseTo(0.75); // now eighths
  });
});

describe("each notes", () => {
  it("splits slash-separated simultaneous taps", () => {
    const chart = parseSimaiBody("(120){4}1/5,", meta);
    expect(chart.notes).toHaveLength(2);
    expect(chart.notes.every((n) => n.time === 0)).toBe(true);
  });

  it("expands the adjacent-digit shorthand", () => {
    const chart = parseSimaiBody("(120){4}15,", meta);
    const taps = chart.notes as TapNote[];
    expect(taps.map((n) => n.pos).sort()).toEqual([1, 5]);
  });
});

describe("holds", () => {
  it("parses hold position and duration", () => {
    const chart = parseSimaiBody("(120){4}1h[4:1],", meta);
    const hold = chart.notes[0] as HoldNote;
    expect(hold.kind).toBe("hold");
    expect(hold.pos).toBe(1);
    expect(hold.duration).toBeCloseTo(0.5);
  });
});

describe("slides", () => {
  it("parses a straight slide with delay and travel", () => {
    const chart = parseSimaiBody("(120){4}1-5[8:1],", meta);
    const slide = chart.notes[0] as SlideNote;
    expect(slide.kind).toBe("slide");
    expect(slide.start).toBe(1);
    expect(slide.segments).toEqual([{ shape: "-", vertex: undefined, end: 5 }]);
    expect(slide.delay).toBeCloseTo(0.5); // one beat at 120bpm
    expect(slide.duration).toBeCloseTo(0.25); // an eighth
  });

  it("parses a V (vertex) slide with two targets", () => {
    const chart = parseSimaiBody("(120){4}2V73[8:1],", meta);
    const slide = chart.notes[0] as SlideNote;
    expect(slide.start).toBe(2);
    expect(slide.segments[0]).toEqual({ shape: "V", vertex: 7, end: 3 });
  });

  it("parses chained slides", () => {
    const chart = parseSimaiBody("(120){4}1-3-5[4:1],", meta);
    const slide = chart.notes[0] as SlideNote;
    expect(slide.segments.map((s) => s.end)).toEqual([3, 5]);
  });

  it("parses the pp two-character shape", () => {
    const chart = parseSimaiBody("(120){4}1pp5[4:1],", meta);
    const slide = chart.notes[0] as SlideNote;
    expect(slide.segments[0].shape).toBe("pp");
    expect(slide.segments[0].end).toBe(5);
  });
});

describe("touch notes", () => {
  it("parses centre and zoned touch notes", () => {
    const chart = parseSimaiBody("(120){4}C,B3,E5,", meta);
    const touches = chart.notes as TouchNote[];
    expect(touches[0]).toMatchObject({ kind: "touch", area: "C", index: 1 });
    expect(touches[1]).toMatchObject({ kind: "touch", area: "B", index: 3 });
    expect(touches[2]).toMatchObject({ kind: "touch", area: "E", index: 5 });
  });

  it("treats a lone E as end-of-chart, not a touch", () => {
    const chart = parseSimaiBody("(120){4}1,2,E,3", meta);
    expect(chart.notes).toHaveLength(2);
  });
});

describe("modifiers", () => {
  it("marks break, ex, and forced-star taps", () => {
    const chart = parseSimaiBody("(120){4}1b,5x,3$,", meta);
    const [a, b, c] = chart.notes as TapNote[];
    expect(a.break).toBe(true);
    expect(b.ex).toBe(true);
    expect(c.star).toBe(true);
  });
});

describe("full maidata", () => {
  it("extracts metadata and chooses the highest difficulty", () => {
    const text = [
      "&title=Test Song",
      "&artist=Someone",
      "&bpm=200",
      "&first=0.1",
      "&inote_3=(200){4}1,2,",
      "&inote_5=(200){4}1,2,3,4,",
    ].join("\n");
    const chart = parseMaidata(text);
    expect(chart.meta.title).toBe("Test Song");
    expect(chart.meta.bpm).toBe(200);
    expect(chart.notes).toHaveLength(4); // picked inote_5
    expect(chart.notes[0].time).toBeCloseTo(0.1);
  });
});
