// FACET: three flat mascot bots whose damage is geometric. The slash fractures
// the shell into a few clean low-poly planes radiating from the impact (cut
// along SLASH_DIR); the edge plane pops off, hovers, claps back and stays a
// little unseated, while the face startles. The fix runs a crisp white seam
// along the main cut (geometric kintsugi) that seats the loose plane and melts
// the other facets into fine white hairlines; then a glint runs along it.
import React, { useId } from 'react';
import { clamp, easeInCubic, easeOutBack, easeOutCubic, lerp, smooth } from '../../lib/anim';
import { C } from '../../theme';
import type { BotKind, ConceptBot } from '../_kit/types';
import { Face, type Expr } from './Face';
import { add, len, lerpV, lineD, mul, norm, polyD, pts, rrect, sub, v, type V } from './geo';
import { K, mix } from './palette';
import { CUBE, fracture, polyLen, sliceLine, SPEC, type Facet } from './shapes';
import { Hands, Shell } from './Shell';

export { FACET_IMPACT } from './shapes';

const LINE = 3; // facet lines (the ring around them is drawn lighter)
const SEAM_HW = 7; // the white seam's half-width while it closes (bold, so the fix reads on a phone)
const SEAM_SLIM = 5.2; // ... and once the bot is proud of it (subtle)
const KEY = 3.4; // the seam's night keyline (1.7 px outside)
const RESID = 0.15; // the facets that stay as a faint cut-gem finish after the fix
const REST = 0.26; // how far the loose plane sits out until it is sealed
const GLASS = mix(C.porcelainShade, C.white, 0.35); // crack lines on the cube's screen
const SOCKET = mix(C.porcelainShade, C.night, 0.5); // the shell's inside, seen under a lifted plane
const WALL = mix(C.porcelainShade, C.night, 0.14); // a lifted plane's edge

// The seam: a polyline (from arc length `from` of the whole seam) drawn as a
// crisp ribbon of even width, mitred at the kinks and pointed at both ends of
// the full seam.
const ribbon = (line: V[], from: number, total: number, hw: number): V[] => {
  const w = (s: number) => {
    const u = clamp(s / total);
    const tip = Math.min(1, u / 0.13, (1 - u) / 0.13);
    return Math.max(0.01, hw * Math.pow(Math.max(0, tip), 0.9));
  };
  const L: V[] = [];
  const R: V[] = [];
  const push = (p: V, n: V, ww: number) => {
    L.push(add(p, mul(n, ww)));
    R.push(sub(p, mul(n, ww)));
  };
  let acc = from;
  const nOf = (a: V, b: V) => {
    const d = norm(sub(b, a));
    return v(-d.y, d.x);
  };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const seg = len(sub(b, a));
    const n = nOf(a, b);
    const steps = Math.max(1, Math.ceil(seg / 4));
    for (let j = i === 0 ? 0 : 1; j < steps; j++) push(lerpV(a, b, j / steps), n, w(acc + (seg * j) / steps));
    acc += seg;
    if (i + 2 < line.length) {
      // Mitre at the kink.
      const n2 = nOf(b, line[i + 2]);
      const m = norm(add(n, n2));
      const k = 1 / Math.max(0.35, m.x * n.x + m.y * n.y);
      push(b, mul(m, k), w(acc));
    } else push(b, n, w(acc));
  }
  return [...L, ...R.reverse()];
};

// A popping plane's lift over the hit (frames since impact): out at once,
// hovers, claps back past home, and (if it is the loose one) bounces back out.
const liftAt = (k: number, rest: number) => {
  if (k < 0) return 0;
  if (k < 2) return 0.62 + 0.38 * easeOutCubic(k / 2);
  if (k < 7) return 1 + 0.06 * Math.sin((k - 2) * 1.3);
  if (k < 10) return lerp(1.01, -0.14, easeInCubic((k - 7) / 3));
  if (k < 14) return lerp(-0.14, rest, easeOutBack((k - 10) / 4, 2.2));
  return rest;
};

