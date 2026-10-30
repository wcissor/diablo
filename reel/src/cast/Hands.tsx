// Diablo's hands: two floating clawed hands, no arms, detached like his
// crescent. Seen from the back: a maroon palm about half the head's width, its
// wrist cut clean at the reel's 9° slant, with three fingers and a thumb lying
// on it, each rooted in a rounded knuckle (its cream rim a knuckle highlight)
// and sheathing a long crescent claw (thick at the root like the mark's horns)
// that tapers to a needle point: cream, the last quarter gold. Each sheath ends
// in a slanted cut that runs further down the claw's convex back.
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
import { ap, bbox, chain, invv, polyD, R, S, samplePath, smoothD, stripD, stripEdgeBandD, stripHalfD, stripRimD, stripUnderD, svgM, T, unrotate, type Mat, type Strip } from './diablo/geom';

/* ───────────────────────────── the shapes ───────────────────────────── */

// Hand-local frame (scale 1, px): origin at the palm centre, +y down the claws,
// +x toward the inside (the screen centre for either hand). Drawn for the left
// hand; the right hand mirrors it.
// The back of the hand: a soft, rounded shape with no corners anywhere. Its
// wrist is a gentle convex arc whose chord leans at the reel's 9° slant; it
// rounds into the sides, swelling over the thumb's root on the inside and into
// a heel on the outside, and closes in a soft lower edge. The fingers lie ON
// it (drawn over it from knuckles inside its lower half), so its lower edge
// only shows as webbing between them. One smooth closed curve through these
// points (Catmull-Rom, so the curvature is continuous all the way round).
const PALM_PTS: Pt[] = [
  { x: -40, y: -127 }, // the wrist: its chord falls 9° to the right …
  { x: 4, y: -123.5 },
  { x: 48, y: -113 }, // … to here
  { x: 74, y: -96 },
  { x: 88, y: -66 },
  { x: 100, y: -30 },
  { x: 104, y: 0 }, // over the thumb's root
  { x: 96, y: 26 },
  { x: 72, y: 45 },
  { x: 8, y: 55 }, // the lower edge (webbing between the fingers)
  { x: -58, y: 48 },
  { x: -96, y: 24 },
  { x: -110, y: -10 }, // the heel
  { x: -104, y: -50 },
  { x: -86, y: -90 },
  { x: -66, y: -117 },
];
export const PALM_PATH = smoothD(PALM_PTS);

const PALM_POLY = samplePath(PALM_PATH, 10)[0];

const N = 44; // samples along a finger + claw
const FINGER_W = 36;
const CLAW_W = 34; // at the root: thick, like the mark's horns

