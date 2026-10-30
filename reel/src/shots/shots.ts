// The six stage shots as pure functions frame → SceneState. Frames are
// absolute (the reel's own), read from EVENTS in config.ts.

import { EVENTS, SHOTS } from '../config';
import type { BotKind } from '../geometry';
import { BOTS, DIABLO_EYES_Y } from '../geometry';
import type { BotPose, BotProps, CrackState, HandProps, Pt } from '../cast/types';
import { botBounds, botPoint } from '../cast/Bots';
import {
  clamp,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  invLerp,
  lerp,
  ramp,
  settle,
  smooth,
} from '../lib/anim';
import type { SceneState, Spark } from './Scene';
import {
  HOVER_LEFT,
  HOVER_RIGHT,
  STRIKE_LEFT,
  STRIKE_RIGHT,
  TAIL_REST,
  TAIL_TAP,
  emberLevel,
  hairlines,
  lastSealOf,
  pointOnCrack,
  sinceHit,
  strikeCracks,
  strikeState,
  sealSchedule,
  traceU,
  TAIL_COIL,
  CUBE_TAP,
} from './story';
import { clawTips, handBounds, leadTip } from '../cast/Hands';
import { crescentMatrix, TAIL_SEAMS } from '../cast/Tail';
import { ap, samplePath } from '../cast/diablo/geom';

const memo = <T,>(fn: () => T) => {
  let v: T | undefined;
  return () => (v === undefined ? (v = fn()) : v);
};

type BotsState = SceneState['bots'];
const KINDS: BotKind[] = ['bubble', 'cube', 'orb'];
const shot = (id: number) => SHOTS[id - 1];

// Each shot has its own camera, so every hard cut reads as deliberate, within
// what the safe area allows: scale (a slow push-in, 5 % over the shot; shot 6
// pulls back), height (dy) and how big Diablo looms (head scale).
const CAM: Record<number, { from: number; to: number; dy: number; head: number }> = {
  1: { from: 1.0, to: 1.05, dy: 0, head: 1 }, // medium-wide, eye level
  2: { from: 0.9, to: 0.945, dy: 70, head: 1.12 }, // low angle, wider: horizon low, Diablo looms
  3: { from: 1.0, to: 1.05, dy: 34, head: 1.06 }, // the same angle, pushed in
  4: { from: 1.06, to: 1.08, dy: 30, head: 1 }, // closer: bots big and low, his eyes and hand above
  5: { from: 0.92, to: 0.966, dy: -10, head: 1 }, // medium, from a little higher
  6: { from: 0.9, to: 0.857, dy: -8, head: 1 }, // wide, pulling back
};
const push = (f: number, id: number) => {
  const s = shot(id);
  const c = CAM[id];
  return lerp(c.from, c.to, invLerp(s.from, s.to + 1, f));
};
const cam = (f: number, id: number, dx = 0, dy = 0) => ({ scale: push(f, id), dx, dy: CAM[id].dy + dy });

const mapBots = (fn: (k: BotKind) => Omit<BotProps, 'kind' | 'frame'>): BotsState => ({
  bubble: fn('bubble'),
  cube: fn('cube'),
  orb: fn('orb'),
});

// Direction from a bot's face toward a point, as a −1..1 gaze.
const gazeAt = (k: BotKind, p: Pt): Pt => {
  const fx = BOTS[k].cx;
  const fy = 1060;
  const dx = p.x - fx;
  const dy = p.y - fy;
  const m = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / m, y: dy / m };
};

const DIABLO_EYES: Pt = { x: 540, y: DIABLO_EYES_Y };
const lean = { bubble: -1, cube: 0, orb: 1 } as const; // outward: away from Diablo rising in the middle
const inward = { bubble: 1, cube: 0, orb: -1 } as const; // away from the claw on their side (and safe at the tightest push)

/* ─────────────────────────── Shot 1 — Looks fine ─────────────────────────── */

