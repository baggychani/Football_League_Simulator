import { describe, expect, it } from 'vitest';
import {
  assessScoreline,
  assessUpset,
  conditionalBinomialLogProbability,
  conditionalBinomialUpperTail,
} from '../simulation/match-probability';
import {
  IndependentPoissonModel,
  poissonLogProbability,
  SCORE_TAIL_TOLERANCE,
} from '../simulation/score-model';

const model = new IndependentPoissonModel();

describe('model-based match probability', () => {
  it('enumerates all but less than the requested score probability mass', () => {
    const distribution = model.distribution(17.9, .11);
    const mass = Array.from(distribution.enumerateScorelines())
      .reduce((sum, scoreline) => sum + scoreline.probability, 0);
    expect(mass).toBeGreaterThanOrEqual(1 - SCORE_TAIL_TOLERANCE);
    expect(distribution.outcomeProbabilities().home +
      distribution.outcomeProbabilities().draw +
      distribution.outcomeProbabilities().away).toBeCloseTo(1, 14);
  });

  it('matches the product of independent Poisson masses', () => {
    const distribution = model.distribution(.65, 2.1);
    expect(distribution.logProbability(5, 0)).toBeCloseTo(
      poissonLogProbability(.65, 5) + poissonLogProbability(2.1, 0),
      14,
    );
  });

  it('matches the Poisson-total and conditional-binomial factorization', () => {
    const distribution = model.distribution(.65, 2.1);
    const exact = assessScoreline(distribution, 5, 0);
    const factorized = poissonLogProbability(2.75, 5) +
      conditionalBinomialLogProbability(5, 5, .65 / 2.75);
    expect(exact.exactScoreLogProbability).toBeCloseTo(factorized, 13);
    expect(exact.exactScoreLogProbability).toBeCloseTo(
      exact.totalGoalsLogProbability + exact.conditionalAllocationLogProbability,
      13,
    );
  });

  it('uses the conditional allocation upper tail for an underdog blowout', () => {
    const tail = conditionalBinomialUpperTail(5, 5, .2);
    expect(tail.probability).toBeCloseTo(.00032, 12);
  });

  it('never classifies a favorite win as an upset, regardless of score', () => {
    const favoriteAtHome = model.distribution(2.4, .6);
    expect(assessUpset(favoriteAtHome, 1, 0)).toBeNull();
    expect(assessUpset(favoriteAtHome, 100, 0)).toBeNull();
  });

  it('accepts slight underdogs without the former 30% and 10-point gates', () => {
    const slightUnderdog = model.distribution(1.2, 1.35);
    const assessment = assessUpset(slightUnderdog, 1, 0);
    expect(assessment).not.toBeNull();
    expect(assessment!.winnerProbability).toBeGreaterThan(.3);
    expect(assessment!.loserProbability - assessment!.winnerProbability).toBeLessThan(.1);
  });

  it('has no discontinuity around the former 30% winner-probability boundary', () => {
    const below = assessUpset(model.distribution(1.08, 1.35), 1, 0);
    const above = assessUpset(model.distribution(1.085, 1.35), 1, 0);
    expect(below).not.toBeNull();
    expect(above).not.toBeNull();
    expect(below!.winnerProbability).toBeLessThan(.3);
    expect(above!.winnerProbability).toBeGreaterThan(.3);
    expect(Math.abs(below!.upsetSurprisal - above!.upsetSurprisal)).toBeLessThan(.02);
  });

  it('ranks the same score higher when the pre-match strength gap is larger', () => {
    const modest = assessUpset(model.distribution(1.05, 1.5), 3, 0);
    const enormous = assessUpset(model.distribution(.45, 2.4), 3, 0);
    expect(modest).not.toBeNull();
    expect(enormous).not.toBeNull();
    expect(enormous!.upsetSurprisal).toBeGreaterThan(modest!.upsetSurprisal);
  });

  it('ranks more dominant scores higher under the same expectations', () => {
    const distribution = model.distribution(.6, 2.4);
    const one = assessUpset(distribution, 1, 0)!;
    const three = assessUpset(distribution, 3, 0)!;
    const five = assessUpset(distribution, 5, 0)!;
    expect(three.upsetSurprisal).toBeGreaterThan(one.upsetSurprisal);
    expect(five.upsetSurprisal).toBeGreaterThan(three.upsetSurprisal);
    expect(five.conditionalAllocationSurprisal).toBeGreaterThan(three.conditionalAllocationSurprisal);
  });

  it('ranks a large-underdog shutout above a near-even 6-5 rarity', () => {
    const shootout = assessUpset(model.distribution(1.35, 1.45), 6, 5);
    const reversal = assessUpset(model.distribution(.6, 2.4), 3, 0);
    expect(shootout).not.toBeNull();
    expect(reversal).not.toBeNull();
    expect(reversal!.upsetSurprisal).toBeGreaterThan(shootout!.upsetSurprisal);
    expect(shootout!.exactScoreSurprisal).toBeGreaterThan(reversal!.exactScoreSurprisal);
  });

  it('is symmetric when home and away teams are exchanged', () => {
    const homeUnderdog = assessUpset(model.distribution(.6, 2.4), 3, 0)!;
    const awayUnderdog = assessUpset(model.distribution(2.4, .6), 0, 3)!;
    expect(awayUnderdog.upsetSurprisal).toBeCloseTo(homeUnderdog.upsetSurprisal, 13);
    expect(awayUnderdog.conditionalAllocationSurprisal).toBeCloseTo(
      homeUnderdog.conditionalAllocationSurprisal,
      13,
    );
    expect(awayUnderdog.exactScoreLogProbability).toBeCloseTo(
      homeUnderdog.exactScoreLogProbability,
      13,
    );
  });

  it('returns finite deterministic diagnostics', () => {
    const distribution = model.distribution(.35, 2.4);
    const first = assessUpset(distribution, 4, 0)!;
    const second = assessUpset(distribution, 4, 0)!;
    expect(second).toEqual(first);
    for (const value of Object.values(first)) {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    }
  });
});
