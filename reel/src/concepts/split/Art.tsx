// The three bodies, flat: an ink outline, porcelain with one flat shade crescent,
// a white gleam. No face here (Face.tsx), no damage (Bot.tsx).

import React from 'react';
import type { BotKind } from '../_kit/types';
import { fx, grow, shapeD, sqPoint, type Pt, type Shape } from './geom';
import { OW, SPEC, type Pal } from './spec';

type RR = { x0: number; y0: number; x1: number; y1: number; r: number };
const rr = (r: RR): Shape => ({ t: 'rr', ...r });

// An outlined part: ink grown by OW underneath, the fill on top.
const Part: React.FC<{ s: Shape; fill: string; ink: string }> = ({ s, fill, ink }) => (
  <>
    <path d={shapeD(grow(s, OW))} fill={ink} />
    <path d={shapeD(s)} fill={fill} />
  </>
);

// A filled shape with its shade crescent (bottom right): the shade fill, then
// the lit shape shifted up-left, clipped to the shape.
const Shaded: React.FC<{ clip: string; d: string; shade: Pt; pal: Pal }> = ({ clip, d, shade, pal }) => (
  <>
    <path d={d} fill={pal.shade} />
    <g clipPath={`url(#${clip})`}>
      <path d={d} fill={pal.body} transform={`translate(${shade.x} ${shade.y})`} />
    </g>
  </>
);

const Gleam: React.FC<{ d: string; dot: Pt; pal: Pal; w?: number }> = ({ d, dot, pal, w = 7 }) => (
  <>
    <path d={d} fill="none" stroke={pal.light} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={dot.x} cy={dot.y} r={w * 0.6} fill={pal.light} />
  </>
);

/* ───────── bubble ───────── */

const B = SPEC.bubble.body as Extract<Shape, { t: 'sq' }>;
// The speech tail, low on the left, sweeping down to a point.
export const BUBBLE_TAIL = 'M-100 -74C-101 -54 -105 -35 -113 -18C-95 -21 -77 -30 -58 -46Z';
const BUBBLE_FEET: RR[] = [
  { x0: -54, y0: -46, x1: -14, y1: -OW, r: 17 },
  { x0: 16, y0: -46, x1: 56, y1: -OW, r: 17 },
];
const bubbleGleam = (() => {
  const inset = { ...B, a: B.a - 17, b: B.b - 17 };
  const pts = Array.from({ length: 9 }, (_, i) => sqPoint(inset, Math.PI + 0.38 + i * 0.075));
  return { d: `M${pts.map((p) => `${fx(p.x)} ${fx(p.y)}`).join('L')}`, dot: sqPoint(inset, Math.PI + 1.22) };
})();

const BubbleArt: React.FC<{ id: string; pal: Pal }> = ({ id, pal }) => {
  const S = SPEC.bubble;
  const body = shapeD(S.body);
  return (
    <g>
      {BUBBLE_FEET.map((f, i) => (
        <Part key={i} s={rr(f)} fill={pal.shade} ink={pal.ink} />
      ))}
      <path d={BUBBLE_TAIL} fill={pal.ink} stroke={pal.ink} strokeWidth={2 * OW} strokeLinejoin="round" />
      <path d={body} fill={pal.ink} stroke={pal.ink} strokeWidth={2 * OW} />
      <Shaded clip={`${id}-tail`} d={BUBBLE_TAIL} shade={{ x: -5, y: -6 }} pal={pal} />
      <Shaded clip={`${id}-body`} d={body} shade={S.shade} pal={pal} />
      <Gleam d={bubbleGleam.d} dot={bubbleGleam.dot} pal={pal} />
    </g>
  );
};

/* ───────── cube ───────── */

const CUBE_FEET: RR[] = [
  { x0: -62, y0: -48, x1: -22, y1: -OW, r: 14 },
  { x0: 22, y0: -48, x1: 62, y1: -OW, r: 14 },
];
export const CUBE_SCREEN: RR = { x0: -74, y0: -164, x1: 74, y1: -66, r: 24 };
const CUBE_BEZEL: RR = { x0: -81, y0: -171, x1: 81, y1: -59, r: 30 };
export const ANTENNA_BASE: Pt = { x: 16, y: -206 };

