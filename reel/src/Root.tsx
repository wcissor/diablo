import React from 'react';
import { Composition } from 'remotion';
import { DURATION, FPS, HEIGHT, WIDTH } from './config';
import { IntroReel } from './IntroReel';
import { Cover } from './Cover';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="IntroReel" component={IntroReel} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Cover" component={Cover} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
