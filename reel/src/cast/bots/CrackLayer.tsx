// Cracks, weak spots and gold seams on a bot's shell. Drawn inside the bot's
// posed group, clipped to its shell; crack geometry is in stage coordinates, so
// the layer is shifted by −anchor to sit in the bot's local space.
//
// Cracks and seams share one smooth path per crack (Crack.d). Both are drawn
// as bands along it whose width swells a little (seeded), so they read as
// organic breaks and kintsugi, never as traces on a circuit board. An open
// crack narrows to a sharp point at its free end; a seam sits on a crisp
// warm-dark contact contour (so the gold separates from the porcelain) and
// thins out at a free tip. Each layer is drawn for all cracks before the next,
// so a fork never cuts across its parent.

import React from 'react';
import { BOTS, type BotKind } from '../../geometry';
import { C } from '../../theme';
import { mix } from '../../stage/Stage';
import { clamp, smooth, type Pt } from '../../lib/anim';
import type { CrackState } from '../types';
import { crackAt, crackCurve, crackRootDist, crackTip, isHairline, setImpacts, setReach, weakAngle, weakLinks, weakPts } from './cracks';
import { bboxOf, polyD, ribbonD, smoothClosedD, swell } from './geom';
import { shellLocal, toStage } from './shapes';

// Tints of the palette (no colour outside theme.ts).
const EMBER_DEEP = mix(C.ember, C.maroon, 0.5); // the scorched band round an opening, its inner wall
const EMBER_HOT = mix(C.ember, C.gold, 0.5); // the hot core deep inside
const EMBER_HEART = mix(C.gold, C.cream, 0.4); // the very heart of the core
const GOLD_DEEP = mix(C.gold, C.maroon, 0.3); // the sparkle's rim
const GOLD_HOT = mix(C.gold, C.cream, 0.55);
const SEAM_SHADOW = mix(C.night, C.maroon, 0.4); // the warm-dark contact contour under every seam and patch
const SEAM_SHADOW_O = 0.55;
const PATCH_EDGE = mix(C.gold, C.maroon, 0.55); // the thin contour round a sealed patch

// The embers inside an opening glow dim from the moment it opens (never a black
// hole first), and come up to full as the weak spots light.
const EMBER_FLOOR = 0.5;
const RING_FLOOR = 0.22;

const PULSE_W = (2 * Math.PI * 1.2) / 30; // 1.2 Hz at 30 fps
// The ember pulse as a multiplier (0.24 … 1): strong, so the light visibly breathes.
export const pulseOf = (pulseFrame: number) => 0.62 + 0.38 * Math.sin(PULSE_W * pulseFrame);
const pulse01 = (pulseFrame: number) => 0.5 + 0.5 * Math.sin(PULSE_W * pulseFrame);

// Static defs for the layer (object-bounding-box gradients: local and identical
// wherever the subtree is rendered).
export const CrackDefs: React.FC<{ id: string }> = ({ id }) => (
  <>
    {/* Ember light on the shell: red right up to the opening, a tight falloff through deeper ember. */}
    <radialGradient id={`${id}-ember-light`}>
      <stop offset="0" stopColor={C.ember} stopOpacity={1} />
      <stop offset="0.5" stopColor={C.ember} stopOpacity={0.92} />
      <stop offset="0.66" stopColor={C.ember} stopOpacity={0.55} />
      <stop offset="0.82" stopColor={EMBER_DEEP} stopOpacity={0.2} />
      <stop offset="1" stopColor={EMBER_DEEP} stopOpacity={0} />
    </radialGradient>
    {/* Inside an opening: dark walls, the ember glowing up from below, hot at its heart. */}
    <radialGradient id={`${id}-ember-core`} cx="0.5" cy="0.6" r="0.6">
      <stop offset="0" stopColor={EMBER_HEART} />
      <stop offset="0.22" stopColor={EMBER_HOT} />
      <stop offset="0.55" stopColor={C.ember} />
      <stop offset="0.85" stopColor={EMBER_DEEP} />
      <stop offset="1" stopColor={mix(EMBER_DEEP, C.night, 0.5)} />
    </radialGradient>
    <radialGradient id={`${id}-warm`} cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stopColor={C.gold} stopOpacity={0.3} />
      <stop offset="0.6" stopColor={C.gold} stopOpacity={0.12} />
      <stop offset="1" stopColor={C.gold} stopOpacity={0.03} />
    </radialGradient>
    {/* The small warm light round molten gold (the front, a pop). */}
    <radialGradient id={`${id}-molten`}>
      <stop offset="0" stopColor={C.gold} stopOpacity={0.5} />
      <stop offset="0.4" stopColor={C.gold} stopOpacity={0.2} />
      <stop offset="1" stopColor={C.gold} stopOpacity={0} />
    </radialGradient>
    <radialGradient id={`${id}-glint`}>
      <stop offset="0" stopColor={C.cream} stopOpacity={0.8} />
      <stop offset="0.35" stopColor={C.cream} stopOpacity={0.28} />
      <stop offset="1" stopColor={C.cream} stopOpacity={0} />
    </radialGradient>
  </>
);

