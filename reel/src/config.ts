// Every word on screen, every voice line and every beat time in the reel lives
// here. Frames are at 30 fps from the first frame of the reel; the music is
// 120 BPM, so a beat is 15 frames and every cut, hit and pop lands on the grid.
// Change a line or a time here and render again; nothing else holds copy or timing.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const DURATION = 840; // exactly 28.0 s
export const BPM = 120;
export const BEAT = 15; // frames per beat

export const sec = (s: number) => Math.round(s * FPS);

export type ShotId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface Shot {
  id: ShotId;
  name: string;
  from: number; // first frame (inclusive)
  to: number; // last frame (inclusive)
  words: string[]; // one entry per line on screen
  lineIn: number[]; // frame each line starts to type in, letter by letter
  wordsIn: number; // the first line's frame
  wordsOut: number; // frame the letters start to fly out
  big?: boolean; // set larger, as the reel's headline
}

const shot = (id: ShotId, name: string, from: number, to: number, words: string[], lineIn: number[], wordsOut: number, big = false): Shot => ({
  id,
  name,
  from,
  to,
  words,
  lineIn,
  wordsIn: lineIn[0] ?? from,
  wordsOut,
  big,
});

export const SHOTS: Shot[] = [
  shot(1, 'Looks fine', 0, 104, ['Your AI', 'looks fine.'], [30, 45], 98),
  shot(2, 'Diablo', 105, 164, [], [], 164),
  shot(3, 'Finds the cracks', 165, 269, ['Diablo finds', 'the cracks.'], [180, 195], 258),
  shot(4, 'Fixes them', 270, 374, ['Then', 'fixes them.'], [270, 282], 368),
  shot(5, 'Not a scratch', 375, 494, ['Again?', 'Not a scratch.'], [378, 405], 488),
  shot(6, 'Evolves', 495, 584, ['AI that', 'evolves AI.'], [506, 525], 578, true),
  shot(7, 'Every model', 585, 704, ['Every model.', 'Every update.'], [600, 615], 698),
  shot(8, 'End card', 705, 839, [], [], 839),
];

// Letters type in this many frames apart (1.2 frames ≈ a 32nd note at 120 BPM).
export const TYPE_STAGGER = 1.2;

// The end card: the mark draws on, then the name and the URL.
export const END_CARD = {
  name: 'Diablo',
  nameIn: 750,
  url: 'diablo.si',
  urlIn: 765,
  out: 825, // the iris starts to close on his eyes
};

// Story events. The scenes read these instead of hard-coding frames.
export const EVENTS = {
  irisOpen: { from: 0, to: 9 }, // from black, a white circle opens from the centre
  dot: 4, // a maroon dot pops in the middle
  pops: { bubble: 15, orb: 22, cube: 30 }, // a dot flies out to the bubble, then the orb; the last one becomes the cube
  bops: [60, 75, 90], // the bots bop on the beat
  worry: 96, // they look up
  wipeIn: { from: 105, to: 113 }, // a maroon circle swallows the frame
  drop: { from: 112, land: 120 }, // Diablo's head drops in and lands on the downbeat
  tailDraw: { from: 120, to: 129 }, // his crescent draws on like a brush stroke
  eyesOpen: 135,
  squint: { from: 142, to: 148 },
  eyeZoom: { from: 150, to: 161 }, // the camera dives into his eye
  botsBack: 161,
  hits: { bubble: 180, orb: 188, cube: 195 }, // three slashes, one per bot
  lens: { from: 208, bubble: 208, cube: 223, orb: 238, to: 258 }, // a lens finds each chip
  lensFix: { from: 281, bubble: 281, orb: 301, cube: 316, to: 336 }, // and comes back to watch each one sealed
  swoosh: { from: 258, to: 270 },
  seals: { bubble: 285, orb: 300, cube: 315 }, // each bot's seams draw in white over a beat
  sealFrames: 15,
  cheer: [345, 360],
  glint: { from: 345, to: 362 },
  // Again? Not a scratch: Diablo slashes the fixed bots again and white shields
  // pop up and shatter every blade; then the bots flex on the beat.
  retest: { from: 375, hits: { bubble: 390, orb: 398, cube: 405 }, flex: [420, 435], to: 494 },
  wipeOut: { from: 495, to: 503 }, // a white circle from the cube
  colourBeats: [525, 555, 570, 585, 705], // maroon, night, maroon, night (the crowd), white
  botsUp: 540,
  // Every model, every update: the camera pulls back and a crowd of fixed bots
  // pops in around the three, row by row, and does a wave on the beat.
  crowd: { from: 585, zoom: 600, popFrom: 590, wave: [630, 645, 660, 675], to: 705 },
  collapse: { from: 705, to: 716 }, // everything shrinks into one dot
  ribbon: { from: 720, to: 734 }, // the dot draws his crescent
  headPop: 735,
  eyesOpenEnd: 746,
  shine: { from: 786, to: 802 }, // one band of light across the logo
  blink: { from: 800, to: 806 },
  irisClose: { from: 825, to: 837 }, // black by frame 837 and to the end
};

