// The orb: a sphere 200 px across inside a thin tilted ring, one round eye.
// Local coordinates (the sphere's bottom on 0; it hovers 20 px over the stage).

import React from 'react';
import { C } from '../../theme';
import { HatchPattern } from '../../stage/Hatch';
import { mix } from '../../stage/Stage';
import { ORB, ringPt } from './shapes';
import { polyD, shift } from './geom';
import { CrackDefs } from './CrackLayer';
import type { Resolved } from './pose';
import { OvalEye } from './Eye';
import type { Pt } from '../../lib/anim';

const SPHERE_D = polyD(ORB.sphere);
const BIG = 'M-112 -212H112V12H-112Z';
const SHADE_D = BIG + polyD(shift(ORB.sphere, ORB.shadeOffset.x, ORB.shadeOffset.y));
const STREAK_D = polyD(ORB.streak, false);

const ringHalf = (front: boolean, ext = 0.06): string => {
  const pts: Pt[] = [];
  const a0 = front ? -ext : Math.PI - ext;
  const a1 = front ? Math.PI + ext : 2 * Math.PI + ext;
  for (let i = 0; i <= 90; i++) pts.push(ringPt(a0 + ((a1 - a0) * i) / 90));
  return polyD(pts, false);
};
const RING_FRONT_D = ringHalf(true);
const RING_BACK_D = ringHalf(false);
const RING_FULL_D = (() => {
  const pts: Pt[] = [];
  for (let i = 0; i < 180; i++) pts.push(ringPt((i / 180) * Math.PI * 2));
  return polyD(pts);
})();

const Ring: React.FC<{ d: string; back?: boolean }> = ({ d, back }) => (
  <g>
    <path d={d} fill="none" stroke={C.porcelainShade} strokeWidth={ORB.ringW + 4} strokeLinecap="butt" />
    <path d={d} fill="none" stroke={back ? mix(C.porcelain, C.porcelainShade, 0.45) : C.porcelain} strokeWidth={ORB.ringW} strokeLinecap="butt" />
  </g>
);

export const OrbArt: React.FC<{ id: string; r: Resolved; sil: boolean; cracks: React.ReactNode; warm?: React.ReactNode }> = ({ id, r, sil, cracks, warm }) => {
  const bob = `translate(0 ${r.bob})`;
  if (sil) {
    return (
      <g transform={bob}>
        <path d={RING_FULL_D} fill="none" stroke={C.night} strokeWidth={ORB.ringW + 4} />
        <path d={SPHERE_D} fill={C.night} stroke={C.night} strokeWidth={4} />
      </g>
    );
  }
  return (
    <g transform={bob}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={SPHERE_D} />
        </clipPath>
        <radialGradient id={`${id}-gloss`} gradientUnits="userSpaceOnUse" cx={-42} cy={-150} r={190}>
          <stop offset="0" stopColor={C.porcelain} />
          <stop offset="0.42" stopColor={mix(C.porcelain, C.porcelainShade, 0.18)} />
          <stop offset="0.78" stopColor={mix(C.porcelain, C.porcelainShade, 0.5)} />
          <stop offset="1" stopColor={mix(C.porcelain, C.porcelainShade, 0.82)} />
        </radialGradient>
        <HatchPattern id={`${id}-hatch`} color={C.porcelainShade} />
        <CrackDefs id={id} />
      </defs>

      {/* The back half of the ring, behind the sphere. */}
      <Ring d={RING_BACK_D} back />
      <path d={SPHERE_D} fill="none" stroke={C.porcelainShade} strokeWidth={4} />
      <path d={SPHERE_D} fill={`url(#${id}-gloss)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <path d={SHADE_D} fillRule="evenodd" fill={`url(#${id}-hatch)`} />
        {/* The ring's shadow on the sphere, under its front half. */}
        <path d={RING_FRONT_D} transform="translate(3 10)" fill="none" stroke={C.porcelainShade} strokeWidth={ORB.ringW + 2} opacity={0.85} />
        <path d={STREAK_D} fill="none" stroke={C.cream} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        {cracks}
      </g>
      <OrbEye r={r} lidFill={`url(#${id}-gloss)`} />
      {warm ? <g clipPath={`url(#${id}-clip)`}>{warm}</g> : null}
      <Ring d={RING_FRONT_D} />
    </g>
  );
};

const OrbEye: React.FC<{ r: Resolved; lidFill: string }> = ({ r, lidFill }) => {
  const s = 1 + 0.16 * r.fear;
  const cx = ORB.eye.x + r.look.x * 17;
  const cy = ORB.eye.y + r.look.y * 14;
  // Foreshortened as it turns across the sphere.
  const rx = ORB.eyeR * s * (1 - 0.14 * Math.abs(r.look.x));
  const ry = ORB.eyeR * s * (1 + 0.08 * r.fear) * (1 - 0.14 * Math.abs(r.look.y));
  const k = (1 - 0.55 * r.fear) * (1 + 0.45 * r.bright);
  return <OvalEye cx={cx} cy={cy} rx={rx} ry={ry} blink={r.blink} catchK={k * 0.8} bright={r.bright} lidFill={lidFill} />;
};
