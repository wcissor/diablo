// The three facet bots as numbers: silhouettes, faces and the facet fracture
// each slash leaves. Feet at (0, 0), everything inside BOT_BOX (x ±120, y -250..0).
import type { BotKind } from '../_kit/types';
import { SLASH_DIR } from '../_kit/types';
import { add, centroid, dir, inside, len, lerpV, mul, norm, rrect, roundPoly, sub, v, type V } from './geo';

export interface FaceSpec {
  style: 'ink' | 'screen'; // ink: night features on porcelain; screen: light features on a dark screen
  eyes: [V, V];
  rx: number;
  ry: number;
  mouth: V;
  mw: number; // mouth half-width
  cheeks?: [V, V];
  look: V; // eye travel at look = ±1
  slide?: V; // the whole face slides over the shell with the gaze (the orb)
}

// The fracture: rays from the impact P to the ring, the ring around P closes
// the patch. Facet k runs from ray k to ray k+1 (with any bends in between).
export interface FacetSpec {
  P: V;
  ring: { p: V; ray?: boolean; kink?: number }[]; // kink: sideways offset (px) of the ray's midpoint
  pops: number[]; // facets that lift off on the hit
  askew: number; // the facet that stays unseated until the seam closes it
  tint: number[]; // per facet, -1 (darker plane) .. 1 (lighter plane)
  seams: [number, number]; // the two rays of the main cut (forward, back): the white seam runs along them
}

export interface BotSpec {
  body: string[]; // silhouette paths (their union is the shell's fill area)
  half: number; // half-width of the ground shadow
  face: FaceSpec;
  facets: FacetSpec;
  mid: V; // middle of the shell
}

/* ─────────── bubble: the chat-bubble buddy ─────────── */
const BUBBLE_BODY = rrect(-108, -206, 108, -24, 70);
const BUBBLE_TAIL = 'M-86 -60C-88 -38 -97 -21 -110 -10C-86 -10 -58 -19 -38 -32Z';

/* ─────────── cube: the screen-faced robot ─────────── */
export const CUBE = {
  A: v(-98, -190),
  B: v(-70, -206),
  Cc: v(94, -206),
  D: v(94, -44),
  E: v(66, -28),
  F: v(-98, -28),
  G: v(66, -190),
  screen: { x0: -82, y0: -174, x1: 50, y1: -84, r: 20 },
};
const CUBE_HEX = roundPoly([CUBE.A, CUBE.B, CUBE.Cc, CUBE.D, CUBE.E, CUBE.F], 15);

/* ─────────── orb: the hovering sphere ─────────── */
export const ORB = { c: v(0, -136), r: 94 };
const circleD = (c: V, r: number) => `M${c.x - r} ${c.y}A${r} ${r} 0 1 0 ${c.x + r} ${c.y}A${r} ${r} 0 1 0 ${c.x - r} ${c.y}Z`;

export const SPEC: Record<BotKind, BotSpec> = {
  bubble: {
    body: [BUBBLE_BODY, BUBBLE_TAIL],
    half: 112,
    mid: v(0, -115),
    face: {
      style: 'ink',
      eyes: [v(-37, -102), v(37, -102)],
      rx: 15,
      ry: 20,
      mouth: v(0, -73),
      mw: 17,
      cheeks: [v(-69, -78), v(69, -78)],
      look: v(6, 5),
    },
    facets: {
      P: v(60, -168),
      ring: [
        { p: v(118, -149), ray: true, kink: 10 },
        { p: v(104, -126) },
        { p: v(78, -128), ray: true, kink: -4 },
        { p: v(24, -140), ray: true, kink: 4 },
        { p: v(-8, -166) },
        { p: v(-12, -192), ray: true, kink: 10 },
        { p: v(4, -216) },
        { p: v(40, -216), ray: true, kink: 5 },
        { p: v(100, -214) },
      ],
      pops: [4],
      askew: 4,
      tint: [-0.6, 0.35, -0.2, 0.75, -0.35],
      seams: [0, 3],
    },
  },
  cube: {
    body: [CUBE_HEX],
    half: 104,
    mid: v(-2, -118),
    face: {
      style: 'screen',
      eyes: [v(-43, -134), v(11, -134)],
      rx: 9.5,
      ry: 14,
      mouth: v(-16, -107),
      mw: 13,
      look: v(7, 6),
    },
    facets: {
      P: v(54, -60),
      ring: [
        { p: v(17, -97), ray: true, kink: 9 },
        { p: v(62, -120), ray: true, kink: 4 },
        { p: v(112, -100), ray: true, kink: -5 },
        { p: v(116, -36) },
        { p: v(104, -9), ray: true, kink: 9 },
        { p: v(30, -10), ray: true, kink: -4 },
        { p: v(-4, -58) },
      ],
      pops: [2],
      askew: 2,
      tint: [0.6, -0.45, 0.35, -0.7, 0.2],
      seams: [0, 3],
    },
  },
  orb: {
    body: [circleD(ORB.c, ORB.r)],
    half: 82,
    mid: ORB.c,
    face: {
      style: 'ink',
      eyes: [v(-30, -126), v(30, -126)],
      rx: 16,
      ry: 20.5,
      mouth: v(0, -93),
      mw: 15,
      cheeks: [v(-62, -100), v(62, -100)],
      look: v(3, 3),
      slide: v(6, 5),
    },
    facets: {
      P: v(-66, -170),
      ring: [
        { p: v(-15, -197), ray: true, kink: 9 },
        { p: v(-34, -176) },
        { p: v(-58, -150) },
        { p: v(-82, -136), ray: true, kink: -4 },
        { p: v(-102, -151), ray: true, kink: 8 },
        { p: v(-100, -206), ray: true, kink: 5 },
        { p: v(-58, -226) },
      ],
      pops: [2],
      askew: 2,
      tint: [-0.45, 0.3, 0.7, -0.25],
      seams: [2, 0],
    },
  },
};

