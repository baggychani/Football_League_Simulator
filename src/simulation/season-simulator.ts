import type { Fixture, PlayedMatch, RatingMap, SeasonResult, Team } from '../domain/types';
import { applyResult, emptyTable, sortLeagueTable } from '../domain/standings';
import type { RandomGenerator } from './rng';
import { counterUniform } from './rng';
import type { ScoreModel } from './score-model';
import { applyDynamicMatch, closeDynamicSeason, createDynamicStrength, effectiveRatings, type DynamicStrengthState } from './dynamic-strength';

export interface SimulateSeasonOptions {
  /** When false, ratings stay fixed for the whole season (used by Polymarket calibration). */
  dynamic?: boolean;
  dynamicState?: DynamicStrengthState;
  /** Enables addressable common random numbers for static calibration. */
  counterSeed?: number;
  counterSeason?: number;
  onMatch?: (match: PlayedMatch, table: ReturnType<typeof emptyTable>) => void;
}

export function simulateSeason(
  teams: Team[],
  fixtures: Fixture[],
  ratings: RatingMap,
  rng: RandomGenerator,
  scoreModel: ScoreModel,
  season = 1,
  onMatchOrOptions?: ((match: PlayedMatch, table: ReturnType<typeof emptyTable>) => void) | SimulateSeasonOptions,
  maybeDynamicState?: DynamicStrengthState,
): SeasonResult {
  const options: SimulateSeasonOptions =
    typeof onMatchOrOptions === 'function' || onMatchOrOptions === undefined
      ? { dynamic: true, onMatch: onMatchOrOptions, dynamicState: maybeDynamicState }
      : onMatchOrOptions;

  const useDynamic = options.dynamic !== false;
  const table = emptyTable(teams.map(t => t.id));
  const matches: PlayedMatch[] = [];
  const byId = Object.fromEntries(teams.map(t => [t.id, t]));
  const state = useDynamic ? options.dynamicState ?? createDynamicStrength(teams, ratings) : null;

  for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex++) {
    const fixture = fixtures[fixtureIndex];
    const liveRatings = state ? effectiveRatings(state) : ratings;
    const score =
      options.counterSeed !== undefined && scoreModel.simulateScoreFromUniforms
        ? scoreModel.simulateScoreFromUniforms(
            byId[fixture.homeId],
            byId[fixture.awayId],
            liveRatings,
            counterUniform(options.counterSeed, options.counterSeason ?? season, fixtureIndex, 0),
            counterUniform(options.counterSeed, options.counterSeason ?? season, fixtureIndex, 1),
          )
        : scoreModel.simulateScore(byId[fixture.homeId], byId[fixture.awayId], liveRatings, rng);
    const match = { ...fixture, ...score, season };
    matches.push(match);
    applyResult(table, fixture, score);
    if (state) applyDynamicMatch(state, fixture, score);
    options.onMatch?.(match, table);
  }

  const sorted = sortLeagueTable(table);
  if (state) closeDynamicSeason(state, Object.fromEntries(Object.values(table).map(row => [row.teamId, row.played])));
  return { table: sorted, matches, championId: sorted[0].teamId, fixtures };
}

/**
 * Allocation-light static evaluator used by calibration. It is deliberately
 * equivalent to simulateSeason(..., { dynamic: false, counterSeed }).
 */
