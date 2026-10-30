// Strike cracks and hairlines: seeded random walks with forks across a bot's
// shell, in stage coordinates at the neutral pose. Pure and deterministic.

import { getLength } from '@remotion/paths';
import { BOTS, type BotKind } from '../../geometry';
import { rnd, type Pt } from '../../lib/anim';
import type { Crack, CrackSet } from '../types';
import { DEG, curveAt, dist, insideDepth, pointAlong, polyLength, smoothCurve, type Curve } from './geom';
import { BUBBLE, CUBE, ORB, ringPt, shellCentreLocal, shellLocal, toStage } from './shapes';

// Extra fields the bots add to the contracts (all optional for readers).
export interface BotCrack extends Crack {
  rootDist: number; // px along the network from the impact to this crack's root
  parent: number; // index of the crack it forks from (−1 for a main crack)
  main: boolean;
  parentT: number; // 0..1 where along its parent (by length) a fork leaves it (0 for a main)
  dense: Pt[]; // samples ≈ 1 px apart along d (root first)
  cum: number[]; // arc length at each sample
}
export interface WeakLink {
  i: number; // crack index
  t: number; // 0..1 where along that crack the weak spot sits (0 = its root)
}
export interface BotWeakSpot {
  x: number;
  y: number;
  r: number;
  pts: Pt[]; // the irregular opening, relative to (x, y), unit radius
  angle: number; // radians: the opening is drawn stretched along the crack it breaks
  links: WeakLink[]; // the gold fills it once the seal front of any of these passes it
}
export interface BotCrackSet extends CrackSet {
  cracks: BotCrack[];
  weakSpots: BotWeakSpot[];
  reach: number; // px: the furthest network distance (grow = 1 reaches it)
  impacts: Pt[]; // where the strike landed on free shell (punctures are drawn there); each roots ≥ 1 crack
  impactInfo?: ImpactInfo[]; // per impact passed in: where it was aimed, where it landed, how far it moved, dropped?
  hairline?: boolean;
}

const seq = (seed: string) => {
  let i = 0;
  return () => rnd(`${seed}:${i++}`);
};

/* ─────────────────────────── where cracks may run ─────────────────────────── */

const shellCache: Partial<Record<BotKind, Pt[]>> = {};
const shellStage = (kind: BotKind) => (shellCache[kind] ??= toStage(kind, shellLocal(kind)));

// Faces and screens the cracks steer around (stage coordinates).
const inAvoid = (kind: BotKind, p: Pt) => {
  const a = BOTS[kind];
  const x = p.x - a.cx;
  const y = p.y - a.feetY;
  if (kind === 'bubble') {
    const m = 15;
    return BUBBLE.eyes.some((e) => ((x - e.x) / (BUBBLE.eyeRx + m + 6)) ** 2 + ((y - e.y) / (BUBBLE.eyeRy + m)) ** 2 < 1);
  }
  if (kind === 'cube') {
    const m = 7;
    if (x > -72 - m && x < 72 + m && y > -170 - m && y < -48 + m) return true;
    return Math.hypot(x - CUBE.antennaBase.x, (y - CUBE.antennaBase.y) * 1.6) < 15;
  }
  return Math.hypot(x - ORB.eye.x, y - ORB.eye.y) < ORB.eyeR + 15;
};

const okAt = (kind: BotKind, p: Pt, margin: number) => insideDepth(p, shellStage(kind)) >= margin && !inAvoid(kind, p);

// Weak spots keep well off the face (never cheek positions): at least this far
// from every eye centre.
export const WEAK_EYE_CLEAR = 75;
const eyeCentres = (kind: BotKind): Pt[] => {
  const a = BOTS[kind];
  const local = kind === 'bubble' ? BUBBLE.eyes : kind === 'cube' ? CUBE.eyes : [ORB.eye];
  return local.map((e) => ({ x: e.x + a.cx, y: e.y + a.feetY }));
};
export const eyeClearance = (kind: BotKind, p: Pt) => Math.min(...eyeCentres(kind).map((e) => dist(e, p)));

// The orb's front ring band, which would hide part of an opening (local points).
const ringFront = (() => {
  const pts: Pt[] = [];
  for (let i = 0; i <= 60; i++) pts.push(ringPt((i / 60) * Math.PI));
  return pts;
})();

