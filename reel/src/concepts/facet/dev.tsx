// Dev only: close-ups of the facet bots (not used by the reel).
//   Zoom (frame 0/1/2 = bubble/cube/orb): six states at 1.5x on maroon; 3-5 the
//   celebration, 6-8 the hit frame by frame.
//   Lens (frame 0): each bot's damage under the reel's 2.1x lens, damaged and sealed.
import React from 'react';
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame } from 'remotion';
import { C } from '../../theme';
import type { BotKind, ConceptBotProps } from '../_kit/types';
import { ConceptBotImpl as Bot } from './Bot';
import { FACET_IMPACT } from './shapes';

const K: BotKind[] = ['bubble', 'cube', 'orb'];

const Zoom: React.FC = () => {
  const f = useCurrentFrame();
  const kind = K[f % 3];
  const party: { label: string; p: Partial<ConceptBotProps> }[] = [0, 2, 4, 7, 10, 16].map((t) => ({
    label: `sealT ${t}`,
    p: { mood: 'proud', hitT: 90, seal: 1, sealT: t },
  }));
  const hits: { label: string; p: Partial<ConceptBotProps> }[] = [0, 1, 3, 8, 10, 13].map((t) => ({ label: `hitT ${t}`, p: { mood: 'worried', hitT: t } }));
  const cells: { label: string; p: Partial<ConceptBotProps> }[] = f >= 6 ? hits : f >= 3 ? party : [
    { label: 'hitT 0', p: { mood: 'worried', hitT: 0 } },
    { label: 'hitT 2', p: { mood: 'worried', hitT: 2 } },
    { label: 'hitT 5', p: { mood: 'worried', hitT: 5 } },
    { label: 'hitT 40 (damaged)', p: { mood: 'worried', hitT: 40 } },
    { label: 'seal 0.5', p: { mood: 'worried', hitT: 60, seal: 0.5 } },
    { label: 'proud (sealT 30)', p: { mood: 'proud', hitT: 90, seal: 1, sealT: 30 } },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {cells.map((c, i) => {
          const x = 270 + (i % 2) * 540;
          const y = 560 + Math.floor(i / 2) * 620;
          return (
            <g key={i}>
              <text x={x - 250} y={y - 470} fill={C.white} opacity={0.7} fontSize={26} fontFamily="sans-serif">
                {c.label}
              </text>
              <g transform={`translate(${x} ${y}) scale(1.55)`}>
                <Bot kind={kind} frame={100} bg="maroon" {...c.p} />
              </g>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// The reel's lens: r 130, zoom 2.1 about the damage centre.
const Lens: React.FC = () => {
  const R = 130;
  const Z = 2.1;
  const rows: { label: string; p: Partial<ConceptBotProps> }[] = [
    { label: 'damaged', p: { mood: 'worried', hitT: 40 } },
    { label: 'seal 0.6', p: { mood: 'worried', hitT: 60, seal: 0.6 } },
    { label: 'fixed', p: { mood: 'proud', hitT: 90, seal: 1, sealT: 30 } },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.maroon }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        <defs>
          {rows.map((_, r) =>
            K.map((k, i) => (
              <clipPath key={`${r}${k}`} id={`lens-${r}-${k}`}>
                <circle cx={190 + i * 350} cy={330 + r * 600} r={R} />
              </clipPath>
            )),
          )}
        </defs>
        {rows.map((row, r) =>
          K.map((k, i) => {
            const cx = 190 + i * 350;
            const cy = 330 + r * 600;
            const P = FACET_IMPACT[k];
            return (
              <g key={`${r}${k}`}>
                <text x={cx - 150} y={cy - 160} fill={C.white} opacity={0.7} fontSize={24} fontFamily="sans-serif">
                  {`${k} · ${row.label}`}
                </text>
                <g clipPath={`url(#lens-${r}-${k})`}>
                  <rect x={cx - R} y={cy - R} width={2 * R} height={2 * R} fill={C.maroon} />
                  <g transform={`translate(${cx} ${cy}) scale(${Z}) translate(${-P.x} ${-P.y})`}>
                    <Bot kind={k} frame={100} bg="maroon" {...row.p} />
                  </g>
                </g>
                <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.white} strokeWidth={10} />
                <g transform={`translate(${cx} ${cy + 330})`}>
                  <Bot kind={k} frame={100} bg="maroon" {...row.p} />
                </g>
              </g>
            );
          }),
        )}
      </svg>
    </AbsoluteFill>
  );
};

// Every face state on white: gaze, blinks, moods.
const Faces: React.FC = () => {
  const cols: { label: string; p: Partial<ConceptBotProps> }[] = [
    { label: 'look L', p: { look: { x: -1, y: 0 } } },
    { label: 'look R', p: { look: { x: 1, y: 0.3 } } },
    { label: 'blink .5', p: { blink: 0.5 } },
    { label: 'blink 1', p: { blink: 1 } },
    { label: 'worried', p: { mood: 'worried', look: { x: 0.6, y: 0 } } },
    { label: 'worried blink', p: { mood: 'worried', blink: 0.6 } },
    { label: 'proud', p: { mood: 'proud' } },
    { label: 'hit 1 white', p: { mood: 'worried', hitT: 1 } },
    { label: 'dmg white', p: { mood: 'worried', hitT: 40 } },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: C.white }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {K.map((k, r) =>
          cols.map((c, i) => {
            const x = 130 + (i % 3) * 410;
            const y = 330 + Math.floor(i / 3) * 620 + r * 0;
            return (
              <g key={`${k}${i}`} transform={`translate(${x + (r - 1) * 0} ${y})`}>
                {r === 0 ? (
                  <text x={-110} y={-280} fill={C.maroon} fontSize={24} fontFamily="sans-serif">
                    {c.label}
                  </text>
                ) : null}
                <g transform={`translate(${(r - 1) * 125} ${0}) scale(0.5)`}>
                  <Bot kind={k} frame={100} bg="white" {...c.p} />
                </g>
              </g>
            );
          }),
        )}
      </svg>
    </AbsoluteFill>
  );
};

// One bot alone on flat green at (540, 1000), for measuring its extent.
const Box: React.FC = () => {
  const f = useCurrentFrame();
  const kind = K[f % 3];
  const states: Partial<ConceptBotProps>[] = [
    { mood: 'happy' },
    { mood: 'worried', look: { x: -1, y: -1 } },
    { mood: 'worried', hitT: 40 },
    { mood: 'proud', hitT: 90, seal: 1, sealT: 40 },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: '#00FF00' }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        <g transform="translate(540 1000)">
          <Bot kind={kind} frame={100 + Math.floor(f / 3) * 7} bg="maroon" {...states[Math.floor(f / 3)]} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};

registerRoot(() => (
  <>
    <Composition id="Zoom" component={Zoom} durationInFrames={9} fps={30} width={1080} height={1920} />
    <Composition id="Lens" component={Lens} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Faces" component={Faces} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Box" component={Box} durationInFrames={12} fps={30} width={1080} height={1920} />
  </>
));
