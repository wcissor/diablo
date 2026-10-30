// The whole reel as pure functions of the frame: what is on screen, where, and
// in which colour. The renderer (Reel.tsx) and the layout check read these, so
// they always agree.

import { END_CARD, EVENTS, SHOTS } from '../config';
import { SAFE, type BotKind } from '../geometry';
import { C } from '../theme';
import type { BotPose, CrackSet, CrackState, Pt } from '../cast/types';
import { botBounds, makeCracks } from '../cast/Bots';
import { clamp, easeInBack, easeInCubic, easeInOutCubic, easeOutCubic, invLerp, lerp } from '../lib/anim';
import { EYES, EYES_MID, HEAD_BOX, MARK_BOX } from '../logo';

export const KINDS: BotKind[] = ['bubble', 'cube', 'orb'];
export const ROW_DY = -150; // the bots stand 150 px above the cast's stage line, under the words
export const DOT: Pt = { x: 540, y: 894 }; // the cube's middle: the dot is born here and everything collapses to it
const HIT = EVENTS.hits;
const POPS = EVENTS.pops;

/* ───────────── Motion ───────────── */

// A pop: 0 → about 1.11 → 1, settled in ~12 frames.
export const spring = (t: number, tau = 2.6, w = 0.55) => (t <= 0 ? 0 : 1 - Math.exp(-t / tau) * Math.cos(w * t));
export const ramp = (f: number, a: number, b: number, ease: (x: number) => number = (x) => x) => ease(invLerp(a, b, f));
// Vertical scale after landing at t0 (1 at rest): squashed, then a damped wobble.
export const landing = (f: number, t0: number, amp = 0.2) => {
  const k = f - t0;
  return k < 0 ? 1 : 1 - amp * Math.exp(-k / 3.2) * Math.cos(0.75 * k);
};
const hop = (f: number, t0: number, dur = 10, h = 34) => {
  const p = (f - t0) / dur;
  return p > 0 && p < 1 ? h * Math.sin(Math.PI * p) : 0;
};

/* ───────────── Colour ───────────── */

export const bgAt = (f: number): string => {
  if (f < EVENTS.wipeIn.to) return C.white;
  if (f < EVENTS.wipeOut.to) return C.maroon;
  const [a, b, c, d] = EVENTS.colourBeats;
  if (f < a) return C.white;
  if (f < b) return C.maroon;
  if (f < c) return C.night;
  if (f < d) return C.maroon;
  return C.white;
};
export const inkOn = (bg: string) => (bg === C.white ? C.maroon : C.white);

/* ───────────── Bots and their cracks ───────────── */

const box = Object.fromEntries(KINDS.map((k) => [k, botBounds(k)])) as Record<BotKind, ReturnType<typeof botBounds>>;
// A bot's middle on screen (at rest).
export const botCentre = (k: BotKind): Pt => ({ x: (box[k].x0 + box[k].x1) / 2, y: (box[k].y0 + box[k].y1) / 2 + ROW_DY });

// Where Diablo's slashes cross each shell: free porcelain, clear of the eyes,
// so every crack lands on clear shell (stage coordinates, before ROW_DY).
const IMPACTS: Record<BotKind, Pt[]> = {
  bubble: [
    { x: 215.9, y: 980.46 },
    { x: 267.56, y: 1004.06 },
    { x: 338.36, y: 1009.13 },
    { x: 374.19, y: 1006.36 },
  ],
  cube: [{ x: 626, y: 1150 }],
  orb: [
    { x: 820.7, y: 968.96 },
    { x: 793.11, y: 996.01 },
    { x: 745.36, y: 1016.14 },
    { x: 714.22, y: 1023.71 },
  ],
};
let crackSets: Record<BotKind, CrackSet> | null = null;
export const CRACKS = (): Record<BotKind, CrackSet> => {
  if (!crackSets)
    crackSets = {
      bubble: makeCracks('bubble', IMPACTS.bubble, 'strike-bubble', 6, { maxMove: 2 }),
      cube: makeCracks('cube', IMPACTS.cube, 'strike-cube', 6, { maxMove: 2 }),
      orb: makeCracks('orb', IMPACTS.orb, 'strike-orb', 6, { maxMove: 2 }),
    };
  return crackSets;
};
export const impactScreen = (k: BotKind): Pt => {
  const ps = IMPACTS[k];
  return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length + ROW_DY };
};

