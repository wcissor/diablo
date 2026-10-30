// Faces: big bean eyes with two highlights and a mouth, so every mood reads at
// phone size. The cube's face is light on its dark screen. Eye shapes are
// computed polygons (clipped ellipses), so no per-instance SVG ids are needed.

import React from 'react';
import type { BotKind } from '../_kit/types';
import { clipPoly, ellipsePts, fx, polyD, type Pt } from './geom';
import { SPEC, type Pal } from './spec';

export type EyeMode = 'open' | 'worried' | 'proud' | 'joy' | 'wide';
export type MouthMode = 'smile' | 'grin' | 'wavy' | 'o';

export interface FaceState {
  eye: EyeMode;
  mouth: MouthMode;
  blink: number; // 0..1
  look: Pt; // −1..1
  pupil: number; // wide eyes: pupil size (1 = normal)
  jitter: Pt; // px, a tremble of the wide eyes' pupils
  blush: number; // 0..1
}

interface Ink {
  fg: string; // the eyes and mouth
  bg: string; // what the face is drawn on (the body, or the cube's screen)
  hi: string | null; // the eyes' highlights
  tongue: string | null;
  glow: string; // the screen's glow around light features
  light: string; // white: the wide eyes' whites and glints
}

const lerpPt = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

const Eye: React.FC<{ cx: number; cy: number; rx: number; ry: number; side: 1 | -1; st: FaceState; c: Ink; screen: boolean }> = ({
  cx,
  cy,
  rx,
  ry,
  side,
  st,
  c,
  screen,
}) => {
  const k = Math.max(0.08, 1 - st.blink);
  const lineW = screen ? 5 : 5.5;
  if (st.eye === 'joy') {
    const d = `M${fx(cx - rx * 0.95)} ${fx(cy + ry * 0.32)}Q${fx(cx)} ${fx(cy - ry * 1.05)} ${fx(cx + rx * 0.95)} ${fx(cy + ry * 0.32)}`;
    return (
      <g>
        {screen ? <path d={d} fill="none" stroke={c.glow} strokeWidth={lineW + 9} strokeLinecap="round" /> : null}
        <path d={d} fill="none" stroke={c.fg} strokeWidth={lineW + 0.5} strokeLinecap="round" />
      </g>
    );
  }
  if (st.blink > 0.86) {
    const d = `M${fx(cx - rx)} ${fx(cy + 1)}Q${fx(cx)} ${fx(cy + ry * 0.4)} ${fx(cx + rx)} ${fx(cy + 1)}`;
    return (
      <g>
        {screen ? <path d={d} fill="none" stroke={c.glow} strokeWidth={lineW + 9} strokeLinecap="round" /> : null}
        <path d={d} fill="none" stroke={c.fg} strokeWidth={lineW} strokeLinecap="round" />
      </g>
    );
  }
  if (st.eye === 'wide') {
    const R = ry * 1.1;
    const reach = R - 7.5;
    const px = cx + st.look.x * reach + st.jitter.x;
    const py = cy + st.look.y * reach + st.jitter.y;
    const pr = 5.4 * st.pupil;
    return screen ? (
      <g>
        <ellipse cx={cx} cy={cy} rx={R} ry={R * k} fill={c.bg} stroke={c.fg} strokeWidth={4.5} />
        <circle cx={px} cy={py} r={pr} fill={c.fg} />
      </g>
    ) : (
      <g>
        <ellipse cx={cx} cy={cy} rx={R} ry={R * k} fill={c.light} stroke={c.fg} strokeWidth={3.6} />
        <circle cx={px} cy={py} r={pr} fill={c.fg} />
        <circle cx={px + pr * 0.38} cy={py - pr * 0.38} r={pr * 0.32} fill={c.light} />
      </g>
    );
  }
  const ryk = ry * k;
  let d: string;
  let hi: Pt = { x: cx + rx * 0.3, y: cy - ryk * 0.33 };
  if (st.eye === 'worried') {
    // The outer top is cut by a slanted lid: inner corner high, outer corner low.
    const O = { x: cx + side * rx * 1.15, y: cy - ryk * 0.12 };
    const I = { x: cx - side * rx * 1.15, y: cy - ryk * 0.98 };
    const g = (p: Pt) => p.y - (O.y + ((I.y - O.y) * (p.x - O.x)) / (I.x - O.x));
    d = polyD(clipPoly(ellipsePts(cx, cy, rx, ryk), g));
    hi = { x: cx + rx * 0.24, y: cy + ryk * 0.02 };
  } else if (st.eye === 'proud') {
    // Smiling eyes: the cheek pushes up a concave lower lid.
    const L = { x: cx - rx * 0.96, y: cy + ryk * 0.3 };
    const R = { x: cx + rx * 0.96, y: cy + ryk * 0.3 };
    d = `M${fx(L.x)} ${fx(L.y)}A${fx(rx)} ${fx(ryk)} 0 1 1 ${fx(R.x)} ${fx(R.y)}Q${fx(cx)} ${fx(cy - ryk * 0.22)} ${fx(L.x)} ${fx(L.y)}Z`;
    hi = { x: cx + rx * 0.3, y: cy - ryk * 0.42 };
  } else {
    d = '';
  }
  const hiR = rx * (st.eye === 'worried' ? 0.32 : 0.36);
  const lo = lerpPt({ x: cx - rx * 0.34, y: cy + ryk * 0.4 }, { x: cx, y: cy }, st.eye === 'proud' ? 0.6 : 0);
  return (
    <g>
      {screen ? (
        d ? (
          <path d={d} fill={c.glow} stroke={c.glow} strokeWidth={9} strokeLinejoin="round" />
        ) : (
          <ellipse cx={cx} cy={cy} rx={rx + 4.5} ry={ryk + 4.5} fill={c.glow} />
        )
      ) : null}
      {d ? <path d={d} fill={c.fg} /> : <ellipse cx={cx} cy={cy} rx={rx} ry={ryk} fill={c.fg} />}
      {c.hi && k > 0.45 ? (
        <>
          <circle cx={hi.x} cy={hi.y} r={hiR} fill={c.hi} />
          {st.eye !== 'proud' ? <circle cx={lo.x} cy={lo.y} r={rx * 0.15} fill={c.hi} /> : null}
        </>
      ) : null}
    </g>
  );
};

