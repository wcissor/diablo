// The three bots' proportions and faces (split's characters), the palette, and
// where each one is chipped (the slash line, the notch, the bolt crack).
// Feet at (0, 0), y up is negative, resting states inside BOT_BOX (x −120..120,
// y −250..0).

import { C } from '../theme';
import { SLASH_DIR, type BotKind } from './kit/types';
import { add, dirDeg, grow, inside, mkLine, perp, pointAt, span, tangentAt, type Line, type Pt, type Shape } from './geom';

export const OW = 5; // the ink outline, px outside every shape

export interface Spec {
  body: Shape; // the shell
  eyes: { y: number; dx: number; rx: number; ry: number };
  mouth: Pt;
  blush: { y: number; dx: number; rx: number; ry: number } | null;
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
    pivot: { x: 0, y: 0 },
    shade: { x: -10, y: -12 },
    shadow: { rx: 100, ry: 8 },
    look: { x: 5, y: 4 },
  },
  // Split's squat TV-head (its screen 90 px tall, near split's 98), raised so
  // the cube has a chin below it, where the slash chips it, clear of the face.
  cube: {
    body: { t: 'rr', x0: -98, y0: -210, x1: 98, y1: -30, r: 30 },
    eyes: { y: -144, dx: 31, rx: 13.5, ry: 18 },
    mouth: { x: 0, y: -115 },
    blush: null,
    pivot: { x: 0, y: 0 },
    shade: { x: -10, y: -10 },
    shadow: { rx: 98, ry: 8 },
    look: { x: 7, y: 4 },
  },
  orb: {
    body: { t: 'ci', cx: 0, cy: -142, r: 90 },
    eyes: { y: -131, dx: 32, rx: 16, ry: 21.5 },
    mouth: { x: 0, y: -97 },
    blush: { y: -105, dx: 59, rx: 12.5, ry: 7.5 },
    pivot: { x: 0, y: -142 },
    shade: { x: -14, y: -16 },
    shadow: { rx: 64, ry: 7 },
    look: { x: 5, y: 4 },
  },
};

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
  fx: string; // light that spills onto the stage: white on maroon, maroon on white
  crack: string; // the crack's dark maroon interior
  lip: string; // its thin flat lip
  ember: string; // the cube's status light while it is damaged (and nothing else)
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
  crack: mix(C.maroon, C.night, 0.3),
  lip: mix(C.porcelain, C.maroon, 0.3),
  ember: C.ember,
});

/* ───────── the damage: one slash line, one notch, one bolt ───────── */

interface CrackSpec {
  ref: Pt; // a point the slash line passes through
  side: 'entry' | 'exit'; // which end of the slash's chord the chip is knocked out of
  L: number; // the bolt's length, from the outline to its tip
  hand: 1 | -1; // which way its step jumps
}
const CRACK: Record<BotKind, CrackSpec> = {
  // the top-right corner: the blade tears a chip out of the right edge on its way out
  bubble: { ref: { x: 64, y: -172 }, side: 'exit', L: 84, hand: 1 },
  // the chin, under the screen: the blade bites in at its right edge and the
  // bolt runs left along the chin (long enough to read as a bolt, not a mitten)
  cube: { ref: { x: 48, y: -46 }, side: 'entry', L: 88, hand: -1 },
  // the upper-left shoulder: a chip torn out of the left edge (at about 8
  // o'clock... 190° on the rim) on the way out, its step jumping up, away from
  // the eye, so the badge sits on the shoulder about 15 px clear of the lid
  // (not across the brow)
  orb: { ref: { x: -76, y: -168 }, side: 'exit', L: 82, hand: 1 },
};

// The bolt (bolt's shape): a long stroke, one sharp step back, a long stroke to
// the point, turned so its start and its tip both sit on the slash line.
const ZAP: [number, number][] = [
  [0, 0],
  [0.56, -0.08],
  [0.45, 0.09],
  [1, 0],
];

export interface Damage {
  u: Pt; // the slash's direction of travel
  chord: { a: Pt; b: Pt }; // where the slash line crosses the outline, in travel order
  d: Pt; // the crack's direction, into the shell
  line: Line; // the bolt's centreline, from the outline (s = 0) to its tip
  mouth: number; // arc length where it reaches the porcelain
  apex: number; // arc length of the notch's apex
  notch: Pt[]; // the V knocked out of the edge: apex, then two corners outside the outline
  chip: Pt[]; // the chip itself (the V inside the outline)
  centre: Pt; // DAMAGE_AT: the middle of the visible crack
  slash: { a: Pt; b: Pt }; // SLASH_LINE: the slash line, 70 px beyond the outline both ways
}

const NOTCH_DEPTH = 13; // px from the porcelain's edge to the apex
const NOTCH_HW = 13; // half-width of the V at its outer corners

const damageFor = (k: BotKind): Damage => {
  const S = SPEC[k];
  const c = CRACK[k];
  const u = dirDeg(SLASH_DIR[k]);
  const [t0, t1] = span(grow(S.body, OW), c.ref, u);
  const entry = add(c.ref, u, t0);
  const exit = add(c.ref, u, t1);
  const start = c.side === 'entry' ? entry : exit;
  const d = c.side === 'entry' ? u : { x: -u.x, y: -u.y };
  const n = perp(d);
  const line = mkLine(ZAP.map(([a, w]) => add(add(start, d, a * c.L), n, c.hand * w * c.L)));
  let mouth = 0;
  while (mouth < line.total && !inside(S.body, pointAt(line, mouth))) mouth += 0.25;
  const apex = mouth + NOTCH_DEPTH;
  const t = tangentAt(line, 0);
  const tn = perp(t);
  const A = pointAt(line, apex);
  const out = add(start, t, -6); // the corners sit beyond the outline so the bite cuts clean through it
  const back = apex + 6;
  const notch = [A, add(out, tn, NOTCH_HW), add(out, tn, -NOTCH_HW)];
  const wAt = (NOTCH_HW * (apex - 0)) / back; // the V's half-width where it crosses the outer outline
  const chip = [A, add(start, tn, wAt), add(start, tn, -wAt)];
  const centre = pointAt(line, (mouth + line.total) / 2);
  return {
    u,
    chord: { a: entry, b: exit },
    d,
    line,
    mouth,
    apex,
    notch,
    chip,
    centre: { x: Math.round(centre.x), y: Math.round(centre.y) },
    slash: { a: add(entry, u, -70), b: add(exit, u, 70) },
  };
};

export const DAMAGE: Record<BotKind, Damage> = { bubble: damageFor('bubble'), cube: damageFor('cube'), orb: damageFor('orb') };