export const shot1 = (f: number): SceneState => {
  const flick = f >= EVENTS.flicker.from && f <= EVENTS.flicker.to;
  const up = easeOutBack(invLerp(EVENTS.flicker.from, EVENTS.flicker.from + 7, f), 1.2);
  const eyesOpen = easeOutCubic(invLerp(EVENTS.eyesOpen.from, EVENTS.eyesOpen.to, f));
  const scared = ramp(f, EVENTS.eyesOpen.from + 2, EVENTS.eyesOpen.to + 4);
  const eyesAt = DIABLO_EYES;
  // the faint cream rim of his horns comes up out of the dark around the slits
  const ghost = ramp(f, EVENTS.eyesOpen.from + 2, EVENTS.eyesOpen.to + 6);
  return {
    frame: f,
    camera: cam(f, 1),
    light: { level: 1 },
    dim: flick ? 0.4 : 0,
    head: f >= EVENTS.eyesOpen.from ? { eyesOnly: true, ghost, eyes: { open: eyesOpen } } : undefined,
    bots: mapBots((k) => {
      const g = gazeAt(k, eyesAt);
      return {
        idle: true,
        look: { x: g.x * up, y: lerp(0, g.y, up) },
        fear: scared * 0.55,
        squash: 1 - 0.02 * scared,
        lean: lean[k] * 2 * scared,
        tailWiggle: k === 'bubble' ? invLerp(EVENTS.tailWiggle, EVENTS.tailWiggle + 18, f) : undefined,
      };
    }),
  };
};

/* ─────────────────────────── Shot 2 — Pull up ─────────────────────────── */

const LOW_RY = 230; // the light pool seen from low down
const RISE_FROM = 560;

// He rises slowly at first, accelerates, overshoots 8 % and settles by 3.0 s.
const rise = (f: number) => {
  const { from, settle: done } = EVENTS.rise;
  const peak = from + 14;
  if (f < peak) return 1.08 * easeInOutCubic(invLerp(from, peak, f));
  return 1 + 0.08 * Math.cos((Math.PI / 2) * clamp((f - peak) / (done + 2 - peak)));
};

// The scythe sweep: from the right, over the top, to rest at his left.
const tailSweep = (f: number) => {
  const t = invLerp(EVENTS.tailSweep.from, EVENTS.tailSweep.to, f);
  const e = easeInOutCubic(t);
  const pivot = { x: 540, y: 930 };
  const R = 300;
  const a0 = (-55 * Math.PI) / 180;
  const a1 = (-205 * Math.PI) / 180;
  const a = lerp(a0, a1, e);
  const over = (settle(f, EVENTS.tailSweep.to - 3, 2.2, 0.45) - 1) * (t >= 1 ? 1 : 0);
  const onArc = { x: pivot.x + R * Math.cos(a), y: pivot.y + R * Math.sin(a) };
  const k = smooth(invLerp(0.75, 1, t)); // ease onto the rest pose
  return {
    x: lerp(onArc.x, TAIL_REST.x, k),
    y: lerp(onArc.y, TAIL_REST.y, k),
    rot: lerp((a * 180) / Math.PI + 120, TAIL_REST.rot ?? 0, k) - over * 14,
    scale: TAIL_REST.scale,
  };
};

const cower = (f: number) => clamp(settle(f, EVENTS.rise.from + 3, 2.4, 0.5), 0, 1.2);

// The hands rise from behind the stage line, decelerating into the hover with
// a small overshoot, then hover trembling.
const handsUp = (f: number, side: 'left' | 'right'): HandProps => {
  const hover = side === 'left' ? HOVER_LEFT : HOVER_RIGHT;
  const { from, to } = EVENTS.clawsUp;
  const k = Math.pow(clamp(invLerp(from - 2, to, f)), 0.85);
  const r = f < to ? 1.04 * (1 - Math.pow(1 - k, 3)) : 1 + 0.04 * Math.exp(-(f - to) / 4) * Math.cos((f - to) * 0.7);
  return {
    ...hover,
    y: lerp(hover.y + 760, hover.y, r),
    spread: lerp(0.3, hover.spread ?? 1, clamp(r)),
    tremble: f > to ? 2.2 : 0,
  };
};

const BOTS_TOP = Math.min(...(['bubble', 'cube', 'orb'] as BotKind[]).map((k) => botBounds(k).y0));
const splitHands = (hs: HandProps[]) => ({
  hands: hs.filter((h) => handBounds(h).y1 < BOTS_TOP - 4),
  handsBack: hs.filter((h) => handBounds(h).y1 >= BOTS_TOP - 4),
});
// Hands leaving: once a hand that is sinking clears the bots' tops on its way
// down, it goes behind them (and behind the stage line).
const splitSink = (hs: HandProps[], sinking: (h: HandProps) => boolean = (h) => h.side === 'right') => ({
  hands: hs.filter((h) => !sinking(h) || handBounds(h).y1 < BOTS_TOP - 4),
  handsBack: hs.filter((h) => sinking(h) && handBounds(h).y1 >= BOTS_TOP - 4),
});