const CubeArt: React.FC<{ id: string; pal: Pal; sway: number; led: string }> = ({ id, pal, sway, led }) => {
  const S = SPEC.cube;
  return (
    <g>
      {CUBE_FEET.map((f, i) => (
        <Part key={i} s={rr(f)} fill={pal.shade} ink={pal.ink} />
      ))}
      {[-1, 1].map((sd) => (
        <g key={sd}>
          <Part s={{ t: 'ci', cx: sd * 99, cy: -120, r: 13 }} fill={pal.shade} ink={pal.ink} />
          <circle cx={sd * 101} cy={-121} r={6} fill={pal.body} />
        </g>
      ))}
      <g transform={`rotate(${fx(sway)} ${ANTENNA_BASE.x} ${ANTENNA_BASE.y})`}>
        <Part s={rr({ x0: 11.5, y0: -222, x1: 20.5, y1: -198, r: 4.5 })} fill={pal.shade} ink={pal.ink} />
        <Part s={{ t: 'ci', cx: 16, cy: -226, r: 8.5 }} fill={led} ink={pal.ink} />
        <circle cx={13.5} cy={-229} r={2.6} fill={pal.light} opacity={0.9} />
      </g>
      <Part s={S.body} fill={pal.body} ink={pal.ink} />
      <Shaded clip={`${id}-body`} d={shapeD(S.body)} shade={S.shade} pal={pal} />
      <Gleam d="M-82 -142V-171A16 16 0 0 1 -66 -189H-40" dot={{ x: -24, y: -189 }} pal={pal} w={6.5} />
      <path d={shapeD(rr(CUBE_BEZEL))} fill={pal.shade} />
      <path d={shapeD(rr(CUBE_SCREEN))} fill={pal.screen} />
      <path d="M-58 -154H-30L-62 -80V-144A10 10 0 0 1 -58 -154Z" fill={pal.light} opacity={0.07} />
    </g>
  );
};

/* ───────── orb ───────── */

const O = SPEC.orb.body as Extract<Shape, { t: 'ci' }>;
const orbGleam = (() => {
  const r = O.r - 15;
  const p = (deg: number) => ({ x: O.cx + r * Math.cos((deg * Math.PI) / 180), y: O.cy + r * Math.sin((deg * Math.PI) / 180) });
  const a = p(205);
  const b = p(245);
  return { d: `M${fx(a.x)} ${fx(a.y)}A${r} ${r} 0 0 1 ${fx(b.x)} ${fx(b.y)}`, dot: p(259) };
})();

const OrbArt: React.FC<{ id: string; pal: Pal }> = ({ id, pal }) => {
  const S = SPEC.orb;
  return (
    <g>
      <Part s={S.body} fill={pal.body} ink={pal.ink} />
      <Shaded clip={`${id}-body`} d={shapeD(S.body)} shade={S.shade} pal={pal} />
      <Gleam d={orbGleam.d} dot={orbGleam.dot} pal={pal} />
    </g>
  );
};

export const BodyArt: React.FC<{ kind: BotKind; id: string; pal: Pal; sway: number; led: string }> = ({ kind, id, pal, sway, led }) =>
  kind === 'bubble' ? <BubbleArt id={id} pal={pal} /> : kind === 'cube' ? <CubeArt id={id} pal={pal} sway={sway} led={led} /> : <OrbArt id={id} pal={pal} />;

// The orb's two floating mitts: a round mitten with a thumb, thumb up and inwards.
export const Mitt: React.FC<{ x: number; y: number; side: 1 | -1; r?: number; pal: Pal }> = ({ x, y, side, r = 12.5, pal }) => {
  const th = { x: x - side * r * 0.62, y: y - r * 0.72, r: r * 0.46 };
  return (
    <g>
      <circle cx={th.x} cy={th.y} r={th.r + OW} fill={pal.ink} />
      <circle cx={x} cy={y} r={r + OW} fill={pal.ink} />
      <circle cx={th.x} cy={th.y} r={th.r} fill={pal.body} />
      <circle cx={x} cy={y} r={r} fill={pal.shade} />
      <circle cx={x - 2.2} cy={y - 2.6} r={r - 2.6} fill={pal.body} />
    </g>
  );
};
