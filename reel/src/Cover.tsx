import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT } from './theme';
import { END_CARD } from './config';
import { IntroReel, useFonts } from './IntroReel';

// out/cover.png: the reel without its words, rendered as a still at
// COVER_FRAME (the bots cheering with their white badges), with the name just
// above them, so a square or 4:5 crop of the middle keeps both.
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
          top: 560,
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
