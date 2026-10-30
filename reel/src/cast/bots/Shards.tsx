// Porcelain shards thrown off at impact: they spin through the air, land on
// the stage line, bounce once or twice, skitter outward and fade (by t ≈ 45).
// Closed-form ballistics, so any (sub-)frame renders on its own; a shard never
// drops below the stage line.

import React from 'react';
import { BOTS, STAGE_Y, type BotKind } from '../../geometry';
import { C } from '../../theme';
import { clamp, rnd, smooth, type Pt } from '../../lib/anim';
import { mix } from '../../stage/Stage';
import { shellCentreLocal } from './shapes';
import { freeShellPoint } from './cracks';

const GRAVITY = 1.25; // px per story frame²
export const SHARD_LIFE = 45; // story frames
const BOUNCE = [0.42, 0.3]; // restitution of the first and second bounce
const FRICTION = 0.3; // px per frame² while sliding
const THICK = 2.6; // px: the broken edge's thickness, seen below the face

const FACE = C.porcelain;
const FACE_SHADE = mix(C.porcelain, C.porcelainShade, 0.55);
const INNER = mix(C.porcelain, C.porcelainShade, 0.72); // the unglazed inside of the shell
const INNER_SHADE = mix(C.porcelainShade, C.night, 0.12);

type XY = { x: number; y: number };

// Clip a polygon to the half-plane n·p ≥ d (Sutherland–Hodgman).
const clipHalf = (pts: XY[], nx: number, ny: number, d: number): XY[] => {
  const out: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = a.x * nx + a.y * ny - d;
    const db = b.x * nx + b.y * ny - d;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
};
const pd = (pts: XY[]) => (pts.length < 3 ? '' : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('') + 'Z');

interface Flight {
  y: number; // centre height by physics (before the floor clamp)
  x: number;
  spin: number; // degrees turned so far
  t1: number; // when it first lands
  tS: number; // when it starts to slide
}