const SEAL_STAGGER = 1.5;
const SEAL_DUR = 8;
export const sealEnd = (k: BotKind) => EVENTS.seals[k] + EVENTS.sealFrames;

export const crackState = (f: number, k: BotKind): CrackState | null => {
  if (f < HIT[k]) return null;
  const set = CRACKS()[k];
  const s0 = EVENTS.seals[k];
  const t = (i: number) => s0 + i * SEAL_STAGGER;
  return {
    set,
    grow: easeOutCubic(clamp((f - HIT[k]) / 10)),
    weak: clamp((f - HIT[k] - 2) / 5) * (1 - clamp((f - s0) / EVENTS.sealFrames)),
    pulseFrame: f,
    seal: set.cracks.map((_, i) => easeOutCubic(clamp((f - t(i)) / SEAL_DUR))),
    warm: f < sealEnd(k) ? 0 : 1 - clamp((f - sealEnd(k)) / 20),
    pop: set.cracks.map((_, i) => clamp((f - t(i) - SEAL_DUR) / 8)),
    glint: invLerp(EVENTS.glint.from, EVENTS.glint.to, f),
  };
};

export interface BotView {
  kind: BotKind;
  scale: number; // pop-in, about the feet
  pose: BotPose;
  cracks: CrackState | null;
}

const botAt = (f: number, k: BotKind, i: number): BotView | null => {
  // Shot 1, on white: pop in, bop on the beat, then look up.
  if (f < EVENTS.wipeIn.to) {
    if (f < POPS[k]) return null;
    const bops = EVENTS.bops.map((b) => b + 2 * i);
    const worry = ramp(f, EVENTS.worry, EVENTS.worry + 4, easeOutCubic);
    const read = ramp(f, 30, 36) * (1 - ramp(f, 58, 64)); // they glance up at the words
    return {
      kind: k,
      scale: spring(f - POPS[k]),
      cracks: null,
      pose: {
        squash: landing(f, POPS[k] + 6, 0.12) * bops.reduce((a, b) => a * landing(f, b + 10, 0.1), 1),
        lift: bops.reduce((a, b) => a + hop(f, b), 0),
        look: { x: 0, y: lerp(-0.5 * read, -1, worry) },
        fear: 0.7 * worry,
        lean: worry * 1.5 * Math.sin(f * 2.2 + i),
      },
    };
  }
  // Shots 3–4, on maroon: the slash, the crack, the seams, the cheer.
  if (f >= EVENTS.botsBack && f < EVENTS.wipeOut.to) {
    const t0 = EVENTS.botsBack + 2 * i;
    if (f < t0) return null;
    const hit = HIT[k];
    const done = sealEnd(k);
    const recoil = f >= hit ? Math.exp(-(f - hit) / 5) : 0;
    const away = k === 'orb' ? -1 : 1; // lean away from the slash
    const hops = [done, ...EVENTS.cheer.map((c) => c + 2 * i)];
    return {
      kind: k,
      scale: spring(f - t0),
      cracks: crackState(f, k),
      pose: {
        squash: (f >= hit ? landing(f, hit, 0.14) : 1) * hops.reduce((a, c) => a * landing(f, c + 12, 0.12), 1),
        lift: hops.reduce((a, c) => a + hop(f, c, 12, 40), 0),
        lean: away * 9 * recoil,
        look: f < done ? { x: 0.5 * Math.sin(f * 0.7 + i * 2), y: -0.4 } : { x: 0, y: -0.3 },
        fear: 0.9 * (1 - ramp(f, done, done + 6)),
        bright: f >= done ? 1 - ramp(f, done, done + 12) : 0,
        freeze: f >= hit && f < done,
        idle: f < hit || f >= done + 12,
      },
    };
  }
  // Shot 5: back, sealed and proud, bopping on the colour beats.
  if (f >= EVENTS.botsUp && f < EVENTS.collapse.to) {
    const t0 = EVENTS.botsUp + 4 * i;
    if (f < t0) return null;
    const beats = EVENTS.colourBeats.slice(1, 3).map((b) => b + 2 * i);
    return {
      kind: k,
      scale: spring(f - t0),
      cracks: crackState(f, k),
      pose: {
        squash: landing(f, t0 + 6, 0.12) * beats.reduce((a, b) => a * landing(f, b + 10, 0.1), 1),
        lift: beats.reduce((a, b) => a + hop(f, b, 10, 30), 0),
        look: { x: 0, y: -0.4 },
        bright: 0.3,
      },
    };
  }
  return null;
};
export const botsAt = (f: number): BotView[] => KINDS.flatMap((k, i) => botAt(f, k, i) ?? []);

