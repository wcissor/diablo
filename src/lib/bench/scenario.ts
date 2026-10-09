/**
 * Planted-cause scenarios for the attribution benchmark (docs/BENCHMARK.md).
 *
 * A scenario is an update of an AI system from v1 to v2 that changed K
 * candidate factors at once. Exactly one factor is the true cause of a drop
 * in accuracy, or none is (effect 0). Everything is drawn from one seeded
 * mulberry32 stream, so a scenario is fully determined by its cell and seed.
 *
 * Item model (a Gaussian copula with per-item difficulty): item i has a fixed
 * difficulty z_i ~ N(0, 1), shared by every run on the same items; each run
 * adds its own noise e ~ N(0, 1). The item is answered correctly when
 *
 *     Phi( sqrt(rho) * z_i + sqrt(1 - rho) * e )  <  p_arm
 *
 * The left side is uniform on (0, 1), so each arm's expected accuracy is
 * exactly p_arm (the planted effect is realised on average), while items keep
 * their difficulty across runs, so paired outcomes are positively correlated.
 *
 * No model is called. This simulates the outcomes a measuring protocol sees;
 * it says nothing about how good an LLM is at proposing the factors.
 */
import { hashString } from "@/lib/data/derive";
import { mulberry32, normalCdf } from "@/lib/stats";

export const GRID = {
  /** Candidate factors the update changed at once. */
  K: [2, 3, 4],
  /** True drop caused by the one causal factor, in percentage points; 0 means nothing caused a drop. */
  effectPP: [0, 5, 10, 15, 20],
  /** Items per arm (every arm runs on the same items). */
  n: [40, 80, 160],
} as const;

/** Ranges the per-scenario nuisance parameters are drawn from (uniformly). */
export const NUISANCE = {
  /** v1's accuracy. */
  base: [0.65, 0.9],
  /** Latent correlation of an item's outcomes across runs (difficulty share). */
  rho: [0.4, 0.85],
} as const;

/** Names for the candidate factors, in order; a scenario with K factors uses the first K. */
export const FACTOR_NAMES = ["system prompt", "temperature", "retrieval top-k", "model snapshot"] as const;

export interface Cell {
  K: number;
  effectPP: number;
  n: number;
  /** Fix the latent item correlation instead of drawing it (sensitivity runs only). */
  rho?: number;
}

export interface Scenario {
  /** The grid cell this scenario was drawn from. */
  cell: Cell;
  K: number;
  effectPP: number;
  n: number;
  /** The mulberry32 seed every draw comes from. */
  seed: number;
  /** v1 accuracy (population). */
  base: number;
  /** Latent item correlation across runs. */
  rho: number;
  /** Index of the true cause, or null when effectPP is 0. */
  cause: number | null;
  factors: string[];
}

/**
 * One paired comparison on the same n items. b: control correct, treatment
 * wrong; c: the reverse (the convention of `Run.discordant` and `mcnemarExact`).
 */
export interface PairedCounts {
  n: number;
  kControl: number;
  kTreatment: number;
  b: number;
  c: number;
}

export interface SimulatedData {
  scenario: Scenario;
  /** v1 against v2 (all K factors changed). */
  overall: PairedCounts;
  /** One experiment per factor: v1 against v1 with only that factor changed. */
  experiments: PairedCounts[];
}

/** True population accuracy difference (treatment − control) of each factor's experiment. */
export function trueDeltas(s: Scenario): number[] {
  return s.factors.map((_, j) => (j === s.cause ? -s.effectPP / 100 : 0));
}

/** Stable seed for replicate `rep` of a cell (FNV-1a of a readable key). */
export function seedFor(cell: Cell, rep: number): number {
  return hashString(cellKey(cell, rep));
}

export function cellKey({ K, effectPP, n, rho }: Cell, rep?: number): string {
  const fixed = rho === undefined ? "" : `/rho${rho}`;
  return `diablo-bench/v1/K${K}/d${effectPP}/n${n}${fixed}${rep === undefined ? "" : `/r${rep}`}`;
}

