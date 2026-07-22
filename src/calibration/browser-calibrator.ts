import { teams } from '../data/teams';
import { createDoubleRoundRobin } from '../domain/fixtures';
import type { RatingMap } from '../domain/types';
import { IndependentPoissonModel } from '../simulation/score-model';
import {
  calibrateRatings,
  reportFromState,
  simulatedFromWins,
  type CalibrationEvaluator,
  type CalibrationReport,
} from './calibration-engine';
import { scoreModelDiagnostics } from './diagnostics';
import { initialRatings as marketInitialRatings } from './market';
import { toleranceForTarget } from './objective';
import { calibrationPayload } from './output';

export interface TeamCalibrationRow {
  id: string;
  name: string;
  color: string;
  crestUrl: string;
  market: number;
  target: number;
  simulated: number | null;
  error: number | null;
  tolerance: number | null;
  standardError: number | null;
  withinTolerance: boolean | null;
  rating: number;
}

export interface CalibrationProgress {
  phase: 'idle' | 'running' | 'final' | 'done' | 'error';
  iteration: number;
  iterations: number;
  done: number;
  total: number;
  mae: number | null;
  maxError: number | null;
  loss: number | null;
  rows: TeamCalibrationRow[];
  message: string;
}

type Listener = (progress: CalibrationProgress) => void;

function workerCount() {
  return Math.max(4, Math.min(12, navigator.hardwareConcurrency || 4));
}

function mergeWins(into: RatingMap, from: RatingMap) {
  for (const id of Object.keys(from)) into[id] = (into[id] ?? 0) + from[id];
}

function rowsFrom(
  market: Record<string, number>,
  target: RatingMap,
  ratings: RatingMap,
  report: CalibrationReport | null,
  partialSimulated?: RatingMap,
): TeamCalibrationRow[] {
  return [...teams]
    .map(team => {
      const simulated = partialSimulated?.[team.id] ?? report?.simulated[team.id] ?? null;
      const diagnostic = report?.teamDiagnostics[team.id];
      const tolerance = diagnostic?.tolerance ?? toleranceForTarget(target[team.id]);
      const error = simulated === null ? null : simulated - target[team.id];
      const withinTolerance =
        error === null ? diagnostic?.withinTolerance ?? null : Math.abs(error) <= tolerance;
      return {
        id: team.id,
        name: team.name,
        color: team.color,
        crestUrl: team.crestUrl ?? '',
        market: market[team.id] ?? 0,
        target: target[team.id],
        simulated,
        error,
        tolerance,
        standardError: diagnostic?.standardError ?? null,
        withinTolerance,
        rating: ratings[team.id] ?? 0,
      };
    })
    .sort((a, b) => b.target - a.target);
}

