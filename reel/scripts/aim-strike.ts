// Find strike poses whose four claw tips all land on free shell: on the
// bubble above its eyes, on the orb inside the sphere but clear of its eye.
// Prints the best pose for each hand; story.ts holds the chosen numbers.
// Usage: npx tsx scripts/aim-strike.ts

import { clawTips, handBounds } from '../src/cast/Hands';
import type { HandPose, Pt } from '../src/cast/types';

const centroid = (ps: Pt[]) => ps.reduce((a, p) => ({ x: a.x + p.x / ps.length, y: a.y + p.y / ps.length }), { x: 0, y: 0 });

// Free shell for each target, as a scoring function: 0 inside, px outside.
const BUBBLE = { x0: 182, x1: 380, y0: 976, y1: 1012 }; // above the eyes, inside the rounded top
const ORB = { c: { x: 800, y: 1060 }, r: 90, eye: { x: 792, y: 1038 }, eyeClear: 54 };
const missBubble = (p: Pt) =>
  Math.max(0, BUBBLE.x0 - p.x) + Math.max(0, p.x - BUBBLE.x1) + Math.max(0, BUBBLE.y0 - p.y) + Math.max(0, p.y - BUBBLE.y1);
const missOrb = (p: Pt) =>
  Math.max(0, Math.hypot(p.x - ORB.c.x, p.y - ORB.c.y) - ORB.r) + Math.max(0, ORB.eyeClear - Math.hypot(p.x - ORB.eye.x, p.y - ORB.eye.y));

const search = (side: 'left' | 'right', target: Pt, miss: (p: Pt) => number) => {
  let best: { pose: HandPose; score: number; tips: Pt[] } | null = null;
  for (let rot = -40; rot <= 40; rot += 2)
    for (let spread = 0.15; spread <= 1.001; spread += 0.05)
      for (let curl = 0.6; curl <= 1.001; curl += 0.05)
        for (let dy = -24; dy <= 24; dy += 4)
          for (let dx = -24; dx <= 24; dx += 4) {
            const base: HandPose = { side, x: 0, y: 0, rot, spread, curl };
            const c = centroid(clawTips(base));
            const pose = { ...base, x: target.x + dx - c.x, y: target.y + dy - c.y };
            const tips = clawTips(pose);
            const b = handBounds(pose);
            const off = tips.reduce((a, p) => a + miss(p), 0);
            const ys = tips.map((p) => p.y);
            const level = Math.max(...ys) - Math.min(...ys); // tips on a shallow arc read as one blow
            const xs = tips.map((p) => p.x);
            const width = Math.max(...xs) - Math.min(...xs); // spread claws read as a grab
            const rail = Math.max(0, b.x1 - 930) + Math.max(0, 126 - b.x0);
            const score = off * 50 + rail * 50 + level * 0.6 - Math.min(width, 150) * 0.4 + Math.abs(rot) * 0.15;
            if (!best || score < best.score) best = { pose, score, tips };
          }
  return best!;
};

const r1 = (v: number) => Math.round(v * 100) / 100;
for (const [side, target, miss] of [
  ['left', { x: 281, y: 994 }, missBubble],
  ['right', { x: 800, y: 986 }, missOrb],
] as const) {
  const b = search(side, target, miss);
  const p = b.pose;
  console.log(
    `${side}: { side: '${side}', x: ${r1(p.x)}, y: ${r1(p.y)}, rot: ${p.rot}, spread: ${r1(p.spread ?? 0)}, curl: ${r1(p.curl ?? 0)} }`,
    'score', r1(b.score),
    'tips', b.tips.map((t) => `(${Math.round(t.x)},${Math.round(t.y)})`).join(' '),
    'miss', r1(b.tips.reduce((a, t) => a + miss(t), 0)),
    'bounds', JSON.stringify(handBounds(p), (_, v) => (typeof v === 'number' ? Math.round(v) : v)),
  );
}
