// Faces: one expression state (mood, hit reaction, blink, gaze) drawn two ways:
// printed sticker eyes for the bubble and the orb, a glowing screen face for the cube.

import React from 'react';
import { clamp, lerp } from '../../lib/anim';
import type { Mood } from '../_kit/types';
import { P } from './palette';
import { pt, v2, type V } from './geom';

export type MouthKind = 'smile' | 'grin' | 'wobble' | 'o' | 'zig';
export interface FaceState {
  expr: 'open' | 'wince' | 'shock';
  lidTop: number; // 0..1 of the eye's height, from the top
  lidTilt: number; // degrees, + = outer corner lower
  lidBot: number; // 0..1 from the bottom (the smile squint)
  pupil: number; // pupil scale
  eyeScale: number;
  brow: number; // 0 none, 1 worried (inner ends up), 2 raised
  mouth: MouthKind;
  cheeks: number;
  look: V;
  blink: number;
}

const MOODS: Record<Mood, Omit<FaceState, 'look' | 'blink' | 'expr'>> = {
  happy: { lidTop: 0, lidTilt: 0, lidBot: 0, pupil: 1, eyeScale: 1, brow: 0, mouth: 'smile', cheeks: 1 },
  worried: { lidTop: 0.2, lidTilt: 13, lidBot: 0, pupil: 0.78, eyeScale: 1, brow: 1, mouth: 'wobble', cheeks: 0 },
  proud: { lidTop: 0, lidTilt: 0, lidBot: 0.44, pupil: 1.05, eyeScale: 1, brow: 0, mouth: 'grin', cheeks: 1 },
};

// The face for this frame. hitT drives the cartoon reaction: a wince (> <),
// then a wide-eyed "whoa", then back to the mood the reel asks for.
export const faceState = (mood: Mood, look: V, blink: number, hitT: number | undefined, single = false): FaceState => {
  const m = single && mood === 'worried' ? { ...MOODS.worried, lidTop: 0, pupil: 0.62 } : MOODS[mood];
  const base: FaceState = { ...m, expr: 'open', look, blink };
  if (hitT === undefined || hitT >= 12) return base;
  if (hitT < 5) return { ...base, expr: 'wince', mouth: 'zig', cheeks: 0, brow: 0, blink: 0 };
  // "whoa": eyes pop wide, pupils pin, then ease back into the mood.
  const e = clamp((hitT - 9) / 3);
  return {
    ...base,
    expr: e < 0.5 ? 'shock' : 'open',
    lidTop: lerp(0, m.lidTop, e),
    lidBot: lerp(0, m.lidBot, e),
    pupil: lerp(0.52, m.pupil, e),
    eyeScale: lerp(1.12, 1, e),
    brow: e < 0.5 ? 2 : m.brow,
    mouth: e < 0.5 ? 'o' : m.mouth,
    cheeks: 0,
    blink: 0,
  };
};

const SW = 5; // face line weight