// Room for a weak spot of radius r at p (stage coordinates): inside the shell,
// clear of the eyes, the cube's screen and antenna, and the orb's front ring.
const weakRoom = (kind: BotKind, p: Pt, r: number, depthK: number, eyeMin: number) => {
  if (insideDepth(p, shellStage(kind)) < r * depthK) return false;
  if (eyeClearance(kind, p) < eyeMin) return false;
  const a = BOTS[kind];
  const x = p.x - a.cx;
  const y = p.y - a.feetY;
  // The bubble's cheeks: below its eye line only the tail area (lower left) is
  // allowed; the top, the shoulders and the tail area are its free shell.
  if (kind === 'bubble' && y > BUBBLE.eyes[0].y - 8 && x > BUBBLE.eyes[0].x - 30) return false;
  if (kind === 'cube') {
    const m = r * 0.75 + 5;
    const dx = Math.max(-72 - x, 0, x - 72);
    const dy = Math.max(-170 - y, 0, y + 48);
    if (Math.hypot(dx, dy) < m) return false;
    if (Math.hypot(x - CUBE.antennaBase.x, y - CUBE.antennaBase.y) < r + 12) return false;
  }
  if (kind === 'orb' && ringFront.some((q) => Math.hypot(q.x - x, q.y - y) < r * 0.75 + 5)) return false;
  return true;
};

// Nudge a point onto the shell (toward its centre), then off any face, until it
// is a fair place for a crack to start.
const projectInside = (kind: BotKind, p: Pt, margin: number): Pt => {
  const a = BOTS[kind];
  const c = shellCentreLocal(kind);
  const cx = c.x + a.cx;
  const cy = c.y + a.feetY;
  let q = { ...p };
  for (let i = 0; i < 120 && insideDepth(q, shellStage(kind)) < margin; i++) {
    const d = Math.hypot(cx - q.x, cy - q.y) || 1;
    q = { x: q.x + ((cx - q.x) / d) * 2, y: q.y + ((cy - q.y) / d) * 2 };
  }
  if (!inAvoid(kind, q)) return q;
  for (let rr = 3; rr <= 90; rr += 3) {
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const t = { x: q.x + Math.cos(ang) * rr, y: q.y + Math.sin(ang) * rr };
      if (okAt(kind, t, margin)) return t;
    }
  }
  return q;
};

/* ─────────────────────────────── the walker ─────────────────────────────── */

interface WalkOpts {
  stepMin: number;
  stepMax: number;
  jitter: number; // degrees per step
  pull: number; // 0..1 pull back toward the starting heading
  kink: number; // chance per step of a sharp turn (porcelain cracks run straight, then kink)
  hug?: number; // times it may turn along the shell's edge instead of ending there (while short)
}

// Where segment a→b first crosses segment c→d (param along a→b), or null.
const crossAt = (a: Pt, b: Pt, c: Pt, d: Pt): number | null => {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const u = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const v = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? u : null;
};

const MAX_SWING = 74 * DEG; // a crack never bends more than this off its first heading

