// Small 2D helpers for the facet concept: vectors, polygons, rounded shapes.
// Everything is plain numbers in, path strings out (no randomness).

export type V = { x: number; y: number };

export const v = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
export const len = (a: V) => Math.hypot(a.x, a.y);
export const norm = (a: V): V => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const lerpV = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const dir = (deg: number): V => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });

export const centroid = (ps: V[]): V => {
  // Area centroid (falls back to the vertex mean for degenerate shapes).
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const q = ps[(i + 1) % ps.length];
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-6) return mul(ps.reduce((s, p) => add(s, p), v(0, 0)), 1 / ps.length);
  return { x: cx / (3 * a), y: cy / (3 * a) };
};

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
export const pts = (ps: V[]) => ps.map((p) => `${f2(p.x)},${f2(p.y)}`).join(' ');
export const polyD = (ps: V[]) => (ps.length ? `M${ps.map((p) => `${f2(p.x)} ${f2(p.y)}`).join('L')}Z` : '');
export const lineD = (ps: V[]) => (ps.length ? `M${ps.map((p) => `${f2(p.x)} ${f2(p.y)}`).join('L')}` : '');

export const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 56): V[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  });

// A pill / rounded box sampled as a polygon (superellipse-ish corners).
export const pillPts = (cx: number, cy: number, rx: number, ry: number, n = 64): V[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const e = 0.6; // < 1 squares the shape off a little
    return { x: cx + rx * Math.sign(c) * Math.pow(Math.abs(c), e), y: cy + ry * Math.sign(s) * Math.pow(Math.abs(s), e) };
  });

// Keep the part of a polygon where (p - p0) · n >= 0 (Sutherland–Hodgman, one plane).
export const clipHalf = (ps: V[], p0: V, n: V): V[] => {
  const out: V[] = [];
  const f = (p: V) => (p.x - p0.x) * n.x + (p.y - p0.y) * n.y;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    const b = ps[(i + 1) % ps.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
};

// Clip a polygon by a convex polygon.
export const clipConvex = (subject: V[], clip: V[]): V[] => {
  const c = centroid(clip);
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    let n = { x: -(b.y - a.y), y: b.x - a.x };
    if ((c.x - a.x) * n.x + (c.y - a.y) * n.y < 0) n = mul(n, -1);
    out = clipHalf(out, a, n);
  }
  return out;
};

// A polygon with every corner rounded (quadratic corners, radius r or less).
export const roundPoly = (ps: V[], r: number | number[]) => {
  const n = ps.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = ps[i];
    const a = ps[(i - 1 + n) % n];
    const b = ps[(i + 1) % n];
    const ri = Array.isArray(r) ? r[i] : r;
    const ka = Math.min(ri, len(sub(a, p)) / 2);
    const kb = Math.min(ri, len(sub(b, p)) / 2);
    const p1 = add(p, mul(norm(sub(a, p)), ka));
    const p2 = add(p, mul(norm(sub(b, p)), kb));
    d += `${i === 0 ? 'M' : 'L'}${f2(p1.x)} ${f2(p1.y)}Q${f2(p.x)} ${f2(p.y)} ${f2(p2.x)} ${f2(p2.y)}`;
  }
  return `${d}Z`;
};

export const rrect = (x0: number, y0: number, x1: number, y1: number, r: number) =>
  `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;

// Is p inside the polygon (even-odd)?
export const inside = (p: V, ps: V[]) => {
  let c = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i];
    const b = ps[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
