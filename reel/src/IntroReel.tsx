import React, { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { C, SLANT_RAD } from './theme';
import { EVENTS, SHOTS } from './config';
import { ensureFonts } from './lib/fonts';
import { Words } from './stage/Words';
import { Grain, Vignette } from './stage/Grain';
import { Canvas } from './stage/Camera';
import { SlitMask } from './stage/Slit';
import { Scene } from './shots/Scene';
import { STATE_FNS, blurAt } from './shots/shots';
import { EndCardWiped } from './shots/EndCard';
import { easeInOutCubic, invLerp } from './lib/anim';

export const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    ensureFonts().then(() => continueRender(handle));
  }, [handle]);
};

// One stage shot, drawn at the frame the context gives (sub-frames under blur).
const StageShot: React.FC<{ id: 1 | 2 | 3 | 4 | 5 | 6 }> = ({ id }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Canvas>
        <Scene s={STATE_FNS[id](frame)} id={`s${id}`} />
      </Canvas>
    </AbsoluteFill>
  );
};

// The 9° wipe's gold seam riding the leading edge.
const WipeEdge: React.FC<{ t: number }> = ({ t }) => {
  if (t <= 0 || t >= 1) return null;
  const dx = Math.tan(SLANT_RAD) * 1000;
  const span = 1080 + 2 * dx + 80;
  const edge = -dx - 40 + span * t;
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      <line x1={edge + dx} y1={-40} x2={edge - dx} y2={1960} stroke={C.gold} strokeWidth={6} />
      <line x1={edge + dx} y1={-40} x2={edge - dx} y2={1960} stroke={C.cream} strokeWidth={2} />
    </svg>
  );
};

export const IntroReel: React.FC<{ hideWords?: boolean }> = ({ hideWords }) => {
  useFonts();
  const frame = useCurrentFrame();
  const shot = SHOTS.find((s) => frame >= s.from && frame <= s.to)!;
  const flash = frame >= EVENTS.flash.from && frame <= EVENTS.flash.to;
  const open =
    frame <= EVENTS.slitOpen.to
      ? easeInOutCubic(invLerp(EVENTS.slitOpen.from, EVENTS.slitOpen.to, frame))
      : 1 - easeInOutCubic(invLerp(EVENTS.slitClose.from, EVENTS.slitClose.to, frame));
  const wipe = easeInOutCubic(invLerp(EVENTS.wipe.from, EVENTS.wipe.to, frame));
  const stageId = (shot.id === 7 ? 6 : shot.id) as 1 | 2 | 3 | 4 | 5 | 6;
  const stage = shot.id === 7 && wipe >= 1 ? null : shot.id === 7 ? (
    <StageShot id={6} />
  ) : blurAt(frame) ? (
    <CameraMotionBlur shutterAngle={180} samples={8}>
      <StageShot id={stageId} />
    </CameraMotionBlur>
  ) : (
    <StageShot id={stageId} />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      {stage}
      {shot.id === 7 ? <EndCardWiped t={wipe} /> : null}
      {shot.id === 7 ? <WipeEdge t={wipe} /> : null}
      {hideWords || shot.id === 7 ? null : <Words key={shot.id} lines={shot.words} inFrame={shot.wordsIn} />}
      {flash ? null : <Vignette />}
      <AbsoluteFill style={{ opacity: open }}>
        <Grain />
      </AbsoluteFill>
      <SlitMask open={open} />
    </AbsoluteFill>
  );
};