export const shot2 = (f: number): SceneState => {
  const c = cower(f);
  const r = rise(f);
  const eyesAt = { x: 540, y: DIABLO_EYES.y + (1 - r) * RISE_FROM - 36 };
  return {
    frame: f,
    camera: cam(f, 2),
    light: { level: 1, ry: LOW_RY },
    head: { dy: (1 - r) * RISE_FROM - 36, scale: CAM[2].head, eyes: { open: 1, look: { x: 0, y: 3 } }, clipBelowY: 1180 },
    tailBack: f >= EVENTS.tailSweep.from ? { crescent: tailSweep(f) } : undefined,
    // the hands rise from behind the stage line, behind the bots, and come to
    // the front only once they are clear above them (so the switch never shows)
    ...(f >= EVENTS.clawsUp.from - 4 ? splitHands([handsUp(f, 'left'), handsUp(f, 'right')]) : {}),
    bots: mapBots((k) => {
      const g = gazeAt(k, eyesAt);
      return {
        idle: true,
        look: { x: g.x, y: g.y },
        fear: clamp(c),
        squash: 1 - 0.06 * c,
        lean: lerp(lean[k] * 5 * c, inward[k] * 4, ramp(f, EVENTS.clawsUp.from, EVENTS.clawsUp.to)),
      };
    }),
  };
};

/* ─────────────────────────── Shot 3 — Strike ─────────────────────────── */

const shake = (f: number) => {
  const { from, to, px } = EVENTS.shake;
  if (f < from || f >= to) return { dx: 0, dy: 0 };
  const a = px * Math.pow(1 - (f - from) / (to - from), 2);
  return { dx: a * Math.sin(f * 2.9 + 0.7), dy: a * Math.cos(f * 3.7) };
};

// The bots in shot 3: cowering, then frozen mid-flinch by the hit.
const strikeBotPose = (f: number, k: BotKind): BotPose => {
  const struck = f >= EVENTS.strike;
  const s = sinceHit(f);
  return {
    idle: false,
    freeze: struck,
    look: struck ? { x: inward[k] * 0.3, y: -0.4 } : { x: 0, y: -1 },
    fear: 1,
    squash: struck ? 0.9 + 0.02 * clamp(s / 20) : 0.94,
    lean: inward[k] * (struck ? 6 : 4),
  };
};

// Where an impact point on a bot is drawn under its pose, as an offset.
const shellShift = (k: BotKind, p: Pt, pose: BotPose, f: number): Pt => {
  const q = botPoint(k, p, pose, f);
  return { x: q.x - p.x, y: q.y - p.y };
};
const centroid = (ps: Pt[]): Pt => ps.reduce((a, p) => ({ x: a.x + p.x / ps.length, y: a.y + p.y / ps.length }), { x: 0, y: 0 });

