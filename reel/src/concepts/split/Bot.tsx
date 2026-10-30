// Concept "split": the clean cut.
// Diablo's slash slices each bot along one straight line just above its eyes.
// The cap slides along the cut and tips open like a lid, white light pouring
// out of the gap; the eyes pop wide; the cap snaps back, then settles ajar: a
// dark cut, open at one end, light leaking out. The white seam welds it shut
// from the hinge to the open end, the cap clicks flush, a glint runs along the
// seam, and the bot keeps it as a clean white line.

import React from 'react';
import { C } from '../../theme';
import { clamp, easeInOutCubic, easeInQuart, easeOutCubic, lerp, ramp, settle, wobble } from '../../lib/anim';
import type { BotKind, ConceptBot } from '../_kit/types';
import { BodyArt, BUBBLE_TAIL, Mitt } from './Art';
import { Face, type EyeMode, type FaceState, type MouthMode } from './Face';
import { add, dot, fx, grow, pt, shapeD, type Pt } from './geom';
import { CUTS, OW, SPEC, mix, palette, type Pal } from './spec';
import { keys, Star } from './fx';

const D_REST = 5; // px the cap stays slid along the cut until the seam closes it
const S_REST = 1.2; // and lifted off it
const G_REST = 9.5; // and tipped open: the extra gap at the open end
const RIM = 2.4; // the dark cut face either side of the gap
const SEAM = 5; // the white seam
const SEAM_EDGE = 1.1; // its hairline ink edges

const PHASE: Record<BotKind, number> = { bubble: 0, cube: 2.1, orb: 4.2 };
const GLINT_OFF: Record<BotKind, number> = { bubble: 0, cube: 30, orb: 60 };
// Which end of the cut tips open (the other is the hinge): each bot leaks its
// light upwards and away from its neighbours in the row.
const OPEN: Record<BotKind, 'a' | 'b'> = { bubble: 'a', cube: 'b', orb: 'a' };

