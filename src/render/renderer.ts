// Canvas 2D renderer for the maimai playfield.
//
// Notes spawn near the centre and travel outward along their lane, reaching the
// outer ring (the judgement line) exactly at their hit time — the same visual
// language as the arcade and Majdata. The renderer is stateless per frame: call
// `render(now)` with the current playback time in seconds and it draws whatever
// should be on screen at that moment.

import { buttonPoint, touchPoint, type Vec2 } from "../geometry/playfield";
import { buildSlidePath, Polyline } from "../geometry/slidePaths";
import type { Chart, HoldNote, Note, SlideNote, TapNote, TouchNote, TouchHoldNote } from "../simai/types";

const COLORS = {
  bg: "#0b0e17",
  ring: "#2a3350",
  ringGlow: "#3d4a73",
  lane: "#1a2138",
  tap: "#ff4f8b",
  hold: "#ff4f8b",
  slide: "#36a3ff",
  slideTrack: "#1d4d78",
  touch: "#22d3c5",
  break: "#ffae3b",
  ex: "#ffffff",
  star: "#9bd1ff",
  text: "#aeb8d4",
};

/** Radius (unit space) at which approaching notes first appear. */
const SPAWN_RADIUS = 0.12;

export interface RenderOptions {
  /** Seconds a note is visible while travelling from spawn to the ring. */
  approachTime: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private chart: Chart | null = null;
  private slidePaths = new Map<Note, Polyline>();
  private cx = 0;
  private cy = 0;
  private radius = 1;
  options: RenderOptions = { approachTime: 0.85 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.resize();
  }

  setChart(chart: Chart): void {
    this.chart = chart;
    this.slidePaths.clear();
    for (const note of chart.notes) {
      if (note.kind === "slide") this.slidePaths.set(note, buildSlidePath(note));
    }
  }

  /** Recompute pixel layout from the canvas size; call on resize. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = rect.width / 2;
    this.cy = rect.height / 2;
    this.radius = (Math.min(rect.width, rect.height) / 2) * 0.86;
  }

  private toScreen(v: Vec2): Vec2 {
    return { x: this.cx + v.x * this.radius, y: this.cy + v.y * this.radius };
  }

  render(now: number): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    this.drawPlayfield();
    if (!this.chart) return;

    const approach = this.options.approachTime;
    // Draw far-future notes first so nearer ones sit on top.
    for (const note of this.chart.notes) {
      if (!this.isVisible(note, now, approach)) continue;
      switch (note.kind) {
        case "tap":
          this.drawTap(note, now, approach);
          break;
        case "hold":
          this.drawHold(note, now, approach);
          break;
        case "slide":
          this.drawSlide(note, now, approach);
          break;
        case "touch":
          this.drawTouch(note, now, approach);
          break;
        case "touchHold":
          this.drawTouchHold(note, now);
          break;
      }
    }
  }

  private isVisible(note: Note, now: number, approach: number): boolean {
    const start = note.time - approach;
    let end = note.time + 0.12;
    if (note.kind === "hold") end = note.time + note.duration;
    else if (note.kind === "touchHold") end = note.time + note.duration;
    else if (note.kind === "slide") end = note.time + note.delay + note.duration;
    return now >= start && now <= end;
  }

  // --- Playfield --------------------------------------------------------

  private drawPlayfield(): void {
    const { ctx } = this;
    const c = this.toScreen({ x: 0, y: 0 });

    // Lane dividers between the 8 buttons (drawn at the boundaries).
    ctx.strokeStyle = COLORS.lane;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const deg = 90 - i * 45 + 22.5;
      const a = (deg * Math.PI) / 180;
      const edge = this.toScreen({ x: Math.cos(a), y: -Math.sin(a) });
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(edge.x, edge.y);
      ctx.stroke();
    }

    // Outer ring (judgement line).
    ctx.strokeStyle = COLORS.ring;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c.x, c.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Button markers.
    for (let p = 1 as const; p <= 8; p++) {
      const pt = this.toScreen(buttonPoint(p as 1));
      ctx.fillStyle = COLORS.ringGlow;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, this.radius * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Notes ------------------------------------------------------------

  /** Outward radius (unit space) for a note approaching its hit at `hitTime`. */
  private approachRadius(now: number, hitTime: number, approach: number): number {
    const p = (now - (hitTime - approach)) / approach;
    const clamped = Math.max(0, Math.min(1, p));
    return SPAWN_RADIUS + (1 - SPAWN_RADIUS) * clamped;
  }

