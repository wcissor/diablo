// Gate 3 from the scene state itself: for every frame, where every character
// actually is on the canvas (after the camera), checked against the safe area,
// the words zone and the right rail. Writes out/qa/layout.json.
// Usage: npx tsx scripts/check-layout.ts

import fs from 'node:fs';
import path from 'node:path';
import { DURATION, EVENTS, SHOTS } from '../src/config';
import { CAMERA_ORIGIN, RIGHT_RAIL, SAFE, WORDS } from '../src/geometry';
import { CRESCENT_PATH, HEAD_PATH } from '../src/logo';
import { STATE_FNS } from '../src/shots/shots';
import type { SceneState } from '../src/shots/Scene';
import { botBounds } from '../src/cast/Bots';
import { eyeCentres, headMatrix } from '../src/cast/Diablo';
import { clawTips, handBounds } from '../src/cast/Hands';
import { crescentMatrix } from '../src/cast/Tail';
import { ap, samplePath } from '../src/cast/diablo/geom';
import type { BotKind, Pt } from '../src/cast/types';

type Box = { x0: number; y0: number; x1: number; y1: number };
const KINDS: BotKind[] = ['bubble', 'cube', 'orb'];
const HEAD = samplePath(HEAD_PATH, 6)[0];
const CRESCENT = samplePath(CRESCENT_PATH, 6)[0];

const cam = (s: SceneState) => (p: Pt): Pt => ({
  x: CAMERA_ORIGIN.x + (p.x - CAMERA_ORIGIN.x) * s.camera.scale + (s.camera.dx ?? 0),
  y: CAMERA_ORIGIN.y + (p.y - CAMERA_ORIGIN.y) * s.camera.scale + (s.camera.dy ?? 0),
});
const boxOf = (ps: Pt[]): Box => ({
  x0: Math.min(...ps.map((p) => p.x)),
  y0: Math.min(...ps.map((p) => p.y)),
  x1: Math.max(...ps.map((p) => p.x)),
  y1: Math.max(...ps.map((p) => p.y)),
});
const corners = (b: Box): Pt[] => [
  { x: b.x0, y: b.y0 },
  { x: b.x1, y: b.y0 },
  { x: b.x0, y: b.y1 },
  { x: b.x1, y: b.y1 },
];
const inSafe = (p: Pt) => p.x >= SAFE.x0 && p.x <= SAFE.x1 && p.y >= SAFE.y0 && p.y <= SAFE.y1;
const near = (p: Pt, b: Box, m = 8) => p.x >= b.x0 - m && p.x <= b.x1 + m && p.y >= b.y0 - m && p.y <= b.y1 + m;

interface Violation {
  check: string;
  who: string;
  frame: number;
  by: number; // px past the limit
}
const out: Violation[] = [];
const flag = (check: string, who: string, frame: number, by: number) => {
  if (by > 0.5) out.push({ check, who, frame, by: Math.round(by * 10) / 10 });
};

