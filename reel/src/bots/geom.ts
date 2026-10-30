// Geometry for the final bots: points, the body shapes (path + inside test),
// polygon helpers for the faces (split's), and polylines with tapered ribbons
// for the lightning-bolt crack and its inlay (bolt's).

export type Pt = { x: number; y: number };

export const fx = (v: number) => Math.round(v * 100) / 100;
export const pt = (p: Pt) => `${fx(p.x)} ${fx(p.y)}`;
export const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const len = (a: Pt) => Math.hypot(a.x, a.y);
export const unit = (a: Pt): Pt => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
// +90° in screen space (x right, y down): rightwards → downwards.
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x });
export const dirDeg = (deg: number): Pt => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
export const rotate = (p: Pt, deg: number): Pt => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};
export const lerpPt = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
export const centroid = (q: Pt[]): Pt => mul(q.reduce((a, b) => add(a, b), { x: 0, y: 0 }), 1 / q.length);

/* ───────── body shapes ───────── */

export type Shape =
  | { t: 'sq'; cx: number; cy: number; a: number; b: number; n: number } // superellipse
  | { t: 'rr'; x0: number; y0: number; x1: number; y1: number; r: number } // rounded rect
  | { t: 'ci'; cx: number; cy: number; r: number }; // circle

// The same shape grown outwards by o (close enough to an offset curve for these shapes).
export const grow = (s: Shape, o: number): Shape =>
  s.t === 'sq'
    ? { ...s, a: s.a + o, b: s.b + o }
    : s.t === 'rr'
      ? { ...s, x0: s.x0 - o, y0: s.y0 - o, x1: s.x1 + o, y1: s.y1 + o, r: s.r + o }
      : { ...s, r: s.r + o };

