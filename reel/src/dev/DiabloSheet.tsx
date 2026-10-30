import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { BOTS, STAGE_Y } from '../geometry';
import { Canvas } from '../stage/Camera';
import { LightPool, StageLine } from '../stage/Stage';
import { Grain, Vignette } from '../stage/Grain';
import { DiabloHead, eyeCentres, Mark, type DiabloEyeState } from '../cast/Diablo';
import { clawTips, Hand, handBounds } from '../cast/Hands';
import { Tail, tailTips } from '../cast/Tail';
import type { HandProps, HeadProps, TailRing } from '../cast/types';
import type { Pt } from '../lib/anim';

// Dev sheet for Diablo, his hands and tail. Sections by frame:
//   0 settled head + hovering hands on the stage   50 eyes only
// 100 strike pose with clawTips markers           150 narrowed eyes, look, crescent with 4 seams
// 200 ring half swept                              250 ring closed with gold edge
// 300 silhouettes on cream                         350 the mark   360 the mark mid-blink
// 400 claw-tip check at several poses (large)   450 rising head, flipped scythe, ring at 0.93
// 500 eye states: open / narrow 0.5 / narrow 1 (pleased) / glare 1 (menacing)

// Faint outlines where the bots will stand.
const BotGhosts: React.FC = () => (
  <g fill="none" stroke={C.cream} strokeOpacity={0.22} strokeWidth={2} strokeDasharray="6 6">
    <rect x={BOTS.bubble.cx - 115} y={STAGE_Y - 214} width={230} height={190} rx={60} />
    <rect x={BOTS.cube.cx - 100} y={STAGE_Y - 210} width={200} height={200} rx={34} />
    <line x1={BOTS.cube.cx} y1={STAGE_Y - 210} x2={BOTS.cube.cx} y2={STAGE_Y - 250} />
    <circle cx={BOTS.orb.cx} cy={BOTS.orb.feetY - 100} r={100} />
    <ellipse cx={BOTS.orb.cx} cy={BOTS.orb.feetY - 100} rx={140} ry={34} transform={`rotate(-12 ${BOTS.orb.cx} ${BOTS.orb.feetY - 100})`} />
  </g>
);

const Marker: React.FC<{ p: Pt; color?: string; r?: number }> = ({ p, color = '#00E5FF', r = 5 }) => (
  <g>
    <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={color} strokeWidth={1.5} />
    <line x1={p.x - r - 4} y1={p.y} x2={p.x + r + 4} y2={p.y} stroke={color} strokeWidth={1} />
    <line x1={p.x} y1={p.y - r - 4} x2={p.x} y2={p.y + r + 4} stroke={color} strokeWidth={1} />
  </g>
);

const Stage: React.FC<{ id: string; ember?: number; warm?: number; children: React.ReactNode; ghosts?: boolean }> = ({
  id,
  ember = 0,
  warm = 0,
  children,
  ghosts = true,
}) => (
  <Canvas>
    <LightPool id={id} ember={ember} warm={warm} />
    <StageLine id={id} />
    {ghosts ? <BotGhosts /> : null}
    {children}
  </Canvas>
);

const hover = (frame: number): [HandProps, HandProps] => [
  { side: 'left', x: 195, y: 640, rot: -24, spread: 1, curl: 0, tremble: 2, frame },
  { side: 'right', x: 885, y: 640, rot: 24, spread: 1, curl: 0, tremble: 2, frame },
];

const strike = (): [HandProps, HandProps] => [
  { side: 'left', x: 262, y: 790, rot: 0, spread: 0.55, curl: 0.85 },
  { side: 'right', x: 806, y: 790, rot: 0, spread: 0.55, curl: 0.85 },
];

const ring = (progress: number, goldEdge: number): TailRing => ({ cx: 540, cy: 1188, rx: 380, ry: 92, progress, goldEdge, layer: 'back' });

