// Diablo's hands: two floating clawed hands, no arms, detached like his
// crescent. A maroon palm about half the head's width, its wrist cut clean at
// the reel's 9° slant; three fingers and a thumb, each a short maroon sheath
// from which a long crescent claw (thick at the root like the mark's horns)
// tapers to a needle point: cream, the last quarter gold.
//
// Geometry is computed in one place (handGeometry) and shared by the renderer,
// clawTips() and handBounds(), so the tips the shots aim with are exactly the
// needle points on screen. The palm is a rigid static shape in the hand's local
// frame (static defs); fingers and claws bend with the pose and are built as
// polygons in stage coordinates.

import React from 'react';
import { C, HATCH } from '../theme';
import { clamp, wobble, type Pt } from '../lib/anim';
import type { HandPose, HandProps } from './types';
import { ap, bbox, chain, invv, polyD, R, S, samplePath, stripD, stripHalfD, stripRimD, stripUnderD, svgM, T, type Mat, type Strip } from './diablo/geom';

/* ───────────────────────────── the shapes ───────────────────────────── */

// Hand-local frame (scale 1, px): origin at the palm centre, +y down the claws,
// +x toward the inside (the screen centre for either hand). Drawn for the left
// hand; the right hand mirrors it.
export const PALM_PATH =
  'M-40 -126' +
  'L42 -113' + // the wrist, cut clean at the reel's 9° slant
  'C52 -111 58 -105 60 -97' +
  'C66 -70 90 -40 100 -8' + // inner side flaring over the thumb's root
  'C106 12 104 30 94 40' +
  'C56 60 -58 60 -100 30' + // knuckle line
  'C-118 4 -112 -34 -84 -68' + // outer side: the heel of the hand…
  'C-66 -88 -56 -108 -52 -118' + // …narrowing to the wrist
  'C-50 -123 -46 -126 -40 -126Z';

const PALM_POLY = samplePath(PALM_PATH, 10)[0];

const N = 44; // samples along a finger + claw
const FINGER_W = 38;
const CLAW_W = 34; // at the root: thick, like the mark's horns

// Four digits. Each: knuckle, the short maroon knuckle sheath, claw length,
// fan angle at rest / with spread / curled, and the claw's bend open and
// hooked. Angles in radians from +y toward +x (the inside).
interface Digit {
  k: Pt;
  fLen: number;
  cLen: number;
  phi: number;
  phiSpread: number;
  phiCurl: number;
  turn: number;
  turnCurl: number;
  w: number; // width multiplier
}
const DIGITS: Digit[] = [
  { k: { x: -64, y: 26 }, fLen: 58, cLen: 196, phi: -0.12, phiSpread: -0.22, phiCurl: -0.08, turn: 0.6, turnCurl: 1.3, w: 0.94 },
  { k: { x: -6, y: 32 }, fLen: 62, cLen: 216, phi: 0.0, phiSpread: -0.04, phiCurl: 0.0, turn: 0.62, turnCurl: 0.95, w: 1 },
  { k: { x: 50, y: 28 }, fLen: 58, cLen: 204, phi: 0.12, phiSpread: 0.16, phiCurl: 0.08, turn: 0.64, turnCurl: 0.6, w: 0.96 },
  // The thumb: from the inner side, angled in, its claw hooking down.
  { k: { x: 78, y: -26 }, fLen: 56, cLen: 156, phi: 0.86, phiSpread: 0.14, phiCurl: -0.3, turn: -0.66, turnCurl: -1.05, w: 0.92 },
];

/* ───────────────────────────── the pose ───────────────────────────── */

type PoseIn = HandPose & Partial<Pick<HandProps, 'tremble' | 'frame'>>;

const tremor = (p: PoseIn) => {
  const amp = p.tremble ?? 0;
  if (!amp) return { dx: 0, dy: 0, dr: 0 };
  const f = p.frame ?? 0;
  const seed = p.side === 'left' ? 1 : 7;
  return { dx: wobble(f, seed, 2.1) * amp, dy: wobble(f, seed + 3, 2.4) * amp * 0.7, dr: wobble(f, seed + 5, 1.7) * amp * 0.25 };
};

