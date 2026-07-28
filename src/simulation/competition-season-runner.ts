import type {
  ClubDefinition,
  CompetitionDefinition,
  LeagueSystemDefinition,
} from '../data/league-catalog/types';
import {
  buildNextSeasonRosters,
  resolveLeagueMovements,
  type LeagueSeasonRosters,
} from '../domain/promotion';
import {
  emptyTable,
  remainTiedAfterTableRules,
  sortLeagueTable,
} from '../domain/standings';
import type {
  LeagueRow,
  PlayedMatch,
  Team,
  TeamSeasonState,
} from '../domain/types';
import { createDoubleRoundRobin } from '../domain/fixtures';
import { resolveDecisivePlayoffs } from '../domain/decisive-playoffs';
import {
  effectiveRatings,
  type DynamicStrengthState,
} from './dynamic-strength';
import {
  applyMatchTransition,
  simulateMatchStep,
  type MatchStepResult,
} from './match-step';
import { neutralMatchContext } from './match-context';
import type { RandomGenerator } from './rng';
import type { ScoreModel } from './score-model';
import { neutralExpectedResult } from './strength-index';

export interface CompetitionSeasonState {
  competition: CompetitionDefinition;
  rosterIds: string[];
  fixtures: ReturnType<typeof createDoubleRoundRobin>;
  table: Record<string, TeamSeasonState>;
  matches: PlayedMatch[];
  fixtureIndex: number;
  postseasonMatches: PlayedMatch[];
}

export interface CompetitionSimulationEnvironment {
  season: number;
  teamsById: Readonly<Record<string, Team>>;
  dynamicState: DynamicStrengthState;
  model: ScoreModel;
  rng: RandomGenerator;
}

export function createCompetitionSeasonState(
  competition: CompetitionDefinition,
  rosterIds: readonly string[],
): CompetitionSeasonState {
  if (rosterIds.length !== competition.expectedClubCount) {
    throw new Error(
      `${competition.id}: expected ${competition.expectedClubCount} clubs, got ${rosterIds.length}`,
    );
  }
  return {
    competition,
    rosterIds: [...rosterIds],
    fixtures: createDoubleRoundRobin(rosterIds),
    table: emptyTable(rosterIds),
    matches: [],
    fixtureIndex: 0,
    postseasonMatches: [],
  };
}

export function playNextCompetitionMatch(
  state: CompetitionSeasonState,
  environment: CompetitionSimulationEnvironment,
  onMatch?: (step: MatchStepResult) => void,
) {
  const fixture = state.fixtures[state.fixtureIndex];
  if (!fixture) return null;
  const step = simulateMatchStep(
    fixture,
    environment.season,
    environment.teamsById,
    environment.dynamicState,
    environment.model,
    environment.rng,
  );
  state.matches.push(step.match);
  applyMatchTransition(
    state.table,
    environment.dynamicState,
    step,
    state.competition.points,
  );
  state.fixtureIndex++;
  onMatch?.(step);
  return step;
}

export function advanceCompetitionToFixture(
  state: CompetitionSeasonState,
  targetFixtureIndex: number,
  environment: CompetitionSimulationEnvironment,
) {
  const target = Math.min(
    state.fixtures.length,
    Math.max(state.fixtureIndex, Math.floor(targetFixtureIndex)),
  );
  while (state.fixtureIndex < target) {
    playNextCompetitionMatch(state, environment);
  }
}

export function finalizeCompetitionTable(
  state: CompetitionSeasonState,
  environment: CompetitionSimulationEnvironment,
) {
  if (state.fixtureIndex !== state.fixtures.length) {
    throw new Error(`${state.competition.id}: cannot finalize an incomplete season`);
  }
  const sorted = sortLeagueTable(
    state.table,
    state.competition.tieBreakers,
    state.matches,
    state.competition.points,
  );
  const ratings = effectiveRatings(environment.dynamicState);
  return resolveDecisivePlayoffs(
    sorted,
    state.competition.decisivePlayoffs,
    (upper, lower) => remainTiedAfterTableRules(
      state.table,
      state.table[upper.teamId],
      state.table[lower.teamId],
      state.competition.tieBreakers,
      state.matches,
      state.competition.points,
    ),
    (upperId, lowerId) =>
      environment.rng.next() < neutralExpectedResult(
        ratings[upperId],
        ratings[lowerId],
      )
        ? upperId
        : lowerId,
  );
}

function knockoutDecider(
  upperId: string,
  lowerId: string,
  dynamicState: DynamicStrengthState,
  rng: RandomGenerator,
) {
  const ratings = effectiveRatings(dynamicState);
  return rng.next() < neutralExpectedResult(ratings[upperId], ratings[lowerId])
    ? upperId
    : lowerId;
}

