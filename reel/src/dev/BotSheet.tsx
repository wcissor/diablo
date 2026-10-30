import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { SAFE } from '../geometry';
import type { BotKind, CrackSet, CrackState, Pt } from '../cast/types';
import { Bot, Shards, botBounds, makeCracks, makeHairline } from '../cast/Bots';
import { Camera, Canvas } from '../stage/Camera';
import { LightPool, StageLine } from '../stage/Stage';
import { clamp } from '../lib/anim';

// Dev sheet for the bots, by frame:
//   0–99   idle at their real positions (bubble blinks at 20, tail wiggle 10–34)
//   100    cowering: fear, looking up-left, squashed, leaning away
//   150    cracked: weak spots glowing, shards mid-air
//   200    half sealed
//   250    fully sealed, warm glow
//   300    silhouettes on cream (the impact flash)
//   350    a fresh hairline flashing on the orb and the cube
//   400    cracked, at the tightest push-in (1.0815×) with the safe area drawn
//   450    2.4× close-up of the cracked bubble; 500: the half-sealed orb

const KINDS: BotKind[] = ['bubble', 'cube', 'orb'];

export const SHEET_IMPACTS: Record<BotKind, Pt[]> = {
  bubble: [
    { x: 226, y: 991 },
    { x: 254, y: 982 },
    { x: 284, y: 980 },
    { x: 314, y: 986 },
  ],
  cube: [{ x: 524, y: 963 }],
  orb: [
    { x: 758, y: 991 },
    { x: 784, y: 973 },
    { x: 813, y: 969 },
    { x: 841, y: 982 },
  ],
};

const SETS: Record<BotKind, CrackSet> = {
  bubble: makeCracks('bubble', SHEET_IMPACTS.bubble, 'sheet'),
  cube: makeCracks('cube', SHEET_IMPACTS.cube, 'sheet'),
  orb: makeCracks('orb', SHEET_IMPACTS.orb, 'sheet'),
};

const HAIR: Partial<Record<BotKind, CrackSet>> = {
  orb: makeHairline('orb', { x: 846, y: 1080 }, 'sheet-1'),
  cube: makeHairline('cube', { x: 478, y: 1152 }, 'sheet-2'),
};

const strike = (k: BotKind, frame: number, mode: 'cracked' | 'half' | 'sealed'): CrackState => {
  const set = SETS[k];
  const n = set.cracks.length;
  const seal = set.cracks.map((_, i) => {
    if (mode === 'cracked') return 0;
    if (mode === 'sealed') return 1;
    const h = Math.floor(n / 2);
    return i < h ? 1 : i === h ? 0.55 : 0;
  });
  return {
    set,
    grow: 1,
    weak: mode === 'cracked' ? 1 : mode === 'half' ? 0.55 : 0,
    pulseFrame: frame,
    seal,
    warm: mode === 'sealed' ? 0.85 : 0,
  };
};

export const BotSheet: React.FC = () => {
  const frame = useCurrentFrame();
  const seg = frame < 100 ? 'idle' : frame < 150 ? 'cower' : frame < 200 ? 'cracked' : frame < 250 ? 'half' : frame < 300 ? 'sealed' : frame < 350 ? 'sil' : frame < 400 ? 'hair' : frame < 450 ? 'safe' : 'zoom';

  const cream = seg === 'sil';
  const camScale = seg === 'safe' ? 1.0815 : 1;
  const zoom = seg === 'zoom' ? (frame < 500 ? { k: 2.4, x: 270, y: 1070 } : { k: 2.4, x: 800, y: 1060 }) : null;

  const bots = KINDS.map((k) => {
    let cracks: CrackState[] | undefined;
    let pose: Record<string, unknown> = {};
    if (seg === 'idle') {
      if (k === 'bubble') pose = { tailWiggle: clamp((frame - 10) / 24) };
    } else if (seg === 'cower') {
      pose = { squash: 0.94, fear: 1, look: { x: -0.8, y: -0.9 }, lean: k === 'bubble' ? 3 : k === 'orb' ? -3 : 0, idle: false };
    } else if (seg === 'cracked' || seg === 'safe' || (seg === 'zoom' && frame < 500)) {
      cracks = [strike(k, frame, 'cracked')];
      pose = { squash: 0.95, fear: 1, look: { x: -0.4, y: -0.8 }, lean: k === 'bubble' ? 2.5 : k === 'orb' ? -2.5 : 0, freeze: true };
    } else if (seg === 'half' || seg === 'zoom') {
      cracks = [strike(k, frame, 'half')];
      pose = { squash: 1, look: { x: 0, y: -0.3 } };
    } else if (seg === 'sealed') {
      cracks = [strike(k, frame, 'sealed')];
      pose = { squash: 1.04, bright: 1, look: { x: 0, y: -0.2 } };
    } else if (seg === 'sil') {
      cracks = [strike(k, frame, 'cracked')];
      pose = { squash: 0.95, fear: 1, freeze: true };
    } else if (seg === 'hair') {
      const s = strike(k, frame, 'sealed');
      s.warm = 0;
      cracks = [s];
      const h = HAIR[k];
      if (h) cracks.push({ set: h, grow: 1, weak: 0, pulseFrame: frame, seal: [0], warm: 0, flash: 1 });
      pose = h ? { fear: 0.5, look: { x: k === 'orb' ? 0.6 : -0.6, y: 0.5 }, lean: k === 'orb' ? -2 : 2 } : {};
    }
    return { k, cracks, pose };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: cream ? C.cream : C.night }}>
      <Canvas>
        {cream ? <rect x={0} y={0} width={1080} height={1920} fill={C.cream} /> : <LightPool id="bs" ember={seg === 'cracked' ? 1 : 0} warm={seg === 'sealed' ? 1 : 0} />}
        <g transform={zoom ? `translate(540 960) scale(${zoom.k}) translate(${-zoom.x} ${-zoom.y})` : undefined}>
          <Camera scale={camScale}>
            {!cream ? <StageLine id="bs" /> : null}
            {bots.map(({ k, cracks, pose }) => (
              <Bot key={k} kind={k} frame={frame} cracks={cracks} silhouette={cream} {...pose} />
            ))}
            {seg === 'cracked' || seg === 'safe'
              ? KINDS.map((k) => <Shards key={k} kind={k} impacts={SHEET_IMPACTS[k]} t={10 + (frame - (seg === 'safe' ? 400 : 150)) * 0.5} seed="sheet" />)
              : null}
            {cream ? KINDS.map((k) => <Shards key={k} kind={k} impacts={SHEET_IMPACTS[k]} t={1} seed="sheet" silhouette />) : null}
          </Camera>
          {seg === 'safe' ? (
            <g>
              <rect x={SAFE.x0} y={SAFE.y0} width={SAFE.x1 - SAFE.x0} height={SAFE.y1 - SAFE.y0} fill="none" stroke={C.gold} strokeWidth={2} strokeDasharray="8 8" />
              <Camera scale={camScale}>
                {bots.map(({ k, pose }) => {
                  const b = botBounds(k, pose);
                  return <rect key={k} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="none" stroke={C.ember} strokeWidth={1} />;
                })}
              </Camera>
            </g>
          ) : null}
        </g>
      </Canvas>
    </AbsoluteFill>
  );
};
