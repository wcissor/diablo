// Motion helpers: everything is a pure function of the frame, so any frame can
// be rendered on its own (and sub-frames, for motion blur).

import { random } from 'remotion';

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const smooth = (t: number) => t * t * (3 - 2 * t);

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInQuart = (t: number) => t * t * t * t;
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
// Overshoot and settle.
export const easeOutBack = (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
// Anticipation: dips back before it goes.
export const easeInBack = (t: number, s = 1.70158) => (s + 1) * t * t * t - s * t * t;

// 0 → 1 between frames a and b with an easing.
export const ramp = (frame: number, a: number, b: number, ease: (t: number) => number = smooth) =>
  ease(invLerp(a, b, frame));

// A damped spring from 0 to 1 starting at frame `start`: overshoots, then
// settles. `freq` in Hz, `damping` 0–1. Deterministic and sub-frame safe.
export const settle = (frame: number, start: number, freq = 2.2, damping = 0.42, fps = 30) => {
  const t = (frame - start) / fps;
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const zeta = damping;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
};

// Seeded randomness that is stable across renders.
export const rnd = (seed: string | number) => random(seed);
export const rndRange = (seed: string | number, a: number, b: number) => a + (b - a) * random(seed);

// A smooth deterministic wobble (sum of sines) for trembling and idle motion.
export const wobble = (frame: number, seed: number, speed = 1) =>
  Math.sin(frame * 0.37 * speed + seed * 1.7) * 0.6 + Math.sin(frame * 0.91 * speed + seed * 4.1) * 0.4;

export type Pt = { x: number; y: number };