// Wind-up, slam, hold, lift. Pressed in, the claws ride the shell as it squashes.
const strikeHand = (f: number, side: 'left' | 'right', ember: number): HandProps => {
  const hover = side === 'left' ? HOVER_LEFT : HOVER_RIGHT;
  const hit = side === 'left' ? STRIKE_LEFT : STRIKE_RIGHT;
  const { from: w0, to: w1 } = EVENTS.windUp;
  const out = side === 'left' ? -1 : 1;
  const s = sinceHit(f);
  if (f < w1) {
    // draw back 40 px (up and out) with an ease-in: anticipation
    const k = easeOutCubic(invLerp(w0, w1, f));
    return { ...hover, x: hover.x + out * 4 * k, y: hover.y - 40 * k, curl: lerp(hover.curl ?? 0.1, 0.6, k), spread: lerp(hover.spread ?? 0.8, 0.7, k), tremble: 0, ember };
  }
  const kind: BotKind = side === 'left' ? 'bubble' : 'orb';
  const at = shellShift(kind, centroid(clawTips(hit)), strikeBotPose(Math.max(f, EVENTS.strike), kind), f);
  if (f < EVENTS.strike) {
    // the slam: one frame, very fast (motion-blurred)
    const k = easeInCubic(invLerp(w1, EVENTS.strike, f));
    const from = { x: hover.x + out * 4, y: hover.y - 40 };
    return {
      ...hit,
      x: lerp(from.x, hit.x + at.x, k),
      y: lerp(from.y, hit.y + at.y, k),
      rot: lerp(hover.rot ?? 0, hit.rot ?? 0, k),
      curl: lerp(0.6, hit.curl ?? 0.85, k),
      spread: lerp(0.7, hit.spread ?? 0.55, k),
      ember,
    };
  }
  // pressed in, a tiny rebound, then lift clear of the cracks; the right hand
  // then sinks back behind the orb into the dark before the cut (shot 4 has one hand)
  const rebound = Math.sin(clamp(s / 6) * Math.PI) * -6;
  const lift = easeInOutCubic(invLerp(196, 214, f)) * 70;
  const away = easeInOutCubic(invLerp(196, 214, f)) * -12 * out;
  const sink = side === 'right' ? easeInCubic(invLerp(204, 221, f)) * 620 : 0;
  return { ...hit, x: hit.x + at.x + away, y: hit.y + at.y + rebound - lift + sink, ember, tremble: f > 214 ? 1.5 : 0 };
};

// The tail: coiled low in front of the stage at the right, drawn back in the
// wind-up, its point snaps up into the cube's corner on the hit, holds through
// the slow motion, then pulls back down out of frame.
const strikeTail = (f: number) => {
  const { from: w0, to: w1 } = EVENTS.windUp;
  const s = sinceHit(f);
  const lerpPose = (a: typeof TAIL_TAP, b: typeof TAIL_TAP, k: number) => ({
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    rot: lerp(a.rot ?? 0, b.rot ?? 0, k),
    scale: TAIL_TAP.scale,
    flip: TAIL_TAP.flip,
  });
  const drawn = { ...TAIL_COIL, y: TAIL_COIL.y + 40, rot: (TAIL_COIL.rot ?? 0) + 4 };
  if (f < w1) return lerpPose(TAIL_COIL, drawn, easeOutCubic(invLerp(w0, w1, f)));
  if (f < EVENTS.strike) return lerpPose(drawn, TAIL_TAP, easeInCubic(invLerp(w1, EVENTS.strike, f)));
  const gone = { ...TAIL_COIL, y: TAIL_COIL.y + 560 };
  return lerpPose(TAIL_TAP, gone, easeInCubic(clamp((s - 5) / 8)));
};

// The weak spots in the order his eyes visit them.
const lookTargets = () => {
  const sets = strikeCracks();
  return KINDS.flatMap((k) => sets[k].weakSpots.map((w) => ({ x: w.x, y: w.y })));
};

const eyeLookAt = (p: Pt, amount = 7): Pt => {
  const dx = p.x - DIABLO_EYES.x;
  const dy = p.y - DIABLO_EYES.y;
  const m = Math.max(1, Math.hypot(dx, dy));
  return { x: (dx / m) * amount, y: (dy / m) * amount };
};

export const shot3 = (f: number): SceneState => {
  const flash = f >= EVENTS.flash.from && f < EVENTS.flash.to + 1;
  const sh = shake(f);
  const ember = emberLevel(f);
  const s = sinceHit(f);
  const struck = f >= EVENTS.strike;
  const windK = easeOutCubic(invLerp(EVENTS.windUp.from, EVENTS.windUp.to, f));
  const lunge = struck ? Math.exp(-Math.max(0, s) / 5) : 0;
  // Eye flicks to each weak spot in turn, 4 frames per look.
  let look: Pt = { x: 0, y: 4 };
  if (f >= EVENTS.find.from) {
    const targets = lookTargets();
    const i = Math.floor((f - EVENTS.find.from) / EVENTS.find.framesPerLook);
    if (i < targets.length) look = eyeLookAt(targets[i]);
  }
  return {
    frame: f,
    camera: cam(f, 3, sh.dx, sh.dy),
    light: { level: 1, ry: LOW_RY, ember },
    head: {
      dy: -10 * windK * (struck ? 0 : 1) + 10 * lunge,
      scale: CAM[3].head * (1 + 0.02 * lunge),
      eyes: { open: 1, glare: struck ? 0.75 * (1 - ramp(f, EVENTS.find.from + 20, EVENTS.find.from + 34)) + 0.3 : 0.7 * windK, look },
      ember,
    },
    // the tail strikes from in front of the stage, against the dark floor
    tailFront: { crescent: strikeTail(f), ember: ember * 0.4, keyline: 0.5 },
    ...splitSink([strikeHand(f, 'left', ember), strikeHand(f, 'right', ember)]),
    bots: mapBots((k) => ({ ...strikeBotPose(f, k), cracks: struck ? [strikeState(f, k)] : undefined })),
    shards: struck
      ? [
          { kind: 'bubble', impacts: clawTips(STRIKE_LEFT), t: s, seed: 'shard-bubble' },
          { kind: 'cube', impacts: [CUBE_TAP], t: s, seed: 'shard-cube' },
          { kind: 'orb', impacts: clawTips(STRIKE_RIGHT), t: s, seed: 'shard-orb' },
        ]
      : undefined,
    flash,
  };
};

