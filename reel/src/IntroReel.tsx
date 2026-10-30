import React, { useEffect, useState } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';
import { ensureFonts } from './lib/fonts';
import { Reel } from './v2/Reel';

export const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    ensureFonts().then(() => continueRender(handle));
  }, [handle]);
};

// The 20 s reel: every frame is a pure function of the frame number (src/v2/timeline.ts).
export const IntroReel: React.FC<{ hideWords?: boolean }> = ({ hideWords }) => {
  useFonts();
  return <Reel f={useCurrentFrame()} hideWords={hideWords} />;
};
