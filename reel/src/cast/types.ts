// The cast's contracts. Shots are written against these; the cast modules
// implement them. Coordinates are stage coordinates: the 1080 × 1920 canvas at
// the shot's reference framing (the Camera scales the whole stage).

import type { BotKind } from '../geometry';
import type { Pt } from '../lib/anim';

export type { BotKind, Pt };

/* ───────────────────────── Bots (src/cast/Bots.tsx) ───────────────────────── */

export interface Crack {
  d: string; // SVG path in stage coordinates, from its root (the impact) outward (smooth cubics; the seam is drawn on the same path)
  length: number; // path length in px (= getLength(d))
  points: Pt[]; // the polyline the path was built from (root first)
}

export interface CrackSet {
  kind: BotKind;
  cracks: Crack[]; // 5–8 for a strike, 1 for a hairline
  weakSpots: { x: number; y: number; r: number }[]; // 2–3 ember openings (0 for a hairline)
  longest: number; // index of the longest crack (the one the claw traces in shot 4)
}

export interface CrackState {
  set: CrackSet;
  grow: number; // 0..1 how far the cracks have spread from their roots
  weak: number; // 0..1 ember intensity of the weak spots and crack light (0 = out)
  pulseFrame: number; // frame used for the 1.2 Hz ember pulse
  seal: number[]; // per crack, 0..1 how far gold has flowed in from the root
  warm: number; // 0..1 warm gold glow on the shell after sealing (fades over 1 s)
  flash?: number; // 0..1 ember flash along a fresh hairline crack (shot 5)
  glint?: number; // 0..1 a short cream highlight sweeping along every sealed seam, root to tip, with a tiny sparkle at each tip near the end (the 'evolves' beat); 0 or 1 = at rest
  pop?: number[]; // per crack, 0..1 through a quick warm sparkle at the seam's end just after it closes (0 or 1 = none)
}

export interface BotPose {
  look?: Pt; // gaze, each axis −1..1 (y −1 = up)
  squash?: number; // vertical scale anchored at the feet: 1 normal, 0.94 cower, 1.04 stretch / proud
  lean?: number; // degrees about the feet; negative leans left
  lift?: number; // px upward (a hop)
  fear?: number; // 0..1 eyes wide
  bright?: number; // 0..1 eyes brighten (a highlight)
  tailWiggle?: number; // bubble only: 0..1 progress through its one tail wiggle
  idle?: boolean; // blink every 2–3 s and bob 3 px over 1.5 s, out of step (default true)
  freeze?: boolean; // frozen mid-flinch: no idle motion at all
}

export interface BotProps extends BotPose {
  kind: BotKind;
  frame: number; // absolute frame, drives the idle cycle
  cracks?: CrackState[]; // the strike set, plus hairlines in shot 5
  silhouette?: boolean; // impact flash: a flat night shape, nothing else
  shadow?: boolean; // contact shadow on the stage (default true)
}