export function createStaticChampionSimulator(teams: Team[], fixtures: Fixture[], scoreModel: ScoreModel) {
  if (!scoreModel.simulateScoreFromUniforms) {
    throw new Error('Static CRN calibration requires simulateScoreFromUniforms().');
  }
  const byId = Object.fromEntries(teams.map(team => [team.id, team]));
  const indexById = Object.fromEntries(teams.map((team, index) => [team.id, index]));
  const indexedFixtures = fixtures.map(fixture => ({
    home: indexById[fixture.homeId],
    away: indexById[fixture.awayId],
    homeTeam: byId[fixture.homeId],
    awayTeam: byId[fixture.awayId],
  }));

  return (ratings: RatingMap, seed: number, seasonIndex: number): string => {
    const points = new Int16Array(teams.length);
    const goalsFor = new Int16Array(teams.length);
    const goalsAgainst = new Int16Array(teams.length);
    for (let fixtureIndex = 0; fixtureIndex < indexedFixtures.length; fixtureIndex++) {
      const fixture = indexedFixtures[fixtureIndex];
      const score = scoreModel.simulateScoreFromUniforms!(
        fixture.homeTeam,
        fixture.awayTeam,
        ratings,
        counterUniform(seed, seasonIndex, fixtureIndex, 0),
        counterUniform(seed, seasonIndex, fixtureIndex, 1),
      );
      goalsFor[fixture.home] += score.homeGoals;
      goalsAgainst[fixture.home] += score.awayGoals;
      goalsFor[fixture.away] += score.awayGoals;
      goalsAgainst[fixture.away] += score.homeGoals;
      if (score.homeGoals > score.awayGoals) points[fixture.home] += 3;
      else if (score.homeGoals < score.awayGoals) points[fixture.away] += 3;
      else {
        points[fixture.home] += 1;
        points[fixture.away] += 1;
      }
    }

    let champion = 0;
    for (let index = 1; index < teams.length; index++) {
      const goalDifference = goalsFor[index] - goalsAgainst[index];
      const championGoalDifference = goalsFor[champion] - goalsAgainst[champion];
      if (
        points[index] > points[champion] ||
        (points[index] === points[champion] && goalDifference > championGoalDifference) ||
        (points[index] === points[champion] &&
          goalDifference === championGoalDifference &&
          goalsFor[index] > goalsFor[champion]) ||
        (points[index] === points[champion] &&
          goalDifference === championGoalDifference &&
          goalsFor[index] === goalsFor[champion] &&
          teams[index].id.localeCompare(teams[champion].id) < 0)
      ) {
        champion = index;
      }
    }
    return teams[champion].id;
  };
}

/**
 * Calibration evaluator that mirrors the production first season: every
 * sample starts from B with C/F/momentum reset, then applies match dynamics
 * through all 380 fixtures. No state carries into the next Monte Carlo sample.
 */
export function createDynamicChampionSimulator(teams: Team[], fixtures: Fixture[], scoreModel: ScoreModel) {
  if (!scoreModel.simulateScoreFromUniforms) {
    throw new Error('Dynamic CRN calibration requires simulateScoreFromUniforms().');
  }
  const byId = Object.fromEntries(teams.map(team => [team.id, team]));
  const indexById = Object.fromEntries(teams.map((team, index) => [team.id, index]));
  const indexedFixtures = fixtures.map(fixture => ({
    ...fixture,
    home: indexById[fixture.homeId],
    away: indexById[fixture.awayId],
    homeTeam: byId[fixture.homeId],
    awayTeam: byId[fixture.awayId],
  }));

  return (ratings: RatingMap, seed: number, seasonIndex: number): string => {
    const points = new Int16Array(teams.length);
    const goalsFor = new Int16Array(teams.length);
    const goalsAgainst = new Int16Array(teams.length);
    const state = createDynamicStrength(teams, ratings);
    for (let fixtureIndex = 0; fixtureIndex < indexedFixtures.length; fixtureIndex++) {
      const fixture = indexedFixtures[fixtureIndex];
      const score = scoreModel.simulateScoreFromUniforms!(
        fixture.homeTeam,
        fixture.awayTeam,
        effectiveRatings(state),
        counterUniform(seed, seasonIndex, fixtureIndex, 0),
        counterUniform(seed, seasonIndex, fixtureIndex, 1),
      );
      goalsFor[fixture.home] += score.homeGoals;
      goalsAgainst[fixture.home] += score.awayGoals;
      goalsFor[fixture.away] += score.awayGoals;
      goalsAgainst[fixture.away] += score.homeGoals;
      if (score.homeGoals > score.awayGoals) points[fixture.home] += 3;
      else if (score.homeGoals < score.awayGoals) points[fixture.away] += 3;
      else { points[fixture.home] += 1; points[fixture.away] += 1; }
      applyDynamicMatch(state, fixture, score);
    }

    let champion = 0;
    for (let index = 1; index < teams.length; index++) {
      const goalDifference = goalsFor[index] - goalsAgainst[index];
      const championGoalDifference = goalsFor[champion] - goalsAgainst[champion];
      if (
        points[index] > points[champion] ||
        (points[index] === points[champion] && goalDifference > championGoalDifference) ||
        (points[index] === points[champion] && goalDifference === championGoalDifference && goalsFor[index] > goalsFor[champion]) ||
        (points[index] === points[champion] && goalDifference === championGoalDifference && goalsFor[index] === goalsFor[champion] && teams[index].id.localeCompare(teams[champion].id) < 0)
      ) champion = index;
    }
    return teams[champion].id;
  };
}
