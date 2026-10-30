// Faces. The bubble and the orb wear ink faces (night eyes with two white
// highlights, a mouth with an ember tongue, blush); the cube shows the same face
// inverted on its night screen. Expressions: happy, worried, proud, plus the
// hit's "> <" wince and, for the cube, a burst of screen static.

import React from 'react';
import { clamp, rnd } from '../../lib/anim';
import { INK, PAL, type Pt } from './kit';
import { type Box, type FaceSpec, boxD } from './shapes';

export type Expr = 'happy' | 'worried' | 'proud' | 'wince' | 'static';

const round = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// An open-smile mouth: flat-ish top lip, deep bottom.
const smileD = (c: Pt, w: number, d: number) =>
  `M${c.x - w / 2} ${c.y}Q${c.x} ${c.y + d * 0.28} ${c.x + w / 2} ${c.y}` +
  `C${c.x + w / 2 - 1} ${c.y + d * 1.32} ${c.x - w / 2 + 1} ${c.y + d * 1.32} ${c.x - w / 2} ${c.y}Z`;
const waveD = (c: Pt, w: number) => {
  const s = w / 4;
  return `M${c.x - 2 * s} ${c.y + 2}Q${c.x - 1.5 * s} ${c.y - 3.5} ${c.x - s} ${c.y + 2}T${c.x} ${c.y + 2}T${c.x + s} ${c.y + 2}T${c.x + 2 * s} ${c.y + 2}`;
};
const zigD = (c: Pt, w: number, h = 4.5) => {
  const s = w / 4;
  return `M${c.x - 2 * s} ${c.y + h / 2}L${c.x - s} ${c.y - h / 2}L${c.x} ${c.y + h / 2}L${c.x + s} ${c.y - h / 2}L${c.x + 2 * s} ${c.y + h / 2}`;
};

const Mouth: React.FC<{ id: string; expr: Expr; c: Pt; w: number; ink: string; tongue: string }> = ({ id, expr, c, w, ink, tongue }) => {
  if (expr === 'worried') return <path d={waveD(c, w * 1.15)} stroke={ink} strokeWidth={5.5} {...round} />;
  if (expr === 'wince') return <path d={zigD(c, w * 1.05, 6)} stroke={ink} strokeWidth={5} {...round} />;
  const big = expr === 'proud';
  const d = smileD(c, big ? w * 1.35 : w, big ? 15 : 10.5);
  return (
    <g>
      <clipPath id={`${id}-mouth`}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={ink} stroke={ink} strokeWidth={2} strokeLinejoin="round" />
      <ellipse cx={c.x} cy={c.y + (big ? 16 : 11.5)} rx={w * (big ? 0.36 : 0.3)} ry={big ? 7.5 : 5.5} fill={tongue} clipPath={`url(#${id}-mouth)`} />
    </g>
  );
};

/* ───────── the ink face (bubble, orb) ───────── */
const InkEye: React.FC<{ c: Pt; rx: number; ry: number; blink: number }> = ({ c, rx, ry, blink }) => {
  if (blink > 0.72) return <path d={`M${c.x - rx} ${c.y}Q${c.x} ${c.y + ry * 0.5} ${c.x + rx} ${c.y}`} stroke={INK} strokeWidth={6} {...round} />;
  const h = Math.max(3, ry * (1 - blink));
  return (
    <g>
      <ellipse cx={c.x} cy={c.y} rx={rx} ry={h} fill={INK} />
      {blink < 0.35 ? (
        <>
          <circle cx={c.x + rx * 0.3} cy={c.y - h * 0.38} r={rx * 0.38} fill={PAL.white} />
          <circle cx={c.x - rx * 0.32} cy={c.y + h * 0.45} r={rx * 0.16} fill={PAL.white} />
        </>
      ) : null}
    </g>
  );
};

const InkFace: React.FC<{ id: string; f: FaceSpec; expr: Expr; look: Pt; blink: number }> = ({ id, f, expr, look, blink }) => {
  const lx = clamp(look.x, -1, 1) * 6;
  const ly = clamp(look.y, -1, 1) * 5;
  return (
    <g>
      {expr !== 'wince'
        ? f.cheeks.map((c, i) => <ellipse key={i} cx={c.x} cy={c.y} rx={11.5} ry={6.5} fill={PAL.blush} />)
        : null}
      {f.eyes.map((e, i) => {
        const s = i === 0 ? -1 : 1; // which side of the face
        if (expr === 'proud')
          return <path key={i} d={`M${e.x - 14} ${e.y + 6}Q${e.x} ${e.y - 17} ${e.x + 14} ${e.y + 6}`} stroke={INK} strokeWidth={7} {...round} />;
        if (expr === 'wince')
          return <path key={i} d={`M${e.x + 10 * s} ${e.y - 12}L${e.x - 9 * s} ${e.y}L${e.x + 10 * s} ${e.y + 12}`} stroke={INK} strokeWidth={7} {...round} />;
        return <InkEye key={i} c={{ x: e.x + lx, y: e.y + ly }} rx={f.rx} ry={f.ry} blink={blink} />;
      })}
      {expr === 'worried'
        ? f.eyes.map((e, i) => {
            const s = i === 0 ? -1 : 1;
            const top = e.y - f.ry - 6 + ly * 0.5;
            return <path key={i} d={`M${e.x + 13 * s} ${top + 2}L${e.x - 10 * s} ${top - 5}`} stroke={INK} strokeWidth={5.5} {...round} />;
          })
        : null}
      <Mouth id={id} expr={expr} c={f.mouth} w={f.mouthW} ink={INK} tongue={PAL.ember} />
    </g>
  );
};

