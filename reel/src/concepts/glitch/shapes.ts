// The three bots' geometry, feet at (0, 0), y negative up the screen.
// Each bot is a few bold flat shapes: a shell, small parts tucked behind it
// (feet, fins, the antenna stem), one shade crescent and a white shine. The bug
// line is the slash's mark: one zig-zag across clear shell, along SLASH_DIR,
// clear of the face.

import { SLASH_DIR, type BotKind } from '../_kit/types';
import { P, PAL, add, circleD, dirOf, dot, ellipseD, mixPt, mul, perp, polyAt, ptsD, rrectD, sub, superD, superPt, type Pt } from './kit';

/** A flat part. `line` draws it as a stroke of that width; `rot` turns it about `at`. */
export interface Part {
  d: string;
  fill: string;
  line?: number;
  rot?: number;
  at?: Pt;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}
export interface FaceSpec {
  screen: Box | null; // the cube: a night screen with cream eyes
  eyes: [Pt, Pt];
  rx: number;
  ry: number;
  mouth: Pt;
  mouthW: number;
  cheeks: [Pt, Pt];
}
export interface Motion {
  frame: number;
  flap: number; // fins, degrees
  wobble: number; // antenna, degrees
}
export interface Shape {
  kind: BotKind;
  body: string; // the shell (with the bubble's tail)
  inside: (p: Pt) => boolean; // inside the shell proper (where the bug line may run)
  centre: Pt;
  shadeShift: Pt; // the shell drawn shifted by this over the shade = the shade crescent
  shine: string;
  shineDot: Pt;
  back: (m: Motion) => Part[]; // tucked behind the shell
  over: (m: Motion) => Part[]; // in front of it
  face: FaceSpec;
  shadowRx: number;
  cut: { through: Pt; teeth: number; amp: number };
}

const cubicPts = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, n = 14): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = (1 - t) ** 3;
    const b = 3 * (1 - t) ** 2 * t;
    const c = 3 * (1 - t) * t * t;
    const d = t ** 3;
    return P(a * p0.x + b * c1.x + c * c2.x + d * p1.x, a * p0.y + b * c1.y + c * c2.y + d * p1.y);
  });

/* ───────────────────────── Bubble: the chat buddy ───────────────────────── */
// A wide rounded speech bubble with its tail sweeping out at the lower left, on
// two stubby feet.
const BB = { cx: 0, cy: -120, a: 112, b: 88, n: 3 };
const bubbleOutline = (() => {
  const TA = 150; // the tail leaves the left side here...
  const TB = 116; // ...and comes back on the underside here
  const tip = P(-112, -14);
  const pts: Pt[] = [];
  // the shell, the long way round from TA over the top to TB
  for (let d = TA; d <= TB + 360; d += 2) pts.push(superPt(BB.cx, BB.cy, BB.a, BB.b, BB.n, d));
  const a = superPt(BB.cx, BB.cy, BB.a, BB.b, BB.n, TB);
  const b = superPt(BB.cx, BB.cy, BB.a, BB.b, BB.n, TA);
  // the tail: out along a concave inner edge to the tip, back up the outer edge
  pts.push(...cubicPts(a, P(a.x - 14, a.y + 8), P(tip.x + 22, tip.y - 2), tip).slice(1));
  pts.push(...cubicPts(tip, P(tip.x + 4, tip.y - 18), P(b.x - 2, b.y + 14), b).slice(1));
  return ptsD(pts, true);
})();
const bubble: Shape = {
  kind: 'bubble',
  body: bubbleOutline,
  inside: (p) => Math.pow(Math.abs((p.x - BB.cx) / BB.a), BB.n) + Math.pow(Math.abs((p.y - BB.cy) / BB.b), BB.n) <= 1,
  centre: P(BB.cx, BB.cy),
  shadeShift: P(-9, -13),
  shine: superD(BB.cx, BB.cy, BB.a - 18, BB.b - 17, BB.n, 197, 236, 2),
  shineDot: superPt(BB.cx, BB.cy, BB.a - 18, BB.b - 17, BB.n, 251),
  back: () => [
    { d: rrectD(-58, -44, -20, 0, 17), fill: PAL.deep },
    { d: rrectD(20, -44, 58, 0, 17), fill: PAL.deep },
  ],
  over: () => [],
  face: { screen: null, eyes: [P(-35, -97), P(35, -97)], rx: 15.5, ry: 21, mouth: P(0, -63), mouthW: 26, cheeks: [P(-67, -70), P(67, -70)] },
  shadowRx: 96,
  cut: { through: P(0, -160), teeth: 3, amp: 9 },
};

