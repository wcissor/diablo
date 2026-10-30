// STICKER BOLD: three chunky sticker mascots with a thick ink outline (and a
// white die-cut border on dark stages). Diablo's slash leaves ONE bold
// lightning-bolt crack, drawn on in 3 frames with a comic star-burst, a few
// triangular chips and a cartoon wince; the white seam then flows down the bolt
// and closes it into a neat white inlay the bot keeps as its upgrade.

import React, { useId } from 'react';
import { clamp, lerp, smooth, wobble } from '../../lib/anim';
import { SLASH_DIR, type BotKind, type ConceptBot, type Mood } from '../_kit/types';
import { P } from './palette';
import { BORDER, BUBBLE, CUBE, GEO, INNER, ORB, ORB_C, ORB_R, OUT, boltLine, insideShell, type Geo } from './shapes';
import { Brow, Mouth, PrintedEye, ScreenFace, faceState, type FaceState } from './Face';
import { Burst, Chips, Pop, Zap } from './fx';
import { add, dirDeg, mul, pointAt, pt, ribbon, rotate, sub, tangentAt, unit, v2, type Line, type V } from './geom';

type Bg = 'white' | 'maroon';
const SEED: Record<BotKind, number> = { bubble: 11, cube: 23, orb: 37 };

/* ───────── pose: idle, mood, hit recoil, celebration hop ───────── */
interface Pose {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  lift: number;
}
const poseAt = (kind: BotKind, frame: number, mood: Mood, hitT?: number, sealT?: number): Pose => {
  const ph = SEED[kind];
  let x = 0;
  let y = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  let lift = 0;
  if (kind === 'bubble') {
    const b = Math.sin(frame * 0.16 + ph);
    sy += 0.014 * b;
    sx -= 0.01 * b;
  } else if (kind === 'cube') {
    rot += 0.8 * Math.sin(frame * 0.09 + ph);
  } else {
    y += -4 + 5 * Math.sin(frame * 0.12 + ph);
    rot += 2.2 * Math.sin(frame * 0.07 + ph);
  }
  if (mood === 'proud') {
    sy *= 1.03;
    sx *= 0.985;
  } else if (mood === 'worried') {
    sy *= 0.985;
    sx *= 1.01;
    x += 0.7 * wobble(frame, ph, 2.5);
  }
  if (hitT !== undefined && hitT >= 0 && hitT < 30) {
    // hit-stop: the impact pose holds for 2 frames, then a damped wobble
    const d = dirDeg(SLASH_DIR[kind]);
    const e = hitT < 2 ? 1 : Math.exp(-(hitT - 2) / 3.4) * Math.cos((hitT - 2) * 0.8);
    const orb = kind === 'orb';
    x += d.x * (orb ? 16 : 10) * e;
    y += d.y * (orb ? 12 : 3) * e;
    rot += Math.sign(d.x) * (orb ? 16 : 8) * e;
    sx *= 1 + 0.15 * e;
    sy *= 1 - 0.13 * e;
  }
  if (sealT !== undefined && sealT >= 0 && sealT < 20) {
    const t = sealT;
    if (t < 2) {
      sy *= 1 - 0.07 * (t / 2);
      sx *= 1 + 0.05 * (t / 2);
    } else if (t < 12) {
      const u = (t - 2) / 10;
      lift = 20 * Math.sin(Math.PI * u);
      sy *= 1 + 0.07 * Math.abs(Math.cos(Math.PI * u));
      sx *= 1 - 0.04 * Math.abs(Math.cos(Math.PI * u));
      if (kind === 'orb') rot += 10 * Math.sin(2 * Math.PI * u);
    } else {
      const e = Math.exp(-(t - 12) / 2.2) * Math.cos((t - 12) * 0.9);
      sy *= 1 - 0.09 * e;
      sx *= 1 + 0.07 * e;
    }
  }
  return { x, y, rot, sx, sy, lift };
};
const poseTransform = (p: Pose, pivot: V) =>
  `translate(${pt(v2(p.x, p.y - p.lift))}) translate(${pt(pivot)}) rotate(${p.rot}) scale(${p.sx} ${p.sy}) translate(${pt(mul(pivot, -1))})`;
