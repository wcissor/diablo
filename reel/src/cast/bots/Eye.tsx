// An oval eye that blinks with lids: shapes filled with the body's own gloss
// close over the eye (the upper lid comes down, the lower one rises a little to
// meet it), the upper edge a soft porcelain-shade crease. Night eye, cream
// catchlight; `bright` adds a sparkle. While the lids are shut the eye is a
// closed-lid line, a gently curved night stroke where the eye was: it never
// vanishes into a blank face.

import React from 'react';
import { C } from '../../theme';
import { clamp, smooth } from '../../lib/anim';

// How shut the eye reads (0..1) for a blink lid position: the closed-lid line
// eases in as the lids close (from about 0.45) and is full from about 0.85.
export const closedOf = (blink: number) => smooth(clamp((blink - 0.45) / 0.4));

const f = (n: number) => n.toFixed(2);
const N = 28; // samples across the eye for the lid outlines

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
  const shut = closedOf(b);
  const pad = 1.5; // the lids overlap the eye's edge a little
  const RX = rx + pad;
  const RY = ry + pad;
  // The closed-lid line: a shallow smile-curve a little below the eye's middle,
  // about the eye's width.
  const y0 = cy + ry * 0.28;
  const half = rx * 0.98;
  const sag = Math.max(2.2, ry * 0.2);
  const lw = Math.max(3.4, Math.min(4, rx * 0.15));
  // ‿ : sag/2 below y0 in the middle, sag/2 above it at the ends.
  const curve = (x: number, bow: number) => bow * (0.5 - Math.min(1, ((x - cx) / half) ** 2));

  let lids: React.ReactNode = null;
  if (b > 0.01) {
    // Upper lid edge: from above the eye down to the line; its bow grows as it closes.
    const yU = cy - RY - sag + (y0 - (cy - RY - sag)) * b;
    const bowU = sag * Math.min(1, 0.4 + b * 1.2);
    // Lower lid edge: from below the eye up to the line.
    const yL = cy + RY + sag + (y0 - (cy + RY + sag)) * b;
    const top: string[] = [];
    const upEdge: string[] = [];
    const lowEdge: string[] = [];
    const bot: string[] = [];
    let crease = '';
    for (let i = 0; i <= N; i++) {
      const x = cx - RX + (2 * RX * i) / N;
      const h = RY * Math.sqrt(Math.max(0, 1 - ((x - cx) / RX) ** 2));
      const yt = cy - h;
      const yb = cy + h;
      const eu = Math.max(yt, Math.min(yb, yU + curve(x, bowU)));
      const el = Math.max(yt, Math.min(yb, yL + curve(x, sag)));
      top.push(`${f(x)} ${f(yt)}`);
      upEdge.push(`${f(x)} ${f(eu)}`);
      lowEdge.push(`${f(x)} ${f(el)}`);
      bot.push(`${f(x)} ${f(yb)}`);
      // the crease only where the edge actually crosses the eye
      if (eu > yt + 0.4 && eu < yb - 0.4) crease += `${crease ? 'L' : 'M'}${f(x)} ${f(eu)}`;
    }
    const upper = `M${upEdge.join('L')}L${top.reverse().join('L')}Z`;
    const lower = `M${lowEdge.join('L')}L${bot.reverse().join('L')}Z`;
    lids = (
      <g>
        <path d={lower} fill={lidFill} />
        <path d={upper} fill={lidFill} />
        {crease && shut < 0.98 ? (
          <path d={crease} fill="none" stroke={C.porcelainShade} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" opacity={1 - shut} />
        ) : null}
      </g>
    );
  }
  // The closed-lid line, along the curve where the lids meet.
  let line: React.ReactNode = null;
  if (shut > 0.01) {
    const pts: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = cx - half + (2 * half * i) / 12;
      pts.push(`${f(x)} ${f(y0 + curve(x, sag))}`);
    }
    line = (
      <path
        d={`M${pts.join('L')}`}
        fill="none"
        stroke={C.night}
        strokeWidth={lw * (0.55 + 0.45 * shut)}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={shut}
      />
    );
  }
  // The highlights go as the lids close (gone by the half-shut frames, never a
  // translucent grey speck).
  const lit = 1 - smooth(clamp((b - 0.3) / 0.25));
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={C.night} />
      {lit > 0.01 ? (
        <g opacity={lit}>
          <ellipse cx={cx - rx * 0.3} cy={cy - ry * 0.4} rx={rx * 0.34 * catchK} ry={ry * 0.22 * catchK} fill={C.cream} />
          {bright > 0.01 ? <circle cx={cx + rx * 0.34} cy={cy + ry * 0.36} r={Math.max(rx, ry) * 0.12 * bright + 0.6 * bright} fill={C.cream} /> : null}
        </g>
      ) : null}
      {lids}
      {line}
    </g>
  );
};
