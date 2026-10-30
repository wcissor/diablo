import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { END_CARD, EVENTS } from '../config';
import { C, FONT, SLANT_RAD, TYPE } from '../theme';
import { Mark } from '../cast/Diablo';
import { LightPool } from '../stage/Stage';
import { easeOutCubic, invLerp } from '../lib/anim';

// A line that fades in over 8 frames while rising 12 px, placed by baseline.
const Line: React.FC<{ text: string; inFrame: number; baseline: number; size: number; font: string; weight: number; color: string; tracking?: string }> = ({
  text,
  inFrame,
  baseline,
  size,
  font,
  weight,
  color,
  tracking,
}) => {
  const frame = useCurrentFrame();
  const t = easeOutCubic(invLerp(inFrame, inFrame + TYPE.fadeFrames, frame));
  if (frame < inFrame) return null;
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      <text
        x={540}
        y={baseline + (1 - t) * TYPE.risePx}
        textAnchor="middle"
        fontFamily={font}
        fontWeight={weight}
        fontSize={size}
        fill={color}
        opacity={t}
        letterSpacing={tracking}
      >
        {text}
      </text>
    </svg>
  );
};

// Shot 7: the mark on night with the name and the URL, one slow blink.
export const EndCardContent: React.FC = () => {
  const frame = useCurrentFrame();
  const { from: b0, to: b1 } = EVENTS.blink;
  const blink = frame < b0 || frame > b1 ? 0 : Math.sin(invLerp(b0, b1, frame) * Math.PI);
  const appear = easeOutCubic(invLerp(EVENTS.wipe.from + 2, EVENTS.wipe.to + 6, frame));
  // the brand's sign last: one gold seam draws across his crescent
  const seam = easeOutCubic(invLerp(EVENTS.markSeam.from, EVENTS.markSeam.to, frame));
  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <LightPool id="end" cx={540} cy={760} rx={460} ry={560} level={0.55 * appear} />
        <Mark blink={blink} opacity={appear} scale={0.97 + 0.03 * appear} seam={seam} />
      </svg>
      <Line text={END_CARD.name} inFrame={END_CARD.nameIn} baseline={1040} size={TYPE.endName.size} font={FONT.serif} weight={FONT.serifWeight} color={C.cream} />
      <Line text={END_CARD.url} inFrame={END_CARD.urlIn} baseline={1110} size={TYPE.url.size} font={FONT.mono} weight={FONT.monoWeight} color={C.gold} tracking="0.02em" />
    </AbsoluteFill>
  );
};

// The end card arrives behind a wipe leaning 9°: its region grows from the
// left with the wipe's leading edge.
export const EndCardWiped: React.FC<{ t: number }> = ({ t }) => {
  const dx = Math.tan(SLANT_RAD) * 1000;
  const span = 1080 + 2 * dx + 80;
  const edge = -dx - 40 + span * Math.min(1, t);
  const clip = t >= 1 ? undefined : `polygon(-200px -40px, ${edge + dx}px -40px, ${edge - dx}px 1960px, -200px 1960px)`;
  return (
    <AbsoluteFill style={{ clipPath: clip }}>
      <EndCardContent />
    </AbsoluteFill>
  );
};
