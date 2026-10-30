// FINAL bots: split's characters with bolt's damage arc.
//
// The hit (hitT 0..12): Diablo's slash flashes as a bar of light along its line
// through the bot: a crescent sliver of light (white on maroon) on exactly the
// arc the reel's slash ribbon takes (drawn in plain bot space, so the bot's own
// recoil never tilts it off the ribbon), widest at the impact point, opening a
// dark-maroon cut where it crosses the shell; the light breaks out of the
// outline at both ends as round flares and spills off as a few drops. The bot holds a 2-frame squash and
// tilt along the slash and glitches for those frames (a muted ember and white
// channel offset; the cube's screen tears into scanline bars). A V-chip pops out
// of its edge with two smaller chips that fall away, and one bold lightning-bolt
// crack grows out of the line from the notch. The bot winces (>_<) for one
// beat, does a double-take (a look at the crack, then at us), then waits with a
// sheepish "oops" smile: a chipped toy, never a wound. Every 30 frames a tiny round white
// spark pops in the dark-maroon crack and a few white pixels drift out.
// The fix (seal 0..1): the chip flies back and snaps into its notch with a
// click, then white pours down the bolt behind a bright weld bead the bot
// watches, and sets as a bold raised white bolt filling the notch: an upgrade
// badge.
// The celebration (sealT): light bursts out around the new badge as it swells,
// ^^ and a grin; a pulse of light runs down the badge, then again every 45
// frames. The parent hops it with `lift`; the shadow
// stays on the ground and shrinks.

import React from 'react';
import { C } from '../theme';
import { clamp, easeInOutCubic, easeOutCubic, lerp, ramp, settle } from '../lib/anim';
import type { BotKind, ConceptBot } from './kit/types';
import { BodyArt, BUBBLE_TAIL, CUBE_SCREEN, Mitt, Silhouette } from './Art';
import { Face, type EyeMode, type FaceState, type MouthMode } from './Face';
import { Chips, Dot, Fizz, keys, Pixels, Ring, WeldHead } from './fx';
import { add, centroid, fx, grow, inside, lerpPt, mul, pointAt, pt, ribbon, rotate, shapeD, sub, unit, type Pt } from './geom';
import { DAMAGE, OW, SPEC, mix, palette, type Pal } from './spec';

const r1 = (p: Pt): Pt => ({ x: Math.round(p.x), y: Math.round(p.y) });

// Where each bot's damage sits (bot space, feet at 0,0): the reel's lens aims here.
export const DAMAGE_AT: Record<BotKind, Pt> = { bubble: DAMAGE.bubble.centre, cube: DAMAGE.cube.centre, orb: DAMAGE.orb.centre };
// The slash line through the impact point, 70 px beyond the outline both ways,
// in the direction of travel (the reel draws Diablo's slash ribbon along it).
export const SLASH_LINE: Record<BotKind, { a: Pt; b: Pt }> = {
  bubble: { a: r1(DAMAGE.bubble.slash.a), b: r1(DAMAGE.bubble.slash.b) },
  cube: { a: r1(DAMAGE.cube.slash.a), b: r1(DAMAGE.cube.slash.b) },
  orb: { a: r1(DAMAGE.orb.slash.a), b: r1(DAMAGE.orb.slash.b) },
};

const PHASE: Record<BotKind, number> = { bubble: 0, cube: 2.1, orb: 4.2 };
const SEED: Record<BotKind, number> = { bubble: 11, cube: 23, orb: 37 };
// The crack sparks every 30 frames. With the reel's hits (bubble 180, orb 188,
// cube 195) and lens stops (bubble 208, cube 223, orb 238, about 12 frames
// each) these land one spark inside each stop: reel 210, 226 and 250.
const FIZZ_OFF: Record<BotKind, number> = { bubble: 0, cube: 14, orb: 20 };
const GLINT_OFF: Record<BotKind, number> = { bubble: 0, cube: 15, orb: 30 }; // the inlay glints every 45
const CENTRE: Record<BotKind, Pt> = { bubble: { x: 0, y: -122 }, cube: { x: 0, y: -120 }, orb: { x: 0, y: -142 } };
// The reel (and the strip) close the seam over 15 frames. Only used to tell
// which spark cycles began before the seal did, so their pixels can finish.
const SEAL_FRAMES = 15;

