// Dev-only inspection pages for this concept (not part of the contract).
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Composition, continueRender, delayRender } from 'remotion';
import { C, FONT } from '../../../theme';
import { ensureFonts } from '../../../lib/fonts';
import type { BotKind, ConceptBotProps } from '../../_kit/types';
import { ConceptBotImpl as Bot } from '../Bot';

const K: BotKind[] = ['bubble', 'cube', 'orb'];
const useFonts = () => {
  const [h] = useState(() => delayRender('fonts'));
  useEffect(() => {
    ensureFonts().then(() => continueRender(h));
  }, [h]);
};
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

// 2.1x: damaged (left) and sealed + proud (right), one row per bot, like the lens.
const Zoom: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {K.map((k, i) => (
          <g key={k}>
            <T x={20} y={30 + i * 640} t={`${k} · damaged (hitT 40) · sealed (sealT 40) · 2.1x`} />
            <At x={270} y={610 + i * 640} s={2.1} p={{ kind: k, frame: 100, bg: 'maroon', mood: 'worried', hitT: 40 }} />
            <At x={810} y={610 + i * 640} s={2.1} p={{ kind: k, frame: 100, bg: 'maroon', mood: 'proud', hitT: 90, seal: 1, sealT: 40 }} />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// Every bot through the hit: hitT 0 1 2 3 / 4 6 8 12.
const HitPage: React.FC = () => {
  useFonts();
  const ts = [0, 1, 2, 3, 4, 6, 8, 12];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {K.map((k, i) =>
          ts.map((t, j) => {
            const row = i * 2 + Math.floor(j / 4);
            const col = j % 4;
            return (
              <g key={`${k}${t}`}>
                <T x={col * 270 + 12} y={row * 320 + 28} t={`${k} ${t}`} />
                <At x={col * 270 + 135} y={row * 320 + 300} s={0.85} p={{ kind: k, frame: 100 + t, bg: 'maroon', mood: 'worried', hitT: t }} />
              </g>
            );
          }),
        )}
      </svg>
    </AbsoluteFill>
  );
};

// Every bot through the fix: seal 0 .25 .5 .75 / sealT 0 3 8 14 / proud on white.
const SealPage: React.FC = () => {
  useFonts();
  const st: { seal: number; sealT?: number; mood: 'worried' | 'proud'; l: string }[] = [
    { seal: 0.2, mood: 'worried', l: 'seal .2' },
    { seal: 0.5, mood: 'worried', l: 'seal .5' },
    { seal: 0.8, mood: 'worried', l: 'seal .8' },
    { seal: 0.97, mood: 'worried', l: 'seal .97' },
    { seal: 1, sealT: 0, mood: 'proud', l: 'sealT 0' },
    { seal: 1, sealT: 4, mood: 'proud', l: 'sealT 4' },
    { seal: 1, sealT: 8, mood: 'proud', l: 'sealT 8' },
    { seal: 1, sealT: 14, mood: 'proud', l: 'sealT 14' },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {K.map((k, i) =>
          st.map((s, j) => {
            const row = i * 2 + Math.floor(j / 4);
            const col = j % 4;
            return (
              <g key={`${k}${j}`}>
                <T x={col * 270 + 12} y={row * 320 + 28} t={`${k} ${s.l}`} />
                <At x={col * 270 + 135} y={row * 320 + 300} s={0.85} p={{ kind: k, frame: 100, bg: 'maroon', mood: s.mood, hitT: 60, seal: s.seal, sealT: s.sealT }} />
              </g>
            );
          }),
        )}
      </svg>
    </AbsoluteFill>
  );
};

// Model sheet, 1.9x: each bot happy on white, worried and proud on maroon.
const Model: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        <rect width={1080} height={640} fill={C.white} />
        {K.map((k, i) => (
          <g key={k}>
            <At x={540} y={590} s={1.9} p={{ kind: k, frame: 100, bg: 'white', mood: 'happy' }} />
          </g>
        )).filter((_, i) => i === 1)}
        <At x={190} y={590} s={1.35} p={{ kind: 'bubble', frame: 100, bg: 'white', mood: 'happy' }} />
        <At x={890} y={590} s={1.35} p={{ kind: 'orb', frame: 100, bg: 'white', mood: 'happy' }} />
        {K.map((k, i) => (
          <g key={k}>
            <At x={190 + i * 350} y={1230} s={1.35} p={{ kind: k, frame: 100, bg: 'maroon', mood: 'worried', look: { x: 0.6, y: -0.5 } }} />
            <At x={190 + i * 350} y={1880} s={1.35} p={{ kind: k, frame: 100, bg: 'maroon', mood: 'proud' }} />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// BOT_BOX check: one state per 360×380 cell, feet at the cell's (180, 320), on a key colour.
export const BOX_STATES: { l: string; p: Partial<ConceptBotProps> }[] = [
  { l: 'idle', p: { mood: 'happy' } },
  { l: 'worried up', p: { mood: 'worried', look: { x: 0, y: -0.8 } } },
  { l: 'proud', p: { mood: 'proud' } },
  { l: 'hit 0', p: { mood: 'worried', hitT: 0 } },
  { l: 'hit 1.5', p: { mood: 'worried', hitT: 1.5 } },
  { l: 'hit 3', p: { mood: 'worried', hitT: 3 } },
  { l: 'damaged', p: { mood: 'worried', hitT: 40 } },
  { l: 'seal .5', p: { mood: 'worried', hitT: 60, seal: 0.5 } },
  { l: 'sealT 0', p: { mood: 'proud', hitT: 60, seal: 1, sealT: 0 } },
  { l: 'sealT 4', p: { mood: 'proud', hitT: 60, seal: 1, sealT: 4 } },
  { l: 'sealT 8', p: { mood: 'proud', hitT: 60, seal: 1, sealT: 8 } },
  { l: 'sealT 12', p: { mood: 'proud', hitT: 60, seal: 1, sealT: 12 } },
  { l: 'fixed', p: { mood: 'proud', hitT: 90, seal: 1, sealT: 40 } },
  { l: 'happy look', p: { mood: 'happy', look: { x: 1, y: 0.5 } } },
  { l: 'damaged white', p: { mood: 'worried', hitT: 40, bg: 'white' } },
];
const BoxPage: React.FC<{ kind: BotKind }> = ({ kind }) => (
  <AbsoluteFill style={{ backgroundColor: '#00FF00' }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      {BOX_STATES.map((st, i) => (
        <g key={i} transform={`translate(${(i % 3) * 360 + 180} ${Math.floor(i / 3) * 380 + 320})`}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((f) => (
            <Bot key={f} kind={kind} frame={f * 7} bg="maroon" {...st.p} />
          ))}
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);

// Blink 0.5 / 1 in each mood, and the damage and the weld drawn on white.
const Checks: React.FC = () => {
  useFonts();
  const rows: { l: string; p: Partial<ConceptBotProps> }[] = [
    { l: 'happy blink .5', p: { mood: 'happy', blink: 0.5 } },
    { l: 'worried blink 1', p: { mood: 'worried', blink: 1 } },
    { l: 'proud blink .6', p: { mood: 'proud', blink: 0.6 } },
    { l: 'damaged on white', p: { mood: 'worried', hitT: 40, bg: 'white' } },
    { l: 'hit 1 on white', p: { mood: 'worried', hitT: 1, bg: 'white' } },
    { l: 'seal .5 on white', p: { mood: 'worried', hitT: 60, seal: 0.5, bg: 'white' } },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.white }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {rows.map((r, i) => (
          <g key={i}>
            <rect y={i * 320} width={1080} height={320} fill={r.p.bg === 'white' ? C.white : C.maroon} />
            <T x={12} y={i * 320 + 26} t={r.l} c={r.p.bg === 'white' ? C.maroon : C.white} />
            {K.map((k, j) => (
              <At key={k} x={190 + j * 350} y={i * 320 + 300} s={0.95} p={{ kind: k, frame: 100, bg: 'maroon', ...r.p }} />
            ))}
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

export const LabRoot: React.FC = () => (
  <>
    <Composition id="Checks" component={Checks} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Zoom" component={Zoom} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Hit" component={HitPage} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Seal" component={SealPage} durationInFrames={1} fps={30} width={1080} height={1920} />
 <Composition id="Model" component={Model} durationInFrames={1} fps={30} width={1080} height={1920} />
    {K.map((k) => (
      <Composition key={k} id={`Box-${k}`} component={() => <BoxPage kind={k} />} durationInFrames={1} fps={30} width={1080} height={1920} />
    ))}
  </>
);