/* ───────────────────── Cube: the robot with a screen face ───────────────────── */
const CB = { x0: -94, x1: 94, y0: -208, y1: -28, r: 34 };
const inRRect = (p: Pt, x0: number, y0: number, x1: number, y1: number, r: number) => {
  if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return false;
  const qx = Math.max(x0 + r - p.x, 0, p.x - (x1 - r));
  const qy = Math.max(y0 + r - p.y, 0, p.y - (y1 - r));
  return qx * qx + qy * qy <= r * r;
};
const ANT = P(0, -206);
const cube: Shape = {
  kind: 'cube',
  body: rrectD(CB.x0, CB.y0, CB.x1, CB.y1, CB.r),
  inside: (p) => inRRect(p, CB.x0, CB.y0, CB.x1, CB.y1, CB.r),
  centre: P(0, (CB.y0 + CB.y1) / 2),
  shadeShift: P(-10, -12),
  shine: `M-80 -134L-80 -172A20 20 0 0 1 -60 -192`,
  shineDot: P(-80, -118),
  back: (m) => [
    { d: rrectD(-60, -42, -22, 0, 17), fill: PAL.deep },
    { d: rrectD(22, -42, 60, 0, 17), fill: PAL.deep },
    { d: `M0 -200L0 -222`, fill: PAL.deep, line: 8, rot: m.wobble, at: ANT },
  ],
  over: (m) => [{ d: circleD(0, -228, 9.5), fill: PAL.ember, rot: m.wobble, at: ANT }],
  face: { screen: { x0: -66, y0: -180, x1: 66, y1: -84, r: 24 }, eyes: [P(-27, -144), P(27, -144)], rx: 11, ry: 16, mouth: P(0, -112), mouthW: 26, cheeks: [P(-49, -118), P(49, -118)] },
  shadowRx: 100,
  cut: { through: P(-40, -96), teeth: 3, amp: 9 },
};

/* ───────────────────────── Orb: the hovering sphere ───────────────────────── */
const OB = { cx: 0, cy: -140, r: 88 };
// A small swept fin growing out of the shell at root r, pointing out to `side`.
const fin = (side: number, r: Pt) => {
  const q = (x: number, y: number) => `${r.x + side * x} ${r.y + y}`;
  return `M${q(-6, -16)}C${q(12, -20)} ${q(26, -10)} ${q(30, 12)}C${q(18, 10)} ${q(6, 14)} ${q(-6, 16)}Z`;
};
const FIN_L = P(-84, -128);
const FIN_R = P(84, -128);
const orb: Shape = {
  kind: 'orb',
  body: circleD(OB.cx, OB.cy, OB.r),
  inside: (p) => Math.hypot(p.x - OB.cx, p.y - OB.cy) <= OB.r,
  centre: P(OB.cx, OB.cy),
  shadeShift: P(-11, -13),
  shine: (() => {
    const R = OB.r - 18;
    const a = (d: number) => P(OB.cx + R * Math.cos((d * Math.PI) / 180), OB.cy + R * Math.sin((d * Math.PI) / 180));
    const p0 = a(197);
    const p1 = a(237);
    return `M${p0.x} ${p0.y}A${R} ${R} 0 0 1 ${p1.x} ${p1.y}`;
  })(),
  shineDot: P(OB.cx + (OB.r - 18) * Math.cos((251 * Math.PI) / 180), OB.cy + (OB.r - 18) * Math.sin((251 * Math.PI) / 180)),
  back: (m) => [
    { d: fin(-1, FIN_L), fill: PAL.deep, rot: m.flap, at: FIN_L },
    { d: fin(1, FIN_R), fill: PAL.deep, rot: -m.flap, at: FIN_R },
    { d: ellipseD(0, -54, 25, 12), fill: PAL.deep },
  ],
  over: () => [],
  face: { screen: null, eyes: [P(-31, -122), P(31, -122)], rx: 16, ry: 19.5, mouth: P(0, -90), mouthW: 24, cheeks: [P(-61, -98), P(61, -98)] },
  shadowRx: 78,
  cut: { through: P(0, -193), teeth: 3, amp: 9 },
};