const CRACK_HW = 10; // the crack's half-width at the notch's apex
const SNAP = 0.15; // seal: the chip is back in its notch (it flies in over the frames before)
const POUR0 = 0.15; // seal: the white starts to pour
const POUR1 = 0.96; // seal: it reaches the tip
const RIM = 4.5; // the badge's maroon rim (Diablo's colour around the white fix; about 1.5 px on a phone)
const GLINT = 15; // frames a glint takes, pad to pad

// Near-linear with soft ends, so the weld bead visibly travels down the bolt.
const pourEase = (x: number) => 0.5 * x + 0.25 * (1 - Math.cos(Math.PI * x));

export const ConceptBotImpl: ConceptBot = ({ kind, frame, bg, mood = 'happy', look, blink = 0, hitT, seal, sealT, lift = 0 }) => {
  const S = SPEC[kind];
  const D = DAMAGE[kind];
  const pal = palette(bg);
  const id = `fin-${kind}`;
  const hit = hitT !== undefined && hitT >= 0;
  const t = hit ? (hitT as number) : 0;
  const sl = hit ? clamp(seal ?? 0) : 0;
  const sealed = hit && sl >= 1;
  const sealing = hit && sl > 0 && sl < 1;
  const cel = sealed && sealT !== undefined && sealT >= 0 ? sealT : undefined;
  const ph = (frame / 30) * ((2 * Math.PI) / 1.7) + PHASE[kind];
  const L = D.line.total;
  const notchOpen = hit && sl < SNAP;
  const faceC = { x: 0, y: S.eyes.y };

  /* ── the crack and the white that replaces it (arc lengths along the bolt) ── */
  const hw = (s: number) => (s <= D.apex ? CRACK_HW + (D.apex - s) * 0.22 : CRACK_HW * Math.pow(clamp(1 - (s - D.apex) / (L - D.apex)), 0.6));
  const reveal = hit ? L * keys(t, [[0, 0.4], [1, 0.75], [2, 0.95], [3, 1]]) : 0;
  const front = sealed ? L : sealing ? lerp(-2, L, pourEase(clamp((sl - POUR0) / (POUR1 - POUR0)))) : -1;
  const head = pointAt(D.line, clamp(front, 0, L));
  const pouring = sealing && sl >= POUR0 && front < L;

  /* ── the face ── */
  let eye: EyeMode = mood === 'worried' ? 'worried' : mood === 'proud' ? 'joy' : 'open';
  // once chipped, 'worried' turns sheepish: raised brows over a small smile ("oops"), never a sad wobble
  let mth: MouthMode = mood === 'worried' ? (hit ? 'smile' : 'wavy') : mood === 'proud' ? 'grin' : 'smile';
  let bl = blink;
  let pupil = 1;
  let blush = mood === 'worried' && !hit ? 0.55 : 1;
  let lk = look ?? { x: 0, y: 0 };
  const toward = (q: Pt) => unit(sub(q, faceC));
  if (hit && t < 6) {
    // one beat of a wince: >_< (6 frames, so it clears the reel's 2-frame flash)
    eye = 'wince';
    mth = 'eep';
    bl = 0;
    blush = 0.9;
  } else if (hit && t < 10) {
    // the double-take: eyes pop wide and look at the crack (hitT 6-8), then snap to us (9)
    eye = 'wide';
    mth = 'o';
    bl = 0;
    blush = 0.5;
    pupil = 0.58 + 0.3 * ramp(t, 6, 10);
    const g = 1 - ramp(t, 8.3, 9);
    const v = toward(D.centre);
    lk = { x: v.x * g, y: v.y * g };
  }
  if (hit && t >= 10.2 && t < 13) bl = Math.max(bl, keys(t, [[10.2, 0], [11, 0.95], [12, 0.55], [12.8, 0]]));
  if (sealing) {
    // it watches the chip snap back, then follows the weld bead down the bolt
    const target = sl < POUR0 ? D.chip[0] : head;
    const w = ramp(sl, 0, 0.06) * (1 - ramp(sl, 0.97, 1));
    const v = toward(target);
    lk = { x: lerp(lk.x, v.x, w), y: lerp(lk.y, v.y, w) };
    bl = 0;
  }
  if (cel !== undefined && cel < 20) {
    eye = 'joy';
    mth = 'grin';
    blush = 1;
  }
  const fs: FaceState = { eye, mouth: mth, blink: bl, look: lk, pupil, blush };

  /* ── the pose: idle, mood, the hit-stop, the double-take, the click, the hop ── */
  let sx = 1;
  let sy = 1;
  let rot = 0;
  let tx = 0;
  let ty = 0;
  const br = Math.sin(ph);
  if (kind === 'orb') ty -= 3.5 * br;
  else {
    sy *= 1 + 0.012 * br;
    sx *= 1 - 0.006 * br;
  }
  if (mood === 'worried') {
    sy *= 0.975;
    sx *= 1.012;
  } else if (mood === 'proud') {
    sy *= 1.02;
    sx *= 0.99;
  }
  if (hit && t < 20) {
    // hit-stop: the impact pose holds for 2 frames, then a damped wobble
    const e = t < 2 ? 1 : Math.exp(-(t - 2) / 3) * Math.cos((t - 2) * 0.95);
    const orb = kind === 'orb';
    tx += D.u.x * (orb ? 9 : 6) * e;
    ty += D.u.y * (orb ? 9 : 4) * e;
    rot += Math.sign(D.u.x) * (orb ? 9 : 6) * e;
    sx *= 1 + 0.08 * e;
    sy *= 1 - 0.1 * e;
    const take = keys(t, [[3.6, 0], [4.4, 1], [5.8, 0.35], [7, 1], [8.2, 0]]);
    sy *= 1 + 0.03 * take;
    sx *= 1 - 0.015 * take;
  }
  if (sealing) {
    const click = keys(sl, [[SNAP - 0.03, 0], [SNAP + 0.03, 1], [0.32, 0]]);
    sy *= 1 - 0.035 * click;
    sx *= 1 + 0.025 * click;
  }
  sy *= 1 + 0.0012 * Math.max(0, lift); // a little stretch in the air
  sx *= 1 - 0.0006 * Math.max(0, lift);
  const P = S.pivot;
  const pose = `translate(${fx(tx)} ${fx(ty - lift)}) rotate(${fx(rot)} ${P.x} ${P.y}) translate(${P.x} ${P.y}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-P.x} ${-P.y})`;
  // the same, undone: for things drawn inside the posed body that must stay put
  const unpose = `translate(${P.x} ${P.y}) scale(${(1 / sx).toFixed(4)} ${(1 / sy).toFixed(4)}) translate(${-P.x} ${-P.y}) rotate(${fx(-rot)} ${P.x} ${P.y}) translate(${fx(-tx)} ${fx(lift - ty)})`;
  const toBody = (q: Pt): Pt => {
    const c = Math.cos((-rot * Math.PI) / 180);
    const s = Math.sin((-rot * Math.PI) / 180);
    const dx = q.x - tx - P.x;
    const dy = q.y - (ty - lift) - P.y;
    return { x: P.x + (dx * c - dy * s) / sx, y: P.y + (dx * s + dy * c) / sy };
  };
  const slash = hit && t < 3.6 ? slashSpan(kind, toBody) : null;

  /* ── the cube's antenna and status light: white, ember while damaged ── */
  const whip = hit ? 1 - settle(t, 0, 2.8, 0.3) : 0;
  const sway = 3 * Math.sin(ph * 1.4) + 18 * whip;
  const led = hit && t >= 1 && !sealed ? (Math.floor((frame + 3) / 9) % 3 === 2 ? mix(pal.ember, C.night, 0.4) : pal.ember) : pal.light;

  /* ── the glitch on the impact frames ── */
  const glitch = hit && t < 2 ? (t < 1 ? 0 : 1) : -1;

  const face =
    kind === 'cube' && glitch >= 0 ? (
      <ScreenTear id={id} f={glitch} pal={pal}>
        <Face kind={kind} st={fs} pal={pal} />
      </ScreenTear>
    ) : (
      <Face kind={kind} st={fs} pal={pal} />
    );

  /* ── the badge ── */
  const notchD = `M-300 -400H300V200H-300Z M${pt(D.notch[0])}L${pt(D.notch[1])}L${pt(D.notch[2])}Z`;
  const swell = cel !== undefined ? 1 + 0.42 * Math.exp(-cel / 2.4) : 1;
  const seamMid = pointAt(D.line, (D.mouth + L) / 2);
  const mouthPad = pointAt(D.line, D.mouth + 7);
  const tipPad = pointAt(D.line, L - 1);
  // the glint: a pulse of light that runs down the inlay from pad to pad
  const glintF = (() => {
    if (cel === undefined) return -1;
    if (cel >= 5 && cel < 5 + GLINT) return cel - 5; // after the burst has faded
    if (cel < 24) return -1;
    const k = (frame + GLINT_OFF[kind]) % 45;
    return k < GLINT ? k : -1;
  })();
  const pulseAt = glintF >= 0 ? lerp(D.mouth + 7, L - 1, ramp(glintF, 2, 11.5, easeInOutCubic)) : 0;
  const pulseAmp = glintF >= 0 ? 3.6 * keys(glintF, [[1.5, 0], [3, 1], [10.5, 1], [12, 0]]) : 0;
  const ihw = (s: number) =>
    // capped near the notch's mouth so the white reads as a bolt, not a patch flooding the edge
    (Math.min(hw(s), CRACK_HW * 1.15) + 3 * clamp((L - s) / 14)) * clamp((front - s) / 6 + 0.15) * swell +
    (pulseAmp > 0 ? pulseAmp * Math.exp(-(((s - pulseAt) / 9) ** 2)) * clamp((L - s) / 14) : 0); // the glint keeps the point
  const outer = (s: number) => Math.min(hw(s), Math.max(0, (reveal - s) * 0.9));
  const crackFrom = Math.max(0, front);
  const crackD = hit && reveal > crackFrom ? ribbon(D.line, crackFrom, reveal, outer) : '';
  const inlayRimD = front > 0 ? ribbon(D.line, 0, front, (s) => ihw(s) + RIM, 3) : '';
  const inlayD = front > 0 ? ribbon(D.line, 0, front, ihw, 3) : '';

  /* ── the spark and pixels while it waits ── */
  // Only a cycle whose spark came after the crack settled (hitT 12) and before
  // the seal began: no pixels pop in mid-drift, and the ones in flight when the
  // seal starts finish their drift.
  const sealAge = sl <= 0 ? 0 : sealed ? SEAL_FRAMES + Math.max(0, sealT ?? 0) : sl * SEAL_FRAMES;
  const fz0 = hit ? (frame + FIZZ_OFF[kind]) % 30 : -1;
  const fz = fz0 >= 0 && t - fz0 >= 12 && fz0 >= sealAge ? fz0 : -1;
  const sF = D.mouth + 0.36 * (L - D.mouth); // the spark: in the crack's dark, near its middle
  const out = unit(add(unit(sub(D.centre, CENTRE[kind])), { x: 0, y: -1.2 })); // where the pixels drift

  return (
    <g>
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={shapeD(S.body)} />
        </clipPath>
        {kind === 'bubble' ? (
          <clipPath id={`${id}-tail`}>
            <path d={BUBBLE_TAIL} />
          </clipPath>
        ) : null}
        <clipPath id={`${id}-sil`}>
          <path d={shapeD(grow(S.body, OW))} />
        </clipPath>
        <clipPath id={`${id}-notch`}>
          <path d={notchD} clipRule="evenodd" />
        </clipPath>
        {kind === 'cube'
          ? BANDS.map((b, i) => (
              <clipPath key={i} id={`${id}-band${i}`}>
                <rect x={CUBE_SCREEN.x0} y={b[0]} width={CUBE_SCREEN.x1 - CUBE_SCREEN.x0} height={b[1] - b[0]} />
              </clipPath>
            ))
          : null}
      </defs>

      <Shadow kind={kind} lift={lift + Math.max(0, -ty)} x={tx * 0.4} sx={sx} color={pal.ground} />

      {hit && t < 10 ? (
        <Chips at={pointAt(D.line, D.mouth)} out={mul(D.d, -1)} t={t} seed={SEED[kind]} vchip={D.chip} fill={pal.body} ink={pal.ink} speed={CHIP_SPEED[kind]} />
      ) : null}

      <g transform={pose}>
        {/* the glitch: the bot's channels split for the impact frames */}
        {glitch >= 0 ? (
          <>
            <g transform={`translate(${glitch === 0 ? 8 : -4.5} ${glitch === 0 ? -1.5 : 1})`}>
              <Silhouette kind={kind} fill={mix(pal.ember, C.maroon, 0.3)} />
            </g>
            <g transform={`translate(${glitch === 0 ? -8 : 4.5} ${glitch === 0 ? 1.5 : -1})`}>
              <Silhouette kind={kind} fill={pal.light} />
            </g>
          </>
        ) : null}

        {/* the fix lands: light bursts out around the new badge, breaking the silhouette */}
        {cel !== undefined && cel < 4 ? <Dot at={seamMid} r={keys(cel, [[0, 30], [1, 50], [2, 46], [4, 0]])} fill={pal.fx} /> : null}

        <g clipPath={notchOpen ? `url(#${id}-notch)` : undefined}>
          <BodyArt kind={kind} id={id} pal={pal} sway={sway} led={led} />
          {hit ? (
            <g clipPath={`url(#${id}-body)`}>
              {/* the crack: dark maroon with a thin flat lip, drawn on from the notch */}
              <Rib transform="translate(-2.4 -2.8)" d={crackD} fill={pal.lip} />
              <Rib d={crackD} fill={pal.crack} />
              {/* the slash opens a dark cut where its light crosses the shell (kept on the light's line) */}
              {slash && t < 2.7 ? (
                <g transform={unpose}>
                  <SlashCut sp={slash} t={t} fill={pal.crack} />
                </g>
              ) : null}
              {/* the white inlay, raised: a shade drop, an ink rim, white */}
              <Rib transform="translate(2.2 2.8)" d={inlayRimD} fill={pal.shade} />
              <Rib d={inlayRimD} fill={C.maroon} />
              <Rib d={inlayD} fill={pal.light} />
            </g>
          ) : null}
          {notchOpen ? (
            <g clipPath={`url(#${id}-sil)`}>
              <path d={`M${pt(D.notch[1])}L${pt(D.notch[0])}L${pt(D.notch[2])}`} fill="none" stroke={pal.ink} strokeWidth={2 * OW} strokeLinejoin="round" />
            </g>
          ) : null}
          {face}
        </g>

        {glintF >= 1 && glintF < 7 ? <Ring at={mouthPad} r={9 + 16 * ramp(glintF, 1, 7, easeOutCubic)} w={3 * (1 - ramp(glintF, 1, 7))} color={pal.fx} /> : null}
        {glintF >= 12 ? <Ring at={tipPad} r={8 + 12 * ramp(glintF, 12, 15, easeOutCubic)} w={2.4 * (1 - ramp(glintF, 12, 15))} color={pal.light} /> : null}

        {/* the chip flies back into its notch */}
        {sealing && sl < SNAP ? <ChipBack chip={D.chip} d={D.d} k={sl / SNAP} pal={pal} /> : null}

        {/* while it waits: a tiny round spark in the crack, white pixels drifting out */}
        {fz >= 0 ? (
          <>
            <Fizz at={pointAt(D.line, sF)} t={fz} color={pal.light} />
            <Pixels
              from={[0.22, 0.42, 0.62].map((k) => pointAt(D.line, D.mouth + k * (L - D.mouth)))}
              out={out}
              t={fz}
              seed={SEED[kind] + Math.floor((frame - fz) / 30)}
              color={pal.light}
              rim={bg === 'white' ? pal.ink : undefined}
            />
          </>
        ) : null}

        {/* the weld bead leads the white down the bolt */}
        {pouring && front > -1 ? <WeldHead at={head} pulse={Math.sin(frame * 1.9)} light={pal.light} /> : null}

        {/* the click as the chip lands */}
        {sealing && sl >= SNAP && sl < SNAP + 0.12 ? (
          <>
            {/* a flash only: any ring here would circle the weld bead as the pour starts, and read as an eye */}
            <Dot at={centroid(D.chip)} r={13 * keys(sl, [[SNAP, 0.6], [SNAP + 0.05, 1], [SNAP + 0.11, 0]])} fill={pal.light} />
          </>
        ) : null}

        {/* the fix lands: a ring of light off the new badge */}
        {cel !== undefined && cel < 6 ? <Ring at={seamMid} r={14 + 34 * easeOutCubic(clamp(cel / 6))} w={7 * (1 - clamp(cel / 6))} color={pal.fx} /> : null}

        {kind === 'orb' ? <Mitts ph={ph} mood={mood} hitT={hit ? t : undefined} cel={cel} pal={pal} /> : null}
      </g>

      {/* the slash: a bar of light along its line (the reel's ribbon's arc), spilling out of both ends */}
      {slash ? <SlashLight sp={slash} t={t} color={pal.fx} /> : null}
    </g>
  );
};