// Hand-local → stage. `rot` is a plain screen rotation (clockwise positive),
// applied after mirroring, so it means the same thing for either hand.
export const handMatrix = (p: PoseIn): Mat => {
  const s = p.scale ?? 1;
  const tr = tremor(p);
  return chain(T(p.x + tr.dx, p.y + tr.dy), R((p.rot ?? 0) + tr.dr), S(p.side === 'right' ? -s : s, s));
};

interface ClawGeo {
  strip: Strip; // finger + claw outline, stage coordinates, knuckle → tip
  iCut: number; // sample index of the cuticle (finger → claw)
  iGold: number; // sample index where the gold quarter starts
  tip: Pt;
}
export interface HandGeo {
  m: Mat;
  claws: ClawGeo[]; // outer → inner
}

const dir = (phi: number): Pt => ({ x: Math.sin(phi), y: Math.cos(phi) }); // phi from +y toward +x

export const handGeometry = (p: PoseIn): HandGeo => {
  const m = handMatrix(p);
  const spread = clamp(p.spread ?? 0.5);
  const curl = clamp(p.curl ?? 0);
  const scale = Math.abs(p.scale ?? 1);
  const det = m[0] * m[3] - m[1] * m[2];
  const claws: ClawGeo[] = [];
  for (let i = 0; i < 4; i++) {
    const dg = DIGITS[i];
    const K = { x: dg.k.x * (1 - 0.06 * curl), y: dg.k.y };
    // The fan opens with the spread; a curled hand closes into a cage.
    const phiK = dg.phi + dg.phiSpread * (spread - 0.5) * 2 + dg.phiCurl * curl;
    // Curling bends the fingers forward (toward us): they foreshorten.
    const fLen = dg.fLen * (1 - 0.3 * curl);
    const cLen = dg.cLen * (1 - 0.14 * curl);
    // Claw bend: the fingers sweep toward the inside like the crescent; hooked when curled.
    const turn = dg.turn * (1 - curl) + dg.turnCurl * curl;
    const fingerTurn = 0.05 * Math.sign(dg.turn);
    const L = fLen + cLen;
    const sCut = fLen / L;
    const centre: Pt[] = [];
    let q = K;
    for (let j = 0; j <= N; j++) {
      const s = j / N;
      centre.push(q);
      const sm = s + 0.5 / N;
      const u = Math.max(0, (sm - sCut) / (1 - sCut)); // along the claw
      const phi = phiK + fingerTurn * Math.min(1, sm / sCut) + turn * Math.pow(u, 1.5);
      q = { x: q.x + dir(phi).x * (L / N), y: q.y + dir(phi).y * (L / N) };
    }
    const iCut = Math.round(sCut * N);
    const iGold = Math.round((sCut + 0.75 * (1 - sCut)) * N);
    const cs = centre.map((c) => ap(m, c));
    const A: Pt[] = [];
    const B: Pt[] = [];
    const NA: Pt[] = [];
    const NB: Pt[] = [];
    const W: number[] = [];
    // The back (convex side) of the claw carries more of the width; edge A is
    // left of travel, and mirroring the hand or bending the other way swaps it.
    const back = det > 0 === dg.turn > 0 ? 0.42 : 0.58;
    for (let j = 0; j <= N; j++) {
      const s = j / N;
      const pa = cs[Math.max(0, j - 1)];
      const pb = cs[Math.min(N, j + 1)];
      const tx = pb.x - pa.x;
      const ty = pb.y - pa.y;
      const tl = Math.hypot(tx, ty) || 1;
      const nx = ty / tl; // left of travel on screen (y down)
      const ny = -tx / tl;
      let w: number;
      if (s <= sCut) {
        w = FINGER_W - (FINGER_W - CLAW_W - 3) * (s / sCut);
      } else {
        const u = (s - sCut) / (1 - sCut);
        w = CLAW_W * Math.pow(1 - u, 0.75);
      }
      w *= scale * dg.w;
      A.push({ x: cs[j].x + nx * w * back, y: cs[j].y + ny * w * back });
      B.push({ x: cs[j].x - nx * w * (1 - back), y: cs[j].y - ny * w * (1 - back) });
      NA.push({ x: nx, y: ny });
      NB.push({ x: -nx, y: -ny });
      W.push(w);
    }
    claws.push({ strip: { a: A, b: B, na: NA, nb: NB, w: W }, iCut, iGold, tip: cs[N] });
  }
  return { m, claws };
};

