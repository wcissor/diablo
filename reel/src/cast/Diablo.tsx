// Diablo's head (shots 1–6) and the whole mark (the end card).
//
// The head is the logo's HEAD_PATH, maroon, lit only by a thin cream rim on its
// top edges and its own gold eyes, with engraved cream hatching on its lower
// half. Every <defs> entry is static, in the trace coordinates of the group
// that uses it; pose and animation live on transforms and opacities only, so
// CameraMotionBlur's stacked copies all resolve the same url(#id).

import React from 'react';
import { CRESCENT_PATH, HEAD_BOX, HEAD_PATH } from '../logo';
import { DIABLO_EYES_Y, DIABLO_ORIGIN, DIABLO_SCALE, MARK_ORIGIN, MARK_SCALE } from '../geometry';
import { C, HATCH } from '../theme';
import { clamp, type Pt } from '../lib/anim';
import type { EyeState, HeadProps, MarkProps } from './types';
import { ap, centroid, chain, invv, polyD, R, S, scaleOf, signedArea, svgM, T, unrotate, type Mat } from './diablo/geom';
import { EYE, HEAD_REGION, type Eye } from './diablo/shape';

const PIVOT: Pt = { x: 540, y: DIABLO_EYES_Y };

// Trace coordinates → stage coordinates for a head pose.
export const headMatrix = (p: Pick<HeadProps, 'dx' | 'dy' | 'scale' | 'rot'>): Mat =>
  chain(
    T((p.dx ?? 0) + PIVOT.x, (p.dy ?? 0) + PIVOT.y),
    R(p.rot ?? 0),
    S(p.scale ?? 1),
    T(-PIVOT.x, -PIVOT.y),
    T(DIABLO_ORIGIN.x, DIABLO_ORIGIN.y),
    S(DIABLO_SCALE),
  );

// Stage coordinates of both eye centres for a pose (look offset included).
// (The centre of each visible slit: a narrowed eye's centre sits a little lower.)
export function eyeCentres(p: HeadProps): Pt[] {
  const m = headMatrix(p);
  const look = p.eyes?.look ?? { x: 0, y: 0 };
  return EYE.map((e, i) => {
    const P = eyePoly(e, i as 0 | 1, { ...p.eyes, open: Math.max(0.05, p.eyes?.open ?? 1) });
    const c = P && P.length >= 3 ? centroid(P) : { x: e.cx, y: e.cy };
    const q = ap(m, c);
    return { x: q.x + look.x, y: q.y + look.y };
  });
}

/* ───────────────────────────── the eyes ───────────────────────────── */

// Optional extra eye control, beyond the EyeState contract: `glare` 0..1 is the
// menacing squint for the strike (a flat lid tilted down toward the nose). Pass
// it inside `eyes`; `narrow` stays the pleased, satisfied squint.
export type DiabloEyeState = EyeState & { glare?: number };

const COLS = 36; // columns across a slit