// A ribbon (many small pieces in one path): a hairline stroke in its own colour
// covers the anti-aliasing seams between the pieces.
const Rib: React.FC<{ d: string; fill: string; transform?: string }> = ({ d, fill, transform }) =>
  d ? <path transform={transform} d={d} fill={fill} stroke={fill} strokeWidth={1} strokeLinejoin="round" /> : null;

/* ───────── the slash's light ───────── */

const SLASH_BOW = 20; // the reel bows Diablo's slash ribbon this far off the line (the control point)

// The reel's slash arc for this bot: the quadratic from SLASH_LINE.a to .b (in
// travel order), its control point bowed SLASH_BOW to the right of travel.
const arcOf = (kind: BotKind) => {
  const { a, b } = SLASH_LINE[kind];
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  const c = add(lerpPt(a, b, 0.5), { x: -u.y, y: u.x }, SLASH_BOW);
  const at = (k: number): Pt => add(add(mul(a, (1 - k) * (1 - k)), c, 2 * k * (1 - k)), b, k * k);
  const tan = (k: number): Pt => unit(add(mul(sub(c, a), 2 * (1 - k)), sub(b, c), 2 * k));
  return { at, tan, len: l };
};

// Where the light runs: from just before it enters the (posed) silhouette to
// just after it leaves (arc parameters), where the impact is, and where it
// breaks in and out of the outline. `toBody` maps plain bot space into the
// posed body's own space.
const SPILL = 26; // px the light runs past the outline where the blade comes in
// ...and where it leaves: every exit faces a neighbour (the cube's toward the bubble), so it stops short
const SPILL_OUT: Record<BotKind, number> = { bubble: 6, cube: 8, orb: 6 };
// The chips fly out toward the neighbours; slower, they drop close to their own bot.
const CHIP_SPEED: Record<BotKind, number> = { bubble: 0.6, cube: 0.55, orb: 0.8 };
const slashSpan = (kind: BotKind, toBody: (p: Pt) => Pt) => {
  const D = DAMAGE[kind];
  const arc = arcOf(kind);
  const sil = grow(SPEC[kind].body, OW);
  let kin = -1;
  let kout = -1;
  for (let i = 0; i <= 240; i++) {
    const k = i / 240;
    if (inside(sil, toBody(arc.at(k)))) {
      if (kin < 0) kin = k;
      kout = k;
    }
  }
  const { a } = SLASH_LINE[kind];
  const proj = (p: Pt) => ((p.x - a.x) * D.u.x + (p.y - a.y) * D.u.y) / arc.len; // the arc's parameter is linear in the chord projection
  if (kin < 0) {
    kin = proj(D.chord.a);
    kout = proj(D.chord.b);
  }
  return {
    arc,
    k0: clamp(proj(pointAt(D.line, D.mouth)), kin, kout),
    ka: Math.max(0, kin - SPILL / arc.len),
    kb: Math.min(1, kout + SPILL_OUT[kind] / arc.len),
    kin,
    kout,
  };
};
type SlashSpan = ReturnType<typeof slashSpan>;