// A closed Catmull-Rom spline through the points, as cubic Béziers.
export const smoothClosed = (p: Pt[]) => {
  const n = p.length;
  let d = `M${pt(p[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i + n - 1) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    d += `C${fx(p1.x + (p2.x - p0.x) / 6)} ${fx(p1.y + (p2.y - p0.y) / 6)} ${fx(p2.x - (p3.x - p1.x) / 6)} ${fx(p2.y - (p3.y - p1.y) / 6)} ${pt(p2)}`;
  }
  return d + 'Z';
};

export const sqPoint = (s: { cx: number; cy: number; a: number; b: number; n: number }, t: number): Pt => {
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return { x: s.cx + s.a * Math.sign(c) * Math.pow(Math.abs(c), 2 / s.n), y: s.cy + s.b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / s.n) };
};

export const shapeD = (s: Shape): string => {
  if (s.t === 'ci') {
    const r = fx(s.r);
    return `M${fx(s.cx - s.r)} ${fx(s.cy)}A${r} ${r} 0 1 0 ${fx(s.cx + s.r)} ${fx(s.cy)}A${r} ${r} 0 1 0 ${fx(s.cx - s.r)} ${fx(s.cy)}Z`;
  }
  if (s.t === 'rr') {
    const { x0, y0, x1, y1 } = s;
    const r = fx(s.r);
    return (
      `M${fx(x0 + s.r)} ${fx(y0)}H${fx(x1 - s.r)}A${r} ${r} 0 0 1 ${fx(x1)} ${fx(y0 + s.r)}V${fx(y1 - s.r)}` +
      `A${r} ${r} 0 0 1 ${fx(x1 - s.r)} ${fx(y1)}H${fx(x0 + s.r)}A${r} ${r} 0 0 1 ${fx(x0)} ${fx(y1 - s.r)}V${fx(y0 + s.r)}` +
      `A${r} ${r} 0 0 1 ${fx(x0 + s.r)} ${fx(y0)}Z`
    );
  }
  const N = 120;
  return smoothClosed(Array.from({ length: N }, (_, i) => sqPoint(s, (i / N) * 2 * Math.PI)));
};

export const inside = (s: Shape, p: Pt) => {
  if (s.t === 'ci') return (p.x - s.cx) ** 2 + (p.y - s.cy) ** 2 <= s.r * s.r;
  if (s.t === 'sq') return Math.pow(Math.abs((p.x - s.cx) / s.a), s.n) + Math.pow(Math.abs((p.y - s.cy) / s.b), s.n) <= 1;
  const dx = Math.max(s.x0 + s.r - p.x, 0, p.x - (s.x1 - s.r));
  const dy = Math.max(s.y0 + s.r - p.y, 0, p.y - (s.y1 - s.r));
  return p.x >= s.x0 && p.x <= s.x1 && p.y >= s.y0 && p.y <= s.y1 && dx * dx + dy * dy <= s.r * s.r;
};

// Where the line o + u·t crosses the shape: the first and last t inside it.
export const span = (s: Shape, o: Pt, u: Pt): [number, number] => {
  let t0 = NaN;
  let t1 = NaN;
  for (let t = -400; t <= 400; t += 0.25) {
    if (inside(s, add(o, u, t))) {
      if (Number.isNaN(t0)) t0 = t;
      t1 = t;
    }
  }
  return [t0, t1];
};

/* ───────── polygons (the faces are built from clipped ellipses) ───────── */

export const ellipsePts = (cx: number, cy: number, rx: number, ry: number, N = 72): Pt[] =>
  Array.from({ length: N }, (_, i) => {
    const t = (i / N) * 2 * Math.PI;
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  });

// Sutherland–Hodgman against one linear constraint: keep g(p) >= 0.
export const clipPoly = (pts: Pt[], g: (p: Pt) => number): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ga = g(a);
    const gb = g(b);
    if (ga >= 0) out.push(a);
    if (ga >= 0 !== gb >= 0) {
      const k = ga / (ga - gb);
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
  }
  return out;
};

export const polyD = (pts: Pt[]) => (pts.length < 3 ? '' : `M${pts.map(pt).join('L')}Z`);

/* ───────── polylines and tapered ribbons (the bolt) ───────── */

export interface Line {
  pts: Pt[];
  cum: number[];
  total: number;
}
export const mkLine = (pts: Pt[]): Line => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  return { pts, cum, total: cum[cum.length - 1] };
};
const segAt = (l: Line, s: number) => {
  let i = 0;
  while (i < l.pts.length - 2 && l.cum[i + 1] <= s) i++;
  return i;
};
export const pointAt = (l: Line, s: number): Pt => {
  const c = Math.max(0, Math.min(l.total, s));
  const i = segAt(l, c);
  const seg = l.cum[i + 1] - l.cum[i] || 1;
  const t = (c - l.cum[i]) / seg;
  return add(l.pts[i], mul(sub(l.pts[i + 1], l.pts[i]), t));
};
export const tangentAt = (l: Line, s: number): Pt => {
  const i = segAt(l, Math.max(0, Math.min(l.total, s)));
  return unit(sub(l.pts[i + 1], l.pts[i]));
};

// A filled ribbon along the line from s0 to s1 with half-width hw(s), with sharp
// mitred corners at the polyline's own vertices (that is what makes a bolt).
// One path of small quads and corner wedges, all wound the same way, so the
// nonzero fill is their union: no holes where the sharp step folds back.
const area2 = (q: Pt[]) => q.reduce((a, p, i) => a + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0);
const quadD = (q: Pt[]) => {
  const r = area2(q) < 0 ? [...q].reverse() : q;
  return r.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join('') + 'Z';
};
export const ribbon = (l: Line, s0: number, s1: number, hw: (s: number) => number, step = 5) => {
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
    if (wa < 0.05 && wb < 0.05) continue;
    d += quadD([add(pa, n, wa), add(pb, n, wb), sub(pb, mul(n, wb)), sub(pa, mul(n, wa))]);
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
    const A = add(p, na, sgn * w);
    const B = add(p, nb, sgn * w);
    const m = unit(add(na, nb));
    const M = add(p, m, (sgn * w) / Math.max(0.42, dot(m, na)));
    d += quadD([p, A, M, B]);
  });
  return d;
};

// Stable pseudo-random in [0, 1) from two numbers (no Math.random).
export const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
