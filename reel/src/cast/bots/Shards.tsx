// Porcelain shards that chip off at impact, spin and fall out of frame.

import React from 'react';
import { BOTS, type BotKind } from '../../geometry';
import { C } from '../../theme';
import { clamp, rnd, smooth, type Pt } from '../../lib/anim';
import { mix } from '../../stage/Stage';
import { polyD } from './geom';
import { shellCentreLocal } from './shapes';
import { freeShellPoint } from './cracks';

const GRAVITY = 1.25; // px per story frame²
export const SHARD_LIFE = 45; // story frames

export const Shards: React.FC<{ kind: BotKind; impacts: Pt[]; t: number; seed: string; silhouette?: boolean }> = ({
  kind,
  impacts,
  t,
  seed,
  silhouette,
}) => {
  if (t < 0 || t >= SHARD_LIFE || impacts.length === 0) return null;
  let k = 0;
  const R = () => rnd(`shards:${kind}:${seed}:${k++}`);
  const n = 6 + Math.floor(R() * 5); // 6–10
  const a = BOTS[kind];
  const c = shellCentreLocal(kind);
  const centre = { x: c.x + a.cx, y: c.y + a.feetY };
  const fade = 1 - smooth(clamp((t - 36) / 9));
  const items: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const imp = freeShellPoint(kind, impacts[i % impacts.length]); // where makeCracks put the puncture
    const p0 = { x: imp.x + (R() - 0.5) * 12, y: imp.y + (R() - 0.5) * 8 };
    const out = Math.atan2(p0.y - centre.y, p0.x - centre.x);
    let dx = Math.cos(out) * 0.8;
    let dy = Math.sin(out) * 0.8 - 0.8;
    const jit = (R() - 0.5) * 1.1;
    const cj = Math.cos(jit);
    const sj = Math.sin(jit);
    [dx, dy] = [dx * cj - dy * sj, dx * sj + dy * cj];
    const dl = Math.hypot(dx, dy) || 1;
    const sp = 3.5 + R() * 6;
    const vx = (dx / dl) * sp;
    const vy = (dy / dl) * sp - 1.5;
    const rot0 = R() * 360;
    const spin = (R() < 0.5 ? -1 : 1) * (7 + R() * 15);
    const flip0 = R() * Math.PI * 2;
    const flipW = 0.12 + R() * 0.22;
    const size = 5 + R() * 7;
    const nv = 3 + Math.floor(R() * 3);
    const off = R() * Math.PI * 2;
    const pts: Pt[] = [];
    for (let v = 0; v < nv; v++) {
      const ang = off + (v / nv) * Math.PI * 2 + (R() - 0.5) * 0.7;
      const rr = size * (0.55 + R() * 0.6);
      pts.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr * (0.7 + R() * 0.3) });
    }
    const x = p0.x + vx * t;
    const y = p0.y + vy * t + 0.5 * GRAVITY * t * t;
    if (y > 2050) continue;
    const flip = Math.cos(flip0 + flipW * t);
    const sx = Math.sign(flip) * Math.max(0.18, Math.abs(flip));
    const grow = 0.6 + 0.4 * smooth(clamp(t / 1.5));
    const d = polyD(pts);
    const tr = `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(rot0 + spin * t).toFixed(2)}) scale(${(sx * grow).toFixed(3)} ${grow.toFixed(3)})`;
    items.push(
      silhouette ? (
        <path key={i} d={d} transform={tr} fill={C.night} />
      ) : (
        <g key={i} transform={tr}>
          <path d={d} transform="translate(1.3 1.8)" fill={C.porcelainShade} />
          <path d={d} fill={flip > 0 ? C.porcelain : mix(C.porcelain, C.porcelainShade, 0.7)} stroke={C.porcelainShade} strokeWidth={1.2} strokeLinejoin="round" />
          {flip > 0.3 ? (
            <path d={`M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}L${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`} stroke={C.cream} strokeWidth={1.6} strokeLinecap="round" />
          ) : null}
        </g>
      ),
    );
  }
  return <g opacity={fade}>{items}</g>;
};