// A crescent sliver along the arc from parameter ka to kb: pointed at both
// ends, widest (w) at k0, bowed like the reel's ribbon so it sits inside it.
const sliverD = (sp: SlashSpan, w: number) => {
  const { arc, ka, kb, k0 } = sp;
  const g = Math.log(0.5) / Math.log(clamp((k0 - ka) / (kb - ka), 0.08, 0.92));
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i <= 32; i++) {
    const m = i / 32;
    const k = lerp(ka, kb, m);
    const at = arc.at(k);
    const tg = arc.tan(k);
    const n = { x: -tg.y, y: tg.x };
    const hw = w * Math.pow(Math.sin(Math.PI * Math.pow(m, g)), 0.8);
    top.push(add(at, n, hw));
    bot.push(add(at, n, -hw * 0.55));
  }
  return `M${[...top, ...bot.reverse()].map(pt).join('L')}Z`;
};

const slashW = (t: number) => keys(t, [[0, 9], [1, 6], [2, 2.4], [2.7, 0]]);

// The dark cut the light opens in the shell. It is drawn inside the posed,
// body-clipped group with the pose undone, so it stays on the light's line.
const SlashCut: React.FC<{ sp: SlashSpan; t: number; fill: string }> = ({ sp, t, fill }) => {
  const W = slashW(t);
  return W > 0.3 ? <path d={sliverD(sp, W + 5.5)} fill={fill} /> : null;
};