type XY = { x: number; y: number };
const f2 = (n: number) => n.toFixed(2);

// A unit outline placed at (cx, cy), radius r, each vertex pushed out by push(i) px.
const placed = (pts: XY[], cx: number, cy: number, r: number, push: (i: number) => number = () => 0) =>
  polyD(
    pts.map((p, i) => {
      const l = Math.hypot(p.x, p.y) || 1;
      const o = push(i);
      return { x: cx + p.x * r + (p.x / l) * o, y: cy + p.y * r + (p.y / l) * o };
    }),
  );
// An outline's lobes calmed toward their neighbours (molten gold has no
// chipped corners).
const calm = (pts: XY[]): XY[] =>
  pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(p.x, p.y) || 1;
    const m = 0.7 * l + 0.15 * (Math.hypot(a.x, a.y) + Math.hypot(b.x, b.y));
    return { x: (p.x / l) * m, y: (p.y / l) * m };
  });
// A chipped edge: each vertex its own amount between lo and hi.
const chipped = (lo: number, hi: number, seed = 0) => (i: number) => lo + (hi - lo) * ((((i + seed) * 7) % 5) / 4);

// The opening, a little longer along the crack it breaks.
const orient = (pts: XY[], angle: number, along = 1.15, across = 0.92): XY[] => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: p.x * along * c - p.y * across * s, y: p.x * along * s + p.y * across * c }));
};
// A sealed patch: a calm, flat, slightly irregular pool of gold, like a filled
// chip (its lobes smoothed, so it reads as poured gold, never as a nugget, a
// bead or a leaf).
const poolPts = (pts: XY[]) => {
  const a = calm(pts);
  const b = calm(a);
  return a.map((p, i) => ({ x: (p.x + b[i].x) / 2, y: (p.y + b[i].y) / 2 }));
};
const patchD = (pts: XY[], cx: number, cy: number, r: number) => smoothClosedD(poolPts(pts).map((p) => ({ x: cx + p.x * r, y: cy + p.y * r })));
// Its one highlight: a short sliver of light just inside the edge that faces
// the key light (up and to the left), like the rim of a flat inlay, kept off
// the seam running through it (`along`: the seam's heading).
const KEY_DIR = { x: -0.55, y: -0.83 };
const patchGlintD = (pts: XY[], cx: number, cy: number, r: number, inset: number, along: number) => {
  const q = poolPts(pts);
  const n = q.length;
  const ax = Math.cos(along);
  const ay = Math.sin(along);
  let bi = 0;
  let bd = -Infinity;
  q.forEach((p, i) => {
    const l = Math.hypot(p.x, p.y) || 1;
    const d = (p.x * KEY_DIR.x + p.y * KEY_DIR.y) / l - 1.5 * Math.max(0, Math.abs((p.x * ax + p.y * ay) / l) - 0.55);
    if (d > bd) {
      bd = d;
      bi = i;
    }
  });
  const at = (i: number) => {
    const p = q[(i + n) % n];
    const l = Math.hypot(p.x, p.y) || 1;
    const k = Math.max(0.2, (l * r - inset) / (l * r));
    return { x: cx + p.x * r * k, y: cy + p.y * r * k };
  };
  const a = at(bi - 1);
  const b = at(bi);
  const c = at(bi + 1);
  // through the middle point (a quadratic whose control makes it pass through b)
  return `M${f2(a.x)} ${f2(a.y)}Q${f2(2 * b.x - (a.x + c.x) / 2)} ${f2(2 * b.y - (a.y + c.y) / 2)} ${f2(c.x)} ${f2(c.y)}`;
};

