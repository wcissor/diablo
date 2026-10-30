// The three bots' proportions, faces and cuts. Feet at (0, 0), y up is negative,
// everything inside BOT_BOX (x −120..120, y −250..0).

import { C } from '../../theme';
import { SLASH_DIR, type BotKind } from '../_kit/types';
import { makeCut, type Cut, type Pt, type Shape } from './geom';

export const OW = 5; // the ink outline, px outside every shape

export interface Spec {
  body: Shape; // the shell the cut goes through
  eyes: { y: number; dx: number; rx: number; ry: number };
  mouth: Pt;
  blush: { y: number; dx: number; rx: number; ry: number } | null;
  clear: number; // the cut passes this far above the eye nearest to it
  pivot: Pt; // squash and lean pivot
  shade: Pt; // the lit shape is the body shifted by this; the crescent left over is the shade
  shadow: { rx: number; ry: number };
  look: Pt; // px the eyes travel for look = 1
}

export const SPEC: Record<BotKind, Spec> = {
  bubble: {
    body: { t: 'sq', cx: 0, cy: -122, a: 108, b: 92, n: 3 },
    eyes: { y: -104, dx: 38, rx: 17, ry: 23 },
    mouth: { x: 0, y: -71 },
    blush: { y: -80, dx: 68, rx: 13.5, ry: 8 },
    clear: 39,
    pivot: { x: 0, y: 0 },
    shade: { x: -10, y: -12 },
    shadow: { rx: 100, ry: 8 },
    look: { x: 5, y: 4 },
  },
  cube: {
    body: { t: 'rr', x0: -98, y0: -206, x1: 98, y1: -32, r: 30 },
    eyes: { y: -118, dx: 31, rx: 13.5, ry: 18 },
    mouth: { x: 0, y: -87 },
    blush: null,
    clear: 35,
    pivot: { x: 0, y: 0 },
    shade: { x: -10, y: -10 },
    shadow: { rx: 98, ry: 8 },
    look: { x: 7, y: 5 },
  },
  orb: {
    body: { t: 'ci', cx: 0, cy: -142, r: 90 },
    eyes: { y: -131, dx: 32, rx: 16, ry: 21.5 },
    mouth: { x: 0, y: -97 },
    blush: { y: -105, dx: 59, rx: 12.5, ry: 7.5 },
    clear: 46,
    pivot: { x: 0, y: -142 },
    shade: { x: -14, y: -16 },
    shadow: { rx: 64, ry: 7 },
    look: { x: 5, y: 4 },
  },
};

// The cut passes `clear` px above the eye nearest to it, along SLASH_DIR.
const cutFor = (k: BotKind): Cut => {
  const s = SPEC[k];
  const deg = SLASH_DIR[k];
  const r = (deg * Math.PI) / 180;
  let n = { x: Math.sin(r), y: -Math.cos(r) };
  if (n.y > 0) n = { x: -n.x, y: -n.y };
  const side = n.x >= 0 ? 1 : -1;
  return makeCut(deg, s.body, OW, { x: side * s.eyes.dx, y: s.eyes.y }, s.clear);
};
export const CUTS: Record<BotKind, Cut> = { bubble: cutFor('bubble'), cube: cutFor('cube'), orb: cutFor('orb') };

/* ───────── colour: the reel's palette and mixes of it ───────── */

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a: string, b: string, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

export interface Pal {
  ink: string;
  body: string;
  shade: string;
  light: string;
  screen: string;
  bezel: string;
  blush: string;
  tongue: string;
  ground: string;
  fx: string;
  led: string;
}

export const palette = (bg: 'white' | 'maroon'): Pal => ({
  ink: C.night,
  body: mix(C.porcelain, C.white, 0.12),
  shade: mix(C.porcelain, C.maroon, 0.13),
  light: C.white,
  screen: C.night,
  bezel: mix(C.night, C.porcelain, 0.13),
  blush: mix(C.ember, C.white, 0.6),
  tongue: mix(C.ember, C.white, 0.3),
  ground: bg === 'white' ? mix(C.white, C.maroon, 0.12) : mix(C.maroon, C.night, 0.55),
  fx: bg === 'white' ? C.maroon : C.white,
  led: C.ember,
});
