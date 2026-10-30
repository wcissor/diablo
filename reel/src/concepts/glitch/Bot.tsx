// GLITCH: three flat sticker bots that get hit like corrupted video.
//   hit (hitT 0..5)  the bot tears into horizontal bands that jump sideways with
//                    ember and white ghost copies; its face flips to "> <"
//                    (the cube's screen bursts into static).
//   damaged          ONE crisp zig-zag bug line along the slash, three short rows
//                    of it still glitched sideways (with ember/white fringes),
//                    and a few pixels drifting off it.
//   seal (0..1)      a white seam zips along the zig-zag; each glitched row clicks
//                    back into line and each pixel snaps home as it passes.
//   sealed (sealT)   seam flash, pixel confetti, a hop; the bot keeps a tidy white
//                    zig-zag seam with two end pads as its upgrade.
// Pure functions of the props; plain SVG; ids unique per instance.

import React, { useId } from 'react';
import { clamp, easeInBack, easeInOutCubic, easeOutBack, easeOutCubic } from '../../lib/anim';
import { SLASH_DIR, type BotKind, type ConceptBot } from '../_kit/types';
import { Face, type Expr } from './Face';
import { type Band, bandsAt, blocksAt, cheerAt, confettiAt, knockAt, pixelDefs, pixelsAt, tearAt } from './glitch';
import { INK, OL, PAL, dirOf, mix, mul, polyAt, ptsD, type Pt } from './kit';
import { BUGS, SHAPES, type Bug, type Motion, type Part, type Shape, boxD, stripsFor, zigzag } from './shapes';

const PIXELS = {
  bubble: pixelDefs('bubble', BUGS.bubble),
  cube: pixelDefs('cube', BUGS.cube),
  orb: pixelDefs('orb', BUGS.orb),
} as const;
const STRIPS = {
  bubble: stripsFor(SHAPES.bubble, BUGS.bubble),
  cube: stripsFor(SHAPES.cube, BUGS.cube),
  orb: stripsFor(SHAPES.orb, BUGS.orb),
} as const;
const PHASE: Record<BotKind, number> = { bubble: 0, cube: 2.1, orb: 4.2 };

/* ───────── drawing the shapes ───────── */
const xf = (p: Part) => (p.rot && p.at ? `rotate(${p.rot} ${p.at.x} ${p.at.y})` : undefined);

// Parts drawn fat in one colour: outlines, and the glitch ghosts.
const Silhouette: React.FC<{ parts: Part[]; color: string }> = ({ parts, color }) => (
  <g>
    {parts.map((p, i) =>
      p.line ? (
        <path key={i} d={p.d} transform={xf(p)} fill="none" stroke={color} strokeWidth={p.line + 2 * OL} strokeLinecap="round" />
      ) : (
        <path key={i} d={p.d} transform={xf(p)} fill={color} stroke={color} strokeWidth={2 * OL} strokeLinejoin="round" />
      ),
    )}
  </g>
);
const Fills: React.FC<{ parts: Part[] }> = ({ parts }) => (
  <g>
    {parts.map((p, i) =>
      p.line ? (
        <path key={i} d={p.d} transform={xf(p)} fill="none" stroke={p.fill} strokeWidth={p.line} strokeLinecap="round" />
      ) : (
        <path key={i} d={p.d} transform={xf(p)} fill={p.fill} />
      ),
    )}
  </g>
);
const Parts: React.FC<{ parts: Part[] }> = ({ parts }) =>
  parts.length ? (
    <g>
      <Silhouette parts={parts} color={INK} />
      <Fills parts={parts} />
    </g>
  ) : null;

const allParts = (s: Shape, m: Motion): Part[] => [...s.back(m), { d: s.body, fill: PAL.body }, ...s.over(m)];

// The shell: outline, flat fill, one shade crescent, the shine, the face.
const Shell: React.FC<{ s: Shape; id: string; expr: Expr; look: Pt; blink: number; seed: string }> = ({ s, id, expr, look, blink, seed }) => (
  <g>
    <path d={s.body} fill={INK} stroke={INK} strokeWidth={2 * OL} strokeLinejoin="round" />
    <path d={s.body} fill={PAL.shade} />
    <g clipPath={`url(#${id}-body)`}>
      <path d={s.body} fill={PAL.body} transform={`translate(${s.shadeShift.x} ${s.shadeShift.y})`} />
    </g>
    <path d={s.shine} fill="none" stroke={PAL.white} strokeWidth={9} strokeLinecap="round" />
    <circle cx={s.shineDot.x} cy={s.shineDot.y} r={4.5} fill={PAL.white} />
    <Face id={id} f={s.face} expr={expr} look={look} blink={blink} seed={seed} />
  </g>
);

