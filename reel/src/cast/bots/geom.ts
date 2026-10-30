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