  private noteColor(note: { break?: boolean; ex?: boolean }, base: string): string {
    if (note.break) return COLORS.break;
    return base;
  }

  private drawTap(note: TapNote, now: number, approach: number): void {
    const r = this.approachRadius(now, note.time, approach);
    const dir = buttonPoint(note.pos);
    const pos = this.toScreen({ x: dir.x * r, y: dir.y * r });
    const size = this.radius * 0.06;
    if (note.star) this.drawStar(pos, size, this.noteColor(note, COLORS.slide));
    else this.drawDisc(pos, size, this.noteColor(note, COLORS.tap), note.ex);
  }

  private drawHold(note: HoldNote, now: number, approach: number): void {
    const dir = buttonPoint(note.pos);
    const headR = this.approachRadius(now, note.time, approach);
    const tailR = this.approachRadius(now, note.time + note.duration, approach);
    const head = this.toScreen({ x: dir.x * headR, y: dir.y * headR });
    const tail = this.toScreen({ x: dir.x * tailR, y: dir.y * tailR });
    const { ctx } = this;
    ctx.strokeStyle = this.noteColor(note, COLORS.hold);
    ctx.lineWidth = this.radius * 0.09;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    this.drawDisc(head, this.radius * 0.055, this.noteColor(note, COLORS.hold), note.ex);
  }

  private drawSlide(note: SlideNote, now: number, approach: number): void {
    const path = this.slidePaths.get(note);
    if (!path) return;
    const { ctx } = this;

    const moveStart = note.time + note.delay;
    const moveEnd = moveStart + note.duration;

    // Track: faint guide line for the whole trajectory, visible once the head
    // appears, brightening as the star is about to move.
    if (now >= note.time - approach && now <= moveEnd) {
      ctx.strokeStyle = COLORS.slideTrack;
      ctx.lineWidth = this.radius * 0.035;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const first = this.toScreen(path.points[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < path.points.length; i++) {
        const p = this.toScreen(path.points[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Head star approaches the ring like a tap until the star begins moving.
    if (now <= moveStart) {
      const r = this.approachRadius(now, note.time, approach);
      const dir = buttonPoint(note.start);
      const head = this.toScreen({ x: dir.x * r, y: dir.y * r });
      this.drawStar(head, this.radius * 0.06, this.noteColor(note, COLORS.slide));
    }

    // Travelling star.
    if (now >= moveStart && now <= moveEnd) {
      const t = (now - moveStart) / note.duration;
      const pos = this.toScreen(path.at(t));
      this.drawStar(pos, this.radius * 0.06, this.noteColor(note, COLORS.star));
    }
  }

  private drawTouch(note: TouchNote, now: number, approach: number): void {
    const pos = this.toScreen(touchPoint(note.area, note.index));
    // Shrinking guide ring that converges on the hit moment.
    const p = Math.max(0, Math.min(1, (now - (note.time - approach)) / approach));
    const guide = this.radius * 0.12 * (1 - p) + this.radius * 0.045;
    const { ctx } = this;
    ctx.strokeStyle = this.noteColor(note, COLORS.touch);
    ctx.lineWidth = 3;
    this.drawDiamond(pos, guide, ctx.strokeStyle, false);
    this.drawDiamond(pos, this.radius * 0.04, this.noteColor(note, COLORS.touch), true);
  }

  private drawTouchHold(note: TouchHoldNote, now: number): void {
    const pos = this.toScreen(touchPoint(note.area, note.index));
    const active = now >= note.time && now <= note.time + note.duration;
    const color = this.noteColor(note, COLORS.touch);
    this.drawDiamond(pos, this.radius * (active ? 0.07 : 0.05), color, true);
  }

  // --- Primitives -------------------------------------------------------

  private drawDisc(pos: Vec2, r: number, color: string, ex?: boolean): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ex ? COLORS.ex : "rgba(255,255,255,0.65)";
    ctx.stroke();
  }

  private drawStar(pos: Vec2, r: number, color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.stroke();
    ctx.restore();
  }

  private drawDiamond(pos: Vec2, r: number, color: string, fill: boolean): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - r);
    ctx.lineTo(pos.x + r, pos.y);
    ctx.lineTo(pos.x, pos.y + r);
    ctx.lineTo(pos.x - r, pos.y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
}
