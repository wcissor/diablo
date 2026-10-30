// Diablo's tail: the crescent from the logo (the scythe), carrying a gold seam
// for every fix he has learned, and the ring it curls into round the bots.

import React from 'react';
import { CRESCENT_PATH } from '../logo';
import { DIABLO_SCALE } from '../geometry';
import { C, HATCH, SEAM } from '../theme';
import { clamp, invLerp, rndRange, smooth, type Pt } from '../lib/anim';
import type { TailCrescentPose, TailProps, TailRing } from './types';
import { ap, chain, invv, polyD, R, S, scaleOf, stripD, stripRimD, stripUnderD, svgM, T, unrotate, type Mat, type Strip } from './diablo/geom';
import {
  along,
  CRESCENT_CENTROID,
  CRESCENT_INNER,
  CRESCENT_OUTER,
  CRESCENT_TIP_LOWER,
  CRESCENT_TIP_UPPER,
} from './diablo/shape';
import { CRESCENT_BOX } from '../logo';

const ID = 'dtail';
const KEYLINE = 2; // canvas px of the optional cream keyline, outside the shape
const BOX = { x: CRESCENT_BOX.x - 60, y: CRESCENT_BOX.y - 60, w: CRESCENT_BOX.w + 120, h: CRESCENT_BOX.h + 120 };

// Trace coordinates → stage coordinates for a crescent pose.
export const crescentMatrix = (p: TailCrescentPose): Mat => {
  const k = DIABLO_SCALE * (p.scale ?? 1);
  return chain(T(p.x, p.y), R(p.rot ?? 0), S(p.flip ? -k : k, k), T(-CRESCENT_CENTROID.x, -CRESCENT_CENTROID.y));
};

// The crescent's two sharp points in stage coordinates ("upper" is the one at
// the top in the logo arrangement).
export function tailTips(p: TailCrescentPose): { upper: Pt; lower: Pt } {
  const m = crescentMatrix(p);
  return { upper: ap(m, CRESCENT_TIP_UPPER), lower: ap(m, CRESCENT_TIP_LOWER) };
}

/* ───────────────────────────── seams ───────────────────────────── */

// Kintsugi seams laid across the crescent band, in trace coordinates, in the
// order they appear (spread along the blade so any count reads as a set).
const SEAM_US = [0.5, 0.3, 0.68, 0.19, 0.8, 0.4, 0.59, 0.24, 0.73, 0.86, 0.35, 0.63, 0.13, 0.46];

const makeSeam = (j: number): string => {
  const u = SEAM_US[j % SEAM_US.length];
  const lean = rndRange(`ts-lean-${j}`, -0.06, 0.06);
  const o = along(CRESCENT_OUTER, u + lean);
  const i = along(CRESCENT_INNER, u - lean * 0.5);
  // Extend a little past both edges so the clip cuts it cleanly.
  const dx = i.x - o.x;
  const dy = i.y - o.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const a = { x: o.x - ux * 14, y: o.y - uy * 14 };
  const b = { x: i.x + ux * 14, y: i.y + uy * 14 };
  // A jagged crack: 4–5 kinks, perpendicular jitter.
  const n = 5;
  const pts: Pt[] = [a];
  for (let k = 1; k < n; k++) {
    const t = k / n + rndRange(`ts-t-${j}-${k}`, -0.05, 0.05);
    const off = rndRange(`ts-o-${j}-${k}`, -1, 1) * Math.min(11, len * 0.1);
    pts.push({ x: a.x + (b.x - a.x) * t - uy * off, y: a.y + (b.y - a.y) * t + ux * off });
  }
  pts.push(b);
  let d = polyD(pts, false);
  // Every third seam forks once near its middle.
  if (j % 3 === 0) {
    const root = pts[2];
    const ang = Math.atan2(uy, ux) + (rndRange(`ts-fa-${j}`, 0, 1) > 0.5 ? 0.75 : -0.75);
    const L = len * rndRange(`ts-fl-${j}`, 0.24, 0.34);
    const mid = { x: root.x + Math.cos(ang) * L * 0.5 + rndRange(`ts-fm-${j}`, -4, 4), y: root.y + Math.sin(ang) * L * 0.5 };
    const end = { x: root.x + Math.cos(ang + 0.15) * L, y: root.y + Math.sin(ang + 0.15) * L };
    d += polyD([root, mid, end], false);
  }
  return d;
};
export const TAIL_SEAMS: string[] = SEAM_US.map((_, j) => makeSeam(j));