// One gold slit as a polygon in trace coordinates, built column by column in
// the slit's own frame (u across, v down its long axis) and then leaned.
// `open` scales the long axis about the centre. `narrow` (pleased, satisfied)
// makes it about 38 % shorter, brings down a flat upper lid that droops a
// little toward the OUTER corner, and pushes the bottom up with a round cheek,
// so each eye becomes a short arch (∩): a contented smile with the eyes.
// `glare` (menacing) brings the lid down tilted toward the nose instead.
export const eyePoly = (e: Eye, side: 0 | 1, s: DiabloEyeState): Pt[] | null => {
  const open = clamp(s.open, 0, 1.2);
  const narrow = clamp(s.narrow ?? 0);
  const glare = clamp(s.glare ?? 0);
  const h = e.h * open * Math.max(0.35, 1 - 0.38 * narrow - 0.18 * glare);
  if (h < 0.6) return null;
  const w = e.w * (1 + 0.06 * narrow);
  const rt = Math.min(w * 0.47, h / 2); // top corners
  const rb = Math.min(w * 0.47 * (1 - 0.1 * narrow), h / 2); // bottom corners stay round: soft feet
  const lean = (e.lean * Math.PI) / 180;
  const cs = Math.cos(lean);
  const sn = Math.sin(lean);
  // Screen-space lid tilt: + falls to the right. Pleased: down toward the outer
  // corner (left eye rises to the right). Glare: down toward the nose.
  const sgn = side === 0 ? 1 : -1;
  const tau = (sgn * (-7 * narrow + 20 * glare) * Math.PI) / 180;
  const slope = Math.tan(tau - lean); // the same line in the slit's frame
  const lidDepth = h * (0.17 * narrow + 0.26 * glare); // below the slit's top, on its axis
  const hasLid = lidDepth > 0.01;
  const lift = e.h * open * 0.16 * narrow; // how far the cheek pushes the bottom up, mid-slit
  const span = w * 0.7; // the cheek's half-width: wider than the slit, so the corners stay blunt
  const round = (u: number, r: number) => {
    const d = Math.max(0, Math.abs(u) - (w / 2 - r));
    return r - Math.sqrt(Math.max(0, r * r - d * d));
  };
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let k = 0; k <= COLS; k++) {
    const u = (-w / 2) * Math.cos((Math.PI * k) / COLS);
    let t = -h / 2 + round(u, rt);
    let b = h / 2 - round(u, rb);
    if (hasLid) t = Math.max(t, -h / 2 + lidDepth + u * slope);
    if (lift > 0.01) b = Math.min(b, h / 2 - lift * (1 - Math.pow(u / span, 2)));
    if (b - t > 0.05) {
      top.push({ x: u, y: t });
      bot.push({ x: u, y: b });
    }
  }
  if (top.length < 2) return null;
  const Q = [...top, ...bot.reverse()];
  // Keep the visible slit where the open eye sits (its centroid on the eye's
  // centre, dropping only a touch as it narrows), so eyeCentres barely moves.
  const c = Math.abs(signedArea(Q)) > 1e-3 ? centroid(Q) : { x: 0, y: 0 };
  const off = { x: -c.x, y: -c.y + e.h * open * 0.03 * (narrow + glare) };
  return Q.map((q) => {
    const x = q.x + off.x;
    const y = q.y + off.y;
    return { x: e.cx + x * cs - y * sn, y: e.cy + x * sn + y * cs };
  });
};

const Eyes: React.FC<{ s: DiabloEyeState; fill?: string }> = ({ s, fill = C.gold }) => (
  <>
    {EYE.map((e, i) => {
      const P = eyePoly(e, i as 0 | 1, s);
      return P ? <path key={i} d={polyD(P)} fill={fill} /> : null;
    })}
  </>
);

/* ───────────────────────────── the head ───────────────────────────── */

const H = 'dh'; // id prefix for the head
const RX = HEAD_REGION;
const HEAD_C: Pt = { x: HEAD_BOX.x + HEAD_BOX.w / 2, y: HEAD_BOX.y + HEAD_BOX.h / 2 };

// Static defs, trace coordinates of the head group.
const HeadDefs: React.FC = () => (
  <defs>
    <clipPath id={`${H}-clip`}>
      <path d={HEAD_PATH} />
    </clipPath>
    {/* Canvas-oriented hatch: used inside an unrotate() group, so it stays 1.5/7 px at 9°. */}
    <pattern id={`${H}-hatch`} patternUnits="userSpaceOnUse" width={HATCH.gap} height={HATCH.gap} patternTransform={`rotate(${HATCH.angle})`}>
      <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={C.cream} strokeWidth={HATCH.width} />
    </pattern>
    {/* Bands along the edges that face down: the head minus itself raised by k. */}
    {[
      ['shade', 84],
      ['under', 46],
      ['lip', 4.5],
    ].map(([name, k]) => (
      <mask key={name} id={`${H}-${name}`} maskUnits="userSpaceOnUse" x={RX.x} y={RX.y} width={RX.w} height={RX.h}>
        <path d={HEAD_PATH} fill="#fff" />
        <path d={HEAD_PATH} fill="#000" transform={`translate(0 ${-(k as number)})`} />
      </mask>
    ))}
    {/* A faint warm spill on the maroon right around each eye. */}
    {EYE.map((e, i) => (
      <radialGradient key={i} id={`${H}-spill${i}`} gradientUnits="userSpaceOnUse" cx={e.cx} cy={e.cy} r={e.h * 0.62}>
        <stop offset="0" stopColor={C.gold} stopOpacity={0.12} />
        <stop offset="0.55" stopColor={C.gold} stopOpacity={0.04} />
        <stop offset="1" stopColor={C.gold} stopOpacity={0} />
      </radialGradient>
    ))}
  </defs>
);

