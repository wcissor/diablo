import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, TYPE } from '../theme';
import { WORDS } from '../geometry';
import { easeOutCubic, invLerp } from '../lib/anim';

// The line for a shot: Bodoni Moda 600, sentence case, cream, centred on x 540.
// One line at 104 px or two at 88/96. Fades in over 8 frames while rising
// 12 px; it leaves with the cut (the caller stops rendering it).
export const Words: React.FC<{ lines: string[]; inFrame: number }> = ({ lines, inFrame }) => {
  const frame = useCurrentFrame();
  if (lines.length === 0 || frame < inFrame) return null;
  const t = easeOutCubic(invLerp(inFrame, inFrame + TYPE.fadeFrames, frame));
  const spec = lines.length === 1 ? TYPE.oneLine : TYPE.twoLines;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: WORDS.cx - WORDS.maxW / 2,
          width: WORDS.maxW,
          top: WORDS.top,
          textAlign: 'center',
          fontFamily: FONT.serif,
          fontWeight: FONT.serifWeight,
          fontSize: spec.size,
          lineHeight: `${spec.lineHeight}px`,
          color: C.cream,
          opacity: t,
          transform: `translateY(${(1 - t) * TYPE.risePx}px)`,
          letterSpacing: '-0.005em',
          fontKerning: 'normal',
        }}
      >
        {lines.map((l) => (
          <div key={l} style={{ whiteSpace: 'nowrap' }}>
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
