// Geometry for slide trajectories.
//
// Each slide shape is turned into a sampled polyline in unit playfield space.
// The renderer draws this as the slide "track" and moves a star along it by
// arc-length so travel speed is visually constant. Curved shapes (p/q/s/z/w)
// are reasonable approximations of the arcade trajectories, good enough for a
// viewer; exact arcade curves can be refined later.

import type { Button, SlideNote, SlideSegment } from "../simai/types";
import { angleDelta, buttonAngle, buttonPoint, lerp, ringPoint, type Vec2 } from "./playfield";

const ARC_SAMPLES = 24;
const CURVE_SAMPLES = 28;

/** A polyline that supports constant-speed sampling by normalised arc length. */
export class Polyline {
  readonly points: Vec2[];
  private readonly cumulative: number[];
  readonly length: number;

  constructor(points: Vec2[]) {
    this.points = points;
    this.cumulative = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      total += Math.hypot(dx, dy);
      this.cumulative.push(total);
    }
    this.length = total;
  }

  /** Point at fraction `t` (0..1) of the total arc length. */
  at(t: number): Vec2 {
    if (this.points.length === 1 || this.length === 0) return this.points[0];
    const target = Math.max(0, Math.min(1, t)) * this.length;
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const segLen = this.cumulative[i] - this.cumulative[i - 1] || 1;
    const local = (target - this.cumulative[i - 1]) / segLen;
    return lerp(this.points[i - 1], this.points[i], local);
  }
}

/** Build the full slide path (all chained segments) for a slide note. */
export function buildSlidePath(slide: SlideNote): Polyline {
  const points: Vec2[] = [buttonPoint(slide.start)];
  let from = slide.start;
  for (const seg of slide.segments) {
    const segPoints = segmentPoints(from, seg);
    // First point coincides with the previous end; skip it to avoid a duplicate.
    for (let i = 1; i < segPoints.length; i++) points.push(segPoints[i]);
    from = seg.end;
  }
  return new Polyline(points);
}

function segmentPoints(from: Button, seg: SlideSegment): Vec2[] {
  const a = buttonPoint(from);
  const b = buttonPoint(seg.end);
  switch (seg.shape) {
    case "-":
      return [a, b];
    case "^":
      return arc(from, seg.end, "short");
    case "<":
      return arc(from, seg.end, "ccw");
    case ">":
      return arc(from, seg.end, "cw");
    case "v":
      return [a, { x: 0, y: 0 }, b];
    case "V":
      return [a, buttonPoint(seg.vertex ?? from), b];
    case "p":
      return curve(a, b, 0.85);
    case "q":
      return curve(a, b, -0.85);
    case "pp":
      return curve(a, b, 1.5);
    case "qq":
      return curve(a, b, -1.5);
    case "s":
      return thunder(a, b, 1);
    case "z":
      return thunder(a, b, -1);
    case "w":
      // Fan slide: the central star travels straight; the fan spread is a
      // rendering nicety handled elsewhere.
      return [a, b];
    default:
      return [a, b];
  }
}

/** Arc along the outer ring from one button to another. */
function arc(from: Button, to: Button, dir: "short" | "ccw" | "cw"): Vec2[] {
  const start = buttonAngle(from);
  const end = buttonAngle(to);
  let delta = angleDelta(start, end);
  // Increasing angle is counter-clockwise on screen (Y is flipped in ringPoint).
  if (dir === "ccw" && delta < 0) delta += 2 * Math.PI;
  if (dir === "cw" && delta > 0) delta -= 2 * Math.PI;
  if (delta === 0) delta = dir === "cw" ? -2 * Math.PI : 2 * Math.PI;

  const out: Vec2[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    out.push(ringPoint(start + delta * (i / ARC_SAMPLES)));
  }
  return out;
}

/** Cubic-ish C-curve bulging perpendicular to the chord; sign sets the side. */
function curve(a: Vec2, b: Vec2, bulge: number): Vec2[] {
  const mid = lerp(a, b, 0.5);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector.
  const nx = -dy / len;
  const ny = dx / len;
  const control = { x: mid.x + nx * bulge, y: mid.y + ny * bulge };
  const out: Vec2[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    // Quadratic Bézier through the offset control point.
    out.push({
      x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
    });
  }
  return out;
}

/** Zig-zag "thunder" trajectory across the field. */
function thunder(a: Vec2, b: Vec2, sign: number): Vec2[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 0.55 * sign;
  const ny = (dx / len) * 0.55 * sign;
  const p1 = { x: lerp(a, b, 0.33).x + nx, y: lerp(a, b, 0.33).y + ny };
  const p2 = { x: lerp(a, b, 0.66).x - nx, y: lerp(a, b, 0.66).y - ny };
  return [a, p1, p2, b];
}
