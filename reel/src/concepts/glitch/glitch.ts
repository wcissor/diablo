// The digital glitch as pure functions of (kind, hitT, seal, sealT, frame).
// The hit is stepped per whole frame, like corrupted video: the bot slices into
// horizontal bands that jump sideways with ember/white ghosts, then settles into
// ONE zig-zag bug line with a few pixels drifting off it.

import { clamp, easeInCubic, easeOutBack, easeOutCubic, rnd } from '../../lib/anim';
import type { BotKind } from '../_kit/types';
import { add, mixPt, mul, P, polyAt, type Pt } from './kit';
import { type Bug, zigzag } from './shapes';

/** How hard the picture is tearing on this frame (0 = clean). */
export const tearAt = (hitT: number, sealing: boolean) => {
  const t = Math.floor(hitT);
  const main = [1, 0.8, 0.55, 0.3, 0.14][t];
  if (main !== undefined) return main;
  if (sealing) return 0;
  if (t === 8) return 0.22; // aftershocks
  if (t === 11) return 0.12;
  if (t >= 22 && (t - 22) % 29 < 2) return 0.1; // the damaged bot twitches now and then
  return 0;
};

export interface Band {
  y0: number;
  y1: number;
  dx: number;
}
/** The horizontal slices for this frame, each with its sideways jump. */
export const bandsAt = (kind: BotKind, hitT: number, amp: number): Band[] => {
  const t = Math.floor(hitT);
  const s = `${kind}-band-${t}`;
  if (amp <= 0.12) {
    // a single thin sliver slips
    const y = -200 + rnd(`${s}-y`) * 150;
    const h = 14 + rnd(`${s}-h`) * 16;
    const dx = (rnd(`${s}-d`) > 0.5 ? 1 : -1) * (5 + 3 * rnd(`${s}-m`));
    return [
      { y0: -400, y1: y, dx: 0 },
      { y0: y, y1: y + h, dx },
      { y0: y + h, y1: 60, dx: 0 },
    ];
  }
  const n = amp > 0.5 ? 4 : 3;
  const cuts: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const lo = -214 + (i * 170) / (n - 1);
    cuts.push(lo + (170 / (n - 1)) * (0.2 + 0.6 * rnd(`${s}-c${i}`)));
  }
  const ys = [-400, ...cuts, 60];
  const sign0 = rnd(`${s}-sg`) > 0.5 ? 1 : -1;
  return ys.slice(1).map((y1, i) => ({
    y0: ys[i],
    y1,
    dx: amp * 26 * (i % 2 ? -sign0 : sign0) * (0.35 + 0.65 * rnd(`${s}-d${i}`)),
  }));
};

export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  c: number; // colour slot 0..2
}
/** Loose data blocks flung out beside the bot on the first frames of the hit. */
export const blocksAt = (kind: BotKind, hitT: number): Block[] => {
  const t = Math.floor(hitT);
  const n = [6, 5, 3, 2][t] ?? 0;
  return Array.from({ length: n }, (_, i) => {
    const s = `${kind}-blk-${t}-${i}`;
    const side = i % 2 ? 1 : -1;
    return {
      x: side * (70 + rnd(`${s}x`) * 70) - (side < 0 ? 40 : 0),
      y: -220 + rnd(`${s}y`) * 190,
      w: 18 + rnd(`${s}w`) * 46,
      h: 4 + Math.round(rnd(`${s}h`) * 2) * 3,
      c: i % 3,
    };
  });
};

