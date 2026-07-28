import type { LeagueRow, RatingMap } from '../domain/types';
import type { StructuralSeasonOutcome } from './structural-state';

export interface ClubSeasonExpectation {
  teamId: string;
  expectedPosition: number;
  fieldSize: number;
  competitionTier: number;
}

export type SeasonExpectations = Record<string, ClubSeasonExpectation>;

/**
 * A deterministic preseason reference, separate from the live table. It is
 * intentionally based on the no-context rating at the start of the season so
 * later situation logic cannot leak results backwards into its own baseline.
 */
export function createSeasonExpectations(
  teamIds: readonly string[],
  ratings: RatingMap,
  competitionTier: number,
): SeasonExpectations {
  const ordered = [...teamIds].sort(
    (left, right) =>
      (ratings[right] ?? Number.NEGATIVE_INFINITY)
      - (ratings[left] ?? Number.NEGATIVE_INFINITY)
      || left.localeCompare(right),
  );
  return Object.fromEntries(
    ordered.map((teamId, index) => [
      teamId,
      {
        teamId,
        expectedPosition: index + 1,
        fieldSize: ordered.length,
        competitionTier,
      },
    ]),
  );
}

export function structuralOutcomesFromTable(
  table: readonly LeagueRow[],
  expectations: SeasonExpectations,
  flags: Readonly<Record<string, Partial<StructuralSeasonOutcome>>> = {},
): Record<string, StructuralSeasonOutcome> {
  return Object.fromEntries(table.map(row => {
    const expectation = expectations[row.teamId];
    if (!expectation) {
      throw new Error(`Missing preseason expectation for ${row.teamId}`);
    }
    return [
      row.teamId,
      {
        competitionTier: expectation.competitionTier,
        expectedPosition: expectation.expectedPosition,
        finalPosition: row.position,
        fieldSize: expectation.fieldSize,
        ...flags[row.teamId],
      },
    ];
  }));
}