export const ConceptBotImpl: ConceptBot = ({ kind, frame, bg, mood = 'happy', look, blink = 0, hitT, seal, sealT }) => {
  const S = SPEC[kind];
  const cut = CUTS[kind];
  const pal = palette(bg);
  const id = `split-${kind}`;
  const hit = hitT !== undefined && hitT >= 0;
  const t = hit ? (hitT as number) : 0;
  const sl = hit ? clamp(seal ?? 0) : 0;
  const cel = hit && sl >= 1 && sealT !== undefined && sealT >= 0 ? sealT : undefined;
  const ph = (frame / 30) * ((2 * Math.PI) / 1.7) + PHASE[kind];
  const e = sl >= 1 ? 1 : easeInOutCubic(sl); // how far the weld has run, hinge → open end

  /* ── the cut: the cap slides d along it, lifts s, tips open by g at its open end ── */
  let d = 0;
  let s = 0;
  let g = 0;
  if (hit) {
    d = keys(t, [
      [0, 9],
      [1.5, 13],
      [5.5, 0],
      [11, D_REST],
    ]);
    s = keys(t, [
      [0, 5],
      [1.5, 6.5],
      [5.5, 0],
      [11, S_REST],
    ]);
    g = keys(t, [
      [0, 8],
      [1.5, 11],
      [5.5, 0],
      [11, G_REST],
    ]);
    d *= 1 - easeInQuart(sl); // the slide clicks back as the weld ends
    s *= 1 - e;
    g *= 1 - e; // the weld zips the wedge shut
  }
  const split = hit && sl < 1;
  const flash = hit ? Math.exp(-t / 2.4) : 0;
  // While it waits to be fixed, the light inside flares up every 40 frames.
  const flare = split && t > 12 ? keys((frame + GLINT_OFF[kind]) % 40, [[0, 0], [2, 1], [8, 0]]) * (1 - e) : 0;
  const open = clamp(g / G_REST); // how open the far end is (1 = at rest)
  const openA = OPEN[kind] === 'a';
  const hinge = openA ? cut.b : cut.a;
  const tip = openA ? cut.a : cut.b; // the end that tips open
  const out = { x: (tip.x - hinge.x) / cut.len, y: (tip.y - hinge.y) / cut.len }; // along the cut, towards the open end
  const turn = dot(cut.n, { x: -out.y, y: out.x }) > 0 ? 1 : -1;
  const th = (turn * g) / cut.len; // radians about the hinge
  const mv = { x: cut.u.x * d + cut.n.x * s, y: cut.u.y * d + cut.n.y * s };
  const M = (q: Pt): Pt => {
    const x = q.x - hinge.x;
    const y = q.y - hinge.y;
    return { x: hinge.x + x * Math.cos(th) - y * Math.sin(th) + mv.x, y: hinge.y + x * Math.sin(th) + y * Math.cos(th) + mv.y };
  };
  const gapAt = (q: Pt) => dot({ x: M(q).x - q.x, y: M(q).y - q.y }, cut.n);
  const mid = (q: Pt) => add(q, cut.n, gapAt(q) / 2); // the middle of the gap at q
  const ext = (q: Pt, k: number) => add(q, cut.u, k);
  const sa = mid(hinge); // the weld runs from the hinge to the open end
  const sb = mid(tip);
  const along = (k: number): Pt => ({ x: lerp(sa.x, sb.x, k), y: lerp(sa.y, sb.y, k) });
  const head = along(e);
  const mouth = mid(openA ? cut.ao : cut.bo); // the open end of the gap, on the outline

  /* ── the face ── */
  let eye: EyeMode = mood === 'worried' ? 'worried' : mood === 'proud' ? 'proud' : 'open';
  let mth: MouthMode = mood === 'worried' ? 'wavy' : mood === 'proud' ? 'grin' : 'smile';
  let bl = blink;
  let pupil = 1;
  let jitter = { x: 0, y: 0 };
  if (hit && t < 8) {
    eye = 'wide';
    mth = 'o';
    pupil = 0.62 + 0.38 * ramp(t, 1, 7);
    if (t < 5) jitter = { x: 1.4 * wobble(t * 4, 1), y: 1.1 * wobble(t * 4, 2) };
  }
  if (hit && t < 10) bl = Math.max(bl, keys(t, [[6.5, 0], [8, 1], [9.6, 0]]));
  if (cel !== undefined && cel < 13) {
    eye = 'joy';
    mth = 'grin';
  }
  let lk = look ?? { x: 0, y: 0 };
  if (mood === 'proud') lk = { x: lk.x, y: clamp(lk.y - 0.25, -1, 1) }; // chin up
  if (hit && sl > 0 && sl < 1) {
    // It watches the seam close.
    const v = { x: head.x, y: head.y - S.eyes.y };
    const m = Math.hypot(v.x, v.y) || 1;
    const w = ramp(sl, 0, 0.12) * (1 - ramp(sl, 0.9, 1));
    lk = { x: lerp(lk.x, v.x / m, w), y: lerp(lk.y, v.y / m, w) };
  }
  const fs: FaceState = { eye, mouth: mth, blink: bl, look: lk, pupil, jitter, blush: mood === 'worried' || eye === 'wide' ? 0.5 : 1 };

  /* ── the pose: idle, mood, the hit's recoil, the click, the celebration hop ── */
  let sx = 1;
  let sy = 1;
  let rot = 0;
  let tx = 0;
  let ty = 0;
  const br = Math.sin(ph);
  if (kind === 'orb') ty -= 3.5 * br;
  else {
    sy *= 1 + 0.012 * br;
    sx *= 1 - 0.006 * br;
  }
  if (mood === 'worried') {
    sy *= 0.975;
    sx *= 1.012;
  } else if (mood === 'proud') {
    sy *= 1.025;
    sx *= 0.988;
  }
  const recoil = hit ? 1 - settle(t, 0, 2.3, 0.38) : 0;
  if (hit) {
    const click = keys(t, [[4.5, 0], [6, 1], [8, 0]]); // the cap snapping back
    sy *= (1 - 0.07 * recoil) * (1 - 0.03 * click);
    sx *= (1 + 0.05 * recoil) * (1 + 0.02 * click);
    tx += cut.u.x * 5 * recoil;
    ty += cut.u.y * 5 * recoil;
    rot += 3.2 * recoil * Math.sign(cut.u.x);
  }
  if (cel !== undefined) {
    const amp = kind === 'orb' ? 0.6 : 1;
    const sq = (v: number) => 1 + (v - 1) * amp;
    sy *= sq(keys(cel, [
      [0, 1],
      [2, 0.9],
      [4, 1.08],
      [9, 1],
      [12, 1.03],
      [14, 0.93],
      [18, 1.02],
      [24, 1],
    ]));
    sx *= sq(keys(cel, [
      [0, 1],
      [2, 1.07],
      [4, 0.95],
      [9, 1],
      [12, 0.99],
      [14, 1.05],
      [18, 0.99],
      [24, 1],
    ]));
    if (cel > 3 && cel < 13) ty -= 20 * Math.sin((Math.PI * (cel - 3)) / 10);
  }
  const P = S.pivot;
  const pose = `translate(${fx(tx)} ${fx(ty)}) rotate(${fx(rot)} ${P.x} ${P.y}) translate(${P.x} ${P.y}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-P.x} ${-P.y})`;

  /* ── parts that act: the cube's antenna and status light ── */
  const whip = hit ? 1 - settle(t, 0, 2.8, 0.3) : 0;
  const sway = 3 * Math.sin(ph * 1.4) + 18 * whip;
  const led = split ? (Math.floor(frame / 6) % 2 === 0 ? pal.led : mix(pal.led, C.night, 0.45)) : pal.light;

  const art = <BodyArt kind={kind} id={id} pal={pal} sway={sway} led={led} />;
  const face = <Face kind={kind} st={fs} pal={pal} />;
  const rim = (
    <g clipPath={`url(#${id}-sil)`}>
      <path d={`M${pt(ext(cut.ao, -30))}L${pt(ext(cut.bo, 30))}`} fill="none" stroke={pal.ink} strokeWidth={2 * RIM} />
    </g>
  );
  const A0 = ext(cut.ao, -24);
  const B0 = ext(cut.bo, 24);
  const wedgePts = [add(A0, cut.n, -1.5), add(B0, cut.n, -1.5), M(add(B0, cut.n, 1.5)), M(add(A0, cut.n, 1.5))]
    .map((q) => `${fx(q.x)},${fx(q.y)}`)
    .join(' ');

  return (
    <g>
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={shapeD(S.body)} />
        </clipPath>
        {kind === 'bubble' ? (
          <clipPath id={`${id}-tail`}>
            <path d={BUBBLE_TAIL} />
          </clipPath>
        ) : null}
        <clipPath id={`${id}-sil`}>
          <path d={shapeD(grow(S.body, OW))} />
        </clipPath>
        <clipPath id={`${id}-hi`}>
          <polygon points={cut.hi} />
        </clipPath>
        <clipPath id={`${id}-lo`}>
          <polygon points={cut.lo} />
        </clipPath>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={3} />
        </filter>
      </defs>
      <Shadow kind={kind} lift={-ty} x={tx * 0.4} sx={sx} color={pal.ground} />
      <g transform={pose}>
        {split ? (
          <>
            {/* inside the gap: all light at the hit, then dark with a glowing thread */}
            <g clipPath={`url(#${id}-sil)`}>
              <polygon points={wedgePts} fill={t < 5.5 ? pal.light : pal.ink} />
              {t >= 5.5 ? (
                <path
                  d={`M${pt(mid(A0))}L${pt(mid(B0))}`}
                  fill="none"
                  stroke={pal.light}
                  strokeWidth={fx(1.9 * (0.85 + 0.15 * Math.sin(frame * 1.7)) + 1.6 * flare)}
                  strokeLinecap="round"
                />
              ) : null}
            </g>
            <g clipPath={`url(#${id}-lo)`}>
              {art}
              {face}
              {rim}
            </g>
            <g transform={`translate(${fx(mv.x)} ${fx(mv.y)}) rotate(${fx((th * 180) / Math.PI)} ${fx(hinge.x)} ${fx(hinge.y)})`}>
              <g clipPath={`url(#${id}-hi)`}>
                {art}
                {rim}
              </g>
            </g>
          </>
        ) : (
          <>
            {art}
            {face}
          </>
        )}

        {split && t >= 5.5 ? (
          <g clipPath={`url(#${id}-sil)`}>
            <path
              d={`M${pt(mid(A0))}L${pt(mid(B0))}`}
              fill="none"
              stroke={pal.light}
              strokeWidth={5 + 3 * flare}
              opacity={(0.5 * (0.8 + 0.2 * Math.sin(frame * 1.7)) + 0.4 * flare) * (1 - e)}
              filter={`url(#${id}-glow)`}
            />
          </g>
        ) : null}
        {split ? <Leak id={id} pal={pal} bg={bg} cut={cut} out={out} mouth={mouth} open={open} flash={Math.max(flash, flare)} frame={frame} t={t} weld={e} /> : null}

        {/* the hit: light bursts out of both ends of the cut */}
        {hit && t < 5
          ? [cut.ao, cut.bo].flatMap((q, i) => {
              const out = i === 0 ? -1 : 1;
              const env = keys(t, [
                [0, 0.85],
                [1.2, 1],
                [4.5, 0],
              ]);
              const c = mid(q);
              return [
                { phi: -0.5, L: 18 },
                { phi: 0, L: 30 },
                { phi: 0.5, L: 18 },
              ].map((r, j) => {
                const v = { x: out * (cut.u.x * Math.cos(r.phi) + cut.n.x * Math.sin(r.phi)), y: out * (cut.u.y * Math.cos(r.phi) + cut.n.y * Math.sin(r.phi)) };
                const w = { x: -v.y, y: v.x };
                const o = add(c, v, 5);
                const tip = add(o, v, r.L * env);
                const hw = (j === 1 ? 3.6 : 2.6) * (0.5 + 0.5 * env);
                const a = add(o, w, hw);
                const b = add(o, w, -hw);
                return <polygon key={`${i}${j}`} points={`${fx(a.x)},${fx(a.y)} ${fx(tip.x)},${fx(tip.y)} ${fx(b.x)},${fx(b.y)}`} fill={pal.fx} />;
              });
            })
          : null}
        {hit && t < 9
          ? [cut.ao, cut.bo].flatMap((q, i) => {
              const dir = i === 0 ? -1 : 1;
              const p = easeOutCubic(clamp(t / 9));
              const c = mid(q);
              return [-1, 1].map((sd, j) => {
                const ang = Math.atan2(cut.u.y * dir, cut.u.x * dir) + sd * 0.62;
                const dist = 10 + (j ? 22 : 30) * p;
                return (
                  <Star key={`${i}${j}`} x={c.x + Math.cos(ang) * dist} y={c.y + Math.sin(ang) * dist} r={(j ? 6.5 : 9) * (1 - p)} rot={t * 30} fill={pal.fx} />
                );
              });
            })
          : null}

        {/* the seam: welds the cut as `seal` runs, then stays */}
        {hit && e > 0 ? <Seam id={id} pal={pal} a={sa} b={sb} e={e} hot={split} cel={cel} /> : null}
        {split && e > 0 ? (
          <g>
            <circle cx={head.x} cy={head.y} r={13} fill={pal.light} opacity={0.85} filter={`url(#${id}-glow)`} />
            <Star x={head.x} y={head.y} r={17 + 2 * Math.sin(frame * 1.3)} rot={frame * 14} fill={pal.light} stroke={pal.ink} sw={2.6} />
            {[0, 1, 2].map((j) => {
              const k = (((frame * 0.37 + j / 3) % 1) + 1) % 1;
              const ang = -Math.PI / 2 + (j - 1) * 0.9 + 0.3 * Math.sin(frame + j);
              const dist = 16 + 22 * k;
              return <Star key={j} x={head.x + Math.cos(ang) * dist} y={head.y + Math.sin(ang) * dist} r={5.5 * (1 - k)} rot={45} fill={pal.light} stroke={pal.ink} sw={1.6} />;
            })}
          </g>
        ) : null}

        {/* the celebration: a glint runs along the fresh seam */}
        {cel !== undefined && cel < 14
          ? (() => {
              const G = along(ramp(cel, 1, 12, easeInOutCubic));
              return <Star x={G.x} y={G.y} r={13 * Math.sin(Math.PI * clamp((cel - 1) / 12))} rot={cel * 18} fill={pal.light} stroke={pal.ink} sw={2.2} />;
            })()
          : null}

        {/* the upgrade: now and then a small glint runs along the seam */}
        {cel !== undefined && cel >= 16
          ? (() => {
              const k = (frame + GLINT_OFF[kind]) % 90;
              if (k >= 16) return null;
              const G = along(ramp(k, 0, 16, easeInOutCubic));
              return <Star x={G.x} y={G.y} r={8 * Math.sin((Math.PI * k) / 16)} rot={k * 12} fill={pal.light} stroke={pal.ink} sw={1.8} />;
            })()
          : null}

        {kind === 'orb' ? <Mitts ph={ph} mood={mood} hitT={hit ? t : undefined} cel={cel} pal={pal} /> : null}
      </g>
    </g>
  );
};

