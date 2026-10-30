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

// The strike poses: every claw tip lands on free shell — on the bubble above
// its eyes, on the orb inside the sphere and clear of its eye. Solved by
// scripts/aim-strike.ts against the hand geometry; re-run it if the hands change.
export const STRIKE_LEFT: HandPose = { side: 'left', x: 226.84, y: 768.96, rot: 6, spread: 0.4, curl: 0.9 };
export const STRIKE_RIGHT: HandPose = { side: 'right', x: 821.78, y: 770.32, rot: -10, spread: 0.15, curl: 1 };

// Where the tail's point taps the cube: the corner of the band under its
// screen, so the tail can come up from in front of the stage, in the clear.
export const CUBE_TAP: Pt = { x: BOTS.cube.cx + 86, y: 1150 };

// Hover poses (shot 2 end, shot 3 start): high on either side, clear of his horns (no words yet).
export const HOVER_LEFT: HandPose = { side: 'left', x: STRIKE_LEFT.x - 15, y: STRIKE_LEFT.y - 240, rot: 10, spread: 0.8, curl: 0.1 };
export const HOVER_RIGHT: HandPose = { side: 'right', x: STRIKE_RIGHT.x - 10, y: STRIKE_RIGHT.y - 240, rot: -10, spread: 0.8, curl: 0.1 };

// The tail rests behind Diablo's left side (shots 2 and 6).
export const TAIL_REST: TailCrescentPose = { x: 250, y: 880, rot: 10, scale: 1.0 };
const aimTail = (pose: TailCrescentPose, target: Pt): TailCrescentPose => {
  const tip = tailTips(pose).lower;
  return { ...pose, x: pose.x + target.x - tip.x, y: pose.y + target.y - tip.y };
};
// The strike: the crescent lies in front of the stage, below the bots, and
// its point curls up into the cube's corner — a scythe seen against the floor.
export const TAIL_TAP: TailCrescentPose = aimTail({ x: 760, y: 1290, rot: 100, scale: 0.78 }, CUBE_TAP);
// Coiled, before the tap (and where it pulls back to): straight below, so it
// never strays into the right rail.
export const TAIL_COIL: TailCrescentPose = { ...TAIL_TAP, x: TAIL_TAP.x - 10, y: TAIL_TAP.y + 130, rot: (TAIL_TAP.rot ?? 0) + 6 };

/* ───────────── Cracks ───────────── */

const memo = <T,>(f: () => T) => {
  let v: T | undefined;
  return () => (v === undefined ? (v = f()) : v);
};

export const strikeCracks = memo(
  (): Record<BotKind, CrackSet> => ({
    // 8 each (mains and their forks); they close on the 13 seam chimes after the trace.
    // maxMove: a claw that misses free shell fails the render instead of cracking elsewhere
    bubble: makeCracks('bubble', clawTips(STRIKE_LEFT), 'strike-bubble', 8, { maxMove: 2 }),
    cube: makeCracks('cube', [CUBE_TAP], 'strike-cube', 8, { maxMove: 2 }),
    orb: makeCracks('orb', clawTips(STRIKE_RIGHT), 'strike-orb', 8, { maxMove: 2 }),
  }),
);

