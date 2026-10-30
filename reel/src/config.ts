// Every word on screen, every voice line and every beat time in the reel lives
// here. Frames are at 30 fps from the first frame of the reel. Change a line or
// a time here and render again; nothing else holds copy or timing.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const DURATION = 600; // exactly 20.0 s

export const sec = (s: number) => Math.round(s * FPS);

export type ShotId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Shot {
  id: ShotId;
  name: string;
  from: number; // first frame (inclusive)
  to: number; // last frame (inclusive)
  // The line for the shot: one entry per line on screen (the slash in the brief).
  words: string[];
  wordsIn: number; // frame the words start to fade in; they leave with the cut
}

export const SHOTS: Shot[] = [
  { id: 1, name: 'Looks fine', from: 0, to: 71, words: ['Your AI', 'looks fine.'], wordsIn: 9 },
  { id: 2, name: 'Pull up', from: 72, to: 131, words: [], wordsIn: 72 },
  { id: 3, name: 'Strike', from: 132, to: 221, words: ['Diablo finds', 'the cracks.'], wordsIn: 150 },
  { id: 4, name: 'Fix', from: 222, to: 329, words: ['Then', 'fixes them.'], wordsIn: 228 },
  { id: 5, name: 'Learns', from: 330, to: 449, words: ['And learns', 'every time.'], wordsIn: 336 },
  { id: 6, name: 'Evolves', from: 450, to: 539, words: ['AI that', 'evolves AI.'], wordsIn: 456 },
  { id: 7, name: 'End card', from: 540, to: 599, words: [], wordsIn: 549 },
];

// The end card: the name and the URL, each with its own entrance.
export const END_CARD = {
  name: 'Diablo',
  nameIn: 549, // 18.3 s
  url: 'diablo.si',
  urlIn: 558, // 18.6 s
};

// Story events. Shots read these instead of hard-coding frames.
export const EVENTS = {
  slitOpen: { from: 0, to: 8 }, // the 9° light slit opens to full frame
  tailWiggle: 14, // the bubble wiggles its tail once
  flicker: { from: 42, to: 43 }, // light at 60% for 2 frames; the bots look up
  eyesOpen: { from: 57, to: 65 }, // Diablo's slits open in the dark over 8 frames
  rise: { from: 72, settle: 90 }, // pulls up from behind the stage line, settled by 3.0 s
  tailSweep: { from: 76, to: 98 }, // the scythe sweep behind him, with motion blur
  clawsUp: { from: 108, to: 120 }, // both hands rise, then hover and tremble
  windUp: { from: 132, to: 137 }, // 6 frames: hands draw back 40 px
  strike: 138, // the hit
  flash: { from: 138, to: 139 }, // the reel's only impact flash
  shake: { from: 138, to: 148, px: 12 }, // decays to nothing by frame 148
  slowMo: { from: 141, to: 186, rate: 0.25 }, // 4.7–6.2 s at 25 %, then ramps back
  rampBack: { from: 186, to: 192 },
  find: { from: 186, framesPerLook: 4 }, // eyes flick to each weak spot in turn
  trace: { from: 222, to: 252 }, // one claw tip runs along the bubble's longest crack
  fillAll: { from: 258, stagger: 3 }, // the other cracks fill, about 3 frames apart
  allSealed: 294, // 9.8 s: the light turns warm gold
  tailSeams: { from: 330, stagger: 2, count: 14 }, // his seams appear on his crescent, one by one
  crack1: { at: 366, flick: 372, sealFrames: 6 }, // hairline on the orb
  crack2: { at: 402, sealFrames: 3 }, // tiny crack on the cube, sealed before it notices
  eyesNarrow: 408,
  riseProud: 450,
  ring: { from: 474, to: 504 }, // the tail sweeps round the bots and closes into a ring
  hop: 504,
  wipe: { from: 540, to: 548 }, // a 9° wipe to night
  blink: { from: 570, to: 578 },
  slitClose: { from: 588, to: 597 }, // black by frame 597 and to the end
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
  { text: `${END_CARD.name}.`, start: END_CARD.nameIn, end: 587 },
];

// Score beats (frames). The hard cuts land on these; QA gate 8 checks it.
// Heartbeat at 90 BPM (20 frames) from 1.4 s, speeding up through shot 2,
// silence for the 6 frames before the strike, a tense pulse under the cracks,
// the warm swell at 9.8 s, a calm pulse to the end card and one low hit there.
export const BEATS = {
  heartbeat: [42, 62, 72, 86, 98, 108, 117, 125, 131],
  silence: { from: 132, to: 138 },
  strike: 138,
  slowPulse: [154, 174],
  tensePulse: [202, 222, 242, 262, 282],
  swell: 294,
  calmPulse: [310, 330, 350, 370, 390, 410, 430, 450, 470, 490, 510, 530],
  endHit: 540,
};

// Idle blinks (start frames) for each bot: every 2–3 s, out of step with each
// other, none while they are frozen in shot 3. A blink lasts 6 frames.
export const BLINKS = {
  bubble: [20, 98, 236, 310, 384, 462, 528],
  cube: [47, 116, 262, 340, 418, 494],
  orb: [61, 126, 250, 326, 404, 482],
};

export const CUTS = SHOTS.slice(1).map((s) => s.from); // 72, 132, 222, 330, 450, 540

// Sound effects cue sheet (frames). Synthesised in code, no samples.
export const SFX = {
  slitAir: 0,
  blinkTicks: [20, 47, 61], // the shot 1 blinks in BLINKS
  eyesShing: 57,
  pullUpWhoosh: 72,
  bladeScrape: 108,
  strikeWhoosh: 137, // a 1-frame inhale; the score is silent 132–137
  strikeHit: 138,
  slowRumble: { from: 141, to: 186 },
  crackle: { from: 141, to: 186 },
  sizzle: { from: 222, to: 294 },
  seamChimes: [252, 258, 261, 264, 267, 270, 273, 276, 279, 282, 285, 288, 291, 294],
  flick1: 372,
  flick2: 402,
  ringWhoosh: 490,
  ringClick: 504,
  endHit: 540,
  slitCloseAir: 588,
};

export const SCORE_FILE = 'audio/score.mp3'; // used instead of the synth score if present