export const DiabloHead: React.FC<HeadProps> = (p) => {
  const m = headMatrix(p);
  const look = p.eyes.look ?? { x: 0, y: 0 };
  const lookLocal = invv(m, look);
  const rim = invv(m, { x: 0, y: 3 }); // 3 canvas px straight down, in trace units
  const ember = clamp(p.ember ?? 0);
  const warm = clamp(p.warm ?? 0);
  const open = clamp(p.eyes.open);
  const clipId = p.clipBelowY != null ? `${H}-below-${Math.round(p.clipBelowY * 4)}` : null;
  const hatchR = 380 * Math.abs(p.scale ?? 1); // canvas px round the head's centre: covers it

  const head = p.eyesOnly ? null : p.silhouette ? (
    <g transform={svgM(m)}>
      <path d={HEAD_PATH} fill={C.night} />
    </g>
  ) : (
    <g transform={svgM(m)}>
      <HeadDefs />
      {/* Rim: the shape in cream, then maroon shifted down 3 px, clipped to the shape. */}
      <path d={HEAD_PATH} fill={C.cream} />
      <g clipPath={`url(#${H}-clip)`}>
        <path d={HEAD_PATH} fill={C.maroon} transform={`translate(${rim.x} ${rim.y})`} />
        {/* Engraved shading on the lower half, along the edges that face down. */}
        <g mask={`url(#${H}-shade)`} opacity={0.18}>
          <g transform={svgM(unrotate(m, HEAD_C))}>
            <rect x={-hatchR} y={-hatchR} width={2 * hatchR} height={2 * hatchR} fill={`url(#${H}-hatch)`} />
          </g>
        </g>
        {/* Light from below: ember while the cracks are open, warm gold after. */}
        {ember > 0 ? (
          <>
            <rect x={RX.x} y={RX.y} width={RX.w} height={RX.h} fill={C.ember} opacity={0.2 * ember} mask={`url(#${H}-under)`} />
            <rect x={RX.x} y={RX.y} width={RX.w} height={RX.h} fill={C.ember} opacity={0.85 * ember} mask={`url(#${H}-lip)`} />
          </>
        ) : null}
        {warm > 0 ? (
          <>
            <rect x={RX.x} y={RX.y} width={RX.w} height={RX.h} fill={C.gold} opacity={0.14 * warm} mask={`url(#${H}-under)`} />
            <rect x={RX.x} y={RX.y} width={RX.w} height={RX.h} fill={C.gold} opacity={0.75 * warm} mask={`url(#${H}-lip)`} />
          </>
        ) : null}
        {/* The eyes' own light, very faint, on the maroon around them. */}
        {open > 0.02 ? (
          <g transform={`translate(${lookLocal.x} ${lookLocal.y})`} opacity={Math.min(1, open) * (1 - 0.3 * (p.eyes.narrow ?? 0))}>
            {EYE.map((e, i) => (
              <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.h * 0.62} ry={e.h * 0.62} fill={`url(#${H}-spill${i})`} />
            ))}
          </g>
        ) : null}
      </g>
    </g>
  );

  const eyes = p.silhouette ? null : (
    <g transform={svgM(chain(T(look.x, look.y), m))}>
      <Eyes s={p.eyes} />
    </g>
  );

  return (
    <g clipPath={clipId ? `url(#${clipId})` : undefined}>
      {clipId ? (
        <defs>
          <clipPath id={clipId}>
            <rect x={-4000} y={-4000} width={9080} height={4000 + (p.clipBelowY as number)} />
          </clipPath>
        </defs>
      ) : null}
      {head}
      {eyes}
    </g>
  );
};

/* ───────────────────────────── the mark ───────────────────────────── */

const MARK_CX = 540;
const MARK_CY = 700;

export const markMatrix = (scale = 1): Mat =>
  chain(T(MARK_CX, MARK_CY), S(scale), T(-MARK_CX, -MARK_CY), T(MARK_ORIGIN.x, MARK_ORIGIN.y), S(MARK_SCALE));

// Shot 7: the whole mark, 420 px tall, centred on (540, 700). Maroon with a
// 3 px cream outline all round, gold eyes; `blink` 1 shuts them.
export const Mark: React.FC<MarkProps> = ({ blink, opacity = 1, scale = 1 }) => {
  const m = markMatrix(scale);
  const k = scaleOf(m);
  const ow = 6 / k; // a 6 px stroke under the fill leaves 3 px outside
  return (
    <g opacity={opacity} transform={svgM(m)}>
      <path d={HEAD_PATH} fill={C.cream} stroke={C.cream} strokeWidth={ow} strokeLinejoin="round" />
      <path d={CRESCENT_PATH} fill={C.cream} stroke={C.cream} strokeWidth={ow} strokeLinejoin="round" />
      <path d={HEAD_PATH} fill={C.maroon} />
      <path d={CRESCENT_PATH} fill={C.maroon} />
      <Eyes s={{ open: 1 - clamp(blink) }} />
    </g>
  );
};
