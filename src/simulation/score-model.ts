import type { MatchScore, RatingMap, Team } from '../domain/types';
import type { RandomGenerator } from './rng';
import { poisson, poissonFromUniform } from './poisson';
import type { MatchContext } from './match-context';

export const SCORE_TAIL_TOLERANCE = 1e-12;
export const INDEPENDENT_POISSON_MODEL_VERSION = 'independent-poisson-v2';

export interface ScoreExpectation {
  rawDifference: number;
  effectiveDifference: number;
  lambdaHome: number;
  lambdaAway: number;
}

export interface ScorelineProbability {
  homeGoals: number;
  awayGoals: number;
  logProbability: number;
  probability: number;
}

export interface OutcomeProbabilities {
  home: number;
  draw: number;
  away: number;
  enumeratedMass: number;
}

export interface ScoreEnumerationMinimum {
  homeGoals?: number;
  awayGoals?: number;
}

export interface ScoreDistribution {
  readonly modelVersion: string;
  expectation(): Pick<ScoreExpectation, 'lambdaHome' | 'lambdaAway'>;
  logProbability(homeGoals: number, awayGoals: number): number;
  outcomeProbabilities(tailTolerance?: number): OutcomeProbabilities;
  enumerateScorelines(
    tailTolerance?: number,
    minimum?: ScoreEnumerationMinimum,
  ): Iterable<ScorelineProbability>;
}

export interface ScoreModel {
  simulateScore(home: Team, away: Team, ratings: RatingMap, rng: RandomGenerator, context?: MatchContext): MatchScore;
  distribution(lambdaHome: number, lambdaAway: number): ScoreDistribution;
  expectedScore?(home: Team, away: Team, ratings: RatingMap, context?: MatchContext): ScoreExpectation;
  simulateScoreFromUniforms?(
    home: Team,
    away: Team,
    ratings: RatingMap,
    homeUniform: number,
    awayUniform: number,
    context?: MatchContext,
  ): MatchScore;
}

/** ratingEffect is fixed: ratings alone carry the calibrated scale. */
export const modelParameters = {
  baseGoalRate: 1.34,
  homeAdvantage: 0.14,
  maxEffectiveDifference: 2.45,
  ratingEffect: 1,
};

const logFactorials: number[] = [0];
for (let value = 1; value <= 256; value++) {
  logFactorials[value] = logFactorials[value - 1] + Math.log(value);
}

export function logFactorial(value: number) {
  if (!Number.isInteger(value) || value < 0) return Number.POSITIVE_INFINITY;
  for (let next = logFactorials.length; next <= value; next++) {
    logFactorials[next] = logFactorials[next - 1] + Math.log(next);
  }
  return logFactorials[value];
}

export function poissonLogProbability(lambda: number, goals: number) {
  if (!Number.isFinite(lambda) || lambda < 0 || !Number.isInteger(goals) || goals < 0) {
    return Number.NEGATIVE_INFINITY;
  }
  if (lambda === 0) return goals === 0 ? 0 : Number.NEGATIVE_INFINITY;
  return -lambda + goals * Math.log(lambda) - logFactorial(goals);
}

interface MarginalSupport {
  masses: number[];
  logMasses: number[];
  mass: number;
}

function validateTolerance(tolerance: number) {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1) {
    throw new RangeError('tailTolerance must be between 0 and 1');
  }
}

function poissonSupport(lambda: number, tailTolerance: number, minimumGoals = 0): MarginalSupport {
  validateTolerance(tailTolerance);
  if (!Number.isFinite(lambda) || lambda < 0) throw new RangeError('lambda must be finite and non-negative');
  if (!Number.isInteger(minimumGoals) || minimumGoals < 0) throw new RangeError('minimumGoals must be a non-negative integer');

  const masses: number[] = [];
  const logMasses: number[] = [];
  let cumulative = 0;
  let goals = 0;
  const target = 1 - tailTolerance;

  do {
    const logMass = poissonLogProbability(lambda, goals);
    const mass = Math.exp(logMass);
    logMasses.push(logMass);
    masses.push(mass);
    cumulative += mass;
    goals++;
    if (goals > 100_000) throw new RangeError('Poisson support did not converge');
  } while (goals <= minimumGoals || cumulative < target);

  return { masses, logMasses, mass: cumulative };
}

export class IndependentPoissonDistribution implements ScoreDistribution {
  readonly modelVersion = INDEPENDENT_POISSON_MODEL_VERSION;

  constructor(
    readonly lambdaHome: number,
    readonly lambdaAway: number,
  ) {
    if (!Number.isFinite(lambdaHome) || lambdaHome < 0 || !Number.isFinite(lambdaAway) || lambdaAway < 0) {
      throw new RangeError('Poisson expectations must be finite and non-negative');
    }
  }

