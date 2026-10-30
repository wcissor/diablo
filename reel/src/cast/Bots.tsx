// The three porcelain bots (brief section 5): the bubble, the cube and the orb.
// Each draws as an SVG <g> in stage coordinates at BOTS[kind] (geometry.ts),
// with its acting pose, idle cycle, cracks, gold seams and silhouette.

import React from 'react';
import { BOTS, type BotKind } from '../geometry';
import { C } from '../theme';
import { clamp, type Pt } from '../lib/anim';
import type { BotPose, BotProps } from './types';
import { BubbleArt } from './bots/Bubble';
import { CubeArt } from './bots/Cube';
import { OrbArt } from './bots/Orb';
import { CrackLayer } from './bots/CrackLayer';
import { resolvePose } from './bots/pose';
import { BUBBLE, CUBE, ORB, outlineLocal } from './bots/shapes';
import { bboxOf } from './bots/geom';

export { makeCracks, makeHairline, freeShellPoint, isFreeShell, crackAt, WEAK_EYE_CLEAR } from './bots/cracks';
export type { BotCrack, BotCrackSet, BotWeakSpot, ImpactInfo, MakeCracksOpts } from './bots/cracks';
export { Shards, SHARD_LIFE } from './bots/Shards';
export { pulseOf } from './bots/CrackLayer';

// Contact shadow on the stage: flat night, low opacity, shrinking as it lifts.
const SHADOW: Record<BotKind, { x: number; y: number; rx: number; ry: number; o: number }> = {
  bubble: { x: 8, y: 0, rx: 108, ry: 10, o: 0.55 },
  cube: { x: 0, y: 0, rx: 106, ry: 11, o: 0.6 },
  orb: { x: 0, y: 20, rx: 74, ry: 9, o: 0.42 },
};

const ContactShadow: React.FC<{ kind: BotKind; lift: number; bob: number }> = ({ kind, lift, bob }) => {
  const s = SHADOW[kind];
  // The orb's hover height breathes with its bob.
  const h = Math.max(0, lift) + (kind === 'orb' ? -bob : 0);
  const k = clamp(1 - h / 220, 0.35, 1.05);
  const o = s.o * clamp(1 - h / 160, 0.25, 1.05);
  return (
    <g opacity={o}>
      <ellipse cx={s.x} cy={s.y} rx={s.rx * k} ry={s.ry * k} fill={C.night} />
      <ellipse cx={s.x} cy={s.y} rx={s.rx * k * 0.72} ry={s.ry * k * 0.62} fill={C.night} />
    </g>
  );
};

// Squash anchored at the feet, lean about the feet, lift. The bubble and the
// cube lean by shearing so their feet stay planted; the hovering orb tilts.
const poseTransform = (kind: BotKind, r: { lift: number; lean: number; stretchX: number; squash: number }) =>
  `translate(0 ${(-r.lift).toFixed(3)}) ${kind === 'orb' ? `rotate(${r.lean.toFixed(3)})` : `skewX(${(-r.lean).toFixed(3)})`} scale(${r.stretchX.toFixed(4)} ${r.squash.toFixed(4)})`;

export const Bot: React.FC<BotProps> = (props) => {
  const { kind, frame, cracks, silhouette = false, shadow = true } = props;
  const r = resolvePose(kind, frame, props);
  const id = `bot-${kind}`;
  const a = BOTS[kind];
  const has = cracks && cracks.length > 0 && !silhouette;
  const crackNode = has ? <CrackLayer kind={kind} id={id} states={cracks} /> : null;
  const warmNode = has ? <CrackLayer kind={kind} id={id} states={cracks} part="warm" /> : null;
  const Art = kind === 'bubble' ? BubbleArt : kind === 'cube' ? CubeArt : OrbArt;
  return (
    <g transform={`translate(${a.cx} ${a.feetY})`}>
      {shadow && !silhouette ? <ContactShadow kind={kind} lift={r.lift} bob={r.bob} /> : null}
      <g transform={poseTransform(kind, r)}>
        <Art id={id} r={r} sil={silhouette} cracks={crackNode} warm={warmNode} />
      </g>
    </g>
  );
};

// Bounds in stage coordinates: everything incl. ring, antenna, feet, tail and
// the 2 px outline (not the contact shadow). Neutral pose by default; pass a
// pose to bound that pose instead (idle bob and antenna sway included).
export function botBounds(kind: BotKind, pose?: BotPose): { x0: number; y0: number; x1: number; y1: number } {
  const a = BOTS[kind];
  const pts = outlineLocal(kind);
  const pad = 2;
  if (!pose) {
    const b = bboxOf(pts);
    return { x0: b.x0 + a.cx - pad, y0: b.y0 + a.feetY - pad, x1: b.x1 + a.cx + pad, y1: b.y1 + a.feetY + pad };
  }
  const r = resolvePose(kind, 0, { ...pose, idle: false });
  const idlePad = pose.freeze || pose.idle === false ? 0 : 2;
  const rad = (r.lean * Math.PI) / 180;
  const cs = Math.cos(rad);
  const sn = Math.sin(rad);
  const tn = Math.tan(rad);
  const moved = pts.map((p) => {
    const x = p.x * r.stretchX;
    const y = p.y * r.squash;
    if (kind !== 'orb') return { x: x - y * tn + a.cx, y: y - r.lift + a.feetY };
    return { x: x * cs - y * sn + a.cx, y: x * sn + y * cs - r.lift + a.feetY };
  });
  const b = bboxOf(moved);
  const pp = pad + idlePad;
  return { x0: b.x0 - pp, y0: b.y0 - pp, x1: b.x1 + pp, y1: b.y1 + pp };
}

// Where a point on the shell (stage coordinates at the neutral pose, e.g. an
// impact or a crack point) is drawn for a given pose and frame: squash, lean,
// lift and the idle bob/breath included. Use it to land a claw tip exactly on
// a posed bot, or to run a claw along cracks[longest].points.
export function botPoint(kind: BotKind, p: Pt, pose: BotPose = {}, frame = 0): Pt {
  const a = BOTS[kind];
  const r = resolvePose(kind, frame, pose);
  let x = p.x - a.cx;
  let y = p.y - a.feetY;
  if (kind === 'cube') y *= 1 - r.bob / 238;
  else y += r.bob;
  x *= r.stretchX;
  y *= r.squash;
  const rad = (r.lean * Math.PI) / 180;
  if (kind === 'orb') {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    [x, y] = [x * c - y * s, x * s + y * c];
  } else {
    x -= y * Math.tan(rad);
  }
  return { x: x + a.cx, y: y - r.lift + a.feetY };
}

// The top centre of the shell (neutral pose), where a claw or the tail tip lands.
// The cube's antenna stands on its top face's centre, so its point is on the
// top face 34 px to the right of it (clear of the base; the antenna leans left).
export function botTop(kind: BotKind): Pt {
  const a = BOTS[kind];
  if (kind === 'bubble') return { x: a.cx + BUBBLE.centre.x, y: a.feetY + BUBBLE.centre.y - BUBBLE.b };
  if (kind === 'cube') return { x: a.cx + CUBE.topCentre.x + 34, y: a.feetY + CUBE.topCentre.y };
  return { x: a.cx + ORB.centre.x, y: a.feetY + ORB.centre.y - ORB.r };
}
