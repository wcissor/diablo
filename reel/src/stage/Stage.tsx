import React from 'react';
import { C } from '../theme';
import { STAGE_Y, WIDTH_PX } from './constants';

// Mix two hex colours.
export const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

// One overhead key light: a soft oval pool where the bots stand, #2B0B16 at its
// centre to night at its edge. `level` dims it (the flicker), `warm` turns it
// toward warm gold when the seams close, `ember` adds the cracks' red light.
export const LightPool: React.FC<{
  id: string;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  level?: number;
  warm?: number;
  ember?: number;
}> = ({ id, cx = 540, cy = 1130, rx = 560, ry = 300, level = 1, warm = 0, ember = 0 }) => {
  const centre = mix(mix(C.night, C.poolCentre, level), mix(C.poolCentre, C.gold, 0.12), warm * level);
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-pool`} cx={cx} cy={cy} r={rx} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${cx} ${cy}) scale(1 ${ry / rx}) translate(${-cx} ${-cy})`}>
          <stop offset="0" stopColor={centre} />
          <stop offset="0.45" stopColor={mix(C.night, centre, 0.6)} stopOpacity={0.8} />
          <stop offset="0.75" stopColor={mix(C.night, centre, 0.3)} stopOpacity={0.35} />
          <stop offset="1" stopColor={C.night} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-ember`} cx={cx} cy={cy + 20} r={rx * 0.8} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${cx} ${cy + 20}) scale(1 ${(ry / rx) * 0.8}) translate(${-cx} ${-(cy + 20)})`}>
          <stop offset="0" stopColor={C.ember} stopOpacity={0.4 * ember} />
          <stop offset="1" stopColor={C.ember} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={-200} y={-200} width={WIDTH_PX + 400} height={2400} fill={C.night} />
      <ellipse cx={cx} cy={cy} rx={rx * 1.2} ry={ry * 1.2} fill={`url(#${id}-pool)`} />
      {ember > 0 ? <ellipse cx={cx} cy={cy + 20} rx={rx} ry={ry} fill={`url(#${id}-ember)`} /> : null}
    </g>
  );
};

// The stage line the bots stand on: a cream line at 25 % opacity.
export const StageLine: React.FC<{ id: string; y?: number; opacity?: number }> = ({ id, y = STAGE_Y, opacity = 0.25 }) => (
  <g>
    <defs>
      <linearGradient id={`${id}-line`} x1="0" x2={WIDTH_PX} y1="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={C.cream} stopOpacity={0} />
        <stop offset="0.12" stopColor={C.cream} stopOpacity={opacity} />
        <stop offset="0.88" stopColor={C.cream} stopOpacity={opacity} />
        <stop offset="1" stopColor={C.cream} stopOpacity={0} />
      </linearGradient>
    </defs>
    <rect x={0} y={y - 1} width={WIDTH_PX} height={2} fill={`url(#${id}-line)`} />
  </g>
);