// The voice cut speaks exactly the words on screen, each line 0.1 s after its
// words appear, and says the name on the end card.
export const VOICE_LEAD = 3; // frames (0.1 s)
export const VOICE_LINES = [
  ...SHOTS.filter((s) => s.words.length > 0).map((s) => ({
    text: s.words.join(' '),
    start: s.wordsIn + VOICE_LEAD,
    end: s.to,
  })),
  { text: `${END_CARD.name}.`, start: END_CARD.nameIn, end: END_CARD.out },
];

// The beat grid (frames) and the accents on it. QA gate 8 checks the cuts
// against these.
export const BEATS = {
  grid: Array.from({ length: DURATION / BEAT }, (_, i) => i * BEAT),
  drop: EVENTS.drop.land,
  hits: Object.values(EVENTS.hits),
  retestHits: Object.values(EVENTS.retest.hits),
  colourBeats: EVENTS.colourBeats,
};

// Idle blinks (start frames) for each bot, out of step; none during the hits.
// A blink lasts 6 frames.
export const BLINKS = {
  bubble: [52, 292, 352, 452, 560],
  cube: [66, 306, 372, 466, 572],
  orb: [80, 322, 338, 444, 548],
};

// Hard picture changes (the colour beats).
export const CUTS = EVENTS.colourBeats;

// Every letter's entrance, for the type ticks.
const letterTicks = (text: string, at: number) =>
  [...text].flatMap((ch, i) => (ch === ' ' ? [] : [Math.round(at + i * TYPE_STAGGER)]));

// Sound effects cue sheet (frames). Synthesised in code, no samples.
export const SFX = {
  irisOpen: 0,
  dotPop: EVENTS.dot,
  botPops: Object.values(EVENTS.pops),
  flights: Object.values(EVENTS.pops).map((p) => p - 5),
  typeTicks: [
    ...SHOTS.flatMap((s) => s.words.flatMap((w, i) => letterTicks(w, s.lineIn[i]))),
    ...letterTicks(END_CARD.name, END_CARD.nameIn),
  ],
  urlTicks: letterTicks(END_CARD.url, END_CARD.urlIn).map((_, i) => END_CARD.urlIn + Math.round(i * 1.5)),
  bops: EVENTS.bops,
  riser: { from: 75, to: 120 },
  wipeIn: EVENTS.wipeIn.from,
  dropWhoosh: EVENTS.drop.from,
  land: EVENTS.drop.land,
  tailSwoosh: EVENTS.tailDraw.from,
  eyesOpen: EVENTS.eyesOpen,
  zoom: EVENTS.eyeZoom.from,
  slashes: Object.values(EVENTS.hits).map((h) => h - 4),
  hits: Object.values(EVENTS.hits),
  chipTicks: [EVENTS.hits.cube + 4], // the cube's chips land on the floor (the others vanish mid-air)
  chipClicks: Object.values(EVENTS.seals).map((s) => s + 3), // each chip snaps back before the seam pours
  locks: [EVENTS.lens.bubble + 1, EVENTS.lens.cube, EVENTS.lens.orb], // the first as the lens appears
  fixLocks: [EVENTS.lensFix.bubble + 1, EVENTS.lensFix.orb, EVENTS.lensFix.cube],
  swoosh: EVENTS.swoosh.from,
  sealZips: Object.values(EVENTS.seals),
  sealDings: Object.values(EVENTS.seals).map((s) => s + EVENTS.sealFrames),
  cheers: EVENTS.cheer,
  glint: EVENTS.glint.from,
  retestSlashes: Object.values(EVENTS.retest.hits).map((h) => h - 4),
  shields: Object.values(EVENTS.retest.hits).map((h) => h - 1), // each shield pops up as the blade arrives
  deflects: Object.values(EVENTS.retest.hits), // the blade shatters on it
  flex: EVENTS.retest.flex,
  wipeOut: EVENTS.wipeOut.from,
  colourBeats: EVENTS.colourBeats,
  crowdZoom: EVENTS.crowd.from,
  crowdPops: [1, 2, 3, 4].map((r) => EVENTS.crowd.popFrom + 4 * r), // the crowd ripples in from the centre
  wave: EVENTS.crowd.wave,
  botsUp: [EVENTS.botsUp, EVENTS.botsUp + 4, EVENTS.botsUp + 8],
  collapse: EVENTS.collapse.from,
  ribbon: EVENTS.ribbon.from,
  headPop: EVENTS.headPop,
  sting: END_CARD.nameIn,
  blink: EVENTS.blink.from,
  irisClose: EVENTS.irisClose.from,
};

// out/cover.png is its own composition (src/Cover.tsx); this is the clock its bots idle at.
export const COVER_FRAME = 352;