/* ───────── the damage ───────── */
// The bug line: a bold night zig-zag; the white seam zips along inside it. In a
// glitched row it gets the hit's colour split (`fringe`), offset the way the row jumped.
const BugLine: React.FC<{ id: string; bug: Bug; grow: number; head: number; relax: number; screen: boolean; dx?: number; fringe?: string }> = ({
  id,
  bug,
  grow,
  head,
  relax,
  screen,
  dx = 0,
  fringe,
}) => {
  if (grow <= 0) return null;
  const d = ptsD(zigzag(bug, relax));
  const sealed = head > 0;
  const trim = (to: number) => (to < 1 ? { pathLength: 1, strokeDasharray: `${to} 3` } : {});
  const sx = Math.sign(dx) || 1;
  return (
    <g clipPath={`url(#${id}-body)`}>
      {fringe && head < 1 ? (
        <>
          <path d={d} transform={`translate(${-4 * sx} -1.5)`} fill="none" stroke={PAL.ember} strokeWidth={9} strokeLinejoin="miter" strokeLinecap="round" {...trim(grow)} />
          <path d={d} transform={`translate(${4 * sx} 1.5)`} fill="none" stroke={fringe} strokeWidth={9} strokeLinejoin="miter" strokeLinecap="round" {...trim(grow)} />
        </>
      ) : null}
      <path d={d} fill="none" stroke={INK} strokeWidth={sealed ? 11 : 9} strokeLinejoin="miter" strokeLinecap="round" {...trim(grow)} />
      {screen ? (
        // over the cube's night screen the line shows as a light scratch of dead pixels
        <g clipPath={`url(#${id}-screen)`}>
          <path d={d} fill="none" stroke={PAL.deep} strokeWidth={5} strokeLinejoin="miter" strokeLinecap="round" {...trim(grow)} />
        </g>
      ) : null}
      {sealed ? <path d={d} fill="none" stroke={PAL.white} strokeWidth={6.5} strokeLinejoin="miter" strokeLinecap="round" {...trim(head)} /> : null}
    </g>
  );
};

// The bot torn into horizontal bands, each jumped sideways over its own ghosts.
const Torn: React.FC<{ id: string; bands: Band[] | null; ghost: number; ghosts: React.ReactNode[]; children: React.ReactNode }> = ({
  id,
  bands,
  ghost,
  ghosts,
  children,
}) =>
  bands === null ? (
    <>{children}</>
  ) : (
    <>
      {bands.map((b, i) => (
        <g key={i} mask={`url(#${id}-b${i})`}>
          <g transform={`translate(${b.dx} 0)`}>
            {ghost > 0 ? (
              <>
                <g transform={`translate(${-ghost} ${i % 2 ? 2 : -2})`}>{ghosts[0]}</g>
                <g transform={`translate(${ghost} ${i % 2 ? -2 : 2})`}>{ghosts[1]}</g>
              </>
            ) : null}
            {children}
          </g>
        </g>
      ))}
    </>
  );