function playSingleKnockout(
  state: CompetitionSeasonState,
  environment: CompetitionSimulationEnvironment,
  homeId: string,
  awayId: string,
  round: number,
  neutral = false,
) {
  const step = simulateMatchStep(
    { homeId, awayId, round },
    environment.season,
    environment.teamsById,
    environment.dynamicState,
    environment.model,
    environment.rng,
    neutral ? { ...neutralMatchContext(), homeAdvantage: 0 } : undefined,
  );
  state.postseasonMatches.push(step.match);
  applyMatchTransition(null, environment.dynamicState, step);
  if (step.match.homeGoals > step.match.awayGoals) return homeId;
  if (step.match.homeGoals < step.match.awayGoals) return awayId;
  return knockoutDecider(homeId, awayId, environment.dynamicState, environment.rng);
}

function playTwoLeggedKnockout(
  state: CompetitionSeasonState,
  environment: CompetitionSimulationEnvironment,
  higherSeedId: string,
  lowerSeedId: string,
  firstLegRound: number,
) {
  const first = simulateMatchStep(
    { homeId: lowerSeedId, awayId: higherSeedId, round: firstLegRound },
    environment.season,
    environment.teamsById,
    environment.dynamicState,
    environment.model,
    environment.rng,
  );
  state.postseasonMatches.push(first.match);
  applyMatchTransition(null, environment.dynamicState, first);
  const second = simulateMatchStep(
    { homeId: higherSeedId, awayId: lowerSeedId, round: firstLegRound + 1 },
    environment.season,
    environment.teamsById,
    environment.dynamicState,
    environment.model,
    environment.rng,
  );
  state.postseasonMatches.push(second.match);
  applyMatchTransition(null, environment.dynamicState, second);
  const higherGoals = first.match.awayGoals + second.match.homeGoals;
  const lowerGoals = first.match.homeGoals + second.match.awayGoals;
  if (higherGoals > lowerGoals) return higherSeedId;
  if (higherGoals < lowerGoals) return lowerSeedId;
  return knockoutDecider(
    higherSeedId,
    lowerSeedId,
    environment.dynamicState,
    environment.rng,
  );
}

/**
 * 2026/27 EFL six-club playoff: 5v8 and 6v7 preliminary matches,
 * two-legged semifinals joined by 3rd and 4th, then a neutral final.
 */
export function simulateEflSixTeamPromotionPlayoff(
  state: CompetitionSeasonState,
  finalTable: readonly LeagueRow[],
  environment: CompetitionSimulationEnvironment,
) {
  const eligible = state.competition.promotion?.playoff?.positions ?? [];
  if (
    eligible.length !== 6
    || eligible.some((position, index) => position !== index + 3)
  ) {
    throw new Error(
      `${state.competition.id}: EFL six-team playoff requires positions 3..8`,
    );
  }
  const at = (position: number) => {
    const row = finalTable.find(item => item.position === position);
    if (!row) throw new Error(`${state.competition.id}: missing position ${position}`);
    return row.teamId;
  };
  const fiveEight = playSingleKnockout(
    state,
    environment,
    at(5),
    at(8),
    47,
  );
  const sixSeven = playSingleKnockout(
    state,
    environment,
    at(6),
    at(7),
    47,
  );
  const firstFinalist = playTwoLeggedKnockout(
    state,
    environment,
    at(3),
    sixSeven,
    48,
  );
  const secondFinalist = playTwoLeggedKnockout(
    state,
    environment,
    at(4),
    fiveEight,
    48,
  );
  return playSingleKnockout(
    state,
    environment,
    firstFinalist,
    secondFinalist,
    50,
    true,
  );
}

export function createClosedTwoTierSystem(
  system: LeagueSystemDefinition,
  upper: CompetitionDefinition,
  lower: CompetitionDefinition,
): LeagueSystemDefinition {
  return {
    ...system,
    id: `${system.id}-active-two-tier`,
    professionalTierRange: [upper.tier, lower.tier],
    competitions: [
      upper,
      {
        ...lower,
        // The trial runner models a closed PL/Championship exchange. League One
        // remains catalogued but is not simulated until the next expansion.
        relegation: undefined,
      },
    ],
  };
}

export function rolloverClosedTwoTierRosters(options: {
  system: LeagueSystemDefinition;
  clubs: readonly ClubDefinition[];
  currentRosters: LeagueSeasonRosters;
  upperTable: readonly LeagueRow[];
  lowerTable: readonly LeagueRow[];
  lowerPlayoffWinnerId: string;
}) {
  const [upper, lower] = options.system.competitions;
  const resolution = resolveLeagueMovements(
    options.system,
    [
      { competitionId: upper.id, tables: { overall: options.upperTable } },
      {
        competitionId: lower.id,
        tables: { overall: options.lowerTable },
        promotionPlayoffWinners: [options.lowerPlayoffWinnerId],
      },
    ],
    options.currentRosters,
  );
  return {
    resolution,
    rosters: buildNextSeasonRosters(
      options.system,
      resolution,
      options.clubs,
      {},
      options.currentRosters,
    ),
  };
}
