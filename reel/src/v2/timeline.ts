// The whole reel as pure functions of the frame: what is on screen, where, and
// in which colour. The renderer (Reel.tsx) and the layout check read these, so
// they always agree.

import { BLINKS, END_CARD, EVENTS, SHOTS } from '../config';
import { BOTS, SAFE, STAGE_Y, type BotKind } from '../geometry';
import { C } from '../theme';
import { clamp, easeInBack, easeInCubic, easeInOutCubic, easeOutCubic, invLerp, lerp, type Pt } from '../lib/anim';
import { SLASH_DIR, type Mood } from '../bots/kit/types';
import { DAMAGE_AT, SLASH_LINE } from '../bots/Bot';
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

/* ───────────── Bots ───────────── */

export const BOT_H = 240; // the bots' height, feet to crown (their middles, the layout check)
// A bot's middle on screen (at rest). All three stand on one line.
export const botCentre = (k: BotKind): Pt => ({ x: BOTS[k].cx, y: STAGE_Y + ROW_DY - BOT_H / 2 });
// Where Diablo's slash chipped a bot, on screen (the lens frames it).
export const damageScreen = (k: BotKind): Pt => ({ x: BOTS[k].cx + DAMAGE_AT[k].x, y: STAGE_Y + ROW_DY + DAMAGE_AT[k].y });

export const sealEnd = (k: BotKind) => EVENTS.seals[k] + EVENTS.sealFrames;

// What the reel tells a bot each frame (the bot draws its own face, hit, crack and seam).
export interface BotView {
  kind: BotKind;
  scale: number; // pop-in, about the feet
  squash: number; // vertical scale about the feet (1 = rest)
  lean: number; // degrees about the feet
  lift: number; // px: the body hops while its shadow stays on the ground
  look: Pt;
  blink: number;
  mood: Mood;
  hitT?: number;
  seal?: number;
  sealT?: number;
}

