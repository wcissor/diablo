import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT } from './theme';
import { COVER_FRAME, END_CARD, SHOTS } from './config';
import { useFonts } from './IntroReel';
import { ConceptBotImpl as Bot } from './bots/Bot';
import { FlatMark } from './v2/Mark';
import { KINDS } from './v2/timeline';

// out/cover.png: built for a thumbnail rather than grabbed from the reel.
// Diablo's mark, the name and the line, and the three bots fixed and proud with
// their white bolt badges, larger than in the reel. Everything sits in the
// middle band (y 450-1420), so a square or 4:5 crop of the centre keeps it all.
// spread wider than the reel's row so the larger bots keep 20+ px of maroon between them
const ROW = { scale: 1.25, feet: 1420, x: { bubble: 215, cube: 540, orb: 865 } };
const HIT_AGO = 300; // frames since the hit: settled, badge on
const SEALED_AGO = 20; // frames since the seal: past the celebration, before the first idle glint

// The reel's own last line, "AI that evolves AI.", as the cover's hook.
const TAGLINE = SHOTS.find((s) => s.id === 5)!.words.join(' ');

export const Cover: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <FlatMark
          id="cover-mark"
          m={{ x: 540, y: 615, h: 330, color: C.white, eye: C.maroon, headScale: 1, headSx: 1, headSy: 1, headDy: 0, rot: 0, crescent: 1, eyeOpen: 1, squint: 0 }}
        />
        {KINDS.map((k) => (
          <g key={k} transform={`translate(${ROW.x[k]} ${ROW.feet}) scale(${ROW.scale})`}>
            <Bot kind={k} frame={COVER_FRAME} bg="maroon" mood="proud" hitT={HIT_AGO} seal={1} sealT={SEALED_AGO} />
          </g>
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1080,
          top: 800,
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
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1080,
          top: 968,
          textAlign: 'center',
          fontFamily: FONT.sans,
          fontWeight: 600,
          fontSize: 56,
          lineHeight: '64px',
          letterSpacing: '-0.02em',
          color: C.white,
          opacity: 0.9,
        }}
      >
        {TAGLINE}
      </div>
    </AbsoluteFill>
  );
};
