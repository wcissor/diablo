// Shared story state: the strike's crack sets (built from where the claws and
// the tail actually land), the strike clock with its slow motion, the seal
// schedule. Shots read these so every shot agrees with the others.

import { getLength, getPointAtLength } from '@remotion/paths';
import { EVENTS, SFX } from '../config';
import type { BotKind } from '../geometry';
import { BOTS } from '../geometry';
import type { CrackSet, CrackState, HandPose, Pt, TailCrescentPose } from '../cast/types';
import { makeCracks, makeHairline } from '../cast/Bots';
import { clawTips } from '../cast/Hands';
import { tailTips } from '../cast/Tail';
import { clamp, easeOutCubic, invLerp, lerp } from '../lib/anim';

/* ───────────── Where the blows land ───────────── */

// Move a pose so the centroid of its claw tips sits on `target`.
const aimHand = (pose: HandPose, target: Pt): HandPose => {
  const tips = clawTips(pose);
  const c = tips.reduce((a, p) => ({ x: a.x + p.x / tips.length, y: a.y + p.y / tips.length }), { x: 0, y: 0 });
  return { ...pose, x: pose.x + target.x - c.x, y: pose.y + target.y - c.y };
};

// The claws land on the upper front of the bubble and the orb shells.
export const IMPACT_TARGET: Record<'bubble' | 'orb', Pt> = {
  bubble: { x: BOTS.bubble.cx + 9, y: 1018 },
  orb: { x: BOTS.orb.cx - 5, y: 1016 },
};
// Where the tail's point taps the cube (its top face): the cube's cracks start here.
export const CUBE_TAP: Pt = { x: BOTS.cube.cx - 8, y: 950 };

export const STRIKE_LEFT: HandPose = aimHand({ side: 'left', x: 270, y: 700, rot: 20, spread: 0.55, curl: 0.85 }, IMPACT_TARGET.bubble);
export const STRIKE_RIGHT: HandPose = aimHand({ side: 'right', x: 810, y: 700, rot: -20, spread: 0.55, curl: 0.85 }, IMPACT_TARGET.orb);

// Hover poses (shot 2 end, shot 3 start): out to the sides and higher.
export const HOVER_LEFT: HandPose = { side: 'left', x: STRIKE_LEFT.x - 5, y: STRIKE_LEFT.y - 190, rot: 6, spread: 0.8, curl: 0.1 };
export const HOVER_RIGHT: HandPose = { side: 'right', x: STRIKE_RIGHT.x + 5, y: STRIKE_RIGHT.y - 190, rot: -6, spread: 0.8, curl: 0.1 };

// The tail rests behind Diablo's left side, then its point taps the cube.
export const TAIL_REST: TailCrescentPose = { x: 250, y: 880, rot: 10, scale: 1.0 };
const aimTail = (pose: TailCrescentPose, target: Pt): TailCrescentPose => {
  const tip = tailTips(pose).lower;
  return { ...pose, x: pose.x + target.x - tip.x, y: pose.y + target.y - tip.y };
};
// Flipped, coming in from the upper left so its inner curve clears his left eye.
export const TAIL_TAP: TailCrescentPose = aimTail({ x: 440, y: 820, rot: -8, scale: 0.8, flip: true }, CUBE_TAP);

/* ───────────── Cracks ───────────── */

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v === undefined ? (v = f()) : v);
};

export const strikeCracks = memo(
  (): Record<BotKind, CrackSet> => ({
    // 5 each: the traced crack plus 14 more close on the 13 chimes after it
    bubble: makeCracks('bubble', clawTips(STRIKE_LEFT), 'strike-bubble', 5),
    cube: makeCracks('cube', [CUBE_TAP], 'strike-cube', 5),
    orb: makeCracks('orb', clawTips(STRIKE_RIGHT), 'strike-orb', 5),
  }),
);

export const hairlines = memo(() => ({
  // on free porcelain, below the faces: the orb's lower left, the band under the cube's screen (right end)
  orb: makeHairline('orb', { x: BOTS.orb.cx - 30, y: 1124 }, 'hairline-orb', 50),
  cube: makeHairline('cube', { x: BOTS.cube.cx + 66, y: 1154 }, 'hairline-cube', 34),
}));