// Everything shrinks into the dot at the end of shot 5 (1 = full size).
export const collapseAt = (f: number) => 1 - easeInBack(ramp(f, EVENTS.collapse.from, EVENTS.collapse.to));

/* ───────────── Dots, slashes, lens ───────────── */

export interface DotView {
  x: number;
  y: number;
  r: number;
  from?: Pt; // a short trail behind a flying dot
}
export const dotsAt = (f: number): DotView[] => {
  const out: DotView[] = [];
  // The source dot: it pops in, sends a dot to the bubble and the orb, then becomes the cube.
  if (f >= EVENTS.dot && f < POPS.cube) out.push({ ...DOT, r: 30 * spring(f - EVENTS.dot) });
  for (const k of ['bubble', 'orb'] as BotKind[]) {
    const a = POPS[k] - 5;
    if (f < a || f >= POPS[k]) continue;
    const at = (g: number) => {
      const e = easeInOutCubic(invLerp(a, POPS[k], g));
      const to = botCentre(k);
      return { x: lerp(DOT.x, to.x, e), y: lerp(DOT.y, to.y, e) - 90 * Math.sin(Math.PI * e) };
    };
    out.push({ ...at(f), r: 20, from: at(f - 1.5) });
  }
  // End of shot 5: the dot everything collapsed into hops to the crescent's tip.
  if (f >= EVENTS.collapse.to - 3 && f < EVENTS.ribbon.from + 1) {
    const e = ramp(f, EVENTS.collapse.to, EVENTS.ribbon.from, easeInOutCubic);
    const tip = markPoint(FINALE, CRESCENT_TIP);
    out.push({ x: lerp(DOT.x, tip.x, e), y: lerp(DOT.y, tip.y, e) - 40 * Math.sin(Math.PI * e), r: 26 * ramp(f, EVENTS.collapse.to - 3, EVENTS.collapse.to, easeOutCubic) });
  }
  return out;
};

// Diablo's three slashes, one per bot (stage coordinates, before ROW_DY).
export const SLASH: Record<BotKind, string> = {
  bubble: 'M130 925 Q295 1045 470 985',
  orb: 'M915 915 Q780 1005 640 1050',
  cube: 'M700 1215 Q600 1110 470 1000',
};
// Trim window of a slash: it draws on through the hit and off right after.
export const slashAt = (f: number, k: BotKind) => ({
  a: ramp(f, HIT[k] + 1, HIT[k] + 6, easeInCubic),
  b: ramp(f, HIT[k] - 4, HIT[k] + 1, easeOutCubic),
});

export const flashAt = (f: number) => {
  for (const h of [HIT.bubble, HIT.cube]) {
    if (f === h) return 0.75;
    if (f === h + 1) return 0.25;
  }
  return 0;
};

