// Flat comic effects: the hit-spark star burst, the triangular chips, twinkles and zaps.
// Every effect is a pure function of its clock (frames) and a numeric seed.

import React from 'react';
import { clamp, easeOutCubic, smooth } from '../../lib/anim';
import { P } from './palette';
import { add, dirDeg, hash, mul, pt, rotate, v2, type V } from './geom';

const n2 = (x: number) => Math.round(x * 100) / 100;

// A spiky comic star: n points alternating long and short, jittered by seed.
export const starPath = (R: number, n: number, inner: number, seed: number, rot = 0) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const tip = i % 2 === 0;
    const a = ((rot + (i * 180) / n + (tip ? (hash(seed, i) - 0.5) * 14 : 0)) * Math.PI) / 180;
    const r = tip ? R * (i % 4 === 0 ? 1 : 0.7) * (0.9 + 0.2 * hash(seed + 7, i)) : R * inner;
    d += `${i ? 'L' : 'M'}${n2(Math.cos(a) * r)} ${n2(Math.sin(a) * r)}`;
  }
  return d + 'Z';
};

// A four-point twinkle with concave sides.
export const twinkle = (R: number, waist = 0.22) => {
  const w = R * waist;
  return `M0 ${-R}Q${w} ${-w} ${R} 0Q${w} ${w} 0 ${R}Q${-w} ${w} ${-R} 0Q${-w} ${-w} 0 ${-R}Z`;
};

// The hit-spark: frame 0 a solid white star with an ember core, frame 1 bigger,
// frame 2 a hollow star ring with speed lines, frame 3 the lines alone.
export const Burst: React.FC<{ at: V; ang: number; k: number; seed: number }> = ({ at, ang, k, seed }) => {
  if (k < 0 || k >= 4) return null;
  const f = Math.floor(k);
  const R = [64, 76, 82, 0][f];
  const star = starPath(R, 9, 0.44, seed, ang);
  const rays = Array.from({ length: 7 }, (_, i) => {
    const a = ang + 18 + i * (360 / 7) + (hash(seed, 40 + i) - 0.5) * 20;
    const r0 = [0, 0, 86, 104][f] * (0.95 + 0.1 * hash(seed, 60 + i));
    const r1 = r0 + [0, 0, 26, 14][f];
    const u = dirDeg(a);
    return { a: mul(u, r0), b: mul(u, r1) };
  });
  return (
    <g transform={`translate(${pt(at)})`}>
      {f <= 1 ? (
        <>
          <path d={star} fill={P.white} stroke={P.ink} strokeWidth={10} strokeLinejoin="round" paintOrder="stroke" />
          <path d={starPath(R * (f === 0 ? 0.5 : 0.34), 7, 0.48, seed + 3, ang + 13)} fill={P.ink} />
        </>
      ) : null}
      {f === 2 ? (
        <>
          <path d={star} fill="none" stroke={P.ink} strokeWidth={13} strokeLinejoin="round" />
          <path d={star} fill="none" stroke={P.white} strokeWidth={6} strokeLinejoin="round" />
        </>
      ) : null}
      {f >= 2
        ? rays.map((r, i) => (
            <g key={i}>
              <line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke={P.ink} strokeWidth={f === 2 ? 12 : 9} strokeLinecap="round" />
              <line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke={P.white} strokeWidth={f === 2 ? 5.5 : 3.5} strokeLinecap="round" />
            </g>
          ))
        : null}
    </g>
  );
};

// Clean triangular chips knocked off the shell: they pop out, spin, fall and
// land on the stage line, then shrink away.
export const Chips: React.FC<{ at: V; out: V; k: number; seed: number; fill: string }> = ({ at, out, k, seed, fill }) => {
  if (k < 0 || k > 17) return null;
  const base = (Math.atan2(out.y, out.x) * 180) / Math.PI;
  const chips = [
    { da: -42, sp: 9.5, spin: 31, s: 16 },
    { da: 6, sp: 11.5, spin: -36, s: 20 },
    { da: 50, sp: 8, spin: 24, s: 12 },
  ];
  return (
    <g>
      {chips.map((c, i) => {
        const a = base + c.da + (hash(seed, i) - 0.5) * 16;
        const vel = add(mul(dirDeg(a), c.sp), v2(0, -3));
        const t = k + 0.6; // they leave on the impact frame
        let p = add(at, add(mul(vel, t), v2(0, 0.5 * 2.1 * t * t)));
        const floor = -c.s * 0.45;
        let r = c.spin * t;
        if (p.y > floor) {
          p = v2(p.x, floor);
          r = c.spin * 6;
        }
        const sc = 1 - smooth(clamp((k - 11) / 6));
        if (sc <= 0.01) return null;
        const tri = [-90, 38, 158].map((q, j) => rotate(v2(c.s * [1, 0.86, 0.72][j], 0), q + (hash(seed, 9 + i * 3 + j) - 0.5) * 18));
        const d = tri.map((q, j) => `${j ? 'L' : 'M'}${pt(q)}`).join('') + 'Z';
        return (
          <g key={i} transform={`translate(${pt(p)}) rotate(${n2(r)}) scale(${n2(sc)})`}>
            <path d={d} fill={fill} stroke={P.ink} strokeWidth={4.5} strokeLinejoin="round" paintOrder="stroke" />
          </g>
        );
      })}
    </g>
  );
};

// A twinkle that pops (scale 0 → 1 → 0 over `life` frames), white with an ink rim.
export const Pop: React.FC<{ at: V; t: number; life: number; R: number; spin?: number; rim?: boolean }> = ({ at, t, life, R, spin = 0, rim = true }) => {
  if (t < 0 || t > life) return null;
  const u = t / life;
  const s = u < 0.35 ? easeOutCubic(u / 0.35) : 1 - smooth((u - 0.35) / 0.65);
  if (s <= 0.01) return null;
  return (
    <path
      transform={`translate(${pt(at)}) rotate(${n2(spin * t)}) scale(${n2(s)})`}
      d={twinkle(R)}
      fill={P.white}
      stroke={rim ? P.ink : 'none'}
      strokeWidth={rim ? 4 / Math.max(0.3, s) : 0}
      strokeLinejoin="round"
      paintOrder="stroke"
    />
  );
};

// A little electric zap: a white zigzag with an ink rim, flickering for 3 frames.
export const Zap: React.FC<{ at: V; dir: V; t: number; seed: number; size?: number }> = ({ at, dir, t, seed, size = 22 }) => {
  if (t < 0 || t >= 3) return null;
  const f = Math.floor(t);
  const n = v2(-dir.y, dir.x);
  const pts: V[] = [at];
  for (let i = 1; i <= 4; i++) {
    const along = (size * i) / 4;
    const side = (i % 2 ? 1 : -1) * size * 0.22 * (0.7 + 0.6 * hash(seed + f, i));
    pts.push(add(at, add(mul(dir, along * (0.8 + 0.25 * f)), mul(n, i === 4 ? 0 : side))));
  }
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${pt(q)}`).join('');
  return (
    <g>
      <path d={d} fill="none" stroke={P.ink} strokeWidth={8.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={P.white} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
};