/* ───────────────────────────── the crescent ───────────────────────────── */

const CrescentDefs: React.FC = () => (
  <defs>
    <clipPath id={`${ID}-clip`}>
      <path d={CRESCENT_PATH} />
    </clipPath>
    {/* Canvas-oriented hatch: used inside an unrotate() group, so it stays 1.5/7 px at 9°
        whatever the crescent's rot, flip and scale. */}
    <pattern id={`${ID}-hatch`} patternUnits="userSpaceOnUse" width={HATCH.gap} height={HATCH.gap} patternTransform={`rotate(${HATCH.angle})`}>
      <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={C.cream} strokeWidth={HATCH.width} />
    </pattern>
    {[
      ['shade', 0, 150],
      ['under', 0, 40],
      ['lip', 0, 4.5],
    ].map(([name, dx, dy]) => (
      <mask key={name} id={`${ID}-${name}`} maskUnits="userSpaceOnUse" x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h}>
        <path d={CRESCENT_PATH} fill="#fff" />
        <path d={CRESCENT_PATH} fill="#000" transform={`translate(${dx} ${-(dy as number)})`} />
      </mask>
    ))}
  </defs>
);

const Crescent: React.FC<{ pose: TailCrescentPose; seams: number; ember: number; warm: number; keyline: number; silhouette?: boolean }> = ({
  pose,
  seams,
  ember,
  warm,
  keyline,
  silhouette,
}) => {
  const m = crescentMatrix(pose);
  if (silhouette) {
    return <path transform={svgM(m)} d={CRESCENT_PATH} fill={C.night} />;
  }
  const k = scaleOf(m);
  const hatchR = 300 * Math.abs(pose.scale ?? 1); // canvas px round the centroid: covers the blade
  const rim = invv(m, { x: 0, y: 3 });
  const shadow = invv(m, { x: 0, y: 2 });
  // Seams in local units so they read 6 px gold with a 2 px cream core on the canvas.
  const sw = SEAM.width / k;
  const cw = SEAM.core / k;
  const count = Math.max(0, Math.min(TAIL_SEAMS.length, seams));
  return (
    <g transform={svgM(m)}>
      <CrescentDefs />
      {/* keyline: a 4 px cream stroke under the fill leaves a 2 px outline outside */}
      {keyline > 0 ? (
        <path d={CRESCENT_PATH} fill="none" stroke={C.cream} strokeOpacity={keyline} strokeWidth={(2 * KEYLINE) / k} strokeLinejoin="round" />
      ) : null}
      <path d={CRESCENT_PATH} fill={C.cream} />
      <g clipPath={`url(#${ID}-clip)`}>
        <path d={CRESCENT_PATH} fill={C.maroon} transform={`translate(${rim.x} ${rim.y})`} />
        <g mask={`url(#${ID}-shade)`} opacity={0.18}>
          <g transform={svgM(unrotate(m, CRESCENT_CENTROID))}>
            <rect x={-hatchR} y={-hatchR} width={2 * hatchR} height={2 * hatchR} fill={`url(#${ID}-hatch)`} />
          </g>
        </g>
        {ember > 0 ? (
          <>
            <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill={C.ember} opacity={0.2 * ember} mask={`url(#${ID}-under)`} />
            <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill={C.ember} opacity={0.85 * ember} mask={`url(#${ID}-lip)`} />
          </>
        ) : null}
        {warm > 0 ? (
          <>
            <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill={C.gold} opacity={0.14 * warm} mask={`url(#${ID}-under)`} />
            <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill={C.gold} opacity={0.75 * warm} mask={`url(#${ID}-lip)`} />
          </>
        ) : null}
        {TAIL_SEAMS.slice(0, Math.ceil(count)).map((d, j) => {
          const t = clamp(count - j);
          if (t <= 0) return null;
          // Gold flows in from the outer edge; pathLength makes the dash a fraction.
          const dash = { pathLength: 1, strokeDasharray: `${t} 2`, strokeDashoffset: 0 };
          return (
            <g key={j} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d={d} stroke={C.night} strokeOpacity={0.45} strokeWidth={sw} transform={`translate(${shadow.x} ${shadow.y})`} {...dash} />
              <path d={d} stroke={C.gold} strokeWidth={sw} {...dash} />
              <path d={d} stroke={C.cream} strokeWidth={cw} {...dash} />
            </g>
          );
        })}
      </g>
    </g>
  );
};