export const DiabloSheet: React.FC = () => {
  const frame = useCurrentFrame();
  const settled: HeadProps = { eyes: { open: 1 }, clipBelowY: STAGE_Y };
  let body: React.ReactNode;

  if (frame < 50) {
    const [l, r] = hover(frame);
    body = (
      <Stage id="s0">
        <DiabloHead {...settled} />
        <Hand {...l} />
        <Hand {...r} />
      </Stage>
    );
  } else if (frame < 100) {
    body = (
      <Stage id="s1">
        <DiabloHead {...settled} eyesOnly />
      </Stage>
    );
  } else if (frame < 150) {
    const [l, r] = strike();
    const tips = [...clawTips(l), ...clawTips(r)];
    const bl = handBounds(l);
    const br = handBounds(r);
    body = (
      <Stage id="s2" ember={0.8}>
        <DiabloHead {...settled} ember={0.8} eyes={{ open: 1, look: { x: -6, y: 6 }, glare: 0.8 } as DiabloEyeState} />
        <Hand {...l} ember={0.8} />
        <Hand {...r} ember={0.8} />
        {tips.map((t, i) => (
          <Marker key={i} p={t} />
        ))}
        {[bl, br].map((b, i) => (
          <rect key={i} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="none" stroke="#00E5FF" strokeOpacity={0.4} strokeDasharray="4 6" />
        ))}
      </Stage>
    );
  } else if (frame < 200) {
    const head: HeadProps = { ...settled, eyes: { open: 1, narrow: 1, look: { x: 8, y: 2 } }, warm: 0.6 };
    const cres = { x: 860, y: 900, rot: -18, scale: 1 };
    const tt = tailTips(cres);
    body = (
      <Stage id="s3" warm={0.6}>
        <Tail crescent={cres} seams={4} warm={0.6} />
        <DiabloHead {...head} />
        {eyeCentres(head).map((e, i) => (
          <Marker key={i} p={e} r={3} />
        ))}
        <Marker p={tt.upper} />
        <Marker p={tt.lower} />
      </Stage>
    );
  } else if (frame < 250) {
    body = (
      <Stage id="s4">
        <DiabloHead {...settled} />
        <Tail ring={ring(0.5, 0)} />
        <BotGhosts />
        <Tail ring={{ ...ring(0.5, 0), layer: 'front' }} />
      </Stage>
    );
  } else if (frame < 300) {
    body = (
      <Stage id="s5" warm={0.5}>
        <DiabloHead {...settled} eyes={{ open: 1, narrow: 0.7 }} warm={0.5} />
        <Tail ring={ring(1, 1)} warm={0.4} />
        <BotGhosts />
        <Tail ring={{ ...ring(1, 1), layer: 'front' }} warm={0.4} />
      </Stage>
    );
  } else if (frame < 350) {
    const [l, r] = strike();
    body = (
      <AbsoluteFill style={{ backgroundColor: C.cream }}>
        <Canvas>
          <rect width={1080} height={1920} fill={C.cream} />
          <DiabloHead {...settled} silhouette />
          <Tail crescent={{ x: 900, y: 860, rot: -20 }} silhouette />
          <Hand {...l} silhouette />
          <Hand {...r} silhouette />
          <Tail ring={ring(0.7, 0)} silhouette />
          <Tail ring={{ ...ring(0.7, 0), layer: 'front' }} silhouette />
        </Canvas>
      </AbsoluteFill>
    );
  } else if (frame < 400) {
    const blink = frame >= 360 ? 0.6 : 0;
    body = (
      <Canvas>
        <rect width={1080} height={1920} fill={C.night} />
        <Mark blink={blink} />
        <line x1={0} x2={1080} y1={490} y2={490} stroke="#00E5FF" strokeOpacity={0.25} />
        <line x1={0} x2={1080} y1={910} y2={910} stroke="#00E5FF" strokeOpacity={0.25} />
        <line x1={540} x2={540} y1={400} y2={1000} stroke="#00E5FF" strokeOpacity={0.25} />
      </Canvas>
    );
  } else if (frame >= 450 && frame < 500) {
    // Misc: rising behind the stage line, a flipped scythe with 7½ seams, a ring about to close.
    const cres = { x: 250, y: 820, rot: 24, scale: 1.15, flip: true };
    const tt = tailTips(cres);
    const r = { ...ring(0.93, 0), cx: 540, cy: 1188 };
    body = (
      <Stage id="s9" ember={0.6}>
        <Tail ring={r} ember={0.6} />
        <DiabloHead eyes={{ open: 0.4 }} dy={250} rot={-6} clipBelowY={STAGE_Y} ember={0.6} />
        <Tail crescent={cres} seams={7.5} ember={0.6} />
        <Marker p={tt.upper} />
        <Marker p={tt.lower} />
        <Tail ring={{ ...r, layer: 'front' }} ember={0.6} />
        {/* the shot 6 dive: a small scythe, rotated, its hatch still 1.5/7 px at 9° */}
        <Tail crescent={{ x: 880, y: 760, rot: -70, scale: 0.45 }} seams={14} ember={0.6} />
      </Stage>
    );
  } else if (frame >= 500) {
    // Eye states, 2 × 2: open, narrow 0.5, narrow 1 (pleased), glare 1 (menacing).
    const cells: [number, number, DiabloEyeState][] = [
      [-250, -420, { open: 1 }],
      [250, -420, { open: 1, narrow: 0.5 }],
      [-250, 420, { open: 1, narrow: 1 }],
      [250, 420, { open: 1, glare: 1 }],
    ];
    body = (
      <Canvas>
        <rect width={1080} height={1920} fill={C.night} />
        {cells.map(([dx, dy, eyes], i) => {
          const head: HeadProps = { dx, dy, scale: 0.92, eyes, warm: 0.4 };
          return (
            <g key={i}>
              <DiabloHead {...head} />
              {eyeCentres(head).map((e, j) => (
                <Marker key={j} p={e} r={2} />
              ))}
            </g>
          );
        })}
      </Canvas>
    );
  } else {
    // Claw-tip check: several poses side by side, tips marked.
    const poses: HandProps[] = [
      { side: 'left', x: 200, y: 420, rot: 0, spread: 0, curl: 0 },
      { side: 'right', x: 560, y: 420, rot: 25, spread: 1, curl: 0 },
      { side: 'left', x: 880, y: 420, rot: -30, spread: 0.3, curl: 0.5, scale: 0.8 },
      { side: 'right', x: 230, y: 1150, rot: 0, spread: 0.55, curl: 1 },
      { side: 'left', x: 560, y: 1150, rot: 60, spread: 1, curl: 0.2, tremble: 3, frame },
      { side: 'right', x: 880, y: 1150, rot: -15, spread: 0.8, curl: 0.8 },
    ];
    body = (
      <Canvas>
        <rect width={1080} height={1920} fill={C.night} />
        {poses.map((p, i) => (
          <g key={i}>
            <Hand {...p} />
            {clawTips(p).map((t, j) => (
              <Marker key={j} p={t} r={4} />
            ))}
          </g>
        ))}
      </Canvas>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      {body}
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};