const applyPose = (q: V, p: Pose, pivot: V): V => {
  const s = sub(q, pivot);
  return add(add(rotate(v2(s.x * p.sx, s.y * p.sy), p.rot), pivot), v2(p.x, p.y - p.lift));
};

/* ───────── the bolt: crack → seam ───────── */
interface BoltState {
  line: Line;
  crackHW: (s: number) => number;
  reveal: number; // arc length drawn so far
  front: number; // arc length the white has reached
}
const boltState = (g: Geo, hitT: number, seal: number): BoltState => {
  const line = boltLine(g.bolt);
  const L = line.total;
  const crackHW = (s: number) => (g.bolt.w / 2) * Math.pow(clamp(1 - s / L), 0.55);
  // drawn on in three frames: 0.42 → 0.8 → 1
  const r = hitT >= 2 ? 1 : hitT >= 1 ? lerp(0.8, 1, hitT - 1) : lerp(0.42, 0.8, clamp(hitT));
  return { line, crackHW, reveal: r * L, front: lerp(-6, L + 22, clamp(seal)) };
};

const SEAM_RIM = 2.9;
const BoltArt: React.FC<{ b: BoltState; sealT?: number; flicker: boolean }> = ({ b, sealT, flicker }) => {
  const { line, crackHW, reveal, front } = b;
  const L = line.total;
  const fill = (s: number) => smooth(clamp((front - s) / 22));
  const pop = sealT === undefined ? 0 : Math.max(0, 1 - sealT / 7) * (sealT >= 0 ? 1 : 0);
  const seamHW = (s: number) => (crackHW(s) * 0.8 + 0.8) * (1 + 0.22 * pop);
  const tip = (s: number) => clamp((reveal - s) * 0.8, 0, 99);
  const outer = (s: number) => Math.min(tip(s), lerp(crackHW(s), seamHW(s), fill(s)));
  const inner = (s: number) => Math.max(0, seamHW(s) - SEAM_RIM) * fill(s) * clamp((front - s) / 9);
  const sealing = front > 0;
  return (
    <g>
      {sealing ? <path transform="translate(2.5 3.5)" d={ribbon(line, 0, Math.min(front, L), (s) => seamHW(s) * fill(s))} fill={P.shade} /> : null}
      {front < L ? <path transform="translate(-3.2 -3.6)" d={ribbon(line, Math.max(0, front), Math.min(reveal, L), (s) => outer(s) * (1 - fill(s)))} fill={P.shade} /> : null}
      <path d={ribbon(line, 0, Math.min(reveal, L), outer)} fill={P.ink} />
      {flicker && !sealing ? (
        <path
          d={line.pts.map((q, i) => `${i ? 'L' : 'M'}${pt(q)}`).join('')}
          fill="none"
          stroke={P.white}
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeDasharray={`${Math.max(0, reveal - 14)} 999`}
          strokeDashoffset={-6}
        />
      ) : null}
      {sealing ? <path d={ribbon(line, 0, Math.min(front, L), inner)} fill={P.white} /> : null}
    </g>
  );
};

