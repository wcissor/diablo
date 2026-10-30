import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { GRAIN_OPACITY } from '../theme';

// Film grain over everything at 4 %, re-seeded every frame, and a light vignette.
export const Grain: React.FC = () => {
  const frame = Math.floor(useCurrentFrame());
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <filter id="grain" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame + 1} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.99  0 0 0 0 0.976  0 0 0 0 0.94  1.4 0 0 0 -0.2" />
        </filter>
        <rect width={1080} height={1920} filter="url(#grain)" opacity={GRAIN_OPACITY} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <radialGradient id="vignette" cx={540} cy={900} r={1150} gradientUnits="userSpaceOnUse" gradientTransform="translate(540 900) scale(0.78 1) translate(-540 -900)">
          <stop offset="0.55" stopColor="#120309" stopOpacity={0} />
          <stop offset="1" stopColor="#120309" stopOpacity={strength} />
        </radialGradient>
      </defs>
      <rect width={1080} height={1920} fill="url(#vignette)" />
    </svg>
  </AbsoluteFill>
);
