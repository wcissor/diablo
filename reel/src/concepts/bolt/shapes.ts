// The three sticker bots, drawn with the feet at (0, 0) inside BOT_BOX
// (x −120…120, y −250…0, sticker border included), and each one's bolt.

import { SLASH_DIR, type BotKind } from '../_kit/types';
import { add, dirDeg, mkLine, mul, perp, rrect, roundPoly, v2, type Line, type V } from './geom';

export const OUT = 10; // the sticker outline (px, centred on the silhouette)
export const INNER = 5.5; // inner lines
export const BORDER = 9; // the white die-cut border beyond the outline (dark stages)

export interface BoltSpec {
  start: V; // just outside the shell, where the slash bites in
  dir: number; // degrees (SLASH_DIR)
  L: number; // length along dir
  zig: [number, number][]; // (along, across) in units of L
  w: number; // full width at the mouth
  hand: 1 | -1; // which way the strokes lean (steeper reads more like lightning)
}

export interface Geo {
  body: string; // the shell silhouette: clip, fill and outline
  pivot: V; // squash / tilt pivot
  shadow: { cx: number; rx: number; ry: number };
  eyes: V[];
  eye: { rx: number; ry: number; pupil: number };
  mouth: V;
  mouthW: number;
  cheeks: V[];
  bolt: BoltSpec;
}

// One lightning bolt: a long stroke, a sharp step back, a long stroke to the point.
const ZAP: [number, number][] = [
  [0, 0.12],
  [0.53, -0.05],
  [0.47, 0.09],
  [1, -0.1],
];

/* ───────── Bubble: a chat balloon on two stubby feet, tail kicked out left ───────── */
const BUBBLE_BODY =
  'M-36 -216H36C70.2 -216 98 -188.2 98 -154V-96C98 -61.8 70.2 -34 36 -34H-22' +
  'Q-52 -30 -100 -41Q-86 -60 -98 -98V-154C-98 -188.2 -70.2 -216 -36 -216Z';

export const BUBBLE = {
  feet: [rrect(-40, -52, -2, -OUT / 2, 15), rrect(18, -52, 56, -OUT / 2, 15)],
  geo: {
    body: BUBBLE_BODY,
    pivot: v2(0, 0),
    shadow: { cx: 4, rx: 102, ry: 10 },
    eyes: [v2(-34, -103), v2(34, -103)],
    eye: { rx: 21, ry: 25, pupil: 16.5 },
    mouth: v2(0, -62),
    mouthW: 34,
    cheeks: [v2(-66, -72), v2(66, -72)],
    bolt: { start: v2(-104, -195), dir: SLASH_DIR.bubble, L: 100, zig: ZAP, w: 30, hand: -1 },
  } as Geo,
};

/* ───────── Cube: a 2.5D box robot, screen face, LED antenna ───────── */
const CX0 = -84;
const CX1 = 60;
const CY0 = -196;
const CY1 = -32;
const DX = 20;
const DY = -15;
export const CUBE = {
  front: rrect(CX0, CY0, CX1, CY1, 16),
  top: `M${CX0 - 4} ${CY0}L${CX1} ${CY0}L${CX1 + DX} ${CY0 + DY}L${CX0 + DX - 4} ${CY0 + DY - 4}Z`,
  edge: [v2(CX1, CY0), v2(CX1 + DX, CY0 + DY)] as [V, V],
  screen: rrect(-68, -184, 44, -120, 15),
  screenBox: { x0: -68, y0: -184, x1: 44, y1: -120 },
  antenna: { base: v2(-2, CY0 + DY / 2 - 1), tip: v2(-2, -219), r: 8.5 },
  feet: [rrect(-64, -48, -24, -OUT / 2, 15), rrect(4, -48, 44, -OUT / 2, 15)],
  geo: {
    body: roundPoly(
      [v2(CX0, CY1), v2(CX1, CY1), v2(CX1 + DX, CY1 + DY), v2(CX1 + DX, CY0 + DY), v2(CX0 + DX, CY0 + DY), v2(CX0, CY0)],
      [16, 12, 12, 14, 12, 14],
    ),
    pivot: v2(0, 0),
    shadow: { cx: 0, rx: 100, ry: 10 },
    eyes: [v2(-38, -156), v2(14, -156)],
    eye: { rx: 10.5, ry: 15.5, pupil: 0 },
    mouth: v2(-12, -135),
    mouthW: 30,
    cheeks: [],
    bolt: { start: v2(88, -28), dir: SLASH_DIR.cube, L: 112, zig: ZAP, w: 30, hand: 1 },
  } as Geo,
};

/* ───────── Orb: a hovering sphere, one big eye, two ear pods ───────── */
export const ORB_C = v2(0, -132);
export const ORB_R = 88;
export const ORB = {
  pods: [rrect(-102, -158, -79, -106, 11), rrect(79, -158, 102, -106, 11)],
  geo: {
    body: `M${ORB_C.x - ORB_R} ${ORB_C.y}a${ORB_R} ${ORB_R} 0 1 0 ${2 * ORB_R} 0a${ORB_R} ${ORB_R} 0 1 0 ${-2 * ORB_R} 0Z`,
    pivot: ORB_C,
    shadow: { cx: 0, rx: 72, ry: 9 },
    eyes: [v2(0, -114)],
    eye: { rx: 33, ry: 33, pupil: 21 },
    mouth: v2(0, -64),
    mouthW: 32,
    cheeks: [v2(-52, -76), v2(52, -76)],
    bolt: { start: v2(48, -219), dir: SLASH_DIR.orb, L: 118, zig: ZAP, w: 30, hand: 1 },
  } as Geo,
};

export const GEO: Record<BotKind, Geo> = { bubble: BUBBLE.geo, cube: CUBE.geo, orb: ORB.geo };

// Rough inside tests for each shell (enough to find where the bolt bites in).
const inRoundRect = (p: V, x0: number, y0: number, x1: number, y1: number, r: number) => {
  const cx = Math.max(x0 + r, Math.min(x1 - r, p.x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, p.y));
  return (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
};
const inConvex = (p: V, poly: V[]) =>
  poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
  });
export const insideShell: Record<BotKind, (p: V) => boolean> = {
  bubble: (p) => inRoundRect(p, -98, -216, 98, -34, 62),
  cube: (p) =>
    inConvex(p, [v2(CX0, CY0), v2(CX0 + DX, CY0 + DY), v2(CX1 + DX, CY0 + DY), v2(CX1 + DX, CY1 + DY), v2(CX1, CY1), v2(CX0, CY1)]),
  orb: (p) => (p.x - ORB_C.x) ** 2 + (p.y - ORB_C.y) ** 2 <= ORB_R * ORB_R,
};

// The bolt's centreline in bot space.
export const boltLine = (b: BoltSpec): Line => {
  const d = dirDeg(b.dir);
  const n = perp(d);
  return mkLine(b.zig.map(([u, w]) => add(b.start, add(mul(d, u * b.L), mul(n, b.hand * w * b.L)))));
};
