// Cracks, weak spots and gold seams on a bot's shell. Drawn inside the bot's
// posed group, clipped to its shell; crack geometry is in stage coordinates, so
// the layer is shifted by −anchor to sit in the bot's local space.
//
// Cracks and seams share one smooth path per crack (Crack.d). Both are drawn
// as bands along it whose width swells and tapers a little (seeded), so they
// read as organic breaks and kintsugi, never as traces on a circuit board.

import React from 'react';
import { BOTS, type BotKind } from '../../geometry';
import { C } from '../../theme';
import { mix } from '../../stage/Stage';
import { clamp, smooth, type Pt } from '../../lib/anim';
import type { CrackState } from '../types';
import { crackAt, crackCurve, crackRootDist, isHairline, setImpacts, setReach, weakAngle, weakLinks, weakPts } from './cracks';
import { bboxOf, polyD, ribbonD, smoothClosedD, swell } from './geom';
import { shellLocal, toStage } from './shapes';

// Tints of the palette (no colour outside theme.ts).
const EMBER_DEEP = mix(C.ember, C.maroon, 0.5); // the scorched band round an opening, its inner wall
const EMBER_HOT = mix(C.ember, C.gold, 0.5); // the hot core deep inside
const EMBER_HEART = mix(C.gold, C.cream, 0.4); // the very heart of the core
const GOLD_DEEP = mix(C.gold, C.maroon, 0.3); // the lower edge of a raised gold patch
const GOLD_HOT = mix(C.gold, C.cream, 0.55);

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
// The same, as a smooth outline with its lobes calmed (molten gold has no
// chipped corners).
const calm = (pts: XY[]): XY[] =>
  pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(p.x, p.y) || 1;
    const m = 0.7 * l + 0.15 * (Math.hypot(a.x, a.y) + Math.hypot(b.x, b.y));
    return { x: (p.x / l) * m, y: (p.y / l) * m };
  });
const pooled = (pts: XY[], cx: number, cy: number, r: number) => smoothClosedD(calm(pts).map((p) => ({ x: cx + p.x * r, y: cy + p.y * r })));
// A chipped edge: each vertex its own amount between lo and hi.
const chipped = (lo: number, hi: number, seed = 0) => (i: number) => lo + (hi - lo) * ((((i + seed) * 7) % 5) / 4);

// The opening, a little longer along the crack it breaks.
const orient = (pts: XY[], angle: number): XY[] => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: p.x * 1.15 * c - p.y * 0.92 * s, y: p.x * 1.15 * s + p.y * 0.92 * c }));
};

