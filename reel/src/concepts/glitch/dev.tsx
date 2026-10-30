// Dev only: the damage as the reel's lens sees it (2.1x), on maroon and on white.
import React from 'react';
import { AbsoluteFill, Composition, registerRoot } from 'remotion';
import { C } from '../../theme';
import type { ConceptBotProps } from '../_kit/types';
import { ConceptBotImpl as Bot } from './Bot';

const cells: ConceptBotProps[] = [
  { kind: 'bubble', frame: 100, bg: 'maroon', mood: 'worried', hitT: 40 },
  { kind: 'bubble', frame: 100, bg: 'maroon', mood: 'worried', hitT: 60, seal: 0.5 },
  { kind: 'cube', frame: 100, bg: 'maroon', mood: 'worried', hitT: 40 },
  { kind: 'cube', frame: 100, bg: 'maroon', mood: 'proud', hitT: 90, seal: 1, sealT: 30 },
  { kind: 'orb', frame: 100, bg: 'maroon', mood: 'worried', hitT: 40 },
  { kind: 'orb', frame: 100, bg: 'maroon', mood: 'proud', hitT: 90, seal: 1, sealT: 30 },
];

const Zoom: React.FC<{ bg: 'white' | 'maroon' }> = ({ bg }) => (
  <AbsoluteFill style={{ backgroundColor: bg === 'white' ? C.white : C.maroon }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      {cells.map((p, i) => (
        <g key={i} transform={`translate(${i % 2 ? 790 : 280} ${600 + Math.floor(i / 2) * 630}) scale(2.1)`}>
          <Bot {...p} bg={bg} />
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);

// Moments at 1x: blinks and gaze, a hit on white, and the cheer frame by frame.
const moments: [number, number, ConceptBotProps][] = [
  [180, 300, { kind: 'bubble', frame: 100, bg: 'white', mood: 'happy', blink: 0.5 }],
  [540, 300, { kind: 'cube', frame: 100, bg: 'white', mood: 'happy', blink: 1, look: { x: 1, y: 0 } }],
  [900, 300, { kind: 'orb', frame: 100, bg: 'white', mood: 'worried', look: { x: -1, y: 0.6 }, blink: 1 }],
  [180, 640, { kind: 'bubble', frame: 100, bg: 'white', mood: 'worried', hitT: 0 }],
  [540, 640, { kind: 'cube', frame: 100, bg: 'white', mood: 'worried', hitT: 1 }],
  [900, 640, { kind: 'orb', frame: 100, bg: 'white', mood: 'worried', hitT: 40 }],
  [180, 1000, { kind: 'orb', frame: 100, bg: 'maroon', mood: 'proud', hitT: 60, seal: 1, sealT: 0 }],
  [540, 1000, { kind: 'orb', frame: 100, bg: 'maroon', mood: 'proud', hitT: 60, seal: 1, sealT: 3 }],
  [900, 1000, { kind: 'orb', frame: 100, bg: 'maroon', mood: 'proud', hitT: 60, seal: 1, sealT: 6 }],
  [180, 1360, { kind: 'cube', frame: 100, bg: 'maroon', mood: 'worried', hitT: 60, seal: 0.15 }],
  [540, 1360, { kind: 'cube', frame: 100, bg: 'maroon', mood: 'worried', hitT: 60, seal: 0.8 }],
  [900, 1360, { kind: 'cube', frame: 100, bg: 'maroon', mood: 'proud', hitT: 60, seal: 1, sealT: 10 }],
  [180, 1720, { kind: 'bubble', frame: 100, bg: 'maroon', mood: 'worried', hitT: 3 }],
  [540, 1720, { kind: 'cube', frame: 100, bg: 'maroon', mood: 'worried', hitT: 4 }],
  [900, 1720, { kind: 'orb', frame: 100, bg: 'maroon', mood: 'worried', hitT: 8 }],
];
const Moments: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.maroon }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <rect width={1080} height={780} fill={C.white} />
      {moments.map(([x, y, p], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <Bot {...p} />
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);

registerRoot(() => (
  <>
    <Composition id="Zoom" component={Zoom} defaultProps={{ bg: 'maroon' as const }} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Moments" component={Moments} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="ZoomWhite" component={Zoom} defaultProps={{ bg: 'white' as const }} durationInFrames={1} fps={30} width={1080} height={1920} />
  </>
));
