import type { MatchScore, RatingMap, Team } from '../domain/types';
import type { RandomGenerator } from './rng';
import { poisson, poissonFromUniform } from './poisson';

export interface ScoreExpectation {
  rawDifference: number;
  effectiveDifference: number;
  lambdaHome: number;
  lambdaAway: number;
}

export interface ScoreModel {
  simulateScore(home: Team, away: Team, ratings: RatingMap, rng: RandomGenerator): MatchScore;
  expectedScore?(home: Team, away: Team, ratings: RatingMap): ScoreExpectation;
  simulateScoreFromUniforms?(
    home: Team,
    away: Team,
    ratings: RatingMap,
    homeUniform: number,
    awayUniform: number,
  ): MatchScore;
}

/** ratingEffect is fixed: ratings alone carry the calibrated scale. */
export const modelParameters = {
  baseGoalRate: 1.34,
  homeAdvantage: 0.14,
  maxEffectiveDifference: 2.45,
  ratingEffect: 1,
};

export class IndependentPoissonModel implements ScoreModel {
  expectedScore(home: Team, away: Team, ratings: RatingMap): ScoreExpectation {
    const rawDifference =
      (ratings[home.id] ?? 0) -
      (ratings[away.id] ?? 0);
    const effectiveDifference =
      modelParameters.maxEffectiveDifference *
      Math.tanh((modelParameters.ratingEffect * rawDifference) / modelParameters.maxEffectiveDifference);
    const lambdaHome = Math.exp(
      Math.log(modelParameters.baseGoalRate) + modelParameters.homeAdvantage + effectiveDifference,
    );
    const lambdaAway = Math.exp(
      Math.log(modelParameters.baseGoalRate) - modelParameters.homeAdvantage - effectiveDifference,
    );
    return { rawDifference, effectiveDifference, lambdaHome, lambdaAway };
  }

  simulateScore(home: Team, away: Team, ratings: RatingMap, rng: RandomGenerator): MatchScore {
    const { lambdaHome, lambdaAway } = this.expectedScore(home, away, ratings);
    return { lambdaHome, lambdaAway, homeGoals: poisson(lambdaHome, rng), awayGoals: poisson(lambdaAway, rng) };
  }

  simulateScoreFromUniforms(
    home: Team,
    away: Team,
    ratings: RatingMap,
    homeUniform: number,
    awayUniform: number,
  ): MatchScore {
    const { lambdaHome, lambdaAway } = this.expectedScore(home, away, ratings);
    return {
      lambdaHome,
      lambdaAway,
      homeGoals: poissonFromUniform(lambdaHome, homeUniform),
      awayGoals: poissonFromUniform(lambdaAway, awayUniform),
    };
  }
}