/* ───────── the screen face (cube) ───────── */
const ScreenFace: React.FC<{ id: string; f: FaceSpec; screen: Box; expr: Expr; look: Pt; blink: number; seed: string }> = ({ id, f, screen: S, expr, look, blink, seed }) => {
  const lx = clamp(look.x, -1, 1) * 7;
  const ly = clamp(look.y, -1, 1) * 6;
  const g = PAL.glow;
  return (
    <g>
      <path d={boxD(S)} fill={INK} />
      <g clipPath={`url(#${id}-screen)`}>
        {/* glass glint */}
        <path d={`M${S.x0 + 6} ${S.y0 + 46}L${S.x0 + 52} ${S.y0 - 4}L${S.x0 + 70} ${S.y0 - 4}L${S.x0 + 6} ${S.y0 + 66}Z`} fill={PAL.white} opacity={0.09} />
        {expr === 'static'
          ? Array.from({ length: 9 }, (_, i) => {
              const y = S.y0 + 4 + i * 10.5 + rnd(`${seed}-sy${i}`) * 4;
              const x = S.x0 + rnd(`${seed}-sx${i}`) * 70;
              const w = 24 + rnd(`${seed}-sw${i}`) * 80;
              const c = [g, PAL.ember, PAL.deep][Math.floor(rnd(`${seed}-sc${i}`) * 3)];
              return <rect key={i} x={x} y={y} width={w} height={4 + rnd(`${seed}-sh${i}`) * 5} fill={c} />;
            })
          : null}
      </g>
      {expr === 'static' ? null : (
        <g>
          {expr === 'happy' || expr === 'proud'
            ? f.cheeks.map((c, i) => <rect key={i} x={c.x - 6} y={c.y - 3} width={12} height={6} rx={1.5} fill={PAL.ember} />)
            : null}
          {f.eyes.map((e, i) => {
            const s = i === 0 ? -1 : 1;
            if (expr === 'proud')
              return <path key={i} d={`M${e.x - 12} ${e.y + 6}Q${e.x} ${e.y - 15} ${e.x + 12} ${e.y + 6}`} stroke={g} strokeWidth={7} {...round} />;
            if (expr === 'wince')
              return <path key={i} d={`M${e.x + 10 * s} ${e.y - 12}L${e.x - 9 * s} ${e.y}L${e.x + 10 * s} ${e.y + 12}`} stroke={g} strokeWidth={7} {...round} />;
            const h = Math.max(4, 2 * f.ry * (1 - blink) * (expr === 'worried' ? 0.9 : 1));
            return <rect key={i} x={e.x + lx - f.rx} y={e.y + ly - h / 2} width={2 * f.rx} height={h} rx={Math.min(f.rx, h / 2)} fill={g} />;
          })}
          {expr === 'worried'
            ? f.eyes.map((e, i) => {
                const s = i === 0 ? -1 : 1;
                const top = e.y - f.ry - 8 + ly * 0.5;
                return <path key={i} d={`M${e.x + 12 * s} ${top + 3}L${e.x - 9 * s} ${top - 4}`} stroke={g} strokeWidth={5} {...round} />;
              })
            : null}
          {expr === 'happy' ? (
            <path d={`M${f.mouth.x - 13} ${f.mouth.y - 3}Q${f.mouth.x} ${f.mouth.y + 11} ${f.mouth.x + 13} ${f.mouth.y - 3}`} stroke={g} strokeWidth={5.5} {...round} />
          ) : (
            <Mouth id={id} expr={expr} c={f.mouth} w={f.mouthW} ink={g} tongue={PAL.ember} />
          )}
        </g>
      )}
    </g>
  );
};

export const Face: React.FC<{ id: string; f: FaceSpec; expr: Expr; look: Pt; blink: number; seed: string }> = (p) =>
  p.f.screen ? <ScreenFace {...p} screen={p.f.screen} /> : <InkFace {...p} />;