// Four digits. Each: knuckle, the short maroon knuckle sheath, claw length,
// fan angle at rest / with spread / curled, and the claw's bend open and
// hooked. Angles in radians from +y toward +x (the inside).
interface Digit {
  k: Pt;
  fLen: number;
  cLen: number;
  phi: number;
  phiSpread: number; // fan per unit of (spread − 0.5)·2
  phiSpreadOpen?: number; // … used instead above spread 0.5, if set
  phiCurl: number;
  turn: number;
  turnCurl: number;
  w: number; // width multiplier
  kCurl?: Pt; // knuckle offset at full curl
  fShrink?: number; // foreshortening of the finger at full curl (default 0.3)
  cShrink?: number; // … and of the claw (default 0.14)
  cShrinkHi?: number; // extra claw foreshortening ∝ curl³ (only near a full strike curl)
  // Tucked (another claw is pointing): the finger folds toward us and its claw
  // hooks round tight in its own bend direction, so the tip turns back up
  // toward the wrist, close under the palm. Fan angle, total claw bend and the
  // foreshortened finger / claw lengths at point = 1.
  tuck: { phi: number; turn: number; f: number; c: number; k?: Pt };
}
const DIGITS: Digit[] = [
  // (the outer claw fans out less past spread 0.5, keeping a spread hand off the right rail)
  { k: { x: -60, y: 2 }, fLen: 82, cLen: 196, phi: -0.12, phiSpread: -0.22, phiSpreadOpen: -0.15, phiCurl: 0, turn: 0.6, turnCurl: 1.3, w: 0.94, fShrink: 0.21, tuck: { phi: -0.3, turn: 2.8, f: 0.4, c: 0.36 } },
  // (the longest claw foreshortens a little more near a full curl, so the four tips land level)
  { k: { x: -6, y: 8 }, fLen: 86, cLen: 216, phi: 0.0, phiSpread: -0.04, phiCurl: 0.0, turn: 0.62, turnCurl: 0.95, w: 1, fShrink: 0.21, cShrinkHi: 0.1, tuck: { phi: 0.04, turn: 2.8, f: 0.4, c: 0.36 } },
  { k: { x: 50, y: 4 }, fLen: 82, cLen: 204, phi: 0.12, phiSpread: 0.16, phiCurl: 0.08, turn: 0.64, turnCurl: 0.6, w: 0.96, fShrink: 0.21, tuck: { phi: 0.3, turn: 2.8, f: 0.4, c: 0.36 } },
  // The thumb: from the inner side, angled in, its claw hooking back toward the
  // fingers. Curling tucks its root down the palm and lets the claw reach out a
  // touch, so at strike curl (0.8–1) its tip lands on the same shallow arc as
  // the three finger tips, just inside the inner one.
  {
    k: { x: 78, y: -26 },
    fLen: 56,
    cLen: 200,
    phi: 0.86,
    phiSpread: 0.14,
    phiCurl: -0.2,
    turn: -0.66,
    turnCurl: -0.55,
    w: 0.92,
    kCurl: { x: -6, y: 20 },
    fShrink: 0.2,
    cShrink: -0.05,
    tuck: { phi: 1.1, turn: -2.8, f: 0.45, c: 0.38, k: { x: -4, y: -12 } },
  },
];

// Pointing (point = 1): the lead claw straightens toward the hand's axis and
// keeps only a little of its crescent bend, so one needle tip leads.
const POINT = { phi: 0.3, turn: 0.45 };

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
  backA: boolean; // edge A is the claw's convex back
}
export interface HandGeo {
  m: Mat;
  claws: ClawGeo[]; // outer → inner
}

const dir = (phi: number): Pt => ({ x: Math.sin(phi), y: Math.cos(phi) }); // phi from +y toward +x

// Which claw points (an index into clawTips() order).
export const pointIndex = (p: Pick<HandPose, 'pointClaw'>) => Math.max(0, Math.min(3, Math.round(p.pointClaw ?? 1)));