// The four needle tips in stage coordinates: the three fingers outer → inner,
// then the thumb (innermost). Pass the HandProps
// (with tremble and frame) to get the trembling tips the renderer draws.
export function clawTips(p: HandPose | HandProps): Pt[] {
  return handGeometry(p).claws.map((c) => c.tip);
}

export function handBounds(p: HandPose | HandProps): { x0: number; y0: number; x1: number; y1: number } {
  const g = handGeometry(p);
  const pts: Pt[] = PALM_POLY.map((q) => ap(g.m, q));
  for (const c of g.claws) pts.push(...c.strip.a, ...c.strip.b);
  return bbox(pts);
}

/* ───────────────────────────── drawing ───────────────────────────── */

// The finger: the strip up to the cuticle, closed by a rounded arch the claw
// emerges from.
const fingerD = (c: ClawGeo) => {
  const st = c.strip;
  const k = c.iCut;
  const A = st.a.slice(0, k + 1);
  const B = st.b.slice(0, k + 1);
  const a = st.a[k];
  const b = st.b[k];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const nxt = st.a[k + 1];
  const nb = st.b[k + 1];
  const tdir = { x: (nxt.x + nb.x) / 2 - mid.x, y: (nxt.y + nb.y) / 2 - mid.y };
  const tl = Math.hypot(tdir.x, tdir.y) || 1;
  const cap = st.w[k] * 0.3;
  const arch: Pt[] = [];
  for (let j = 1; j < 8; j++) {
    const th = (j / 8) * Math.PI;
    arch.push({
      x: mid.x + (a.x - mid.x) * Math.cos(th) + (tdir.x / tl) * cap * Math.sin(th),
      y: mid.y + (a.y - mid.y) * Math.cos(th) + (tdir.y / tl) * cap * Math.sin(th),
    });
  }
  return polyD([...A, ...arch, ...B.reverse()]);
};

const HandDefs: React.FC<{ id: string; mirror: boolean }> = ({ id, mirror }) => (
  <defs>
    <clipPath id={`${id}-palm`}>
      <path d={PALM_PATH} />
    </clipPath>
    {/* Hatching in the hand's local frame; the mirrored hand mirrors the lean back. */}
    <pattern id={`${id}-hatch`} patternUnits="userSpaceOnUse" width={HATCH.gap} height={HATCH.gap} patternTransform={`rotate(${mirror ? -HATCH.angle : HATCH.angle})`}>
      <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={C.cream} strokeWidth={HATCH.width} />
    </pattern>
    {/* Claw shading lives in stage coordinates: maroon engraving on ivory. */}
    <pattern id={`${id}-claw-hatch`} patternUnits="userSpaceOnUse" width={HATCH.gap} height={HATCH.gap} patternTransform={`rotate(${HATCH.angle})`}>
      <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={C.maroon} strokeWidth={HATCH.width} />
    </pattern>
    {[
      ['shade', 62],
      ['under', 30],
      ['lip', 3.5],
    ].map(([name, k]) => (
      <mask key={name} id={`${id}-${name}`} maskUnits="userSpaceOnUse" x={-200} y={-250} width={400} height={400}>
        <path d={PALM_PATH} fill="#fff" />
        <path d={PALM_PATH} fill="#000" transform={`translate(0 ${-(k as number)})`} />
      </mask>
    ))}
  </defs>
);

