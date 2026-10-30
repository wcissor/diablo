import React from 'react';
import type { BotKind } from '../geometry';
import { STAGE_Y } from '../geometry';
import { C } from '../theme';
import type { BotProps, HandProps, HeadProps, Pt, TailProps } from '../cast/types';
import { Bot, Shards } from '../cast/Bots';
import { DiabloHead } from '../cast/Diablo';
import { Hand } from '../cast/Hands';
import { Tail } from '../cast/Tail';
import { Camera } from '../stage/Camera';
import { LightPool, StageLine } from '../stage/Stage';

// A gold spark in flight, with its trail (most recent first).
export interface Spark {
  at: Pt;
  trail: Pt[];
}

// Everything a shot decides for one frame. Shots are pure functions
// frame → SceneState; the Scene draws it in one fixed layer order.
export interface SceneState {
  frame: number;
  camera: { scale: number; dx?: number; dy?: number };
  light: { level?: number; warm?: number; ember?: number; rx?: number; ry?: number; cy?: number };
  dim?: number; // 0..1 night over the whole stage (the light flicker)
  head?: HeadProps;
  tailBack?: TailProps; // behind the bots (clipped at the stage line)
  tailFront?: TailProps; // in front of the bots
  hands?: HandProps[];
  handsBack?: HandProps[]; // behind the bots, rising from behind the stage line (clipped at it)
  bots: Record<BotKind, Omit<BotProps, 'kind' | 'frame'>>;
  shards?: { kind: BotKind; impacts: Pt[]; t: number; seed: string }[];
  sparks?: Spark[]; // shot 5: what he learned, flying to his crescent
  flash?: boolean; // the impact flash: cream frame, every character a night silhouette
}

const ORDER: BotKind[] = ['bubble', 'cube', 'orb'];

export const Scene: React.FC<{ s: SceneState; id: string }> = ({ s, id }) => {
  const sil = !!s.flash;
  return (
    <Camera scale={s.camera.scale} dx={s.camera.dx} dy={s.camera.dy}>
      <defs>
        <clipPath id={`${id}-behind`}>
          <rect x={-400} y={-400} width={1880} height={STAGE_Y + 400} />
        </clipPath>
        <linearGradient id={`${id}-reflfade`} x1="0" x2="0" y1={STAGE_Y} y2={STAGE_Y + 230} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity={0.2} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${id}-refl`} maskUnits="userSpaceOnUse" x={-400} y={STAGE_Y} width={1880} height={400}>
          <rect x={-400} y={STAGE_Y} width={1880} height={400} fill={`url(#${id}-reflfade)`} />
        </mask>
      </defs>
      {sil ? (
        <rect x={-400} y={-400} width={1880} height={2720} fill={C.cream} />
      ) : (
        <LightPool id={`${id}-pool`} level={s.light.level} warm={s.light.warm} ember={s.light.ember} rx={s.light.rx} ry={s.light.ry} cy={s.light.cy} />
      )}
      {s.tailBack ? (
        <g clipPath={`url(#${id}-behind)`}>
          <Tail {...s.tailBack} silhouette={sil} />
        </g>
      ) : null}
      {s.head ? <DiabloHead {...s.head} silhouette={sil} /> : null}
      {s.handsBack?.length ? (
        <g clipPath={`url(#${id}-behind)`}>
          {s.handsBack.map((h) => (
            <Hand key={h.side} {...h} frame={s.frame} silhouette={sil} />
          ))}
        </g>
      ) : null}
      {sil ? null : (
        // the bots' reflections in the glossy stage, fading out below it
        <g mask={`url(#${id}-refl)`}>
          <g transform={`translate(0 ${2 * STAGE_Y}) scale(1 -1)`}>
            {ORDER.map((k) => (
              <Bot key={k} kind={k} frame={s.frame} {...s.bots[k]} shadow={false} />
            ))}
          </g>
        </g>
      )}
      {sil ? null : <StageLine id={`${id}-line`} />}
      {ORDER.map((k) => (
        <Bot key={k} kind={k} frame={s.frame} {...s.bots[k]} silhouette={sil} />
      ))}
      {s.tailFront ? <Tail {...s.tailFront} silhouette={sil} /> : null}
      {(s.hands ?? []).map((h) => (
        <Hand key={h.side} {...h} frame={s.frame} silhouette={sil} />
      ))}
      {(s.shards ?? []).map((sh) => (
        <Shards key={sh.kind} {...sh} silhouette={sil} />
      ))}
      {(s.sparks ?? []).map((sp, i) => (
        <g key={`spark-${i}`}>
          {sp.trail.map((p, k) => (
            <circle key={k} cx={p.x} cy={p.y} r={6.5 * (1 - (k + 1) / (sp.trail.length + 1))} fill={C.gold} opacity={0.75 * (1 - k / sp.trail.length)} />
          ))}
          <circle cx={sp.at.x} cy={sp.at.y} r={7.5} fill={C.gold} />
          <circle cx={sp.at.x - 1} cy={sp.at.y - 1.2} r={3} fill={C.cream} />
        </g>
      ))}
      {s.dim ? <rect x={-400} y={-400} width={1880} height={2720} fill={C.night} opacity={s.dim} /> : null}
    </Camera>
  );
};
