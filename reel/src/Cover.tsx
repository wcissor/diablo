import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, TYPE } from './theme';
import { END_CARD } from './config';
import { IntroReel, useFonts } from './IntroReel';

// out/cover.png: the reel without its words, rendered as a still at
// COVER_FRAME (6.0 s: cracks glowing, Diablo looming), with the name centred
// on x 540 at baseline y 440.
export const Cover: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      <IntroReel hideWords />
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <text x={540} y={440} textAnchor="middle" fontFamily={FONT.serif} fontWeight={FONT.serifWeight} fontSize={TYPE.endName.size} fill={C.cream}>
          {END_CARD.name}
        </text>
      </svg>
    </AbsoluteFill>
  );
};
