import React from 'react';
import { CAMERA_ORIGIN } from '../geometry';

// The shot's camera: scale about CAMERA_ORIGIN plus an offset (framing, shake).
export const Camera: React.FC<{ scale: number; dx?: number; dy?: number; children: React.ReactNode }> = ({
  scale,
  dx = 0,
  dy = 0,
  children,
}) => (
  <g
    transform={`translate(${dx} ${dy}) translate(${CAMERA_ORIGIN.x} ${CAMERA_ORIGIN.y}) scale(${scale}) translate(${-CAMERA_ORIGIN.x} ${-CAMERA_ORIGIN.y})`}
  >
    {children}
  </g>
);

// A full-canvas SVG to draw a shot in.
export const Canvas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    {children}
  </svg>
);