const SHAKES: [number, number][] = [
  [EVENTS.drop.land, 18],
  [HIT.bubble, 14],
  [HIT.orb, 11],
  [HIT.cube, 16],
];
export const shakeAt = (f: number): Pt =>
  SHAKES.reduce(
    (s, [t, a]) => {
      const k = f - t;
      if (k < 0 || k > 14) return s;
      const e = a * Math.exp(-k / 2.6);
      return { x: s.x + e * Math.sin(k * 2.3 + t), y: s.y + e * Math.cos(k * 2.9 + t) };
    },
    { x: 0, y: 0 },
  );

export interface LensView {
  x: number;
  y: number;
  r: number;
  zoom: number;
  snap: number; // the rim's scale kick as it locks on (1 at rest)
  spin: number; // degrees
}
// The lens that finds each crack: it pops onto the bubble's, then jumps to the
// cube's and the orb's on the beats, and shrinks away. It sits on the point
// each slash hit (where the cracks are densest), kept inside the safe area.
const LENS_R = 130;
const LENS_REACH = LENS_R * 1.12 + 34; // rim at full snap plus its ticks
const lensOn = (k: BotKind): Pt => {
  const p = impactScreen(k);
  return { x: clamp(p.x, SAFE.x0 + LENS_REACH, SAFE.x1 - LENS_REACH), y: p.y };
};
export const lensAt = (f: number): LensView | null => {
  const L = EVENTS.lens;
  if (f < L.from || f >= L.to) return null;
  const stops: [number, BotKind][] = [
    [L.bubble, 'bubble'],
    [L.cube, 'cube'],
    [L.orb, 'orb'],
  ];
  let c = lensOn('bubble');
  let last = 0;
  for (let j = 1; j < stops.length; j++) {
    const e = ramp(f, stops[j][0] - 3, stops[j][0], easeInOutCubic);
    const n = lensOn(stops[j][1]);
    c = { x: lerp(c.x, n.x, e), y: lerp(c.y, n.y, e) };
    if (f >= stops[j][0]) last = j;
  }
  const lockAt = stops[last][0];
  return {
    ...c,
    r: LENS_R * spring(f - L.from) * (1 - ramp(f, L.to - 6, L.to, easeInCubic)),
    zoom: 2.1,
    snap: 1 + 0.12 * (1 - clamp(spring(f - lockAt, 1.6, 0.9))),
    spin: 90 * last + 90 * ramp(f, lockAt, lockAt + 6, easeOutCubic),
  };
};

/* ───────────── Rings, sparkles, bursts ───────────── */

export interface RingView {
  x: number;
  y: number;
  t0: number;
  r0?: number;
  r1: number;
  color: string;
  width: number;
  n?: number;
}
export interface SparkView {
  x: number;
  y: number;
  t0: number;
  size: number;
  color: string;
}

const HOOK_RINGS: RingView[] = KINDS.map((k) => ({ ...botCentre(k), t0: POPS[k], r1: 180, color: C.maroon, width: 16, n: 2 }));
const LAND = { x: 540, y: 820 };
export const RINGS: RingView[] = [
  { ...DOT, t0: EVENTS.dot, r1: 90, color: C.maroon, width: 10, n: 1 },
  ...HOOK_RINGS,
  { ...LAND, t0: EVENTS.drop.land, r0: 120, r1: 620, color: C.white, width: 28, n: 3 },
  ...KINDS.map((k) => ({ ...botCentre(k), t0: sealEnd(k), r1: 200, color: C.white, width: 14, n: 2 })),
  ...KINDS.map((k, i) => ({ ...botCentre(k), t0: EVENTS.botsUp + 4 * i, r1: 190, color: C.white, width: 14, n: 2 })),
];
export const SPARKS: SparkView[] = [
  ...EVENTS.bops.flatMap((b, j) =>
    KINDS.map((k, i) => {
      const c = botCentre(k);
      const side = (i + j) % 2 ? 1 : -1;
      return { x: c.x + side * 105, y: c.y - 120 + 14 * j, t0: b + 2 + 2 * i, size: 26, color: C.maroon };
    }),
  ),
  ...KINDS.flatMap((k) => {
    const c = botCentre(k);
    return [
      { x: c.x - 92, y: c.y - 118, t0: sealEnd(k), size: 30, color: C.white },
      { x: c.x + 104, y: c.y - 78, t0: sealEnd(k) + 3, size: 22, color: C.white },
    ];
  }),
];

