// The v2 bots as they are now, behind the concept contract (the "before").
import { Bot } from '../../cast/Bots';
import { BOTS } from '../../geometry';
import { CRACKS } from '../../v2/timeline';
import { clamp, easeOutCubic } from '../../lib/anim';
import type { ConceptBot } from '../_kit/types';

export const ConceptBotImpl: ConceptBot = ({ kind, frame, bg, mood = 'happy', look, hitT, seal = 0, sealT }) => {
  const a = BOTS[kind];
  const set = CRACKS()[kind];
  const cracks =
    hitT === undefined
      ? undefined
      : [
          {
            set,
            grow: easeOutCubic(clamp(hitT / 10)),
            weak: clamp((hitT - 2) / 5) * (1 - seal),
            pulseFrame: frame,
            seal: set.cracks.map((_, i) => easeOutCubic(clamp(seal * 1.6 - i * 0.12))),
            warm: sealT === undefined ? 0 : 1 - clamp(sealT / 20),
            pop: set.cracks.map(() => (sealT === undefined ? 0 : clamp(sealT / 8))),
          },
        ];
  return (
    <g transform={`translate(${-a.cx} ${-a.feetY})`}>
      {bg === 'white' ? (
        <g filter="url(#ol-base)">
          <defs>
            <filter id="ol-base" x="-12%" y="-12%" width="124%" height="124%">
              <feMorphology in="SourceAlpha" operator="dilate" radius={6} result="d" />
              <feFlood floodColor="#120309" />
              <feComposite in2="d" operator="in" />
            </filter>
          </defs>
          <Bot kind={kind} frame={frame} silhouette shadow={false} />
        </g>
      ) : null}
      <Bot kind={kind} frame={frame} look={look} fear={mood === 'worried' ? 0.7 : 0} bright={mood === 'proud' ? 0.5 : 0} idle={false} cracks={cracks} />
    </g>
  );
};