const walk = (kind: BotKind, start: Pt, heading: number, maxLen: number, R: () => number, o: WalkOpts, others: Pt[][] = []): Pt[] => {
  const pts: Pt[] = [start];
  const h0 = heading;
  const clampH = (v: number) => h0 + Math.max(-MAX_SWING, Math.min(MAX_SWING, v - h0));
  let cur = start;
  let h = heading;
  let len = 0;
  const side = R() < 0.5 ? 1 : -1; // which way it prefers to swerve round a face
  let swerves = 0; // it may swerve round a face once or twice, then it stops (never hugs it)
  let hugs = 0;
  for (let guard = 0; guard < 90 && len < maxLen; guard++) {
    const step = Math.min(maxLen - len, o.stepMin + (o.stepMax - o.stepMin) * R());
    if (step < 2) break;
    h += (R() + R() - 1) * o.jitter * DEG + (heading - h) * o.pull;
    if (pts.length > 1 && R() < o.kink) {
      const kick = (R() < 0.5 ? -1 : 1) * (16 + R() * 20) * DEG;
      h += kick;
      heading = clampH(heading + kick * 0.5);
    }
    h = clampH(h);
    let placed = false;
    for (const turn of [0, 24, -24, 48, -48, 72, -72]) {
      const hh = h + turn * side * DEG;
      const nx = { x: cur.x + Math.cos(hh) * step, y: cur.y + Math.sin(hh) * step };
      if (okAt(kind, nx, 1.5)) {
        // Runs into an earlier crack: it ends there (a T-junction), never crosses.
        if (len + step > 7) {
          let first: number | null = null;
          for (const poly of others) {
            for (let i = 1; i < poly.length; i++) {
              const u = crossAt(cur, nx, poly[i - 1], poly[i]);
              if (u !== null && (len > 7 || u * step > 7 - len) && (first === null || u < first)) first = u;
            }
          }
          if (first !== null) {
            const q = { x: cur.x + (nx.x - cur.x) * first, y: cur.y + (nx.y - cur.y) * first };
            if (dist(cur, q) > 1) pts.push(q);
            return pts;
          }
        }
        if (turn !== 0 && ++swerves > 3 + hugs) return pts;
        cur = nx;
        if (turn !== 0) {
          h = hh;
          heading = clampH(heading + turn * side * DEG * 0.5);
        }
        placed = true;
        break;
      }
      if (turn === 0 && !inAvoid(kind, nx) && insideDepth(nx, shellStage(kind)) < 1.5) {
        // Runs toward the edge while still short: bend along the rim instead.
        if (hugs < (o.hug ?? 0) && len < maxLen * 0.62 && insideDepth(cur, shellStage(kind)) > 9) {
          hugs++;
          continue;
        }
        // Runs off the shell: carry it to the edge and stop there.
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          const q = { x: cur.x + (nx.x - cur.x) * mid, y: cur.y + (nx.y - cur.y) * mid };
          if (insideDepth(q, shellStage(kind)) >= 1) lo = mid;
          else hi = mid;
        }
        const edge = { x: cur.x + (nx.x - cur.x) * lo, y: cur.y + (nx.y - cur.y) * lo };
        if (dist(cur, edge) > 1) pts.push(edge);
        return pts;
      }
    }
    if (!placed) break;
    pts.push(cur);
    len += step;
  }
  return pts;
};

// A slight seeded wobble: a midpoint nudged sideways on every longer step, so
// the smooth curve through the points meanders a little (both ends kept).
const wobbled = (points: Pt[], R: () => number, amp: number): Pt[] => {
  if (amp <= 0 || points.length < 2) return points;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const l = dist(a, b);
    if (l > 9) {
      const t = 0.42 + R() * 0.16;
      const o = (R() - 0.5) * 2 * Math.min(amp, l * 0.09);
      out.push({ x: a.x + (b.x - a.x) * t - ((b.y - a.y) / l) * o, y: a.y + (b.y - a.y) * t + ((b.x - a.x) / l) * o });
    }
    out.push(b);
  }
  return out;
};

// A crack (or a seam: the same path) as a smooth curve through its walk.
// `length` is the SVG path's own length, so seal / trace fractions agree with
// @remotion/paths everywhere.
const toCrack = (walked: Pt[], rootDist: number, parent: number, main: boolean, R: () => number, amp = 2.2, parentT = 0): BotCrack => {
  const points = wobbled(walked, R, amp);
  const c: Curve = smoothCurve(points);
  return {
    d: c.d,
    length: c.pts.length > 1 ? getLength(c.d) : 0,
    points: points.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })),
    rootDist,
    parent,
    main,
    parentT,
    dense: c.pts,
    cum: c.cum,
  };
};

// The curve a crack is drawn on, for readers that get a hand-built Crack.
const curveCache = new WeakMap<Crack, { pts: Pt[]; cum: number[] }>();
export const crackCurve = (cr: Crack): { pts: Pt[]; cum: number[] } => {
  const b = cr as Partial<BotCrack>;
  if (b.dense && b.cum) return { pts: b.dense, cum: b.cum };
  let c = curveCache.get(cr);
  if (!c) {
    c = smoothCurve(cr.points);
    curveCache.set(cr, c);
  }
  return c;
};
// The point s px along a crack (by its path length) and the heading there.
export const crackAt = (cr: Crack, s: number) => {
  const c = crackCurve(cr);
  const total = c.cum[c.cum.length - 1] || 1;
  return curveAt(c, (s * total) / (cr.length || total));
};

