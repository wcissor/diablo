// Small 2D helpers for the bots: dense polygons for every shape (so the same
// points drive the SVG path, the clip, the crack walker's inside test and the
// bounds), path strings, and polyline measuring.

import type { Pt } from '../../lib/anim';

export const P = (x: number, y: number): Pt => ({ x, y });
const r2 = (n: number) => Math.round(n * 100) / 100;

export const polyD = (pts: Pt[], close = true) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p.x)} ${r2(p.y)}`).join('') + (close ? 'Z' : '');

export const shift = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export const DEG = Math.PI / 180;

// A superellipse |x/a|^n + |y/b|^n = 1: a soft squircle (n ≈ 2.5–3).
export const superellipse = (cx: number, cy: number, a: number, b: number, n: number, N = 200): Pt[] => {
  const e = 2 / n;
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push({ x: cx + a * Math.sign(c) * Math.pow(Math.abs(c), e), y: cy + b * Math.sign(s) * Math.pow(Math.abs(s), e) });
  }
  return pts;
};

// The superellipse point at polar parameter `deg` (0 = right, 90 = bottom).
export const superPt = (cx: number, cy: number, a: number, b: number, n: number, deg: number): Pt => {
  const e = 2 / n;
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { x: cx + a * Math.sign(c) * Math.pow(Math.abs(c), e), y: cy + b * Math.sign(s) * Math.pow(Math.abs(s), e) };
};

export const ellipsePts = (cx: number, cy: number, rx: number, ry: number, N = 96, rotDeg = 0): Pt[] => {
  const pts: Pt[] = [];
  const cr = Math.cos(rotDeg * DEG);
  const sr = Math.sin(rotDeg * DEG);
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    pts.push({ x: cx + x * cr - y * sr, y: cy + x * sr + y * cr });
  }
  return pts;
};

// Quadratic Bézier sampled to points (both ends included).
export const quadPts = (a: Pt, c: Pt, b: Pt, n = 12): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return pts;
};

// A polygon with each corner rounded (cubic, close to a circular arc), sampled.
export const roundedPoly = (corners: Pt[], radii: number[] | number, seg = 10): Pt[] => {
  const n = corners.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = corners[i];
    const prev = corners[(i - 1 + n) % n];
    const next = corners[(i + 1) % n];
    const lin = dist(prev, p);
    const lout = dist(p, next);
    const uin = { x: (p.x - prev.x) / lin, y: (p.y - prev.y) / lin };
    const uout = { x: (next.x - p.x) / lout, y: (next.y - p.y) / lout };
    const want = Array.isArray(radii) ? radii[i] : radii;
    const r = Math.min(want, lin / 2, lout / 2);
    const turn = Math.acos(Math.max(-1, Math.min(1, uin.x * uout.x + uin.y * uout.y)));
    const k = (4 / 3) * Math.tan(turn / 4);
    const a = { x: p.x - uin.x * r, y: p.y - uin.y * r };
    const b = { x: p.x + uout.x * r, y: p.y + uout.y * r };
    const c1 = { x: a.x + uin.x * r * k, y: a.y + uin.y * r * k };
    const c2 = { x: b.x - uout.x * r * k, y: b.y - uout.y * r * k };
    for (let j = 0; j <= seg; j++) {
      const t = j / seg;
      const u = 1 - t;
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      });
    }
  }
  return out;
};

export const pointInPoly = (p: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

export const distToPoly = (p: Pt, poly: Pt[]) => {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(p, poly[j], poly[i]));
  return d;
};

// Signed: positive inside, negative outside.
export const insideDepth = (p: Pt, poly: Pt[]) => (pointInPoly(p, poly) ? 1 : -1) * distToPoly(p, poly);

export const polyLength = (pts: Pt[]) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
};

// The point `d` px along a polyline (clamped), and the heading there.
export const pointAlong = (pts: Pt[], d: number): { p: Pt; angle: number } => {
  let rem = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    if (rem <= l || i === pts.length - 1) {
      const t = l === 0 ? 0 : Math.min(1, rem / l);
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    rem -= l;
  }
  return { p: pts[0], angle: 0 };
};

export const bboxOf = (pts: Pt[]) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
};

/* ───────────────────── smooth curves (cracks and seams) ───────────────────── */

// A curve through a polyline: centripetal Catmull-Rom turned into cubic
// Béziers (no loops or cusps however uneven the steps), with the SVG path,
// dense samples along it (≈ 1 px apart) and their running arc length. The
// samples come from the same rounded control points the path string holds, so
// a point found here at arc length s is where getPointAtLength(d, s) lands.
export interface Curve {
  d: string;
  pts: Pt[]; // dense samples, first = the polyline's first point
  cum: number[]; // arc length at each sample
  total: number; // arc length of the samples (≈ getLength(d))
}

const rr2 = (p: Pt): Pt => ({ x: r2(p.x), y: r2(p.y) });

export const smoothCurve = (poly: Pt[]): Curve => {
  const P = poly.map(rr2);
  if (P.length < 2) return { d: `M${P[0].x} ${P[0].y}`, pts: [P[0]], cum: [0], total: 0 };
  const n = P.length;
  const at = (i: number): Pt => (i < 0 ? { x: 2 * P[0].x - P[1].x, y: 2 * P[0].y - P[1].y } : i >= n ? { x: 2 * P[n - 1].x - P[n - 2].x, y: 2 * P[n - 1].y - P[n - 2].y } : P[i]);
  let d = `M${P[0].x} ${P[0].y}`;
  const pts: Pt[] = [P[0]];
  const cum: number[] = [0];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = at(i + 2);
    const d1 = Math.max(1e-3, Math.sqrt(dist(p0, p1)));
    const d2 = Math.max(1e-3, Math.sqrt(dist(p1, p2)));
    const d3 = Math.max(1e-3, Math.sqrt(dist(p2, p3)));
    const b1 = rr2({
      x: (d1 * d1 * p2.x - d2 * d2 * p0.x + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.x) / (3 * d1 * (d1 + d2)),
      y: (d1 * d1 * p2.y - d2 * d2 * p0.y + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.y) / (3 * d1 * (d1 + d2)),
    });
    const b2 = rr2({
      x: (d3 * d3 * p1.x - d2 * d2 * p3.x + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.x) / (3 * d3 * (d3 + d2)),
      y: (d3 * d3 * p1.y - d2 * d2 * p3.y + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.y) / (3 * d3 * (d3 + d2)),
    });
    d += `C${b1.x} ${b1.y} ${b2.x} ${b2.y} ${p2.x} ${p2.y}`;
    const steps = Math.max(6, Math.ceil((dist(p1, b1) + dist(b1, b2) + dist(b2, p2)) / 0.8));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      const q = {
        x: u * u * u * p1.x + 3 * u * u * t * b1.x + 3 * u * t * t * b2.x + t * t * t * p2.x,
        y: u * u * u * p1.y + 3 * u * u * t * b1.y + 3 * u * t * t * b2.y + t * t * t * p2.y,
      };
      cum.push(cum[cum.length - 1] + dist(pts[pts.length - 1], q));
      pts.push(q);
    }
  }
  return { d, pts, cum, total: cum[cum.length - 1] };
};

// The point s px along a sampled curve (clamped) and the heading there.
export const curveAt = (c: { pts: Pt[]; cum: number[] }, s: number): { p: Pt; angle: number } => {
  const { pts, cum } = c;
  const n = pts.length;
  if (n < 2) return { p: pts[0], angle: 0 };
  const L = cum[n - 1];
  const v = Math.max(0, Math.min(L, s));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= v) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (v - cum[lo]) / seg;
  const a = pts[lo];
  const b = pts[hi];
  return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
};

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

// The outline of a band of varying half-width hw(s) along a sampled curve,
// from arc length l0 to l1, with round ends: how cracks and seams get their
// slight swell and taper (a stroke cannot vary its width).
export const ribbonD = (c: { pts: Pt[]; cum: number[] }, l0: number, l1: number, hw: (s: number) => number, step = 3): string => {
  const L = c.cum[c.cum.length - 1];
  const a = Math.max(0, Math.min(L, l0));
  const b = Math.max(0, Math.min(L, l1));
  if (b - a < 0.2) return '';
  const ss: number[] = [a];
  for (let s = Math.ceil(a / step) * step; s < b; s += step) if (s > a + 0.3 && s < b - 0.3) ss.push(s);
  ss.push(b);
  const left: string[] = [];
  const right: string[] = [];
  let tEnd = { x: 1, y: 0 };
  let tStart = { x: 1, y: 0 };
  const P = ss.map((s, i) => {
    const p = curveAt(c, s).p;
    const q0 = curveAt(c, Math.max(0, s - 0.9)).p;
    const q1 = curveAt(c, Math.min(L, s + 0.9)).p;
    const tl = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
    const t = { x: (q1.x - q0.x) / tl, y: (q1.y - q0.y) / tl };
    if (i === 0) tStart = t;
    tEnd = t;
    const w = Math.max(0.05, hw(s));
    left.push(`${f1(p.x - t.y * w)} ${f1(p.y + t.x * w)}`);
    right.push(`${f1(p.x + t.y * w)} ${f1(p.y - t.x * w)}`);
    return { p, w };
  });
  const cap = (p: Pt, t: Pt, w: number, sign: 1 | -1) => {
    // from the left side round the end to the right side
    const out: string[] = [];
    for (let k = 1; k < 6; k++) {
      const ang = (k / 6) * Math.PI;
      const nx = -t.y * Math.cos(ang) + sign * t.x * Math.sin(ang);
      const ny = t.x * Math.cos(ang) + sign * t.y * Math.sin(ang);
      out.push(`${f1(p.x + nx * w * (sign === 1 ? 1 : 1))} ${f1(p.y + ny * w)}`);
    }
    return out;
  };
  const e = P[P.length - 1];
  const s0 = P[0];
  const capE = cap(e.p, tEnd, e.w, 1);
  // the start cap runs from the right side round the back to the left side
  const capS = cap(s0.p, { x: -tStart.x, y: -tStart.y }, s0.w, 1);
  return `M${left.join('L')}L${capE.join('L')}L${right.reverse().join('L')}L${capS.join('L')}Z`;
};

// A slow seeded swell along a curve, −1..1 (for the width of cracks and seams).
export const swell = (seed: number, s: number) =>
  Math.sin(s * 0.11 + seed * 2.3) * 0.6 + Math.sin(s * 0.29 + seed * 5.1) * 0.4;