async function runSeasonBank(
  ratings: RatingMap,
  seasons: number,
  seeds: number[],
  seasonOffset: number,
  onProgress: (done: number, wins: RatingMap) => void,
  signal?: AbortSignal,
): Promise<RatingMap> {
  const workers = Math.max(seeds.length, workerCount());
  const reportEvery = Math.max(16, Math.floor(seasons / workers / 25));
  const seedTotals = seeds.map((_, seedIndex) =>
    Math.floor(seasons / seeds.length) + (seedIndex < seasons % seeds.length ? 1 : 0),
  );
  const assignments = Array.from({ length: workers }, (_, workerId) => {
    const seedIndex = workerId % seeds.length;
    const peers = Array.from({ length: workers }, (_unused, index) => index).filter(
      index => index % seeds.length === seedIndex,
    );
    const rank = peers.indexOf(workerId);
    const base = Math.floor(seedTotals[seedIndex] / peers.length);
    const remainder = seedTotals[seedIndex] % peers.length;
    return {
      seed: seeds[seedIndex],
      count: base + (rank < remainder ? 1 : 0),
      offset: seasonOffset + rank * base + Math.min(rank, remainder),
    };
  });
  const totals = assignments.map(assignment => assignment.count);
  const pool = totals.map(
    () => new Worker(new URL('./calibration-batch-worker.ts', import.meta.url), { type: 'module' }),
  );
  const partials: RatingMap[] = totals.map(() => Object.fromEntries(teams.map(team => [team.id, 0])));
  let lastEmit = 0;
  const stop = () => pool.forEach(worker => worker.terminate());
  if (signal?.aborted) {
    stop();
    throw new DOMException('Aborted', 'AbortError');
  }
  const onAbort = () => stop();
  signal?.addEventListener('abort', onAbort, { once: true });

  const emitMerged = (force = false) => {
    const now = performance.now();
    if (!force && now - lastEmit < 80) return;
    lastEmit = now;
    const merged: RatingMap = Object.fromEntries(teams.map(team => [team.id, 0]));
    for (const partial of partials) mergeWins(merged, partial);
    const done = Object.values(merged).reduce((sum, value) => sum + value, 0);
    onProgress(Math.min(done, seasons), merged);
  };

  try {
    await Promise.all(
      pool.map(
        (worker, workerId) =>
          new Promise<void>((resolve, reject) => {
            const count = totals[workerId];
            if (count === 0) return resolve();
            worker.onmessage = ({ data }) => {
              if (data.type === 'progress') {
                partials[workerId] = data.wins;
                emitMerged(false);
              }
              if (data.type === 'done') {
                partials[workerId] = data.wins;
                emitMerged(true);
                resolve();
              }
            };
            worker.onerror = event => reject(event.error ?? new Error(event.message));
            worker.postMessage({
              type: 'batch',
              workerId,
              ratings,
              seasons: count,
              seed: assignments[workerId].seed >>> 0,
              seasonOffset: assignments[workerId].offset,
              reportEvery,
            });
          }),
      ),
    );
    emitMerged(true);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    stop();
  }
  const wins: RatingMap = Object.fromEntries(teams.map(team => [team.id, 0]));
  for (const partial of partials) mergeWins(wins, partial);
  return wins;
}

function createBrowserEvaluator(target: RatingMap): CalibrationEvaluator {
  const fixtures = createDoubleRoundRobin(teams.map(team => team.id));
  const model = new IndependentPoissonModel();
  return async request => {
    const seeds = request.seeds.length ? request.seeds : [1];
    const totalWins = await runSeasonBank(
      request.ratings,
      request.seasons,
      seeds,
      request.seasonOffset ?? 0,
      (done, wins) => request.onProgress?.({
        done,
        total: request.seasons,
        wins,
        partialSimulated: simulatedFromWins(teams, wins, done),
      }),
      request.signal,
    );
    return reportFromState(
      teams,
      request.ratings,
      target,
      totalWins,
      request.seasons,
      scoreModelDiagnostics(teams, fixtures, request.ratings, model),
      seeds,
    );
  };
}