// A "D" mouth: flat-ish top, round bottom, w = half width, h = depth.
const dMouth = (w: number, h: number) =>
  `M${-w} 0C${fx(-w * 0.5)} ${fx(h * 0.16)} ${fx(w * 0.5)} ${fx(h * 0.16)} ${w} 0C${fx(w * 0.96)} ${fx(h * 0.8)} ${fx(w * 0.52)} ${h} 0 ${h}C${fx(-w * 0.52)} ${h} ${fx(-w * 0.96)} ${fx(h * 0.8)} ${-w} 0Z`;
const tongue = (w: number, h: number) =>
  `M${fx(-w * 0.55)} ${fx(h * 0.83)}Q0 ${fx(h * 0.36)} ${fx(w * 0.55)} ${fx(h * 0.83)}Q${fx(w * 0.3)} ${fx(h * 0.98)} 0 ${fx(h * 0.98)}Q${fx(-w * 0.3)} ${fx(h * 0.98)} ${fx(-w * 0.55)} ${fx(h * 0.83)}Z`;

const Mouth: React.FC<{ x: number; y: number; mode: MouthMode; c: Ink; screen: boolean }> = ({ x, y, mode, c, screen }) => {
  const tr = `translate(${fx(x)} ${fx(y)})`;
  if (mode === 'wavy') {
    return <path transform={tr} d="M-12 2C-8 -3 -4 -3 0 1C4 5 8 5 12 0" fill="none" stroke={c.fg} strokeWidth={screen ? 4.5 : 4.6} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mode === 'o') {
    return screen ? (
      <ellipse transform={tr} cx={0} cy={3} rx={7} ry={8.5} fill="none" stroke={c.fg} strokeWidth={4.2} />
    ) : (
      <ellipse transform={tr} cx={0} cy={3} rx={6.8} ry={8.8} fill={c.fg} />
    );
  }
  if (screen && mode === 'smile') {
    return (
      <g transform={tr}>
        <path d="M-15 -2Q0 14 15 -2" fill="none" stroke={c.glow} strokeWidth={14} strokeLinecap="round" />
        <path d="M-15 -2Q0 14 15 -2" fill="none" stroke={c.fg} strokeWidth={5.2} strokeLinecap="round" />
      </g>
    );
  }
  const [w, h] = mode === 'grin' ? [screen ? 18 : 20, screen ? 15 : 20] : [14, 15];
  return (
    <g transform={tr}>
      <path d={dMouth(w, h)} fill={c.fg} strokeLinejoin="round" />
      {c.tongue ? <path d={tongue(w, h)} fill={c.tongue} /> : null}
    </g>
  );
};

export const Face: React.FC<{ kind: BotKind; st: FaceState; pal: Pal }> = ({ kind, st, pal }) => {
  const S = SPEC[kind];
  const screen = kind === 'cube';
  const c: Ink = screen
    ? { fg: pal.light, bg: pal.screen, hi: null, tongue: null, glow: pal.bezel, light: pal.light }
    : { fg: pal.ink, bg: pal.body, hi: pal.light, tongue: pal.tongue, glow: pal.body, light: pal.light };
  const lx = st.look.x * S.look.x;
  const ly = st.look.y * S.look.y;
  const E = S.eyes;
  return (
    <g>
      {S.blush && st.blush > 0.01
        ? [-1, 1].map((sd) => (
            <ellipse
              key={sd}
              cx={sd * S.blush!.dx + lx * 0.45}
              cy={S.blush!.y + ly * 0.35}
              rx={S.blush!.rx}
              ry={S.blush!.ry}
              fill={pal.blush}
              opacity={st.blush}
            />
          ))
        : null}
      {([-1, 1] as const).map((sd) => (
        <Eye key={sd} cx={sd * E.dx + lx} cy={E.y + ly} rx={E.rx} ry={E.ry} side={sd} st={st} c={c} screen={screen} />
      ))}
      <Mouth x={S.mouth.x + lx * 0.6} y={S.mouth.y + ly * 0.5} mode={st.mouth} c={c} screen={screen} />
    </g>
  );
};