/* ───────── bodies ───────── */
interface BodyProps {
  uid: string;
  bg: Bg;
  inside: React.ReactNode; // clipped to the shell (the crack, the seam)
  face: React.ReactNode;
  hitT?: number;
  zapT?: number; // the idle short-circuit clock while damaged
}
// The die-cut border stops at the ground line (y 0) so a standing sticker never dips below it.
const Border: React.FC<{ ds: string[]; bg: Bg; uid: string }> = ({ ds, bg, uid }) =>
  bg === 'maroon' ? (
    <g clipPath={`url(#${uid}-g)`}>
      <clipPath id={`${uid}-g`}>
        <rect x={-400} y={-700} width={800} height={700} />
      </clipPath>
      {ds.map((d, i) => (
        <path key={i} d={d} fill={P.white} stroke={P.white} strokeWidth={OUT + 2 * BORDER} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </g>
  ) : null;
const Part: React.FC<{ d: string; fill?: string }> = ({ d, fill = P.body }) => (
  <path d={d} fill={fill} stroke={P.ink} strokeWidth={OUT} strokeLinejoin="round" />
);
const Outline: React.FC<{ d: string }> = ({ d }) => <path d={d} fill="none" stroke={P.ink} strokeWidth={OUT} strokeLinejoin="round" />;
const Glint: React.FC<{ d: string; w?: number }> = ({ d, w = 8 }) => (
  <path d={d} fill="none" stroke={P.white} strokeWidth={w} strokeLinecap="round" />
);

const BubbleBody: React.FC<BodyProps> = ({ uid, bg, inside, face }) => {
  const g = BUBBLE.geo;
  return (
    <g>
      <Border ds={[...BUBBLE.feet, g.body]} bg={bg} uid={uid} />
      {BUBBLE.feet.map((d, i) => (
        <Part key={i} d={d} />
      ))}
      <clipPath id={`${uid}-b`}>
        <path d={g.body} />
      </clipPath>
      <path d={g.body} fill={P.shade} />
      <g clipPath={`url(#${uid}-b)`}>
        <path d={g.body} transform="translate(-14 -12)" fill={P.body} />
        <Glint d="M-81 -150Q-85 -134 -81 -118" />
        <circle cx={-80} cy={-102} r={4.5} fill={P.white} />
        {inside}
      </g>
      {face}
      <Outline d={g.body} />
    </g>
  );
};

const CubeBody: React.FC<BodyProps> = ({ uid, bg, inside, face, hitT, zapT = -1 }) => {
  const g = CUBE.geo;
  const a = CUBE.antenna;
  const stem = `M${pt(a.base)}L${pt(a.tip)}`;
  const flash = hitT !== undefined && hitT >= 0 && hitT < 2;
  const s = CUBE.screenBox;
  const glitch = hitT !== undefined && hitT >= 0 && hitT < 4 ? Math.floor(hitT) : zapT >= 0 && zapT < 2 ? 1 + Math.floor(zapT) : -1;
  return (
    <g>
      <Border ds={[...CUBE.feet, g.body, stem, `M${a.tip.x - a.r} ${a.tip.y}a${a.r} ${a.r} 0 1 0 ${2 * a.r} 0a${a.r} ${a.r} 0 1 0 ${-2 * a.r} 0`]} bg={bg} uid={uid} />
      {CUBE.feet.map((d, i) => (
        <Part key={i} d={d} />
      ))}
      <path d={stem} stroke={P.ink} strokeWidth={8} strokeLinecap="round" />
      <circle cx={a.tip.x} cy={a.tip.y} r={a.r} fill={flash ? P.white : P.ember} stroke={P.ink} strokeWidth={5} />
      <circle cx={a.tip.x - 2.6} cy={a.tip.y - 2.6} r={2.4} fill={P.white} />
      <clipPath id={`${uid}-b`}>
        <path d={g.body} />
      </clipPath>
      <clipPath id={`${uid}-s`}>
        <path d={CUBE.screen} />
      </clipPath>
      <path d={g.body} fill={P.shade} />
      <g clipPath={`url(#${uid}-b)`}>
        <path d={CUBE.top} fill={P.top} />
        <path d={CUBE.front} fill={P.body} />
        <path d={CUBE.front} fill="none" stroke={P.ink} strokeWidth={INNER} />
        <line x1={CUBE.edge[0].x} y1={CUBE.edge[0].y} x2={CUBE.edge[1].x} y2={CUBE.edge[1].y} stroke={P.ink} strokeWidth={INNER} strokeLinecap="round" />
        <Glint d="M-68 -66L-68 -84" w={7} />
        {inside}
      </g>
      <path d={CUBE.screen} fill={P.screen} stroke={P.ink} strokeWidth={INNER} />
      <g clipPath={`url(#${uid}-s)`}>
        <path d={`M${s.x0} ${s.y0 + 30}L${s.x0 + 30} ${s.y0}L${s.x0 + 52} ${s.y0}L${s.x0} ${s.y0 + 52}Z`} fill={P.glare} />
        <g transform={glitch >= 0 ? `translate(${[7, -6, 4, -2][glitch]} 0)` : undefined}>{face}</g>
        {glitch >= 0 && glitch < 3 ? (
          <>
            <rect x={s.x0} y={s.y0 + [14, 40, 24][glitch]} width={s.x1 - s.x0} height={5} fill={P.glare} />
            <rect x={s.x0} y={s.y0 + [48, 10, 52][glitch]} width={s.x1 - s.x0} height={3} fill={P.glare} />
          </>
        ) : null}
      </g>
      <Outline d={g.body} />
    </g>
  );
};

const OrbBody: React.FC<BodyProps> = ({ uid, bg, inside, face }) => {
  const g = ORB.geo;
  return (
    <g>
      <Border ds={[...ORB.pods, g.body]} bg={bg} uid={uid} />
      {ORB.pods.map((d, i) => (
        <Part key={i} d={d} fill={i === 0 ? P.body : P.shade} />
      ))}
      <clipPath id={`${uid}-b`}>
        <path d={g.body} />
      </clipPath>
      <path d={g.body} fill={P.shade} />
      <g clipPath={`url(#${uid}-b)`}>
        <circle cx={ORB_C.x - 14} cy={ORB_C.y - 13} r={ORB_R} fill={P.body} />
        <Glint d="M-64 -170Q-56 -184 -42 -193" />
        {inside}
      </g>
      {face}
      <Outline d={g.body} />
    </g>
  );
};

const BODY: Record<BotKind, React.FC<BodyProps>> = { bubble: BubbleBody, cube: CubeBody, orb: OrbBody };

/* ───────── faces per kind ───────── */
const PrintedFace: React.FC<{ uid: string; g: Geo; st: FaceState }> = ({ uid, g, st }) => {
  const one = g.eyes.length === 1;
  return (
    <g>
      {st.cheeks > 0.01
        ? g.cheeks.map((c, i) => <ellipse key={i} cx={c.x} cy={c.y} rx={12} ry={7} fill={P.cheek} opacity={st.cheeks} />)
        : null}
      {g.eyes.map((c, i) => {
        const side = one ? 0 : i === 0 ? -1 : 1;
        return (
          <g key={i}>
            <PrintedEye id={`${uid}-e${i}`} c={c} rx={g.eye.rx} ry={g.eye.ry} pupilR={g.eye.pupil} st={st} side={side} lid={P.body} />
            {st.expr !== 'wince' ? <Brow c={c} rx={g.eye.rx * st.eyeScale} ry={g.eye.ry * st.eyeScale} side={side} kind={st.brow} ink={P.ink} /> : null}
          </g>
        );
      })}
      <Mouth id={`${uid}-m`} at={g.mouth} w={g.mouthW} kind={st.mouth} ink={P.ink} fill={P.ink} tongue={P.tongue} />
    </g>
  );
};

// Arc length along the bolt where it enters the shell (the crack's mouth).
const MOUTH_S: Record<BotKind, number> = (() => {
  const out = {} as Record<BotKind, number>;
  (Object.keys(GEO) as BotKind[]).forEach((k) => {
    const l = boltLine(GEO[k].bolt);
    let s = 0;
    while (s < l.total && !insideShell[k](pointAt(l, s))) s += 0.5;
    out[k] = s;
  });
  return out;
})();

// The chip knocked out of the sticker's edge: a V cut where the crack opens.
const notchPath = (l: Line, sIn: number, open: number) => {
  if (open <= 0.01) return '';
  const D = 17 * open;
  const hw = 11.5 * open;
  const E = 20;
  const t = tangentAt(l, sIn);
  const n = v2(-t.y, t.x);
  const at = pointAt(l, sIn);
  const apex = add(at, mul(t, D));
  const base = add(at, mul(t, -E));
  const w = (hw * (D + E)) / Math.max(1, D);
  return `M${pt(apex)}L${pt(add(base, mul(n, w)))}L${pt(add(base, mul(n, -w)))}Z`;
};

// Where each bot's damage sits (bot space, feet at 0,0): aim the reel's lens here.
export const DAMAGE_AT: Record<BotKind, V> = {
  bubble: pointAt(boltLine(GEO.bubble.bolt), boltLine(GEO.bubble.bolt).total * 0.45),
  cube: pointAt(boltLine(GEO.cube.bolt), boltLine(GEO.cube.bolt).total * 0.45),
  orb: pointAt(boltLine(GEO.orb.bolt), boltLine(GEO.orb.bolt).total * 0.45),
};

/* ───────── the bot ───────── */
export const ConceptBotImpl: ConceptBot = ({ kind, frame, bg, mood = 'happy', look, blink = 0, hitT, seal = 0, sealT }) => {
  const uid = `bolt-${kind}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const g = GEO[kind];
  const seed = SEED[kind];
  const hit = hitT !== undefined && hitT >= 0 ? hitT : undefined;
  const p = poseAt(kind, frame, mood, hit, sealT);
  const pivot = g.pivot;

  const b = hit !== undefined ? boltState(g, hit, seal) : undefined;
  const sealed = seal >= 1;
  const damaged = hit !== undefined && hit >= 12 && seal <= 0.001;
  // a short-circuit now and then while it waits to be fixed
  const zapT = damaged ? (frame + seed * 3) % 38 : -1;
  const flicker = hit !== undefined && ((hit >= 1 && hit < 5 && hit !== 3) || (zapT >= 0 && zapT < 2));

  // the eyes glance at the crack after the hit, and follow the seam as it closes
  let gaze = look ?? { x: 0, y: 0 };
  if (b) {
    const faceC = g.eyes.reduce((a, c) => add(a, mul(c, 1 / g.eyes.length)), v2(0, 0));
    const target = seal > 0 && !sealed ? pointAt(b.line, b.front) : pointAt(b.line, b.line.total * 0.45);
    const w = seal > 0 && !sealed ? 0.95 : hit !== undefined ? smooth(clamp((hit - 10) / 4)) * (1 - smooth(clamp((hit - 30) / 10))) : 0;
    if (w > 0) {
      const dir = unit(sub(target, faceC));
      gaze = { x: lerp(gaze.x, dir.x, w), y: lerp(gaze.y, dir.y, w) };
    }
  }
  const st = faceState(mood, gaze, blink, hit, g.eyes.length === 1);
  const face =
    kind === 'cube' ? (
      <ScreenFace eyes={g.eyes} rx={g.eye.rx} ry={g.eye.ry} mouth={g.mouth} mouthW={g.mouthW} st={st} id={`${uid}-m`} />
    ) : (
      <PrintedFace uid={uid} g={g} st={st} />
    );

  const Body = BODY[kind];
  // the notch opens on the impact and closes as the white reaches the mouth
  const sIn = MOUTH_S[kind];
  const notchOpen = b ? smooth(clamp((hit ?? 0) / 1.5 + 0.35)) * (1 - smooth(clamp((b.front - sIn + 2) / 12))) : 0;
  const notch = b ? notchPath(b.line, sIn, notchOpen) : '';
  const mouthPt = b ? pointAt(b.line, 0) : v2(0, 0);
  const tipS = b ? b.line.total - 3 : 0;
  const shadowY = -g.shadow.ry;
  const hover = kind === 'orb' ? -p.y : 0;
  const shadowK = clamp(1 - p.lift / 70 - hover / 60, 0.6, 1.1);

  return (
    <g>
      <ellipse
        cx={g.shadow.cx + p.x * 0.6}
        cy={shadowY}
        rx={g.shadow.rx * shadowK * p.sx}
        ry={g.shadow.ry * shadowK}
        fill={bg === 'white' ? P.shadowOnWhite : P.shadowOnMaroon}
      />
      {b && hit !== undefined && hit >= 1 && hit < 18 ? (
        <Chips at={applyPose(mouthPt, p, pivot)} out={unit(mul(dirDeg(SLASH_DIR[kind]), -1))} k={hit - 1} seed={seed} fill={P.body} />
      ) : null}
      <g transform={poseTransform(p, pivot)}>
        {notch ? (
          <clipPath id={`${uid}-n`}>
            <path d={`M-400 -700H400V300H-400Z${notch}`} clipRule="evenodd" />
          </clipPath>
        ) : null}
        <g clipPath={notch ? `url(#${uid}-n)` : undefined}>
          <Body uid={uid} bg={bg} hitT={hit} zapT={zapT} face={face} inside={b ? <BoltArt b={b} sealT={sealT} flicker={flicker} /> : null} />
        </g>
        {b && hit !== undefined ? <Burst at={mouthPt} ang={SLASH_DIR[kind] + 180} k={hit} seed={seed} /> : null}
        {b && zapT >= 0 ? (
          <Zap at={pointAt(b.line, tipS)} dir={unit(add(tangentAt(b.line, tipS), v2(0, -0.6)))} t={zapT} seed={seed + Math.floor(frame / 38)} />
        ) : null}
        {b && seal > 0 && !sealed ? <Pop at={pointAt(b.line, Math.min(b.front, b.line.total))} t={4} life={10} R={14} spin={0} /> : null}
      </g>

      {sealT !== undefined && sealT >= 0 && b ? <Celebrate kind={kind} b={b} p={p} pivot={pivot} t={sealT} frame={frame} /> : null}
    </g>
  );
};

// The fix lands: twinkles pop along the new seam and around the bot, then an
// occasional glint runs along the seam while the bot is proud of it.
const Celebrate: React.FC<{ kind: BotKind; b: BoltState; p: Pose; pivot: V; t: number; frame: number }> = ({ kind, b, p, pivot, t, frame }) => {
  const L = b.line.total;
  const around = AROUND[kind];
  const glintT = (frame + SEED[kind] * 5) % 54;
  return (
    <g>
      {[0.22, 0.55, 0.86].map((u, i) => (
        <Pop key={`s${i}`} at={applyPose(pointAt(b.line, u * L), p, pivot)} t={t - i * 2} life={11} R={15 - i * 2} spin={9} />
      ))}
      {around.map((q, i) => (
        <Pop key={`a${i}`} at={add(q, v2(p.x, p.y - p.lift * 0.5))} t={t - 3 - i * 2} life={12} R={[13, 10, 15, 9][i % 4]} spin={-7} />
      ))}
      {t > 24 ? <Pop at={applyPose(pointAt(b.line, L * (0.2 + 0.6 * ((Math.floor((frame + SEED[kind] * 5) / 54) * 0.37) % 1))), p, pivot)} t={glintT} life={10} R={11} spin={8} /> : null}
    </g>
  );
};
const AROUND: Record<BotKind, V[]> = {
  bubble: [v2(-104, -222), v2(108, -196), v2(-112, -128), v2(96, -238)],
  cube: [v2(-98, -214), v2(104, -230), v2(-104, -120), v2(108, -112)],
  orb: [v2(-100, -206), v2(104, -214), v2(-108, -96), v2(100, -72)],
};