export const hairlines = memo(() => ({
  // on free porcelain clear of the strike's seams, where a claw can reach from
  // the upper right without crossing his eyes: the orb's right shoulder, the
  // cube's top face right of the antenna
  orb: makeHairline('orb', { x: BOTS.orb.cx + 82, y: 1037 }, 'hairline-orb', 42),
  cube: makeHairline('cube', { x: BOTS.cube.cx + 62, y: 968 }, 'hairline-cube', 26),
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

// A crack's parent (the crack it forks from), or -1 for a main.
const parentOf = (set: CrackSet, i: number): number => {
  const p = (set.cracks[i] as { parent?: number }).parent;
  return typeof p === 'number' && p >= 0 && p !== i ? p : -1;
};
const mainOf = (set: CrackSet, i: number): number => {
  let j = i;
  for (let n = 0; n < 16 && parentOf(set, j) >= 0; n++) j = parentOf(set, j);
  return j;
};
const rootDistOf = (set: CrackSet, i: number): number => (set.cracks[i] as { rootDist?: number }).rootDist ?? 0;

// The traced crack (and its forks, as the claw passes them) closes with the
// trace; the rest close one after another on the chime frames, about 3 frames
// apart, the last at 9.8 s. A fork never closes before the crack it forks from.
export const sealSchedule = memo((): SealSlot[] => {
  const sets = strikeCracks();
  const bubble = sets.bubble;
  const traced = bubble.longest;
  const { from: t0, to: t1 } = EVENTS.trace;
  const slots: SealSlot[] = [{ kind: 'bubble', index: traced, start: t0, end: t1 }];
  const tracedLen = bubble.cracks[traced].length;
  bubble.cracks.forEach((_, i) => {
    if (i === traced || mainOf(bubble, i) !== traced) return;
    const at = t0 + (t1 - t0) * Math.min(1, Math.max(0, rootDistOf(bubble, i)) / tracedLen);
    slots.push({ kind: 'bubble', index: i, start: Math.round(at), end: Math.round(at) + FILL_FRAMES });
  });
  const taken = new Set(slots.map((x) => `${x.kind}-${x.index}`));
  // Per bot: mains first, each followed by its forks (depth first); then interleave the bots.
  const ordered = (k: BotKind) => {
    const set = sets[k];
    const out: number[] = [];
    const visit = (i: number) => {
      if (!taken.has(`${k}-${i}`)) out.push(i);
      set.cracks.forEach((_, j) => parentOf(set, j) === i && visit(j));
    };
    set.cracks.forEach((_, i) => parentOf(set, i) < 0 && visit(i));
    return out.map((index) => ({ kind: k, index }));
  };
  const lists = (['bubble', 'cube', 'orb'] as BotKind[]).map(ordered);
  const rest: { kind: BotKind; index: number }[] = [];
  const maxLen = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) for (const l of lists) if (l[i]) rest.push(l[i]);
  const chimes = SFX.seamChimes.filter((c) => c > t1);
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
    // the traced crack fills right behind the claw tip, which leads off fast so
    // the gold shows as the words land; the rest pour in
    out[s.index] = s.index === set.longest && kind === 'bubble' ? traceU(f - 1) : easeOutCubic(invLerp(s.start, s.end, f));
  }
  return out;
};

// How far along the traced crack the claw tip is (0..1).
export const traceU = (f: number) => {
  const t = invLerp(EVENTS.trace.from, EVENTS.trace.to, f);
  return 1 - (1 - t) * (1 - t); // ease out: quick off the mark, gentle at the end
};

// A quick sparkle at each seam's end as it closes (8 frames).
export const popAt = (f: number, kind: BotKind): number[] => {
  const set = strikeCracks()[kind];
  const out = set.cracks.map(() => 0);
  for (const s of sealSchedule()) if (s.kind === kind && f >= s.end) out[s.index] = Math.max(0, 1 - (f - s.end) / 8);
  return out;
};

// Frame at which a bot's last seam closes.
export const lastSealOf = (kind: BotKind) => Math.max(...sealSchedule().filter((s) => s.kind === kind).map((s) => s.end));

/* ───────────── Crack states by frame ───────────── */

export const strikeState = (f: number, kind: BotKind): CrackState => {
  const set = strikeCracks()[kind];
  const s = sinceHit(f);
  const grow = f < EVENTS.strike ? 0 : easeOutCubic(clamp(s / 12));
  const seal = f >= EVENTS.trace.from ? sealAt(f, kind) : set.cracks.map(() => 0);
  const done = lastSealOf(kind);
  // Open spots glow until the bot's last seam closes (each spot goes out as its
  // own gold fills, in the bot's crack layer).
  const weak = clamp((s - 4) / 6) * (1 - invLerp(done, done + 4, f));
  const warm = f < done ? 0 : f < done + 6 ? invLerp(done, done + 6, f) : 1 - invLerp(done + 6, done + 36, f);
  return { set, grow, weak, pulseFrame: f, seal, warm: clamp(warm), pop: f >= EVENTS.trace.from ? popAt(f, kind) : undefined };
};

// The cracks' red light on the stage and on Diablo: the open share of the weak spots.
export const emberLevel = (f: number) => {
  const ks: BotKind[] = ['bubble', 'cube', 'orb'];
  return (
    ks.reduce((a, k) => {
      const st = strikeState(f, k);
      const sealed = st.seal.length ? st.seal.reduce((x, y) => x + y, 0) / st.seal.length : 0;
      return a + st.weak * (1 - sealed);
    }, 0) / ks.length
  );
};

export { lerp };
