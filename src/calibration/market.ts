import type { RatingMap, Team } from '../domain/types';

export function normalizeMarketProbabilities(raw: Record<string, number>, teams: Team[]): RatingMap {
  const ids = new Set(teams.map(t => t.id));
  for (const [id, value] of Object.entries(raw)) {
    if (!ids.has(id)) throw new Error(`Unknown team: ${id}`);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${id} must have a non-negative finite price.`);
  }
  const values = teams.map(t => raw[t.id] ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error('At least one market price must be positive.');
  return Object.fromEntries(teams.map(t => [t.id, (raw[t.id] ?? 0) / total]));
}

export function centerRatings(ratings: RatingMap): RatingMap {
  const mean = Object.values(ratings).reduce((a, b) => a + b, 0) / Object.keys(ratings).length;
  return Object.fromEntries(Object.entries(ratings).map(([id, value]) => [id, value - mean]));
}

/** Title odds → latent ratings with a single global scale. Preserves market order. */
export function ratingsFromLogMarket(target: RatingMap, scale: number): RatingMap {
  const logs = Object.fromEntries(
    Object.entries(target).map(([id, probability]) => [id, Math.log(Math.max(probability, 1e-8))]),
  );
  const mean = Object.values(logs).reduce((sum, value) => sum + value, 0) / Object.keys(logs).length;
  return centerRatings(
    Object.fromEntries(Object.entries(logs).map(([id, value]) => [id, scale * (value - mean)])),
  );
}

export function initialRatings(target: RatingMap): RatingMap {
  return ratingsFromLogMarket(target, 1.25);
}
