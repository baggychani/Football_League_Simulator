import type {
  DecisivePlayoffRule,
} from '../data/league-catalog/types';
import type {
  Fixture,
  PlayedMatch,
  PointsRules,
  RatingMap,
  SeasonResult,
  TableTieBreaker,
  Team,
} from '../domain/types';
import { resolveDecisivePlayoffs } from '../domain/decisive-playoffs';
import {
  applyResult,
  emptyTable,
  remainTiedAfterTableRules,
  sortLeagueTable,
} from '../domain/standings';
import type { RandomGenerator } from './rng';
import { counterUniform } from './rng';
import type { ScoreModel } from './score-model';
import { applyDynamicMatch, closeDynamicSeason, createDynamicStrength, effectiveRatings, type DynamicStrengthState } from './dynamic-strength';
import { neutralExpectedResult } from './strength-index';

export interface SimulateSeasonOptions {
  /** When false, ratings stay fixed for the whole season (used by Polymarket calibration). */
  dynamic?: boolean;
  dynamicState?: DynamicStrengthState;
  /** Enables addressable common random numbers for static calibration. */
  counterSeed?: number;
  counterSeason?: number;
  onMatch?: (match: PlayedMatch, table: ReturnType<typeof emptyTable>) => void;
  points?: PointsRules;
  tieBreakers?: readonly TableTieBreaker[];
  decisivePlayoffs?: readonly DecisivePlayoffRule[];
}

export interface SeasonRules {
  points: PointsRules;
  tieBreakers: readonly TableTieBreaker[];
  decisivePlayoffs: readonly DecisivePlayoffRule[];
}

const defaultSeasonRules: SeasonRules = {
  points: { win: 3, draw: 1, loss: 0 },
  tieBreakers: ['goalDifference', 'goalsFor', 'wins'],
  decisivePlayoffs: [],
};

function resolvedRules(rules: Partial<SeasonRules> = {}): SeasonRules {
  return {
    points: rules.points ?? defaultSeasonRules.points,
    tieBreakers: rules.tieBreakers ?? defaultSeasonRules.tieBreakers,
    decisivePlayoffs:
      rules.decisivePlayoffs ?? defaultSeasonRules.decisivePlayoffs,
  };
}

type FastTableArrays = {
  points: Float64Array;
  goalsFor: Int32Array;
  goalsAgainst: Int32Array;
  wins: Uint16Array;
  headToHeadPoints: Float64Array;
  headToHeadGoalDifference: Int32Array;
  headToHeadAwayGoals: Int32Array;
};

function createFastTable(teamCount: number): FastTableArrays {
  return {
    points: new Float64Array(teamCount),
    goalsFor: new Int32Array(teamCount),
    goalsAgainst: new Int32Array(teamCount),
    wins: new Uint16Array(teamCount),
    headToHeadPoints: new Float64Array(teamCount * teamCount),
    headToHeadGoalDifference: new Int32Array(teamCount * teamCount),
    headToHeadAwayGoals: new Int32Array(teamCount * teamCount),
  };
}

function recordFastResult(
  table: FastTableArrays,
  teamCount: number,
  home: number,
  away: number,
  homeGoals: number,
  awayGoals: number,
  rules: SeasonRules,
) {
  table.goalsFor[home] += homeGoals;
  table.goalsAgainst[home] += awayGoals;
  table.goalsFor[away] += awayGoals;
  table.goalsAgainst[away] += homeGoals;

  const homePair = home * teamCount + away;
  const awayPair = away * teamCount + home;
  table.headToHeadGoalDifference[homePair] += homeGoals - awayGoals;
  table.headToHeadGoalDifference[awayPair] += awayGoals - homeGoals;
  table.headToHeadAwayGoals[awayPair] += awayGoals;

  if (homeGoals > awayGoals) {
    table.points[home] += rules.points.win;
    table.points[away] += rules.points.loss;
    table.headToHeadPoints[homePair] += rules.points.win;
    table.headToHeadPoints[awayPair] += rules.points.loss;
    table.wins[home] += 1;
  } else if (homeGoals < awayGoals) {
    table.points[away] += rules.points.win;
    table.points[home] += rules.points.loss;
    table.headToHeadPoints[awayPair] += rules.points.win;
    table.headToHeadPoints[homePair] += rules.points.loss;
    table.wins[away] += 1;
  } else {
    table.points[home] += rules.points.draw;
    table.points[away] += rules.points.draw;
    table.headToHeadPoints[homePair] += rules.points.draw;
    table.headToHeadPoints[awayPair] += rules.points.draw;
  }
}