/* ─────────── derived facet geometry ─────────── */
// Is p inside the shell (the fill area, tail and fins aside)?
const BUBBLE_BOX = { cx: 0, cy: -115, hw: 108, hh: 91, r: 70 };
const CUBE_HEX_PTS = [CUBE.A, CUBE.B, CUBE.Cc, CUBE.D, CUBE.E, CUBE.F];
export const inBody = (kind: BotKind, p: V) => {
  if (kind === 'orb') return len(sub(p, ORB.c)) <= ORB.r;
  if (kind === 'cube') return inside(p, CUBE_HEX_PTS);
  const b = BUBBLE_BOX;
  const qx = Math.max(Math.abs(p.x - b.cx) - (b.hw - b.r), 0);
  const qy = Math.max(Math.abs(p.y - b.cy) - (b.hh - b.r), 0);
  return qx * qx + qy * qy <= b.r * b.r;
};

// Arc length along a polyline where it first leaves the shell (its length if never).
const exitAt = (kind: BotKind, line: V[]) => {
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const L = len(sub(b, a));
    for (let d = 0; d <= L; d += 1) if (!inBody(kind, lerpV(a, b, d / L))) return acc + d;
    acc += L;
  }
  return acc;
};
export const polyLen = (line: V[]) => line.slice(1).reduce((s, p, i) => s + len(sub(p, line[i])), 0);
// The polyline cut at arc length d.
export const cutAt = (line: V[], d: number): V[] => {
  const out = [line[0]];
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const L = len(sub(line[i + 1], line[i]));
    if (acc + L >= d) {
      out.push(lerpV(line[i], line[i + 1], (d - acc) / L));
      return out;
    }
    out.push(line[i + 1]);
    acc += L;
  }
  return out;
};

// The part of a polyline between arc lengths a and b.
export const sliceLine = (line: V[], a: number, b: number): V[] => {
  const out: V[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i];
    const q = line[i + 1];
    const L = len(sub(q, p));
    const s0 = Math.max(a, acc);
    const s1 = Math.min(b, acc + L);
    if (s1 > s0) {
      const pa = lerpV(p, q, (s0 - acc) / L);
      if (!out.length) out.push(pa);
      out.push(lerpV(p, q, (s1 - acc) / L));
    }
    acc += L;
  }
  return out;
};

export interface Facet {
  poly: V[];
  c: V; // centroid
  out: V; // unit direction it lifts off in (away from P)
}
export interface Fracture {
  P: V;
  facets: Facet[];
  rays: V[][]; // P → kink → ring point, one per ray
  seam: V[]; // the white seam: one polyline along the main cut, through P, inset from the outline
  seamP: number; // arc length of P along it
  ring: V[]; // the closed ring
  slash: V; // unit slash direction
}

const SEAM_MARGIN = 9; // seams stop this far inside the outline
const cache = new Map<BotKind, Fracture>();
export const fracture = (kind: BotKind): Fracture => {
  const hit = cache.get(kind);
  if (hit) return hit;
  const f = SPEC[kind].facets;
  const rayIdx = f.ring.map((r, i) => (r.ray ? i : -1)).filter((i) => i >= 0);
  // Each ray kinks once, halfway along the part that lies on the shell.
  const rayLine = (i: number): V[] => {
    const end = f.ring[i].p;
    const k = f.ring[i].kink ?? 0;
    if (!k) return [f.P, end];
    const d = norm(sub(end, f.P));
    const inner = Math.min(exitAt(kind, [f.P, end]), len(sub(end, f.P)));
    const mid = add(add(f.P, mul(d, inner * 0.52)), mul(v(-d.y, d.x), k));
    return [f.P, mid, end];
  };
  const lines = new Map(rayIdx.map((i) => [i, rayLine(i)]));
  const facets: Facet[] = rayIdx.map((a, k) => {
    const b = rayIdx[(k + 1) % rayIdx.length];
    const la = lines.get(a)!;
    const lb = lines.get(b)!;
    const poly = [...la.slice(0, -1)];
    for (let i = a; ; i = (i + 1) % f.ring.length) {
      poly.push(f.ring[i].p);
      if (i === b) break;
    }
    poly.push(...lb.slice(1, -1).reverse());
    const c = centroid(poly);
    return { poly, c, out: norm(sub(c, f.P)) };
  });
  const out: Fracture = {
    P: f.P,
    facets,
    rays: rayIdx.map((i) => lines.get(i)!),
    ...(() => {
      const half = (k: number) => {
        const line = lines.get(rayIdx[k])!;
        const stop = Math.min(polyLen(line), exitAt(kind, line) - SEAM_MARGIN);
        return cutAt(line, Math.max(4, stop));
      };
      const fwd = half(f.seams[0]);
      const back = half(f.seams[1]);
      return { seam: [...back.slice().reverse(), ...fwd.slice(1)], seamP: polyLen(back) };
    })(),
    ring: f.ring.map((r) => r.p),
    slash: dir(SLASH_DIR[kind]),
  };
  cache.set(kind, out);
  return out;
};

// Where each bot's damage sits (feet-relative): point the reel's lens here.
export const FACET_IMPACT: Record<BotKind, V> = {
  bubble: SPEC.bubble.facets.P,
  cube: SPEC.cube.facets.P,
  orb: SPEC.orb.facets.P,
};
