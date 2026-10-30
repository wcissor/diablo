// An oval eye that blinks with a lid: a shape filled with the body's own gloss
// comes down over the eye, its edge a soft porcelain-shade crease. Night eye,
// cream catchlight; `bright` adds a sparkle.

import React from 'react';
import { C } from '../../theme';
import { clamp } from '../../lib/anim';

export const OvalEye: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  blink: number;
  catchK: number; // catchlight scale (smaller when afraid, bigger when bright)
  bright: number;
  lidFill: string; // the body's gloss paint, so the lid matches the shell
}> = ({ cx, cy, rx, ry, blink, catchK, bright, lidFill }) => {
  const b = clamp(blink);
  let lid: React.ReactNode = null;
  if (b > 0.01) {
    const pad = 1.5; // the lid overlaps the eye's edge a little
    const RX = rx + pad;
    const RY = ry + pad;
    const y = cy - RY + 2 * RY * Math.min(b, 0.999);
    const hw = RX * Math.sqrt(Math.max(0, 1 - ((y - cy) / RY) ** 2));
    const bow = RY * 0.3 * Math.min(1, b * 2.2);
    const large = y > cy ? 1 : 0;
    const f = (n: number) => n.toFixed(2);
    const edge = `M${f(cx - hw)} ${f(y)}Q${f(cx)} ${f(y + bow)} ${f(cx + hw)} ${f(y)}`;
    lid = (
      <g>
        <path d={`M${f(cx + hw)} ${f(y)}A${f(RX)} ${f(RY)} 0 ${large} 0 ${f(cx - hw)} ${f(y)}Q${f(cx)} ${f(y + bow)} ${f(cx + hw)} ${f(y)}Z`} fill={lidFill} />
        <path d={edge} fill="none" stroke={C.porcelainShade} strokeWidth={2.6} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={C.night} />
      <ellipse cx={cx - rx * 0.3} cy={cy - ry * 0.4} rx={rx * 0.34 * catchK} ry={ry * 0.22 * catchK} fill={C.cream} />
      {bright > 0.01 ? <circle cx={cx + rx * 0.34} cy={cy + ry * 0.36} r={Math.max(rx, ry) * 0.12 * bright + 0.6 * bright} fill={C.cream} /> : null}
      {lid}
    </g>
  );
};