/* ───────── mouths ───────── */
export const Mouth: React.FC<{ id: string; at: V; w: number; kind: MouthKind; ink: string; fill: string; tongue?: string }> = ({
  id,
  at,
  w,
  kind,
  ink,
  fill,
  tongue,
}) => {
  const hw = w / 2;
  if (kind === 'wobble') {
    return (
      <path
        transform={`translate(${pt(at)})`}
        d={`M${-hw} 1q${hw / 4} -7 ${hw / 2} 0t${hw / 2} 0t${hw / 2} 0t${hw / 2} 0`}
        fill="none"
        stroke={ink}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (kind === 'zig') {
    const z = hw * 0.85;
    return (
      <path
        transform={`translate(${pt(at)})`}
        d={`M${-z} 2L${-z / 2} -4L0 2L${z / 2} -4L${z} 2`}
        fill="none"
        stroke={ink}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (kind === 'o') return <ellipse cx={at.x} cy={at.y + 2} rx={w * 0.19} ry={w * 0.25} fill={fill} stroke={fill === ink ? 'none' : ink} strokeWidth={SW} />;
  const g = kind === 'grin' ? 1.32 : 1;
  const W = hw * g;
  const H = w * 0.6 * g;
  const d = `M${-W} -3Q0 3 ${W} -3C${W * 0.96} ${H} ${-W * 0.96} ${H} ${-W} -3Z`;
  return (
    <g transform={`translate(${pt(at)})`}>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={fill} stroke={ink} strokeWidth={fill === ink ? 0 : SW} strokeLinejoin="round" />
      {tongue ? <ellipse clipPath={`url(#${id})`} cx={W * 0.12} cy={H * 0.78} rx={W * 0.5} ry={H * 0.36} fill={tongue} /> : null}
    </g>
  );
};

/* ───────── printed sticker eyes (bubble, orb) ───────── */
// side: −1 the bot's right eye (on our left), +1 the other, 0 a single centred eye.
export const PrintedEye: React.FC<{ id: string; c: V; rx: number; ry: number; pupilR: number; st: FaceState; side: -1 | 0 | 1; lid: string }> = ({
  id,
  c,
  rx: rx0,
  ry: ry0,
  pupilR,
  st,
  side,
  lid,
}) => {
  if (st.expr === 'wince') return <WinceEye c={c} rx={rx0} ry={ry0} side={side} />;
  const b = clamp(st.blink);
  const rx = rx0 * st.eyeScale;
  if (b > 0.78) {
    // closed: one lash curve (a contented "︵" when the eye was smiling)
    const up = st.lidBot > 0.3 ? -1 : 1;
    return (
      <path
        transform={`translate(${pt(c)})`}
        d={`M${-rx * 0.92} ${-up * 3}Q0 ${up * ry0 * 0.42} ${rx * 0.92} ${-up * 3}`}
        fill="none"
        stroke={P.ink}
        strokeWidth={SW + 1}
        strokeLinecap="round"
      />
    );
  }
  // a blink squashes the eye shut
  const ry = ry0 * st.eyeScale * (1 - 0.8 * b);
  const pr = pupilR * st.pupil;
  const mx = Math.max(rx * 0.22, rx - pr - 2);
  const my = Math.max(ry * 0.22, ry - pr - 2);
  const px = clamp(st.look.x, -1, 1) * mx;
  const py = clamp(st.look.y, -1, 1) * my;
  const top = st.lidTop;
  const yTop = -ry + 2 * ry * top;
  const yBot = ry - 2 * ry * st.lidBot;
  const tilt = side === 0 ? 0 : side * st.lidTilt;
  return (
    <g transform={`translate(${pt(c)})`}>
      <clipPath id={id}>
        <ellipse rx={rx} ry={ry} />
      </clipPath>
      <ellipse rx={rx} ry={ry} fill={P.white} />
      <g clipPath={`url(#${id})`}>
        <circle cx={px} cy={py} r={pr} fill={P.ink} />
        <circle cx={px - pr * 0.36} cy={py - pr * 0.4} r={pr * 0.36} fill={P.white} />
        <circle cx={px + pr * 0.42} cy={py + pr * 0.36} r={pr * 0.15} fill={P.white} />
        {st.lidBot > 0.001 ? (
          <path
            d={`M${-rx * 1.6} ${yBot + ry * 0.55}Q0 ${yBot - ry * 0.42} ${rx * 1.6} ${yBot + ry * 0.55}L${rx * 1.6} ${ry * 2}L${-rx * 1.6} ${ry * 2}Z`}
            fill={lid}
            stroke={P.ink}
            strokeWidth={SW}
          />
        ) : null}
        {top > 0.001 ? (
          <g transform={`rotate(${tilt})`}>
            <rect x={-rx * 2} y={-ry * 2.2} width={rx * 4} height={ry * 2.2 + yTop} fill={lid} />
            <line x1={-rx * 2} y1={yTop} x2={rx * 2} y2={yTop} stroke={P.ink} strokeWidth={SW} />
          </g>
        ) : null}
      </g>
      <ellipse rx={rx} ry={ry} fill="none" stroke={P.ink} strokeWidth={SW} />
    </g>
  );
};

// The cartoon wince: > < (or a squeezed single eye with tension ticks).
const WinceEye: React.FC<{ c: V; rx: number; ry: number; side: -1 | 0 | 1 }> = ({ c, rx, ry, side }) => {
  const s = { stroke: P.ink, strokeWidth: SW + 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  if (side === 0) {
    // one eye squeezed shut: a tight arc with crinkle ticks at both corners
    return (
      <g transform={`translate(${pt(c)})`} {...s}>
        <path d={`M${-rx * 0.82} ${ry * 0.12}Q0 ${-ry * 0.62} ${rx * 0.82} ${ry * 0.12}`} />
        <path d={`M${-rx * 1.0} ${-ry * 0.32}L${-rx * 1.22} ${-ry * 0.5}M${-rx * 1.04} ${ry * 0.3}L${-rx * 1.28} ${ry * 0.36}`} strokeWidth={SW} />
        <path d={`M${rx * 1.0} ${-ry * 0.32}L${rx * 1.22} ${-ry * 0.5}M${rx * 1.04} ${ry * 0.3}L${rx * 1.28} ${ry * 0.36}`} strokeWidth={SW} />
      </g>
    );
  }
  const k = -side; // point toward the nose
  return (
    <path
      transform={`translate(${pt(c)})`}
      d={`M${-k * rx * 0.75} ${-ry * 0.62}L${k * rx * 0.7} 0L${-k * rx * 0.75} ${ry * 0.62}`}
      {...s}
    />
  );
};

export const Brow: React.FC<{ c: V; rx: number; ry: number; side: -1 | 0 | 1; kind: number; ink: string }> = ({ c, rx, ry, side, kind, ink }) => {
  if (kind === 0) return null;
  const y = c.y - ry - (kind === 2 ? 15 : 9);
  const s = { fill: 'none', stroke: ink, strokeWidth: SW + 1, strokeLinecap: 'round' as const };
  if (side === 0) {
    const lift = kind === 2 ? 4 : 13;
    return <path d={`M${c.x - rx * 0.75} ${y + 2}Q${c.x} ${y - lift} ${c.x + rx * 0.75} ${y + 2}`} {...s} />;
  }
  if (kind === 2) {
    const a = v2(c.x - rx * 0.75, y + 3);
    const b = v2(c.x + rx * 0.75, y + 3);
    return <path d={`M${pt(a)}Q${c.x} ${y - 9} ${pt(b)}`} {...s} />;
  }
  const inner = v2(c.x - side * rx * 0.55, y - 7);
  const outer = v2(c.x + side * rx * 0.8, y + 3);
  return <path d={`M${pt(inner)}L${pt(outer)}`} {...s} />;
};

/* ───────── the cube's screen face ───────── */
export const ScreenFace: React.FC<{ eyes: V[]; rx: number; ry: number; mouth: V; mouthW: number; st: FaceState; id: string }> = ({
  eyes,
  rx,
  ry,
  mouth,
  mouthW,
  st,
  id,
}) => {
  const glow = P.white;
  const lx = clamp(st.look.x, -1, 1) * 7;
  const ly = clamp(st.look.y, -1, 1) * 5;
  const s = { stroke: glow, strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <g>
      {eyes.map((c0, i) => {
        const side = i === 0 ? -1 : 1;
        const c = v2(c0.x + lx, c0.y + ly);
        if (st.expr === 'wince') {
          const k = -side;
          return <path key={i} transform={`translate(${pt(c)})`} d={`M${-k * 9} -12L${k * 9} 0L${-k * 9} 12`} {...s} strokeWidth={6.5} />;
        }
        if (st.expr === 'shock') return <circle key={i} cx={c.x} cy={c.y} r={11.5} {...s} strokeWidth={5.5} />;
        const sc = st.eyeScale;
        const h = 2 * ry * sc * Math.max(0.12, 1 - clamp(st.blink));
        const w = 2 * rx * sc;
        const top = st.lidTop;
        const tilt = side * st.lidTilt;
        return (
          <g key={i} transform={`translate(${pt(c)})`}>
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(w, h) / 2} fill={glow} />
            {top > 0.01 && h > 8 ? <rect transform={`rotate(${tilt})`} x={-w * 1.2} y={-h * 1.6} width={w * 2.4} height={h * 1.1 + h * top} fill={P.screen} /> : null}
            {st.lidBot > 0.01 && h > 8 ? <ellipse cx={0} cy={h * 0.5 + h * 0.62 - h * st.lidBot * 1.15} rx={w * 1.05} ry={h * 0.62} fill={P.screen} /> : null}
          </g>
        );
      })}
      {st.cheeks > 0.01
        ? eyes.map((c0, i) => (
            <rect key={`c${i}`} x={c0.x + lx * 0.5 + (i ? 6 : -22)} y={c0.y + ry + 7 + ly * 0.5} width={16} height={6} rx={3} fill={P.cheek} opacity={st.cheeks} />
          ))
        : null}
      <Mouth
        id={id}
        at={v2(mouth.x + lx * 0.6, mouth.y + ly * 0.5)}
        w={mouthW}
        kind={st.expr === 'shock' ? 'o' : st.mouth}
        ink={glow}
        fill={st.mouth === 'grin' || st.mouth === 'smile' ? glow : P.screen}
      />
    </g>
  );
};
