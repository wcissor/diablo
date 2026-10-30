// Two compositions for judging a bot concept apples to apples:
//   Sheet — every state frozen on one 1080×1920 page (idle on white and maroon,
//           the hit sequence, cracked, sealing, sealed, proud).
//   Strip — the three bots in the reel's row on maroon, with the reel's rhythm
//           compressed: hits at frames 10 / 18 / 25, seams at 50 / 65 / 80.
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Composition, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { C, FONT } from '../../theme';
import { ensureFonts } from '../../lib/fonts';
import type { BotKind, ConceptBot, ConceptBotProps } from './types';

const K: BotKind[] = ['bubble', 'cube', 'orb'];

const useFonts = () => {
  const [h] = useState(() => delayRender('fonts'));
  useEffect(() => {
    ensureFonts().then(() => continueRender(h));
  }, [h]);
};

const Label: React.FC<{ y: number; text: string; color: string }> = ({ y, text, color }) => (
  <text x={24} y={y} fontFamily={FONT.sans} fontWeight={700} fontSize={26} fill={color} opacity={0.75}>
    {text}
  </text>
);

export const makeRoot = (Bot: ConceptBot) => {
  const At: React.FC<{ x: number; y: number; s?: number; p: ConceptBotProps }> = ({ x, y, s = 1, p }) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Bot {...p} />
    </g>
  );

  const Sheet: React.FC = () => {
    useFonts();
    const frame = 100;
    return (
      <AbsoluteFill style={{ backgroundColor: C.maroon }}>
        <svg width={1080} height={1920} viewBox="0 0 1080 1920">
          <rect width={1080} height={420} fill={C.white} />
          <rect y={1660} width={1080} height={260} fill={C.white} />
          <Label y={40} text="idle, happy · on white" color={C.maroon} />
          {K.map((k, i) => (
            <At key={k} x={[270, 540, 810][i]} y={390} p={{ kind: k, frame, bg: 'white', mood: 'happy' }} />
          ))}
          <Label y={460} text="worried · on maroon (look up)" color={C.white} />
          {K.map((k, i) => (
            <At key={k} x={[270, 540, 810][i]} y={810} p={{ kind: k, frame, bg: 'maroon', mood: 'worried', look: { x: 0, y: -0.8 } }} />
          ))}
          <Label y={880} text="bubble hit · hitT 0, 2, 5, 12" color={C.white} />
          {[0, 2, 5, 12].map((t, i) => (
            <At key={t} x={150 + i * 260} y={1210} s={0.72} p={{ kind: 'bubble', frame, bg: 'maroon', mood: 'worried', hitT: t }} />
          ))}
          <Label y={1280} text="cracked: cube, orb · sealing 0.5 · sealed (sealT 4)" color={C.white} />
          <At x={150} y={1620} s={0.72} p={{ kind: 'cube', frame, bg: 'maroon', mood: 'worried', hitT: 40 }} />
          <At x={410} y={1620} s={0.72} p={{ kind: 'orb', frame, bg: 'maroon', mood: 'worried', hitT: 40 }} />
          <At x={670} y={1620} s={0.72} p={{ kind: 'cube', frame, bg: 'maroon', mood: 'worried', hitT: 60, seal: 0.5 }} />
          <At x={930} y={1620} s={0.72} p={{ kind: 'orb', frame, bg: 'maroon', mood: 'proud', hitT: 60, seal: 1, sealT: 4 }} />
          <Label y={1700} text="fixed and proud · on white" color={C.maroon} />
          {K.map((k, i) => (
            <At key={k} x={[270, 540, 810][i]} y={1900} s={0.72} p={{ kind: k, frame, bg: 'white', mood: 'proud', hitT: 90, seal: 1, sealT: 30 }} />
          ))}
        </svg>
      </AbsoluteFill>
    );
  };

  const HIT: Record<BotKind, number> = { bubble: 10, orb: 18, cube: 25 };
  const SEAL: Record<BotKind, number> = { bubble: 50, orb: 65, cube: 80 };
  const Strip: React.FC = () => {
    const f = useCurrentFrame();
    return (
      <AbsoluteFill style={{ backgroundColor: C.maroon }}>
        <svg width={1080} height={1920} viewBox="0 0 1080 1920">
          {K.map((k) => {
            const hitT = f >= HIT[k] ? f - HIT[k] : undefined;
            const seal = f >= SEAL[k] ? Math.min(1, (f - SEAL[k]) / 15) : 0;
            const sealT = f >= SEAL[k] + 15 ? f - SEAL[k] - 15 : undefined;
            const mood = sealT !== undefined ? 'proud' : hitT !== undefined || f > 4 ? 'worried' : 'happy';
            const lift = sealT !== undefined && sealT < 12 ? 40 * Math.sin((Math.PI * sealT) / 12) : 0; // the reel's hop when a bot is fixed
            return (
              <At
                key={k}
                x={{ bubble: 270, cube: 540, orb: 800 }[k]}
                y={1030}
                p={{ kind: k, frame: f, bg: 'maroon', mood, hitT, seal: hitT !== undefined ? seal : undefined, sealT, lift, look: { x: 0, y: hitT === undefined ? -0.6 : 0 } }}
              />
            );
          })}
        </svg>
      </AbsoluteFill>
    );
  };

  return () => (
    <>
      <Composition id="Sheet" component={Sheet} durationInFrames={1} fps={30} width={1080} height={1920} />
      <Composition id="Strip" component={Strip} durationInFrames={100} fps={30} width={1080} height={1920} />
    </>
  );
};
