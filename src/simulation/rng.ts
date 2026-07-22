export interface RandomGenerator { next(): number }
/** Mulberry32 provides compact, deterministic browser/Node PRNG streams. */
export function createRng(seed: number): RandomGenerator { let s = seed >>> 0; return { next() { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }; }
export function hashSeed(text: string): number { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/**
 * A counter-based uniform used by calibration.  The value for a fixture is a
 * pure function of its address, so changing a rating/lambda never shifts the
 * random stream consumed by later fixtures.
 */
export function counterUniform(seed: number, seasonIndex: number, fixtureIndex: number, side: 0 | 1): number {
  let x = (seed ^ Math.imul((seasonIndex + 1) >>> 0, 0x9e3779b1)) >>> 0;
  x = (x ^ Math.imul((fixtureIndex + 1) >>> 0, 0x85ebca6b)) >>> 0;
  x = (x ^ Math.imul(side + 1, 0xc2b2ae35)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return (x + 0.5) / 4294967296;
}
