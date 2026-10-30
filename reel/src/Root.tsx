import React from 'react';
import { Composition } from 'remotion';
import { DURATION, FPS, HEIGHT, WIDTH } from './config';
import { IntroReel } from './IntroReel';
import { Cover } from './Cover';
import { BotSheet } from './dev/BotSheet';
import { DiabloSheet } from './dev/DiabloSheet';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="IntroReel" component={IntroReel} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Cover" component={Cover} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
    {/* Dev sheets for checking the cast as stills while building. */}
    <Composition id="BotSheet" component={BotSheet} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="DiabloSheet" component={DiabloSheet} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
