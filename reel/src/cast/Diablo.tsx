// Diablo's head (shots 1–6) and the whole mark (the end card).
//
// The head is the logo's HEAD_PATH, maroon, lit only by a thin cream rim on its
// top edges and its own gold eyes, with engraved cream hatching on its lower
// half. Every <defs> entry is static, in the trace coordinates of the group
// that uses it; pose and animation live on transforms and opacities only, so
// CameraMotionBlur's stacked copies all resolve the same url(#id).

import React from 'react';
import { CRESCENT_PATH, HEAD_PATH } from '../logo';
import { DIABLO_EYES_Y, DIABLO_ORIGIN, DIABLO_SCALE, MARK_ORIGIN, MARK_SCALE } from '../geometry';
import { C, HATCH } from '../theme';
import { clamp, type Pt } from '../lib/anim';
import type { EyeState, HeadProps, MarkProps } from './types';
import { ap, centroid, chain, clipHalf, invv, polyD, R, roundRectPoly, S, scaleOf, svgM, T, type Mat } from './diablo/geom';
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

// One gold slit as a polygon in trace coordinates. `open` scales the long axis
// about the centre; `narrow` shortens it and brings down a flat lid that tilts
// toward the nose (the pleased, knowing squint).
export const eyePoly = (e: Eye, side: 0 | 1, s: EyeState): Pt[] | null => {
  const open = clamp(s.open, 0, 1.2);
  const narrow = clamp(s.narrow ?? 0);
  const h = e.h * open * (1 - 0.22 * narrow);
  if (h < 0.6) return null;
  const w = e.w * (1 + 0.05 * narrow);
  const r = Math.min(w * 0.47, h / 2);
  const local = roundRectPoly(w, h, r, 7);
  const lean = (e.lean * Math.PI) / 180;
  const cs = Math.cos(lean);
  const sn = Math.sin(lean);
  // The squint sits a touch lower: the lid comes down more than the cheek rises.
  const cy = e.cy + e.h * 0.06 * narrow * open;
  const cx = e.cx - e.h * 0.06 * narrow * open * sn;
  let P = local.map((q) => ({ x: cx + q.x * cs - q.y * sn, y: cy + q.x * sn + q.y * cs }));
  if (narrow > 0.001) {
    // A flat lid through a point on the slit's axis, tilting down toward the nose.
    const cut = h * (0.5 - 0.2 * narrow); // how far above the centre, along the axis
    const L = { x: cx + cut * sn, y: cy - cut * cs };
    const tilt = ((side === 0 ? 1 : -1) * 20 * narrow * Math.PI) / 180;
    // Keep what is below the line (its normal points up, rotated by the tilt).
    const n = { x: Math.sin(tilt), y: -Math.cos(tilt) };
    P = clipHalf(P, n, n.x * L.x + n.y * L.y);
    if (P.length < 3) return null;
  }
  return P;
};

const Eyes: React.FC<{ s: EyeState; fill?: string }> = ({ s, fill = C.gold }) => (
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

// Static defs, trace coordinates of the head group.
const HeadDefs: React.FC = () => (
  <defs>
    <clipPath id={`${H}-clip`}>
      <path d={HEAD_PATH} />
    </clipPath>
    <pattern
      id={`${H}-hatch`}
      patternUnits="userSpaceOnUse"
      width={HATCH.gap}
      height={HATCH.gap}
      patternTransform={`scale(${1 / DIABLO_SCALE}) rotate(${HATCH.angle})`}
    >
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
        <rect x={RX.x} y={RX.y} width={RX.w} height={RX.h} fill={`url(#${H}-hatch)`} opacity={0.18} mask={`url(#${H}-shade)`} />
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
