// Dev-only lab for this concept: the reel's 2.1× lens on each bot's damage, the
// hit frames up close, and the idle short-circuit zaps. Not used by the reel.
import React from 'react';
import { AbsoluteFill, Composition, useCurrentFrame } from 'remotion';
import { C } from '../../theme';
import type { BotKind, ConceptBotProps } from '../_kit/types';
import { ConceptBotImpl as Bot, DAMAGE_AT } from './Bot';

const K: BotKind[] = ['bubble', 'cube', 'orb'];

const Lens: React.FC<{ x: number; y: number; p: ConceptBotProps; id: string }> = ({ x, y, p, id }) => {
  const c = DAMAGE_AT[p.kind];
  const r = 130;
  return (
    <g>
      <clipPath id={id}>
        <circle cx={x} cy={y} r={r} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={C.maroon} />
        <g transform={`translate(${x} ${y}) scale(2.1) translate(${-c.x} ${-c.y})`}>
          <Bot {...p} />
        </g>
      </g>
      <circle cx={x} cy={y} r={r} fill="none" stroke={C.white} strokeWidth={10} />
    </g>
  );
};

const LabLens: React.FC = () => {
  const f = useCurrentFrame();
  const frame = 100 + f;
  const rows: { y: number; p: Omit<ConceptBotProps, 'kind'> }[] = [
    { y: 260, p: { frame, bg: 'maroon', mood: 'worried', hitT: 40 } },
    { y: 560, p: { frame, bg: 'maroon', mood: 'worried', hitT: 60, seal: 0.55 } },
    { y: 860, p: { frame, bg: 'maroon', mood: 'proud', hitT: 90, seal: 1, sealT: 40 } },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {rows.map((r, j) => K.map((k, i) => <Lens key={`${j}${k}`} id={`lens${j}${i}`} x={190 + i * 350} y={r.y} p={{ kind: k, ...r.p }} />))}
        {[0, 1, 2, 3].map((t, i) =>
          K.map((k, j) => (
            <g key={`${t}${k}`} transform={`translate(${150 + i * 260} ${1180 + j * 250}) scale(0.82)`}>
              <Bot kind={k} frame={frame} bg="maroon" mood="worried" hitT={t + (f % 2 === 1 ? 4 : 0)} />
            </g>
          )),
        )}
      </svg>
    </AbsoluteFill>
  );
};

// White stage: the whole arc on white, for contrast checks.
const LabWhite: React.FC = () => {
  const f = useCurrentFrame();
  const frame = 100 + f;
  const states: Omit<ConceptBotProps, 'kind' | 'frame' | 'bg'>[] = [
    { mood: 'happy' },
    { mood: 'worried', hitT: 1 },
    { mood: 'worried', hitT: 30 },
    { mood: 'worried', hitT: 60, seal: 0.5 },
    { mood: 'proud', hitT: 90, seal: 1, sealT: 3 },
    { mood: 'proud', hitT: 90, seal: 1, sealT: 40, blink: 0 },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.white }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {states.map((s, j) =>
          K.map((k, i) => (
            <g key={`${j}${k}`} transform={`translate(${200 + i * 340} ${300 + j * 300})`}>
              <Bot kind={k} frame={frame} bg="white" {...s} />
            </g>
          )),
        )}
      </svg>
    </AbsoluteFill>
  );
};

// Sequences: the idle sparks while damaged, the seam closing, the celebration hop.
const LabSeq: React.FC = () => {
  type Cell = { k: BotKind; p: Omit<ConceptBotProps, 'kind' | 'bg'> };
  const zap: Cell[] = [
    { k: 'bubble', p: { frame: 119, mood: 'worried', hitT: 40 } },
    { k: 'bubble', p: { frame: 120, mood: 'worried', hitT: 41 } },
    { k: 'cube', p: { frame: 121, mood: 'worried', hitT: 40 } },
    { k: 'cube', p: { frame: 122, mood: 'worried', hitT: 41 } },
    { k: 'orb', p: { frame: 117, mood: 'worried', hitT: 40 } },
    { k: 'orb', p: { frame: 118, mood: 'worried', hitT: 41 } },
  ];
  const seal: Cell[] = [0.08, 0.25, 0.45, 0.65, 0.85, 1].map((v) => ({ k: 'orb', p: { frame: 100, mood: 'worried', hitT: 60, seal: v } }));
  const party: Cell[] = [0, 2, 4, 7, 10, 13].map((t) => ({ k: 'cube', p: { frame: 100 + t, mood: 'proud', hitT: 80, seal: 1, sealT: t } }));
  const party2: Cell[] = [0, 2, 4, 7, 10, 13].map((t) => ({ k: 'bubble', p: { frame: 100 + t, mood: 'proud', hitT: 80, seal: 1, sealT: t } }));
  const blinks: Cell[] = [
    { k: 'bubble', p: { frame: 100, mood: 'happy', blink: 0.5 } },
    { k: 'bubble', p: { frame: 100, mood: 'happy', blink: 1 } },
    { k: 'orb', p: { frame: 100, mood: 'worried', blink: 1 } },
    { k: 'orb', p: { frame: 100, mood: 'proud', blink: 1, hitT: 90, seal: 1, sealT: 40 } },
    { k: 'cube', p: { frame: 100, mood: 'happy', blink: 0.6 } },
    { k: 'bubble', p: { frame: 100, mood: 'proud', blink: 1, hitT: 90, seal: 1, sealT: 40 } },
  ];
  const rows = [zap, seal, party, party2, blinks];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {rows.map((r, j) =>
          r.map((c, i) => (
            <g key={`${j}${i}`} transform={`translate(${95 + i * 178} ${300 + j * 360}) scale(0.7)`}>
              <Bot kind={c.k} bg="maroon" {...c.p} />
            </g>
          )),
        )}
      </svg>
    </AbsoluteFill>
  );
};

// Bounds: every resting state on a detection colour (dev only), 4 × 6 cells of
// 270 × 320 with the feet at (135, 290) in each, frame from the composition clock.
export const BOUNDS_STATES: Omit<ConceptBotProps, 'kind' | 'frame' | 'bg'>[] = [
  { mood: 'happy' },
  { mood: 'worried', look: { x: -1, y: -1 } },
  { mood: 'worried', hitT: 40 },
  { mood: 'worried', hitT: 60, seal: 0.5 },
  { mood: 'proud', hitT: 90, seal: 1, sealT: 40 },
  { mood: 'happy', look: { x: 1, y: 1 }, blink: 1 },
  { mood: 'proud', blink: 0.5 },
  { mood: 'worried', hitT: 22 },
];
const LabBounds: React.FC = () => {
  const f = useCurrentFrame();
  const cells = K.flatMap((k) => BOUNDS_STATES.map((s) => ({ k, s })));
  return (
    <AbsoluteFill style={{ backgroundColor: '#00ff00' }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {cells.map((c, i) => (
          <g key={i} transform={`translate(${(i % 4) * 270 + 135} ${Math.floor(i / 4) * 320 + 290})`}>
            <Bot kind={c.k} frame={f} bg={i % 2 ? 'white' : 'maroon'} {...c.s} />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

export const LabRoot: React.FC = () => (
  <>
    <Composition id="LabBounds" component={LabBounds} durationInFrames={200} fps={30} width={1080} height={1920} />
    <Composition id="LabSeq" component={LabSeq} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="LabLens" component={LabLens} durationInFrames={60} fps={30} width={1080} height={1920} />
    <Composition id="LabWhite" component={LabWhite} durationInFrames={60} fps={30} width={1080} height={1920} />
  </>
);