/* ───────────────────────────── the ring ───────────────────────────── */

const RING_W = 26; // band thickness, canvas px
const DEFAULT_START = (5 * Math.PI) / 4; // back-left; the sweep runs round the front

// Build the band between fractions s0..s1 of a full turn as a strip.
const ringStrip = (r: TailRing, s0: number, s1: number, width: (s: number) => number): Strip => {
  const a0 = r.startAngle ?? DEFAULT_START;
  const n = Math.max(4, Math.ceil((s1 - s0) * 220));
  const A: Pt[] = [];
  const B: Pt[] = [];
  const NA: Pt[] = [];
  const NB: Pt[] = [];
  const W: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const a = a0 - s * Math.PI * 2;
    const P = { x: r.cx + r.rx * Math.cos(a), y: r.cy + r.ry * Math.sin(a) };
    let nx = Math.cos(a) / r.rx;
    let ny = Math.sin(a) / r.ry;
    const nl = Math.hypot(nx, ny);
    nx /= nl;
    ny /= nl;
    const w = width(s);
    // The tip hugs the outer edge, so it narrows like the crescent's point.
    const outer = { x: P.x + nx * (RING_W / 2), y: P.y + ny * (RING_W / 2) };
    const inner = { x: P.x + nx * (RING_W / 2 - w), y: P.y + ny * (RING_W / 2 - w) };
    // Travelling with decreasing angle, the outer edge is on the right.
    A.push(inner);
    NA.push({ x: -nx, y: -ny });
    B.push(outer);
    NB.push({ x: nx, y: ny });
    W.push(w);
  }
  return { a: A, b: B, na: NA, nb: NB, w: W };
};

// Fractions of the turn that fall in one half of the ellipse.
const layerIntervals = (r: TailRing, s0: number, s1: number): [number, number][] => {
  const a0 = r.startAngle ?? DEFAULT_START;
  const inLayer = (s: number) => {
    const sn = Math.sin(a0 - s * Math.PI * 2);
    return r.layer === 'back' ? sn < 0 : sn >= 0;
  };
  const out: [number, number][] = [];
  const steps = 720;
  let start: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const s = s0 + ((s1 - s0) * i) / steps;
    const ok = inLayer(s);
    if (ok && start === null) start = s;
    if ((!ok || i === steps) && start !== null) {
      out.push([start, ok ? s : s - (s1 - s0) / steps]);
      start = null;
    }
  }
  // Overlap neighbouring pieces a hair so no seam shows where the halves meet.
  const eps = 0.004;
  return out.map(([a, b]) => [Math.max(s0, a - eps), Math.min(s1, b + eps)] as [number, number]).filter(([a, b]) => b > a);
};

export const ringWidth = (r: TailRing) => {
  const p = clamp(r.progress);
  const close = smooth(invLerp(0.86, 1, p));
  const tipLen = 0.2 * (1 - close);
  const baseLen = 0.07 * (1 - close);
  return (s: number) => {
    const d = p - s; // distance back from the leading tip
    const tip = tipLen > 1e-4 && d < tipLen ? 1 - Math.pow(1 - Math.max(0, d) / tipLen, 2.2) : 1;
    const base = baseLen > 1e-4 && s < baseLen ? 0.55 + 0.45 * smooth(s / baseLen) : 1;
    return RING_W * tip * base;
  };
};

