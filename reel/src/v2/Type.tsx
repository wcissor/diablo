// Kinetic type: each letter pops up out of a blur with a little overshoot, and
// flies up out of frame when the line leaves. 'type' mode prints letters one
// by one, like a terminal (the URL).

import React from 'react';
import { TYPE_STAGGER } from '../config';
import { FONT } from '../theme';
import { clamp, easeInCubic } from '../lib/anim';
import { spring } from './timeline';

export const Kinetic: React.FC<{
  f: number;
  lines: { text: string; at: number }[];
  out?: number;
  top: number;
  size: number;
  lineH: number;
  color: string;
  font?: string;
  weight?: number;
  tracking?: number; // em
  stagger?: number;
  mode?: 'pop' | 'type';
}> = ({ f, lines, out, top, size, lineH, color, font = FONT.sans, weight = 800, tracking = -0.04, stagger = TYPE_STAGGER, mode = 'pop' }) => (
  <>
    {lines.map((ln, li) => (
      <div
        key={li}
        style={{
          position: 'absolute',
          left: 0,
          width: 1080,
          top: top + li * lineH,
          height: lineH,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: font,
          fontWeight: weight,
          fontSize: size,
          lineHeight: `${lineH}px`,
          letterSpacing: `${tracking}em`,
          color,
          whiteSpace: 'pre',
        }}
      >
        {[...ln.text].map((ch, ci) => {
          const t = f - (ln.at + ci * stagger);
          const te = out === undefined ? -1 : f - (out + ci * 0.8 + li * 2);
          const e = te > 0 ? easeInCubic(clamp(te / 6)) : 0;
          let style: React.CSSProperties;
          if (mode === 'type') {
            style = { opacity: t > 0 ? 1 - e : 0, transform: `translateY(${t > 0 ? Math.max(0, 6 - 3 * t) : 0}px)` };
          } else {
            const s = spring(t, 2.2, 0.62);
            const blur = Math.max(0, 1 - t / 4) * 0.07 * size + e * 0.08 * size;
            style = {
              opacity: clamp(t / 2) * (1 - e),
              transform: `translateY(${(1 - s) * 0.5 * size - e * 0.9 * size}px) scale(${Math.max(0, 0.3 + 0.7 * s) * (1 - 0.3 * e)}) rotate(${(1 - s) * -10}deg)`,
              filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
            };
          }
          return (
            <span key={ci} style={{ display: 'inline-block', ...style }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          );
        })}
      </div>
    ))}
  </>
);