/* ───────── light leaking out of the open end ───────── */

const Leak: React.FC<{
  id: string;
  pal: Pal;
  bg: 'white' | 'maroon';
  cut: (typeof CUTS)[BotKind];
  out: Pt; // along the cut towards the open end
  mouth: Pt;
  open: number;
  flash: number;
  frame: number;
  t: number;
  weld: number;
}> = ({ id, pal, bg, cut, out, mouth, open, flash, frame, t, weld }) => {
  if (open < 0.02) return null;
  // Out of the gap and up: between the cut's own direction and its normal.
  const dir = (phi: number): Pt => ({ x: out.x * Math.cos(phi) + cut.n.x * Math.sin(phi), y: out.y * Math.cos(phi) + cut.n.y * Math.sin(phi) });
  const rays = [
    { phi: 0.3, L: 10 },
    { phi: 0.75, L: 14 },
    { phi: 1.2, L: 9 },
  ];
  const up = dir(0.95);
  return (
    <g>
      {bg === 'maroon' ? (
        <ellipse
          cx={mouth.x}
          cy={mouth.y}
          rx={9 + 10 * flash}
          ry={4 + 4 * flash}
          transform={`rotate(${fx((Math.atan2(up.y, up.x) * 180) / Math.PI)} ${fx(mouth.x)} ${fx(mouth.y)})`}
          fill={pal.light}
          opacity={0.75 * open}
          filter={`url(#${id}-glow)`}
        />
      ) : null}
      {rays.map((r, i) => {
        const v = dir(r.phi);
        const w = { x: -v.y, y: v.x };
        const L = r.L * open * (0.82 + 0.18 * Math.sin(frame * 0.9 + i * 2.1)) * (1 + 0.45 * flash);
        const o = add(mouth, v, 4);
        const tipP = add(o, v, L);
        const a = add(o, w, 2.2);
        const b = add(o, w, -2.2);
        return <polygon key={i} points={`${fx(a.x)},${fx(a.y)} ${fx(tipP.x)},${fx(tipP.y)} ${fx(b.x)},${fx(b.y)}`} fill={pal.fx} />;
      })}
      {/* a few white pixels float up out of the gap: the bot leaking data */}
      {t > 10 && weld < 0.5
        ? [0, 1, 2].map((j) => {
            const age = ((frame + j * 13) % 39) / 39;
            const p = add(add(mouth, up, 7 + 15 * age), { x: -up.y, y: up.x }, (j - 1) * 6 + 2.5 * Math.sin(frame * 0.21 + j * 2));
            const z = 5 * (1 - age) * open;
            return z > 0.6 ? <rect key={j} x={fx(p.x - z / 2)} y={fx(p.y - z / 2)} width={fx(z)} height={fx(z)} fill={pal.fx} /> : null;
          })
        : null}
    </g>
  );
};