export const SHAPES: Record<BotKind, Shape> = { bubble, cube, orb };

/* ───────────────────────── The bug line ───────────────────────── */
export interface Bug {
  base: Pt[]; // the straight spine's stations (the ends stop just inside the outline)
  offs: number[]; // each station's zig-zag offset along n
  a: Pt;
  b: Pt;
  u: Pt; // the slash's direction of travel
  n: Pt; // the side away from the face (the pixels drift off this way)
}
const INSET = 12;
const makeBug = (s: Shape): Bug => {
  const u = dirOf(SLASH_DIR[s.kind]);
  const c = s.cut.through;
  const march = (sign: number) => {
    let p = c;
    for (let i = 0; i < 1600; i++) {
      const q = add(p, mul(u, sign * 0.25));
      if (!s.inside(q)) return p;
      p = q;
    }
    return p;
  };
  // stop short of the outline: a mark on the shell, never a bar through it
  const a = add(march(-1), mul(u, INSET));
  const b = add(march(1), mul(u, -INSET));
  const faceMid = mixPt(s.face.eyes[0], s.face.eyes[1], 0.5);
  let n = perp(u);
  if (dot(n, sub(c, faceMid)) < 0) n = mul(n, -1);
  const m = s.cut.teeth * 2;
  const base: Pt[] = [];
  const offs: number[] = [];
  for (let k = 0; k <= m; k++) {
    base.push(mixPt(a, b, k / m));
    offs.push(k === 0 || k === m ? 0 : (k % 2 ? 1 : -1) * s.cut.amp);
  }
  return { base, offs, a, b, u, n };
};
export const BUGS: Record<BotKind, Bug> = { bubble: makeBug(bubble), cube: makeBug(cube), orb: makeBug(orb) };

export const boxD = (b: Box) => rrectD(b.x0, b.y0, b.x1, b.y1, b.r);

/** The zig-zag's points (teeth scaled by k), from end to end. */
export const zigzag = (bug: Bug, k = 1): Pt[] => bug.base.map((p, i) => add(p, mul(bug.n, bug.offs[i] * k)));

/** The glitched rows: short horizontal strips across the line that jump sideways,
 *  one where the slash came in, one mid-way, one where it left (u along the line). */
export interface Strip {
  u: number;
  c: Pt;
  w: number;
  h: number;
  dx: number; // full sideways jump (px); the ends jump outwards, past the outline
}
export const stripsFor = (s: Shape, bug: Bug): Strip[] => {
  const core = zigzag(bug);
  const out = (p: Pt) => (p.x < s.centre.x ? -1 : 1);
  return [
    { u: 0.05, w: 62, h: 13, dx: 8 * out(bug.a) },
    { u: 0.5, w: 56, h: 10, dx: -6 * out(bug.a) },
    { u: 0.95, w: 62, h: 13, dx: 8 * out(bug.b) },
  ].map((r) => ({ ...r, c: polyAt(core, r.u) }));
};
