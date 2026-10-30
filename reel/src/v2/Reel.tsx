// One frame of the reel, drawn from the timeline in a fixed layer order:
// background, dots and rings, the bots (with their slashes), bursts, the lens,
// sparkles, wipes, Diablo's mark, the words, then the swoosh, flash and iris on top.

import React from 'react';
import { AbsoluteFill } from 'remotion';
import { END_CARD } from '../config';
import { BOTS, STAGE_Y } from '../geometry';
import { C, FONT } from '../theme';
import { ConceptBotImpl as Bot } from '../bots/Bot';
import * as T from './timeline';
import { Blade, holeD, Ribbon, Rings, Sparkle } from './kit';
import { FlatMark } from './Mark';
import { Kinetic } from './Type';

const W = 1080;
const H = 1920;
const ROW = `translate(0 ${T.ROW_DY})`;

// The bots on their line, each popped in, squashed and leaned about its feet;
// the bot itself draws its face, the hit, the chip and the white seam.
const BotsLayer: React.FC<{ f: number; bots: T.BotView[]; bg: 'white' | 'maroon' }> = ({ f, bots, bg }) => (
  <g transform={ROW}>
    {bots.map((b) => (
      <g key={b.kind} transform={`translate(${BOTS[b.kind].cx} ${STAGE_Y}) scale(${b.scale}) rotate(${b.lean}) scale(1 ${b.squash})`}>
        <Bot kind={b.kind} frame={f} bg={bg} mood={b.mood} look={b.look} blink={b.blink} hitT={b.hitT} seal={b.seal} sealT={b.sealT} lift={b.lift} />
      </g>
    ))}
  </g>
);

// The lens: a magnified copy of the bots inside a white reticle.
const Lens: React.FC<{ f: number; lens: T.LensView; bots: T.BotView[] }> = ({ f, lens, bots }) => (
  <g>
    {lens.r > 1 ? <circle cx={lens.x + 6} cy={lens.y + 10} r={lens.r + 6} fill={C.night} opacity={0.35} /> : null}
    <g clipPath="url(#lens)">
      <rect x={lens.x - lens.r} y={lens.y - lens.r} width={2 * lens.r} height={2 * lens.r} fill={C.maroon} />
      <g transform={`translate(${lens.x} ${lens.y}) scale(${lens.zoom}) translate(${-lens.x} ${-lens.y})`}>
        <BotsLayer f={f} bots={bots} bg="maroon" />
      </g>
    </g>
    <g transform={`translate(${lens.x} ${lens.y}) scale(${lens.snap}) rotate(${lens.spin})`}>
      <circle r={lens.r} fill="none" stroke={C.white} strokeWidth={10} />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1={0} y1={-lens.r * (1 + 28 / 130)} x2={0} y2={-lens.r * (1 - 20 / 130)} stroke={C.white} strokeWidth={10 * Math.min(1, lens.r / 60)} strokeLinecap="round" transform={`rotate(${a})`} />
      ))}
    </g>
  </g>
);

export const Reel: React.FC<{ f: number; hideWords?: boolean }> = ({ f, hideWords = false }) => {
  const bg = T.bgAt(f);
  const shake = T.shakeAt(f);
  const bots = T.botsAt(f);
  const lens = T.lensAt(f);
  const collapse = T.collapseAt(f);
  const mark = T.markAt(f);
  const words = hideWords ? null : T.wordsAt(f);
  const wipeIn = T.wipeInAt(f);
  const wipeOut = T.wipeOutAt(f);
  const iris = T.irisAt(f);
  const flash = T.flashAt(f);
  const eyeFill = T.eyeFillAt(f);
  const swoosh = T.swooshAt(f);
  const shrink = collapse < 1 ? `translate(${T.DOT.x} ${T.DOT.y}) scale(${Math.max(0, collapse)}) translate(${-T.DOT.x} ${-T.DOT.y})` : undefined;
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          {lens ? (
            <clipPath id="lens">
              <circle cx={lens.x} cy={lens.y} r={lens.r} />
            </clipPath>
          ) : null}
        </defs>
        <g transform={`translate(${shake.x} ${shake.y})`}>
          {[...T.RINGS, ...T.FINALE_RINGS].map((r, i) => (
            <Rings key={i} f={f} ring={r} />
          ))}
          {T.dotsAt(f).map((d, i) => (
            <g key={i}>
              {d.from ? <line x1={d.from.x} y1={d.from.y} x2={d.x} y2={d.y} stroke={C.maroon} strokeWidth={d.r * 1.6} strokeLinecap="round" opacity={0.35} /> : null}
              <circle cx={d.x} cy={d.y} r={d.r} fill={C.maroon} />
            </g>
          ))}
          <g transform={shrink}>
            <BotsLayer f={f} bots={bots} bg={bg === C.white ? 'white' : 'maroon'} />
            <g transform={ROW}>
              {T.KINDS.map((k) => (
                <Blade key={k} arc={T.SLASH[k]} {...T.slashAt(f, k)} width={30} color={C.white} />
              ))}
            </g>
          </g>
          {lens ? <Lens f={f} lens={lens} bots={bots} /> : null}
          {T.SPARKS.map((s, i) => {
            // a glint that belongs to a bot rides along with its hop
            const b = s.bot ? bots.find((v) => v.kind === s.bot) : undefined;
            return <Sparkle key={i} f={f} s={b ? { ...s, y: s.y - b.lift * b.scale } : s} />;
          })}
          {wipeIn ? <circle cx={wipeIn.x} cy={wipeIn.y} r={wipeIn.r} fill={C.maroon} /> : null}
          {mark ? <FlatMark m={mark} id="mark" /> : null}
          {eyeFill > 0 ? <rect x={-40} y={-40} width={W + 80} height={H + 80} fill={C.maroon} opacity={eyeFill} /> : null}
          {wipeOut ? <circle cx={wipeOut.x} cy={wipeOut.y} r={wipeOut.r} fill={C.white} /> : null}
        </g>
      </svg>
      {words ? (
        <AbsoluteFill style={{ transformOrigin: `${T.DOT.x}px ${T.DOT.y}px`, transform: words.scale < 1 ? `scale(${Math.max(0, words.scale)})` : undefined }}>
          <Kinetic f={f} lines={words.lines} out={words.out} top={words.top} size={words.size} lineH={words.lineH} color={words.color} />
        </AbsoluteFill>
      ) : null}
      {f >= END_CARD.nameIn ? (
        <AbsoluteFill>
          <Kinetic f={f} lines={[{ text: END_CARD.name, at: END_CARD.nameIn }]} top={905} size={150} lineH={160} color={C.maroon} />
          <Kinetic
            f={f}
            lines={[{ text: END_CARD.url, at: END_CARD.urlIn }]}
            top={1085}
            size={50}
            lineH={60}
            color={C.night}
            font={FONT.mono}
            weight={500}
            tracking={0}
            stagger={1.5}
            mode="type"
          />
        </AbsoluteFill>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <Ribbon d={T.SWOOSH} {...swoosh} width={96} color={C.white} />
        {flash ? <rect width={W} height={H} fill={C.white} opacity={flash} /> : null}
        {iris ? <path d={holeD(iris)} fill="#000" fillRule="evenodd" /> : null}
      </svg>
    </AbsoluteFill>
  );
};
