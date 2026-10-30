// Gate 3 from the timeline itself: for every frame, the boxes of the words,
// the bots (their contract box), the lens, Diablo's mark and the end card, checked
// against the safe area (x 120–936, y 288–1248), the right rail (x > 936 from
// y 800 down) and a 40 px gap between the words and the bots.
// Writes out/qa/layout.json. Usage: npx tsx scripts/check-layout.ts

import fs from 'node:fs';
import path from 'node:path';
import { DURATION, END_CARD } from '../src/config';
import { BOTS, RIGHT_RAIL, SAFE, STAGE_Y } from '../src/geometry';
import { BOT_BOX } from '../src/bots/kit/types';
import { MARK_BOX } from '../src/logo';
import * as T from '../src/v2/timeline';

type Box = { who: string; x0: number; y0: number; x1: number; y1: number };
const ADVANCE = 0.5; // Geist ExtraBold's average advance at -0.04 em tracking is ~0.46 em (measured)

const textBox = (who: string, text: string, top: number, size: number, lineH: number, advance = ADVANCE): Box => {
  const w = text.length * advance * size;
  const pad = (lineH - size) / 2;
  return { who, x0: 540 - w / 2, x1: 540 + w / 2, y0: top + pad, y1: top + lineH - pad };
};

interface Violation {
  check: string;
  who: string;
  frame: number;
  by: number;
}
const out: Violation[] = [];
const flag = (check: string, who: string, frame: number, by: number) => {
  if (by > 0.5) out.push({ check, who, frame, by: Math.round(by * 10) / 10 });
};

for (let f = 0; f < DURATION; f++) {
  const boxes: Box[] = [];
  const words = T.wordsAt(f);
  const wordBoxes: Box[] = [];
  if (words) {
    words.lines.forEach((ln, i) => {
      if (f < ln.at || f >= words.out + 6) return;
      wordBoxes.push(textBox(`words "${ln.text}"`, ln.text, words.top + i * words.lineH, words.size, words.lineH));
    });
    if (words.scale >= 1) boxes.push(...wordBoxes);
  }
  const botBoxes: Box[] = [];
  if (T.collapseAt(f) >= 1)
    for (const b of T.botsAt(f)) {
      // the contract's box (every resting state fits it), popped, squashed and lifted about the feet
      const x = BOTS[b.kind].cx;
      const feet = STAGE_Y + T.ROW_DY;
      const s = b.scale;
      botBoxes.push({ who: b.kind, x0: x + BOT_BOX.x0 * s, x1: x + BOT_BOX.x1 * s, y0: feet + (BOT_BOX.y0 * b.squash - b.lift) * s, y1: feet });
    }
  boxes.push(...botBoxes);
  const lens = T.lensAt(f);
  if (lens) {
    const r = lens.r * lens.snap + 28;
    boxes.push({ who: 'lens', x0: lens.x - r, x1: lens.x + r, y0: lens.y - r, y1: lens.y + r });
  }
  const mark = T.markAt(f);
  if (mark && !mark.zoom && mark.headDy > -1) {
    const a = T.markPoint(mark, { x: MARK_BOX.x, y: MARK_BOX.y });
    const b = T.markPoint(mark, { x: MARK_BOX.x + MARK_BOX.w, y: MARK_BOX.y + MARK_BOX.h });
    boxes.push({ who: 'mark', x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  if (f >= END_CARD.nameIn) {
    boxes.push(textBox('end name', END_CARD.name, 905, 150, 160));
    if (f >= END_CARD.urlIn) boxes.push(textBox('end url', END_CARD.url, 1085, 50, 60, 0.6));
  }

  for (const b of boxes) {
    flag('safe', b.who, f, Math.max(SAFE.x0 - b.x0, b.x1 - SAFE.x1, SAFE.y0 - b.y0, b.y1 - SAFE.y1));
    if (b.y1 > RIGHT_RAIL.y0) flag('right-rail', b.who, f, b.x1 - RIGHT_RAIL.x0);
  }
  if (words && words.scale >= 1 && wordBoxes.length && botBoxes.length) {
    const wordsBottom = Math.max(...wordBoxes.map((b) => b.y1));
    const botsTop = Math.min(...botBoxes.map((b) => b.y0));
    flag('words-clear', 'words/bots', f, wordsBottom + 40 - botsTop);
  }
}

// Summarise as frame ranges per check and element.
const groups = new Map<string, Violation[]>();
for (const v of out) groups.set(`${v.check} ${v.who}`, [...(groups.get(`${v.check} ${v.who}`) ?? []), v]);
const summary = [...groups.entries()].map(([key, vs]) => {
  const ranges: string[] = [];
  let a = vs[0].frame;
  let b = a;
  for (const v of vs.slice(1)) {
    if (v.frame === b + 1) b = v.frame;
    else {
      ranges.push(a === b ? `${a}` : `${a}–${b}`);
      a = b = v.frame;
    }
  }
  ranges.push(a === b ? `${a}` : `${a}–${b}`);
  return { key, frames: vs.length, worst: Math.max(...vs.map((v) => v.by)), ranges };
});
const file = path.join(__dirname, '..', 'out', 'qa', 'layout.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ checkedFrames: DURATION, violations: summary }, null, 2));
if (!summary.length) console.log('layout: PASS — every frame inside the safe area, words 40 px clear of the bots, right rail empty');
else for (const g of summary) console.log(`layout: FAIL ${g.key}: ${g.frames} frames, worst ${g.worst} px, frames ${g.ranges.join(', ')}`);