interface Dmg {
  lift: number[]; // per facet (0 = seated)
  wob: number; // hover wobble (degrees)
  tint: number; // strength of the plane tints
  lines: number; // facet line opacity
  hair: number; // white hairlines along the facets after the fix
  hw: number; // the seam's half-width now
  flash: number; // white over the patch
  seal: number;
  glint: number; // -1: none, else 0..1
  startle: number;
  jolt: number;
  k: number;
}

const dmgAt = (kind: BotKind, frame: number, hitT: number | undefined, seal: number, sealT: number | undefined): Dmg | null => {
  if (hitT === undefined || hitT < 0) return null;
  const f = SPEC[kind].facets;
  const k = hitT;
  const s = clamp(seal);
  const seat = easeOutBack(clamp((s - 0.06) / 0.3), 2.4); // the seam seats the loose plane
  // A loose plane twitches now and then while it waits.
  const twitch = k > 16 && s < 0.05 && frame % 37 < 3 ? 0.2 * Math.sin((frame % 37) * 2.1) : 0;
  const lift = fracture(kind).facets.map((_, i) => {
    if (!f.pops.includes(i)) return 0;
    const rest = i === f.askew ? REST : 0;
    let l = liftAt(k, rest);
    if (i === f.askew) l = lerp(l + twitch, 0, seat);
    return l;
  });
  const after = sealT === undefined ? -1 : sealT;
  const melt = smooth(clamp((s - 0.25) / 0.65)); // the facets melt back into the shell
  return {
    lift,
    wob: k > 2 && k < 7 ? 2.5 * Math.sin((k - 2) * 1.1) : 0,
    tint: (1 + 0.3 * clamp(1 - k / 12)) * lerp(1, RESID, melt),
    lines: 1 - smooth(clamp((s - 0.35) / 0.5)),
    hair: smooth(clamp((s - 0.55) / 0.45)),
    hw: after < 0 ? SEAM_HW : lerp(SEAM_HW, SEAM_SLIM, smooth(clamp((after - 4) / 18))),
    flash: Math.max(0.5 * Math.pow(clamp(1 - k / 2), 1.2), after >= 0 ? 0.4 * Math.pow(clamp(1 - after / 5), 1.4) : 0),
    seal: s,
    glint: after < 0 ? -1 : clamp(after / 16),
    startle: k < 9 ? 1 : clamp(1 - (k - 9) / 4),
    // The hit tears the cube's screen; a damaged one keeps glitching now and then.
    jolt: k < 4 ? 1 - k / 4 : k > 16 && s < 0.05 && frame % 41 < 2 ? 0.55 : 0,
    k,
  };
};

// The whole bot's motion: idle, the hit's recoil, the celebration hop.
const poseAt = (kind: BotKind, frame: number, hitT: number | undefined, sealT: number | undefined, proud: boolean) => {
  let tx = 0;
  let ty = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  if (kind === 'bubble') {
    const b = Math.sin(frame * 0.13);
    sy *= 1 + 0.012 * b;
    sx *= 1 - 0.008 * b;
  }
  if (kind === 'orb') ty -= 4 * Math.sin(frame * 0.09);
  if (hitT !== undefined && hitT >= 0) {
    const k = hitT;
    const fr = fracture(kind);
    const torque = fr.P.x * fr.slash.y - (fr.P.y - (kind === 'orb' ? -40 : 0)) * fr.slash.x;
    const side = Math.sign(torque) || 1;
    const sq = -0.14 * Math.exp(-k / 3.2) * Math.cos(k * 0.95);
    sy *= 1 + sq;
    sx *= 1 - sq * 0.8;
    rot += side * 8 * Math.exp(-k / 4) * Math.cos(k * 0.7);
    tx += fr.slash.x * 10 * Math.exp(-k / 3);
    ty += Math.max(0, fr.slash.y) * 6 * Math.exp(-k / 3);
  }
  if (sealT !== undefined && sealT >= 0) {
    const k = sealT;
    if (k < 3) {
      const a = Math.sin((Math.PI * k) / 3);
      sy *= 1 - 0.08 * a;
      sx *= 1 + 0.06 * a;
    } else if (k < 15) {
      const a = Math.sin((Math.PI * (k - 3)) / 12);
      ty -= 24 * a;
      sy *= 1 + 0.06 * a;
      sx *= 1 - 0.04 * a;
    } else if (k < 21) {
      const a = Math.sin((Math.PI * (k - 15)) / 6);
      sy *= 1 - 0.07 * a;
      sx *= 1 + 0.05 * a;
    }
  }
  if (proud) rot += 1.4 * Math.sin(frame * 0.1);
  const piv = kind === 'orb' ? v(0, -42) : v(0, 0);
  return {
    t: `translate(${(tx + piv.x).toFixed(2)} ${(ty + piv.y).toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-piv.x} ${-piv.y})`,
    lift: -ty,
  };
};

