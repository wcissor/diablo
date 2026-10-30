// Small, pure geometry helpers for Diablo's cast: 2D affine matrices, sampling
// of the logo's absolute M/L/C/Z paths, polygon measures and the "rim on the
// top edges" band built from an outline and its outward normals.

import type { Pt } from '../../lib/anim';

/* ───────────────────────────── matrices ───────────────────────────── */

// SVG-style affine matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f.
export type Mat = [number, number, number, number, number, number];

export const I: Mat = [1, 0, 0, 1, 0, 0];

export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

// Compose left to right like an SVG transform list: chain(A, B, C) = A·B·C.
export const chain = (...ms: Mat[]): Mat => ms.reduce((acc, m) => mul(acc, m), I);

export const T = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const S = (sx: number, sy = sx): Mat => [sx, 0, 0, sy, 0, 0];
export const R = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
};

export const ap = (m: Mat, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

// Apply only the linear part (for vectors).
export const apv = (m: Mat, v: Pt): Pt => ({ x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y });

// Inverse of the linear part applied to a vector: which local vector maps to v.
export const invv = (m: Mat, v: Pt): Pt => {
  const det = m[0] * m[3] - m[1] * m[2];
  return { x: (m[3] * v.x - m[2] * v.y) / det, y: (-m[1] * v.x + m[0] * v.y) / det };
};

export const svgM = (m: Mat) => `matrix(${m.map((v) => +v.toFixed(5)).join(' ')})`;

// For a group drawn inside transform `m`: a transform that undoes m's rotation,
// mirroring and scale about the local point `at`. Inside it, units are canvas
// px in canvas orientation (origin at `at`), so a stage-oriented hatch pattern
// stays 1.5 px / 7 px / 9° on the canvas however the part is posed.
export const unrotate = (m: Mat, at: Pt): Mat => {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, at.x, at.y];
};

// Mean linear scale of a matrix (for keeping strokes in canvas px).
export const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/* ───────────────────────────── paths ───────────────────────────── */

const cubic = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
};

// Sample an absolute M/L/C/Z path (implicit repeats allowed) into polygons, one
// per subpath. `per` samples per curve segment.
export const samplePath = (d: string, per = 8): Pt[][] => {
  const tokens = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const polys: Pt[][] = [];
  let cur: Pt = { x: 0, y: 0 };
  let poly: Pt[] = [];
  let cmd = 'M';
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[MLCZmlcz]/.test(tk)) {
      cmd = tk.toUpperCase();
      i++;
      if (cmd === 'Z') {
        if (poly.length) polys.push(poly);
        poly = [];
        continue;
      }
    }
    if (cmd === 'M') {
      if (poly.length) polys.push(poly);
      cur = { x: num(), y: num() };
      poly = [cur];
      cmd = 'L';
    } else if (cmd === 'L') {
      cur = { x: num(), y: num() };
      poly.push(cur);
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const p1 = { x: num(), y: num() };
      for (let k = 1; k <= per; k++) poly.push(cubic(cur, c1, c2, p1, k / per));
      cur = p1;
    } else {
      i++;
    }
  }
  if (poly.length) polys.push(poly);
  return polys;
};

// Signed area (positive = clockwise on screen, y down).
export const signedArea = (P: Pt[]) => {
  let a = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

export const centroid = (P: Pt[]): Pt => {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    const cr = p.x * q.y - q.x * p.y;
    a += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
};

export const bbox = (P: Pt[]) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of P) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
};

const f = (v: number) => +v.toFixed(2);
export const polyD = (P: Pt[], close = true) =>
  P.length ? `M${P.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}${close ? 'Z' : ''}` : '';