const Claw: React.FC<{ c: ClawGeo; id: string; ember: number; warm: number }> = ({ c, id, ember, warm }) => {
  const st = c.strip;
  const from = Math.max(0, c.iCut - 2);
  // Shade the half of the claw that faces down, away from the key light.
  let da = 0;
  let db = 0;
  for (let j = c.iCut; j < c.iGold; j++) {
    da += st.na[j].y;
    db += st.nb[j].y;
  }
  const shadeSide = da > db ? 'a' : 'b';
  return (
    <g>
      <path d={stripD(st, from)} fill={C.cream} />
      <path d={stripD(st, c.iGold)} fill={C.gold} />
      <path d={stripHalfD(st, shadeSide, 0.55, c.iCut, N - 3)} fill={`url(#${id}-claw-hatch)`} opacity={0.5} />
      {ember > 0 ? (
        <>
          <path d={stripD(st, from)} fill={C.ember} opacity={0.12 * ember} />
          <path d={stripUnderD(st, 3.5, 0.45, from)} fill={C.ember} opacity={0.9 * ember} />
        </>
      ) : null}
      {warm > 0 ? (
        <>
          <path d={stripD(st, from)} fill={C.gold} opacity={0.1 * warm} />
          <path d={stripUnderD(st, 3.5, 0.45, from)} fill={C.gold} opacity={0.85 * warm} />
        </>
      ) : null}
      <path d={stripRimD(st, 3, 0.45, from)} fill={C.cream} />
    </g>
  );
};

const Finger: React.FC<{ c: ClawGeo; ember: number; warm: number }> = ({ c, ember, warm }) => (
  <g>
    <path d={fingerD(c)} fill={C.maroon} />
    {ember > 0 ? <path d={stripUnderD(c.strip, 3.5, 0.3, 0, c.iCut)} fill={C.ember} opacity={0.85 * ember} /> : null}
    {warm > 0 ? <path d={stripUnderD(c.strip, 3.5, 0.3, 0, c.iCut)} fill={C.gold} opacity={0.75 * warm} /> : null}
    <path d={stripRimD(c.strip, 3, 0.3, 0, c.iCut)} fill={C.cream} />
  </g>
);

export const Hand: React.FC<HandProps> = (p) => {
  const g = handGeometry(p);
  const id = `dhand-${p.side}`;
  const ember = clamp(p.ember ?? 0);
  const warm = clamp(p.warm ?? 0);
  if (p.silhouette) {
    return (
      <g fill={C.night}>
        {g.claws.map((c, i) => (
          <path key={i} d={stripD(c.strip)} />
        ))}
        <path transform={svgM(g.m)} d={PALM_PATH} />
      </g>
    );
  }
  const rim = invv(g.m, { x: 0, y: 3 });
  const ko = 2.5 * 2; // a 2.5 px night keyline outside, so a hand reads over the head
  return (
    <g>
      <HandDefs id={id} mirror={p.side === 'right'} />
      <g fill={C.night} stroke={C.night} strokeWidth={ko} strokeLinejoin="round">
        {g.claws.map((c, i) => (
          <path key={i} d={stripD(c.strip)} />
        ))}
        <path transform={svgM(g.m)} d={PALM_PATH} strokeWidth={ko / Math.abs(p.scale ?? 1)} />
      </g>
      {g.claws.map((c, i) => (
        <Claw key={i} c={c} id={id} ember={ember} warm={warm} />
      ))}
      {g.claws.map((c, i) => (
        <Finger key={i} c={c} ember={ember} warm={warm} />
      ))}
      <g transform={svgM(g.m)}>
        <path d={PALM_PATH} fill={C.cream} />
        <g clipPath={`url(#${id}-palm)`}>
          <path d={PALM_PATH} fill={C.maroon} transform={`translate(${rim.x} ${rim.y})`} />
          <rect x={-200} y={-250} width={400} height={400} fill={`url(#${id}-hatch)`} opacity={0.18} mask={`url(#${id}-shade)`} />
          {ember > 0 ? (
            <>
              <rect x={-200} y={-250} width={400} height={400} fill={C.ember} opacity={0.2 * ember} mask={`url(#${id}-under)`} />
              <rect x={-200} y={-250} width={400} height={400} fill={C.ember} opacity={0.85 * ember} mask={`url(#${id}-lip)`} />
            </>
          ) : null}
          {warm > 0 ? (
            <>
              <rect x={-200} y={-250} width={400} height={400} fill={C.gold} opacity={0.14 * warm} mask={`url(#${id}-under)`} />
              <rect x={-200} y={-250} width={400} height={400} fill={C.gold} opacity={0.75 * warm} mask={`url(#${id}-lip)`} />
            </>
          ) : null}
        </g>
      </g>
    </g>
  );
};