/* ─────────────────────────── Shot 4 — Fix ─────────────────────────── */

// The bots in shot 4: still frozen mid-flinch until their last seam closes,
// then they straighten (overshooting into a stretch) and stretch again at 9.8 s.
const fixBotPose = (f: number, k: BotKind): BotPose => {
  const done = lastSealOf(k);
  const straight = settle(f, done, 2.4, 0.4);
  const stretch = settle(f, EVENTS.allSealed, 2.2, 0.45);
  const fixed = f >= done;
  return {
    idle: fixed,
    freeze: !fixed,
    look: fixed ? { x: 0, y: -0.5 } : { x: inward[k] * 0.3, y: -0.4 },
    fear: fixed ? 0 : 0.8,
    bright: clamp((f - done) / 8),
    squash: (fixed ? lerp(0.92, 1, straight) : 0.92) + 0.04 * Math.sin(Math.PI * clamp(stretch)) * (f >= EVENTS.allSealed ? 1 : 0),
    lean: fixed ? inward[k] * 6 * (1 - clamp(straight)) : inward[k] * 6,
  };
};

// One claw traces the bubble's longest crack, side-on, the other claws curled back.
const TRACE_BASE = { side: 'left' as const, spread: 0.2, curl: 0.4, point: 1, pointClaw: 1, x: 0, y: 0 };
const traceTarget = (f: number) =>
  botPoint('bubble', pointOnCrack(strikeCracks().bubble.cracks[strikeCracks().bubble.longest].d, traceU(f)), fixBotPose(f, 'bubble'), f);
// The hand rolls as it traces (degrees at the start, middle and end of the
// stroke), so the whole hand stays inside the safe area — it is touching a
// bot — and clear of his eyes all the way along. Found by a search over the
// traced crack with the layout checker's rules; re-check if the cracks change.
const TRACE_ROLL: [number, number, number] = [-6, 2, 14];
const traceRot = (u: number) =>
  u < 0.5 ? lerp(TRACE_ROLL[0], TRACE_ROLL[1], u / 0.5) : lerp(TRACE_ROLL[1], TRACE_ROLL[2], (u - 0.5) / 0.5);
const traceHand = (f: number): HandProps | undefined => {
  const rot = traceRot(traceU(f));
  const base = { ...TRACE_BASE, rot };
  const tip0 = leadTip(base);
  const p = traceTarget(f); // on the drawn shell
  // done: lift straight up off the shell first, then away to the left, below the words
  const lift = easeOutCubic(invLerp(EVENTS.trace.to + 1, EVENTS.trace.to + 7, f));
  const away = easeInOutCubic(invLerp(EVENTS.trace.to + 5, EVENTS.trace.to + 24, f));
  return {
    ...base,
    x: p.x - tip0.x - away * 560,
    y: p.y - tip0.y - lift * 26,
    rot: rot + away * 8,
    warm: clamp(1 - emberLevel(f)) * 0.6,
    ember: emberLevel(f),
  };
};