for (let f = 0; f < DURATION; f++) {
  const shot = SHOTS.find((s) => f >= s.from && f <= s.to)!;
  if (shot.id === 7) continue; // the end card is fixed type and the mark (checked by eye)
  const s = STATE_FNS[shot.id as 1 | 2 | 3 | 4 | 5 | 6](f);
  if (s.flash) continue;
  const C = cam(s);
  const wordsOn = shot.words.length > 0 && f >= shot.wordsIn;

  // Characters as canvas-space point sets.
  const parts: { who: string; pts: Pt[] }[] = [];
  if (s.head && !s.head.eyesOnly) {
    const m = headMatrix(s.head);
    const clip = s.head.clipBelowY ?? Infinity;
    const pts = HEAD.map((p) => ap(m, p)).filter((p) => p.y <= clip);
    if (pts.length) parts.push({ who: 'head', pts: pts.map(C) });
  }
  const eyes = s.head ? eyeCentres(s.head).filter((p) => p.y <= (s.head!.clipBelowY ?? Infinity)) : [];
  if (s.head?.eyesOnly) parts.push({ who: 'eyes', pts: eyes.map(C) });
  for (const h of [...(s.hands ?? []), ...(s.handsBack ?? [])]) {
    const b = handBounds(h);
    const clipped = s.handsBack?.includes(h) ? { ...b, y1: Math.min(b.y1, 1180) } : b; // the back layer is clipped at the stage line
    if (clipped.y1 > clipped.y0) parts.push({ who: `hand-${h.side}`, pts: corners(clipped).map(C) });
  }
  for (const t of [s.tailBack, s.tailFront]) {
    if (!t) continue;
    if (t.crescent) {
      const m = crescentMatrix(t.crescent);
      parts.push({ who: 'tail', pts: CRESCENT.map((p) => C(ap(m, p))) });
    }
    if (t.ring) {
      const r = t.ring;
      parts.push({ who: 'ring', pts: corners({ x0: r.cx - r.rx - 13, x1: r.cx + r.rx + 13, y0: r.cy - r.ry - 13, y1: r.cy + r.ry + 13 }).map(C) });
    }
  }
  const botBoxes = Object.fromEntries(KINDS.map((k) => [k, botBounds(k, s.bots[k])])) as Record<BotKind, Box>;
  for (const k of KINDS) parts.push({ who: k, pts: corners(botBoxes[k]).map(C) });

  // Words: 40 px clear of every character.
  if (wordsOn) {
    for (const part of parts) {
      const b = boxOf(part.pts);
      if (b.x1 < WORDS.cx - WORDS.maxW / 2 || b.x0 > WORDS.cx + WORDS.maxW / 2) continue;
      flag('words-clear', part.who, f, WORDS.bottom + WORDS.clear - b.y0);
    }
  }
  // Bots inside the core safe area.
  for (const k of KINDS) {
    const b = boxOf(corners(botBoxes[k]).map(C));
    flag('safe-bots', k, f, Math.max(SAFE.x0 - b.x0, b.x1 - SAFE.x1, SAFE.y0 - b.y0, b.y1 - SAFE.y1));
  }
  // Diablo's eyes inside the core safe area.
  for (const e of eyes.map(C)) if (!inSafe(e)) flag('safe-eyes', 'eyes', f, Math.max(SAFE.x0 - e.x, e.x - SAFE.x1, SAFE.y0 - e.y, e.y - SAFE.y1));
  // Claws touching a bot: inside x 120–936 (and the safe area).
  for (const h of s.hands ?? []) {
    for (const tip of clawTips(h)) {
      if (!KINDS.some((k) => near(tip, botBoxes[k]))) continue;
      const t = C(tip);
      flag('safe-claws', `hand-${h.side}`, f, Math.max(SAFE.x0 - t.x, t.x - SAFE.x1, SAFE.y0 - t.y, t.y - SAFE.y1));
    }
  }
  // His eyes do the acting: no hand over them (a quality check, not a gate),
  // except during the two flicks, when the claw passes the crack he is looking at.
  const flicking =
    (f >= EVENTS.crack1.flick - 5 && f <= EVENTS.crack1.flick + EVENTS.crack1.sealFrames + 6) ||
    (f >= EVENTS.crack2.at - 3 && f <= EVENTS.crack2.at + EVENTS.crack2.sealFrames + 4);
  if (s.head && !s.head.eyesOnly && !flicking) {
    for (const h of s.hands ?? []) {
      const b = handBounds(h);
      for (const e of eyes) {
        const covered = e.x + 18 > b.x0 && e.x - 18 < b.x1 && e.y + 44 > b.y0 && e.y - 44 < b.y1;
        if (covered) flag('eyes-clear', `hand-${h.side}`, f, 1);
      }
    }
  }
  // Right rail (x > 936 from y 800 down): no action in it.
  for (const part of parts) {
    const inRail = part.pts.filter((p) => p.y > RIGHT_RAIL.y0);
    if (!inRail.length) continue;
    flag('right-rail', part.who, f, Math.max(...inRail.map((p) => p.x)) - RIGHT_RAIL.x0);
  }
}

// Summarise as frame ranges per check and character.
const groups = new Map<string, Violation[]>();
for (const v of out) {
  const key = `${v.check} ${v.who}`;
  groups.set(key, [...(groups.get(key) ?? []), v]);
}
const summary = [...groups.entries()].map(([key, vs]) => {
  const ranges: string[] = [];
  let a = vs[0].frame;
  let b = a;
  for (const v of vs.slice(1)) {
    if (v.frame === b + 1) b = v.frame;
    else {
      ranges.push(a === b ? `${a}` : `${a}–${b}`);
      a = b = v.frame;
    }
  }
  ranges.push(a === b ? `${a}` : `${a}–${b}`);
  return { key, frames: vs.length, worst: Math.max(...vs.map((v) => v.by)), ranges };
});
const file = path.join(__dirname, '..', 'out', 'qa', 'layout.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ checkedFrames: DURATION, violations: summary }, null, 2));
if (!summary.length) console.log('layout: PASS — every frame inside the safe area, words 40 px clear, right rail empty, eyes clear of the hands');
else for (const g of summary) console.log(`layout: FAIL ${g.key}: ${g.frames} frames, worst ${g.worst} px, frames ${g.ranges.join(', ')}`);