  expectation() {
    return { lambdaHome: this.lambdaHome, lambdaAway: this.lambdaAway };
  }

  logProbability(homeGoals: number, awayGoals: number) {
    return poissonLogProbability(this.lambdaHome, homeGoals) +
      poissonLogProbability(this.lambdaAway, awayGoals);
  }

  enumerateScorelines(
    tailTolerance = SCORE_TAIL_TOLERANCE,
    minimum: ScoreEnumerationMinimum = {},
  ): Iterable<ScorelineProbability> {
    validateTolerance(tailTolerance);
    // Splitting the error budget between the two marginals bounds omitted
    // joint mass below the requested tolerance.
    const marginalTolerance = tailTolerance / 4;
    const home = poissonSupport(this.lambdaHome, marginalTolerance, minimum.homeGoals ?? 0);
    const away = poissonSupport(this.lambdaAway, marginalTolerance, minimum.awayGoals ?? 0);
    const scorelines: ScorelineProbability[] = [];

    for (let homeGoals = 0; homeGoals < home.masses.length; homeGoals++) {
      for (let awayGoals = 0; awayGoals < away.masses.length; awayGoals++) {
        const logProbability = home.logMasses[homeGoals] + away.logMasses[awayGoals];
        scorelines.push({
          homeGoals,
          awayGoals,
          logProbability,
          probability: home.masses[homeGoals] * away.masses[awayGoals],
        });
      }
    }
    return scorelines;
  }

  outcomeProbabilities(tailTolerance = SCORE_TAIL_TOLERANCE): OutcomeProbabilities {
    let home = 0;
    let draw = 0;
    let away = 0;
    let enumeratedMass = 0;

    for (const scoreline of this.enumerateScorelines(tailTolerance)) {
      enumeratedMass += scoreline.probability;
      if (scoreline.homeGoals > scoreline.awayGoals) home += scoreline.probability;
      else if (scoreline.homeGoals < scoreline.awayGoals) away += scoreline.probability;
      else draw += scoreline.probability;
    }

    if (!(enumeratedMass > 0)) throw new RangeError('Score distribution has no enumerable probability mass');
    return {
      home: home / enumeratedMass,
      draw: draw / enumeratedMass,
      away: away / enumeratedMass,
      enumeratedMass,
    };
  }
}

export class IndependentPoissonModel implements ScoreModel {
  distribution(lambdaHome: number, lambdaAway: number) {
    return new IndependentPoissonDistribution(lambdaHome, lambdaAway);
  }

  expectedScore(home: Team, away: Team, ratings: RatingMap, context?: MatchContext): ScoreExpectation {
    const homeContext = context?.home;
    const awayContext = context?.away;
    const homeAdjustment =
      (homeContext?.effortShift ?? 0)
      + (homeContext?.performanceShift ?? 0)
      - (homeContext?.fatigueShift ?? 0);
    const awayAdjustment =
      (awayContext?.effortShift ?? 0)
      + (awayContext?.performanceShift ?? 0)
      - (awayContext?.fatigueShift ?? 0);
    const rawDifference =
      (ratings[home.id] ?? 0) + homeAdjustment
      - (ratings[away.id] ?? 0) - awayAdjustment;
    const effectiveDifference =
      modelParameters.maxEffectiveDifference *
      Math.tanh((modelParameters.ratingEffect * rawDifference) / modelParameters.maxEffectiveDifference);
    const tempoShift = context?.tempoShift ?? 0;
    const homeAdvantage = context?.homeAdvantage ?? modelParameters.homeAdvantage;
    const lambdaHome = Math.exp(
      Math.log(modelParameters.baseGoalRate) + homeAdvantage + effectiveDifference + tempoShift,
    );
    const lambdaAway = Math.exp(
      Math.log(modelParameters.baseGoalRate) - homeAdvantage - effectiveDifference + tempoShift,
    );
    return { rawDifference, effectiveDifference, lambdaHome, lambdaAway };
  }

  simulateScore(home: Team, away: Team, ratings: RatingMap, rng: RandomGenerator, context?: MatchContext): MatchScore {
    const { lambdaHome, lambdaAway } = this.expectedScore(home, away, ratings, context);
    return { lambdaHome, lambdaAway, homeGoals: poisson(lambdaHome, rng), awayGoals: poisson(lambdaAway, rng) };
  }

  simulateScoreFromUniforms(
    home: Team,
    away: Team,
    ratings: RatingMap,
    homeUniform: number,
    awayUniform: number,
    context?: MatchContext,
  ): MatchScore {
    const { lambdaHome, lambdaAway } = this.expectedScore(home, away, ratings, context);
    return {
      lambdaHome,
      lambdaAway,
      homeGoals: poissonFromUniform(lambdaHome, homeUniform),
      awayGoals: poissonFromUniform(lambdaAway, awayUniform),
    };
  }
}