// A 6-frame blink at each of the bot's BLINKS frames.
const blinkAt = (f: number, k: BotKind) => {
  for (const s0 of BLINKS[k]) if (f >= s0 && f < s0 + 6) return Math.sin((Math.PI * (f - s0 + 0.5)) / 6);
  return 0;
};

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
      squash: landing(f, POPS[k] + 6, 0.12) * bops.reduce((a, b) => a * landing(f, b + 10, 0.1), 1),
      lean: worry * 1.5 * Math.sin(f * 2.2 + i),
      lift: bops.reduce((a, b) => a + hop(f, b), 0),
      look: { x: 0, y: lerp(-0.5 * read, -1, worry) },
      blink: blinkAt(f, k),
      mood: worry > 0.5 ? 'worried' : 'happy',
    };
  }
  // Shots 3-4, on maroon: the slash, the chip, the white seam, the cheer.
  if (f >= EVENTS.botsBack && f < EVENTS.wipeOut.to) {
    const t0 = EVENTS.botsBack + 2 * i;
    if (f < t0) return null;
    const hit = HIT[k];
    const done = sealEnd(k);
    const hops = [done, ...EVENTS.cheer.map((c) => c + 2 * i)];
    return {
      kind: k,
      scale: spring(f - t0),
      squash: hops.reduce((a, c) => a * landing(f, c + 12, 0.12), 1),
      lean: 0, // the bot plays its own hit-stop squash and tilt
      lift: hops.reduce((a, c) => a + hop(f, c, 12, 40), 0),
      look: f < hit ? { x: 0.5 * Math.sin(f * 0.7 + i * 2), y: -0.4 } : { x: 0, y: -0.3 },
      blink: f < hit || f >= done + 6 ? blinkAt(f, k) : 0,
      mood: f < done ? 'worried' : 'proud',
      hitT: f >= hit ? f - hit : undefined,
      seal: f >= hit ? clamp((f - EVENTS.seals[k]) / EVENTS.sealFrames) : undefined,
      sealT: f >= done ? f - done : undefined,
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
      squash: landing(f, t0 + 6, 0.12) * beats.reduce((a, b) => a * landing(f, b + 10, 0.1), 1),
      lean: 0,
      lift: beats.reduce((a, b) => a + hop(f, b, 10, 30), 0),
      look: { x: 0, y: -0.4 },
      blink: blinkAt(f, k),
      mood: 'proud',
      hitT: f - HIT[k],
      seal: 1,
      sealT: f - sealEnd(k),
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

// Diablo's three slashes, one per bot: a blade swipe along a shallow arc on the
// bot's own slash line (stage coordinates, before ROW_DY), in the direction of
// travel. Each end stays inside the safe area and short of the neighbouring
// bots (ears and mitts included), so a swipe never spears the wrong bot.
const SLASH_BOW = 20; // px the arc's control point sits off the line
const SLASH_X: Record<BotKind, [number, number]> = { bubble: [SAFE.x0 + 6, 400], cube: [392, 672], orb: [680, SAFE.x1 - 6] };
export interface Arc {
  p0: Pt;
  c: Pt;
  p1: Pt;
}
const slashArc = (k: BotKind): Arc => {
  const { a, b } = SLASH_LINE[k];
  const dir = { x: Math.cos((SLASH_DIR[k] * Math.PI) / 180), y: Math.sin((SLASH_DIR[k] * Math.PI) / 180) };
  const [p, q] = a.x * dir.x + a.y * dir.y <= b.x * dir.x + b.y * dir.y ? [a, b] : [b, a];
  const at = (v: Pt) => ({ x: BOTS[k].cx + v.x, y: STAGE_Y + v.y });
  const P0 = at(p);
  const Q0 = at(q);
  const inX = (from: Pt, to: Pt): Pt => {
    const x = clamp(to.x, SLASH_X[k][0], SLASH_X[k][1]);
    const t = to.x === from.x ? 1 : (x - from.x) / (to.x - from.x);
    return { x, y: from.y + (to.y - from.y) * t };
  };
  const P = inX(Q0, P0);
  const Q = inX(P0, Q0);
  const L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
  return { p0: P, c: { x: (P.x + Q.x) / 2 - ((Q.y - P.y) / L) * SLASH_BOW, y: (P.y + Q.y) / 2 + ((Q.x - P.x) / L) * SLASH_BOW }, p1: Q };
};
export const SLASH: Record<BotKind, Arc> = { bubble: slashArc('bubble'), cube: slashArc('cube'), orb: slashArc('orb') };
// A slash is a fast blade: its head crosses in 3 frames, its tail chases it off
// in 4 (on screen about 5 frames).
export const slashAt = (f: number, k: BotKind) => ({
  a: ramp(f, HIT[k] - 1, HIT[k] + 3, easeInCubic),
  b: ramp(f, HIT[k] - 3, HIT[k], easeOutCubic),
});

export const flashAt = (f: number) => {
  for (const h of [HIT.bubble, HIT.cube]) {
    if (f === h) return 0.75;
    if (f === h + 1) return 0.18;
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
// The lens: on the "finds" beat it pops onto the bubble's chip, jumps to the
// cube's and the orb's, and shrinks away; on the "fixes" beat it comes back and
// watches each chip snap shut and fill with white, in the order they seal. It
// sits on the point each slash chipped, kept inside the safe area.
const LENS_R = 130;
const LENS_REACH = LENS_R * 1.12 + 34; // rim at full snap plus its ticks
const lensOn = (k: BotKind): Pt => {
  const p = damageScreen(k);
  return { x: clamp(p.x, SAFE.x0 + LENS_REACH, SAFE.x1 - LENS_REACH), y: p.y };
};
const LENS_TOURS: { from: number; to: number; stops: [number, BotKind][] }[] = [
  {
    from: EVENTS.lens.from,
    to: EVENTS.lens.to,
    stops: [
      [EVENTS.lens.bubble, 'bubble'],
      [EVENTS.lens.cube, 'cube'],
      [EVENTS.lens.orb, 'orb'],
    ],
  },
  {
    from: EVENTS.lensFix.from,
    to: EVENTS.lensFix.to,
    stops: [
      [EVENTS.lensFix.bubble, 'bubble'],
      [EVENTS.lensFix.orb, 'orb'],
      [EVENTS.lensFix.cube, 'cube'],
    ],
  },
];
export const lensAt = (f: number): LensView | null => {
  const tour = LENS_TOURS.find((t) => f >= t.from && f < t.to);
  if (!tour) return null;
  const { stops } = tour;
  let c = lensOn(stops[0][1]);
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
    r: LENS_R * spring(f - tour.from) * (1 - ramp(f, tour.to - 7, tour.to - 1, easeInCubic)),
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

// Rings burst a beat after each pop, once the bot has grown into them.
const HOOK_RINGS: RingView[] = KINDS.map((k) => ({ ...botCentre(k), t0: POPS[k] + 2, r1: 180, color: C.maroon, width: 16, n: 2 }));
const LAND = { x: 540, y: 820 };
export const RINGS: RingView[] = [
  { ...DOT, t0: EVENTS.dot, r1: 90, color: C.maroon, width: 10, n: 1 },
  ...HOOK_RINGS,
  { ...LAND, t0: EVENTS.drop.land, r0: 120, r1: 620, color: C.white, width: 28, n: 3 },
  ...KINDS.map((k) => ({ ...botCentre(k), t0: sealEnd(k), r1: 200, color: C.white, width: 14, n: 2 })),
  ...KINDS.map((k, i) => ({ ...botCentre(k), t0: EVENTS.botsUp + 4 * i + 2, r1: 190, color: C.white, width: 14, n: 2 })),
];
export const SPARKS: SparkView[] = [
  ...EVENTS.bops.flatMap((b, j) =>
    KINDS.map((k, i) => {
      const c = botCentre(k);
      // above each head, alternating sides, so no two glints pair up into "eyes" in a gap
      const side = (i + j) % 2 ? 1 : -1;
      return { x: c.x + side * 58, y: c.y - 150 - 10 * ((i + j) % 2), t0: b + 2 + 2 * i, size: 26, color: C.maroon };
    }),
  ),
  ...KINDS.flatMap((k) => {
    const c = botCentre(k);
    return [
      { ...damageScreen(k), t0: sealEnd(k) - 1, size: 56, color: C.white }, // a big flash on the new badge
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
  shine?: number; // 0..1 a band of light sweeping across the mark (the end card)
}
// One sweep of light across the logo while the end card holds.
const SHINE = { from: 546, to: 562 };
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
      shine: f >= SHINE.from && f < SHINE.to ? invLerp(SHINE.from, SHINE.to, f) : undefined,
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
