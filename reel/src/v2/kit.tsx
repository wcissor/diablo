// The motion-graphics kit: rings, sparkles, trim-path ribbons, impact bursts,
// and the hole in a full-frame cover (wipes and the iris).

import React from 'react';
import { easeInCubic, easeOutBack, easeOutCubic } from '../lib/anim';
import type { Circle, RingView, SparkView } from './timeline';

// Rings that burst out from a point and thin away (16 frames each, 3 apart).
export const Rings: React.FC<{ f: number; ring: RingView }> = ({ f, ring }) => {
  const { x, y, t0, r0 = 0, r1, color, width, n = 2 } = ring;
  return (
    <g>
      {Array.from({ length: n }, (_, k) => {
        const p = (f - t0 - k * 3) / 16;
        if (p <= 0 || p >= 1) return null;
        const r = r0 + (r1 - r0) * easeOutCubic(p) * (1 - 0.16 * k);
        return <circle key={k} cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={width * Math.pow(1 - p, 1.3)} />;
      })}
    </g>
  );
};

// A four-point star with pinched sides.
const star = (r: number) => {
  const c = r * 0.12;
  return `M0 ${-r}Q${c} ${-c} ${r} 0Q${c} ${c} 0 ${r}Q${-c} ${c} ${-r} 0Q${-c} ${-c} 0 ${-r}Z`;
};
export const Sparkle: React.FC<{ f: number; s: SparkView }> = ({ f, s }) => {
  const p = (f - s.t0) / 14;
  if (p <= 0 || p >= 1) return null;
  const k = p < 0.35 ? easeOutBack(p / 0.35) : 1 - easeInCubic((p - 0.35) / 0.65);
  return <path d={star(s.size)} fill={s.color} transform={`translate(${s.x} ${s.y}) rotate(${p * 90}) scale(${Math.max(0, k)})`} />;
};

// A stroke drawn between a and b of its length (0..1): the trim-path ribbon.
export const Ribbon: React.FC<{ d: string; a: number; b: number; width: number; color: string; opacity?: number }> = ({ d, a, b, width, color, opacity = 1 }) =>
  b - a > 0.002 ? (
    <path
      d={d}
      pathLength={1}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${b - a} 3`}
      strokeDashoffset={-a}
      opacity={opacity}
    />
  ) : null;

// Impact lines flying out from a hit (9 frames).
export const Burst: React.FC<{ f: number; t0: number; x: number; y: number; color: string; n?: number; r0?: number; r1?: number; width?: number }> = ({
  f,
  t0,
  x,
  y,
  color,
  n = 10,
  r0 = 50,
  r1 = 190,
  width = 9,
}) => {
  const p = (f - t0) / 9;
  if (p <= 0 || p >= 1) return null;
  const outer = r0 + (r1 - r0) * easeOutCubic(p);
  const inner = r0 + (r1 - r0) * easeInCubic(p);
  return (
    <g stroke={color} strokeWidth={width * (1 - 0.5 * p)} strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI + 0.3;
        const l = i % 2 ? 0.72 : 1;
        return <line key={i} x1={x + Math.cos(a) * inner * l} y1={y + Math.sin(a) * inner * l} x2={x + Math.cos(a) * outer * l} y2={y + Math.sin(a) * outer * l} />;
      })}
    </g>
  );
};

// The whole frame minus a circle (fill it with fillRule evenodd).
export const holeD = (c: Circle) =>
  `M-40 -40H1120V1960H-40Z M${c.x - c.r} ${c.y}a${c.r} ${c.r} 0 1 0 ${2 * c.r} 0a${c.r} ${c.r} 0 1 0 ${-2 * c.r} 0Z`;
