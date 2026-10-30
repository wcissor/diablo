// Faces: ink features on porcelain (bubble, orb) or light features on a dark
// screen (cube). Expressions: happy, worried, proud, and the hit's startle.
import React from 'react';
import { clipConvex, clipHalf, ellipsePts, mul, pillPts, polyD, sub, v, type V } from './geo';
import { K } from './palette';
import type { FaceSpec } from './shapes';

export type Expr = 'happy' | 'worried' | 'proud' | 'startled';

const cubic = (p0: V, p1: V, p2: V, p3: V, n = 16): V[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  });

// An open "D" smile: a gently curved top lip and a deep bowl.
const smilePts = (m: V, w: number, depth: number, lift = 2.5): V[] => [
  ...cubic(v(m.x - w, m.y), v(m.x - w * 0.55, m.y + lift), v(m.x + w * 0.55, m.y + lift), v(m.x + w, m.y), 10),
  ...cubic(v(m.x + w, m.y), v(m.x + w * 0.95, m.y + depth), v(m.x - w * 0.95, m.y + depth), v(m.x - w, m.y), 18).slice(1, -1),
];
const bowlPts = (m: V, w: number, depth: number): V[] => cubic(v(m.x + w, m.y), v(m.x + w * 0.95, m.y + depth), v(m.x - w * 0.95, m.y + depth), v(m.x - w, m.y), 18);

