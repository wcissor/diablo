// Stub: the merged final bots go here (see ../_kit/types.ts for the contract).
import type { BotKind, ConceptBot } from '../_kit/types';

type P = { x: number; y: number };
export const DAMAGE_AT: Record<BotKind, P> = { bubble: { x: 0, y: -150 }, cube: { x: 0, y: -100 }, orb: { x: 0, y: -150 } };
export const SLASH_LINE: Record<BotKind, { a: P; b: P }> = {
  bubble: { a: { x: -190, y: -150 }, b: { x: 190, y: -150 } },
  cube: { a: { x: -190, y: -100 }, b: { x: 190, y: -100 } },
  orb: { a: { x: -190, y: -150 }, b: { x: 190, y: -150 } },
};
export const ConceptBotImpl: ConceptBot = () => <circle cx={0} cy={-110} r={100} fill="#EFEAE4" />;
