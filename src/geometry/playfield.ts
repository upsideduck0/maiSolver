// Coordinate geometry for the maimai playfield.
//
// The playfield is a circle. Eight outer buttons (1..8) sit on the ring,
// numbered clockwise with the gap between 8 and 1 at the top (12 o'clock).
// We work in a normalised space centred at (0,0) with radius 1, then callers
// scale/translate into canvas pixels. Screen Y grows downward, so a positive
// "up" direction is -Y.

import type { Button, TouchArea } from "../simai/types";

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Angle (radians, standard math convention: CCW from +X) of the centre of an
 * outer button. Button 1 is at 67.5°, decreasing by 45° clockwise.
 */
export function buttonAngle(pos: Button): number {
  const deg = 90 - (pos - 0.5) * 45;
  return (deg * Math.PI) / 180;
}

/** Unit-circle position of an outer button (on the ring, radius 1). */
export function buttonPoint(pos: Button): Vec2 {
  const a = buttonAngle(pos);
  return { x: Math.cos(a), y: -Math.sin(a) };
}

/**
 * Position of a touch sensor in unit space.
 *   A: outer ring   (radius 1.0, aligned with buttons)
 *   B: inner ring   (radius 0.45)
 *   C: centre       (radius 0)
 *   D: outer corners, offset 22.5° from buttons (radius 1.0)
 *   E: inner corners, offset 22.5° (radius 0.45)
 */
export function touchPoint(area: TouchArea, index: number): Vec2 {
  if (area === "C") return { x: 0, y: 0 };
  const radius = area === "A" || area === "D" ? 1.0 : 0.45;
  const offset = area === "D" || area === "E" ? 0.5 : 0; // half a slot = 22.5°
  const deg = 90 - (index - 0.5 + offset) * 45;
  const a = (deg * Math.PI) / 180;
  return { x: radius * Math.cos(a), y: -radius * Math.sin(a) };
}

/** Linear interpolation between two points. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** A point on the ring (radius 1) at a given standard-convention angle. */
export function ringPoint(angle: number): Vec2 {
  return { x: Math.cos(angle), y: -Math.sin(angle) };
}

/** Shortest signed angular difference b-a, wrapped to (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
