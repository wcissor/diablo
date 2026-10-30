// Cracks, weak spots and gold seams on a bot's shell. Drawn inside the bot's
// posed group, clipped to its shell; crack geometry is in stage coordinates, so
// the layer is shifted by −anchor to sit in the bot's local space.

import React from 'react';
import { BOTS, type BotKind } from '../../geometry';
import { C } from '../../theme';
import { clamp, smooth } from '../../lib/anim';
import type { CrackState } from '../types';
import { crackRootDist, isHairline, setImpacts, setReach, weakAngle, weakLinks, weakPts } from './cracks';
import { bboxOf, pointAlong, polyD } from './geom';
import { shellLocal, toStage } from './shapes';

export const pulseOf = (pulseFrame: number) => 0.74 + 0.26 * Math.sin((2 * Math.PI * 1.2 * pulseFrame) / 30);

// Static defs for the layer (local coordinates of the bot's posed group).
export const CrackDefs: React.FC<{ id: string }> = ({ id }) => (
  <>
    <radialGradient id={`${id}-ember-light`}>
      <stop offset="0" stopColor={C.ember} stopOpacity={0.95} />
      <stop offset="0.28" stopColor={C.ember} stopOpacity={0.62} />
      <stop offset="0.5" stopColor={C.ember} stopOpacity={0.24} />
      <stop offset="0.75" stopColor={C.ember} stopOpacity={0.06} />
      <stop offset="1" stopColor={C.ember} stopOpacity={0} />
    </radialGradient>
    <radialGradient id={`${id}-ember-core`} cx="0.45" cy="0.42" r="0.6">
      <stop offset="0" stopColor="#F6A88C" />
      <stop offset="0.45" stopColor={C.ember} />
      <stop offset="1" stopColor="#B9241E" />
    </radialGradient>
    <radialGradient id={`${id}-warm`} cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stopColor={C.gold} stopOpacity={0.3} />
      <stop offset="0.6" stopColor={C.gold} stopOpacity={0.12} />
      <stop offset="1" stopColor={C.gold} stopOpacity={0.03} />
    </radialGradient>
  </>
);

type XY = { x: number; y: number };
const scalePts = (pts: XY[], cx: number, cy: number, r: number) => polyD(pts.map((p) => ({ x: cx + p.x * r, y: cy + p.y * r })));

// The opening stretched along the crack it breaks.
const orient = (pts: XY[], angle: number): XY[] => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: p.x * 1.45 * c - p.y * 0.8 * s, y: p.x * 1.45 * s + p.y * 0.8 * c }));
};

// A chipped rim: each vertex pushed out by its own amount (px).
const rimPts = (pts: XY[], cx: number, cy: number, r: number) =>
  polyD(
    pts.map((p, i) => {
      const l = Math.hypot(p.x, p.y) || 1;
      const out = 1.3 + 2.6 * (((i * 7) % 5) / 4);
      return { x: cx + p.x * r + (p.x / l) * out, y: cy + p.y * r + (p.y / l) * out };
    }),
  );

// A claw puncture: a small wedge driven downward into the shell.
const CHIP: XY[] = [
  { x: 0.1, y: -1 },
  { x: 0.55, y: -0.35 },
  { x: 0.35, y: 0.55 },
  { x: 0.05, y: 1.15 },
  { x: -0.3, y: 0.6 },
  { x: -0.6, y: -0.25 },
];

