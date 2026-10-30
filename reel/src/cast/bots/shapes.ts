// The three bots' geometry, in each bot's LOCAL coordinates: origin at its
// anchor BOTS[kind] = (cx, feetY), y down (so the shapes sit at negative y).
// Every shape is a dense polygon; the drawing, the clip paths, the crack
// walker and the bounds all read the same points.

import { BOTS, type BotKind } from '../../geometry';
import type { Pt } from '../../lib/anim';
import { ellipsePts, P, quadPts, roundedPoly, superellipse, superPt } from './geom';

/* ─────────────────────────────── Bubble ─────────────────────────────── */
// A rounded speech bubble 230 × 190 with a short tail at its lower left, on two
// stubby feet. Centre x 270 (body centred 9 px right of the anchor so it and its
// tail stay inside x ≥ 160 even squashed).
const BX = 9;
const BY = -122; // body spans y −217 … −27: room under it for the feet and the tail
const BA = 115;
const BB = 95;
const BN = 3.1;

// The body's underside at x (inset by `inset` px).
const underside = (x: number, inset = 0) => P(x, BY + (BB - inset) * Math.pow(1 - Math.pow(Math.abs((x - BX) / (BA - inset)), BN), 1 / BN));
const tailA = underside(-38, 3);
const tailB = superPt(BX, BY, BA - 3, BB - 3, BN, 142);
const tailTip = P(-100, -2);

export const BUBBLE = {
  centre: P(BX, BY),
  a: BA,
  b: BB,
  body: superellipse(BX, BY, BA, BB, BN, 260),
  // The tail: from the lower-left corner down to the tip (just off the stage),
  // a concave inner edge back up to the underside, closed inside the body.
  tail: [...quadPts(tailB, P(-97, -26), tailTip, 18), ...quadPts(tailTip, P(-62, -14), tailA, 18).slice(1), P(-40, -48), P(-74, -62)],
  tailPivot: P(-60, -40),
  feet: [
    roundedPoly([P(-32, 0), P(-32, -44), P(8, -44), P(8, 0)], [9, 18, 18, 9], 8),
    roundedPoly([P(32, 0), P(32, -44), P(72, -44), P(72, 0)], [9, 18, 18, 9], 8),
  ],
  eyes: [P(BX - 31, BY - 4), P(BX + 31, BY - 4)],
  eyeRx: 13.5,
  eyeRy: 21,
  // Highlight streak: an arc just inside the upper-left contour.
  streak: (() => {
    const pts: Pt[] = [];
    for (let d = 200; d <= 240; d += 2) pts.push(superPt(BX, BY, BA - 18, BB - 16, BN, d));
    return pts;
  })(),
  shadeOffset: P(-11, -27), // body minus body shifted by this = the shadow crescent
};

/* ──────────────────────────────── Cube ──────────────────────────────── */
// A rounded cube seen slightly from above: a 200 px front face, the top face
// visible behind it, a short antenna with a ball tip (on the top face's centre), a night screen with two
// square eyes. Bottom on the stage line.
const CUBE_TOP = -238; // back edge of the top face
const CUBE_FRONT_TOP = -200;

export const CUBE = {
  silhouette: roundedPoly(
    [P(-100, 0), P(-100, CUBE_FRONT_TOP), P(-82, CUBE_TOP), P(82, CUBE_TOP), P(100, CUBE_FRONT_TOP), P(100, 0)],
    [26, 30, 20, 20, 30, 26],
    12,
  ),
  topFace: roundedPoly([P(-97, -202), P(-80.5, CUBE_TOP + 3.5), P(80.5, CUBE_TOP + 3.5), P(97, -202)], [14, 16, 16, 14], 10),
  topCentre: P(0, -219),
  screen: roundedPoly([P(-72, -48), P(-72, -170), P(72, -170), P(72, -48)], 24, 10),
  screenCentre: P(0, -109),
  eyes: [P(-31, -111), P(31, -111)],
  eyeSize: 25,
  // On the top face's centre, leaning a little left: between Diablo's eyes,
  // never under one of them.
  antennaBase: P(0, -219),
  antennaLen: 42,
  antennaTilt: -6, // degrees, top to the right (negative leans left)
  ballR: 11,
  shadeOffset: P(-13, -44),
};

