// The cube: a rounded cube seen slightly from above, top face visible, a short
// antenna with a ball tip, a night screen with two square eyes. Local
// coordinates (bottom on 0).

import React from 'react';
import { C } from '../../theme';
import { HatchPattern } from '../../stage/Hatch';
import { mix } from '../../stage/Stage';
import { CUBE, antennaTip } from './shapes';
import { polyD, shift } from './geom';
import { CrackDefs } from './CrackLayer';
import type { Resolved } from './pose';
import { closedOf } from './Eye';

const SIL_D = polyD(CUBE.silhouette);
const TOP_D = polyD(CUBE.topFace);
const SCREEN_D = polyD(CUBE.screen);
const BIG = 'M-112 -250H112V12H-112Z';
const SHADE_D = BIG + polyD(shift(CUBE.silhouette, CUBE.shadeOffset.x, CUBE.shadeOffset.y));

const Antenna: React.FC<{ id: string; sway: number; sil: boolean }> = ({ id, sway, sil }) => {
  const b = CUBE.antennaBase;
  const tip = antennaTip(sway);
  if (sil) {
    return (
      <g fill={C.night}>
        <line x1={b.x} y1={b.y} x2={tip.x} y2={tip.y} stroke={C.night} strokeWidth={7} strokeLinecap="round" />
        <circle cx={tip.x} cy={tip.y} r={CUBE.ballR + 1} />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx={b.x} cy={b.y + 1} rx={11} ry={4.6} fill={C.porcelainShade} />
      <line x1={b.x} y1={b.y} x2={tip.x} y2={tip.y} stroke={C.porcelainShade} strokeWidth={7.5} strokeLinecap="round" />
      <line x1={b.x} y1={b.y - 1} x2={tip.x} y2={tip.y} stroke={mix(C.porcelain, C.porcelainShade, 0.25)} strokeWidth={3.5} strokeLinecap="round" />
      <g transform={`translate(${tip.x} ${tip.y})`}>
        <circle r={CUBE.ballR} fill={`url(#${id}-ball)`} stroke={C.porcelainShade} strokeWidth={2} />
        <path d="M-6.2 -3.2 A7 7 0 0 1 -2.4 -6.6" fill="none" stroke={C.cream} strokeWidth={3} strokeLinecap="round" />
      </g>
    </g>
  );
};

export const CubeArt: React.FC<{ id: string; r: Resolved; sil: boolean; cracks: React.ReactNode; warm?: React.ReactNode }> = ({ id, r, sil, cracks, warm }) => {
  // Idle: a slow breath that lifts the top 3 px (the bottom stays planted).
  const breathe = `scale(1 ${1 - r.bob / 238})`;
  const sway = r.sway * 2.2 - r.lean * 0.9;
  if (sil) {
    return (
      <g transform={breathe} fill={C.night}>
        <path d={SIL_D} stroke={C.night} strokeWidth={4} strokeLinejoin="round" />
        <Antenna id={id} sway={sway} sil />
      </g>
    );
  }
  const face = { x: r.look.x * 3, y: r.look.y * 2.5 };
  return (
    <g transform={breathe}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={SIL_D} />
        </clipPath>
        <clipPath id={`${id}-screenclip`}>
          <path d={SCREEN_D} />
        </clipPath>
        <radialGradient id={`${id}-gloss`} gradientUnits="userSpaceOnUse" cx={-62} cy={-205} r={300}>
          <stop offset="0" stopColor={C.porcelain} />
          <stop offset="0.4" stopColor={mix(C.porcelain, C.porcelainShade, 0.18)} />
          <stop offset="0.75" stopColor={mix(C.porcelain, C.porcelainShade, 0.5)} />
          <stop offset="1" stopColor={mix(C.porcelain, C.porcelainShade, 0.8)} />
        </radialGradient>
        <linearGradient id={`${id}-top`} gradientUnits="userSpaceOnUse" x1={-40} y1={-238} x2={20} y2={-200}>
          <stop offset="0" stopColor={C.porcelain} />
          <stop offset="1" stopColor={C.cream} />
        </linearGradient>
        <radialGradient id={`${id}-ball`} cx="0.38" cy="0.34" r="0.7">
          <stop offset="0" stopColor={C.cream} />
          <stop offset="0.55" stopColor={C.porcelain} />
          <stop offset="1" stopColor={mix(C.porcelain, C.porcelainShade, 0.7)} />
        </radialGradient>
        <linearGradient id={`${id}-glass`} gradientUnits="userSpaceOnUse" x1={0} y1={-170} x2={0} y2={-48}>
          <stop offset="0" stopColor={mix(C.night, C.maroon, 0.35)} />
          <stop offset="1" stopColor={C.night} />
        </linearGradient>
        <HatchPattern id={`${id}-hatch`} color={C.porcelainShade} />
        <CrackDefs id={id} />
      </defs>

      <path d={SIL_D} fill="none" stroke={C.porcelainShade} strokeWidth={4} strokeLinejoin="round" />
      <path d={SIL_D} fill={`url(#${id}-gloss)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <path d={SHADE_D} fillRule="evenodd" fill={`url(#${id}-hatch)`} />
        <path d={TOP_D} fill={`url(#${id}-top)`} />
        {/* The rounded front-top edge catching the overhead light, and the one crisp highlight streak. */}
        <path d="M-82 -199.5 L60 -199.5" stroke={C.cream} strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" />
        <path d="M-86 -182 L-86 -124" stroke={C.cream} strokeWidth={8} strokeLinecap="round" />
        {/* Screen recess. */}
        <g transform={`translate(${face.x} ${face.y})`}>
          <path d={SCREEN_D} transform="translate(0 2.5)" fill={C.cream} opacity={0.9} />
          <path d={SCREEN_D} fill={`url(#${id}-glass)`} stroke={C.porcelainShade} strokeWidth={3} />
          <g clipPath={`url(#${id}-screenclip)`}>
            <path d="M-50 -176 L-18 -176 L-40 -42 L-72 -42Z" fill={C.porcelain} opacity={0.07} />
            <path d="M-8 -176 L2 -176 L-20 -42 L-30 -42Z" fill={C.porcelain} opacity={0.05} />
          </g>
        </g>
        {cracks}
      </g>
      <CubeEyes id={id} r={r} face={face} />
      {warm ? <g clipPath={`url(#${id}-clip)`}>{warm}</g> : null}
      <Antenna id={id} sway={sway} sil={false} />
    </g>
  );
};

const CubeEyes: React.FC<{ id: string; r: Resolved; face: { x: number; y: number } }> = ({ id, r, face }) => {
  // Fear: tall, wide-open rectangles; bright: a little bigger and cream.
  const s = CUBE.eyeSize * (1 + 0.08 * r.fear + 0.1 * r.bright);
  const h = s * (1 - 0.86 * r.blink) * (1 + 0.38 * r.fear);
  const w = s * (1 - 0.08 * Math.abs(r.look.x)) * (1 - 0.06 * r.fear);
  const dx = face.x + r.look.x * 10;
  const dy = face.y + r.look.y * 9;
  const col = mix(C.porcelain, C.cream, r.bright);
  // Shut, each eye is a closed-lid line: a gently curved stroke in the eye's
  // own light (the screen is night), where the squashed eye was.
  const shut = closedOf(r.blink);
  return (
    <g clipPath={`url(#${id}-screenclip)`}>
      {CUBE.eyes.map((e, i) => {
        const cx = e.x + dx;
        const cy = e.y + dy + (s * 0.86 * r.blink) / 2 - r.fear * 3;
        const y0 = e.y + dy + s * 0.4 - r.fear * 3;
        const hw = w * 0.46;
        const sag = 3.2;
        return (
          <g key={i}>
            {shut < 0.99 ? <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={Math.min(4, h / 2)} fill={col} opacity={Math.min(1, (1 - shut) * 2)} /> : null}
            {shut > 0.01 ? (
              <path
                d={`M${(cx - hw).toFixed(2)} ${(y0 - sag / 2).toFixed(2)}Q${cx.toFixed(2)} ${(y0 + sag * 1.5).toFixed(2)} ${(cx + hw).toFixed(2)} ${(y0 - sag / 2).toFixed(2)}`}
                fill="none"
                stroke={col}
                strokeWidth={2.2 + 1.4 * shut}
                strokeLinecap="round"
                opacity={shut}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
};