export async function runBrowserCalibration(options: {
  market: Record<string, number>;
  target: RatingMap;
  initialRatings?: RatingMap;
  iterations?: number;
  seasons?: number;
  coarseSeasons?: number;
  jacobianSeasons?: number;
  headSeasons?: number;
  finalSeasons?: number;
  finalMaxSeasons?: number;
  seed?: number;
  untilTeamsWithinTolerance?: boolean;
  signal?: AbortSignal;
  onProgress: Listener;
}) {
  const iterations = options.iterations ?? 6;
  const seasons = options.seasons ?? 30_000;
  const coarseSeasons = options.coarseSeasons ?? 10_000;
  const jacobianSeasons = options.jacobianSeasons ?? 10_000;
  const headSeasons = options.headSeasons ?? 100_000;
  const finalSeasons = options.finalSeasons ?? 200_000;
  const finalMaxSeasons = options.finalMaxSeasons ?? 300_000;
  const seed = options.seed ?? 20260722;
  const untilClean = options.untilTeamsWithinTolerance ?? true;
  const scaleSteps = 20;
  const totalSteps = untilClean ? Number.POSITIVE_INFINITY : scaleSteps + iterations + 2;
  let step = 0;
  let ratings = options.initialRatings ?? marketInitialRatings(options.target);
  let latest: CalibrationReport | null = null;
  let message = '준비 중';

  const emit = (
    phase: CalibrationProgress['phase'],
    patch: Partial<CalibrationProgress> = {},
    partialSimulated?: RatingMap,
  ) => {
    options.onProgress({
      phase,
      iteration: patch.iteration ?? step,
      iterations: Number.isFinite(totalSteps) ? totalSteps : Math.max(step + 4, scaleSteps + iterations + 2),
      done: patch.done ?? 0,
      total: patch.total ?? 0,
      mae: patch.mae ?? latest?.mae ?? null,
      maxError: patch.maxError ?? latest?.maxError ?? null,
      loss: patch.loss ?? latest?.loss ?? null,
      rows: patch.rows ?? rowsFrom(options.market, options.target, ratings, latest, partialSimulated),
      message: patch.message ?? message,
    });
  };
  emit('running');

  const report = await calibrateRatings(
    teams,
    createDoubleRoundRobin(teams.map(team => team.id)),
    options.target,
    ratings,
    new IndependentPoissonModel(),
    {
      iterations,
      seasons,
      coarseSeasons,
      jacobianSeasons,
      headSeasons,
      finalSeasons,
      finalMaxSeasons,
      seed,
      startMode: 'hybrid',
      untilTeamsWithinTolerance: untilClean,
      evaluator: createBrowserEvaluator(options.target),
      signal: options.signal,
      onPhase: (phase, detail) => {
        message = detail;
        if (phase === 'scale') step = Math.min(scaleSteps, step + 1);
        if (phase === 'refine') step += 1;
        if (phase === 'final') step += 1;
        emit(phase === 'final' ? 'final' : 'running', { message: detail, iteration: step });
      },
      onRatings: next => {
        ratings = next;
      },
      onIteration: (iteration, evaluated) => {
        latest = evaluated;
        ratings = evaluated.ratings;
        step = Math.max(step, scaleSteps + iteration);
        const outside = Object.values(evaluated.teamDiagnostics).filter(value => !value.withinTolerance).length;
        emit('running', {
          iteration: step,
          done: evaluated.seasonsUsed,
          total: evaluated.seasonsUsed,
          mae: evaluated.mae,
          maxError: evaluated.maxError,
          loss: evaluated.loss,
          rows: rowsFrom(options.market, options.target, evaluated.ratings, evaluated),
          message: evaluated.stepAccepted === undefined
            ? message
            : `LM ${evaluated.stepAccepted ? 'accept' : 'reject'} · 밖 ${outside}팀 · loss ${evaluated.loss.toFixed(3)}`,
        });
      },
      onSeasonProgress: (_iteration, info) => {
        emit(message.includes('independent') || message.includes('confidence') ? 'final' : 'running', {
          done: info.done,
          total: info.total,
          iteration: step,
        }, info.partialSimulated);
      },
    },
  );

  latest = report;
  ratings = report.ratings;
  const payload = calibrationPayload(report, options.market, options.target, {
    randomSeed: seed,
    startMode: 'hybrid',
    iterations,
    coarseSeasons,
    normalSeasons: seasons,
    jacobianSeasons,
    headSeasons,
    finalSeasons,
    finalMaxSeasons,
    untilTeamsWithinTolerance: untilClean,
    trainingSeedBank: [1, 2, 3, 4, 5].map(value => seed + 1_000 + value),
    validationSeedBank: [1, 2, 3, 4, 5].map(value => seed + 9_000 + value),
  });
  emit('done', {
    iteration: step,
    done: report.seasonsUsed,
    total: report.seasonsUsed,
    rows: rowsFrom(options.market, options.target, report.ratings, report),
    mae: report.mae,
    maxError: report.maxError,
    loss: report.loss,
    message: report.converged || Object.values(report.teamDiagnostics).every(value => value.withinTolerance)
      ? '보정 완료 · 전 팀 허용오차 내'
      : `검증 완료 · 허용오차 밖 ${Object.values(report.teamDiagnostics).filter(value => !value.withinTolerance).length}팀`,
  });
  return payload;
}
