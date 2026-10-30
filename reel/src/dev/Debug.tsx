import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Tail, tailTips } from '../cast/Tail';
import { TAIL_TAP, CUBE_TAP } from '../shots/story';

// Scratch composition for checking poses against their helper geometry.
export const Debug: React.FC = () => {
  const poses = [TAIL_TAP, { ...TAIL_TAP, flip: false }];
  return (
    <AbsoluteFill style={{ backgroundColor: '#120309' }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {poses.map((p, i) => {
          const t = tailTips(p);
          return (
            <g key={i} transform={`translate(${i * 0} ${i * 600})`}>
              <Tail crescent={p} />
              <circle cx={t.upper.x} cy={t.upper.y} r={8} fill="cyan" />
              <circle cx={t.lower.x} cy={t.lower.y} r={8} fill="lime" />
            </g>
          );
        })}
        <circle cx={CUBE_TAP.x} cy={CUBE_TAP.y} r={4} fill="red" />
      </svg>
    </AbsoluteFill>
  );
};
