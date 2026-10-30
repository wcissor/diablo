// Diablo as his flat logo mark: the horned head with its two slit eyes, and
// the crescent under it, which draws on like a brush stroke along its spine.

import React from 'react';
import { CRESCENT_PATH, EYES, HEAD_PATH, MARK_BOX } from '../logo';
import { HEAD_BASE, type MarkView } from './timeline';

// The crescent's centre line, from its top tip to its bottom tip (logo trace units).
const SPINE = 'M512 630 C560 650 610 690 632 745 C652 795 662 850 646 890 C628 935 600 960 560 990 C530 1012 495 1035 462 1049';
const MC = { x: MARK_BOX.x + MARK_BOX.w / 2, y: MARK_BOX.y + MARK_BOX.h / 2 };

export const FlatMark: React.FC<{ m: MarkView; id: string }> = ({ m, id }) => {
  const k = m.h / MARK_BOX.h;
  const place = `translate(${m.x} ${m.y}) scale(${k}) translate(${-MC.x} ${-MC.y})`;
  const zoom = m.zoom ? `translate(${m.zoom.at.x} ${m.zoom.at.y}) scale(${m.zoom.s}) translate(${-m.zoom.at.x} ${-m.zoom.at.y}) ` : '';
  const head =
    `translate(0 ${m.headDy / k}) translate(${HEAD_BASE.x} ${HEAD_BASE.y}) rotate(${m.rot}) ` +
    `scale(${m.headScale * m.headSx} ${m.headScale * m.headSy}) translate(${-HEAD_BASE.x} ${-HEAD_BASE.y})`;
  return (
    <g transform={zoom + place}>
      <defs>
        <mask id={`${id}-cres`} maskUnits="userSpaceOnUse" x={300} y={480} width={620} height={740}>
          <path d={SPINE} pathLength={1} fill="none" stroke="#fff" strokeWidth={170} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${m.crescent} 3`} />
        </mask>
      </defs>
      {m.crescent > 0.001 ? <path d={CRESCENT_PATH} fill={m.color} mask={m.crescent < 0.999 ? `url(#${id}-cres)` : undefined} /> : null}
      {m.headScale > 0.001 ? (
        <g transform={head}>
          <path d={HEAD_PATH} fill={m.color} />
          {EYES.map((e, i) => {
            const h = Math.max(7, e.h * m.eyeOpen * (1 - 0.55 * m.squint));
            return (
              <rect
                key={i}
                x={e.cx - e.w / 2}
                y={e.cy - h / 2}
                width={e.w}
                height={h}
                rx={Math.min(e.w, h) / 2}
                fill={m.eye}
                transform={`rotate(${e.lean} ${e.cx} ${e.cy})`}
              />
            );
          })}
        </g>
      ) : null}
    </g>
  );
};