/* ──────────────────────────────── Orb ───────────────────────────────── */
// A sphere 200 px across inside a thin tilted ring, hovering 20 px above the
// stage line (anchor = the sphere's bottom). One round eye.
export const ORB = {
  centre: P(0, -100),
  r: 100,
  sphere: ellipsePts(0, -100, 100, 100, 160),
  ringA: 134,
  ringB: 30,
  ringRot: -45, // major axis rising to the right
  ringW: 6, // porcelain band; plus a 2 px outline each side
  eye: P(-8, -122),
  eyeR: 27,
  streak: (() => {
    const pts: Pt[] = [];
    for (let d = 200; d <= 246; d += 2) pts.push(P(-0 + 80 * Math.cos((d * Math.PI) / 180), -100 + 80 * Math.sin((d * Math.PI) / 180)));
    return pts;
  })(),
  shadeOffset: P(-15, -30),
};

// The ring's centreline as points (ring-local angle t; front half = sin t > 0).
export const ringPt = (t: number, tiltExtra = 0): Pt => {
  const rot = ((ORB.ringRot + tiltExtra) * Math.PI) / 180;
  const u = ORB.ringA * Math.cos(t);
  const v = ORB.ringB * Math.sin(t);
  return { x: ORB.centre.x + u * Math.cos(rot) - v * Math.sin(rot), y: ORB.centre.y + u * Math.sin(rot) + v * Math.cos(rot) };
};

/* ─────────────────────────────── Shared ─────────────────────────────── */

// The crackable shell (local coordinates).
export const shellLocal = (kind: BotKind): Pt[] =>
  kind === 'bubble' ? BUBBLE.body : kind === 'cube' ? CUBE.silhouette : ORB.sphere;

export const toStage = (kind: BotKind, pts: Pt[]): Pt[] => {
  const a = BOTS[kind];
  return pts.map((p) => ({ x: p.x + a.cx, y: p.y + a.feetY }));
};

export const shellCentreLocal = (kind: BotKind): Pt =>
  kind === 'bubble' ? BUBBLE.centre : kind === 'cube' ? P(0, -112) : ORB.centre;

// Every outline point of the neutral bot (local), for bounds.
export const outlineLocal = (kind: BotKind): Pt[] => {
  if (kind === 'bubble') return [...BUBBLE.body, ...BUBBLE.tail, ...BUBBLE.feet.flat()];
  if (kind === 'cube') {
    const rad = (CUBE.antennaTilt * Math.PI) / 180;
    const tip = P(CUBE.antennaBase.x + Math.sin(rad) * CUBE.antennaLen, CUBE.antennaBase.y - Math.cos(rad) * CUBE.antennaLen);
    return [...CUBE.silhouette, ...ellipsePts(tip.x, tip.y, CUBE.ballR, CUBE.ballR, 32)];
  }
  const ring: Pt[] = [];
  for (let i = 0; i < 180; i++) ring.push(ringPt((i / 180) * Math.PI * 2));
  // The ring band is ringW + 2 × 2 px outline wide.
  const half = ORB.ringW / 2; // + the 2 px outline pad botBounds adds
  const fat = ring.flatMap((p) => [P(p.x + half, p.y), P(p.x - half, p.y), P(p.x, p.y + half), P(p.x, p.y - half)]);
  return [...ORB.sphere, ...fat];
};

// Where the cube's antenna ball sits (local).
export const antennaTip = (extraDeg = 0): Pt => {
  const rad = ((CUBE.antennaTilt + extraDeg) * Math.PI) / 180;
  return P(CUBE.antennaBase.x + Math.sin(rad) * CUBE.antennaLen, CUBE.antennaBase.y - Math.cos(rad) * CUBE.antennaLen);
};
