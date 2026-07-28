import { readFile } from 'node:fs/promises';
import { teams } from '../src/data/teams';
import { activeLeague } from '../src/data/league-catalog/active';
import { createDoubleRoundRobin } from '../src/domain/fixtures';
import { calibrateRatings } from '../src/calibration/calibration-engine';
import { initialRatings, normalizeMarketProbabilities } from '../src/calibration/market';
import { IndependentPoissonModel } from '../src/simulation/score-model';

const raw = JSON.parse(await readFile(new URL('../src/data/default-market.json', import.meta.url), 'utf8'));
const target = normalizeMarketProbabilities(raw, teams);
const fixtures = createDoubleRoundRobin(teams.map(t => t.id));
const report = await calibrateRatings(teams, fixtures, target, initialRatings(target), new IndependentPoissonModel(), {
  leagueRules: {
    points: activeLeague.competition.points,
    tieBreakers: activeLeague.competition.tieBreakers,
    decisivePlayoffs: activeLeague.competition.decisivePlayoffs,
  },
  seasons: 500,
  coarseSeasons: 250,
  jacobianSeasons: 250,
  headSeasons: 500,
  finalSeasons: 1000,
  finalMaxSeasons: 1000,
  iterations: 2,
  seed: 20260722,
});
const watchIds = Object.keys(target)
  .sort((left, right) => target[right] - target[left])
  .slice(0, 5);
const watch = watchIds.map(id => ({
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
      leadingPairGap: +(report.ratings[watchIds[0]] - report.ratings[watchIds[1]]).toFixed(3),
      watch,
    },
    null,
    2,
  ),
);