const Ring: React.FC<{ ring: TailRing; ember: number; warm: number; keyline: number; silhouette?: boolean }> = ({ ring, ember, warm, keyline, silhouette }) => {
  const p = clamp(ring.progress);
  if (p <= 0.001) return null;
  const width = ringWidth(ring);
  const closed = p >= 0.999;
  let pieces: [number, number][];
  if (closed) {
    // A closed ring: start the turn where the halves meet, so each layer is one
    // unbroken piece (no seam at the start angle).
    const a0 = ring.startAngle ?? DEFAULT_START;
    const sb = ((((a0 - Math.PI) / (2 * Math.PI)) % 1) + 1) % 1; // where a = π (left)
    const eps = 0.004;
    pieces = ring.layer === 'front' ? [[sb - eps, sb + 0.5 + eps]] : [[sb + 0.5 - eps, sb + 1 + eps]];
  } else {
    pieces = layerIntervals(ring, 0, p);
  }
  const gold = clamp(ring.goldEdge);
  // Gold covers fractions [0, gold] of the turn from the start (and the same
  // span one turn on, for a closed ring's wrapped pieces).
  const goldSpans = (s0: number, s1: number): [number, number][] =>
    [
      [0, gold],
      [1, 1 + gold],
      [-1, -1 + gold],
    ]
      .map(([g0, g1]) => [Math.max(s0, g0), Math.min(s1, g1)] as [number, number])
      .filter(([a, b]) => b > a + 0.002);
  const edge = (st: Strip) =>
    polyD(
      st.b.map((q, j) => {
        const inset = Math.min(4.5, st.w[j] * 0.45);
        return { x: q.x - st.nb[j].x * inset, y: q.y - st.nb[j].y * inset };
      }),
      false,
    );
  return (
    <g>
      {pieces.map(([s0, s1], i) => {
        const st = ringStrip(ring, s0, s1, closed ? () => RING_W : width);
        if (silhouette) return <path key={i} d={stripD(st)} fill={C.night} />;
        const golds = gold > 0 ? goldSpans(s0, s1).map(([g0, g1]) => ringStrip(ring, g0, g1, closed ? () => RING_W : width)) : [];
        // The keyline follows the band's two long edges (not the cuts where the
        // back and front halves meet), plus the root's end if this piece starts it.
        const keyD = keyline > 0 ? polyD(st.a, false) + polyD(st.b, false) + (!closed && s0 <= 1e-6 ? polyD([st.a[0], st.b[0]], false) : '') : '';
        return (
          <g key={i}>
            {keyline > 0 ? (
              <path d={keyD} fill="none" stroke={C.cream} strokeOpacity={keyline} strokeWidth={2 * KEYLINE} strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            <path d={stripD(st)} fill={C.maroon} />
            <path d={stripUnderD(st, RING_W * 0.45, 0.5)} fill={`url(#${ID}-ring-hatch)`} opacity={0.18} />
            {ember > 0 ? <path d={stripUnderD(st, 3.5, 0.3)} fill={C.ember} opacity={0.85 * ember} /> : null}
            {warm > 0 ? <path d={stripUnderD(st, 3.5, 0.3)} fill={C.gold} opacity={0.75 * warm} /> : null}
            <path d={stripRimD(st, 3, 0.35)} fill={C.cream} />
            {golds.map((g, j) => (
              <g key={j} fill="none" strokeLinecap="round">
                <path d={edge(g)} stroke={C.gold} strokeWidth={5} />
                <path d={edge(g)} stroke={C.cream} strokeWidth={1.5} />
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
};

/* ───────────────────────────── the tail ───────────────────────────── */

export const Tail: React.FC<TailProps> = (p) => {
  const ember = clamp(p.ember ?? 0);
  const warm = clamp(p.warm ?? 0);
  const keyline = p.silhouette ? 0 : clamp(p.keyline ?? 0);
  return (
    <g>
      <defs>
        <pattern id={`${ID}-ring-hatch`} patternUnits="userSpaceOnUse" width={HATCH.gap} height={HATCH.gap} patternTransform={`rotate(${HATCH.angle})`}>
          <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={C.cream} strokeWidth={HATCH.width} />
        </pattern>
      </defs>
      {p.ring ? <Ring ring={p.ring} ember={ember} warm={warm} keyline={keyline} silhouette={p.silhouette} /> : null}
      {p.crescent ? <Crescent pose={p.crescent} seams={p.seams ?? 0} ember={ember} warm={warm} keyline={keyline} silhouette={p.silhouette} /> : null}
    </g>
  );
};
