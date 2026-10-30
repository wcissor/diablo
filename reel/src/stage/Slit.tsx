import React from 'react';
import { AbsoluteFill } from 'remotion';
import { SLANT_RAD } from '../theme';

// A black overlay with a slit through it leaning 9° (top to the right), like
// Diablo's eye. `open` 0 = black frame, 1 = no overlay. The reel starts and
// ends on true black so it loops cleanly. The slit runs through
// the middle of the frame and widens to full frame.
export const SlitMask: React.FC<{ open: number }> = ({ open }) => {
  if (open >= 1) return null;
  const cx = 540;
  const cy = 960;
  const dx = Math.tan(SLANT_RAD) * 1100; // horizontal drift over half the height + margin
  // Half-width needed to clear the frame entirely, measured horizontally.
  const full = 540 + dx + 40;
  const hw = Math.max(0, open) * full;
  const top = cy - 1100;
  const bot = cy + 1100;
  const hole = `M${cx + dx - hw} ${top} L${cx + dx + hw} ${top} L${cx - dx + hw} ${bot} L${cx - dx - hw} ${bot} Z`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        <path d={`M-10 -10 H1090 V1930 H-10 Z ${hw > 0 ? hole : ''}`} fill="#000" fillRule="evenodd" />
      </svg>
    </AbsoluteFill>
  );
};
