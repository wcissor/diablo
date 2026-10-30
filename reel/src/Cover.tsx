import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT } from './theme';
import { END_CARD } from './config';
import { IntroReel, useFonts } from './IntroReel';

// out/cover.png: the strike without its words, rendered as a still at
// COVER_FRAME (the three bots cracked and glowing), with the name on top.
export const Cover: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill>
      <IntroReel hideWords />
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1080,
          top: 330,
          textAlign: 'center',
          fontFamily: FONT.sans,
          fontWeight: 800,
          fontSize: 160,
          lineHeight: '170px',
          letterSpacing: '-0.04em',
          color: C.white,
        }}
      >
        {END_CARD.name}
      </div>
    </AbsoluteFill>
  );
};