type Rand = () => number;

/** Standard normal draw (Box–Muller, cosine branch only). */
function gaussian(rand: Rand): number {
  const u1 = 1 - rand(); // in (0, 1], so the log is finite
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const uniform = (rand: Rand, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rand();

function draw(cell: Cell, seed: number): { scenario: Scenario; rand: Rand } {
  const { K, effectPP, n } = cell;
  if (cell.rho !== undefined && !(cell.rho >= 0 && cell.rho < 1)) throw new Error("rho must be in [0, 1)");
  if (!Number.isInteger(K) || K < 1 || K > FACTOR_NAMES.length) throw new Error(`K must be 1 to ${FACTOR_NAMES.length}`);
  if (!Number.isInteger(n) || n < 1) throw new Error("n must be a positive integer");
  if (!(effectPP >= 0 && effectPP / 100 < NUISANCE.base[0])) throw new Error("effectPP must be 0 or more and below the lowest base accuracy");
  const rand = mulberry32(seed);
  const base = uniform(rand, NUISANCE.base);
  const drawnRho = uniform(rand, NUISANCE.rho); // drawn even when fixed, so the stream stays aligned
  const rho = cell.rho ?? drawnRho;
  const pick = Math.floor(rand() * K);
  const scenario: Scenario = {
    cell,
    K,
    effectPP,
    n,
    seed,
    base,
    rho,
    cause: effectPP > 0 ? pick : null,
    factors: FACTOR_NAMES.slice(0, K),
  };
  return { scenario, rand };
}

/** The scenario's nuisance parameters and true cause (the first draws of its stream). */
export function makeScenario(cell: Cell, seed: number): Scenario {
  return draw(cell, seed).scenario;
}

/**
 * Simulate every run the protocols need, on the same items: v1 and v2 for the
 * overall comparison, then a control (v1) and a treatment (v1 + factor j) run
 * for each factor's experiment. Each run draws its own noise; all draws come
 * from the scenario's one stream, in this order.
 */
export function simulate(cell: Cell, seed: number): SimulatedData {
  const { scenario, rand } = draw(cell, seed);
  const { n, rho, base, effectPP, cause } = scenario;
  const difficulty = new Float64Array(n);
  for (let i = 0; i < n; i++) difficulty[i] = gaussian(rand);
  const share = Math.sqrt(rho);
  const noise = Math.sqrt(1 - rho);

  const run = (p: number): Uint8Array => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = normalCdf(share * difficulty[i] + noise * gaussian(rand)) < p ? 1 : 0;
    return out;
  };
  const compare = (control: Uint8Array, treatment: Uint8Array): PairedCounts => {
    let kControl = 0;
    let kTreatment = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < n; i++) {
      kControl += control[i];
      kTreatment += treatment[i];
      if (control[i] === 1 && treatment[i] === 0) b++;
      else if (control[i] === 0 && treatment[i] === 1) c++;
    }
    return { n, kControl, kTreatment, b, c };
  };

  const drop = effectPP / 100;
  const v2 = cause === null ? base : base - drop;
  const overall = compare(run(base), run(v2));
  const experiments = scenario.factors.map((_, j) => compare(run(base), run(j === cause ? base - drop : base)));
  return { scenario, overall, experiments };
}

/** Scenario and simulated data for replicate `rep` of a cell. */
export function scenarioFor(cell: Cell, rep: number): SimulatedData {
  return simulate(cell, seedFor(cell, rep));
}

/**
 * The same scenario (same seed, so the same v1 accuracy and true cause) run as
 * an unpaired design: every arm on fresh items, so outcomes are independent
 * across runs. With fresh items an outcome is a plain Bernoulli draw at the
 * arm's accuracy, which is the item model with rho = 0.
 */
export function freshItemsFor(cell: Cell, rep: number): SimulatedData {
  return simulate({ ...cell, rho: 0 }, seedFor(cell, rep));
}