const tintOf = (t: number, strength: number) =>
  t >= 0 ? { fill: K.white, a: clamp(0.66 * t * strength, 0, 0.92) } : { fill: K.ink, a: clamp(0.26 * -t * strength, 0, 0.45) };

const pieceT = (fc: Facet, l: number, dist: number, spin: number) => {
  const o = mul(fc.out, l * dist);
  const sc = 1 + 0.07 * Math.max(0, l);
  const c = fc.c;
  return `translate(${o.x.toFixed(2)} ${o.y.toFixed(2)}) rotate(${spin.toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}) translate(${c.x.toFixed(2)} ${c.y.toFixed(2)}) scale(${sc.toFixed(4)}) translate(${(-c.x).toFixed(2)} ${(-c.y).toFixed(2)})`;
};

// Low-poly chips that fly off the impact (flat triangles, gone by frame 10).
const SHARDS = [
  { a: -34, sp: 7, spin: 55, r: 7.5, fill: K.body },
  { a: 4, sp: 9.5, spin: -75, r: 9.5, fill: K.light },
  { a: 38, sp: 6, spin: 95, r: 6, fill: K.shade },
];
const Shards: React.FC<{ P: V; slash: V; k: number }> = ({ P, slash, k }) => {
  if (k < 0 || k > 10) return null;
  const base = Math.atan2(slash.y, slash.x);
  return (
    <g>
      {SHARDS.map((s, i) => {
        const a = base + (s.a * Math.PI) / 180;
        const d = s.sp * k * (1 - k / 24) + 10;
        const p = v(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d + 0.3 * k * k);
        const sc = k < 1 ? 0.55 + 0.45 * k : 1 - easeInCubic(clamp((k - 4) / 6));
        if (sc <= 0.01) return null;
        const tri = [0, 128, 242].map((deg, j) => {
          const t = ((deg + s.spin * k) * Math.PI) / 180;
          const r = s.r * sc * (j === 0 ? 1.25 : 1);
          return v(p.x + Math.cos(t) * r, p.y + Math.sin(t) * r);
        });
        return <polygon key={i} points={pts(tri)} fill={s.fill} stroke={K.ink} strokeWidth={3.6} paintOrder="stroke" strokeLinejoin="round" />;
      })}
    </g>
  );
};

// The orb's mitts: where they float for each expression and beat.
const handsAt = (frame: number, expr: Expr, startle: number, cheer: number): [V, V] => {
  const base: Record<Expr, V> = {
    happy: v(101, -84),
    worried: v(86, -104),
    proud: v(100, -70),
    startled: v(100, -120),
  };
  let p = expr === 'startled' ? base.worried : base[expr];
  if (startle > 0) p = { x: lerp(p.x, base.startled.x, startle), y: lerp(p.y, base.startled.y, startle) };
  if (cheer > 0) p = { x: lerp(p.x, 90, cheer), y: lerp(p.y, -206, cheer) };
  return [-1, 1].map((side) => v(side * p.x, p.y + 3 * Math.sin(frame * 0.1 + side * 1.3))) as [V, V];
};