// hitT 0–2: the slash flashes as a crescent of light (white on maroon, maroon
// on white) on the reel ribbon's own arc, widest at the impact point, thinning
// out while the crack grows out of the line. Where it breaks out through the
// outline, a round flare; then light spills off both ends as a few drops.
const SlashLight: React.FC<{ sp: SlashSpan; t: number; color: string }> = ({ sp, t, color }) => {
  const W = slashW(t);
  const drops = ramp(t, 0.7, 3.6);
  const ends: [Pt, Pt][] = [
    [sp.arc.at(sp.kin), mul(sp.arc.tan(sp.kin), -1)],
    [sp.arc.at(sp.kout), sp.arc.tan(sp.kout)],
  ];
  return (
    <g>
      {W > 0.3 ? <path d={sliverD(sp, W)} fill={color} /> : null}
      {t < 2 ? ends.map(([e], i) => <Dot key={`f${i}`} at={e} r={keys(t, [[0, 6.5], [1, 4.5], [2, 0]])} fill={color} />) : null}
      {drops > 0 && drops < 1
        ? ends.slice(0, 1).map(([e, v0], i) => // drops only where the blade comes in: the far side faces a neighbour
            [-14, 12].map((da, j) => {
              const v = rotate(v0, da);
              const q = add(e, v, 5 + (j ? 22 : 16) * easeOutCubic(drops));
              return <Dot key={`${i}${j}`} at={q} r={(j ? 3.4 : 2.6) * (1 - drops)} fill={color} />;
            }),
          )
        : null}
    </g>
  );
};

