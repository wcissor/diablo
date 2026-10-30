// Measurements of the mark derived once from the trace (pure, computed at
// module load): the eye slits, the crescent's centre of mass and its two
// sharp points, and the crescent's two edges for laying seams across it.

import { CRESCENT_PATH, EYES, HEAD_BOX } from '../../logo';
import type { Pt } from '../../lib/anim';
import { centroid, dist, samplePath } from './geom';

// The eyes. Sizes and leans come from logo.ts (the brief's 10.4° and 7.6°);
// the centres are the area centroids of the two eye holes in the trace
// (public/icon.svg), which sit ~6 trace units lower than logo.ts's EYES.
export interface Eye {
  cx: number;
  cy: number;
  h: number; // long axis
  w: number; // short axis
  lean: number; // degrees, top to the right
}
export const EYE: [Eye, Eye] = [
  { cx: 651.8, cy: 542.5, h: EYES[0].h, w: EYES[0].w, lean: EYES[0].lean },
  { cx: 754.6, cy: 564.3, h: EYES[1].h, w: EYES[1].w, lean: EYES[1].lean },
];

// Mask/clip regions in trace units, generous around the head.
export const HEAD_REGION = { x: HEAD_BOX.x - 60, y: HEAD_BOX.y - 60, w: HEAD_BOX.w + 120, h: HEAD_BOX.h + 120 };

/* ───────────────────────────── the crescent ───────────────────────────── */

const CRESCENT_POLY = samplePath(CRESCENT_PATH, 12)[0];
export const CRESCENT_CENTROID: Pt = centroid(CRESCENT_POLY);

// The two sharp points: the top-most and bottom-most points of the outline.
const iTop = CRESCENT_POLY.reduce((b, p, i) => (p.y < CRESCENT_POLY[b].y ? i : b), 0);
const iBot = CRESCENT_POLY.reduce((b, p, i) => (p.y > CRESCENT_POLY[b].y ? i : b), 0);
export const CRESCENT_TIP_UPPER: Pt = CRESCENT_POLY[iTop];
export const CRESCENT_TIP_LOWER: Pt = CRESCENT_POLY[iBot];

// Split the outline into its two edges between the tips; the outer (convex)
// edge is the one further right.
const walk = (from: number, to: number) => {
  const out: Pt[] = [];
  const n = CRESCENT_POLY.length;
  for (let i = from; ; i = (i + 1) % n) {
    out.push(CRESCENT_POLY[i]);
    if (i === to) break;
  }
  return out;
};
const e1 = walk(iTop, iBot);
const e2 = walk(iBot, iTop).reverse();
const meanX = (P: Pt[]) => P.reduce((s, p) => s + p.x, 0) / P.length;
export const CRESCENT_OUTER: Pt[] = meanX(e1) > meanX(e2) ? e1 : e2; // top tip → bottom tip
export const CRESCENT_INNER: Pt[] = meanX(e1) > meanX(e2) ? e2 : e1;

// Point at fraction u of an edge's length.
export const along = (P: Pt[], u: number): Pt => {
  const L: number[] = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + dist(P[i - 1], P[i]));
  const target = Math.max(0, Math.min(1, u)) * L[L.length - 1];
  for (let i = 1; i < P.length; i++) {
    if (L[i] >= target) {
      const t = (target - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
      return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * t, y: P[i - 1].y + (P[i].y - P[i - 1].y) * t };
    }
  }
  return P[P.length - 1];
};