export const ConceptBotImpl: ConceptBot = ({ kind, frame, bg, mood = 'happy', look = { x: 0, y: 0 }, blink = 0, hitT, seal = 0, sealT }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `facet-${kind}-${uid}-${s}`;
  const url = (s: string) => `url(#${id(s)})`;
  const spec = SPEC[kind];
  const fr = fracture(kind);
  const dmg = dmgAt(kind, frame, hitT, seal, sealT);
  const pose = poseAt(kind, frame, dmg ? hitT : undefined, dmg ? sealT : undefined, mood === 'proud');
  const expr: Expr = dmg && dmg.startle > 0.5 ? 'startled' : mood;
  const shell = <use href={`#${id('shell')}`} />;
  const pops = spec.facets.pops;
  const isCube = kind === 'cube';
  const sc = CUBE.screen;

  // Ground shadow (flat), squeezed as the body rises.
  const rise = pose.lift + (kind === 'orb' ? 4 * Math.sin(frame * 0.09) : 0);
  const shScale = clamp(1 - rise / 140, 0.6, 1.1) * (kind === 'orb' ? 0.92 : 1);
  const shadow = (
    <ellipse cx={spec.mid.x} cy={-9 * shScale} rx={spec.half * shScale} ry={9 * shScale} fill={bg === 'white' ? mix(C.white, C.maroon, 0.13) : mix(C.maroon, C.night, 0.55)} />
  );

  // Facet outlines: night on the shell, pale "cracked glass" on the cube's screen.
  const outline = (poly: V[], op: number, key?: string) =>
    op > 0.01 ? (
      <g key={key}>
        <polygon points={pts(poly)} fill="none" stroke={K.ink} strokeOpacity={op} strokeWidth={LINE} strokeLinejoin="round" />
        {isCube ? (
          <polygon points={pts(poly)} fill="none" stroke={GLASS} strokeOpacity={op} strokeWidth={LINE - 0.6} strokeLinejoin="round" clipPath={url('screen')} />
        ) : null}
      </g>
    ) : null;

  const damage = (() => {
    if (!dmg) return null;
    const moved = dmg.lift.map((l) => Math.abs(l) > 0.004);
    const dist = (i: number) => (pops.indexOf(i) === 0 ? 16 : 10);
    const spin = (i: number) => (pops.indexOf(i) === 0 ? 9 : -7);
    const overlay = (fc: Facet, i: number) => {
      const t = tintOf(spec.facets.tint[i] ?? 0, dmg.tint);
      return (
        <>
          {t.a > 0.005 ? <polygon points={pts(fc.poly)} fill={t.fill} fillOpacity={t.a} /> : null}
          {dmg.flash > 0.01 ? <polygon points={pts(fc.poly)} fill={K.white} fillOpacity={dmg.flash} /> : null}
        </>
      );
    };
    return (
      <g>
        <g clipPath={url('body')}>
          {fr.facets.map((fc, i) => (moved[i] ? null : <React.Fragment key={i}>{overlay(fc, i)}</React.Fragment>))}
          {fr.facets.map((fc, i) => (moved[i] ? <polygon key={`c${i}`} points={pts(fc.poly)} fill={SOCKET} /> : null))}
          {/* Radial cracks bold, the ring around them lighter (as real fractures go). */}
          {dmg.lines > 0.01 ? (
            <g fill="none" strokeLinejoin="round" strokeLinecap="round" strokeOpacity={dmg.lines}>
              <g stroke={K.ink}>
                {fr.rays.map((r, i) => (
                  <path key={`r${i}`} d={lineD(r)} strokeWidth={LINE} />
                ))}
                {fr.ring.map((p, j) => (
                  <path key={`e${j}`} d={lineD([p, fr.ring[(j + 1) % fr.ring.length]])} strokeWidth={LINE * 0.62} />
                ))}
              </g>
              {isCube ? (
                <g stroke={GLASS} clipPath={url('screen')}>
                  {fr.rays.map((r, i) => (
                    <path key={`r${i}`} d={lineD(r)} strokeWidth={LINE - 0.6} />
                  ))}
                  {fr.ring.map((p, j) => (
                    <path key={`e${j}`} d={lineD([p, fr.ring[(j + 1) % fr.ring.length]])} strokeWidth={LINE * 0.62 - 0.4} />
                  ))}
                </g>
              ) : null}
            </g>
          ) : null}
          {/* After the fix the radial cracks stay as fine white hairlines (a cut-gem finish). */}
          {dmg.hair > 0.01
            ? fr.rays.map((r, i) => (
                <path key={`h${i}`} d={lineD(r)} fill="none" stroke={K.white} strokeOpacity={dmg.hair} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              ))
            : null}
        </g>
        {fr.facets.map((fc, i) => {
          if (!moved[i]) return null;
          const l = dmg.lift[i];
          const up = Math.max(0, l);
          const t = pieceT(fc, l, dist(i), spin(i) * l + dmg.wob * (pops.indexOf(i) === 0 ? 1 : -0.7));
          return (
            <g key={`p${i}`}>
              {up > 0.02 ? (
                <g clipPath={url('body')}>
                  <g transform={`translate(${(5 * up).toFixed(2)} ${(8 * up).toFixed(2)}) ${t}`}>
                    <polygon points={pts(fc.poly)} fill={K.ink} fillOpacity={0.3} clipPath={url('body')} />
                  </g>
                </g>
              ) : null}
              {up > 0.02 ? (
                <g transform={pieceT(fc, l * 0.6, dist(i), (spin(i) * l + dmg.wob * (pops.indexOf(i) === 0 ? 1 : -0.7)) * 0.6)}>
                  <polygon points={pts(fc.poly)} fill={WALL} stroke={K.ink} strokeWidth={2} strokeLinejoin="round" clipPath={url('body')} />
                </g>
              ) : null}
              <g transform={t}>
                <g clipPath={url(`f${i}`)}>{shell}</g>
                <g clipPath={url('body')}>
                  {overlay(fc, i)}
                  {outline(fc.poly, Math.max(dmg.lines, 0.0))}
                </g>
              </g>
            </g>
          );
        })}
      </g>
    );
  })();

  const seams = (() => {
    if (!dmg || dmg.seal <= 0) return null;
    const total = polyLen(fr.seam);
    const sP = fr.seamP;
    // The seam runs out from the impact both ways along the cut.
    const t = easeOutCubic(clamp(dmg.seal / 0.7));
    const a = sP * (1 - t);
    const b = sP + (total - sP) * t;
    const shown = sliceLine(fr.seam, a, b);
    if (shown.length < 2) return null;
    const pulse = dmg.glint >= 0 ? 1 + 0.25 * Math.pow(1 - dmg.glint, 2) : 1;
    const poly = ribbon(shown, a, total, dmg.hw * pulse);
    const heads = t < 1 ? [shown[0], shown[shown.length - 1]] : [];
    return (
      <g clipPath={url('body')}>
        <path d={polyD(poly)} fill={K.white} stroke={K.ink} strokeWidth={KEY} strokeLinejoin="round" paintOrder="stroke" />
        {heads.map((h, i) => (
          <circle key={i} cx={h.x} cy={h.y} r={dmg.hw + 1.5} fill={K.white} stroke={K.ink} strokeWidth={2.6} />
        ))}
      </g>
    );
  })();

  // The glint: a crisp double stripe of light sweeps along the new seam, across
  // the polished facets.
  const shine = (() => {
    if (!dmg || dmg.glint < 0 || dmg.glint >= 1) return null;
    const s0 = fr.seam[0];
    const s1 = fr.seam[fr.seam.length - 1];
    const d = norm(sub(s1, s0));
    const ax = norm(add(v(-d.y, d.x), mul(d, 0.42)));
    const c = lerpV(add(s0, mul(d, -30)), add(s1, mul(d, 30)), smooth(dmg.glint));
    const band = (off: number, half: number) => {
      const m = add(c, mul(d, off));
      return [add(add(m, mul(d, -half)), mul(ax, -110)), add(add(m, mul(d, half)), mul(ax, -110)), add(add(m, mul(d, half)), mul(ax, 110)), add(add(m, mul(d, -half)), mul(ax, 110))];
    };
    return (
      <g clipPath={url('body')}>
        <g clipPath={url('patch')}>
          <polygon points={pts(band(0, 10))} fill={K.white} fillOpacity={0.92} />
          <polygon points={pts(band(-21, 3.5))} fill={K.white} fillOpacity={0.92} />
        </g>
      </g>
    );
  })();

  // ...and a keylined white spark runs out along each half of the seam.
  const sparks = (() => {
    if (!dmg || dmg.glint < 0 || dmg.glint >= 1) return null;
    const total = polyLen(fr.seam);
    const sP = fr.seamP;
    const g = easeOutCubic(clamp(dmg.glint / 0.8));
    const sc = Math.sin(Math.PI * clamp(g * 1.15)) * (1 - 0.5 * g);
    if (sc <= 0.02) return null;
    return (
      <g>
        {[sP * (1 - g), sP + (total - sP) * g].map((at, i) => {
          const seg = sliceLine(fr.seam, Math.max(0, at - 2), Math.min(total, at + 2));
          if (seg.length < 2) return null;
          const p = lerpV(seg[0], seg[seg.length - 1], 0.5);
          const d = norm(sub(seg[seg.length - 1], seg[0]));
          const a = mul(d, 17 * sc);
          const b = mul(v(-d.y, d.x), 9.5 * sc);
          return <polygon key={i} points={pts([add(p, a), add(p, b), sub(p, a), sub(p, b)])} fill={K.white} stroke={K.ink} strokeWidth={3} strokeLinejoin="round" />;
        })}
      </g>
    );
  })();

  const cheer = sealT === undefined || !dmg ? 0 : Math.sin(Math.PI * clamp(sealT / 22));
  const face = (
    <Face
      spec={spec.face}
      expr={expr}
      look={look}
      blink={blink}
      glow={spec.face.style === 'screen' ? url('glow') : undefined}
      jolt={dmg ? dmg.jolt : 0}
      frame={frame}
    />
  );

  return (
    <g>
      {shadow}
      <g transform={pose.t}>
        <defs>
          <clipPath id={id('body')}>
            {spec.body.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </clipPath>
          {isCube ? (
            <clipPath id={id('screen')}>
              <path d={rrect(sc.x0, sc.y0, sc.x1, sc.y1, sc.r)} />
            </clipPath>
          ) : null}
          <clipPath id={id('patch')}>
            <polygon points={pts(fr.ring)} />
          </clipPath>
          {fr.facets.map((fc, i) => (
            <clipPath key={i} id={id(`f${i}`)}>
              <polygon points={pts(fc.poly)} />
            </clipPath>
          ))}
          {isCube ? (
            <filter id={id('glow')} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={3.5} />
            </filter>
          ) : null}
          <g id={id('shell')}>
            <Shell kind={kind} frame={frame} clip={url('body')} />
          </g>
        </defs>
        {shell}
        {damage}
        {shine}
        {seams}
        {sparks}
        {face}
        {isCube && dmg && dmg.jolt > 0 ? (
          <g clipPath={url('screen')}>
            <rect x={sc.x0} y={sc.y0 + 10 + ((frame * 37) % (sc.y1 - sc.y0 - 24))} width={sc.x1 - sc.x0} height={4} fill={K.white} fillOpacity={0.7 * dmg.jolt} />
            <rect x={sc.x0} y={sc.y0 + 16 + ((frame * 53) % (sc.y1 - sc.y0 - 30))} width={sc.x1 - sc.x0} height={2} fill={K.white} fillOpacity={0.45 * dmg.jolt} />
          </g>
        ) : null}
        {kind === 'orb' ? <Hands ps={handsAt(frame, expr, dmg ? dmg.startle : 0, cheer)} /> : null}
        {dmg ? <Shards P={fr.P} slash={fr.slash} k={dmg.k} /> : null}
      </g>
    </g>
  );
};
