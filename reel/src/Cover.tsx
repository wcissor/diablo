import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT } from './theme';
import { COVER_FRAME, END_CARD } from './config';
import { BOTS } from './geometry';
import { useFonts } from './IntroReel';
import { ConceptBotImpl as Bot } from './bots/Bot';
import { FlatMark } from './v2/Mark';
import { KINDS } from './v2/timeline';

// out/cover.png: built for a thumbnail rather than grabbed from the reel.
// Diablo's mark, the name, and the three bots fixed and proud with their white
// bolt badges, a little larger than in the reel. Everything sits in the middle
// band (y 470-1380), so a square or 4:5 crop of the centre keeps all of it.
const ROW_SCALE = 1.12;
const FEET = 1380;
const LONG_AGO = 300; // frames since the hit and since the seal: settled, badge on

export const Cover: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <FlatMark
          id="cover-mark"
          m={{ x: 540, y: 635, h: 330, color: C.white, eye: C.maroon, headScale: 1, headSx: 1, headSy: 1, headDy: 0, rot: 0, crescent: 1, eyeOpen: 1, squint: 0 }}
        />
        {KINDS.map((k) => (
          <g key={k} transform={`translate(${540 + (BOTS[k].cx - 540) * ROW_SCALE} ${FEET}) scale(${ROW_SCALE})`}>
            <Bot kind={k} frame={COVER_FRAME} bg="maroon" mood="proud" hitT={LONG_AGO} seal={1} sealT={LONG_AGO} />
          </g>
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1080,
          top: 820,
          textAlign: 'center',
          fontFamily: FONT.sans,
          fontWeight: 800,
          fontSize: 150,
          lineHeight: '160px',
          letterSpacing: '-0.04em',
          color: C.white,
        }}
      >
        {END_CARD.name}
      </div>
    </AbsoluteFill>
  );
};
