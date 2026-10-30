// Resolves a BotPose plus the frame into the numbers the drawings use.

import type { BotKind } from '../../geometry';
import { BLINKS } from '../../config';
import { clamp, smooth, type Pt } from '../../lib/anim';
import type { BotPose } from '../types';

export interface Resolved {
  look: Pt;
  fear: number;
  bright: number;
  blink: number; // 0 open .. 1 shut
  bob: number; // px, + = down (idle)
  squash: number;
  stretchX: number;
  lean: number;
  lift: number;
  tailAngle: number; // bubble: degrees
  sway: number; // idle sway phase value −1..1 (antenna, ring)
}

const PHASE: Record<BotKind, number> = { bubble: 0, cube: 0.37, orb: 0.71 };
export const BOB_PERIOD = 45; // 1.5 s
export const BLINK_FRAMES = 6;

// A blink: the lids are already half down on its first frame, shut for two
// frames, then open over three. Linear between frames (sub-frame safe).
const BLINK_KEYS = [0.6, 1, 1, 0.62, 0.28, 0.07, 0];
export const blinkAt = (kind: BotKind, frame: number) => {
  for (const s of BLINKS[kind]) {
    const t = frame - s;
    if (t >= -0.5 && t < 0) return BLINK_KEYS[0] * (t + 0.5) * 2;
    if (t >= 0 && t < BLINK_FRAMES) {
      const i = Math.floor(t);
      return BLINK_KEYS[i] + (BLINK_KEYS[i + 1] - BLINK_KEYS[i]) * (t - i);
    }
  }
  return 0;
};

export const resolvePose = (kind: BotKind, frame: number, p: BotPose): Resolved => {
  const idle = p.freeze ? false : p.idle !== false;
  const squash = p.squash ?? 1;
  const w = clamp(p.tailWiggle ?? 0);
  // One wag: two swings that die away, starting and ending at rest.
  const tailAngle = w > 0 && w < 1 ? 16 * Math.sin(w * Math.PI * 4) * Math.pow(1 - w, 1.2) * smooth(Math.min(1, w * 6)) : 0;
  return {
    look: { x: clamp(p.look?.x ?? 0, -1, 1), y: clamp(p.look?.y ?? 0, -1, 1) },
    fear: clamp(p.fear ?? 0),
    bright: clamp(p.bright ?? 0),
    blink: idle ? blinkAt(kind, frame) : 0,
    bob: idle ? 1.5 * Math.sin(2 * Math.PI * (frame / BOB_PERIOD + PHASE[kind])) : 0,
    squash,
    // Keep the volume: a little wider when squashed, a little narrower when stretched.
    stretchX: 1 + (1 - squash) * 0.3,
    lean: p.lean ?? 0,
    lift: p.lift ?? 0,
    tailAngle,
    sway: p.freeze ? 0 : Math.sin(2 * Math.PI * (frame / 75 + PHASE[kind] * 1.7)),
  };
};
