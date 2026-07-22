import { readFile } from 'node:fs/promises';
import { teams } from '../src/data/teams';
import { createDoubleRoundRobin } from '../src/domain/fixtures';
import { calibrateRatings } from '../src/calibration/calibration-engine';
import { initialRatings, normalizeMarketProbabilities } from '../src/calibration/market';
import { IndependentPoissonModel } from '../src/simulation/score-model';

const raw = JSON.parse(await readFile(new URL('../src/data/default-market.json', import.meta.url), 'utf8'));
const target = normalizeMarketProbabilities(raw, teams);
const fixtures = createDoubleRoundRobin(teams.map(t => t.id));
const report = await calibrateRatings(teams, fixtures, target, initialRatings(target), new IndependentPoissonModel(), {
  seasons: 500,
  coarseSeasons: 250,
  jacobianSeasons: 250,
  headSeasons: 500,
  finalSeasons: 1000,
  finalMaxSeasons: 1000,
  iterations: 2,
  seed: 20260722,
});
const watch = ['arsenal', 'man-city', 'newcastle', 'bournemouth', 'aston-villa'].map(id => ({
  id,
  target: +(target[id] * 100).toFixed(3),
  sim: +(report.simulated[id] * 100).toFixed(3),
  err: +((report.simulated[id] - target[id]) * 100).toFixed(3),
  rating: +report.ratings[id].toFixed(3),
}));
console.log(
  JSON.stringify(
    {
      maePp: +(report.mae * 100).toFixed(2),
      maxPp: +(report.maxError * 100).toFixed(2),
      weightedMaePp: +((report.weightedMae ?? 0) * 100).toFixed(2),
      villaNewcastleGap: +(report.ratings['aston-villa'] - report.ratings.newcastle).toFixed(3),
      watch,
    },
    null,
    2,
  ),
);
