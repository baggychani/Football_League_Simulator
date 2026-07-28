import type {
  Fixture,
  LeagueRow,
  MatchScore,
  PlayedMatch,
  PointsRules,
  TableTieBreaker,
  TeamSeasonState,
} from './types';

const standardPoints = { win: 3, draw: 1, loss: 0 } as const;
const standardTieBreakers: readonly TableTieBreaker[] = [
  'goalDifference',
  'goalsFor',
  'wins',
];

export function emptyTable(teamIds: readonly string[]): Record<string, TeamSeasonState> {
  return Object.fromEntries(teamIds.map(teamId => [teamId, { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]));
}
export function applyResult(
  table: Record<string, TeamSeasonState>,
  fixture: Fixture,
  score: MatchScore,
  points: PointsRules = standardPoints,
) {
  const h = table[fixture.homeId], a = table[fixture.awayId];
  h.played++; a.played++; h.goalsFor += score.homeGoals; h.goalsAgainst += score.awayGoals; a.goalsFor += score.awayGoals; a.goalsAgainst += score.homeGoals;
  if (score.homeGoals > score.awayGoals) { h.wins++; a.losses++; h.points += points.win; a.points += points.loss; }
  else if (score.homeGoals < score.awayGoals) { a.wins++; h.losses++; a.points += points.win; h.points += points.loss; }
  else { h.draws++; a.draws++; h.points += points.draw; a.points += points.draw; }
  h.goalDifference = h.goalsFor - h.goalsAgainst; a.goalDifference = a.goalsFor - a.goalsAgainst;
}
type MiniTableRow = {
  points: number;
  goalDifference: number;
  awayGoals: number;
};

function headToHeadTable(
  teamIds: ReadonlySet<string>,
  matches: readonly PlayedMatch[],
  points: PointsRules,
) {
  const rows: Record<string, MiniTableRow> = Object.fromEntries(
    [...teamIds].map(teamId => [
      teamId,
      { points: 0, goalDifference: 0, awayGoals: 0 },
    ]),
  );
  matches.forEach(match => {
    if (!teamIds.has(match.homeId) || !teamIds.has(match.awayId)) return;
    const home = rows[match.homeId];
    const away = rows[match.awayId];
    home.goalDifference += match.homeGoals - match.awayGoals;
    away.goalDifference += match.awayGoals - match.homeGoals;
    away.awayGoals += match.awayGoals;
    if (match.homeGoals > match.awayGoals) {
      home.points += points.win;
      away.points += points.loss;
    } else if (match.homeGoals < match.awayGoals) {
      away.points += points.win;
      home.points += points.loss;
    } else {
      home.points += points.draw;
      away.points += points.draw;
    }
  });
  return rows;
}

function tieBreakerDifference(
  left: TeamSeasonState,
  right: TeamSeasonState,
  tieBreaker: TableTieBreaker,
  miniTable: Record<string, MiniTableRow>,
) {
  return tieBreaker === 'headToHeadPoints'
    ? miniTable[right.teamId].points - miniTable[left.teamId].points
    : tieBreaker === 'headToHeadGoalDifference'
      ? miniTable[right.teamId].goalDifference
        - miniTable[left.teamId].goalDifference
      : tieBreaker === 'headToHeadAwayGoals'
        ? miniTable[right.teamId].awayGoals
          - miniTable[left.teamId].awayGoals
        : tieBreaker === 'goalDifference'
          ? right.goalDifference - left.goalDifference
          : tieBreaker === 'goalsFor'
            ? right.goalsFor - left.goalsFor
            : right.wins - left.wins;
}

export function remainTiedAfterTableRules(
  table: Record<string, TeamSeasonState>,
  left: TeamSeasonState,
  right: TeamSeasonState,
  tieBreakers: readonly TableTieBreaker[] = standardTieBreakers,
  matches: readonly PlayedMatch[] = [],
  points: PointsRules = standardPoints,
) {
  if (left.points !== right.points) return false;
  const pointGroup = Object.values(table)
    .filter(row => row.points === left.points);
  const miniTable = headToHeadTable(
    new Set(pointGroup.map(row => row.teamId)),
    matches,
    points,
  );
  return tieBreakers.every(
    tieBreaker =>
      tieBreakerDifference(left, right, tieBreaker, miniTable) === 0,
  );
}

export function sortLeagueTable(
  table: Record<string, TeamSeasonState>,
  tieBreakers: readonly TableTieBreaker[] = standardTieBreakers,
  matches: readonly PlayedMatch[] = [],
  points: PointsRules = standardPoints,
): LeagueRow[] {
  const pointGroups = new Map<number, TeamSeasonState[]>();
  Object.values(table).forEach(row => {
    const group = pointGroups.get(row.points) ?? [];
    group.push(row);
    pointGroups.set(row.points, group);
  });
  const sorted = [...pointGroups.entries()]
    .sort(([left], [right]) => right - left)
    .flatMap(([, group]) => {
      if (group.length === 1) return group;
      const miniTable = headToHeadTable(
        new Set(group.map(row => row.teamId)),
        matches,
        points,
      );
      return [...group].sort((left, right) => {
        for (const tieBreaker of tieBreakers) {
          const difference = tieBreakerDifference(
            left,
            right,
            tieBreaker,
            miniTable,
          );
          if (difference) return difference;
        }
        return left.teamId.localeCompare(right.teamId);
      });
    });
  return sorted.map((row, index) => ({ ...row, position: index + 1 }));
}