export const shot4 = (f: number): SceneState => {
  const ember = emberLevel(f);
  const warm = ramp(f, EVENTS.allSealed, EVENTS.allSealed + 16);
  const set = strikeCracks().bubble;
  const tracePoint = pointOnCrack(set.cracks[set.longest].d, traceU(f));
  const look = f < EVENTS.trace.to + 6 ? eyeLookAt(tracePoint, 6) : { x: 0, y: 5 };
  return {
    frame: f,
    camera: cam(f, 4),
    light: { level: 1, ember, warm },
    head: { eyes: { open: 1, look, narrow: warm * 0.3 }, ember, warm },
    hands: f < EVENTS.trace.to + 24 ? [traceHand(f)!] : undefined,
    bots: mapBots((k) => ({ ...fixBotPose(f, k), cracks: [strikeState(f, k)] })),
  };
};

/* ─────────────────────────── Shot 5 — Learns ─────────────────────────── */

const sealedState = (f: number, k: BotKind): CrackState => ({ ...strikeState(SHOTS[3].to, k), warm: 0, weak: 0, pulseFrame: f, pop: undefined });

// The flicks: the hand rises from behind the orb only for each flick, points
// one claw, flicks it across the new crack with the bot's face clear, and
// sinks away again — so the learning (the sparks) plays without his claws.
const FLICK_HOVER = { side: 'right' as const, x: 810, y: 690, rot: -10, spread: 0.5, curl: 0.7 };
const FLICK_DOWN = 660; // how far below the hover it hides (behind the orb and the stage)
const flickHand = (f: number): HandProps => {
  const hover = FLICK_HOVER;
  const h = hairlines();
  const { crack1: c1, crack2: c2 } = EVENTS;
  const k1 = invLerp(c1.flick - 5, c1.flick + c1.sealFrames + 6, f);
  const k2 = invLerp(c2.at - 3, c2.at + c2.sealFrames + 4, f);
  const visit = (k: number, target: Pt, rot: number) => {
    const t = Math.sin(clamp(k) * Math.PI); // out and back
    const base = { ...hover, rot, curl: 0.4, spread: 0.2, point: 1, pointClaw: 1, x: 0, y: 0 };
    const tip = leadTip(base);
    const at = { x: target.x - tip.x, y: target.y - tip.y };
    return { x: lerp(hover.x, at.x, t), y: lerp(hover.y, at.y, t), rot: lerp(hover.rot, rot, t), point: t, pointClaw: 1 };
  };
  const tremble = 1.2;
  const onShell = (k: BotKind, p: Pt) => botPoint(k, p, learnBotPose(f, k), f);
  if (k1 > 0 && k1 < 1) return { ...hover, ...visit(k1, onShell('orb', h.orb.cracks[0].points[0]), -24), tremble, warm: 0.5 };
  if (k2 > 0 && k2 < 1) return { ...hover, ...visit(k2, onShell('cube', h.cube.cracks[0].points[0]), 24), tremble, warm: 0.5 };
  // up from behind the orb before each flick, down again after
  const up1 = easeOutCubic(invLerp(c1.at - 6, c1.flick - 5, f)) * (1 - easeInCubic(invLerp(c1.flick + c1.sealFrames + 6, c1.flick + 22, f)));
  const up2 = easeOutCubic(invLerp(c2.at - 12, c2.at - 3, f)) * (1 - easeInCubic(invLerp(c2.at + c2.sealFrames + 4, EVENTS.eyesNarrow + 2, f)));
  const up = f < c2.at - 12 ? up1 : up2;
  return { ...hover, y: hover.y + (1 - up) * FLICK_DOWN, tremble, warm: 0.5 };
};

const hairState = (f: number, which: 'orb' | 'cube'): CrackState | undefined => {
  const h = hairlines()[which];
  const ev = which === 'orb' ? EVENTS.crack1 : EVENTS.crack2;
  if (f < ev.at) return undefined;
  const sealFrom = which === 'orb' ? EVENTS.crack1.flick : EVENTS.crack2.at;
  const seal = easeOutCubic(invLerp(sealFrom, sealFrom + ev.sealFrames, f));
  return {
    set: h,
    grow: easeOutCubic(invLerp(ev.at, ev.at + (which === 'orb' ? 4 : 2), f)),
    weak: 0,
    flash: (1 - seal) * (which === 'orb' ? 1 : 0.8),
    pulseFrame: f,
    seal: [seal],
    warm: seal >= 1 ? 1 - invLerp(sealFrom + ev.sealFrames, sealFrom + ev.sealFrames + 30, f) : 0,
  };
};