/* ───────── the white seam ───────── */

// A white bead with hairline ink edges, drawn from a to b as far as `e`; while
// welding, the last stretch behind the spark is thicker (hot), and at the
// click it swells for a moment.
const Seam: React.FC<{ id: string; pal: Pal; a: Pt; b: Pt; e: number; hot: boolean; cel: number | undefined }> = ({ id, pal, a, b, e, hot, cel }) => {
  const d = `M${pt(a)}L${pt(b)}`;
  const dash = { pathLength: 1, strokeDasharray: `${e} 2`, fill: 'none', strokeLinecap: 'round' as const };
  const W = SEAM + (cel !== undefined ? 3 * Math.exp(-cel / 3) : 0);
  const hotLen = Math.min(e, 0.16);
  return (
    <g clipPath={`url(#${id}-body)`}>
      <path d={d} {...dash} stroke={pal.ink} strokeWidth={W + 2 * SEAM_EDGE} />
      <path d={d} {...dash} stroke={pal.light} strokeWidth={W} />
      {hot ? (
        <>
          <path d={d} {...dash} strokeDasharray={`${hotLen} 2`} strokeDashoffset={-(e - hotLen)} stroke={pal.ink} strokeWidth={W + 4 + 2.4} />
          <path d={d} {...dash} strokeDasharray={`${hotLen} 2`} strokeDashoffset={-(e - hotLen)} stroke={pal.light} strokeWidth={W + 4} />
        </>
      ) : null}
    </g>
  );
};