// A jagged opening: alternating long and short radii (unit size), chipped.
const blobPts = (R: () => number, n = 12): Pt[] => {
  const pts: Pt[] = [];
  const off = R() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2 + (R() - 0.5) * 0.45;
    const r = (i % 2 ? 0.7 + R() * 0.18 : 0.92 + R() * 0.2) * (i % 4 === 0 ? 1.05 : 1);
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.9 });
  }
  return pts;
};

/* ──────────────────────────────── strikes ──────────────────────────────── */

export interface MakeCracksOpts {
  // Throw (fail the render loudly) if any impact has to move further than this
  // many px to reach free shell (off the faces, inside the shell by 5 px).
  maxMove?: number;
}

// What became of each impact passed in (parallel to the input array).
export interface ImpactInfo {
  aimed: Pt; // the point passed in
  at: Pt; // where the strike was placed: the nearest free shell point
  moved: number; // px between the two
  dropped?: 'merged' | 'no-room'; // not drawn: too close to an earlier impact, or no crack could start there
}

const MIN_MAIN = 30; // px: shorter mains are walked again on another heading
const MIN_FORK = 20; // px: shorter forks are discarded
const MIN_ROOTED = 25; // px: every drawn impact roots at least one crack this long
const MIN_SEP = 28 * DEG; // cracks leaving one root keep at least this far apart

const impactCache = new Map<string, Pt>();
// The nearest point on a bot's free shell (inside by `margin`, off the faces
// and the cube's screen) to `p`, stage coordinates. Use it to aim claws.
export const freeShellPoint = (kind: BotKind, p: Pt, margin = 5): Pt => {
  const key = `${kind}:${p.x.toFixed(2)}:${p.y.toFixed(2)}:${margin}`;
  let q = impactCache.get(key);
  if (!q) {
    q = projectInside(kind, p, margin);
    if (impactCache.size > 512) impactCache.clear();
    impactCache.set(key, q);
  }
  return q;
};
// True when `p` is free shell (a claw tip there strikes exactly where it lands).
export const isFreeShell = (kind: BotKind, p: Pt, margin = 5) => okAt(kind, p, margin);

const warned = new Set<string>();

// The direction a crack leaves its root (over its first ~14 px).
const rootDir = (pts: Pt[]) => {
  const q = pointAlong(pts, 14).p;
  return Math.atan2(q.y - pts[0].y, q.x - pts[0].x);
};
const angGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 5–8 cracks (mains + forks; 8 is the natural look) branching from the impact
// points (claw points, stage coords) across the shell as smooth curves, with
// 2–3 ember weak spots on them, well clear of the face. `count` = mains +
// forks, 5..8 (default 8). Every crack is at least MIN_MAIN (mains) / MIN_FORK
// (forks) long, and every drawn impact roots at least one crack.
export function makeCracks(kind: BotKind, impacts: Pt[], seed: string, count?: number, opts: MakeCracksOpts = {}): CrackSet {
  // A network that leaves no room for two weak spots off the face is walked
  // again from a varied seed (deterministic; rarely needed).
  let best: BotCrackSet | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const set = buildCracks(kind, impacts, seed, attempt, count, opts);
    if (!best || set.weakSpots.length > best.weakSpots.length) best = set;
    if (set.weakSpots.length >= 2) break;
  }
  return best!;
}