// The bots in shot 5: calm; a small start at each new crack, relief when it seals.
const learnBotPose = (f: number, k: BotKind): BotPose => {
  const startAt = k === 'orb' ? EVENTS.crack1.at : k === 'cube' ? EVENTS.crack2.at + 6 : -999;
  const relief = k === 'orb' ? EVENTS.crack1.flick + EVENTS.crack1.sealFrames : k === 'cube' ? EVENTS.crack2.at + 10 : -999;
  const start = Math.exp(-Math.max(0, f - startAt) / 4) * (f >= startAt ? 1 : 0);
  const rel = Math.sin(clamp((f - relief) / 14) * Math.PI) * (f >= relief ? 1 : 0);
  return {
    idle: true,
    bright: 0.6,
    look: k === 'cube' && f >= EVENTS.crack2.at + 6 && f < EVENTS.crack2.at + 22 ? { x: 0.3, y: 0.7 } : { x: 0, y: -0.3 },
    fear: start * 0.8,
    squash: 1 - 0.04 * start + 0.03 * rel,
    lean: inward[k] * 3 * start,
  };
};

// His crescent curls in at the side, inside the core area.
const learnTail = (f: number) => {
  const curl = settle(f, SHOTS[4].from, 1.6, 0.5);
  return { x: lerp(150, 292, curl), y: 772, rot: lerp(-40, 8, curl), scale: 0.86 };
};

// "He keeps what he learned": one gold spark per seam flies from a seam on a
// bot to his crescent, and that seam draws in on the crescent as it lands.
const SEAM_MIDS = memo(() =>
  TAIL_SEAMS.map((d) => {
    const pts = samplePath(d, 6)[0];
    return pts[Math.floor(pts.length / 2)];
  }),
);
const learnSources = memo(() => {
  const order = sealSchedule();
  return Array.from({ length: EVENTS.tailSeams.count }, (_, i) => order[i % order.length]);
});
const tailSeamsAt = (f: number) => clamp((f - EVENTS.tailSeams.from - EVENTS.tailSeams.travel) / EVENTS.tailSeams.stagger, 0, EVENTS.tailSeams.count);

const learnSparks = (f: number): Spark[] => {
  const { from, stagger, travel, count } = EVENTS.tailSeams;
  const out: Spark[] = [];
  const m = crescentMatrix(learnTail(f));
  for (let i = 0; i < count; i++) {
    const depart = from + stagger * i;
    if (f < depart || f > depart + travel) continue;
    const src = learnSources()[i];
    const crack = strikeCracks()[src.kind].cracks[src.index];
    const a = botPoint(src.kind, pointOnCrack(crack.d, 0.5), learnBotPose(f, src.kind), f);
    const b = ap(m, SEAM_MIDS()[i % SEAM_MIDS().length]);
    const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 170 };
    const at = (u: number) => {
      const v = clamp(u);
      return { x: (1 - v) * (1 - v) * a.x + 2 * (1 - v) * v * c.x + v * v * b.x, y: (1 - v) * (1 - v) * a.y + 2 * (1 - v) * v * c.y + v * v * b.y };
    };
    const u = easeInOutCubic((f - depart) / travel);
    out.push({ at: at(u), trail: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => at(u - 0.045 * k)) });
  }
  return out;
};

export const shot5 = (f: number): SceneState => {
  const h = hairlines();
  const o = h.orb.cracks[0].points[0];
  const cb = h.cube.cracks[0].points[0];
  let look: Pt = { x: 0, y: 5 };
  if (f >= EVENTS.crack1.at && f < EVENTS.crack1.flick + 12) look = eyeLookAt(o, 7);
  else if (f >= EVENTS.crack2.at && f < EVENTS.crack2.at + 10) look = eyeLookAt(cb, 7);
  else if (f < EVENTS.crack1.at) look = eyeLookAt({ x: 200, y: 760 }, 5); // watching his crescent fill with gold
  const narrow = ramp(f, EVENTS.eyesNarrow, EVENTS.eyesNarrow + 8) * 0.75;
  return {
    frame: f,
    camera: cam(f, 5),
    light: { level: 1, warm: 0.7 },
    head: { eyes: { open: 1, look, narrow }, warm: 0.6 },
    tailFront: { crescent: learnTail(f), seams: tailSeamsAt(f), warm: 0.5, keyline: 0.35 },
    ...splitSink([flickHand(f)], () => true),
    sparks: learnSparks(f),
    bots: mapBots((k) => {
      const crack1 = k === 'orb' ? hairState(f, 'orb') : undefined;
      const crack2 = k === 'cube' ? hairState(f, 'cube') : undefined;
      return { ...learnBotPose(f, k), cracks: [sealedState(f, k), ...(crack1 ? [crack1] : []), ...(crack2 ? [crack2] : [])] };
    }),
  };
};