/* ───────── the cube's screen tears into scanline bars for the impact frames ───────── */

const BANDS: [number, number][] = [
  [CUBE_SCREEN.y0, -156],
  [-156, -126],
  [-126, CUBE_SCREEN.y1],
];
const TEAR = [
  [9, -7, 5],
  [-5, 4, -2.5],
];
const ScreenTear: React.FC<{ id: string; f: number; pal: Pal; children: React.ReactNode }> = ({ id, f, pal, children }) => (
  <g>
    {BANDS.map((_, i) => (
      <g key={i} clipPath={`url(#${id}-band${i})`}>
        <g transform={`translate(${TEAR[f][i]} 0)`}>{children}</g>
      </g>
    ))}
    {(f === 0 ? [-170, -136] : [-152, -112]).map((y, i) => (
      <rect key={i} x={CUBE_SCREEN.x0 + 4} y={y} width={CUBE_SCREEN.x1 - CUBE_SCREEN.x0 - 8} height={i ? 3 : 5} fill={pal.light} opacity={0.22} />
    ))}
  </g>
);

/* ───────── the chip flies back and snaps into its notch ───────── */

const ChipBack: React.FC<{ chip: Pt[]; d: Pt; k: number; pal: Pal }> = ({ chip, d, k, pal }) => {
  const c = centroid(chip);
  const e = clamp(k) * clamp(k); // it speeds up into the notch: the click is the hard stop
  const from = add(add(c, d, -40), { x: -d.y, y: d.x }, 12);
  const p = lerpPt(from, c, e);
  const r = lerp(-120, 0, e);
  const tri = chip.map((q) => sub(q, c));
  const dd = tri.map((q, j) => `${j ? 'L' : 'M'}${pt(q)}`).join('') + 'Z';
  return <path transform={`translate(${pt(p)}) rotate(${fx(r)})`} d={dd} fill={pal.body} stroke={pal.ink} strokeWidth={3.6} strokeLinejoin="round" paintOrder="stroke" />;
};

