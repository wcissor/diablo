// Geometry for the split bots: the body shapes (path + inside test), polygon
// helpers for the faces, and the one clean cut through each bot.

export type Pt = { x: number; y: number };

export type Shape =
  | { t: 'sq'; cx: number; cy: number; a: number; b: number; n: number } // superellipse
  | { t: 'rr'; x0: number; y0: number; x1: number; y1: number; r: number } // rounded rect
  | { t: 'ci'; cx: number; cy: number; r: number }; // circle

export const fx = (v: number) => Math.round(v * 100) / 100;
export const pt = (p: Pt) => `${fx(p.x)} ${fx(p.y)}`;
export const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

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

/* ───────── the cut ───────── */

export interface Cut {
  deg: number; // slash direction of travel (screen degrees)
  u: Pt; // unit vector along the cut, in the slash's direction of travel
  n: Pt; // unit normal pointing to the side that slides (the part above the cut)
  p: Pt; // a point on the cut
  a: Pt; // where the cut enters the body (the -u end)
  b: Pt; // where it leaves (the +u end)
  ao: Pt; // the same two points on the outer edge of the outline
  bo: Pt;
  len: number; // a → b
  hi: string; // half-plane polygons: the sliding side and the side that stays
  lo: string;
}

export const makeCut = (deg: number, body: Shape, ow: number, anchor: Pt, clear: number): Cut => {
  const r = (deg * Math.PI) / 180;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  let n = { x: u.y, y: -u.x };
  if (n.y > 0) n = { x: -n.x, y: -n.y };
  const p = add(anchor, n, clear);
  const at = (t: number) => add(p, u, t);
  const span = (s: Shape) => {
    let t0 = NaN;
    let t1 = NaN;
    for (let t = -400; t <= 400; t += 0.25) {
      if (inside(s, at(t))) {
        if (Number.isNaN(t0)) t0 = t;
        t1 = t;
      }
    }
    return [t0, t1];
  };
  const [ta, tb] = span(body);
  const [toa, tob] = span(grow(body, ow));
  const L = 900;
  const poly = (k: number) => [at(-L), at(L), add(at(L), n, L * k), add(at(-L), n, L * k)].map((q) => `${fx(q.x)},${fx(q.y)}`).join(' ');
  return { deg, u, n, p, a: at(ta), b: at(tb), ao: at(toa), bo: at(tob), len: tb - ta, hi: poly(1), lo: poly(-1) };
};