export const pointOnCrack = (d: string, u: number): Pt => {
  const len = getLength(d);
  const p = getPointAtLength(d, clamp(u) * len);
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
};
export const crackLength = (d: string) => getLength(d);

/* ───────────── The strike clock ───────────── */

// Story time through shot 3: real time up to 4.7 s, 25 % through the slow
// motion, a ramp back to full speed, then real time again.
export const storyTime = (f: number) => {
  const { from, to, rate } = EVENTS.slowMo;
  const { to: rampTo } = EVENTS.rampBack;
  if (f <= from) return f;
  if (f <= to) return from + (f - from) * rate;
  const atTo = from + (to - from) * rate;
  if (f <= rampTo) {
    const x = f - to;
    const span = rampTo - to;
    // rate rises linearly from `rate` to 1 over the ramp
    return atTo + rate * x + ((1 - rate) * x * x) / (2 * span);
  }
  const atRamp = atTo + (rate + 1) * 0.5 * (rampTo - to);
  return atRamp + (f - rampTo);
};
// Story frames since the hit.
export const sinceHit = (f: number) => storyTime(f) - EVENTS.strike;

/* ───────────── The seal schedule (shot 4) ───────────── */

export interface SealSlot {
  kind: BotKind;
  index: number;
  end: number; // frame the seam closes (a chime)
  start: number;
}

const FILL_FRAMES = 8;

// The traced crack closes when the trace ends; the rest close one after
// another on the chime frames, about 3 frames apart, the last at 9.8 s.
export const sealSchedule = memo((): SealSlot[] => {
  const sets = strikeCracks();
  const traced = sets.bubble.longest;
  const slots: SealSlot[] = [{ kind: 'bubble', index: traced, start: EVENTS.trace.from, end: EVENTS.trace.to }];
  const rest: { kind: BotKind; index: number }[] = [];
  // Interleave the bots so the gold travels across all three.
  const lists = (['bubble', 'cube', 'orb'] as BotKind[]).map((k) =>
    sets[k].cracks.map((_, i) => ({ kind: k, index: i })).filter((c) => !(c.kind === 'bubble' && c.index === traced)),
  );
  const maxLen = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) for (const l of lists) if (l[i]) rest.push(l[i]);
  const chimes = SFX.seamChimes.filter((c) => c > EVENTS.trace.to);
  rest.forEach((c, i) => {
    const slot = chimes[Math.min(chimes.length - 1, Math.floor((i * chimes.length) / rest.length))];
    slots.push({ ...c, end: slot, start: slot - FILL_FRAMES });
  });
  return slots;
});

export const sealAt = (f: number, kind: BotKind): number[] => {
  const set = strikeCracks()[kind];
  const out = set.cracks.map(() => 0);
  for (const s of sealSchedule()) {
    if (s.kind !== kind) continue;
    out[s.index] = s.index === set.longest && kind === 'bubble' ? invLerp(s.start, s.end, f) : easeOutCubic(invLerp(s.start, s.end, f));
  }
  return out;
};

// Frame at which a bot's last seam closes.
export const lastSealOf = (kind: BotKind) => Math.max(...sealSchedule().filter((s) => s.kind === kind).map((s) => s.end));

/* ───────────── Crack states by frame ───────────── */

export const strikeState = (f: number, kind: BotKind): CrackState => {
  const set = strikeCracks()[kind];
  const s = sinceHit(f);
  const grow = f < EVENTS.strike ? 0 : easeOutCubic(clamp(s / 12));
  let weak = clamp((s - 4) / 6);
  const seal = f >= EVENTS.trace.from ? sealAt(f, kind) : set.cracks.map(() => 0);
  const sealed = seal.length ? seal.reduce((a, b) => a + b, 0) / seal.length : 0;
  weak *= 1 - sealed;
  const done = lastSealOf(kind);
  const warm = f < done ? 0 : f < done + 6 ? invLerp(done, done + 6, f) : 1 - invLerp(done + 6, done + 36, f);
  return { set, grow, weak, pulseFrame: f, seal, warm: clamp(warm) };
};

export const emberLevel = (f: number) => {
  const ks: BotKind[] = ['bubble', 'cube', 'orb'];
  return ks.reduce((a, k) => a + strikeState(f, k).weak, 0) / ks.length;
};

export { lerp };