/* ───────────── Words ───────────── */

export interface WordsView {
  lines: { text: string; at: number }[];
  out: number;
  top: number;
  size: number;
  lineH: number;
  color: string;
  scale: number; // the collapse at the end of shot 5, about DOT
}
export const wordsAt = (f: number): WordsView | null => {
  const s = SHOTS.find((x) => f >= x.from && f <= x.to);
  if (!s || !s.words.length) return null;
  const big = s.id === 5;
  return {
    lines: s.words.map((text, i) => ({ text, at: s.lineIn[i] })),
    out: s.wordsOut,
    top: big ? 372 : 330,
    size: big ? 132 : 108,
    lineH: big ? 140 : 116,
    color: inkOn(bgAt(f)),
    scale: big ? collapseAt(f) : 1,
  };
};

/* ───────────── Diablo's mark ───────────── */

export interface MarkView {
  x: number; // where the mark's box centre lands
  y: number;
  h: number; // mark height, px
  color: string;
  eye: string; // the eye holes show this colour (the background behind him)
  headScale: number; // pop, about the head's base
  headSx: number;
  headSy: number;
  headDy: number; // px, the drop
  rot: number;
  crescent: number; // 0..1 drawn along its spine
  eyeOpen: number; // 0..1 (a closed eye is a thin line)
  squint: number; // 0..1
  zoom?: { s: number; at: Pt }; // the dive into his left eye
}
const ARRIVAL = { x: 540, y: 720, h: 640 };
const FINALE = { x: 540, y: 660, h: 400 };
export const CRESCENT_TIP: Pt = { x: 512, y: 630 };
export const HEAD_BASE: Pt = { x: HEAD_BOX.x + HEAD_BOX.w / 2, y: HEAD_BOX.y + HEAD_BOX.h };
const MARK_C = { x: MARK_BOX.x + MARK_BOX.w / 2, y: MARK_BOX.y + MARK_BOX.h / 2 };
// A point in the logo trace's units, on screen for a mark placement.
export const markPoint = (m: { x: number; y: number; h: number }, p: Pt): Pt => {
  const k = m.h / MARK_BOX.h;
  return { x: m.x + (p.x - MARK_C.x) * k, y: m.y + (p.y - MARK_C.y) * k };
};
export const END_EYES = markPoint(FINALE, EYES_MID);

// p rotated about c (degrees, clockwise on screen), as the head's transform does.
const rotAbout = (p: Pt, c: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
};

const opening = (f: number, t0: number) => (f < t0 ? 0.06 : lerp(0.06, 1, clamp(spring(f - t0, 1.8, 0.7), 0, 1.15)));

