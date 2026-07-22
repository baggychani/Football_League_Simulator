import type { Fixture, RatingMap, Team } from '../domain/types';
import type { ScoreModel } from '../simulation/score-model';
import { modelParameters } from '../simulation/score-model';

export interface DistributionSummary {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface ScoreModelDiagnostics {
  rawRatingDifference: DistributionSummary;
  effectiveRatingDifference: DistributionSummary;
  lambdaHome: DistributionSummary;
  lambdaAway: DistributionSummary;
  hardClampFixtureRatio: 0;
  nearSmoothCapFixtureRatio: number;
  maximumExpectedGoals: number;
}

function quantile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summary(values: number[]): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
  };
}

export function scoreModelDiagnostics(
  teams: Team[],
  fixtures: Fixture[],
  ratings: RatingMap,
  model: ScoreModel,
): ScoreModelDiagnostics | undefined {
  if (!model.expectedScore) return undefined;
  const byId = Object.fromEntries(teams.map(team => [team.id, team]));
  const raw: number[] = [];
  const effective: number[] = [];
  const lambdaHome: number[] = [];
  const lambdaAway: number[] = [];
  let nearCap = 0;
  for (const fixture of fixtures) {
    const expectation = model.expectedScore(byId[fixture.homeId], byId[fixture.awayId], ratings);
    raw.push(expectation.rawDifference);
    effective.push(expectation.effectiveDifference);
    lambdaHome.push(expectation.lambdaHome);
    lambdaAway.push(expectation.lambdaAway);
    if (Math.abs(expectation.effectiveDifference) >= 0.95 * modelParameters.maxEffectiveDifference) nearCap++;
  }
  return {
    rawRatingDifference: summary(raw),
    effectiveRatingDifference: summary(effective),
    lambdaHome: summary(lambdaHome),
    lambdaAway: summary(lambdaAway),
    hardClampFixtureRatio: 0,
    nearSmoothCapFixtureRatio: nearCap / Math.max(1, fixtures.length),
    maximumExpectedGoals: Math.max(...lambdaHome, ...lambdaAway, 0),
  };
}
