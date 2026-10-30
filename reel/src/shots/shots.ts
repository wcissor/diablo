// The six stage shots as pure functions frame → SceneState. Frames are
// absolute (the reel's own), read from EVENTS in config.ts.

import { EVENTS, SHOTS } from '../config';
import type { BotKind } from '../geometry';
import { BOTS, DIABLO_EYES_Y } from '../geometry';
import type { BotPose, BotProps, CrackState, HandProps, Pt } from '../cast/types';
import { botPoint } from '../cast/Bots';
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
import type { SceneState } from './Scene';
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
} from './story';
import { clawTips } from '../cast/Hands';

type BotsState = SceneState['bots'];
const KINDS: BotKind[] = ['bubble', 'cube', 'orb'];
const shot = (id: number) => SHOTS[id - 1];

// Slow push-in over a shot: scale a → b.
const push = (f: number, id: number, a: number, b: number) => {
  const s = shot(id);
  return lerp(a, b, invLerp(s.from, s.to + 1, f));
};

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

const SHOT1_EYES_DY = -150;

export const shot1 = (f: number): SceneState => {
  const flick = f >= EVENTS.flicker.from && f <= EVENTS.flicker.to;
  const up = easeOutBack(invLerp(EVENTS.flicker.from, EVENTS.flicker.from + 7, f), 1.2);
  const eyesOpen = easeOutCubic(invLerp(EVENTS.eyesOpen.from, EVENTS.eyesOpen.to, f));
  const scared = ramp(f, EVENTS.eyesOpen.from + 2, EVENTS.eyesOpen.to + 4);
  const eyesAt = { x: 540, y: DIABLO_EYES.y + SHOT1_EYES_DY };
  return {
    frame: f,
    camera: { scale: push(f, 1, 1.0, 1.05) },
    light: { level: 1 },
    dim: flick ? 0.4 : 0,
    head: f >= EVENTS.eyesOpen.from ? { eyesOnly: true, dy: SHOT1_EYES_DY, scale: 1.06, eyes: { open: eyesOpen } } : undefined,
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

const LOW = { dy: 14, ry: 250 };
const RISE_FROM = 560;

const rise = (f: number) => clamp(settle(f, EVENTS.rise.from, 2.5, 0.62), -0.2, 1.3);

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

const handsUp = (f: number, side: 'left' | 'right'): HandProps => {
  const hover = side === 'left' ? HOVER_LEFT : HOVER_RIGHT;
  const r = settle(f, EVENTS.clawsUp.from, 2.0, 0.55);
  const dip = Math.sin(clamp(invLerp(EVENTS.clawsUp.from - 4, EVENTS.clawsUp.from, f)) * Math.PI) * 18; // anticipation
  return {
    ...hover,
    y: lerp(hover.y + 900, hover.y, r) + dip,
    spread: lerp(0.3, hover.spread ?? 1, clamp(r)),
    tremble: f > EVENTS.clawsUp.to ? 2.2 : 0,
  };
};

export const shot2 = (f: number): SceneState => {
  const c = cower(f);
  const r = rise(f);
  const eyesAt = { x: 540, y: DIABLO_EYES.y + (1 - r) * RISE_FROM };
  return {
    frame: f,
    camera: { scale: push(f, 2, 0.97, 0.97 * 1.05), dy: LOW.dy },
    light: { level: 1, ry: LOW.ry },
    head: { dy: (1 - r) * RISE_FROM, eyes: { open: 1, look: { x: 0, y: 3 } }, clipBelowY: 1180 },
    tailBack: f >= EVENTS.tailSweep.from ? { crescent: tailSweep(f) } : undefined,
    hands: f >= EVENTS.clawsUp.from - 4 ? [handsUp(f, 'left'), handsUp(f, 'right')] : undefined,
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
    return { ...hover, x: hover.x + out * 12 * k, y: hover.y - 40 * k, curl: lerp(hover.curl ?? 0.1, 0.6, k), spread: lerp(hover.spread ?? 0.8, 0.7, k), tremble: 0, ember };
  }
  const kind: BotKind = side === 'left' ? 'bubble' : 'orb';
  const at = shellShift(kind, centroid(clawTips(hit)), strikeBotPose(Math.max(f, EVENTS.strike), kind), f);
  if (f < EVENTS.strike) {
    // the slam: one frame, very fast (motion-blurred)
    const k = easeInCubic(invLerp(w1, EVENTS.strike, f));
    const from = { x: hover.x + out * 12, y: hover.y - 40 };
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
  // pressed in, a tiny rebound, then lift clear of the cracks
  const rebound = Math.sin(clamp(s / 6) * Math.PI) * -6;
  const lift = easeInOutCubic(invLerp(196, 214, f)) * 70;
  const away = easeInOutCubic(invLerp(196, 214, f)) * -12 * out;
  return { ...hit, x: hit.x + at.x + away, y: hit.y + at.y + rebound - lift, ember, tremble: f > 214 ? 1.5 : 0 };
};

const strikeTail = (f: number) => {
  const { from: w0, to: w1 } = EVENTS.windUp;
  const s = sinceHit(f);
  if (f < w1) {
    const k = easeOutCubic(invLerp(w0, w1, f));
    return { ...TAIL_REST, rot: (TAIL_REST.rot ?? 0) + 16 * k, x: TAIL_REST.x - 14 * k };
  }
  if (f < EVENTS.strike) {
    const k = easeInCubic(invLerp(w1, EVENTS.strike, f));
    return {
      x: lerp(TAIL_REST.x - 14, TAIL_TAP.x, k),
      y: lerp(TAIL_REST.y, TAIL_TAP.y, k),
      rot: lerp((TAIL_REST.rot ?? 0) + 16, TAIL_TAP.rot ?? 0, k),
      scale: TAIL_TAP.scale,
    };
  }
  // the tap, held through the slow motion, then back to rest
  const back = easeInOutCubic(clamp((s - 12) / 10));
  return {
    x: lerp(TAIL_TAP.x, TAIL_REST.x, back),
    y: lerp(TAIL_TAP.y, TAIL_REST.y, back),
    rot: lerp(TAIL_TAP.rot ?? 0, TAIL_REST.rot ?? 0, back),
    scale: TAIL_REST.scale,
  };
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
    camera: { scale: push(f, 3, 0.97 * 1.05, 0.97 * 1.05 * 1.05), dx: sh.dx, dy: LOW.dy + sh.dy },
    light: { level: 1, ry: LOW.ry, ember },
    head: {
      dy: -10 * windK * (struck ? 0 : 1) + 10 * lunge,
      scale: 1 + 0.02 * lunge,
      eyes: { open: 1, narrow: struck ? 0.25 : 0.15 * windK, look },
      ember,
    },
    // the tail comes round in front for the tap and stays there for the shot
    tailBack: struck ? undefined : { crescent: strikeTail(f), ember },
    tailFront: struck ? { crescent: strikeTail(f), ember } : undefined,
    hands: [strikeHand(f, 'left', ember), strikeHand(f, 'right', ember)],
    bots: mapBots((k) => ({ ...strikeBotPose(f, k), cracks: struck ? [strikeState(f, k)] : undefined })),
    shards: struck
      ? [
          { kind: 'bubble', impacts: clawTips(STRIKE_LEFT), t: s, seed: 'shard-bubble' },
          { kind: 'cube', impacts: [TAIL_TAP_TIP()], t: s, seed: 'shard-cube' },
          { kind: 'orb', impacts: clawTips(STRIKE_RIGHT), t: s, seed: 'shard-orb' },
        ]
      : undefined,
    flash,
  };
};

const TAIL_TAP_TIP = () => strikeCracks().cube.cracks[0]?.points[0] ?? { x: 540, y: 940 };

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

const traceHand = (f: number): HandProps | undefined => {
  const set = strikeCracks().bubble;
  const crack = set.cracks[set.longest];
  const u = easeInOutCubic(invLerp(EVENTS.trace.from, EVENTS.trace.to, f));
  const base = { side: 'left' as const, rot: 28, spread: 0.25, curl: 0.55, x: 0, y: 0 };
  const tips = clawTips(base);
  // the claw nearest the bubble does the tracing
  const lead = tips.reduce((a, p, i) => (p.y > tips[a].y ? i : a), 0);
  const p = botPoint('bubble', pointOnCrack(crack.d, u), fixBotPose(f, 'bubble'), f); // on the drawn shell
  const away = easeInOutCubic(invLerp(EVENTS.trace.to + 2, EVENTS.trace.to + 22, f));
  return {
    ...base,
    x: p.x - tips[lead].x - away * 520,
    y: p.y - tips[lead].y - away * 90,
    rot: base.rot + away * 10,
    warm: clamp(1 - emberLevel(f)) * 0.6,
    ember: emberLevel(f),
  };
};

export const shot4 = (f: number): SceneState => {
  const ember = emberLevel(f);
  const warm = ramp(f, EVENTS.allSealed, EVENTS.allSealed + 16);
  const set = strikeCracks().bubble;
  const tracePoint = pointOnCrack(set.cracks[set.longest].d, easeInOutCubic(invLerp(EVENTS.trace.from, EVENTS.trace.to, f)));
  const look = f < EVENTS.trace.to + 6 ? eyeLookAt(tracePoint, 6) : { x: 0, y: 5 };
  return {
    frame: f,
    camera: { scale: push(f, 4, 1.03, 1.03 * 1.05) },
    light: { level: 1, ember, warm },
    head: { eyes: { open: 1, look, narrow: warm * 0.3 }, ember, warm },
    hands: f < EVENTS.trace.to + 24 ? [traceHand(f)!] : undefined,
    bots: mapBots((k) => ({ ...fixBotPose(f, k), cracks: [strikeState(f, k)] })),
  };
};

/* ─────────────────────────── Shot 5 — Learns ─────────────────────────── */

const sealedState = (f: number, k: BotKind): CrackState => ({ ...strikeState(SHOTS[3].to, k), warm: 0, weak: 0, pulseFrame: f });

const flickHand = (f: number): HandProps => {
  const hover = { side: 'right' as const, x: 800, y: 700, rot: 24, spread: 0.5, curl: 0.3 };
  const h = hairlines();
  // flick 1 (orb): sweep the lead tip across the crack in 6 frames
  const k1 = invLerp(EVENTS.crack1.flick - 5, EVENTS.crack1.flick + EVENTS.crack1.sealFrames + 6, f);
  const k2 = invLerp(EVENTS.crack2.at - 3, EVENTS.crack2.at + EVENTS.crack2.sealFrames + 4, f);
  const visit = (k: number, target: Pt, rot: number) => {
    const t = Math.sin(clamp(k) * Math.PI); // out and back
    const base = { ...hover, rot, curl: 0.5, spread: 0.2, x: 0, y: 0 };
    const tips = clawTips(base);
    const lead = tips.reduce((a, p, i) => (p.y > tips[a].y ? i : a), 0);
    const at = { x: target.x - tips[lead].x, y: target.y - tips[lead].y };
    return { x: lerp(hover.x, at.x, t), y: lerp(hover.y, at.y, t), rot: lerp(hover.rot, base.rot, t) };
  };
  const tremble = 1.2;
  const onShell = (k: BotKind, p: Pt) => botPoint(k, p, learnBotPose(f, k), f);
  // claws angled out onto the orb (palm clear of the rail), in onto the cube (palm clear of his eyes)
  if (k1 > 0 && k1 < 1) return { ...hover, ...visit(k1, onShell('orb', h.orb.cracks[0].points[0]), -10), tremble, warm: 0.5 };
  if (k2 > 0 && k2 < 1) return { ...hover, ...visit(k2, onShell('cube', h.cube.cracks[0].points[0]), 22), tremble, warm: 0.5 };
  return { ...hover, tremble, warm: 0.5 };
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

export const shot5 = (f: number): SceneState => {
  const h = hairlines();
  const o = h.orb.cracks[0].points[0];
  const cb = h.cube.cracks[0].points[0];
  let look: Pt = { x: 0, y: 5 };
  if (f >= EVENTS.crack1.at && f < EVENTS.crack1.flick + 12) look = eyeLookAt(o, 7);
  else if (f >= EVENTS.crack2.at && f < EVENTS.crack2.at + 10) look = eyeLookAt(cb, 7);
  const narrow = ramp(f, EVENTS.eyesNarrow, EVENTS.eyesNarrow + 8) * 0.75;
  const curl = settle(f, SHOTS[4].from, 1.6, 0.5);
  return {
    frame: f,
    camera: { scale: push(f, 5, 1.0, 1.05) },
    light: { level: 1, warm: 0.7 },
    head: { eyes: { open: 1, look, narrow }, warm: 0.6 },
    tailFront: {
      crescent: { x: lerp(90, 262, curl), y: 770, rot: lerp(-40, 8, curl), scale: 0.9 },
      seams: clamp((f - EVENTS.tailSeams.from) / EVENTS.tailSeams.stagger, 0, 8),
      warm: 0.5,
    },
    hands: [flickHand(f)],
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
  const ring = (layer: 'back' | 'front') => ({ ...RING, progress: ringT, goldEdge: gold, layer, startAngle: Math.PI * 0.95 });
  // the crescent dives from his side to where the ring starts
  const dive = easeInCubic(invLerp(EVENTS.ring.from - 6, EVENTS.ring.from + 2, f));
  return {
    frame: f,
    camera: { scale: push(f, 6, 1.05, 1.0) },
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
            seams: 8,
            warm: 0.6,
          }
        : { ring: ring('back'), seams: 8, warm: 0.6 },
    tailFront: f >= EVENTS.ring.from ? { ring: ring('front'), seams: 8, warm: 0.6 } : undefined,
    bots: mapBots((k) => ({
      idle: true,
      bright: 1,
      look: { x: 0, y: -0.2 },
      squash: 1.04 - 0.06 * crouch + 0.05 * air - 0.05 * land,
      lift: air * 26,
      cracks: [sealedState(f, k), ...(k === 'orb' ? [hairDone(f, 'orb')] : []), ...(k === 'cube' ? [hairDone(f, 'cube')] : [])],
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

