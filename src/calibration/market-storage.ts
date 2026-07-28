import { activeMarketSnapshot } from '../data/active-data';
import { normalizeMarketProbabilities } from '../calibration/market';
import { teams } from '../data/teams';
import { activeLeague } from '../data/league-catalog/active';

const storageNamespace = `football-simulator.${activeLeague.competition.id}`;
export const LEGACY_MARKET_STORAGE_KEY = 'football-simulator.calibration-market';
export const LEGACY_META_STORAGE_KEY = 'football-simulator.polymarket-meta';
export const LEGACY_RATINGS_STORAGE_KEY = 'football-simulator.calibrated-ratings';
export const MARKET_STORAGE_KEY = `${storageNamespace}.calibration-market`;
export const META_STORAGE_KEY = `${storageNamespace}.polymarket-meta`;
export const RATINGS_STORAGE_KEY = `${storageNamespace}.calibrated-ratings`;

function storedValue(key: string, legacyKey: string) {
  const scoped = localStorage.getItem(key);
  if (scoped !== null) return scoped;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) localStorage.setItem(key, legacy);
  return legacy;
}

function hasExactTeamSet(candidate: Record<string, unknown>) {
  const expected = new Set(teams.map(team => team.id));
  const keys = Object.keys(candidate);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

export function readStoredMarket(
  fallback: Record<string, number> = activeMarketSnapshot as Record<string, number>,
) {
  try {
    const stored = storedValue(MARKET_STORAGE_KEY, LEGACY_MARKET_STORAGE_KEY);
    if (!stored) return fallback;
    const candidate = JSON.parse(stored) as Record<string, unknown>;
    if (!candidate || typeof candidate !== 'object' || !hasExactTeamSet(candidate)) return fallback;
    if (Object.values(candidate).some(value =>
      typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1
    )) return fallback;
    const market = candidate as Record<string, number>;
    normalizeMarketProbabilities(market, teams);
    return market;
  } catch {
    return fallback;
  }
}

export function writeStoredMarket(market: Record<string, number>) {
  localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(market));
}

export function readStoredRatings(fallback: Record<string, number>) {
  try {
    const stored = storedValue(RATINGS_STORAGE_KEY, LEGACY_RATINGS_STORAGE_KEY);
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