/* ───────── the flat ground shadow ───────── */

const Shadow: React.FC<{ kind: BotKind; lift: number; x: number; sx: number; color: string }> = ({ kind, lift, x, sx, color }) => {
  const S = SPEC[kind];
  const k = clamp(1 - Math.max(0, lift) / 240, 0.45, 1.1);
  return <ellipse cx={x} cy={-S.shadow.ry * k} rx={S.shadow.rx * k * sx} ry={S.shadow.ry * k} fill={color} />;
};

/* ───────── the orb's mitts ───────── */

const Mitts: React.FC<{ ph: number; mood: string; hitT: number | undefined; cel: number | undefined; pal: Pal }> = ({ ph, mood, hitT, cel, pal }) => {
  const rest = mood === 'worried' ? { x: 70, y: -86 } : mood === 'proud' ? { x: 101, y: -122 } : { x: 97, y: -86 };
  let p = rest;
  if (hitT !== undefined && hitT < 14) {
    const k = ramp(hitT, 4, 14, easeInOutCubic);
    p = { x: lerp(100, rest.x, k), y: lerp(-158, rest.y, k) };
  }
  if (cel !== undefined && cel < 24) {
    const k = ramp(cel, 14, 24, easeInOutCubic);
    const up = ramp(cel, 0, 4, easeOutCubic);
    p = { x: lerp(lerp(rest.x, 96, up), rest.x, k), y: lerp(lerp(rest.y, -186, up), rest.y, k) };
  }
  return (
    <g>
      {([-1, 1] as const).map((sd) => (
        <Mitt key={sd} side={sd} x={sd * p.x} y={p.y + 3 * Math.sin(ph * 1.3 + sd)} pal={pal} />
      ))}
    </g>
  );
};
