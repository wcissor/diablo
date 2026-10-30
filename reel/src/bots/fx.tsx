// Small flat effects, all pure functions of their clocks: keyframes, round
// flashes, the chips, the crack's spark and pixels, the weld bead and the
// circuit pads. Round shapes, rings, dots and squares only: no four-point
// sparkles, and nothing that can read as a letter.

import React from 'react';
import { clamp, easeOutCubic, smooth } from '../lib/anim';
import { add, centroid, fx, hash, pt, rotate, sub, type Pt } from './geom';

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

// A round flash: a disc, with an ink rim when it sits on porcelain.
export const Dot: React.FC<{ at: Pt; r: number; fill: string; rim?: string; rimW?: number }> = ({ at, r, fill, rim, rimW = 2.5 }) =>
  r > 0.3 ? <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(r)} fill={fill} stroke={rim} strokeWidth={rim ? rimW : undefined} paintOrder="stroke" /> : null;

// A thin ring, white with ink edges (or plain).
export const Ring: React.FC<{ at: Pt; r: number; w: number; color: string; rim?: string }> = ({ at, r, w, color, rim }) =>
  r > 0.5 && w > 0.2 ? (
    <g>
      {rim ? <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(r)} fill="none" stroke={rim} strokeWidth={fx(w + 3)} /> : null}
      <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(r)} fill="none" stroke={color} strokeWidth={fx(w)} />
    </g>
  ) : null;

/* ───────── the chips ───────── */

// 2–3 clean triangular chips pop off the notch on the hit with only a small hop
// (a few px), spin and FALL: each is back below its launch point by about hitT
// 3 and still dropping as it shrinks away over hitT 6..10, so none hangs in the
// air. A chip that reaches the floor lands on it (the stage line is y 0) and
// skids a little instead of falling through it. The first is the V knocked out
// of the edge.
const CHIPS = [
  { da: 4, sp: 4.2, up: 3.2, spin: 30 },
  { da: -30, sp: 5.2, up: 3.4, spin: -40 },
  { da: 40, sp: 4.8, up: 2.2, spin: 36 },
];
const GRAVITY = 2.6; // px/frame²
const FLOOR = -7; // a landed chip's centre, just above the stage line

// Where chip i is at hitT t: position, spin (degrees) and scale.
export const chipAt = (i: number, t: number, from: Pt, out: Pt, seed: number) => {
  const c = CHIPS[i];
  const a = (Math.atan2(out.y, out.x) * 180) / Math.PI + c.da + (hash(seed, i) - 0.5) * 14;
  const v = rotate({ x: c.sp, y: 0 }, a);
  const vy = v.y - c.up;
  const k = t + 0.7; // they leave on the impact frame
  const drop = FLOOR - from.y;
  const kl = drop > 0 ? (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY : 0; // when it lands
  const landed = drop > 0 && k > kl;
  const kx = landed ? kl + 0.3 * (k - kl) : k; // it skids to a stop
  return {
    p: { x: from.x + v.x * kx, y: landed ? FLOOR : from.y + vy * k + 0.5 * GRAVITY * k * k },
    rot: c.spin * kx,
    sc: 1 - smooth(clamp((t - 6) / 4)),
  };
};

export const Chips: React.FC<{ at: Pt; out: Pt; t: number; seed: number; vchip: Pt[]; fill: string; ink: string }> = ({ at, out, t, seed, vchip, fill, ink }) => {
  if (t < 0 || t >= 10) return null;
  const cv = centroid(vchip);
  return (
    <g>
      {CHIPS.map((_, i) => {
        const s = chipAt(i, t, i === 0 ? cv : at, out, seed);
        if (s.sc <= 0.02) return null;
        const size = [0, 11, 8.5][i];
        const tri =
          i === 0
            ? vchip.map((q) => sub(q, cv))
            : [-90, 34, 152].map((q, j) => rotate({ x: size * [1, 0.82, 0.7][j], y: 0 }, q + (hash(seed, 9 + i * 3 + j) - 0.5) * 22));
        const d = tri.map((q, j) => `${j ? 'L' : 'M'}${pt(q)}`).join('') + 'Z';
        return (
          <path
            key={i}
            transform={`translate(${pt(s.p)}) rotate(${fx(s.rot)}) scale(${fx(s.sc)})`}
            d={d}
            fill={fill}
            stroke={ink}
            strokeWidth={3.6}
            strokeLinejoin="round"
            paintOrder="stroke"
          />
        );
      })}
    </g>
  );
};

/* ───────── the crack's spark while it waits to be fixed ───────── */

// A tiny white spark in the crack: one round flash that flickers up and goes
// (r 2.4 → 5 → 2 → 0 over frames 0–2). A plain dot on purpose: zigzags read as
// letters at the lens's zoom, and a ring cut by the crack's edges read as a U
// or a C. The pixels that drift out after it carry the motion.
export const Fizz: React.FC<{ at: Pt; t: number; color: string }> = ({ at, t, color }) => {
  if (t < 0 || t >= 3) return null;
  const r = keys(t, [
    [0, 2.4],
    [1, 5],
    [2, 2],
    [2.6, 0],
  ]);
  return r > 0.3 ? <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(r)} fill={color} /> : null;
};

// 2–3 small white pixels that drift out of the crack after the spark and fade.
export const Pixels: React.FC<{ from: Pt[]; out: Pt; t: number; seed: number; color: string; rim?: string }> = ({ from, out, t, seed, color, rim }) => {
  if (t < 0 || t > 24) return null;
  return (
    <g>
      {from.map((p0, j) => {
        const k = clamp((t - 1 - j * 2.5) / 18);
        if (k <= 0 || k >= 1) return null;
        const drift = rotate(out, (hash(seed, j) - 0.5) * 50);
        const p = add(add(p0, drift, 4 + 26 * easeOutCubic(k)), { x: 0, y: -10 * k });
        const z = (j === 1 ? 4.5 : 3.6) * (1 - smooth(clamp((k - 0.45) / 0.55)));
        return z > 0.6 ? (
          <rect key={j} x={fx(p.x - z / 2)} y={fx(p.y - z / 2)} width={fx(z)} height={fx(z)} fill={color} stroke={rim} strokeWidth={rim ? 1.4 : undefined} paintOrder="stroke" />
        ) : null;
      })}
    </g>
  );
};

/* ───────── the fix ───────── */

// The weld head that leads the white down the bolt: one bright round bead
// (white, with a thin ink rim so it reads on porcelain), pulsing a little.
export const WeldHead: React.FC<{ at: Pt; pulse: number; light: string; ink: string }> = ({ at, pulse, light, ink }) => (
  <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(7.8 + 1.1 * pulse)} fill={light} stroke={ink} strokeWidth={5} paintOrder="stroke" />
);

// A circuit-terminal pad: a small white ring pad with an ink rim and a hole.
export const Pad: React.FC<{ at: Pt; r: number; light: string; ink: string; hole: string; rim?: number }> = ({ at, r, light, ink, hole, rim = 2.6 }) =>
  r > 0.4 ? (
    <g>
      <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(r + rim)} fill={ink} />
      <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(r)} fill={light} />
      <circle cx={fx(at.x)} cy={fx(at.y)} r={fx(r * 0.38)} fill={hole} />
    </g>
  ) : null;
