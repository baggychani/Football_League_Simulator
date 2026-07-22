import { writeFileSync } from 'node:fs';
import { createDoubleRoundRobin } from '../src/domain/fixtures';
import { teams } from '../src/data/teams';
import { normalizeMarketProbabilities, ratingsFromLogMarket } from '../src/calibration/market';
import { scoreModelDiagnostics } from '../src/calibration/diagnostics';
import { IndependentPoissonModel } from '../src/simulation/score-model';
import market from '../src/data/default-market.json';

const target = normalizeMarketProbabilities(market as Record<string, number>, teams);
const model = new IndependentPoissonModel();
const fixtures = createDoubleRoundRobin(teams.map(team => team.id));

let bestScale = 0.45;
let ratings = ratingsFromLogMarket(target, bestScale);
for (const scale of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]) {
  const candidate = ratingsFromLogMarket(target, scale);
  const diagnostics = scoreModelDiagnostics(teams, fixtures, candidate, model);
  if (
    (diagnostics?.nearSmoothCapFixtureRatio ?? 1) === 0 &&
    (diagnostics?.maximumExpectedGoals ?? 99) < 10
  ) {
    bestScale = scale;
    ratings = candidate;
  }
}

const stubDiagnostics = Object.fromEntries(
  teams.map(team => [
    team.id,
    {
      withinTolerance: false,
      residual: 0,
      tolerance: 0.01,
      standardError: 0,
    },
  ]),
);

const payload = {
  schemaVersion: 2,
  calibrationMode: 'static-baseline',
  marketSnapshot: market,
  normalizedTargets: target,
  simulatedProbability: target,
  probabilityError: Object.fromEntries(teams.map(team => [team.id, 0])),
  ratings,
  teamDiagnostics: stubDiagnostics,
  teamsOutsideTolerance: teams.map(team => team.id),
  method: `roster-refresh placeholder scale=${bestScale} — re-run python calibrate.py`,
  createdAt: new Date().toISOString(),
  note: '2026/27 roster: Coventry / Ipswich / Hull replace Burnley / West Ham / Wolves. Ratings are temporary seeds until full calibration.',
};

writeFileSync(new URL('../src/data/calibrated-ratings.json', import.meta.url), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote calibrated-ratings.json scale=${bestScale}`);
const check = scoreModelDiagnostics(teams, fixtures, ratings, model);
console.log('nearSmoothCap', check?.nearSmoothCapFixtureRatio);