/* ───────── the flat ground shadow: stays on the ground, shrinks as the body lifts ───────── */

const Shadow: React.FC<{ kind: BotKind; lift: number; x: number; sx: number; color: string }> = ({ kind, lift, x, sx, color }) => {
  const S = SPEC[kind];
  const k = clamp(1 - Math.max(0, lift) / 150, 0.45, 1.05);
  return <ellipse cx={fx(x)} cy={fx(-S.shadow.ry * k)} rx={fx(S.shadow.rx * k * sx)} ry={fx(S.shadow.ry * k)} fill={color} />;
};

/* ───────── the orb's mitts ───────── */

const Mitts: React.FC<{ ph: number; mood: string; hitT: number | undefined; cel: number | undefined; pal: Pal }> = ({ ph, mood, hitT, cel, pal }) => {
  const rest = mood === 'worried' ? { x: 70, y: -86 } : mood === 'proud' ? { x: 101, y: -112 } : { x: 97, y: -86 };
  let p = rest;
  if (hitT !== undefined && hitT < 16) {
    // startled: up and out on the hit, held through the double-take
    p = lerpPt(rest, { x: 102, y: -114 }, keys(hitT, [[0, 0], [1.5, 1], [8, 1], [15, 0]]));
  }
  if (cel !== undefined && cel < 24) {
    // hands up, yay: raised clear of the head and splayed out (not ears)
    p = lerpPt(p, { x: 99, y: -226 }, keys(cel, [[0, 0], [3, 1], [14, 1], [22, 0]]));
  }
  return (
    <g>
      {([-1, 1] as const).map((sd) => (
        <Mitt key={sd} side={sd} x={sd * p.x} y={p.y + 3 * Math.sin(ph * 1.3 + sd)} pal={pal} />
      ))}
    </g>
  );
};