// The centre's path: a throw, two bounces, then a slide, with the floor at
// `floor` (the centre's height when resting on the stage line).
const fly = (t: number, p0: XY, vx0: number, vy0: number, w0: number, floor: number): Flight => {
  // Time to fall from y0 (moving at vy) to the floor.
  const land = (y0: number, vy: number) => {
    const dy = floor - y0;
    return (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * dy))) / GRAVITY;
  };
  let x = p0.x;
  let y = p0.y;
  let vx = vx0;
  let vy = vy0;
  let w = w0;
  let spin = 0;
  let left = t;
  // The landing times don't depend on t: walk all three hops for them.
  const Ts: number[] = [];
  {
    let yy = y;
    let vv = vy;
    for (let hop = 0; hop <= BOUNCE.length; hop++) {
      const T = land(yy, vv);
      Ts.push(T);
      vv = -(vv + GRAVITY * T) * (BOUNCE[hop] ?? 0);
      yy = floor;
    }
  }
  const t1 = Ts[0];
  const tS = Ts.reduce((m, v) => m + v, 0);
  for (let hop = 0; hop <= BOUNCE.length; hop++) {
    const T = Ts[hop];
    if (left <= T) {
      return { x: x + vx * left, y: y + vy * left + 0.5 * GRAVITY * left * left, spin: spin + w * left, t1, tS };
    }
    x += vx * T;
    spin += w * T;
    const vLand = vy + GRAVITY * T;
    left -= T;
    y = floor;
    if (hop === BOUNCE.length) break;
    vy = -vLand * BOUNCE[hop];
    vx *= 0.72;
    w = -w * 0.45 + vx * 2.2; // a scuff on landing
  }
  // Sliding: decelerating to rest, the spin dying with it.
  const tStop = Math.abs(vx) / FRICTION;
  const ts = Math.min(left, tStop);
  const sx = vx * ts - Math.sign(vx) * 0.5 * FRICTION * ts * ts;
  const ws = w * 0.3;
  return { x: x + sx, y: floor, spin: spin + ws * ts - 0.5 * (ws / Math.max(1e-6, tStop)) * ts * ts, t1, tS };
};

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
  const n = 6 + Math.floor(R() * 3); // 6–8 per bot
  const a = BOTS[kind];
  const c = shellCentreLocal(kind);
  const centre = { x: c.x + a.cx, y: c.y + a.feetY };
  const fade = 1 - smooth(clamp((t - 33) / 12));
  const items: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const imp = freeShellPoint(kind, impacts[i % impacts.length]); // where makeCracks put the puncture
    const p0 = { x: imp.x + (R() - 0.5) * 14, y: imp.y + (R() - 0.5) * 10 };
    // Thrown up and outward, away from the bot's middle.
    let side = Math.sign(p0.x - centre.x + (R() - 0.5) * 30);
    if (side === 0) side = i % 2 ? 1 : -1;
    const vx = side * (1.6 + R() * 4.2);
    const vy = -(3.2 + R() * 4.4);
    const w0 = (R() < 0.5 ? -1 : 1) * (9 + R() * 14); // degrees per frame
    const rot0 = R() * 360;
    const flip0 = R() * Math.PI * 2;
    const flipW = (0.14 + R() * 0.2) * (R() < 0.5 ? -1 : 1);
    const size = 20 + R() * 15; // px across
    const nv = 4 + Math.floor(R() * 3);
    const off = R() * Math.PI * 2;
    const shape: XY[] = [];
    for (let v = 0; v < nv; v++) {
      const ang = off + (v / nv) * Math.PI * 2 + (R() - 0.5) * 0.6;
      const rr = (size / 2) * (0.6 + R() * 0.45);
      shape.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr * (0.62 + R() * 0.3) });
    }
    const restRot = (R() - 0.5) * 24; // lying almost flat, a little askew
    const lift = 0.6 + 0.4 * smooth(clamp(t / 1.5)); // grows out of the puncture
    const reach = Math.max(...shape.map((p) => Math.hypot(p.x, p.y)));
    const F0 = STAGE_Y - reach * 0.55;
    const f = fly(t, p0, vx, vy, w0, F0);

    // Its look: tumbling in the air (the flip shows the face, then the unglazed
    // inside), settling flat over its bounces — seen almost edge-on as it slides.
    const settle = smooth(clamp((t - f.t1) / Math.max(1, f.tS - f.t1)));
    const flip = Math.cos(flip0 + flipW * t * (1 - 0.7 * settle));
    const sxRaw = Math.sign(flip || 1) * Math.max(0.2, Math.abs(flip));
    const sx = (sxRaw + (1 - sxRaw) * settle) * lift;
    const sy = (1 - 0.6 * settle) * lift;
    const rot = ((rot0 + f.spin) * (1 - settle) + restRot * settle) * (Math.PI / 180);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const local = shape.map((p) => ({ x: p.x * sx, y: p.y * sy }));
    const world = local.map((p) => ({ x: p.x * cr - p.y * sr, y: p.x * sr + p.y * cr }));
    // Never below the stage line: from its first landing its lowest point (and
    // edge) rides the bounces on the line, and rests on it as it slides.
    const low = Math.max(...world.map((p) => p.y)) + THICK;
    const rest = STAGE_Y - low;
    const contact = smooth(clamp((t - f.t1) / 4));
    const cy = Math.min(rest, contact * (rest - (F0 - f.y)) + (1 - contact) * f.y);
    const cx = f.x;
    const W = world.map((p) => ({ x: p.x + cx, y: p.y + cy }));
    const d = pd(W);
    const glazed = sxRaw > 0 || settle > 0.5;
    if (silhouette) {
      items.push(<path key={i} d={d} fill={C.night} />);
      continue;
    }
    // Lit from above: the lower part of the face falls into shade.
    const shadeCut = clipHalf(W, 0, 1, cy + (glazed ? 0.15 : -0.1) * reach * sy);
    // The top-most edge catches the light.
    let hi = 0;
    let hiY = Infinity;
    for (let e = 0; e < W.length; e++) {
      const m = (W[e].y + W[(e + 1) % W.length].y) / 2;
      if (m < hiY) {
        hiY = m;
        hi = e;
      }
    }
    const h0 = W[hi];
    const h1 = W[(hi + 1) % W.length];
    items.push(
      <g key={i}>
        <path d={d} transform={`translate(0.6 ${THICK})`} fill={C.porcelainShade} />
        <path d={d} fill={glazed ? FACE : INNER} />
        {shadeCut.length > 2 ? <path d={pd(shadeCut)} fill={glazed ? FACE_SHADE : INNER_SHADE} /> : null}
        <path d={d} fill="none" stroke={C.porcelainShade} strokeWidth={1.3} strokeLinejoin="round" />
        {glazed ? (
          <path
            d={`M${(h0.x + (h1.x - h0.x) * 0.15).toFixed(2)} ${(h0.y + (h1.y - h0.y) * 0.15 + 1.4).toFixed(2)}L${(h0.x + (h1.x - h0.x) * 0.8).toFixed(2)} ${(h0.y + (h1.y - h0.y) * 0.8 + 1.4).toFixed(2)}`}
            stroke={C.cream}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        ) : null}
      </g>,
    );
  }
  return <g opacity={fade}>{items}</g>;
};
