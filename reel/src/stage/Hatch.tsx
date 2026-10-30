import React from 'react';
import { HATCH } from '../theme';

// Engraved hatching: 1.5 px lines, 7 px apart, leaning 9° (top to the right).
// `scale` is the transform scale of the group the pattern is used in, so the
// lines stay 1.5 px / 7 px on the canvas whatever the group is scaled to.
export const HatchPattern: React.FC<{ id: string; color: string; opacity?: number; scale?: number }> = ({
  id,
  color,
  opacity = 1,
  scale = 1,
}) => (
  <pattern
    id={id}
    patternUnits="userSpaceOnUse"
    width={HATCH.gap}
    height={HATCH.gap}
    patternTransform={`scale(${1 / scale}) rotate(${HATCH.angle})`}
  >
    <line x1={HATCH.gap / 2} y1={-1} x2={HATCH.gap / 2} y2={HATCH.gap + 1} stroke={color} strokeWidth={HATCH.width} strokeOpacity={opacity} />
  </pattern>
);
