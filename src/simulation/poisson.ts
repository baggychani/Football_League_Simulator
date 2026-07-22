import type { RandomGenerator } from './rng';
export function poisson(lambda: number, rng: RandomGenerator): number {
  // Knuth is simple and accurate for ordinary interactive simulations.
  const threshold = Math.exp(-lambda); let product = 1; let k = 0;
  do { k++; product *= rng.next(); } while (product > threshold);
  return k - 1;
}

/** One-uniform inverse CDF sampler, used to obtain true common random numbers. */
export function poissonFromUniform(lambda: number, uniform: number): number {
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error(`Invalid Poisson lambda: ${lambda}`);
  if (lambda === 0) return 0;
  const u = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, uniform));
  let probability = Math.exp(-lambda);
  let cumulative = probability;
  let k = 0;
  while (u > cumulative && k < 256) {
    k += 1;
    probability *= lambda / k;
    cumulative += probability;
  }
  return k;
}
