// The motion-graphics kit: rings, glints, trim-path ribbons, and the hole in a
// full-frame cover (wipes and the iris).

import React from 'react';
import { easeInCubic, easeOutBack, easeOutCubic } from '../lib/anim';
import type { Pt } from '../lib/anim';
import type { Arc, Circle, RingView, SparkView } from './timeline';

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

// A round glint: a dot pops and shrinks away, then a thin ring opens where it
// was (never both at once: a dot in a ring reads as an eye). No four-point
// stars: that glyph belongs to another AI brand.
export const Sparkle: React.FC<{ f: number; s: SparkView }> = ({ f, s }) => {
  const p = (f - s.t0) / 14;
  if (p <= 0 || p >= 1) return null;
  const dot = s.size * 0.42 * (p < 0.25 ? easeOutBack(p / 0.25) : 1 - easeInCubic(Math.min(1, (p - 0.25) / 0.25)));
  const q = (p - 0.45) / 0.55;
  return (
    <g>
      {dot > 0.3 ? <circle cx={s.x} cy={s.y} r={dot} fill={s.color} /> : null}
      {q > 0 ? <circle cx={s.x} cy={s.y} r={s.size * (0.35 + 0.85 * easeOutCubic(q))} fill="none" stroke={s.color} strokeWidth={4.5 * (1 - q)} /> : null}
    </g>
  );
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

// A blade swipe along a quadratic arc, drawn between a and b of its length
// (0..1): a filled sliver, sharp at the tail and full width at the round head.
export const Blade: React.FC<{ arc: Arc; a: number; b: number; width: number; color: string }> = ({ arc, a, b, width, color }) => {
  if (b - a < 0.01) return null;
  const { p0, c, p1 } = arc;
  const at = (u: number): Pt => ({
    x: (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * c.x + u * u * p1.x,
    y: (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * c.y + u * u * p1.y,
  });
  const N = 20;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = a + ((b - a) * i) / N;
    const tx = 2 * (1 - u) * (c.x - p0.x) + 2 * u * (p1.x - c.x);
    const ty = 2 * (1 - u) * (c.y - p0.y) + 2 * u * (p1.y - c.y);
    const l = Math.hypot(tx, ty) || 1;
    const w = (width / 2) * Math.pow(i / N, 0.7);
    const p = at(u);
    left.push({ x: p.x - (ty / l) * w, y: p.y + (tx / l) * w });
    right.push({ x: p.x + (ty / l) * w, y: p.y - (tx / l) * w });
  }
  const n = (q: Pt) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  const r = (width / 2).toFixed(1);
  return <path d={`M${left.map(n).join('L')}A${r} ${r} 0 0 0 ${n(right[N])}L${right.reverse().map(n).join('L')}Z`} fill={color} />;
};

// The whole frame minus a circle (fill it with fillRule evenodd).
export const holeD = (c: Circle) =>
  `M-40 -40H1120V1960H-40Z M${c.x - c.r} ${c.y}a${c.r} ${c.r} 0 1 0 ${2 * c.r} 0a${c.r} ${c.r} 0 1 0 ${-2 * c.r} 0Z`;