/* ─────────────────────────── Shot 6 — Evolves ─────────────────────────── */

export const RING = { cx: 540, cy: 1190, rx: 364, ry: 90 };

export const shot6 = (f: number): SceneState => {
  const up = settle(f, EVENTS.riseProud, 2.0, 0.5);
  const ringT = easeInOutCubic(invLerp(EVENTS.ring.from, EVENTS.ring.to, f));
  const gold = ramp(f, EVENTS.ring.to - 4, EVENTS.ring.to + 8);
  const hop = EVENTS.hop;
  // anticipation squash, the hop, the landing squash, settle
  const crouch = Math.sin(clamp(invLerp(hop - 6, hop, f)) * Math.PI * 0.5) * (f < hop ? 1 : 0);
  const air = Math.sin(clamp(invLerp(hop, hop + 12, f)) * Math.PI);
  const land = f >= hop + 12 ? Math.exp(-(f - hop - 12) / 4) * Math.cos((f - hop - 12) * 0.9) : 0;
  const narrow = ramp(f, EVENTS.ring.to - 2, EVENTS.ring.to + 8) * 0.8;
  const glint = ramp(f, EVENTS.glint.from, EVENTS.glint.to);
  const ring = (layer: 'back' | 'front') => ({ ...RING, progress: ringT, goldEdge: gold, layer, startAngle: Math.PI * 0.95 });
  // the crescent dives from his side to where the ring starts
  const dive = easeInCubic(invLerp(EVENTS.ring.from - 6, EVENTS.ring.from + 2, f));
  return {
    frame: f,
    camera: cam(f, 6),
    light: { level: 1, warm: 1 },
    head: { dy: (1 - up) * 60, eyes: { open: 1, narrow }, warm: 0.8 },
    tailBack:
      f < EVENTS.ring.from + 6
        ? {
            crescent: {
              x: lerp(TAIL_REST.x, RING.cx - RING.rx + 20, dive),
              y: lerp(TAIL_REST.y + (1 - up) * 60, RING.cy, dive),
              rot: lerp(TAIL_REST.rot ?? 0, -70, dive),
              scale: (TAIL_REST.scale ?? 1) * (1 - 0.6 * dive),
            },
            seams: EVENTS.tailSeams.count,
            warm: 0.6,
          }
        : { ring: ring('back'), seams: EVENTS.tailSeams.count, warm: 0.6 },
    tailFront: f >= EVENTS.ring.from ? { ring: ring('front'), seams: EVENTS.tailSeams.count, warm: 0.6 } : undefined,
    bots: mapBots((k) => ({
      idle: true,
      bright: 1,
      look: { x: 0, y: -0.2 },
      squash: 1.04 - 0.06 * crouch + 0.05 * air - 0.05 * land,
      lift: air * 26,
      cracks: [{ ...sealedState(f, k), glint }, ...(k === 'orb' ? [{ ...hairDone(f, 'orb'), glint }] : []), ...(k === 'cube' ? [{ ...hairDone(f, 'cube'), glint }] : [])],
    })),
  };
};

const hairDone = (f: number, which: 'orb' | 'cube'): CrackState => ({
  set: hairlines()[which],
  grow: 1,
  weak: 0,
  pulseFrame: f,
  seal: [1],
  warm: 0,
});

export const STATE_FNS = { 1: shot1, 2: shot2, 3: shot3, 4: shot4, 5: shot5, 6: shot6 } as const;

// Shots run motion blur only on the fast moves.
export const blurAt = (f: number) =>
  (f >= EVENTS.tailSweep.from && f <= EVENTS.tailSweep.to + 2) ||
  (f >= EVENTS.windUp.from && f < EVENTS.flash.from) ||
  (f > EVENTS.flash.to && f <= EVENTS.strike + 8) ||
  (f >= EVENTS.ring.from - 6 && f <= EVENTS.ring.to + 2) ||
  (f >= EVENTS.clawsUp.from && f <= EVENTS.clawsUp.from + 8);

