import type { RatingMap, Team } from '../domain/types';
import type { DynamicStrengthState } from './dynamic-strength';
import { baseRatings, effectiveRatings, noFormRatings } from './dynamic-strength';
import { outcomeProbability } from './match-probability';
import { modelParameters } from './score-model';

export interface StrengthLayerSnapshot {
  base: number;
  noForm: number;
  current: number;
  mediumImpact: number;
  formImpact: number;
  latent: { base: number; medium: number; form: number; current: number };
}

/** Neutral-ground expected result: P(win) + 0.5 P(draw). */
export function neutralExpectedResult(rating: number, opponentRating: number) {
  const rawDifference = rating - opponentRating;
  const difference = modelParameters.maxEffectiveDifference *
    Math.tanh((modelParameters.ratingEffect * rawDifference) / modelParameters.maxEffectiveDifference);
  const lambdaFor = modelParameters.baseGoalRate * Math.exp(difference);
  const lambdaAgainst = modelParameters.baseGoalRate * Math.exp(-difference);
  return outcomeProbability(lambdaFor, lambdaAgainst, 'home') +
    .5 * outcomeProbability(lambdaFor, lambdaAgainst, 'draw');
}

/** Translation-invariant 0–100 index against every other club on neutral ground. */
export function toStrengthIndices(teams: Team[], ratings: RatingMap): Record<string, number> {
  return Object.fromEntries(teams.map(team => {
    const opponents = teams.filter(opponent => opponent.id !== team.id);
    const mean = opponents.reduce(
      (sum, opponent) => sum + neutralExpectedResult(ratings[team.id] ?? 0, ratings[opponent.id] ?? 0),
      0,
    ) / Math.max(1, opponents.length);
    return [team.id, Math.round(100 * mean)];
  }));
}

/** Store all three layers; callers may choose to display only `current`. */
export function toStrengthLayers(teams: Team[], state: DynamicStrengthState): Record<string, StrengthLayerSnapshot> {
  const baseMap = toStrengthIndices(teams, baseRatings(state));
  const noFormMap = toStrengthIndices(teams, noFormRatings(state));
  const currentRatings = effectiveRatings(state);
  const currentMap = toStrengthIndices(teams, currentRatings);
  return Object.fromEntries(teams.map(team => {
    const value = state[team.id];
    return [team.id, {
      base: baseMap[team.id],
      noForm: noFormMap[team.id],
      current: currentMap[team.id],
      mediumImpact: noFormMap[team.id] - baseMap[team.id],
      formImpact: currentMap[team.id] - noFormMap[team.id],
      latent: { base: value.base, medium: value.medium, form: value.form, current: currentRatings[team.id] },
    }];
  }));
}

export function strengthDiagnostics(state: DynamicStrengthState) {
  const values = Object.values(state);
  const summarize = (items: number[]) => {
    const mean = items.reduce((sum, value) => sum + value, 0) / Math.max(1, items.length);
    const variance = items.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, items.length);
    return { mean, sd: Math.sqrt(variance), min: Math.min(...items), max: Math.max(...items), range: Math.max(...items) - Math.min(...items) };
  };
  return {
    base: summarize(values.map(value => value.base)),
    medium: summarize(values.map(value => value.medium)),
    form: summarize(values.map(value => value.form)),
    current: summarize(Object.values(effectiveRatings(state))),
  };
}
