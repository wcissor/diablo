// The contract every bot concept implements, so the reel can drop the winner in.
import type React from 'react';

export type BotKind = 'bubble' | 'cube' | 'orb';
export type Mood = 'happy' | 'worried' | 'proud';

export interface ConceptBotProps {
  kind: BotKind;
  frame: number; // absolute frame, for any idle motion the bot draws itself (optional to use)
  bg: 'white' | 'maroon'; // the stage colour behind it
  mood?: Mood; // default 'happy'
  look?: { x: number; y: number }; // gaze, each axis -1..1 (y -1 = up)
  blink?: number; // 0..1 eyelids closed (the parent schedules blinks)
  hitT?: number; // frames since Diablo's slash hit this bot; undefined = never hit.
  // The hit plays over roughly hitT 0..12, then the bot settles into its "cracked" look.
  seal?: number; // 0..1 how far the white seam has closed the damage (after a hit); 1 = fixed
  sealT?: number; // frames since the seam fully closed (celebration); undefined = not yet
}
export type ConceptBot = React.FC<ConceptBotProps>;

// Every bot draws with its feet at (0, 0) and fits inside this box (px), so the
// reel's row (x 270 / 540 / 800, feet on one line) stays inside the safe area.
export const BOT_BOX = { x0: -120, x1: 120, y0: -250, y1: 0 };

// Where Diablo's slash crosses each bot in the reel (direction of travel, for
// aiming the damage). Angles in degrees, screen convention (0 = rightwards, 90 = down).
export const SLASH_DIR: Record<BotKind, number> = { bubble: 18, orb: 152, cube: 225 };
