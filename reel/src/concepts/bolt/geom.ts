// Small vector kit: points, rounded polygons, and tapered ribbons along polylines
// (the bolt crack and its seam are ribbons).

export type V = { x: number; y: number };
export const v2 = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
export const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
export const len = (a: V) => Math.hypot(a.x, a.y);
export const unit = (a: V): V => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
// +90° in screen space (x right, y down): rightwards → downwards.
export const perp = (a: V): V => ({ x: -a.y, y: a.x });
export const dirDeg = (deg: number): V => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
export const rotate = (p: V, deg: number): V => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

const n2 = (v: number) => String(Math.round(v * 100) / 100);
export const pt = (p: V) => `${n2(p.x)} ${n2(p.y)}`;

// A closed polygon with round (cubic, near-circular) corners.
export const roundPoly = (pts: V[], r: number | number[]) => {
  const n = pts.length;
  const K = 0.5523;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const ri = Array.isArray(r) ? r[i] : r;
    const rr = Math.min(ri, len(sub(p0, p1)) / 2, len(sub(p2, p1)) / 2);
    const A = add(p1, mul(unit(sub(p0, p1)), rr));
    const B = add(p1, mul(unit(sub(p2, p1)), rr));
    const cA = add(A, mul(sub(p1, A), K));
    const cB = add(B, mul(sub(p1, B), K));
    d += `${i ? 'L' : 'M'}${pt(A)}C${pt(cA)} ${pt(cB)} ${pt(B)}`;
  }
  return d + 'Z';
};
export const rrect = (x0: number, y0: number, x1: number, y1: number, r: number | number[]) =>
  roundPoly([v2(x0, y0), v2(x1, y0), v2(x1, y1), v2(x0, y1)], r);

// A polyline with its arc lengths.
export interface Line {
  pts: V[];
  cum: number[];
  total: number;
}
export const mkLine = (pts: V[]): Line => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  return { pts, cum, total: cum[cum.length - 1] };
};
const segAt = (l: Line, s: number) => {
  let i = 0;
  while (i < l.pts.length - 2 && l.cum[i + 1] <= s) i++;
  return i;
};
export const pointAt = (l: Line, s: number): V => {
  const c = Math.max(0, Math.min(l.total, s));
  const i = segAt(l, c);
  const seg = l.cum[i + 1] - l.cum[i] || 1;
  const t = (c - l.cum[i]) / seg;
  return add(l.pts[i], mul(sub(l.pts[i + 1], l.pts[i]), t));
};
export const tangentAt = (l: Line, s: number): V => {
  const i = segAt(l, Math.max(0, Math.min(l.total, s)));
  return unit(sub(l.pts[i + 1], l.pts[i]));
};

// A filled ribbon along the line from s0 to s1 with half-width hw(s), with sharp
// mitred corners at the polyline's own vertices (that is what makes a bolt).
// Built as one path of small quads and corner wedges, all wound the same way,
// so the nonzero fill is their union: no holes where a sharp step folds back.
const area2 = (q: V[]) => q.reduce((a, p, i) => a + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0);
const sub_ = (q: V[]) => {
  const r = area2(q) < 0 ? [...q].reverse() : q;
  return r.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join('') + 'Z';
};
export const ribbon = (l: Line, s0: number, s1: number, hw: (s: number) => number, step = 6) => {
  if (s1 - s0 < 0.5) return '';
  const inner = l.cum.slice(1, -1);
  const ss = new Set<number>([s0, s1]);
  for (const c of inner) if (c > s0 && c < s1) ss.add(c);
  for (let s = s0 + step; s < s1; s += step) ss.add(s);
  const S = [...ss].sort((a, b) => a - b);
  let d = '';
  for (let i = 0; i + 1 < S.length; i++) {
    const a = S[i];
    const b = S[i + 1];
    const t = tangentAt(l, (a + b) / 2);
    const n = perp(t);
    const pa = pointAt(l, a);
    const pb = pointAt(l, b);
    const wa = Math.max(0, hw(a));
    const wb = Math.max(0, hw(b));
    d += sub_([add(pa, mul(n, wa)), add(pb, mul(n, wb)), sub(pb, mul(n, wb)), sub(pa, mul(n, wa))]);
  }
  // corner wedges: fill the outside of each bend up to a clamped miter
  inner.forEach((c, k) => {
    if (c <= s0 || c >= s1) return;
    const vi = k + 1;
    const w = Math.max(0, hw(c));
    if (w < 0.2) return;
    const p = l.pts[vi];
    const na = perp(unit(sub(l.pts[vi], l.pts[vi - 1])));
    const nb = perp(unit(sub(l.pts[vi + 1], l.pts[vi])));
    const turn = na.x * nb.y - na.y * nb.x; // which side is outside
    const sgn = turn > 0 ? -1 : 1;
    const A = add(p, mul(na, sgn * w));
    const B = add(p, mul(nb, sgn * w));
    const m = unit(add(na, nb));
    const M = add(p, mul(m, (sgn * w) / Math.max(0.42, dot(m, na))));
    d += sub_([p, A, M, B]);
  });
  return d;
};

// Stable pseudo-random in [0, 1) from two numbers (no Math.random).
export const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
