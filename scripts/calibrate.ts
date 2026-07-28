import { writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { teams } from '../src/data/teams';
import { createDoubleRoundRobin } from '../src/domain/fixtures';
import { calibrateRatings, teamsOutsideTolerance } from '../src/calibration/calibration-engine';
import { initialRatings, normalizeMarketProbabilities } from '../src/calibration/market';
import { calibrationPayload } from '../src/calibration/output';
import { IndependentPoissonModel } from '../src/simulation/score-model';
import { atomicWriteFile, stampedRatingsName, withWriteLock } from './local-api';

function arg(name: string, fallback: string) {
  const value = process.argv.indexOf(name);
  return value >= 0 ? process.argv[value + 1] ?? fallback : fallback;
}

function emit(payload: unknown) {
  writeSync(1, `__CAL__${JSON.stringify(payload)}\n`);
}

const marketPath = resolve(arg('--market', './src/data/default-market.json'));
const outputPath = resolve(arg('--output', './src/data/calibrated-ratings.json'));
const seasons = Number(arg('--seasons', '30000'));
const iterations = Number(arg('--iterations', '6'));
const seed = Number(arg('--seed', '20260722'));
const coarseSeasons = Number(arg('--coarse-seasons', '10000'));
const jacobianSeasons = Number(arg('--jacobian-seasons', '10000'));
const headSeasons = Number(arg('--head-seasons', '100000'));
const finalSeasons = Number(arg('--final-seasons', '200000'));
const finalMaxSeasons = Number(arg('--final-max-seasons', '300000'));
const startMode = arg('--start-mode', 'hybrid') as 'cold' | 'warm' | 'hybrid';

const raw = JSON.parse(await readFile(marketPath, 'utf8'));
const target = normalizeMarketProbabilities(raw, teams);
const fixtures = createDoubleRoundRobin(teams.map(t => t.id));
let currentRatings = initialRatings(target);
try {
  const previous = JSON.parse(await readFile(outputPath, 'utf8')) as { ratings?: Record<string, number> };
  if (previous.ratings && Object.keys(previous.ratings).length === teams.length) currentRatings = previous.ratings;
} catch {
  // A missing/old output is a normal cold-start condition.
}

emit({
  type: 'start',
  iterations,
  seasons,
  teams: teams.map(team => ({
    id: team.id,
    name: team.name,
    color: team.color,
    market: raw[team.id] ?? 0,
    target: target[team.id],
    rating: currentRatings[team.id],
  })),
});

const report = await calibrateRatings(teams, fixtures, target, currentRatings, new IndependentPoissonModel(), {
  seasons,
  iterations,
  seed,
  coarseSeasons,
  jacobianSeasons,
  headSeasons,
  finalSeasons,
  finalMaxSeasons,
  startMode,
  onPhase: (phase, detail) => emit({ type: 'phase', phase, detail }),
  onRatings: ratings => {
    currentRatings = ratings;
  },
  onSeasonProgress: (iteration, info) => {
    emit({
      type: 'season',
      iteration,
      iterations,
      done: info.done,
      total: info.total,
      teams: teams.map(team => ({
        id: team.id,
        name: team.name,
        color: team.color,
        target: target[team.id],
        simulated: info.partialSimulated[team.id],
        error: info.partialSimulated[team.id] - target[team.id],
        rating: currentRatings[team.id],
      })),
    });
  },
  onIteration: (iteration, current) => {
    currentRatings = current.ratings;
    emit({
      type: 'iteration',
      iteration,
      iterations,
      seasonsUsed: current.seasonsUsed,
      loss: current.loss,
      mae: current.mae,
      maxError: current.maxError,
      weightedMae: current.weightedMae,
      teams: teams.map(team => ({
        id: team.id,
        name: team.name,
        color: team.color,
        target: target[team.id],
        simulated: current.simulated[team.id],
        error: current.errors[team.id],
        rating: current.ratings[team.id],
      })),
    });
  },
});

const payload = calibrationPayload(report, raw, target, {
  randomSeed: seed,
  startMode,
  iterations,
  coarseSeasons,
  normalSeasons: seasons,
  jacobianSeasons,
  headSeasons,
  finalSeasons,
  finalMaxSeasons,
  trainingSeedBank: [1, 2, 3, 4, 5].map(value => seed + 1_000 + value),
  validationSeedBank: [1, 2, 3, 4, 5].map(value => seed + 9_000 + value),
});
const stampedPath = resolve(outputPath, '..', stampedRatingsName());
const serializedPayload = `${JSON.stringify(payload, null, 2)}\n`;
await withWriteLock(async () => {
  await atomicWriteFile(outputPath, serializedPayload);
  await atomicWriteFile(stampedPath, serializedPayload);
});

emit({
  type: 'final',
  loss: report.loss,
  mae: report.mae,
  maxError: report.maxError,
  converged: report.converged,
  teamsOutsideTolerance: teamsOutsideTolerance(teams, report).map(team => team.id),
  output: outputPath,
  stamped: stampedPath,
  teams: teams.map(team => ({
    id: team.id,
    name: team.name,
    color: team.color,
    target: target[team.id],
    simulated: report.simulated[team.id],
    error: report.errors[team.id],
    rating: report.ratings[team.id],
  })),
});