function buildCracks(kind: BotKind, impacts: Pt[], seed: string, attempt: number, count?: number, opts: MakeCracksOpts = {}): BotCrackSet {
  const R = seq(`cracks:${kind}:${seed}${attempt ? `#${attempt}` : ''}`);
  const n = Math.max(5, Math.min(8, Math.round(count ?? 8)));
  const a = BOTS[kind];
  const c = shellCentreLocal(kind);
  const centre = { x: c.x + a.cx, y: c.y + a.feetY };
  const shell = shellStage(kind);

  // Place each impact on free shell, and say how far it had to move.
  const raw = impacts.length ? impacts.slice(0, n) : [{ x: a.cx + c.x, y: a.feetY + c.y - 60 }];
  const info: ImpactInfo[] = raw.map((p) => {
    const at = freeShellPoint(kind, p, 5);
    return { aimed: { x: p.x, y: p.y }, at, moved: dist(p, at) };
  });
  info.forEach((im, j) => {
    if (info.slice(0, j).some((o) => !o.dropped && dist(o.at, im.at) < 12)) im.dropped = 'merged';
  });
  const describe = (list: ImpactInfo[]) =>
    list
      .map((im) => `impact (${im.aimed.x.toFixed(1)}, ${im.aimed.y.toFixed(1)}) is not on free shell; moved ${im.moved.toFixed(1)} px to (${im.at.x.toFixed(1)}, ${im.at.y.toFixed(1)})`)
      .join('; ');
  if (opts.maxMove !== undefined && info.some((im) => im.moved > opts.maxMove!)) {
    throw new Error(`makeCracks(${kind}, '${seed}'): ${describe(info.filter((im) => im.moved > opts.maxMove!))}`);
  }
  const live = () => info.filter((im) => !im.dropped);
  const g0 = live();
  const g = g0.reduce((s, im) => ({ x: s.x + im.at.x / g0.length, y: s.y + im.at.y / g0.length }), { x: 0, y: 0 });

  const mainOpts: WalkOpts = { stepMin: 15, stepMax: 28, jitter: 6, pull: 0.12, kink: 0.18, hug: 2 };
  const cracks: BotCrack[] = [];
  // Later cracks end where they meet the drawn curve of an earlier one.
  const thinned: Pt[][] = [];
  const others = () => thinned;
  const add = (cr: BotCrack) => {
    cracks.push(cr);
    thinned.push(cr.dense.filter((_, k) => k % 3 === 0 || k === cr.dense.length - 1));
  };
  const mainLen = () => 175 + R() * 90;
  const dirsAt = (p: Pt) => cracks.filter((cr) => cr.main && dist(cr.points[0], p) < 0.5).map((cr) => rootDir(cr.points));

  // The first heading near `h` (tried in widening swings) that gives a crack of
  // `minLen` or more leaving `p` clear of the cracks already rooted there.
  const SWINGS = [0, 22, -22, 44, -44, 66, -66, 92, -92, 120, -120, 150, -150, 180];
  const walkNear = (p: Pt, h: number, len: number, minLen: number, swings = SWINGS): Pt[] | null => {
    const dirs = dirsAt(p);
    // Of the near headings, the one giving the longest crack (a wide swing costs a little).
    let best: Pt[] | null = null;
    let bestScore = -Infinity;
    for (const sw of swings) {
      if (best && Math.abs(sw) > 92) break; // only swing round further when nothing near worked
      const pts = walk(kind, p, h + sw * DEG, len, R, mainOpts, others());
      const l = polyLength(pts);
      if (pts.length < 2 || l < minLen) continue;
      const d = rootDir(pts);
      if (dirs.some((o) => angGap(o, d) < MIN_SEP)) continue;
      const score = l - Math.abs(sw) * 0.55;
      if (score > bestScore) {
        bestScore = score;
        best = pts;
      }
    }
    return best;
  };
  // The longest crack from `p` over a sweep of 16 headings.
  const sweepLongest = (p: Pt, h0: number): Pt[] | null => {
    const dirs = dirsAt(p);
    let best: Pt[] | null = null;
    for (let s = 0; s < 16; s++) {
      const pts = walk(kind, p, h0 + (s / 16) * Math.PI * 2, mainLen(), R, mainOpts, others());
      if (pts.length < 2 || dirs.some((o) => angGap(o, rootDir(pts)) < MIN_SEP)) continue;
      if (!best || polyLength(pts) > polyLength(best)) best = pts;
    }
    return best;
  };

  // Mains: at least one per impact; a lone impact gets a star of them (a fan
  // over the inward 200° when it sits near the shell's edge).
  const imps = g0.map((im) => im.at);
  // About half mains, half forks: the network branches generously.
  const mains = imps.length === 1 ? Math.max(3, Math.ceil(n / 2)) : Math.max(imps.length, Math.ceil(n / 2));
  const perImpact = imps.map((_, j) => Math.floor(mains / imps.length) + (j < mains % imps.length ? 1 : 0));
  g0.forEach((im, j) => {
    const p = im.at;
    const k = perImpact[j];
    const toC = Math.atan2(centre.y - p.y, centre.x - p.x);
    let base = toC;
    if (imps.length > 1) {
      const ox = p.x - g.x;
      const oy = p.y - g.y;
      const ol = Math.hypot(ox, oy);
      if (ol > 4) {
        const vx = (ox / ol) * 0.95 + Math.cos(toC);
        const vy = (oy / ol) * 0.95 + Math.sin(toC);
        base = Math.atan2(vy, vx);
      }
    }
    const lone = imps.length === 1;
    const depth = insideDepth(p, shell);
    const nearEdge = depth < 30;
    const fan = (depth < 15 ? 150 : 200) * DEG; // right at the edge, keep the fan off the outline
    for (let i = 0; i < k; i++) {
      let h: number;
      if (lone && !nearEdge) h = base + Math.PI / k + (i / k) * Math.PI * 2 + (R() - 0.5) * 0.45;
      else if (lone) h = base + (k === 1 ? 0 : (i / (k - 1) - 0.5) * fan) + (R() - 0.5) * 0.3;
      else h = base + (k === 1 ? 0 : (i / (k - 1) - 0.5) * Math.min(150, 62 * (k - 1)) * DEG) + (R() - 0.5) * 0.4;
      const pts = walkNear(p, h, mainLen(), MIN_MAIN);
      if (pts) add(toCrack(pts, 0, -1, true, R));
    }
    // Every impact roots a crack: sweep the headings if its own all failed.
    if (!dirsAt(p).length) {
      const pts = sweepLongest(p, toC);
      if (pts && polyLength(pts) >= MIN_ROOTED) add(toCrack(pts, 0, -1, true, R));
      else im.dropped = 'no-room';
    }
  });
  // Say so (once) when the strike is not where it was aimed.
  const far = info.filter((im) => im.moved > 3);
  const lost = info.filter((im) => im.dropped);
  if (far.length || lost.length) {
    const msg = `makeCracks(${kind}, '${seed}'): ${[
      far.length ? describe(far) : '',
      ...lost.map((im) => `impact (${im.aimed.x.toFixed(1)}, ${im.aimed.y.toFixed(1)}) dropped (${im.dropped}): no puncture drawn there`),
    ]
      .filter(Boolean)
      .join('; ')}`;
    if (!warned.has(msg)) {
      warned.add(msg);
      console.warn(msg);
    }
  }
  // Nothing could start anywhere (should not happen): strike the shell's middle.
  if (!cracks.length) {
    const p = freeShellPoint(kind, { x: centre.x, y: centre.y - 40 }, 8);
    info.push({ aimed: p, at: p, moved: 0 });
    const pts = sweepLongest(p, -Math.PI / 2);
    if (pts) add(toCrack(pts, 0, -1, true, R));
  }

  // Forks: branch off the cracks part-way along, spread over the mains first.
  const forkOpts: WalkOpts = { stepMin: 11, stepMax: 19, jitter: 7, pull: 0.12, kink: 0.2 };
  const junctions: { p: Pt; angle: number; links: WeakLink[] }[] = [];
  const forksOn = (i: number) => cracks.filter((cr) => cr.parent === i).length;
  const fork = (minParent: number, minLen: number, tries: number, mainsOnly: boolean) => {
    for (let t0 = 0; cracks.length < n && t0 < tries; t0++) {
      const order = cracks
        .map((cr, i) => ({ i, w: (cr.length * (cr.main ? 1 : 0.45) * (0.6 + R())) / (1 + forksOn(i)) }))
        .filter((o) => !mainsOnly || cracks[o.i].main)
        .sort((x, y) => y.w - x.w);
      const pi = order[Math.min(order.length - 1, Math.floor(R() * Math.min(3, order.length)))]?.i;
      if (pi === undefined) return;
      const parent = cracks[pi];
      if (parent.length < minParent) continue;
      const t = 0.22 + R() * 0.5;
      const at = crackAt(parent, parent.length * t);
      const turn = (R() < 0.5 ? 1 : -1) * (30 + R() * 32) * DEG;
      if (junctions.some((jn) => dist(jn.p, at.p) < 22)) continue; // forks keep apart (no double forks)
      // the longer of the two sides it could leave on
      const want = 55 + R() * 65;
      const a1 = walk(kind, at.p, at.angle + turn, want, R, forkOpts, others());
      const a2 = walk(kind, at.p, at.angle - turn, want, R, forkOpts, others());
      const pts = polyLength(a2) > polyLength(a1) * 1.25 ? a2 : a1;
      if (pts.length < 3 || polyLength(pts) < minLen) continue;
      const idx = cracks.length;
      add(toCrack(pts, parent.rootDist + parent.length * t, pi, false, R, 1.8, t));
      junctions.push({ p: at.p, angle: at.angle, links: [{ i: pi, t }, { i: idx, t: 0 }] });
    }
  };
  fork(50, MIN_FORK + 6, 60, true);
  fork(40, MIN_FORK, 60, false);
  // Still short: more mains from the impacts, round the free headings.
  for (let round = 0; cracks.length < n && round < 3; round++) {
    for (const im of live()) {
      if (cracks.length >= n) break;
      const p = im.at;
      const toC = Math.atan2(centre.y - p.y, centre.x - p.x);
      const pts = walkNear(p, toC + (R() - 0.5) * 0.6, 110 + R() * 80, MIN_MAIN, [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]);
      if (pts) add(toCrack(pts, 0, -1, true, R));
    }
  }
  fork(30, MIN_FORK, 60, false);
  fork(24, 16, 40, false); // last resort, so `count` always holds

  const imps2 = live().map((im) => im.at);

  // The crack the claw traces in shot 4: the longest main (rooted at an impact).
  const longest = cracks.reduce((best, cr, i) => (cr.main && (!cracks[best].main || cr.length > cracks[best].length) ? i : best), 0);

  // 2–3 weak spots: big ember openings on the cracks, out on the shell (its top,
  // sides and lower edge), never near the face. Fork junctions are preferred.
  const want = 2 + (R() < 0.6 ? 1 : 0);
  const weakSpots: BotWeakSpot[] = [];
  const baseR = kind === 'cube' ? 18 : 19.5;
  type Cand = { p: Pt; angle: number; links: WeakLink[]; junction: boolean; jit: number; impact?: boolean };
  const cands: Cand[] = [];
  junctions.forEach((j, k) => cands.push({ ...j, junction: true, jit: rnd(`${seed}:${attempt}:wj:${k}`) }));
  // A strike point itself may break wide open (the opening then replaces its puncture).
  imps2.forEach((p, k) => {
    const rooted = cracks.map((cr, i) => ({ cr, i })).filter(({ cr }) => cr.main && dist(cr.points[0], p) < 0.5);
    if (rooted.length) cands.push({ p, angle: rootDir(rooted[0].cr.points), links: rooted.map(({ i }) => ({ i, t: 0 })), junction: false, impact: true, jit: rnd(`${seed}:${attempt}:wi:${k}`) });
  });
  cracks.forEach((cr, i) => {
    for (let t = 0.14; t <= 0.95; t += 0.035) {
      const q = crackAt(cr, cr.length * t);
      cands.push({ p: q.p, angle: q.angle, links: [{ i, t }], junction: false, jit: rnd(`${seed}:${attempt}:wc:${i}:${t.toFixed(3)}`) });
    }
  });
  const eyeK = kind === 'orb' ? 8 : 0; // the orb's one eye sits mid-sphere: keep further off it
  // Looser rules cost score, so a roomier spot elsewhere beats a squeezed one;
  // the last level is only for a third spot never, for the first two always.
  const LEVELS = [
    { rK: 1, depthK: 1.0, eye: 82 + eyeK, sep: 80, imp: 18, cost: 0 },
    { rK: 0.94, depthK: 0.8, eye: 78 + eyeK, sep: 66, imp: 12, cost: 22 },
    { rK: 0.88, depthK: 0.55, eye: WEAK_EYE_CLEAR + 2, sep: 54, imp: 8, cost: 55 },
    { rK: 0.85, depthK: 0.35, eye: WEAK_EYE_CLEAR + 1, sep: 44, imp: 6, cost: 120 },
  ];
  for (let spot = 0; spot < want; spot++) {
    const rv = baseR + (R() - 0.5) * 4;
    let best: { c: Cand; r: number } | null = null;
    let bestScore = -Infinity;
    LEVELS.forEach((lv, li) => {
      if (spot >= 2 && li > 1) return; // a third spot only where there is real room
      const r = rv * lv.rK;
      for (const c of cands) {
        if (!weakRoom(kind, c.p, r, lv.depthK, lv.eye)) continue;
        if (weakSpots.some((w) => dist(w, c.p) < Math.max(lv.sep, (w.r + r) * 1.6))) continue;
        if (imps2.some((q) => dist(q, c.p) < (c.impact ? (dist(q, c.p) < 0.5 ? -1 : r * 0.9) : r + lv.imp))) continue;
        const spread = weakSpots.length ? Math.min(...weakSpots.map((w) => dist(w, c.p))) : eyeClearance(kind, c.p) * 0.6;
        const score = spread + (c.junction ? 22 : c.impact ? 8 : 0) + Math.min(30, insideDepth(c.p, shell)) * 0.4 + c.jit * 12 - lv.cost;
        if (score > bestScore) {
          bestScore = score;
          best = { c, r };
        }
      }
    });
    if (!best) break;
    const { c, r } = best as { c: Cand; r: number };
    weakSpots.push({ x: c.p.x, y: c.p.y, r, pts: blobPts(R), angle: c.angle, links: c.links });
  }

  const reach = cracks.reduce((m, cr) => Math.max(m, cr.rootDist + cr.length), 1);
  const set: BotCrackSet = { kind, cracks, weakSpots, longest, reach, impacts: live().map((im) => im.at), impactInfo: info };
  return set;
}

/* ─────────────────────────────── hairlines ─────────────────────────────── */

// One fine crack from `at` (shot 5): no weak spots. Root at `at`.
export function makeHairline(kind: BotKind, at: Pt, seed: string, length = 58): CrackSet {
  const R = seq(`hair:${kind}:${seed}`);
  const p = projectInside(kind, at, 6);
  const a = BOTS[kind];
  const c = shellCentreLocal(kind);
  const toC = Math.atan2(c.y + a.feetY - p.y, c.x + a.cx - p.x);
  let best: Pt[] = [p];
  for (let k = 0; k < 6; k++) {
    const h = toC + (R() - 0.5) * 2.2;
    const pts = walk(kind, p, h, length, R, { stepMin: 6, stepMax: 11, jitter: 10, pull: 0.15, kink: 0.35 });
    if (polyLength(pts) > polyLength(best)) best = pts;
    if (polyLength(best) > length * 0.85) break;
  }
  const crack = toCrack(best, 0, -1, true, R, 1.2);
  const set: BotCrackSet = { kind, cracks: [crack], weakSpots: [], longest: 0, reach: Math.max(1, crack.length), impacts: [], hairline: true };
  return set;
}

/* ──────────────────────────────── readers ──────────────────────────────── */

// Tolerant readers, so a CrackSet built by hand still draws.
export const crackRootDist = (cr: Crack) => (cr as Partial<BotCrack>).rootDist ?? 0;
export const setReach = (s: CrackSet) =>
  (s as Partial<BotCrackSet>).reach ?? s.cracks.reduce((m, cr) => Math.max(m, crackRootDist(cr) + cr.length), 1);
export const isHairline = (s: CrackSet) => (s as Partial<BotCrackSet>).hairline ?? (s.cracks.length === 1 && s.weakSpots.length === 0);

export const weakPts = (s: CrackSet, i: number): Pt[] => {
  const w = s.weakSpots[i] as Partial<BotWeakSpot>;
  return w.pts ?? blobPts(seq(`weak:${s.kind}:${i}:${Math.round(s.weakSpots[i].x)}:${Math.round(s.weakSpots[i].y)}`));
};

export const weakAngle = (s: CrackSet, i: number) => (s.weakSpots[i] as Partial<BotWeakSpot>).angle ?? 0;
export const setImpacts = (s: CrackSet): Pt[] => (s as Partial<BotCrackSet>).impacts ?? [];

export const weakLinks = (s: CrackSet, i: number): WeakLink[] => {
  const w = s.weakSpots[i] as Partial<BotWeakSpot>;
  if (w.links) return w.links;
  // Nearest crack root.
  let best = 0;
  let bd = Infinity;
  s.cracks.forEach((cr, k) => {
    const d = dist(cr.points[0], s.weakSpots[i]);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return [{ i: best, t: 0 }];
};
