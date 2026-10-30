// Strike cracks and hairlines: seeded random walks with forks across a bot's
// shell, in stage coordinates at the neutral pose. Pure and deterministic.

import { BOTS, type BotKind } from '../../geometry';
import { rnd, type Pt } from '../../lib/anim';
import type { Crack, CrackSet } from '../types';
import { DEG, dist, insideDepth, pointAlong, polyD, polyLength } from './geom';
import { BUBBLE, CUBE, ORB, shellCentreLocal, shellLocal, toStage } from './shapes';

// Extra fields the bots add to the contracts (all optional for readers).
export interface BotCrack extends Crack {
  rootDist: number; // px along the network from the impact to this crack's root
  parent: number; // index of the crack it forks from (−1 for a main crack)
  main: boolean;
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

// Weak spots keep further off the face, so they never read as cheeks.
const faceClear = (kind: BotKind, p: Pt) => {
  const a = BOTS[kind];
  const x = p.x - a.cx;
  const y = p.y - a.feetY;
  if (kind === 'bubble') return BUBBLE.eyes.every((e) => ((x - e.x) / 62) ** 2 + ((y - e.y) / 58) ** 2 >= 1);
  if (kind === 'orb') return Math.hypot(x - ORB.eye.x, y - ORB.eye.y) >= ORB.eyeR + 38;
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

const MAX_SWING = 62 * DEG; // a crack never bends more than this off its first heading

const walk = (kind: BotKind, start: Pt, heading: number, maxLen: number, R: () => number, o: WalkOpts, others: Pt[][] = []): Pt[] => {
  const pts: Pt[] = [start];
  const h0 = heading;
  const clampH = (v: number) => h0 + Math.max(-MAX_SWING, Math.min(MAX_SWING, v - h0));
  let cur = start;
  let h = heading;
  let len = 0;
  const side = R() < 0.5 ? 1 : -1; // which way it prefers to swerve round a face
  let swerves = 0; // it may swerve round a face once or twice, then it stops (never hugs it)
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
        if (turn !== 0 && ++swerves > 2) return pts;
        cur = nx;
        if (turn !== 0) {
          h = hh;
          heading = clampH(heading + turn * side * DEG * 0.5);
        }
        placed = true;
        break;
      }
      if (turn === 0 && !inAvoid(kind, nx) && insideDepth(nx, shellStage(kind)) < 1.5) {
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

const toCrack = (points: Pt[], rootDist: number, parent: number, main: boolean): BotCrack => ({
  d: polyD(points, false),
  length: polyLength(points),
  points,
  rootDist,
  parent,
  main,
});

// A jagged opening: alternating long and short radii (unit size).
const blobPts = (R: () => number, n = 9): Pt[] => {
  const pts: Pt[] = [];
  const off = R() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2 + (R() - 0.5) * 0.35;
    const r = (i % 2 ? 0.66 : 0.95) + R() * 0.28;
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

// 5–8 cracks branching from the impact points (claw points, stage coords) across
// the shell, with 2–3 ember weak spots at their junctions. `count` overrides the
// seeded 5–8. Every crack is at least MIN_MAIN (mains) / MIN_FORK (forks) long,
// and every drawn impact roots at least one crack.
export function makeCracks(kind: BotKind, impacts: Pt[], seed: string, count?: number, opts: MakeCracksOpts = {}): CrackSet {
  const R = seq(`cracks:${kind}:${seed}`);
  const n = Math.max(5, Math.min(8, Math.round(count ?? 5 + Math.floor(R() * 4))));
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
  const far = info.filter((im) => im.moved > 3);
  if (far.length) {
    const msg = `makeCracks(${kind}, '${seed}'): ${far
      .map((im) => `impact (${im.aimed.x.toFixed(1)}, ${im.aimed.y.toFixed(1)}) is not on free shell; moved ${im.moved.toFixed(1)} px to (${im.at.x.toFixed(1)}, ${im.at.y.toFixed(1)})`)
      .join('; ')}`;
    if (opts.maxMove !== undefined && far.some((im) => im.moved > opts.maxMove!)) throw new Error(msg);
    if (!warned.has(msg)) {
      warned.add(msg);
      console.warn(msg);
    }
  }
  const live = () => info.filter((im) => !im.dropped);
  const g0 = live();
  const g = g0.reduce((s, im) => ({ x: s.x + im.at.x / g0.length, y: s.y + im.at.y / g0.length }), { x: 0, y: 0 });

  const mainOpts: WalkOpts = { stepMin: 14, stepMax: 26, jitter: 6, pull: 0.12, kink: 0.2 };
  const cracks: BotCrack[] = [];
  const others = () => cracks.map((cr) => cr.points);
  const dirsAt = (p: Pt) => cracks.filter((cr) => cr.main && dist(cr.points[0], p) < 0.5).map((cr) => rootDir(cr.points));

  // The first heading near `h` (tried in widening swings) that gives a crack of
  // `minLen` or more leaving `p` clear of the cracks already rooted there.
  const SWINGS = [0, 22, -22, 44, -44, 66, -66, 92, -92, 120, -120, 150, -150, 180];
  const walkNear = (p: Pt, h: number, len: number, minLen: number, swings = SWINGS): Pt[] | null => {
    const dirs = dirsAt(p);
    for (const sw of swings) {
      const pts = walk(kind, p, h + sw * DEG, len, R, mainOpts, others());
      if (pts.length < 2 || polyLength(pts) < minLen) continue;
      const d = rootDir(pts);
      if (dirs.some((o) => angGap(o, d) < MIN_SEP)) continue;
      return pts;
    }
    return null;
  };
  // The longest crack from `p` over a sweep of 16 headings.
  const sweepLongest = (p: Pt, h0: number): Pt[] | null => {
    const dirs = dirsAt(p);
    let best: Pt[] | null = null;
    for (let s = 0; s < 16; s++) {
      const pts = walk(kind, p, h0 + (s / 16) * Math.PI * 2, 105 + R() * 85, R, mainOpts, others());
      if (pts.length < 2 || dirs.some((o) => angGap(o, rootDir(pts)) < MIN_SEP)) continue;
      if (!best || polyLength(pts) > polyLength(best)) best = pts;
    }
    return best;
  };

  // Mains: at least one per impact; a lone impact gets a star of them (a fan
  // over the inward 200° when it sits near the shell's edge).
  const imps = g0.map((im) => im.at);
  const mains = imps.length === 1 ? Math.max(3, n - 2) : Math.max(imps.length, Math.min(n - 1, Math.ceil(n * 0.6)));
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
    const nearEdge = insideDepth(p, shell) < 30;
    for (let i = 0; i < k; i++) {
      let h: number;
      if (lone && !nearEdge) h = base + Math.PI / k + (i / k) * Math.PI * 2 + (R() - 0.5) * 0.45;
      else if (lone) h = base + (k === 1 ? 0 : (i / (k - 1) - 0.5) * 200 * DEG) + (R() - 0.5) * 0.3;
      else h = base + (k === 1 ? 0 : (i / (k - 1) - 0.5) * Math.min(150, 62 * (k - 1)) * DEG) + (R() - 0.5) * 0.4;
      const pts = walkNear(p, h, 105 + R() * 85, MIN_MAIN);
      if (pts) cracks.push(toCrack(pts, 0, -1, true));
    }
    // Every impact roots a crack: sweep the headings if its own all failed.
    if (!dirsAt(p).length) {
      const pts = sweepLongest(p, toC);
      if (pts && polyLength(pts) >= MIN_ROOTED) cracks.push(toCrack(pts, 0, -1, true));
      else im.dropped = 'no-room';
    }
  });
  // Nothing could start anywhere (should not happen): strike the shell's middle.
  if (!cracks.length) {
    const p = freeShellPoint(kind, { x: centre.x, y: centre.y - 40 }, 8);
    info.push({ aimed: p, at: p, moved: 0 });
    const pts = sweepLongest(p, -Math.PI / 2);
    if (pts) cracks.push(toCrack(pts, 0, -1, true));
  }

  // Forks: branch off the longer cracks part-way along.
  const forkOpts: WalkOpts = { stepMin: 10, stepMax: 18, jitter: 7, pull: 0.12, kink: 0.2 };
  const junctions: { p: Pt; angle: number; links: WeakLink[] }[] = [];
  const fork = (minParent: number, minLen: number, tries: number) => {
    for (let t0 = 0; cracks.length < n && t0 < tries; t0++) {
      const order = cracks
        .map((cr, i) => ({ i, w: cr.length * (cr.main ? 1 : 0.5) * (0.6 + R()) }))
        .sort((x, y) => y.w - x.w);
      const pi = order[Math.min(order.length - 1, Math.floor(R() * Math.min(3, order.length)))]?.i;
      if (pi === undefined) return;
      const parent = cracks[pi];
      if (parent.length < minParent) continue;
      const t = 0.3 + R() * 0.38;
      const at = pointAlong(parent.points, parent.length * t);
      const turn = (R() < 0.5 ? 1 : -1) * (32 + R() * 30) * DEG;
      const pts = walk(kind, at.p, at.angle + turn, 30 + R() * 45, R, forkOpts, others());
      if (pts.length < 3 || polyLength(pts) < minLen) continue;
      const idx = cracks.length;
      cracks.push(toCrack(pts, parent.rootDist + parent.length * t, pi, false));
      junctions.push({ p: at.p, angle: at.angle, links: [{ i: pi, t }, { i: idx, t: 0 }] });
    }
  };
  fork(40, MIN_FORK, 60);
  // Still short: more mains from the impacts, round the free headings.
  for (let round = 0; cracks.length < n && round < 3; round++) {
    for (const im of live()) {
      if (cracks.length >= n) break;
      const p = im.at;
      const toC = Math.atan2(centre.y - p.y, centre.x - p.x);
      const pts = walkNear(p, toC + (R() - 0.5) * 0.6, 90 + R() * 70, MIN_MAIN, [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]);
      if (pts) cracks.push(toCrack(pts, 0, -1, true));
    }
  }
  fork(30, 16, 60);

  const imps2 = live().map((im) => im.at);
  // Impact points that root two or more cracks are junctions too.
  imps2.forEach((p) => {
    const rooted = cracks.map((cr, i) => ({ cr, i })).filter(({ cr }) => cr.main && dist(cr.points[0], p) < 0.5);
    if (rooted.length >= 2) junctions.push({ p, angle: pointAlong(rooted[0].cr.points, 6).angle, links: rooted.map(({ i }) => ({ i, t: 0 })) });
  });

  // The crack the claw traces in shot 4: the longest main (rooted at an impact).
  const longest = cracks.reduce((best, cr, i) => (cr.main && (!cracks[best].main || cr.length > cracks[best].length) ? i : best), 0);

  // 2–3 weak spots at junctions (forks first: they sit out on the shell).
  const want = 2 + (R() < 0.5 ? 1 : 0);
  const weakSpots: BotWeakSpot[] = [];
  const place = (p: Pt, angle: number, links: WeakLink[], relaxed = false) => {
    if (weakSpots.length >= want) return;
    const r = (kind === 'cube' ? 10 : 10.5) + R() * 3.5;
    if (!okAt(kind, p, relaxed ? r + 3 : r + 6) || (!relaxed && !faceClear(kind, p))) return;
    if (weakSpots.some((w) => dist(w, p) < (relaxed ? 30 : 40))) return;
    if (imps2.some((q) => dist(q, p) < r + 9) && !links.every((l) => l.t === 0)) return; // not on top of a puncture
    weakSpots.push({ x: p.x, y: p.y, r, pts: blobPts(R), angle, links });
  };
  junctions.forEach((j) => place(j.p, j.angle, j.links));
  const along = (i: number, t: number, relaxed = false) => {
    const q = pointAlong(cracks[i].points, cracks[i].length * t);
    place(q.p, q.angle, [{ i, t }], relaxed);
  };
  if (weakSpots.length < 2) for (const t of [0.5, 0.75, 0.3, 0.9]) along(longest, t);
  for (let i = 0; i < cracks.length && weakSpots.length < 2; i++) for (const t of [0.6, 0.4, 0.8]) along(i, t);
  // Always 2: relax the face clearance if the face left no room.
  junctions.forEach((j) => weakSpots.length < 2 && place(j.p, j.angle, j.links, true));
  for (let i = 0; i < cracks.length && weakSpots.length < 2; i++) for (const t of [0.5, 0.3, 0.7, 0.9]) along(i, t, true);

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
  const crack = toCrack(best, 0, -1, true);
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
