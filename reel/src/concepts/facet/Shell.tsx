// The bots' bodies: flat fills, one flat shade, crisp white highlights and a
// night outline so they read on white and on maroon alike. No faces here: the
// shell is what the facets are cut from.
import React from 'react';
import type { BotKind } from '../_kit/types';
import { pts, rrect, v, type V } from './geo';
import { K } from './palette';
import { CUBE, ORB, SPEC } from './shapes';

export const OUT = 6; // outline thickness outside the fill

// Outline pass, then fill pass: overlapping parts merge into one sticker.
const Sticker: React.FC<{ ds: string[]; fill: string; out?: number }> = ({ ds, fill, out = OUT }) => (
  <>
    <g fill={K.ink} stroke={K.ink} strokeWidth={out * 2} strokeLinejoin="round">
      {ds.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
    <g fill={fill}>
      {ds.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  </>
);

// The one flat shade: the body, minus itself nudged up-left.
const Crescent: React.FC<{ ds: string[]; clip: string; dx?: number; dy?: number }> = ({ ds, clip, dx = -12, dy = -14 }) => (
  <g clipPath={clip}>
    <g fill={K.shade}>
      {ds.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
    <g fill={K.body} transform={`translate(${dx} ${dy})`}>
      {ds.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  </g>
);

const arc = (c: V, r: number, a0: number, a1: number) => {
  const p = (a: number) => v(c.x + r * Math.cos((a * Math.PI) / 180), c.y + r * Math.sin((a * Math.PI) / 180));
  const s = p(a0);
  const e = p(a1);
  return `M${s.x.toFixed(2)} ${s.y.toFixed(2)}A${r} ${r} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
};
const polar = (c: V, r: number, a: number) => v(c.x + r * Math.cos((a * Math.PI) / 180), c.y + r * Math.sin((a * Math.PI) / 180));

const Highlight: React.FC<{ c: V; r: number; a0: number; a1: number; dot: number; w?: number }> = ({ c, r, a0, a1, dot, w = 10 }) => {
  const d = polar(c, r, dot);
  return (
    <g>
      <path d={arc(c, r, a0, a1)} fill="none" stroke={K.white} strokeWidth={w} strokeLinecap="round" />
      <circle cx={d.x} cy={d.y} r={w * 0.48} fill={K.white} />
    </g>
  );
};

const Feet: React.FC<{ xs: number[]; w: number }> = ({ xs, w }) => (
  <g>
    {xs.map((x) => (
      <path key={x} d={rrect(x - w / 2, -42, x + w / 2, -OUT, 13)} fill={K.deep} stroke={K.ink} strokeWidth={OUT * 2} paintOrder="stroke" strokeLinejoin="round" />
    ))}
  </g>
);

export const Shell: React.FC<{ kind: BotKind; frame: number; clip: string }> = ({ kind, frame, clip }) => {
  const s = SPEC[kind];
  if (kind === 'bubble') {
    return (
      <g>
        <Feet xs={[-22, 42]} w={40} />
        <Sticker ds={s.body} fill={K.body} />
        <Crescent ds={s.body} clip={clip} />
        <Highlight c={v(-38, -136)} r={54} a0={195} a1={244} dot={262} />
      </g>
    );
  }
  if (kind === 'cube') {
    const sway = 7 * Math.sin(frame * 0.11);
    const base = v(-2, -198);
    const sc = CUBE.screen;
    return (
      <g>
        <Feet xs={[-50, 18]} w={38} />
        <path d={rrect(-111, -136, -90, -92, 8)} fill={K.deep} stroke={K.ink} strokeWidth={OUT * 2} paintOrder="stroke" />
        <g transform={`rotate(${sway.toFixed(2)} ${base.x} ${base.y})`}>
          <line x1={base.x} y1={base.y} x2={base.x} y2={base.y - 30} stroke={K.ink} strokeWidth={6} strokeLinecap="round" />
          <circle cx={base.x} cy={base.y - 34} r={8.5} fill={K.ember} stroke={K.ink} strokeWidth={9} paintOrder="stroke" />
          <circle cx={base.x - 2.6} cy={base.y - 36.6} r={2.6} fill={K.white} />
        </g>
        <Sticker ds={s.body} fill={K.shade} />
        <g clipPath={clip}>
          <polygon points={pts([CUBE.A, CUBE.B, CUBE.Cc, CUBE.G])} fill={K.light} />
          <rect x={CUBE.A.x} y={CUBE.A.y} width={CUBE.G.x - CUBE.A.x} height={CUBE.F.y - CUBE.A.y} fill={K.body} />
        </g>
        <path d={rrect(sc.x0, sc.y0, sc.x1, sc.y1, sc.r)} fill={K.screen} />
        <Highlight c={v(sc.x0 + sc.r, sc.y0 + sc.r)} r={sc.r - 8} a0={192} a1={256} dot={276} w={5} />
        <circle cx={-76} cy={-55} r={5} fill={K.ember} stroke={K.ink} strokeWidth={6} paintOrder="stroke" />
      </g>
    );
  }
  return (
    <g>
      <Sticker ds={s.body} fill={K.body} />
      <Crescent ds={s.body} clip={clip} />
      <Highlight c={ORB.c} r={77} a0={198} a1={240} dot={255} />
    </g>
  );
};

// The orb's floating mitts (in front of the body, outside the shell).
export const Hands: React.FC<{ ps: [V, V] }> = ({ ps }) => (
  <g>
    {ps.map((p, i) => (
      <g key={i}>
        <circle cx={p.x} cy={p.y} r={14} fill={K.body} stroke={K.ink} strokeWidth={OUT * 2 - 2} paintOrder="stroke" />
        <path d={`M${p.x - 9} ${p.y + 6}Q${p.x} ${p.y + 13} ${p.x + 9} ${p.y + 6}`} fill="none" stroke={K.shade} strokeWidth={4} strokeLinecap="round" />
      </g>
    ))}
  </g>
);
