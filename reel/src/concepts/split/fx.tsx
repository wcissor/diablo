// Small flat effects: the four-point sparkle (the reel's own star shape) and keyframes.

import React from 'react';
import { smooth } from '../../lib/anim';
import { fx } from './geom';

export const starD = (r: number) => {
  const c = fx(r * 0.13);
  const R = fx(r);
  return `M0 ${-R}Q${c} ${-c} ${R} 0Q${c} ${c} 0 ${R}Q${-c} ${c} ${-R} 0Q${-c} ${-c} 0 ${-R}Z`;
};

export const Star: React.FC<{ x: number; y: number; r: number; rot?: number; fill: string; stroke?: string; sw?: number }> = ({
  x,
  y,
  r,
  rot = 0,
  fill,
  stroke,
  sw = 0,
}) =>
  r > 0.3 ? (
    <path
      d={starD(r)}
      transform={`translate(${fx(x)} ${fx(y)}) rotate(${fx(rot)})`}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? sw : undefined}
      strokeLinejoin="round"
      paintOrder="stroke"
    />
  ) : null;

// Piecewise keyframes with smoothstep between them: [[t, v], ...].
export const keys = (t: number, k: [number, number][]) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1] = k[i];
      return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
    }
  }
  return k[k.length - 1][1];
};
