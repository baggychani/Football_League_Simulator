import { describe, expect, it } from 'vitest';
import { calibrationObjective, toleranceForTarget } from '../calibration/objective';
import { calibrateRatings, createCalibrationEvaluator } from '../calibration/calibration-engine';
import { projectMarketOrder } from '../calibration/parameterization';
import { scoreModelDiagnostics } from '../calibration/diagnostics';
import { normalizeMarketProbabilities } from '../calibration/market';
import market from '../data/default-market.json';
import ratingsFile from '../data/calibrated-ratings.json';
import { teams } from '../data/teams';
import { createDoubleRoundRobin } from '../domain/fixtures';
import { poissonFromUniform } from '../simulation/poisson';
import { counterUniform, createRng } from '../simulation/rng';
import { IndependentPoissonModel, modelParameters } from '../simulation/score-model';
import { createDynamicChampionSimulator, createStaticChampionSimulator, simulateSeason } from '../simulation/season-simulator';

describe('calibration v2', () => {
  it('uses absolute favorite tolerances and relative/floored tail tolerances', () => {
    expect(toleranceForTarget(0.34)).toBe(0.003);
    expect(toleranceForTarget(0.08)).toBe(0.005);
    expect(toleranceForTarget(0.02)).toBeCloseTo(0.0024);
    expect(toleranceForTarget(0.0005)).toBe(0.00025);
  });

  it('projects market order with proper PAVA and explicit equal-probability tiers', () => {
    const target = { a: 0.5, b: 0.25, c: 0.25, d: 0.01 };
    const projected = projectMarketOrder({ a: 0, b: -1, c: 1, d: 2 }, target);
    expect(projected.a).toBeGreaterThanOrEqual(projected.b);
    expect(projected.b).toBe(projected.c);
    expect(projected.c).toBeGreaterThanOrEqual(projected.d);
    expect(Object.values(projected).reduce((sum, value) => sum + value, 0)).toBeCloseTo(0);
  });

  it('assigns deterministic addressable uniforms and monotone inverse-Poisson samples', () => {
    const value = counterUniform(42, 7, 31, 0);
    expect(counterUniform(42, 7, 31, 0)).toBe(value);
    expect(counterUniform(42, 7, 31, 1)).not.toBe(value);
    expect(poissonFromUniform(0.5, 0.8)).toBeLessThanOrEqual(poissonFromUniform(2.5, 0.8));
  });

  it('reproduces identical champion counts for the same rating and seed bank', async () => {
    const clubs = teams.slice(0, 6);
    const fixtures = createDoubleRoundRobin(clubs.map(team => team.id));
    const target = normalizeMarketProbabilities(
      Object.fromEntries(clubs.map((team, index) => [team.id, clubs.length - index])),
      clubs,
    );
    const model = new IndependentPoissonModel();
    const evaluator = createCalibrationEvaluator(clubs, fixtures, target, model);
    const ratings = Object.fromEntries(clubs.map((team, index) => [team.id, 0.1 - index * 0.04]));
    const request = { ratings, seasons: 50, seeds: [1001, 1002] };
    const first = await evaluator(request);
    const second = await evaluator(request);
    expect(second.championCounts).toEqual(first.championCounts);
    expect(second.simulated).toEqual(first.simulated);
  });

  it('uses the supplied initial ratings in warm-start mode', async () => {
    const clubs = teams.slice(0, 6);
    const fixtures = createDoubleRoundRobin(clubs.map(team => team.id));
    const target = normalizeMarketProbabilities(
      Object.fromEntries(clubs.map((team, index) => [team.id, clubs.length - index])),
      clubs,
    );
    const initial = Object.fromEntries(clubs.map((team, index) => [team.id, 0.25 - index * 0.1]));
    let firstEvaluated: Record<string, number> | undefined;
    await calibrateRatings(clubs, fixtures, target, initial, new IndependentPoissonModel(), {
      startMode: 'warm',
      iterations: 1,
      seasons: 10,
      coarseSeasons: 10,
      jacobianSeasons: 10,
      headSeasons: 10,
      finalSeasons: 10,
      finalMaxSeasons: 10,
      headIterations: 1,
      seed: 77,
      onIteration: (iteration, report) => {
        if (iteration === 0 && !firstEvaluated) firstEvaluated = report.evaluatedRatings;
      },
    });
    expect(firstEvaluated).toEqual(projectMarketOrder(initial, target));
  });

  it('keeps the allocation-light calibration season exactly equivalent to the static production path', () => {
    const clubs = teams.slice(0, 6);
    const fixtures = createDoubleRoundRobin(clubs.map(team => team.id));
    const ratings = Object.fromEntries(clubs.map((team, index) => [team.id, (clubs.length - index) * 0.03]));
    const model = new IndependentPoissonModel();
    const fast = createStaticChampionSimulator(clubs, fixtures, model);
    const full = simulateSeason(clubs, fixtures, ratings, createRng(1), model, 8, {
      dynamic: false,
      counterSeed: 991,
      counterSeason: 7,
    });
    expect(fast(ratings, 991, 7)).toBe(full.championId);
  });

  it('resets dynamic calibration state for each deterministic first-season sample', () => {
    const clubs = teams.slice(0, 6);
    const fixtures = createDoubleRoundRobin(clubs.map(team => team.id));
    const ratings = Object.fromEntries(clubs.map((team, index) => [team.id, .12 - index * .04]));
    const simulate = createDynamicChampionSimulator(clubs, fixtures, new IndependentPoissonModel());
    expect(simulate(ratings, 818, 4)).toBe(simulate(ratings, 818, 4));
  });

  it('uses smooth finite score compression and keeps current fixtures away from saturation', () => {
    const model = new IndependentPoissonModel();
    const home = teams[0];
    const away = teams[1];
    const first = model.expectedScore(home, away, { [home.id]: 0.5, [away.id]: 0 });
    const second = model.expectedScore(home, away, { [home.id]: 0.6, [away.id]: 0 });
    expect(first.effectiveDifference).toBeLessThan(0.5);
    expect(second.effectiveDifference).toBeGreaterThan(first.effectiveDifference);
    expect(second.effectiveDifference).toBeLessThan(modelParameters.maxEffectiveDifference);
    const diagnostics = scoreModelDiagnostics(
      teams,
      createDoubleRoundRobin(teams.map(team => team.id)),
      ratingsFile.ratings,
      model,
    );
    expect(diagnostics?.hardClampFixtureRatio).toBe(0);
    expect(diagnostics?.nearSmoothCapFixtureRatio).toBe(0);
    expect(diagnostics?.maximumExpectedGoals).toBeLessThan(10);
  });

  it('uses one objective for team tolerances and head mass/split completion', () => {
    const target = normalizeMarketProbabilities(market, teams);
    const exact = calibrationObjective(teams, target, target, 300_000);
    expect(exact.converged).toBe(true);
    expect(exact.loss).toBeCloseTo(0);
    const missed = { ...target, arsenal: target.arsenal + 0.004, 'man-city': target['man-city'] - 0.004 };
    const objective = calibrationObjective(teams, target, missed, 300_000);
    expect(objective.diagnostics.arsenal.withinTolerance).toBe(false);
    expect(objective.head.massWithinTolerance).toBe(true);
    expect(objective.head.splitWithinTolerance).toBe(false);
  });
});
