import type {
  LeagueRow,
  QualificationRules,
  QualificationStatus,
} from './types';

function possibleOvertakers(
  row: LeagueRow,
  rows: LeagueRow[],
  matchesPerTeam: number,
  pointsPerWin: number,
) {
  return rows.filter(other => {
    if (other.teamId === row.teamId) return false;
    const remainingMatches = Math.max(0, matchesPerTeam - other.played);
    // Equality is intentionally conservative because points ties can still be
    // overturned by the competition's tie-breakers.
    return other.points + remainingMatches * pointsPerWin >= row.points;
  }).length;
}

function finalStatus(
  position: number,
  rules: QualificationRules,
  relegationPositions: readonly number[],
): QualificationStatus | undefined {
  if (position === rules.championPosition) return 'champion';
  if (rules.championsLeaguePositions.includes(position)) return 'champions';
  if (rules.europaLeaguePositions.includes(position)) return 'europa';
  if (relegationPositions.includes(position)) return 'relegated';
  return undefined;
}

function isRelegationClinched(
  row: LeagueRow,
  rows: LeagueRow[],
  matchesPerTeam: number,
  relegationPositions: readonly number[],
  pointsPerWin: number,
) {
  if (!relegationPositions.length) return false;
  const safePositionCount = Math.min(...relegationPositions) - 1;
  if (safePositionCount < 1) return true;
  const remainingMatches = Math.max(0, matchesPerTeam - row.played);
  const maximumPoints = row.points + remainingMatches * pointsPerWin;
  const teamsCertainlyAbove = rows.filter(other =>
    other.teamId !== row.teamId && other.points > maximumPoints
  ).length;
  // Strictly greater is intentional. Equality can still be overturned by a
  // competition tie-breaker, so it is not a mathematical relegation clinch.
  return teamsCertainlyAbove >= safePositionCount;
}

export function calculateQualificationStatuses(
  rows: LeagueRow[],
  matchesPerTeam: number,
  rules: QualificationRules,
  pointsPerWin = 3,
  relegationPositions: readonly number[] = [],
): Partial<Record<string, QualificationStatus>> {
  if (!rows.length || rows.every(row => row.played === 0)) return {};

  if (rows.every(row => row.played >= matchesPerTeam)) {
    return Object.fromEntries(
      rows.flatMap(row => {
        const status = finalStatus(row.position, rules, relegationPositions);
        return status ? [[row.teamId, status] as const] : [];
      }),
    );
  }

  const highestChampionsLeaguePosition = Math.max(...rules.championsLeaguePositions, 0);
  const highestEuropaLeaguePosition = Math.max(...rules.europaLeaguePositions, 0);
  const statuses: Partial<Record<string, QualificationStatus>> = {};
  rows.forEach(row => {
    if (isRelegationClinched(
      row,
      rows,
      matchesPerTeam,
      relegationPositions,
      pointsPerWin,
    )) {
      statuses[row.teamId] = 'relegated';
      return;
    }
    const overtakers = possibleOvertakers(
      row,
      rows,
      matchesPerTeam,
      pointsPerWin,
    );
    if (overtakers < rules.championPosition) statuses[row.teamId] = 'champion';
    else if (
      highestChampionsLeaguePosition > 0
      && overtakers < highestChampionsLeaguePosition
    ) {
      statuses[row.teamId] = 'champions';
    } else if (
      highestEuropaLeaguePosition > 0
      && overtakers < highestEuropaLeaguePosition
    ) {
      statuses[row.teamId] = 'europa';
    }
  });
  return statuses;
}
