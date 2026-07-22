/// <reference lib="webworker" />
import { teams } from '../data/teams';
import { createDoubleRoundRobin } from '../domain/fixtures';
import type { RatingMap } from '../domain/types';
import { IndependentPoissonModel } from '../simulation/score-model';
import { createStaticChampionSimulator } from '../simulation/season-simulator';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const fixtures = createDoubleRoundRobin(teams.map(t => t.id));
const model = new IndependentPoissonModel();
const simulateChampion = createStaticChampionSimulator(teams, fixtures, model);

ctx.onmessage = ({ data }) => {
  if (data.type !== 'batch') return;
  const ratings = data.ratings as RatingMap;
  const seasons = data.seasons as number;
  const seed = data.seed as number;
  const reportEvery = data.reportEvery as number;
  const seasonOffset = (data.seasonOffset as number | undefined) ?? 0;
  const wins: RatingMap = Object.fromEntries(teams.map(t => [t.id, 0]));
  for (let i = 0; i < seasons; i++) {
    const champion = simulateChampion(ratings, seed >>> 0, seasonOffset + i);
    wins[champion]++;
    if ((i + 1) % reportEvery === 0 || i + 1 === seasons) {
      ctx.postMessage({ type: 'progress', workerId: data.workerId, done: i + 1, wins: { ...wins } });
    }
  }
  ctx.postMessage({ type: 'done', workerId: data.workerId, wins });
};