export const handGeometry = (p: PoseIn): HandGeo => {
  const m = handMatrix(p);
  const spread = clamp(p.spread ?? 0.5);
  const curl = clamp(p.curl ?? 0);
  const point = clamp(p.point ?? 0);
  const lead = pointIndex(p);
  const scale = Math.abs(p.scale ?? 1);
  const det = m[0] * m[3] - m[1] * m[2];
  const claws: ClawGeo[] = [];
  for (let i = 0; i < 4; i++) {
    const dg = DIGITS[i];
    let K = { x: dg.k.x * (1 - 0.06 * curl) + (dg.kCurl?.x ?? 0) * curl, y: dg.k.y + (dg.kCurl?.y ?? 0) * curl };
    // The fan opens with the spread; a curled hand closes into a cage.
    const fan = spread > 0.5 ? dg.phiSpreadOpen ?? dg.phiSpread : dg.phiSpread;
    let phiK = dg.phi + fan * (spread - 0.5) * 2 + dg.phiCurl * curl;
    // Curling bends the fingers forward (toward us): they foreshorten.
    let fLen = dg.fLen * (1 - (dg.fShrink ?? 0.3) * curl);
    let cLen = dg.cLen * (1 - (dg.cShrink ?? 0.14) * curl - (dg.cShrinkHi ?? 0) * curl * curl * curl);
    // Claw bend: the fingers sweep toward the inside like the crescent; hooked when curled.
    let turn = dg.turn * (1 - curl) + dg.turnCurl * curl;
    let bendExp = 1.5; // how the bend gathers toward the tip (1 = an even hook)
    if (point > 0) {
      // Pointing: blend from the pose toward a fixed shape (at point = 1 it no
      // longer depends on spread or curl, so the lead tip is predictable).
      const mixv = (a: number, b: number) => a + (b - a) * point;
      if (i === lead) {
        K = { x: mixv(K.x, dg.k.x), y: mixv(K.y, dg.k.y) };
        phiK = mixv(phiK, dg.phi * POINT.phi);
        fLen = mixv(fLen, dg.fLen);
        cLen = mixv(cLen, dg.cLen);
        turn = mixv(turn, dg.turn * POINT.turn);
      } else {
        const tk = dg.tuck;
        K = { x: mixv(K.x, dg.k.x + (tk.k?.x ?? 0)), y: mixv(K.y, dg.k.y + (tk.k?.y ?? 0)) };
        phiK = mixv(phiK, tk.phi);
        fLen = mixv(fLen, dg.fLen * tk.f);
        cLen = mixv(cLen, dg.cLen * tk.c);
        turn = mixv(turn, tk.turn);
        bendExp = mixv(1.5, 1);
      }
    }
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
      const phi = phiK + fingerTurn * Math.min(1, sm / sCut) + turn * Math.pow(u, bendExp);
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
    // Which edge is the claw's convex back: the side its middle bows out to.
    const iMid = Math.round((iCut + N) / 2);
    const chordMid = { x: (cs[iCut].x + cs[N].x) / 2, y: (cs[iCut].y + cs[N].y) / 2 };
    const bow = (cs[iMid].x - chordMid.x) * NA[iMid].x + (cs[iMid].y - chordMid.y) * NA[iMid].y;
    claws.push({ strip: { a: A, b: B, na: NA, nb: NB, w: W }, iCut, iGold, tip: cs[N], backA: bow > 0 });
  }
  return { m, claws };
};

// The four needle tips in stage coordinates: the three fingers outer → inner,
// then the thumb (innermost). Pass the HandProps
// (with tremble and frame) to get the trembling tips the renderer draws.
export function clawTips(p: HandPose | HandProps): Pt[] {
  return handGeometry(p).claws.map((c) => c.tip);
}

// The pointing claw's needle tip (pointClaw, default the middle finger) in
// stage coordinates: exactly the tip drawn, for any point value (pass the
// HandProps with tremble and frame to get the trembling tip).
export function leadTip(p: HandPose | HandProps): Pt {
  return handGeometry(p).claws[pointIndex(p)].tip;
}

export function handBounds(p: HandPose | HandProps): { x0: number; y0: number; x1: number; y1: number } {
  const g = handGeometry(p);
  const pts: Pt[] = PALM_POLY.map((q) => ap(g.m, q));
  for (const c of g.claws) pts.push(...c.strip.a, ...c.strip.b);
  return bbox(pts);
}

/* ───────────────────────────── drawing ───────────────────────────── */

