// Find strike poses whose four claw tips all land on free shell: on the
// bubble above its eyes, on the orb inside the sphere but clear of its eye.
// Prints the best pose for each hand; story.ts holds the chosen numbers. The
// orb's free shell is a thin crescent round its eye, so its final pose came from
// a finer local search around this result (every tip ≥ 6 px inside, 0 px moved).
// Usage: npx tsx scripts/aim-strike.ts

import { freeShellPoint } from '../src/cast/Bots';
import { clawTips, handBounds } from '../src/cast/Hands';
import type { HandPose, Pt } from '../src/cast/types';

const centroid = (ps: Pt[]) => ps.reduce((a, p) => ({ x: a.x + p.x / ps.length, y: a.y + p.y / ps.length }), { x: 0, y: 0 });

// Free shell for each target, by the bots' own rule (at least 6 px inside the
// shell, clear of the eyes): 0 on it, else how far makeCracks would move it.
const missOn = (kind: 'bubble' | 'orb') => (p: Pt) => {
  const q = freeShellPoint(kind, p, 6);
  return Math.hypot(q.x - p.x, q.y - p.y);
};
const missBubble = missOn('bubble');
const missOrb = missOn('orb');

const search = (side: 'left' | 'right', target: Pt, miss: (p: Pt) => number, reach = 24) => {
  let best: { pose: HandPose; score: number; tips: Pt[] } | null = null;
  for (let rot = -36; rot <= 36; rot += 3)
    for (let spread = 0.2; spread <= 1.001; spread += 0.1)
      for (let curl = 0.7; curl <= 1.001; curl += 0.1)
        for (let dy = -reach; dy <= reach; dy += 6)
          for (let dx = -2 * reach; dx <= 2 * reach; dx += 6) {
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
  ['right', { x: 800, y: 995 }, missOrb],
] as const) {
  const b = search(side, target, miss, side === 'right' ? 36 : 24);
  const p = b.pose;
  console.log(
    `${side}: { side: '${side}', x: ${r1(p.x)}, y: ${r1(p.y)}, rot: ${p.rot}, spread: ${r1(p.spread ?? 0)}, curl: ${r1(p.curl ?? 0)} }`,
    'score', r1(b.score),
    'tips', b.tips.map((t) => `(${Math.round(t.x)},${Math.round(t.y)})`).join(' '),
    'miss', r1(b.tips.reduce((a, t) => a + miss(t), 0)),
    'bounds', JSON.stringify(handBounds(p), (_, v) => (typeof v === 'number' ? Math.round(v) : v)),
  );
}
