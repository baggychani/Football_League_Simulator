import type { Fixture, LeagueRow, MatchScore, TeamSeasonState } from './types';

export function emptyTable(teamIds: string[]): Record<string, TeamSeasonState> {
  return Object.fromEntries(teamIds.map(teamId => [teamId, { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]));
}
export function applyResult(table: Record<string, TeamSeasonState>, fixture: Fixture, score: MatchScore) {
  const h = table[fixture.homeId], a = table[fixture.awayId];
  h.played++; a.played++; h.goalsFor += score.homeGoals; h.goalsAgainst += score.awayGoals; a.goalsFor += score.awayGoals; a.goalsAgainst += score.homeGoals;
  if (score.homeGoals > score.awayGoals) { h.wins++; a.losses++; h.points += 3; }
  else if (score.homeGoals < score.awayGoals) { a.wins++; h.losses++; a.points += 3; }
  else { h.draws++; a.draws++; h.points++; a.points++; }
  h.goalDifference = h.goalsFor - h.goalsAgainst; a.goalDifference = a.goalsFor - a.goalsAgainst;
}
export function sortLeagueTable(table: Record<string, TeamSeasonState>): LeagueRow[] {
  return Object.values(table).sort((a,b) => b.points-a.points || b.goalDifference-a.goalDifference || b.goalsFor-a.goalsFor || a.teamId.localeCompare(b.teamId)).map((row, index) => ({ ...row, position: index + 1 }));
}