function fastChampionIndex(
  teams: readonly Team[],
  table: FastTableArrays,
  rules: SeasonRules,
  ratings: RatingMap,
  decisiveUniform: number,
) {
  const bestPoints = Math.max(...table.points);
  const contenders = teams
    .map((_team, index) => index)
    .filter(index => table.points[index] === bestPoints);
  if (contenders.length === 1) return contenders[0];

  const miniTotal = (matrix: Float64Array | Int32Array, team: number) =>
    contenders.reduce(
      (sum, opponent) => sum + matrix[team * teams.length + opponent],
      0,
    );
  const remainingDifference = (left: number, right: number) => {
    for (const tieBreaker of rules.tieBreakers) {
      const difference =
        tieBreaker === 'headToHeadPoints'
          ? miniTotal(table.headToHeadPoints, right)
            - miniTotal(table.headToHeadPoints, left)
          : tieBreaker === 'headToHeadGoalDifference'
            ? miniTotal(table.headToHeadGoalDifference, right)
              - miniTotal(table.headToHeadGoalDifference, left)
            : tieBreaker === 'headToHeadAwayGoals'
              ? miniTotal(table.headToHeadAwayGoals, right)
                - miniTotal(table.headToHeadAwayGoals, left)
              : tieBreaker === 'goalDifference'
                ? (table.goalsFor[right] - table.goalsAgainst[right])
                  - (table.goalsFor[left] - table.goalsAgainst[left])
                : tieBreaker === 'goalsFor'
                  ? table.goalsFor[right] - table.goalsFor[left]
                  : table.wins[right] - table.wins[left];
      if (difference) return difference;
    }
    return 0;
  };
  contenders.sort((left, right) => {
    const difference = remainingDifference(left, right);
    if (difference) return difference;
    return teams[left].id.localeCompare(teams[right].id);
  });
  const titlePlayoff = rules.decisivePlayoffs.find(
    rule =>
      rule.purpose === 'title'
      && rule.format === 'single-match'
      && rule.positions[0] === 1
      && rule.positions[1] === 2,
  );
  if (
    titlePlayoff
    && contenders.length >= 2
    && (
      titlePlayoff.trigger === 'points-tied'
      || remainingDifference(contenders[0], contenders[1]) === 0
    )
  ) {
    const upper = contenders[0];
    const lower = contenders[1];
    return decisiveUniform < neutralExpectedResult(
      ratings[teams[upper].id],
      ratings[teams[lower].id],
    )
      ? upper
      : lower;
  }
  return contenders[0];
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
    applyResult(table, fixture, score, options.points);
    if (state) applyDynamicMatch(state, fixture, score);
    options.onMatch?.(match, table);
  }

  const liveRatings = state ? effectiveRatings(state) : ratings;
  const sortedByTableRules = sortLeagueTable(
    table,
    options.tieBreakers,
    matches,
    options.points,
  );
  const sorted = resolveDecisivePlayoffs(
    sortedByTableRules,
    options.decisivePlayoffs,
    (upper, lower) => remainTiedAfterTableRules(
      table,
      table[upper.teamId],
      table[lower.teamId],
      options.tieBreakers,
      matches,
      options.points,
    ),
    (upperId, lowerId) =>
      rng.next() < neutralExpectedResult(
        liveRatings[upperId],
        liveRatings[lowerId],
      )
        ? upperId
        : lowerId,
  );
  if (state) closeDynamicSeason(state, Object.fromEntries(Object.values(table).map(row => [row.teamId, row.played])));
  return { table: sorted, matches, championId: sorted[0].teamId, fixtures };
}

/**
 * Allocation-light static evaluator used by calibration. It is deliberately
 * equivalent to simulateSeason(..., { dynamic: false, counterSeed }).
 */
export function createStaticChampionSimulator(
  teams: Team[],
  fixtures: Fixture[],
  scoreModel: ScoreModel,
  seasonRules: Partial<SeasonRules> = {},
) {
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
  const rules = resolvedRules(seasonRules);

  return (ratings: RatingMap, seed: number, seasonIndex: number): string => {
    const table = createFastTable(teams.length);
    for (let fixtureIndex = 0; fixtureIndex < indexedFixtures.length; fixtureIndex++) {
      const fixture = indexedFixtures[fixtureIndex];
      const score = scoreModel.simulateScoreFromUniforms!(
        fixture.homeTeam,
        fixture.awayTeam,
        ratings,
        counterUniform(seed, seasonIndex, fixtureIndex, 0),
        counterUniform(seed, seasonIndex, fixtureIndex, 1),
      );
      recordFastResult(
        table,
        teams.length,
        fixture.home,
        fixture.away,
        score.homeGoals,
        score.awayGoals,
        rules,
      );
    }
    const champion = fastChampionIndex(
      teams,
      table,
      rules,
      ratings,
      counterUniform(seed, seasonIndex, indexedFixtures.length, 0),
    );
    return teams[champion].id;
  };
}

/**
 * Calibration evaluator that mirrors the production first season: every
 * sample starts from B with C/F/momentum reset, then applies match dynamics
 * through the complete fixture list. No state carries into the next Monte Carlo sample.
 */
export function createDynamicChampionSimulator(
  teams: Team[],
  fixtures: Fixture[],
  scoreModel: ScoreModel,
  seasonRules: Partial<SeasonRules> = {},
) {
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
  const rules = resolvedRules(seasonRules);

  return (ratings: RatingMap, seed: number, seasonIndex: number): string => {
    const table = createFastTable(teams.length);
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
      recordFastResult(
        table,
        teams.length,
        fixture.home,
        fixture.away,
        score.homeGoals,
        score.awayGoals,
        rules,
      );
      applyDynamicMatch(state, fixture, score);
    }
    const champion = fastChampionIndex(
      teams,
      table,
      rules,
      effectiveRatings(state),
      counterUniform(seed, seasonIndex, indexedFixtures.length, 0),
    );
    return teams[champion].id;
  };
}
