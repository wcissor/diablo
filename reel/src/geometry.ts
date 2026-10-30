// Canvas, safe zones and where everyone stands. Coordinates are on the
// 1080 × 1920 canvas, origin top left, at each shot's reference framing.

import { HEAD_BOX, EYES_MID, MARK_BOX } from './logo';

export const SAFE = { x0: 120, x1: 936, y0: 288, y1: 1248 };
export const WORDS = { cx: 540, maxW: 760, top: 300, bottom: 500, clear: 40 };
export const STAGE_Y = 1180; // the bots stand on it: a cream line at 25 % opacity
export const RIGHT_RAIL = { x0: 936, y0: 800 };

// Every push-in and pull-back scales about this point, chosen so the bots, the
// horns and the words all stay inside the safe area at the tightest framing.
export const CAMERA_ORIGIN = { x: 540, y: 760 };

export type BotKind = 'bubble' | 'cube' | 'orb';

// Feet on the stage line. The orb hovers 20 px above it.
export const BOTS: Record<BotKind, { cx: number; feetY: number }> = {
  bubble: { cx: 270, feetY: STAGE_Y },
  cube: { cx: 540, feetY: STAGE_Y },
  orb: { cx: 800, feetY: STAGE_Y - 20 },
};

// Diablo in shots 2–6: the head is 480 px wide, his eyes centred on x 540 just
// above the bots' heads, horn tips no higher than y 565 at the reference
// framing (y ≥ 540 after the tightest push-in, 40 px clear of the words).
export const DIABLO_HEAD_W = 480;
export const DIABLO_SCALE = DIABLO_HEAD_W / HEAD_BOX.w; // trace units → px
export const DIABLO_HORN_TOP = 565;
// Translate that maps trace coordinates to the canvas for the settled pose.
export const DIABLO_ORIGIN = {
  x: 540 - (EYES_MID.x - HEAD_BOX.x) * DIABLO_SCALE - HEAD_BOX.x * DIABLO_SCALE,
  y: DIABLO_HORN_TOP - HEAD_BOX.y * DIABLO_SCALE,
};
export const DIABLO_EYES_Y = DIABLO_HORN_TOP + (EYES_MID.y - HEAD_BOX.y) * DIABLO_SCALE;

// Shot 7: the whole mark, 420 px tall, centred on (540, 700), no hands.
export const MARK_H = 420;
export const MARK_SCALE = MARK_H / MARK_BOX.h;
export const MARK_ORIGIN = {
  x: 540 - (MARK_BOX.x + MARK_BOX.w / 2) * MARK_SCALE,
  y: 700 - (MARK_BOX.y + MARK_BOX.h / 2) * MARK_SCALE,
};