// A smooth closed path through polygon points (Catmull-Rom → cubic Bézier).
export const smoothD = (P: Pt[], close = true, tension = 1) => {
  const n = P.length;
  if (n < 3) return polyD(P, close);
  const get = (i: number) => (close ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(P[0].x)} ${f(P[0].y)}`;
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const k = tension / 6;
    d += `C${f(p1.x + (p2.x - p0.x) * k)} ${f(p1.y + (p2.y - p0.y) * k)} ${f(p2.x - (p3.x - p1.x) * k)} ${f(p2.y - (p3.y - p1.y) * k)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return close ? `${d}Z` : d;
};

/* ───────────────────────── strips (claws, the ring band) ───────────────────────── */

// A strip built along a centreline: for each sample, its two edge points and
// the outward normal of each edge. Edge A is on the left of the direction of
// travel (screen coordinates, y down), edge B on the right.
export interface Strip {
  a: Pt[];
  b: Pt[];
  na: Pt[];
  nb: Pt[];
  w: number[];
}

// Band along the edges of a strip that face up on the canvas (n.y < 0): the
// cream rim. `t` is the rim thickness measured vertically, as if the shape were
// drawn in cream and again in its own colour shifted down by t; the band never
// takes more than `maxFrac` of the local width.
export const stripRimD = (s: Strip, t = 3, maxFrac = 0.42, from = 0, to = s.a.length - 1): string => {
  const side = (E: Pt[], N: Pt[]) => {
    const outer: Pt[] = [];
    const inner: Pt[] = [];
    for (let i = from; i <= to; i++) {
      const up = Math.max(0, -N[i].y);
      const th = Math.min(t * up, s.w[i] * maxFrac);
      outer.push(E[i]);
      inner.push({ x: E[i].x - N[i].x * th, y: E[i].y - N[i].y * th });
    }
    return polyD([...outer, ...inner.reverse()]);
  };
  return side(s.a, s.na) + side(s.b, s.nb);
};

// The same band, on edges that face down (n.y > 0): light from below.
export const stripUnderD = (s: Strip, t = 3, maxFrac = 0.42, from = 0, to = s.a.length - 1): string => {
  const side = (E: Pt[], N: Pt[]) => {
    const outer: Pt[] = [];
    const inner: Pt[] = [];
    for (let i = from; i <= to; i++) {
      const dn = Math.max(0, N[i].y);
      const th = Math.min(t * dn, s.w[i] * maxFrac);
      outer.push(E[i]);
      inner.push({ x: E[i].x - N[i].x * th, y: E[i].y - N[i].y * th });
    }
    return polyD([...outer, ...inner.reverse()]);
  };
  return side(s.a, s.na) + side(s.b, s.nb);
};

// One edge's band (rim on up-facing parts, or light on down-facing parts),
// for edges that need their own sample range.
export const stripEdgeBandD = (
  s: Strip,
  which: 'a' | 'b',
  facing: 'up' | 'down',
  t: number,
  maxFrac: number,
  from: number,
  to: number,
): string => {
  const E = which === 'a' ? s.a : s.b;
  const N = which === 'a' ? s.na : s.nb;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = Math.max(0, from); i <= Math.min(E.length - 1, to); i++) {
    const k = facing === 'up' ? Math.max(0, -N[i].y) : Math.max(0, N[i].y);
    const th = Math.min(t * k, s.w[i] * maxFrac);
    outer.push(E[i]);
    inner.push({ x: E[i].x - N[i].x * th, y: E[i].y - N[i].y * th });
  }
  return outer.length > 1 ? polyD([...outer, ...inner.reverse()]) : '';
};

// Outline of a strip between samples [from, to], closed (A forward, B back).
export const stripD = (s: Strip, from = 0, to = s.a.length - 1) => {
  const A = s.a.slice(from, to + 1);
  const B = s.b.slice(from, to + 1).reverse();
  return polyD([...A, ...B]);
};

// One half of a strip (edge to centreline) on the given side.
export const stripHalfD = (s: Strip, which: 'a' | 'b', frac = 0.5, from = 0, to = s.a.length - 1) => {
  const E = which === 'a' ? s.a : s.b;
  const O = which === 'a' ? s.b : s.a;
  const edge = E.slice(from, to + 1);
  const mid = edge.map((p, k) => {
    const o = O[from + k];
    return { x: p.x + (o.x - p.x) * frac, y: p.y + (o.y - p.y) * frac };
  });
  return polyD([...edge, ...mid.reverse()]);
};

/* ───────────────────────────── polygons ───────────────────────────── */

// Clip a convex or simple polygon by the half-plane n·p ≤ c (Sutherland–Hodgman).
export const clipHalf = (P: Pt[], n: Pt, c: number): Pt[] => {
  const out: Pt[] = [];
  const inside = (p: Pt) => n.x * p.x + n.y * p.y <= c;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    const pi = inside(p);
    const qi = inside(q);
    if (pi) out.push(p);
    if (pi !== qi) {
      const dp = n.x * p.x + n.y * p.y - c;
      const dq = n.x * q.x + n.y * q.y - c;
      const t = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
};

// A rounded rectangle centred on the origin, as a polygon (clockwise on screen).
export const roundRectPoly = (w: number, h: number, r: number, per = 8): Pt[] => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const hw = w / 2;
  const hh = h / 2;
  const P: Pt[] = [];
  const corners: [number, number, number][] = [
    [hw - rr, -hh + rr, -Math.PI / 2],
    [hw - rr, hh - rr, 0],
    [-hw + rr, hh - rr, Math.PI / 2],
    [-hw + rr, -hh + rr, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= per; k++) {
      const a = a0 + (k / per) * (Math.PI / 2);
      P.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
    }
  }
  return P;
};

export const lerpPt = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
export const dist = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);

// Translate an absolute path made only of coordinate pairs (M/L/C/Z, implicit
// repeats allowed, like the logo's paths) by (dx, dy).
export const translateD = (d: string, dx: number, dy: number) => {
  let k = 0;
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => `${f(parseFloat(n) + (k++ % 2 === 0 ? dx : dy))}`);
};

// The cream rim band of a shape: the shape minus itself shifted by `v` (local
// units; 3 canvas px straight down for the rim on the top edges). Draw it with
// fillRule evenodd inside a clip to the shape itself: `box` is a local
// rectangle that contains the shape and its shifted copy.
export const rimBandD = (d: string, v: Pt, box: { x: number; y: number; w: number; h: number }) =>
  `M${f(box.x)} ${f(box.y)}H${f(box.x + box.w)}V${f(box.y + box.h)}H${f(box.x)}Z` + translateD(d, v.x, v.y);
