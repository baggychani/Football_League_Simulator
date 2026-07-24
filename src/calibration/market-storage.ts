import rawMarket from '../data/default-market.json';
import { normalizeMarketProbabilities } from '../calibration/market';
import { teams } from '../data/teams';

export const MARKET_STORAGE_KEY = 'football-simulator.calibration-market';
export const META_STORAGE_KEY = 'football-simulator.polymarket-meta';
export const RATINGS_STORAGE_KEY = 'football-simulator.calibrated-ratings';

function hasExactTeamSet(candidate: Record<string, unknown>) {
  const expected = new Set(teams.map(team => team.id));
  const keys = Object.keys(candidate);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

export function readStoredMarket(fallback: Record<string, number> = rawMarket as Record<string, number>) {
  try {
    const stored = localStorage.getItem(MARKET_STORAGE_KEY);
    if (!stored) return fallback;
    const candidate = JSON.parse(stored) as Record<string, number>;
    normalizeMarketProbabilities(candidate, teams);
    return candidate;
  } catch {
    return fallback;
  }
}

export function writeStoredMarket(market: Record<string, number>) {
  localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(market));
}

export function readStoredRatings(fallback: Record<string, number>) {
  try {
    const stored = localStorage.getItem(RATINGS_STORAGE_KEY);
    if (!stored) return fallback;
    const candidate = JSON.parse(stored) as Record<string, number>;
    if (!candidate || typeof candidate !== 'object') return fallback;
    const values = Object.values(candidate);
    if (!hasExactTeamSet(candidate) || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
      return fallback;
    }
    return candidate;
  } catch {
    return fallback;
  }
}

export function writeStoredRatings(ratings: Record<string, number>) {
  localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratings));
}
