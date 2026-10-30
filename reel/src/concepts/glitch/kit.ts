// Palette, vectors and path builders for the glitch bots. Every colour is one of
// the reel's (src/theme.ts) or a mix of two of them.

import { C } from '../../theme';
import type { Pt } from '../../lib/anim';

export type { Pt };

const rgb = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
/** A colour between two palette colours (t = 0 → a, t = 1 → b). */
export const mix = (a: string, b: string, t: number) => {
  const B = rgb(b);
  return '#' + rgb(a).map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

export const INK = C.night; // outlines, eyes, mouths, the bug line
export const OL = 6; // outline thickness outside every shape (px)

export const PAL = {
  body: C.porcelain,
  shade: mix(C.porcelain, C.porcelainShade, 0.62),
  deep: mix(C.porcelainShade, C.porcelain, 0.15), // feet, fins, the antenna stem
  blush: mix(C.porcelain, C.ember, 0.42),
  ember: C.ember,
  glow: C.cream, // the cube's screen face
  white: C.white,
  maroon: C.maroon,
  night: C.night,
} as const;

/* ───────── vectors ───────── */
export const P = (x: number, y: number): Pt => ({ x, y });
export const add = (a: Pt, b: Pt): Pt => P(a.x + b.x, a.y + b.y);
export const sub = (a: Pt, b: Pt): Pt => P(a.x - b.x, a.y - b.y);
export const mul = (a: Pt, k: number): Pt => P(a.x * k, a.y * k);
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const perp = (a: Pt): Pt => P(-a.y, a.x);
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const mixPt = (a: Pt, b: Pt, t: number): Pt => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
/** Unit vector for an angle in degrees (screen convention: 0 = right, 90 = down). */
export const dirOf = (deg: number): Pt => P(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));

/* ───────── path text ───────── */
const r1 = (v: number) => Math.round(v * 10) / 10;
export const ptsD = (pts: Pt[], close = false) => 'M' + pts.map((p) => `${r1(p.x)} ${r1(p.y)}`).join('L') + (close ? 'Z' : '');

/** A point on a superellipse (rounded-square blob); deg 180 = left, 270 = top. */
export const superPt = (cx: number, cy: number, a: number, b: number, n: number, deg: number): Pt => {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return P(cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n));
};
export const superD = (cx: number, cy: number, a: number, b: number, n: number, from = 0, to = 360, step = 2) => {
  const pts: Pt[] = [];
  for (let d = from; d <= to + 1e-6; d += step) pts.push(superPt(cx, cy, a, b, n, d));
  return ptsD(pts, to - from >= 360);
};
export const rrectD = (x0: number, y0: number, x1: number, y1: number, r: number) =>
  `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}` +
  `H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;
export const ellipseD = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
export const circleD = (cx: number, cy: number, r: number) => ellipseD(cx, cy, r, r);

/* ───────── polylines ───────── */
export const polyLen = (pts: Pt[]) => pts.slice(1).reduce((a, p, i) => a + dist(p, pts[i]), 0);
/** The point at fraction f (0..1) of a polyline's length. */
export const polyAt = (pts: Pt[], f: number): Pt => {
  const total = polyLen(pts);
  let left = Math.max(0, Math.min(1, f)) * total;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (left <= l || i === pts.length - 1) return mixPt(pts[i - 1], pts[i], l > 0 ? Math.min(1, left / l) : 0);
    left -= l;
  }
  return pts[pts.length - 1];
};