// A claw puncture: a narrow chipped gash, pointed at both ends, widest a
// little above its middle where the tip broke in (unit size; never a round
// dot). Sealed, the gold poured in there closes it.
const PUNCTURE: XY[] = [
  { x: 0.02, y: -1.0 },
  { x: 0.2, y: -0.62 },
  { x: 0.3, y: -0.2 },
  { x: 0.2, y: 0.3 },
  { x: 0.08, y: 0.75 },
  { x: 0.0, y: 1.05 },
  { x: -0.1, y: 0.6 },
  { x: -0.22, y: 0.1 },
  { x: -0.28, y: -0.35 },
  { x: -0.15, y: -0.75 },
];
const rotPts = (pts: XY[], deg: number): XY[] => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
};

// A four-point sparkle, centred on the origin.
const star4 = (R: number, inner = 0.2) => {
  const q = R * inner;
  return `M0 ${f2(-R)}L${f2(q)} ${f2(-q)}L${f2(R)} 0L${f2(q)} ${f2(q)}L0 ${f2(R)}L${f2(-q)} ${f2(q)}L${f2(-R)} 0L${f2(-q)} ${f2(-q)}Z`;
};

// A sparkle: a cream four-point star on a gold one, in a small warm light (so
// it reads on pale porcelain as well as on the dark).
const Sparkle: React.FC<{ id: string; p: Pt; size: number; rot: number; o: number; light?: number }> = ({ id, p, size, rot, o, light = 1 }) =>
  o <= 0.01 || size <= 0.2 ? null : (
    <g transform={`translate(${f2(p.x)} ${f2(p.y)})`}>
      <circle r={size * 2.4} fill={`url(#${id}-molten)`} opacity={o * light} />
      <g transform={`rotate(${f2(rot)})`} opacity={o}>
        <path d={star4(size * 1.3, 0.26)} fill={GOLD_DEEP} />
        <path d={star4(size * 1.12, 0.24)} fill={C.gold} />
        <path d={star4(size * 0.8, 0.2)} fill={C.cream} />
      </g>
    </g>
  );

const bbCache: Partial<Record<BotKind, ReturnType<typeof bboxOf>>> = {};
const shellBox = (kind: BotKind) => (bbCache[kind] ??= bboxOf(toStage(kind, shellLocal(kind))));

const GLINT_HALF = 14; // px: half the length of the travelling highlight

