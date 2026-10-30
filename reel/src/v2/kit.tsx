// The motion-graphics kit: rings, glints, trim-path ribbons, and the hole in a
// full-frame cover (wipes and the iris).

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

// A round glint: a dot that pops, then opens into a thin ring and fades (no
// four-point stars: that glyph belongs to another AI brand).
export const Sparkle: React.FC<{ f: number; s: SparkView }> = ({ f, s }) => {
  const p = (f - s.t0) / 14;
  if (p <= 0 || p >= 1) return null;
  const dot = s.size * 0.42 * (p < 0.3 ? easeOutBack(p / 0.3) : 1 - easeInCubic((p - 0.3) / 0.7));
  return (
    <g>
      <circle cx={s.x} cy={s.y} r={Math.max(0, dot)} fill={s.color} />
      <circle cx={s.x} cy={s.y} r={s.size * (0.4 + 0.9 * easeOutCubic(p))} fill="none" stroke={s.color} strokeWidth={4 * (1 - p)} />
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

// The whole frame minus a circle (fill it with fillRule evenodd).
export const holeD = (c: Circle) =>
  `M-40 -40H1120V1960H-40Z M${c.x - c.r} ${c.y}a${c.r} ${c.r} 0 1 0 ${2 * c.r} 0a${c.r} ${c.r} 0 1 0 ${-2 * c.r} 0Z`;