/* ───────── the bot ───────── */
export const ConceptBotImpl: ConceptBot = ({ kind, frame, bg, mood = 'happy', look = { x: 0, y: 0 }, blink = 0, hitT, seal, sealT }) => {
  const id = `gl-${kind}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const s = SHAPES[kind];
  const bug = BUGS[kind];
  const u = dirOf(SLASH_DIR[kind]);
  const onWhite = bg === 'white';

  // where we are in the story
  const hit = hitT !== undefined && hitT >= 0;
  const t = hit ? (hitT as number) : 0;
  const sl = hit ? clamp(seal ?? 0) : 0;
  const ct = hit && (sealT !== undefined || sl >= 1) ? Math.max(0, sealT ?? 0) : undefined;
  const head = ct !== undefined ? 1 : easeInOutCubic(sl);

  // the tear
  const amp = hit ? tearAt(t, sl > 0) : 0;
  const bands = amp > 0 ? bandsAt(kind, t, amp) : null;
  const ghost = amp > 0.12 ? 3 + 12 * amp : 0;
  const tint = onWhite ? PAL.maroon : PAL.white; // the second glitch colour (white is invisible on white)

  // the bug line and its glitched rows
  const grow = hit ? easeOutCubic(clamp((t - 1) / 4)) : 0;
  const relax = ct === undefined ? 1 : 1 - 0.25 * easeOutBack(clamp(ct / 9));
  const rows = hit
    ? STRIPS[kind].map((r, i) => {
        const open = easeOutBack(clamp((t - 3 - i) / 4), 2.2); // they jump out just after the line lands
        const home = 1 - easeInBack(clamp((head - (r.u - 0.12)) / 0.14), 2.2); // ...and click back as the seam passes
        const flick = sl === 0 && (Math.floor(frame / 2) + i * 7) % 23 === 0 ? 1.6 : 1; // a stutter now and then
        return { ...r, dx: r.dx * open * home * flick };
      })
    : [];

  // the face
  const expr: Expr = hit && t < 7 && sl === 0 ? (kind === 'cube' && t < 3 ? 'static' : 'wince') : mood;

  // motion: idle breath / hover, the knock, the cheer
  const ph = PHASE[kind];
  const breath = Math.sin(frame * 0.16 + ph);
  const hover = kind === 'orb' ? -5 * Math.sin(frame * 0.11 + ph) : 0;
  const knock = knockAt(hit ? t : undefined);
  const cheer = cheerAt(ct);
  const m: Motion = {
    frame,
    flap: 8 * Math.sin(frame * 0.32 + ph) + 16 * knock.push - 22 * cheer.hop,
    wobble: 4 * Math.sin(frame * 0.2 + ph) - 22 * knock.push * Math.sign(u.x) + 10 * cheer.land,
  };
  const push = mul(u, 12 * knock.push);
  const rot = Math.sign(u.x) * 6 * knock.push;
  const proud = expr === 'proud' ? 1 : 0;
  const sy = (1 + 0.012 * breath) * (1 - 0.12 * knock.squash) * (1 + 0.07 * cheer.hop) * (1 - 0.1 * cheer.land) * (1 + 0.015 * proud);
  const sx = (1 - 0.008 * breath) * (1 + 0.09 * knock.squash) * (1 - 0.045 * cheer.hop) * (1 + 0.08 * cheer.land);
  const lift = 22 * cheer.hop;
  const oy = kind === 'orb' ? s.centre.y : 0;
  const place = `translate(${push.x} ${push.y - lift + hover}) rotate(${rot}) translate(0 ${oy}) scale(${sx} ${sy}) translate(0 ${-oy})`;

  const seed = `${kind}-${Math.floor(t)}`;
  const parts = allParts(s, m);
  const ghosts = [<Silhouette key="e" parts={parts} color={PAL.ember} />, <Silhouette key="w" parts={parts} color={tint} />];
  const shell = <Shell s={s} id={id} expr={expr} look={look} blink={blink} seed={seed} />;

  const pixels = hit ? pixelsAt(PIXELS[kind], bug, t, frame, head) : [];
  const confetti = confettiAt(kind, bug, ct);
  const blocks = hit && sl === 0 ? blocksAt(kind, t) : [];
  const blockFill = [PAL.ember, tint, onWhite ? PAL.maroon : PAL.night];
  const pixelFill = { ember: PAL.ember, ink: INK, white: PAL.white };
  const shadow = onWhite ? mix(PAL.white, PAL.maroon, 0.13) : mix(PAL.maroon, PAL.night, 0.6);
  const ringInk = onWhite ? mix(PAL.white, PAL.maroon, 0.35) : mix(PAL.maroon, PAL.white, 0.4);
  const line = zigzag(bug, relax);
  const headAt = polyAt(line, head);
  const flash = ct !== undefined && ct < 9 ? 1 - ct / 9 : 0;
  const pads = ct !== undefined ? easeOutBack(clamp((ct - 3) / 6), 2.5) : 0;
  const shRx = s.shadowRx * (1 - 0.3 * cheer.hop) * (1 + hover * 0.012) * (1 + 0.06 * knock.squash);

  return (
    <g>
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={s.body} />
        </clipPath>
        {s.face.screen ? (
          <clipPath id={`${id}-screen`}>
            <path d={boxD(s.face.screen)} />
          </clipPath>
        ) : null}
        {/* masks, not clips: the row is composited first, so its edge leaves no seam */}
        {rows.map((r, i) => (
          <mask key={i} id={`${id}-r${i}`} maskUnits="userSpaceOnUse" x={r.c.x - r.w / 2} y={r.c.y - r.h / 2} width={r.w} height={r.h}>
            <rect x={r.c.x - r.w / 2} y={r.c.y - r.h / 2} width={r.w} height={r.h} fill="#fff" />
          </mask>
        ))}
        {bands?.map((b, i) => {
          const h = b.y1 - b.y0 + 2; // overlap the next band (drawn on top) so no seam shows between them
          return (
            <mask key={i} id={`${id}-b${i}`} maskUnits="userSpaceOnUse" x={-500} y={b.y0} width={1000} height={h}>
              <rect x={-500} y={b.y0} width={1000} height={h} fill="#fff" />
            </mask>
          );
        })}
      </defs>

      <ellipse cx={push.x * 0.4} cy={1} rx={shRx} ry={Math.max(6, shRx * 0.12)} fill={shadow} />

      <g transform={place}>
        {kind === 'orb'
          ? [0, 1].map((k) => {
              const p = (frame * 0.045 + k * 0.5) % 1;
              const rx = 16 + 34 * p;
              return <ellipse key={k} cx={0} cy={-38 + 32 * p - hover * (1 - p)} rx={rx} ry={rx * 0.24} fill="none" stroke={ringInk} strokeWidth={5 * (1 - p)} />;
            })
          : null}

        <Torn id={id} bands={bands} ghost={ghost} ghosts={ghosts}>
          <Parts parts={s.back(m)} />
          {shell}
          <BugLine id={id} bug={bug} grow={grow} head={head} relax={relax} screen={s.face.screen !== null} />
          {/* the glitched rows: the shell and the line, jumped sideways over an ember/white split */}
          {rows.map((r, i) =>
            Math.abs(r.dx) < 0.3 ? null : (
              <g key={i} mask={`url(#${id}-r${i})`}>
                <g transform={`translate(${r.dx} 0)`}>
                  <path d={s.body} transform={`translate(${-4 * Math.sign(r.dx)} 0)`} fill={PAL.ember} stroke={PAL.ember} strokeWidth={2 * OL} strokeLinejoin="round" />
                  <path d={s.body} transform={`translate(${4 * Math.sign(r.dx)} 0)`} fill={tint} stroke={tint} strokeWidth={2 * OL} strokeLinejoin="round" />
                  {shell}
                  <BugLine id={id} bug={bug} grow={grow} head={head} relax={relax} screen={s.face.screen !== null} dx={r.dx} fringe={tint} />
                </g>
              </g>
            ),
          )}
          <Parts parts={s.over(m)} />
        </Torn>

        {/* the seam's end pads, once it has closed */}
        {pads > 0
          ? [0, 1].map((f) => {
              const p = polyAt(line, f);
              return <circle key={f} cx={p.x} cy={p.y} r={7 * pads} fill={PAL.white} stroke={INK} strokeWidth={3} />;
            })
          : null}

        {/* the seam's zipper head */}
        {sl > 0 && sl < 1 ? (
          <g transform={`translate(${headAt.x} ${headAt.y})`}>
            <circle r={19} fill="none" stroke={PAL.white} strokeWidth={4} />
            <rect x={-8.5} y={-8.5} width={17} height={17} transform="rotate(45)" fill={PAL.white} stroke={INK} strokeWidth={3} />
          </g>
        ) : null}

        {/* seam flash as it closes */}
        {flash > 0 ? (
          <g clipPath={`url(#${id}-body)`}>
            <path d={ptsD(line)} fill="none" stroke={PAL.white} strokeWidth={5 + 16 * flash} strokeLinejoin="round" opacity={0.85 * flash} />
          </g>
        ) : null}

        {pixels.map((p, i) => (
          <rect
            key={i}
            x={p.x - p.size / 2}
            y={p.y - p.size / 2}
            width={p.size}
            height={p.size}
            fill={p.white ? PAL.white : pixelFill[p.c]}
            stroke={p.c === 'ink' || p.c === 'ember' ? 'none' : INK}
            strokeWidth={2}
          />
        ))}
        {confetti.map((c, i) => (
          <rect key={i} x={c.x - c.size / 2} y={c.y - c.size / 2} width={c.size} height={c.size} fill={[onWhite ? PAL.maroon : PAL.white, PAL.ember, onWhite ? PAL.night : PAL.glow][c.c]} />
        ))}
        {blocks.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={blockFill[b.c]} />
        ))}
      </g>
    </g>
  );
};
