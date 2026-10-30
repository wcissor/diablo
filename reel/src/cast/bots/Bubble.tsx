// The bubble: a rounded speech bubble with a short tail at its lower left, on
// two stubby feet, with two tall oval eyes. Local coordinates (feet at 0).

import React from 'react';
import { C } from '../../theme';
import { HatchPattern } from '../../stage/Hatch';
import { mix } from '../../stage/Stage';
import { BUBBLE } from './shapes';
import { polyD, shift } from './geom';
import { CrackDefs } from './CrackLayer';
import type { Resolved } from './pose';
import { OvalEye } from './Eye';

const BODY_D = polyD(BUBBLE.body);
const TAIL_D = polyD(BUBBLE.tail);
const FEET_D = BUBBLE.feet.map((f) => polyD(f));
const BIG = 'M-140 -250H160V12H-140Z';
const SHADE_D = BIG + polyD(shift(BUBBLE.body, BUBBLE.shadeOffset.x, BUBBLE.shadeOffset.y));
const TAIL_SHADE_D = BIG + polyD(shift(BUBBLE.tail, -4, -15));
const STREAK_D = polyD(BUBBLE.streak, false);
const { x: BX, y: BY } = BUBBLE.centre;

export const BubbleArt: React.FC<{ id: string; r: Resolved; sil: boolean; cracks: React.ReactNode; warm?: React.ReactNode }> = ({ id, r, sil, cracks, warm }) => {
  const tailT = `rotate(${r.tailAngle} ${BUBBLE.tailPivot.x} ${BUBBLE.tailPivot.y})`;
  if (sil) {
    return (
      <g fill={C.night} stroke={C.night} strokeWidth={4} strokeLinejoin="round">
        {FEET_D.map((d, i) => (
          <path key={i} d={d} />
        ))}
        <g transform={`translate(0 ${r.bob})`}>
          <path d={TAIL_D} transform={tailT} />
          <path d={BODY_D} />
        </g>
      </g>
    );
  }
  return (
    <g>
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={BODY_D} />
        </clipPath>
        <clipPath id={`${id}-tailclip`}>
          <path d={TAIL_D} />
        </clipPath>
        <radialGradient id={`${id}-gloss`} gradientUnits="userSpaceOnUse" cx={BX - 50} cy={BY - 60} r={225}>
          <stop offset="0" stopColor={C.porcelain} />
          <stop offset="0.42" stopColor={mix(C.porcelain, C.porcelainShade, 0.18)} />
          <stop offset="0.78" stopColor={mix(C.porcelain, C.porcelainShade, 0.5)} />
          <stop offset="1" stopColor={mix(C.porcelain, C.porcelainShade, 0.82)} />
        </radialGradient>
        <linearGradient id={`${id}-foot`} gradientUnits="userSpaceOnUse" x1={0} y1={-30} x2={0} y2={0}>
          <stop offset="0" stopColor={mix(C.porcelain, C.porcelainShade, 0.75)} />
          <stop offset="1" stopColor={mix(C.porcelain, C.porcelainShade, 0.35)} />
        </linearGradient>
        <HatchPattern id={`${id}-hatch`} color={C.porcelainShade} />
        <CrackDefs id={id} />
      </defs>

      {/* Feet, tucked under the body. */}
      {FEET_D.map((d, i) => (
        <g key={i}>
          <path d={d} fill={`url(#${id}-foot)`} stroke={C.porcelainShade} strokeWidth={2} strokeLinejoin="round" />
          <path d={d} fill={`url(#${id}-hatch)`} opacity={0.9} />
        </g>
      ))}

      <g transform={`translate(0 ${r.bob})`}>
        {/* Outline of body ∪ tail: both strokes, then both fills over them. */}
        <path d={TAIL_D} transform={tailT} fill="none" stroke={C.porcelainShade} strokeWidth={4} strokeLinejoin="round" />
        <path d={BODY_D} fill="none" stroke={C.porcelainShade} strokeWidth={4} strokeLinejoin="round" />
        <g transform={tailT}>
          <path d={TAIL_D} fill={`url(#${id}-gloss)`} />
          <g clipPath={`url(#${id}-tailclip)`}>
            <path d={TAIL_SHADE_D} fillRule="evenodd" fill={`url(#${id}-hatch)`} />
          </g>
        </g>
        <path d={BODY_D} fill={`url(#${id}-gloss)`} />
        <g clipPath={`url(#${id}-clip)`}>
          <path d={SHADE_D} fillRule="evenodd" fill={`url(#${id}-hatch)`} />
          <path d={STREAK_D} fill="none" stroke={C.cream} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          {cracks}
        </g>
        <BubbleEyes r={r} lidFill={`url(#${id}-gloss)`} />
        {warm ? <g clipPath={`url(#${id}-clip)`}>{warm}</g> : null}
      </g>
    </g>
  );
};

const BubbleEyes: React.FC<{ r: Resolved; lidFill: string }> = ({ r, lidFill }) => {
  // Fear: taller, wider-open eyes, set a little higher, with pin-prick catchlights.
  const sx = 1 + 0.1 * r.fear;
  const sy = 1 + 0.3 * r.fear;
  const dx = r.look.x * 9;
  const dy = r.look.y * 8 - r.fear * 4;
  const turn = 1 - 0.1 * Math.abs(r.look.x);
  const k = (1 - 0.55 * r.fear) * (1 + 0.5 * r.bright);
  return (
    <g>
      {BUBBLE.eyes.map((e, i) => (
        <OvalEye key={i} cx={e.x + dx} cy={e.y + dy} rx={BUBBLE.eyeRx * sx * turn} ry={BUBBLE.eyeRy * sy} blink={r.blink} catchK={k} bright={r.bright} lidFill={lidFill} />
      ))}
    </g>
  );
};
