import type { RatingMap } from '../domain/types';

export const provisionalLowerDivisionGap = .14;

/**
 * Polymarket does not identify Championship clubs. Until a licensed external
 * prior is available, use one explicit, deliberately uninformative division
 * baseline rather than inventing club-specific differences.
 */
export function createClosedTwoTierRatings(
  upperRatings: Readonly<RatingMap>,
  upperRosterIds: readonly string[],
  lowerRosterIds: readonly string[],
  lowerDivisionGap = provisionalLowerDivisionGap,
): RatingMap {
  const upperValues = upperRosterIds.map(id => upperRatings[id]);
  if (
    upperValues.some(value => typeof value !== 'number' || !Number.isFinite(value))
    || new Set(upperRosterIds).size !== upperRosterIds.length
    || new Set(lowerRosterIds).size !== lowerRosterIds.length
    || upperRosterIds.some(id => lowerRosterIds.includes(id))
  ) {
    throw new Error('Two-tier rating initialization requires disjoint finite rosters.');
  }
  const lowerBaseline = Math.min(...upperValues) - lowerDivisionGap;
  return {
    ...Object.fromEntries(upperRosterIds.map(id => [id, upperRatings[id]])),
    ...Object.fromEntries(lowerRosterIds.map(id => [id, lowerBaseline])),
  };
}