/* ───────── pixels drifting off the bug line ───────── */
export interface PixelDef {
  u: number; // where on the line it comes from (0..1)
  dir: Pt;
  far: number;
  size: number;
  c: 'ember' | 'ink' | 'white';
  phase: number;
}
// Solid ember and night bits on the shell; the one white bit drifts furthest, out
// into the air, where white reads.
const PIXEL_LOOK: { size: number; c: PixelDef['c']; far: number }[] = [
  { size: 12, c: 'ember', far: 14 },
  { size: 10, c: 'ink', far: 22 },
  { size: 12, c: 'white', far: 44 },
  { size: 9, c: 'ember', far: 30 },
  { size: 8, c: 'ink', far: 16 },
];
export const pixelDefs = (kind: BotKind, bug: Bug): PixelDef[] =>
  PIXEL_LOOK.map((p, j) => {
    const s = `${kind}-px-${j}`;
    // most come off the far half of the line, where the slash left the shell
    const u = j === 4 ? 0.22 : 0.45 + (0.5 * (j + 0.3 + 0.4 * rnd(`${s}u`))) / 4;
    const dir = add(mul(bug.n, 1), add(mul(bug.u, 0.25 + (rnd(`${s}a`) - 0.5) * 0.8), P(0, -0.3)));
    const l = Math.hypot(dir.x, dir.y);
    return { u, dir: P(dir.x / l, dir.y / l), far: p.far + rnd(`${s}f`) * 8, size: p.size, c: p.c, phase: rnd(`${s}p`) * 6.28 };
  });

export interface PixelView {
  x: number;
  y: number;
  size: number;
  c: PixelDef['c'];
  white: boolean; // snapping home, it turns into seam
}
/** Where each pixel is: popped off the line after the hit, home again as the seam passes. */
export const pixelsAt = (defs: PixelDef[], bug: Bug, hitT: number, frame: number, head: number): PixelView[] => {
  const line = zigzag(bug);
  const out: PixelView[] = [];
  defs.forEach((p, j) => {
    const born = 3 + j * 0.8;
    const pop = clamp((hitT - born) / 4);
    if (pop <= 0) return;
    const home = polyAt(line, p.u);
    const drift = easeOutCubic(clamp((hitT - born) / 12)) * p.far + Math.sin(frame * 0.13 + p.phase) * 3 * pop;
    let at = add(home, mul(p.dir, drift));
    // the seam's head reaches this pixel: it flies home and is gone
    const q = clamp((head - (p.u - 0.16)) / 0.16);
    if (q >= 1) return;
    at = mixPt(at, home, easeInCubic(q));
    const blinkOff = q === 0 && (Math.floor(frame / 3) + j * 5) % 13 === 0;
    if (blinkOff) return;
    const size = p.size * (q > 0 ? 1 - 0.45 * q : easeOutBack(pop, 2.4));
    out.push({ x: at.x, y: at.y, size, c: p.c, white: q > 0.35 });
  });
  return out;
};

/* ───────── body motion ───────── */
/** The knock: pushed along the slash, squashed, then springing back. */
export const knockAt = (hitT: number | undefined) => {
  if (hitT === undefined || hitT < 0) return { push: 0, squash: 0 };
  const t = hitT;
  return {
    push: Math.exp(-t / 3) * Math.cos(t * 0.55),
    squash: Math.exp(-t / 2.6) * Math.cos(t * 0.95),
  };
};

/** The cheer once the seam has closed: a hop with a stretch, a landing squash. */
export const cheerAt = (sealT: number | undefined) => {
  if (sealT === undefined || sealT < 0) return { hop: 0, land: 0 };
  const t = sealT;
  return {
    hop: t < 10 ? Math.sin((Math.PI * t) / 10) : 0,
    land: t >= 10 && t < 17 ? Math.sin((Math.PI * (t - 10)) / 7) * Math.exp(-(t - 10) / 6) : 0,
  };
};

/** Pixel confetti from the seam as it closes. */
export const confettiAt = (kind: BotKind, bug: Bug, sealT: number | undefined) => {
  if (sealT === undefined || sealT < 0 || sealT > 18) return [];
  const p = clamp(sealT / 18);
  return Array.from({ length: 9 }, (_, i) => {
    const s = `${kind}-cf-${i}`;
    const from = mixPt(bug.a, bug.b, (i + 0.5) / 9);
    const ang = (-90 + (rnd(`${s}a`) - 0.5) * 150) * (Math.PI / 180);
    const d = (40 + rnd(`${s}d`) * 64) * easeOutCubic(p);
    const size = (9 + Math.round(rnd(`${s}s`) * 2) * 3) * (1 - easeInCubic(clamp((sealT - 6) / 12)));
    return { x: from.x + Math.cos(ang) * d + bug.n.x * 6, y: from.y + Math.sin(ang) * d + bug.n.y * 6, size, c: i % 3 };
  }).filter((c) => c.size > 0.5);
};