const bbCache: Partial<Record<BotKind, ReturnType<typeof bboxOf>>> = {};
const shellBox = (kind: BotKind) => (bbCache[kind] ??= bboxOf(toStage(kind, shellLocal(kind))));

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

  const lines: React.ReactNode[] = [];
  const lights: React.ReactNode[] = [];
  const holes: React.ReactNode[] = [];
  const seams: React.ReactNode[] = [];
  const golds: React.ReactNode[] = [];

  states.forEach((s, si) => {
    const set = s.set;
    const reach = setReach(set);
    const front = clamp(s.grow) * reach;
    const pulse = pulseOf(s.pulseFrame);
    const hair = isHairline(set);
    const weak = clamp(s.weak);
    const flash = clamp(s.flash ?? 0);

    set.cracks.forEach((cr, i) => {
      const L = cr.length;
      const vis = clamp(front - crackRootDist(cr), 0, L);
      if (vis <= 0.3) return;
      const dash = `${vis.toFixed(2)} ${(L + 60).toFixed(2)}`;
      const key = `${si}-${i}`;
      // Crack: porcelain-shade edges, night core; a thread of ember while open.
      // Mains are a little heavier near the impact (a taper in two steps).
      const main = !hair && (cr as { main?: boolean }).main !== false;
      const head = Math.min(vis, L * 0.38);
      const hdash = `${head.toFixed(2)} ${(L + 60).toFixed(2)}`;
      lines.push(
        <g key={key} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d={cr.d} stroke={C.porcelainShade} strokeWidth={hair ? 3 : 4.6} strokeDasharray={dash} />
          {main ? <path d={cr.d} stroke={C.porcelainShade} strokeWidth={6.4} strokeDasharray={hdash} /> : null}
          <path d={cr.d} stroke={C.night} strokeWidth={hair ? 1.3 : 2} strokeDasharray={dash} />
          {main ? <path d={cr.d} stroke={C.night} strokeWidth={3.2} strokeDasharray={hdash} /> : null}
          {!hair && weak > 0.01 ? <path d={cr.d} stroke={C.ember} strokeOpacity={weak * pulse * 0.55} strokeWidth={0.8} strokeDasharray={dash} /> : null}
          {flash > 0.01 ? <path d={cr.d} stroke={C.ember} strokeOpacity={flash} strokeWidth={3} strokeDasharray={dash} /> : null}
        </g>,
      );
      if (flash > 0.01) {
        const mid = pointAlong(cr.points, vis / 2).p;
        const rr = Math.max(26, vis * 0.85);
        lights.push(<circle key={`fl-${key}`} cx={mid.x} cy={mid.y} r={rr} fill={`url(#${id}-ember-light)`} opacity={flash} />);
      }
      // Gold seam flowing from the root: 6 px gold, 2 px cream core, raised.
      const seal = clamp(s.seal[i] ?? 0);
      const len = Math.min(seal * L, vis);
      if (len > 0.3) {
        const sd = `${len.toFixed(2)} ${(L + 60).toFixed(2)}`;
        const tip = pointAlong(cr.points, len).p;
        seams.push(
          <g key={`seam-${key}`}>
            <path d={cr.d} transform="translate(1.1 1.8)" fill="none" stroke={C.night} strokeOpacity={0.28} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={sd} />
            <path d={cr.d} fill="none" stroke={C.gold} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={sd} />
            <path d={cr.d} fill="none" stroke={C.cream} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={sd} />
            {seal < 0.999 && len < L - 0.5 ? (
              <g>
                <circle cx={tip.x} cy={tip.y} r={4.8} fill={C.gold} />
                <circle cx={tip.x - 0.6} cy={tip.y - 0.8} r={2.3} fill={C.cream} />
              </g>
            ) : null}
          </g>,
        );
      }
    });

    if (front > 0.5) {
      setImpacts(set).forEach((p, ii) => {
        const k = smooth(clamp(front / 8));
        // The puncture fills with gold once a crack rooted there starts to seal
        // (a hand-built set with no crack rooted there follows the mean seal).
        const rooted = set.cracks.map((cr, ci) => ({ cr, ci })).filter(({ cr }) => Math.hypot(cr.points[0].x - p.x, cr.points[0].y - p.y) < 0.5);
        const g = rooted.length
          ? rooted.reduce((m, { cr, ci }) => Math.max(m, clamp(((s.seal[ci] ?? 0) * cr.length) / 10)), 0)
          : set.cracks.reduce((m, _, ci) => m + clamp(s.seal[ci] ?? 0) / Math.max(1, set.cracks.length), 0);
        const tr = `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${((ii * 37) % 30) - 15}) scale(${k.toFixed(3)})`;
        holes.push(
          <g key={`chip-${si}-${ii}`} transform={tr}>
            <path d={scalePts(CHIP, 0, 0, 7.5)} fill={C.porcelainShade} />
            <path d={scalePts(CHIP, 0.2, 0.6, 4.6)} fill={C.night} />
          </g>,
        );
        if (g > 0.01) {
          golds.push(
            <g key={`gchip-${si}-${ii}`} transform={tr} opacity={smooth(g)}>
              <path d={scalePts(CHIP, 1.1, 1.8, 6.4)} fill={C.night} opacity={0.28} />
              <path d={scalePts(CHIP, 0, 0, 6.4)} fill={C.gold} />
              <path d={scalePts(CHIP, -0.8, -1.2, 2.4)} fill={C.cream} />
            </g>,
          );
        }
      });
    }

    set.weakSpots.forEach((w, wi) => {
      const links = weakLinks(set, wi);
      // It opens when the crack front reaches it.
      const at = links.reduce((m, l) => Math.min(m, crackRootDist(set.cracks[l.i] ?? set.cracks[0]) + l.t * (set.cracks[l.i]?.length ?? 0)), Infinity);
      const open = smooth(clamp((front - at) / 14));
      if (open <= 0.01) return;
      const fill = links.reduce((m, l) => {
        const cr = set.cracks[l.i];
        if (!cr) return m;
        return Math.max(m, clamp(((clamp(s.seal[l.i] ?? 0) - l.t) * cr.length) / 16));
      }, 0);
      const pts = orient(weakPts(set, wi), weakAngle(set, wi));
      const r = w.r * (0.55 + 0.45 * open);
      const key = `${si}-w${wi}`;
      if (weak > 0.01) {
        lights.push(<circle key={`l-${key}`} cx={w.x} cy={w.y} r={w.r * 4.4} fill={`url(#${id}-ember-light)`} opacity={weak * pulse * open} />);
      }
      // An opening: a chipped porcelain-shade rim, the dark inner wall, and the
      // ember glowing from deep inside (lower in the hole, hot at its heart).
      holes.push(
        <g key={key}>
          <path d={rimPts(pts, w.x, w.y, r)} fill={C.porcelainShade} />
          <path d={scalePts(pts, w.x, w.y, r)} fill={C.night} />
          {weak > 0.01 ? (
            <g opacity={clamp(weak * (0.6 + 0.4 * pulse))}>
              <path d={scalePts(pts, w.x + 0.3, w.y + r * 0.2, r * 0.84)} fill={`url(#${id}-ember-core)`} />
              <path d={scalePts(pts, w.x + 0.3, w.y + r * 0.26, r * 0.34)} fill="#F7B49A" opacity={0.9} />
            </g>
          ) : null}
        </g>,
      );
      if (fill > 0.01) {
        const gf = smooth(fill);
        golds.push(
          <g key={`g-${key}`} opacity={gf}>
            <path d={scalePts(pts, w.x + 1.1, w.y + 1.8, (r + 2.4) * (0.6 + 0.4 * gf))} fill={C.night} opacity={0.28} />
            <path d={scalePts(pts, w.x, w.y, (r + 2.4) * (0.6 + 0.4 * gf))} fill={C.gold} />
            <path d={scalePts(pts, w.x - r * 0.22, w.y - r * 0.26, r * 0.38 * (0.6 + 0.4 * gf))} fill={C.cream} />
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
    </g>
  );
};
