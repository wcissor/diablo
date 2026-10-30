// Dev-only inspection pages for the final bots (not part of the contract):
// Zoom: each bot at 2.1x (the lens's zoom) damaged, sealing and sealed;
// Hits: every bot through the hit, frame by frame; Fix: the chip snap and the
// pour, seal by seal; White: the whole arc on a white stage.
import React from 'react';
import { AbsoluteFill, Composition, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import type { BotKind, ConceptBotProps } from './kit/types';
import { ConceptBotImpl as Bot } from './Bot';

const K: BotKind[] = ['bubble', 'cube', 'orb'];
const At: React.FC<{ x: number; y: number; s?: number; p: ConceptBotProps }> = ({ x, y, s = 1, p }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <Bot {...p} />
  </g>
);
const T: React.FC<{ x: number; y: number; t: string; c?: string }> = ({ x, y, t, c = C.white }) => (
  <text x={x} y={y} fontFamily={FONT.sans} fontWeight={700} fontSize={22} fill={c} opacity={0.7}>
    {t}
  </text>
);

const Zoom: React.FC = () => {
  const f = 100 + useCurrentFrame();
  const cols: { t: string; p: Omit<ConceptBotProps, 'kind'> }[] = [
    { t: 'damaged', p: { frame: f, bg: 'maroon', mood: 'worried', hitT: 40 } },
    { t: 'seal 0.55', p: { frame: f, bg: 'maroon', mood: 'worried', hitT: 60, seal: 0.55 } },
    { t: 'sealed', p: { frame: f, bg: 'maroon', mood: 'proud', hitT: 90, seal: 1, sealT: 40 } },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {K.map((k, i) =>
          cols.map((c, j) => (
            <g key={`${k}${j}`}>
              <T x={12 + j * 360} y={30 + i * 640} t={`${k} · ${c.t}`} />
              <g transform={`translate(${180 + j * 360} ${600 + i * 640})`}>
                <At x={0} y={0} s={1.45} p={{ kind: k, ...c.p }} />
              </g>
            </g>
          )),
        )}
      </svg>
    </AbsoluteFill>
  );
};

const Grid: React.FC<{ ts: number[]; make: (k: BotKind, t: number) => ConceptBotProps; label: (t: number) => string; bg?: string }> = ({ ts, make, label, bg = C.maroon }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {K.map((k, i) =>
          ts.map((t, j) => {
            const row = i * 2 + Math.floor(j / 4);
            const col = j % 4;
            return (
              <g key={`${k}${t}`}>
                <T x={col * 270 + 12} y={row * 320 + 28} t={`${k} ${label(t)}`} c={bg === C.white ? C.maroon : C.white} />
                <At x={col * 270 + 135} y={row * 320 + 300} s={0.85} p={make(k, t)} />
              </g>
            );
          }),
        )}
      </svg>
    </AbsoluteFill>
  );
};

const Hits: React.FC = () => (
  <Grid ts={[0, 1, 2, 3, 4, 6, 8, 12]} label={(t) => `hitT ${t}`} make={(k, t) => ({ kind: k, frame: 100 + t, bg: 'maroon', mood: 'worried', hitT: t })} />
);
const Fix: React.FC = () => (
  <Grid
    ts={[0.07, 0.13, 0.2, 0.4, 0.6, 0.8, 1, 1.01]}
    label={(s) => (s > 1 ? 'sealT 1' : `seal ${s}`)}
    make={(k, s) => ({ kind: k, frame: 100, bg: 'maroon', mood: s > 1 ? 'proud' : 'worried', hitT: 60, seal: Math.min(1, s), sealT: s > 1 ? 1 : undefined })}
  />
);
const Cheer: React.FC = () => (
  <Grid
    ts={[0, 2, 4, 6, 9, 13, 30, 52]}
    label={(t) => `sealT ${t}`}
    make={(k, t) => ({ kind: k, frame: 100 + t, bg: 'maroon', mood: 'proud', hitT: 90, seal: 1, sealT: t })}
  />
);
const White: React.FC = () => (
  <Grid
    ts={[0, 1, 5, 40, 41, 60, 61, 62]}
    label={(t) => ['hit 0', 'hit 1', 'hit 5', 'damaged', 'seal .1', 'seal .6', 'sealT 2', 'proud'][[0, 1, 5, 40, 41, 60, 61, 62].indexOf(t)]}
    bg={C.white}
    make={(k, t) => {
      const base = { kind: k, frame: 100, bg: 'white' as const };
      if (t <= 5) return { ...base, mood: 'worried', hitT: t };
      if (t === 40) return { ...base, mood: 'worried', hitT: 40 };
      if (t === 41) return { ...base, mood: 'worried', hitT: 50, seal: 0.1 };
      if (t === 60) return { ...base, mood: 'worried', hitT: 60, seal: 0.6 };
      if (t === 61) return { ...base, mood: 'proud', hitT: 70, seal: 1, sealT: 2 };
      return { ...base, mood: 'proud', hitT: 90, seal: 1, sealT: 40 };
    }}
  />
);


// Resting states alone on a flat stage, feet at the middle-bottom of each 360×480
// cell, for measuring against BOT_BOX: idle, worried looking up, damaged, proud.
const Rest: React.FC = () => {
  const f = 100 + useCurrentFrame();
  const states: Omit<ConceptBotProps, 'kind'>[] = [
    { frame: f, bg: 'maroon', mood: 'happy' },
    { frame: f, bg: 'maroon', mood: 'worried', look: { x: 0, y: -1 } },
    { frame: f, bg: 'maroon', mood: 'worried', hitT: 40 },
    { frame: f, bg: 'maroon', mood: 'proud', hitT: 90, seal: 1, sealT: 40 },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {K.map((k, i) => states.map((p, j) => <At key={`${k}${j}`} x={180 + i * 360} y={400 + j * 480} p={{ kind: k, ...p }} />))}
      </svg>
    </AbsoluteFill>
  );
};

export const LabRoot = () => (
  <>
    <Composition id="Zoom" component={Zoom} durationInFrames={60} fps={30} width={1080} height={1920} />
    <Composition id="Hits" component={Hits} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Fix" component={Fix} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Cheer" component={Cheer} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="White" component={White} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Rest" component={Rest} durationInFrames={60} fps={30} width={1080} height={1920} />
  </>
);