export const markAt = (f: number): MarkView | null => {
  const D = EVENTS.drop;
  if (f >= D.from && f < EVENTS.eyeZoom.to) {
    const sy = landing(f, D.land, 0.24);
    const squint = ramp(f, EVENTS.squint.from, EVENTS.squint.to, easeOutCubic);
    const z = ramp(f, EVENTS.eyeZoom.from, EVENTS.eyeZoom.to - 1);
    return {
      ...ARRIVAL,
      color: C.white,
      eye: C.maroon,
      headScale: 1,
      headSx: 1 + (1 - sy) * 0.8,
      headSy: sy,
      headDy: -1100 * (1 - ramp(f, D.from, D.land, easeInCubic)),
      rot: -4 * squint,
      crescent: ramp(f, EVENTS.tailDraw.from, EVENTS.tailDraw.to, easeOutCubic),
      eyeOpen: opening(f, EVENTS.eyesOpen),
      squint: 0.6 * squint,
      zoom: z > 0 ? { s: Math.pow(80, z * z), at: markPoint(ARRIVAL, rotAbout({ x: EYES[0].cx, y: EYES[0].cy }, HEAD_BASE, -4 * squint)) } : undefined,
    };
  }
  if (f >= EVENTS.ribbon.from) {
    const sy = landing(f, EVENTS.headPop + 5, 0.16);
    const B = EVENTS.blink;
    const blink = f >= B.from && f <= B.to ? Math.sin(Math.PI * invLerp(B.from, B.to, f)) : 0;
    return {
      ...FINALE,
      color: C.maroon,
      eye: C.white,
      headScale: spring(f - EVENTS.headPop),
      headSx: 1 + (1 - sy) * 0.8,
      headSy: sy,
      headDy: 0,
      rot: 0,
      crescent: ramp(f, EVENTS.ribbon.from, EVENTS.ribbon.to, easeInOutCubic),
      eyeOpen: opening(f, EVENTS.eyesOpenEnd) * (1 - 0.94 * blink),
      squint: 0,
    };
  }
  return null;
};
// The maroon that fills the frame as the camera reaches his eye.
export const eyeFillAt = (f: number) => (f < EVENTS.eyeZoom.to ? ramp(f, EVENTS.eyeZoom.to - 3, EVENTS.eyeZoom.to - 1) : 0);

export const FINALE_RINGS: RingView[] = [
  { ...markPoint(FINALE, { x: 600, y: 900 }), t0: EVENTS.ribbon.to, r1: 260, color: C.maroon, width: 14, n: 2 },
  { ...markPoint(FINALE, HEAD_BASE), t0: EVENTS.headPop + 4, r0: 60, r1: 420, color: C.maroon, width: 16, n: 2 },
];
export const FINALE_SPARKS: SparkView[] = [
  { ...markPoint(FINALE, { x: 690, y: 170 }), t0: 540, size: 30, color: C.maroon },
  { ...markPoint(FINALE, { x: 875, y: 250 }), t0: 572, size: 24, color: C.maroon },
];

/* ───────────── Wipes and the iris ───────────── */

export interface Circle {
  x: number;
  y: number;
  r: number;
}
export const COVER_R = 1300; // covers the frame from anywhere inside it
export const wipeInAt = (f: number): Circle | null =>
  f >= EVENTS.wipeIn.from && f < EVENTS.wipeIn.to ? { x: 540, y: 760, r: COVER_R * ramp(f, EVENTS.wipeIn.from, EVENTS.wipeIn.to, easeInOutCubic) } : null;
export const wipeOutAt = (f: number): Circle | null =>
  f >= EVENTS.wipeOut.from && f < EVENTS.wipeOut.to ? { ...DOT, r: COVER_R * ramp(f, EVENTS.wipeOut.from, EVENTS.wipeOut.to, easeInOutCubic) } : null;
// The hole in the black: open at the start, closing on his eyes at the end.
export const irisAt = (f: number): Circle | null => {
  const O = EVENTS.irisOpen;
  const X = EVENTS.irisClose;
  if (f <= O.to) return { ...DOT, r: COVER_R * easeOutCubic(invLerp(O.from, O.to, f)) };
  if (f >= X.from) return { ...END_EYES, r: COVER_R * (1 - easeInCubic(invLerp(X.from, X.to, f))) };
  return null;
};

// The big white swoosh that clears the words between shots 3 and 4.
export const SWOOSH = 'M-120 560 Q520 200 1200 380';
export const swooshAt = (f: number) => ({
  a: ramp(f, EVENTS.swoosh.from + 5, EVENTS.swoosh.to, easeInCubic),
  b: ramp(f, EVENTS.swoosh.from, EVENTS.swoosh.from + 7, easeOutCubic),
});

export const END = END_CARD;