const Mouth: React.FC<{ m: V; w: number; expr: Expr; ink: string; screen: boolean }> = ({ m, w, expr, ink, screen }) => {
  const fill = screen ? K.white : K.mouth;
  if (expr === 'startled') {
    return screen ? (
      <ellipse cx={m.x} cy={m.y + 0.2 * w} rx={0.42 * w} ry={0.55 * w} fill="none" stroke={K.white} strokeWidth={4.5} />
    ) : (
      <ellipse cx={m.x} cy={m.y + 0.3 * w} rx={0.45 * w} ry={0.58 * w} fill={fill} />
    );
  }
  if (expr === 'worried') {
    const a = w * 0.66;
    const s = (2 * a) / 3;
    return (
      <path
        d={`M${m.x - a} ${m.y + 3}q${s / 2} ${-w * 0.3} ${s} 0t${s} 0t${s} 0`}
        fill="none"
        stroke={screen ? K.white : ink}
        strokeWidth={screen ? 4.5 : 4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (screen && expr === 'happy') {
    return <path d={`M${m.x - w} ${m.y - 2}Q${m.x} ${m.y + 1.15 * w} ${m.x + w} ${m.y - 2}`} fill="none" stroke={K.white} strokeWidth={5} strokeLinecap="round" />;
  }
  // Open grins: happy (ink) and proud (both).
  const W = expr === 'proud' ? w * 1.22 : w;
  const depth = expr === 'proud' ? W * 1.02 : W * 1.15;
  const mouth = smilePts(m, W, depth, expr === 'proud' ? 4 : 2.5);
  const tongue = screen ? [] : clipConvex(ellipsePts(m.x + 0.1 * W, m.y + depth * 0.72, 0.52 * W, 0.3 * W, 28), [v(m.x - W, m.y + 2), ...bowlPts(m, W, depth).reverse().slice(1, -1), v(m.x + W, m.y + 2)]);
  return (
    <g>
      <path d={polyD(mouth)} fill={fill} />
      {tongue.length > 2 ? <path d={polyD(tongue)} fill={K.tongue} /> : null}
    </g>
  );
};

// One eye as a polygon (lids cut it), or null when shut.
const eyePoly = (c: V, rx: number, ry: number, side: number, expr: Expr, blink: number, pill: boolean): V[] | null => {
  let ps = pill ? pillPts(c.x, c.y, rx, ry) : ellipsePts(c.x, c.y, rx, ry);
  if (expr === 'worried') {
    // Inner corner raised: the lid droops toward the outer corner.
    const inner = v(c.x - side * rx * 1.1, c.y - ry * 0.7);
    const outer = v(c.x + side * rx * 1.1, c.y - ry * 0.05);
    const d = sub(outer, inner);
    let n = v(-d.y, d.x);
    if (n.y < 0) n = mul(n, -1);
    ps = clipHalf(ps, inner, n);
  }
  if (blink > 0.02) ps = clipHalf(ps, v(c.x, c.y - ry + blink * 2 * ry * 0.96), v(0, 1));
  return ps.length > 2 ? ps : null;
};

const Brow: React.FC<{ c: V; rx: number; ry: number; side: number; expr: Expr; color: string; w: number }> = ({ c, rx, ry, side, expr, color, w }) => {
  if (expr === 'worried') {
    const outer = v(c.x + side * rx * 1.0, c.y - ry - 7);
    const inner = v(c.x - side * rx * 0.75, c.y - ry - 16);
    return <path d={`M${outer.x} ${outer.y}L${inner.x} ${inner.y}`} stroke={color} strokeWidth={w} strokeLinecap="round" />;
  }
  if (expr === 'startled') {
    const y = c.y - ry - 15;
    return <path d={`M${c.x - rx * 0.85} ${y + 4}Q${c.x} ${y - 7} ${c.x + rx * 0.85} ${y + 4}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />;
  }
  return null;
};

export const Face: React.FC<{
  spec: FaceSpec;
  expr: Expr;
  look: V;
  blink: number;
  glow?: string; // filter url for the screen glow
  jolt?: number; // the screen's glitch on the hit (0..1)
  frame: number;
}> = ({ spec, expr, look, blink, glow, jolt = 0, frame }) => {
  const screen = spec.style === 'screen';
  const ink = screen ? K.white : K.ink;
  const lx = Math.max(-1, Math.min(1, look.x));
  const ly = Math.max(-1, Math.min(1, look.y));
  const shut = expr === 'proud' ? 0 : blink;
  // Glitch: the screen face tears sideways for a couple of frames.
  const tear = jolt > 0 ? jolt * 6 * (Math.sin(frame * 12.9898) > 0 ? 1 : -1) : 0;
  const slide = spec.slide ? v(spec.slide.x * lx + tear, spec.slide.y * ly) : v(tear, 0);
  const travel = expr === 'startled' ? 0.45 : 1;

  const eyes = spec.eyes.map((e, i) => {
    const side = i === 0 ? -1 : 1;
    const c = v(e.x + slide.x, e.y + slide.y);
    const p = v(c.x + spec.look.x * lx * travel, c.y + spec.look.y * ly * travel);
    if (expr === 'proud') {
      const k = screen ? 1 : 1.05;
      return (
        <path
          key={i}
          d={`M${c.x - spec.rx * k} ${c.y + 3}Q${c.x} ${c.y - spec.ry * 1.45} ${c.x + spec.rx * k} ${c.y + 3}`}
          fill="none"
          stroke={ink}
          strokeWidth={screen ? 5.5 : 6}
          strokeLinecap="round"
        />
      );
    }
    if (expr === 'startled') {
      const R = Math.max(spec.rx, spec.ry) * (screen ? 1.0 : 1.02);
      return (
        <g key={i}>
          {screen ? (
            <circle cx={c.x} cy={c.y} r={R * 0.92} fill="none" stroke={K.white} strokeWidth={4.5} />
          ) : (
            <circle cx={c.x} cy={c.y} r={R} fill={K.white} stroke={K.ink} strokeWidth={4.5} />
          )}
          <circle cx={p.x} cy={p.y} r={screen ? 4.2 : R * 0.36} fill={screen ? K.white : K.ink} />
          <Brow c={c} rx={spec.rx} ry={R} side={side} expr={expr} color={ink} w={screen ? 4.5 : 5.5} />
        </g>
      );
    }
    const poly = eyePoly(p, spec.rx, spec.ry, side, expr, shut, screen);
    const hl = !screen && poly && shut < 0.4;
    const big = expr === 'worried' ? 0.42 : 0.36;
    const h1 = hl ? clipConvex(ellipsePts(p.x - spec.rx * 0.3, p.y - spec.ry * 0.34, spec.rx * big, spec.rx * big, 24), poly) : [];
    const h2 = hl ? clipConvex(ellipsePts(p.x + spec.rx * 0.34, p.y + spec.ry * 0.36, spec.rx * 0.16, spec.rx * 0.16, 16), poly) : [];
    return (
      <g key={i}>
        {poly ? (
          <path d={polyD(poly)} fill={ink} />
        ) : (
          <path d={`M${p.x - spec.rx} ${p.y + 1}Q${p.x} ${p.y + 6} ${p.x + spec.rx} ${p.y + 1}`} fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
        )}
        {h1.length > 2 ? <path d={polyD(h1)} fill={K.white} /> : null}
        {h2.length > 2 ? <path d={polyD(h2)} fill={K.white} /> : null}
        <Brow c={c} rx={spec.rx} ry={spec.ry} side={side} expr={expr} color={ink} w={screen ? 4.5 : 5.5} />
      </g>
    );
  });

  const m = v(spec.mouth.x + slide.x, spec.mouth.y + slide.y + (expr === 'proud' ? -2 : 0));
  const features = (
    <g>
      {eyes}
      <Mouth m={m} w={spec.mw} expr={expr} ink={ink} screen={screen} />
    </g>
  );
  return (
    <g>
      {spec.cheeks
        ? spec.cheeks.map((c, i) => <ellipse key={i} cx={c.x + slide.x} cy={c.y + slide.y} rx={12.5} ry={7.5} fill={K.blush} />)
        : null}
      {screen && glow ? (
        <g filter={glow} opacity={0.75}>
          {features}
        </g>
      ) : null}
      {features}
    </g>
  );
};