// A claw puncture: a small chipped gash, wide where the tip broke in, tailing
// off downward (unit size). Sealed, it is a drop of gold.
const PUNCTURE: XY[] = [
  { x: -0.1, y: -0.95 },
  { x: 0.3, y: -0.86 },
  { x: 0.5, y: -0.45 },
  { x: 0.4, y: 0.12 },
  { x: 0.17, y: 0.6 },
  { x: 0.03, y: 1.05 },
  { x: -0.17, y: 0.55 },
  { x: -0.38, y: 0.02 },
  { x: -0.5, y: -0.5 },
  { x: -0.38, y: -0.84 },
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
  const lines: React.ReactNode[] = [];
  const holes: React.ReactNode[] = [];
  const seams: React.ReactNode[] = [];
  const golds: React.ReactNode[] = [];
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

      // The open crack, where the gold has not reached: porcelain-shade edges
      // round a night core, heavier at the root and tapering out, with a
      // thread of ember while the weak spots glow.
      if (vis - len > 0.3) {
        const edge = (x: number) => (hair ? 1.8 : main ? 3.8 : 3.1) * (1 - (hair ? 0.3 : 0.4) * (x / Lc)) * (1 + 0.14 * swell(sd, x));
        const core = (x: number) => (hair ? 0.8 : main ? 1.75 : 1.4) * (1 - 0.34 * (x / Lc)) * (1 + 0.16 * swell(sd + 1.3, x));
        // the open part only (a dash offset, never a zero-length dash: Skia chokes on those when zoomed)
        const open = { strokeDasharray: `${f2(vis - len)} ${f2(L + 80)}`, strokeDashoffset: f2(-len) };
        lines.push(
          <g key={key}>
            <path d={ribbonD(curve, len * k, vis * k, edge)} fill={C.porcelainShade} />
            <path d={ribbonD(curve, len * k, vis * k, core)} fill={C.night} />
            {!hair && weak > 0.01 ? (
              <path d={cr.d} fill="none" stroke={C.ember} strokeOpacity={weak * (0.3 + 0.3 * pn)} strokeWidth={0.9} strokeLinecap="round" {...open} />
            ) : null}
            {flash > 0.01 ? <path d={cr.d} fill="none" stroke={C.ember} strokeOpacity={flash} strokeWidth={2.6} strokeLinecap="round" {...open} /> : null}
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
      // with a 2 px cream core, raised on a soft night shadow.
      if (len > 0.3) {
        const pour = main && crackRootDist(cr) === 0 ? 1.3 : 0; // a drop where the gold was poured in
        const goldW = (x: number) => 3.05 * (1 + 0.11 * swell(sd + 2.6, x)) + pour * Math.max(0, 1 - x / 9) ** 2;
        const dash = `${f2(len)} ${f2(L + 80)}`;
        seams.push(
          <g key={`seam-${key}`}>
            <path d={cr.d} transform="translate(1.1 1.8)" fill="none" stroke={C.night} strokeOpacity={0.28} strokeWidth={6.5} strokeLinecap="round" strokeDasharray={dash} />
            <path d={ribbonD(curve, 0, len * k, goldW)} fill={C.gold} />
            <path d={cr.d} fill="none" stroke={C.cream} strokeWidth={2} strokeLinecap="round" strokeDasharray={dash} />
          </g>,
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
              <path d={placed(shape, p.x + 0.5, p.y + 1, r, chipped(1.2, 2.4, ii))} fill={C.porcelainShade} />
              <path d={placed(shape, p.x, p.y, r)} fill={C.night} />
            </g>,
          );
        }
      });
    }

    // Weak spots: irregular openings with a crisp night rim, the ember glowing
    // up from inside, a hot ring of lit glaze round them and a tight red light
    // on the shell — all pulsing at 1.2 Hz. Once sealed: a raised gold patch.
    set.weakSpots.forEach((w, wi) => {
      const links = weakLinks(set, wi);
      // It opens when the crack front reaches it.
      const at = links.reduce((m, l) => Math.min(m, crackRootDist(set.cracks[l.i] ?? set.cracks[0]) + l.t * (set.cracks[l.i]?.length ?? 0)), Infinity);
      const open = smooth(clamp((front - at) / 14));
      if (open <= 0.01) return;
      const fill = links.reduce((m, l) => {
        const cr = set.cracks[l.i];
        if (!cr) return m;
        return Math.max(m, clamp(((clamp(s.seal[l.i] ?? 0) - l.t) * cr.length) / 18));
      }, 0);
      const pts = orient(weakPts(set, wi), weakAngle(set, wi));
      const r = w.r * (0.55 + 0.45 * open);
      const key = `${si}-w${wi}`;
      // Each spot's ember goes out as its own gold fills.
      const glow = weak * (1 - smooth(fill)) * open;
      if (glow > 0.01) {
        lights.push(<circle key={`l-${key}`} cx={w.x} cy={w.y} r={r * (2.05 + 0.5 * pn)} fill={`url(#${id}-ember-light)`} opacity={glow * (0.72 + 0.28 * pn)} />);
        const ring = 4 + 4.5 * pn;
        holes.push(
          <g key={`ring-${key}`}>
            <path d={placed(pts, w.x, w.y, r, chipped(ring + 2.5, ring * 1.3 + 3.5, wi + 1))} fill={EMBER_DEEP} opacity={glow * 0.6} />
            <path d={placed(pts, w.x, w.y, r, chipped(ring * 0.7, ring * 1.2, wi + 3))} fill={C.ember} opacity={glow * (0.85 + 0.15 * pn)} />
          </g>,
        );
      }
      holes.push(
        <g key={key} opacity={1 - smooth(clamp(fill * 1.3))}>
          <path d={placed(pts, w.x, w.y, r, chipped(1.6, 2.8, wi))} fill={C.night} />
          {glow > 0.01 ? (
            <g opacity={clamp(glow * (0.78 + 0.22 * pn))}>
              <path d={placed(pts, w.x, w.y + r * 0.06, r * 0.9)} fill={`url(#${id}-ember-core)`} />
              <path d={placed(pts, w.x, w.y + r * 0.2, r * (0.26 + 0.12 * pn))} fill={EMBER_HEART} opacity={0.55 + 0.45 * pn} />
            </g>
          ) : null}
        </g>,
      );
      if (fill > 0.01) {
        const gf = smooth(fill);
        const sc = (r + 3.2) * (0.4 + 0.6 * gf);
        let shine = 0;
        if (glinting) {
          for (const l of links) {
            const c = glintAt[l.i];
            const cr = set.cracks[l.i];
            if (c === undefined || !cr) continue;
            shine = Math.max(shine, 1 - Math.abs(c - l.t * cr.length) / (GLINT_HALF * 1.6));
          }
        }
        golds.push(
          <g key={`g-${key}`}>
            {gf < 0.999 ? <circle cx={w.x} cy={w.y} r={sc * 2.2} fill={`url(#${id}-molten)`} opacity={1 - gf} /> : null}
            <g opacity={clamp(fill * 3)}>
              <path d={pooled(pts, w.x + 1.2, w.y + 2, sc)} fill={C.night} opacity={0.3} />
              <path d={pooled(pts, w.x, w.y, sc)} fill={GOLD_DEEP} />
              <path d={pooled(pts, w.x - 0.7, w.y - 1.1, sc * 0.88)} fill={C.gold} />
              <path d={pooled(pts, w.x - sc * 0.24, w.y - sc * 0.3, sc * 0.42)} fill={GOLD_HOT} />
              <path d={pooled(pts, w.x - sc * 0.3, w.y - sc * 0.36, sc * 0.18)} fill={C.cream} />
            </g>
            {shine > 0.01 ? (
              <g opacity={shine}>
                <circle cx={w.x} cy={w.y} r={sc * 1.8} fill={`url(#${id}-molten)`} />
                <path d={pooled(pts, w.x - sc * 0.18, w.y - sc * 0.22, sc * 0.62)} fill={GOLD_HOT} />
                <path d={pooled(pts, w.x - sc * 0.26, w.y - sc * 0.3, sc * 0.3)} fill={C.cream} />
              </g>
            ) : null}
          </g>,
        );
      }
    });
  });

  return (
    <g transform={`translate(${-a.cx} ${-a.feetY})`}>
      {lights}
      {lines}
      {holes}
      {seams}
      {golds}
      {fronts}
      {sparks}
    </g>
  );
};