export const CrackLayer: React.FC<{ kind: BotKind; id: string; states: CrackState[]; part?: 'cracks' | 'warm' }> = ({ kind, id, states, part = 'cracks' }) => {
  const a = BOTS[kind];
  const bb = shellBox(kind);
  const anyWarm = states.reduce((m, s) => Math.max(m, s.warm), 0);
  // The warm glow sits over everything on the shell (eyes and lids included).
  if (part === 'warm') {
    if (anyWarm <= 0.005) return null;
    return (
      <rect x={bb.x0 - a.cx - 4} y={bb.y0 - a.feetY - 4} width={bb.x1 - bb.x0 + 8} height={bb.y1 - bb.y0 + 8} fill={`url(#${id}-warm)`} opacity={clamp(anyWarm)} />
    );
  }

  const lights: React.ReactNode[] = [];
  const edges: React.ReactNode[] = []; // open cracks: porcelain-shade walls
  const cores: React.ReactNode[] = []; // open cracks: night cores, ember threads
  const holes: React.ReactNode[] = [];
  const shadows: React.ReactNode[] = []; // the contact contour under seams and patches (one opacity for all)
  const patchRims: React.ReactNode[] = [];
  const seams: React.ReactNode[] = [];
  const seamCores: React.ReactNode[] = [];
  const golds: React.ReactNode[] = [];
  const patchLights: React.ReactNode[] = [];
  const fronts: React.ReactNode[] = [];
  const sparks: React.ReactNode[] = [];

  states.forEach((s, si) => {
    const set = s.set;
    const reach = setReach(set);
    const front = clamp(s.grow) * reach;
    const pn = pulse01(s.pulseFrame);
    const hair = isHairline(set);
    const weak = clamp(s.weak);
    const flash = clamp(s.flash ?? 0);
    const glint = clamp(s.glint ?? 0);
    const glinting = glint > 0 && glint < 1;
    // Where the highlight is on each seam (px from its root), for the patches too.
    const glintAt: number[] = [];

    set.cracks.forEach((cr, i) => {
      const L = cr.length;
      const vis = clamp(front - crackRootDist(cr), 0, L);
      if (vis <= 0.3) return;
      const curve = crackCurve(cr);
      const Lc = curve.cum[curve.cum.length - 1] || 1;
      const k = Lc / (L || Lc); // path length → sample length (≈ 1)
      const key = `${si}-${i}`;
      const seal = clamp(s.seal[i] ?? 0);
      const len = Math.min(seal * L, vis);
      const main = !hair && (cr as { main?: boolean }).main !== false;
      const sd = i * 3.7 + si * 11;
      const tip = crackTip(cr);

      // The open crack, where the gold has not reached: porcelain-shade walls
      // round a night core, heavier at the root, narrowing to a sharp point at
      // its free end (the growing end is always free; one that runs into
      // another crack or the shell's edge keeps its width there), with a thread
      // of ember while the weak spots glow.
      if (vis - len > 0.3) {
        const a0 = len * k;
        const a1 = vis * k;
        const span = a1 - a0;
        const reached = vis >= L - 0.5;
        const T = Math.min(hair ? 12 : main ? 20 : 16, span * 0.55) * (reached && tip !== 'free' ? 0 : 1);
        const taper = (x: number) => (T > 0.5 ? Math.pow(clamp((a1 - x) / T), 0.85) : 1);
        // a fork starts thin off its parent
        const forkIn = (x: number) => (main || hair ? 1 : 0.55 + 0.45 * smooth(clamp(x / 14)));
        const edge = (x: number) => (hair ? 1.8 : main ? 3.8 : 3.1) * (1 - (hair ? 0.3 : 0.4) * (x / Lc)) * (1 + 0.1 * swell(sd, x)) * taper(x) * forkIn(x);
        const core = (x: number) => (hair ? 0.8 : main ? 1.75 : 1.4) * (1 - 0.34 * (x / Lc)) * (1 + 0.12 * swell(sd + 1.3, x)) * Math.pow(taper(x), 1.3) * forkIn(x);
        const caps = { start: len > 0.3 ? ('butt' as const) : ('round' as const), end: T > 0.5 ? ('butt' as const) : ('round' as const) };
        edges.push(<path key={key} d={ribbonD(curve, a0, a1, edge, 2.5, caps)} fill={C.porcelainShade} />);
        cores.push(
          <g key={key}>
            <path d={ribbonD(curve, a0, a1, core, 2.5, caps)} fill={C.night} />
            {!hair && weak > 0.01 ? (
              <path d={ribbonD(curve, a0, a1, (x) => 0.45 * core(x) / 1.75, 2.5, { start: 'butt', end: 'butt' })} fill={C.ember} opacity={weak * (0.3 + 0.3 * pn)} />
            ) : null}
            {flash > 0.01 ? <path d={ribbonD(curve, a0, a1, (x) => 1.3 * Math.pow(taper(x), 1.2), 2.5, caps)} fill={C.ember} opacity={flash} /> : null}
          </g>,
        );
      }
      if (flash > 0.01 && vis - len > 0.3) {
        // The flash lights the glaze along the fresh crack: red, close to the line.
        const dash = { strokeDasharray: `${f2(vis - len)} ${f2(L + 80)}`, strokeDashoffset: f2(-len) };
        lights.push(
          <g key={`fl-${key}`} fill="none" stroke={C.ember} strokeLinecap="round" strokeLinejoin="round">
            <path d={cr.d} strokeOpacity={flash * 0.22} strokeWidth={16} {...dash} />
            <path d={cr.d} strokeOpacity={flash * 0.5} strokeWidth={8} {...dash} />
          </g>,
        );
      }

      // The gold seam flowing in from the root: 6 px gold (swelling a little)
      // with a 2 px cream core, on a crisp warm-dark contact contour offset down
      // and right. At a free tip the gold thins out and the core runs to a point.
      if (len > 0.3) {
        const end = Lc; // the crack's own end, in sample length
        const freeTip = tip === 'free';
        const pour = main && crackRootDist(cr) === 0 ? 0.9 : 0; // a small drop where the gold was poured in
        const thin = (x: number) => (freeTip ? 0.3 + 0.7 * smooth(clamp((end - x) / 18)) : 1);
        const goldW = (x: number) => (3 * (1 + 0.07 * swell(sd + 2.6, x)) + pour * Math.max(0, 1 - x / 8) ** 2) * thin(x);
        const coreW = (x: number) => (freeTip ? Math.pow(clamp((end - 2.5 - x) / 16), 0.8) : 1) * Math.min(1, 0.35 + x / 6);
        const l1 = len * k;
        const atTip = len >= L - 0.5;
        shadows.push(<path key={`sh-${key}`} d={ribbonD(curve, 0, l1, (x) => goldW(x) + 2.4, 2.5)} transform="translate(0.5 0.7)" />);
        seams.push(<path key={`seam-${key}`} d={ribbonD(curve, 0, l1, goldW, 2.5)} fill={C.gold} />);
        seamCores.push(
          <path key={`core-${key}`} d={ribbonD(curve, 0, Math.min(l1, end - (freeTip ? 2.5 : 0)), coreW, 2.5, { end: freeTip && atTip ? 'butt' : 'round' })} fill={C.cream} transform="translate(-0.4 -0.7)" />,
        );
        // The molten front: a bright bead of gold with a hot cream core, and
        // a small warm light round it.
        if (seal < 0.999 && len < L - 0.5) {
          const at = crackAt(cr, len);
          const deg = (at.angle * 180) / Math.PI;
          fronts.push(
            <g key={`front-${key}`} transform={`translate(${f2(at.p.x)} ${f2(at.p.y)})`}>
              <circle r={26} fill={`url(#${id}-molten)`} />
              <g transform={`rotate(${f2(deg)})`}>
                <ellipse cx={-1} rx={6.4} ry={4.9} fill={C.gold} />
                <ellipse cx={-0.4} cy={-0.4} rx={4} ry={3} fill={GOLD_HOT} />
                <ellipse cx={0.1} cy={-0.6} rx={2.2} ry={1.6} fill={C.cream} />
              </g>
            </g>,
          );
        }
        // Glint: a short cream highlight runs along the seam, root to tip,
        // then a tiny sparkle at its tip as the sweep ends.
        if (glinting && len > 4) {
          const h = Math.min(GLINT_HALF, len * 0.45);
          const c = -h + glint * (len + 2 * h);
          glintAt[i] = c;
          if (c + h > 0 && c - h < len) {
            const bell = (x: number) => Math.pow(Math.max(0, 1 - ((x / k - c) / h) ** 2), 0.7);
            const p = crackAt(cr, clamp(c, 0, len)).p;
            const l0 = Math.max(0, c - h) * k;
            const l1 = Math.min(len, c + h) * k;
            sparks.push(
              <g key={`gl-${key}`}>
                <circle cx={f2(p.x)} cy={f2(p.y)} r={20} fill={`url(#${id}-molten)`} />
                <path d={ribbonD(curve, l0, l1, (x) => 0.3 + 3.3 * bell(x), 2)} fill={GOLD_HOT} />
                <path d={ribbonD(curve, l0, l1, (x) => 0.2 + 2.2 * bell(x), 2)} fill={C.cream} />
              </g>,
            );
          }
          const e = glint > 0.8 ? Math.sin((Math.PI * (glint - 0.8)) / 0.2) : 0;
          if (e > 0.01) {
            const tip = crackAt(cr, len).p;
            sparks.push(<Sparkle key={`gs-${key}`} id={id} p={tip} size={3 + 6.5 * e} rot={glint * 60} o={e} />);
          }
        }
        // Pop: a quick warm sparkle at the seam's end just after it closes.
        const pp = clamp(s.pop?.[i] ?? 0);
        if (pp > 0 && pp < 1) {
          const env = pp < 0.25 ? smooth(pp / 0.25) : 1 - smooth((pp - 0.25) / 0.75);
          const tip = crackAt(cr, len).p;
          sparks.push(
            <g key={`pop-${key}`}>
              <circle cx={f2(tip.x)} cy={f2(tip.y)} r={18 + 16 * pp} fill={`url(#${id}-molten)`} opacity={env} />
              <Sparkle id={id} p={tip} size={3 + 8 * env} rot={15 + 50 * pp} o={env} light={0.6} />
            </g>,
          );
        }
      }
    });

    // Claw punctures: small chipped gashes. The gold poured in there (each main
    // seam swells into a drop at its root) closes them up.
    if (front > 0.5) {
      setImpacts(set).forEach((p, ii) => {
        // a weak spot opened right on the strike point replaces its puncture
        if (set.weakSpots.some((w) => Math.hypot(w.x - p.x, w.y - p.y) < w.r * 0.8)) return;
        const kk = smooth(clamp(front / 8));
        const rooted = set.cracks.map((cr, ci) => ({ cr, ci })).filter(({ cr }) => Math.hypot(cr.points[0].x - p.x, cr.points[0].y - p.y) < 0.5);
        const g = rooted.length
          ? rooted.reduce((m, { cr, ci }) => Math.max(m, clamp(((s.seal[ci] ?? 0) * cr.length) / 10)), 0)
          : set.cracks.reduce((m, _, ci) => m + clamp(s.seal[ci] ?? 0) / Math.max(1, set.cracks.length), 0);
        const shape = rotPts(PUNCTURE, 9 + ((ii * 37) % 24) - 12);
        const r = 7.5 * kk;
        // the gash closes up as the gold fills it
        const hole = 1 - smooth(clamp(g * 1.4));
        if (hole > 0.01) {
          holes.push(
            <g key={`chip-${si}-${ii}`} opacity={hole}>
              <path d={placed(shape, p.x + 0.4, p.y + 0.8, r, chipped(0.9, 1.8, ii))} fill={C.porcelainShade} />
              <path d={placed(shape, p.x, p.y, r)} fill={C.night} />
            </g>,
          );
        }
      });
    }

    // Weak spots: irregular openings with a crisp night rim, the ember glowing
    // up from inside (dim from the moment it opens, full once the weak spots
    // light), a hot ring of lit glaze round them and a tight red light on the
    // shell — all pulsing at 1.2 Hz. Once sealed: a calm, flat pool of gold.
    set.weakSpots.forEach((w, wi) => {
      const links = weakLinks(set, wi);
      // It opens when the crack front reaches it.
      const at = links.reduce((m, l) => Math.min(m, crackRootDist(set.cracks[l.i] ?? set.cracks[0]) + l.t * (set.cracks[l.i]?.length ?? 0)), Infinity);
      const open = smooth(clamp((front - at) / 14));
      if (open <= 0.01) return;
      // Full once the seal front is 18 px past it (or at its crack's end, if nearer).
      const fill = links.reduce((m, l) => {
        const cr = set.cracks[l.i];
        if (!cr) return m;
        const room = Math.max(2, Math.min(18, (1 - l.t) * cr.length));
        return Math.max(m, clamp(((clamp(s.seal[l.i] ?? 0) - l.t) * cr.length) / room));
      }, 0);
      const pts = orient(weakPts(set, wi), weakAngle(set, wi));
      const r = w.r * (0.55 + 0.45 * open);
      const key = `${si}-w${wi}`;
      // Each spot's ember goes out as its own gold fills.
      const live = (1 - smooth(fill)) * open;
      const glow = weak * live;
      const ember = Math.max(weak, EMBER_FLOOR) * live;
      const ringG = Math.max(weak, RING_FLOOR) * live;
      if (glow > 0.01) {
        lights.push(<circle key={`l-${key}`} cx={w.x} cy={w.y} r={r * (2.05 + 0.5 * pn)} fill={`url(#${id}-ember-light)`} opacity={glow * (0.72 + 0.28 * pn)} />);
      }
      if (ringG > 0.01) {
        const ring = (4 + 4.5 * pn) * (0.6 + 0.4 * clamp(weak / Math.max(0.01, ringG)));
        holes.push(
          <g key={`ring-${key}`}>
            <path d={placed(pts, w.x, w.y, r, chipped(ring + 2.5, ring * 1.3 + 3.5, wi + 1))} fill={EMBER_DEEP} opacity={ringG * 0.6} />
            <path d={placed(pts, w.x, w.y, r, chipped(ring * 0.7, ring * 1.2, wi + 3))} fill={C.ember} opacity={ringG * (0.85 + 0.15 * pn)} />
          </g>,
        );
      }
      holes.push(
        <g key={key} opacity={1 - smooth(clamp(fill * 1.3))}>
          <path d={placed(pts, w.x, w.y, r, chipped(1.6, 2.8, wi))} fill={C.night} />
          {ember > 0.01 ? (
            <g opacity={clamp(ember * (0.78 + 0.22 * pn))}>
              <path d={placed(pts, w.x, w.y + r * 0.06, r * 0.9)} fill={`url(#${id}-ember-core)`} />
              <path d={placed(pts, w.x, w.y + r * 0.2, r * (0.26 + 0.12 * pn))} fill={EMBER_HEART} opacity={(0.55 + 0.45 * pn) * clamp(weak * 1.5)} />
            </g>
          ) : null}
        </g>,
      );
      if (fill > 0.01) {
        // A flat pool of gold about 70 % of the opening, drawn out a little
        // along its seam: one calm fill with a thin dark contour on the same
        // contact contour as the seams; the seams' cream cores run on through
        // it (so it reads as the seam widening into an inlay, not a bead on a
        // string), and one small highlight.
        const gf = smooth(fill);
        const sc = (r + 3.2) * 0.7 * (0.45 + 0.55 * gf);
        const pp = orient(weakPts(set, wi), weakAngle(set, wi), 1.06, 0.94);
        let shine = 0;
        if (glinting) {
          for (const l of links) {
            const c = glintAt[l.i];
            const cr = set.cracks[l.i];
            if (c === undefined || !cr) continue;
            shine = Math.max(shine, 1 - Math.abs(c - l.t * cr.length) / (GLINT_HALF * 1.6));
          }
        }
        const o = clamp(fill * 3);
        shadows.push(<path key={`psh-${key}`} d={patchD(pp, w.x + 1, w.y + 1.1, sc + 0.8)} fillOpacity={SEAM_SHADOW_O * o} />);
        patchRims.push(<path key={`pr-${key}`} d={patchD(pp, w.x, w.y, sc + 0.9)} fill={PATCH_EDGE} opacity={o} />);
        golds.push(
          <g key={`g-${key}`}>
            {gf < 0.999 ? <circle cx={w.x} cy={w.y} r={sc * 2.4} fill={`url(#${id}-molten)`} opacity={1 - gf} /> : null}
            <path d={patchD(pp, w.x, w.y, sc)} fill={C.gold} opacity={o} />
            {shine > 0.01 ? (
              <g opacity={shine}>
                <circle cx={w.x} cy={w.y} r={sc * 1.8} fill={`url(#${id}-molten)`} />
                <path d={patchD(pp, w.x - sc * 0.06, w.y - sc * 0.08, sc * 0.74)} fill={GOLD_HOT} />
              </g>
            ) : null}
          </g>,
        );
        patchLights.push(
          <path
            key={`pl-${key}`}
            d={patchGlintD(pp, w.x, w.y, sc, 2.6, weakAngle(set, wi))}
            fill="none"
            stroke={C.cream}
            strokeWidth={1.6 + 0.8 * shine}
            strokeLinecap="round"
            opacity={o * (0.85 + 0.15 * shine)}
          />,
        );
      }
    });
  });

  return (
    <g transform={`translate(${-a.cx} ${-a.feetY})`}>
      {lights}
      {edges}
      {cores}
      {holes}
      {/* fill-opacity per path, not a group opacity (an offscreen group here
          makes the renderer drop whole tiles) */}
      {shadows.length ? (
        <g fill={SEAM_SHADOW} fillOpacity={SEAM_SHADOW_O}>
          {shadows}
        </g>
      ) : null}
      {patchRims}
      {seams}
      {golds}
      {seamCores}
      {patchLights}
      {fronts}
      {sparks}
    </g>
  );
};