// The finger sheath: the strip up to the cuticle, ending in a clean slanted
// cut (the wrist's language) that runs further down the claw's convex back,
// like the skin over a raptor's claw, and curves in a little, crescent-like.
const SHEATH_RUN = 4; // samples the sheath runs on down the claw's back
const sheathEnds = (c: ClawGeo) => ({
  ka: c.backA ? c.iCut + SHEATH_RUN : c.iCut - 1,
  kb: c.backA ? c.iCut - 1 : c.iCut + SHEATH_RUN,
});
const fingerD = (c: ClawGeo) => {
  const st = c.strip;
  const { ka, kb } = sheathEnds(c);
  const a = st.a[ka];
  const b = st.b[kb];
  // The cut bows back toward the knuckle by a fifth of its length.
  const k = c.iCut;
  const back = { x: st.a[k - 2].x + st.b[k - 2].x - st.a[k].x - st.b[k].x, y: st.a[k - 2].y + st.b[k - 2].y - st.a[k].y - st.b[k].y };
  const bl = Math.hypot(back.x, back.y) || 1;
  const sag = Math.hypot(b.x - a.x, b.y - a.y) * 0.2;
  const ctrl = { x: (a.x + b.x) / 2 + (back.x / bl) * sag, y: (a.y + b.y) / 2 + (back.y / bl) * sag };
  const cut: Pt[] = [];
  for (let j = 1; j < 6; j++) {
    const t = j / 6;
    cut.push({
      x: (1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * ctrl.x + t * t * b.x,
      y: (1 - t) * (1 - t) * a.y + 2 * t * (1 - t) * ctrl.y + t * t * b.y,
    });
  }
  return polyD([...st.a.slice(0, ka + 1), ...cut, ...st.b.slice(0, kb + 1).reverse(), ...knuckle(c).pts]);
};

// The rounded knuckle that closes the finger at its root (from edge B round
// the back to edge A), with its outward normals for the rim.
const knuckle = (c: ClawGeo) => {
  const st = c.strip;
  const a = st.a[0];
  const b = st.b[0];
  const ctr = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const r = Math.hypot(a.x - b.x, a.y - b.y) / 2;
  const fwd = { x: (st.a[2].x + st.b[2].x) / 2 - ctr.x, y: (st.a[2].y + st.b[2].y) / 2 - ctr.y };
  const fl = Math.hypot(fwd.x, fwd.y) || 1;
  const bk = { x: -fwd.x / fl, y: -fwd.y / fl };
  const pts: Pt[] = [];
  const nrm: Pt[] = [];
  for (let j = 1; j < 12; j++) {
    const th = (j / 12) * Math.PI;
    const q = { x: ctr.x + (b.x - ctr.x) * Math.cos(th) + bk.x * r * Math.sin(th), y: ctr.y + (b.y - ctr.y) * Math.cos(th) + bk.y * r * Math.sin(th) };
    pts.push(q);
    nrm.push({ x: (q.x - ctr.x) / (r || 1), y: (q.y - ctr.y) / (r || 1) });
  }
  return { pts, nrm, r };
};

// The cream rim on the knuckle's upward-facing arc: a knuckle highlight.
const knuckleRimD = (c: ClawGeo, t: number) => {
  const { pts, nrm, r } = knuckle(c);
  const inner = pts.map((q, j) => {
    const th = Math.min(t * Math.max(0, -nrm[j].y), r * 0.3);
    return { x: q.x - nrm[j].x * th, y: q.y - nrm[j].y * th };
  });
  return polyD([...pts, ...inner.reverse()]);
};

const HandDefs: React.FC<{ id: string }> = ({ id }) => (
  <defs>
    <clipPath id={`${id}-palm`}>
      <path d={PALM_PATH} />
    </clipPath>
    {/* Canvas-oriented palm hatch: used inside an unrotate() group, so it stays
        1.5/7 px at 9° whatever the hand's rot, mirroring and scale. */}
    <pattern id={`${id}-hatch`} patternUnits="userSpaceOnUse" width={HATCH.gap} height={HATCH.gap} patternTransform={`rotate(${HATCH.angle})`}>
      <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={C.cream} strokeWidth={HATCH.width} />
    </pattern>
    {/* Claw shading lives in stage coordinates: maroon engraving on ivory. */}
    <pattern id={`${id}-claw-hatch`} patternUnits="userSpaceOnUse" width={HATCH.gap} height={HATCH.gap} patternTransform={`rotate(${HATCH.angle})`}>
      <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={C.maroon} strokeWidth={HATCH.width} />
    </pattern>
    {[
      ['shade', 56],
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
      <path d={stripHalfD(st, shadeSide, 0.55, c.iCut, c.iGold)} fill={`url(#${id}-claw-hatch)`} opacity={0.5} />
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
      {/* The cream rim runs to the gold; on the gold it is a hairline, so the tip reads gold. */}
      <path d={stripRimD(st, 3, 0.45, from, c.iGold)} fill={C.cream} />
      <path d={stripRimD(st, 1.25, 0.2, c.iGold)} fill={C.cream} />
      <path d={polyD([st.a[c.iGold], st.b[c.iGold]], false)} stroke={C.night} strokeOpacity={0.55} strokeWidth={1.2} fill="none" />
    </g>
  );
};

const Finger: React.FC<{ c: ClawGeo; ember: number; warm: number }> = ({ c, ember, warm }) => {
  const { ka, kb } = sheathEnds(c);
  const band = (facing: 'up' | 'down', t: number) =>
    stripEdgeBandD(c.strip, 'a', facing, t, 0.3, 0, ka) + stripEdgeBandD(c.strip, 'b', facing, t, 0.3, 0, kb);
  return (
    <g>
      <path d={fingerD(c)} fill={C.maroon} />
      {ember > 0 ? <path d={band('down', 3.5)} fill={C.ember} opacity={0.85 * ember} /> : null}
      {warm > 0 ? <path d={band('down', 3.5)} fill={C.gold} opacity={0.75 * warm} /> : null}
      <path d={band('up', 3) + knuckleRimD(c, 3)} fill={C.cream} />
    </g>
  );
};

export const Hand: React.FC<HandProps> = (p) => {
  const g = handGeometry(p);
  const id = `dhand-${p.side}`;
  const ember = clamp(p.ember ?? 0);
  const warm = clamp(p.warm ?? 0);
  if (p.silhouette) {
    return (
      <g fill={C.night}>
        <path transform={svgM(g.m)} d={PALM_PATH} />
        {g.claws.map((c, i) => (
          <path key={i} d={fingerD(c) + stripD(c.strip, c.iCut - 2)} />
        ))}
      </g>
    );
  }
  const rim = invv(g.m, { x: 0, y: 3 });
  const hatchR = 280 * Math.abs(p.scale ?? 1); // canvas px round the palm centre: covers the palm
  const ko = 2.5 * 2; // a 2.5 px night keyline outside, so a hand reads over the head
  const lead = pointIndex(p);
  const order = (p.point ?? 0) > 0 ? [0, 1, 2, 3].filter((i) => i !== lead).concat(lead) : [0, 1, 2, 3];
  return (
    <g>
      <HandDefs id={id} />
      {/* the palm, under the fingers, with a night keyline so it reads over the head */}
      <path transform={svgM(g.m)} d={PALM_PATH} fill={C.night} stroke={C.night} strokeWidth={ko / Math.abs(p.scale ?? 1)} strokeLinejoin="round" />
      <g transform={svgM(g.m)}>
        <path d={PALM_PATH} fill={C.cream} />
        <g clipPath={`url(#${id}-palm)`}>
          <path d={PALM_PATH} fill={C.maroon} transform={`translate(${rim.x} ${rim.y})`} />
          <g mask={`url(#${id}-shade)`} opacity={0.18}>
            <g transform={svgM(unrotate(g.m, { x: 0, y: 0 }))}>
              <rect x={-hatchR} y={-hatchR} width={2 * hatchR} height={2 * hatchR} fill={`url(#${id}-hatch)`} />
            </g>
          </g>
          {/* Light from below: only a lip on the lower edges (no broad band). */}
          {ember > 0 ? <rect x={-200} y={-250} width={400} height={400} fill={C.ember} opacity={0.85 * ember} mask={`url(#${id}-lip)`} /> : null}
          {warm > 0 ? <rect x={-200} y={-250} width={400} height={400} fill={C.gold} opacity={0.75 * warm} mask={`url(#${id}-lip)`} /> : null}
        </g>
      </g>
      {/* the digits lie on the back of the hand: keyline, claw, then the finger
          sheath; a pointing claw is drawn last, over the tucked ones */}
      {order.map((i) => {
        const c = g.claws[i];
        return (
          <g key={i}>
            <path d={fingerD(c) + stripD(c.strip, c.iCut - 2)} fill={C.night} stroke={C.night} strokeWidth={ko} strokeLinejoin="round" />
            <Claw c={c} id={id} ember={ember} warm={warm} />
            <Finger c={c} ember={ember} warm={warm} />
          </g>
        );
      })}
    </g>
  );
};
