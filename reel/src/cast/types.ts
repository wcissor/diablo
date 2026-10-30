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

/* ─────────────────── Diablo (src/cast/Diablo.tsx, Hands, Tail) ─────────────────── */

export interface EyeState {
  open: number; // 0..1 slit height (0 closed, 1 fully open)
  narrow?: number; // 0..1 the pleased squint (slits shorter and slightly lidded)
  look?: Pt; // px offset of both eyes inside the head (flicking to weak spots)
  glare?: number; // 0..1 the menacing squint (a flat lid tilted toward the nose), for the strike
}

export interface HeadProps {
  dx?: number; // px offset from the settled position (DIABLO_ORIGIN), e.g. rising from below
  dy?: number;
  scale?: number; // multiplies the settled scale (1 = head 480 px wide)
  rot?: number; // degrees about the eyes' midpoint
  eyes: EyeState;
  eyesOnly?: boolean; // shot 1: only the gold slits in the dark, no head
  ember?: number; // 0..1 red light from the open cracks on his lower edges
  warm?: number; // 0..1 warm gold light from the seams
  silhouette?: boolean; // impact flash: flat night shape
  clipBelowY?: number; // stage y below which the head is hidden (rising from behind the stage line)
  ghost?: number; // 0..1 with eyesOnly: the faint cream top-edge rim of head and horns (× 35 % opacity), no fill
}

export interface HandPose {
  side: 'left' | 'right'; // the left hand is on the viewer's left
  x: number; // palm centre, stage coordinates
  y: number;
  rot?: number; // degrees, 0 = claws pointing straight down
  spread?: number; // 0..1 claws fanned apart
  curl?: number; // 0..1 claws hooked in, tips forward (strike)
  scale?: number; // 1 = palm half the head width (240 px)
  point?: number; // 0..1 one claw extends straight-ish and leads; the other three curl back tight against the palm
  pointClaw?: number; // which claw points, an index into clawTips() order (0 outer, 1 middle, 2 inner, 3 thumb); default 1
}

export interface HandProps extends HandPose {
  tremble?: number; // px of hover tremble
  frame?: number; // for the tremble
  ember?: number; // 0..1 red light on the claws
  warm?: number; // 0..1 warm gold light on the claws
  silhouette?: boolean;
}

export interface TailCrescentPose {
  x: number; // where the crescent's centre of mass sits, stage coordinates
  y: number;
  rot?: number; // degrees
  scale?: number; // 1 = the size it has in the logo relative to a 480 px head
  flip?: boolean; // mirror horizontally
}

export interface TailRing {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  progress: number; // 0..1 how far round the ellipse the tail has swept (1 = closed ring)
  startAngle?: number; // radians where the sweep starts (0 = right, π/2 = front/bottom)
  goldEdge: number; // 0..1 the gold edge once it closes
  layer: 'back' | 'front'; // the half behind the bots or the half in front of them
}

export interface TailProps {
  crescent?: TailCrescentPose; // the scythe
  ring?: TailRing; // the ring around the bots (shot 6)
  morph?: number; // 0..1 crescent → ring blend, if the implementation uses one
  seams?: number; // how many gold seams show on the crescent (fractional = the next one drawing)
  ember?: number;
  warm?: number;
  silhouette?: boolean;
  keyline?: number; // 0..1 a 2 px cream outline round the crescent and ring at this opacity (separates it from the head)
}

export interface MarkProps {
  blink: number; // 0..1 (1 = eyes shut)
  opacity?: number;
  scale?: number; // multiplies the 420 px mark
  seam?: number; // 0..1 one gold kintsugi seam drawing in across the crescent
}
