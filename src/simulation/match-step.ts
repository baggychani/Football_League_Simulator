import type {
  Fixture,
  PlayedMatch,
  PointsRules,
  Team,
  TeamSeasonState,
} from '../domain/types';
import { applyResult } from '../domain/standings';
import {
  applyDynamicMatch,
  effectiveRatings,
  type DynamicStrengthState,
} from './dynamic-strength';
import type { MatchContext } from './match-context';
import type { RandomGenerator } from './rng';
import type {
  OutcomeProbabilities,
  ScoreDistribution,
  ScoreModel,
} from './score-model';

export interface MatchStepResult {
  match: PlayedMatch;
  distribution: ScoreDistribution;
  outcomes: OutcomeProbabilities;
}

export function simulateMatchStep(
  fixture: Fixture,
  season: number,
  teamsById: Readonly<Record<string, Team>>,
  dynamicState: DynamicStrengthState,
  model: ScoreModel,
  rng: RandomGenerator,
  context?: MatchContext,
): MatchStepResult {
  const home = teamsById[fixture.homeId];
  const away = teamsById[fixture.awayId];
  if (!home || !away) {
    throw new Error(`Unknown fixture club: ${fixture.homeId} vs ${fixture.awayId}`);
  }
  const score = model.simulateScore(
    home,
    away,
    effectiveRatings(dynamicState),
    rng,
    context,
  );
  const match = { ...fixture, ...score, season };
  const distribution = model.distribution(score.lambdaHome, score.lambdaAway);
  return {
    match,
    distribution,
    outcomes: distribution.outcomeProbabilities(),
  };
}

export function applyMatchTransition(
  table: Record<string, TeamSeasonState> | null,
  dynamicState: DynamicStrengthState,
  step: MatchStepResult,
  points?: PointsRules,
) {
  if (table) applyResult(table, step.match, step.match, points);
  applyDynamicMatch(dynamicState, step.match, step.match, step.outcomes);
}
