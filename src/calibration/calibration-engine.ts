import type { Fixture, RatingMap, Team } from '../domain/types';
import { createStaticChampionSimulator } from '../simulation/season-simulator';
import type { ScoreModel } from '../simulation/score-model';
import { scoreModelDiagnostics, type ScoreModelDiagnostics } from './diagnostics';
import { broydenUpdate, clampStep, regularizedLeastSquaresStep } from './linear-algebra';
import { ratingsFromLogMarket } from './market';
import {
  calibrationObjective,
  objectiveParameters,
  objectiveResidualVector,
  toleranceForTarget,
  validationIsAmbiguous,
  type HeadCalibrationDiagnostic,
  type ProbabilityInterval,
  type TeamCalibrationDiagnostic,
} from './objective';
import {
  applyHeadShift,
  applyZeroSumBasisStep,
  basisStepBetween,
  clampZeroSumBasisStep,
  projectMarketOrder,
} from './parameterization';

export interface CalibrationReport {
  /** The exact candidate represented by simulated/errors/diagnostics. */
  ratings: RatingMap;
  evaluatedRatings: RatingMap;
  proposedRatings?: RatingMap;
  bestRatings?: RatingMap;
  stepAccepted?: boolean;
  simulated: RatingMap;
  errors: RatingMap;
  tolerances: RatingMap;
  normalizedResiduals: RatingMap;
  standardErrors: RatingMap;
  confidenceIntervals95: Record<string, ProbabilityInterval>;
  teamDiagnostics: Record<string, TeamCalibrationDiagnostic>;
  head: HeadCalibrationDiagnostic;
  scoreModel?: ScoreModelDiagnostics;
  championCounts: RatingMap;
  loss: number;
  teamLoss: number;
  headMassLoss: number;
  headSplitLoss: number;
  mae: number;
  maxError: number;
  weightedMae: number;
  seasonsUsed: number;
  seedBank: number[];
  converged: boolean;
  bestValidationLoss?: number;
  optimizer?: OptimizerDiagnostics;
}

export interface OptimizerDiagnostics {
  acceptedSteps: number;
  rejectedSteps: number;
  jacobianRefreshes: number;
  broydenUpdates: number;
  lastConditionEstimate: number | null;
  titleProbabilitySensitivity: RatingMap;
}

export interface SeasonProgressInfo {
  done: number;
  total: number;
  wins: RatingMap;
  partialSimulated: RatingMap;
}

export type SeasonProgress = (info: SeasonProgressInfo) => void;

export interface EvaluationRequest {
  ratings: RatingMap;
  seasons: number;
  seeds: number[];
  seasonOffset?: number;
  onProgress?: SeasonProgress;
  signal?: AbortSignal;
}

export type CalibrationEvaluator = (request: EvaluationRequest) => Promise<CalibrationReport>;

export interface CalibrationOptions {
  iterations: number;
  /** Normal refinement/validation fidelity. */
  seasons: number;
  seed: number;
  coarseSeasons?: number;
  jacobianSeasons?: number;
  headSeasons?: number;
  finalSeasons?: number;
  finalMaxSeasons?: number;
  finalBatchSeasons?: number;
  trainingSeeds?: number[];
  validationSeeds?: number[];
  startMode?: 'cold' | 'warm' | 'hybrid';
  /**
   * Keep retrying with new seed banks until every team is within tolerance.
   * Abort via signal. Default false (one-shot).
   */
  untilTeamsWithinTolerance?: boolean;
  jacobianRefresh?: number;
  finiteDifference?: number;
  trustRegion?: number;
  damping?: number;
  headIterations?: number;
  headTrustRegion?: number;
  evaluator?: CalibrationEvaluator;
  signal?: AbortSignal;
  onRatings?: (ratings: RatingMap) => void;
  onIteration?: (iteration: number, report: CalibrationReport) => void;
  onSeasonProgress?: (iteration: number, info: SeasonProgressInfo) => void;
  onPhase?: (phase: 'scale' | 'refine' | 'head' | 'final', detail: string) => void;
}

function emptyWins(teams: Team[]): RatingMap {
  return Object.fromEntries(teams.map(team => [team.id, 0]));
}

function addWins(into: RatingMap, from: RatingMap) {
  for (const [id, wins] of Object.entries(from)) into[id] = (into[id] ?? 0) + wins;
}

export function simulatedFromWins(teams: Team[], wins: RatingMap, seasons: number): RatingMap {
  const alpha = 0.5;
  const denominator = Math.max(1, seasons) + alpha * teams.length;
  return Object.fromEntries(teams.map(team => [team.id, ((wins[team.id] ?? 0) + alpha) / denominator]));
}

export function weightedAbsoluteError(teams: Team[], target: RatingMap, simulated: RatingMap) {
  let numerator = 0;
  let denominator = 0;
  for (const team of teams) {
    const weight = Math.max(target[team.id], 1e-8);
    numerator += weight * Math.abs(simulated[team.id] - target[team.id]);
    denominator += weight;
  }
  return numerator / denominator;
}

export function reportFromState(
  teams: Team[],
  ratings: RatingMap,
  target: RatingMap,
  wins: RatingMap,
  seasons: number,
  scoreDiagnostics?: ScoreModelDiagnostics,
  seedBank: number[] = [],
): CalibrationReport {
  const simulated = simulatedFromWins(teams, wins, seasons);
  const objective = calibrationObjective(teams, target, simulated, seasons);
  const errors = Object.fromEntries(teams.map(team => [team.id, simulated[team.id] - target[team.id]]));
  const errorList = Object.values(errors);
  return {
    ratings: { ...ratings },
    evaluatedRatings: { ...ratings },
    simulated,
    errors,
    tolerances: Object.fromEntries(teams.map(team => [team.id, toleranceForTarget(target[team.id])])),
    normalizedResiduals: Object.fromEntries(
      teams.map(team => [team.id, objective.diagnostics[team.id].normalizedResidual]),
    ),
    standardErrors: Object.fromEntries(
      teams.map(team => [team.id, objective.diagnostics[team.id].standardError]),
    ),
    confidenceIntervals95: Object.fromEntries(
      teams.map(team => [team.id, objective.diagnostics[team.id].confidenceInterval95]),
    ),
    teamDiagnostics: objective.diagnostics,
    head: objective.head,
    scoreModel: scoreDiagnostics,
    championCounts: { ...wins },
    loss: objective.loss,
    teamLoss: objective.teamLoss,
    headMassLoss: objective.headMassLoss,
    headSplitLoss: objective.headSplitLoss,
    mae: errorList.reduce((sum, error) => sum + Math.abs(error), 0) / teams.length,
    maxError: Math.max(...errorList.map(Math.abs)),
    weightedMae: weightedAbsoluteError(teams, target, simulated),
    seasonsUsed: seasons,
    seedBank: [...seedBank],
    converged: objective.converged,
  };
}

function allocateSeasons(total: number, count: number, index: number): number {
  const base = Math.floor(total / count);
  return base + (index < total % count ? 1 : 0);
}

export function createCalibrationEvaluator(
  teams: Team[],
  fixtures: Fixture[],
  target: RatingMap,
  model: ScoreModel,
): CalibrationEvaluator {
  const simulateChampion = createStaticChampionSimulator(teams, fixtures, model);
  return async request => {
    const wins = emptyWins(teams);
    const seeds = request.seeds.length ? request.seeds : [1];
    let done = 0;
    const tick = Math.max(1, Math.min(2_000, Math.floor(request.seasons / 100)));
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
      const count = allocateSeasons(request.seasons, seeds.length, seedIndex);
      for (let localSeason = 0; localSeason < count; localSeason++) {
        if ((done & 255) === 0 && request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const seasonIndex = (request.seasonOffset ?? 0) + localSeason;
        wins[simulateChampion(request.ratings, seeds[seedIndex], seasonIndex)]++;
        done++;
        if (request.onProgress && (done % tick === 0 || done === request.seasons)) {
          request.onProgress({
            done,
            total: request.seasons,
            wins: { ...wins },
            partialSimulated: simulatedFromWins(teams, wins, done),
          });
        }
      }
    }
    return reportFromState(
      teams,
      request.ratings,
      target,
      wins,
      request.seasons,
      scoreModelDiagnostics(teams, fixtures, request.ratings, model),
      seeds,
    );
  };
}

/** Single-seed compatibility measurement, now using addressable CRN. */
export async function measureCalibration(
  teams: Team[],
  fixtures: Fixture[],
  ratings: RatingMap,
  target: RatingMap,
  seasons: number,
  seed: number,
  model: ScoreModel,
  onSeasonProgress?: SeasonProgress,
): Promise<CalibrationReport> {
  return createCalibrationEvaluator(teams, fixtures, target, model)({
    ratings,
    seasons,
    seeds: [seed],
    onProgress: onSeasonProgress,
  });
}

export function teamsOutsideTolerance(teams: Team[], report: CalibrationReport) {
  return teams.filter(team => !report.teamDiagnostics[team.id].withinTolerance);
}

function linspace(min: number, max: number, count: number) {
  if (count <= 1) return [min];
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function defaultSeeds(base: number, offset: number) {
  return [1, 2, 3, 4, 5].map(value => (base + offset + value) >>> 0);
}

function teamsAreWithinTolerance(report: CalibrationReport) {
  return Object.values(report.teamDiagnostics).every(value => value.withinTolerance);
}

function outsideToleranceCount(report: CalibrationReport) {
  return Object.values(report.teamDiagnostics).filter(value => !value.withinTolerance).length;
}

/** Deterministic tiny kick so retries are not identical CRN traps. */
function perturbRatings(ids: string[], ratings: RatingMap, attempt: number, target: RatingMap): RatingMap {
  const next = { ...ratings };
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    const wave = Math.sin((attempt * 12.9898 + index * 78.233) * 43758.5453);
    const fraction = wave - Math.floor(wave);
    next[id] += (fraction - 0.5) * 0.012 * Math.min(attempt, 8);
  }
  return projectMarketOrder(next, target);
}

function ratingKey(ids: string[], ratings: RatingMap) {
  return ids.map(id => ratings[id].toFixed(10)).join('|');
}

function headResidual(report: CalibrationReport): number[] {
  return [
    report.head.massResidual / report.head.massTolerance,
    report.head.splitResidual / report.head.splitTolerance,
  ];
}

function headResidualLoss(report: CalibrationReport): number {
  const residual = headResidual(report);
  return residual[0] ** 2 + residual[1] ** 2;
}

async function estimateJacobian(
  evaluator: CalibrationEvaluator,
  teams: Team[],
  target: RatingMap,
  ratings: RatingMap,
  seasons: number,
  seeds: number[],
  delta: number,
  signal?: AbortSignal,
  onColumn?: (done: number, total: number) => void,
): Promise<{ jacobian: number[][]; sensitivity: RatingMap }> {
  const ids = teams.map(team => team.id);
  const columns: number[][] = [];
  const sensitivity: RatingMap = Object.fromEntries(ids.map(id => [id, 0]));
  for (let column = 0; column < ids.length - 1; column++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const direction = Array(ids.length - 1).fill(0);
    direction[column] = delta;
    const plusRatings = applyZeroSumBasisStep(ids, ratings, direction);
    direction[column] = -delta;
    const minusRatings = applyZeroSumBasisStep(ids, ratings, direction);
    const [plus, minus] = await Promise.all([
      evaluator({ ratings: plusRatings, seasons, seeds, signal }),
      evaluator({ ratings: minusRatings, seasons, seeds, signal }),
    ]);
    const plusResidual = objectiveResidualVector(teams, target, plus.simulated);
    const minusResidual = objectiveResidualVector(teams, target, minus.simulated);
    columns.push(plusResidual.map((value, row) => (value - minusResidual[row]) / (2 * delta)));
    sensitivity[ids[column]] = (plus.simulated[ids[column]] - minus.simulated[ids[column]]) / (2 * delta);
    onColumn?.(column + 1, ids.length - 1);
  }
  const rows = columns[0]?.length ?? 0;
  return {
    jacobian: Array.from({ length: rows }, (_, row) => columns.map(column => column[row])),
    sensitivity,
  };
}

async function polishHead(
  teams: Team[],
  target: RatingMap,
  ratings: RatingMap,
  evaluator: CalibrationEvaluator,
  seasons: number,
  trainingSeeds: number[],
  options: CalibrationOptions,
  diagnostics: OptimizerDiagnostics,
): Promise<{ ratings: RatingMap; report: CalibrationReport }> {
  const ids = teams.map(team => team.id);
  const [first, second] =
    target.arsenal !== undefined && target['man-city'] !== undefined
      ? ['arsenal', 'man-city']
      : [...ids].sort((a, b) => target[b] - target[a]).slice(0, 2);
  const delta = options.finiteDifference ?? 0.01;
  const trust = options.headTrustRegion ?? 0.04;
  let currentRatings = ratings;
  let current = await evaluator({ ratings, seasons, seeds: trainingSeeds, signal: options.signal });
  for (let iteration = 0; iteration < (options.headIterations ?? 2); iteration++) {
    options.onPhase?.('head', `Arsenal/City mass-split polish ${iteration + 1}`);
    const columns: number[][] = [];
    for (const [common, contrast] of [
      [delta, 0],
      [0, delta],
    ] as const) {
      const plusRatings = applyHeadShift(ids, currentRatings, first, second, common, contrast);
      const minusRatings = applyHeadShift(ids, currentRatings, first, second, -common, -contrast);
      const [plus, minus] = await Promise.all([
        evaluator({ ratings: plusRatings, seasons, seeds: trainingSeeds, signal: options.signal }),
        evaluator({ ratings: minusRatings, seasons, seeds: trainingSeeds, signal: options.signal }),
      ]);
      const plusResidual = headResidual(plus);
      const minusResidual = headResidual(minus);
      columns.push(plusResidual.map((value, row) => (value - minusResidual[row]) / (2 * delta)));
    }
    const jacobian = [
      [columns[0][0], columns[1][0]],
      [columns[0][1], columns[1][1]],
    ];
    const solved = regularizedLeastSquaresStep(jacobian, headResidual(current), options.damping ?? 0.2);
    if (!solved) break;
    const [common, contrast] = clampStep(solved.step, trust);
    const proposed = projectMarketOrder(
      applyHeadShift(ids, currentRatings, first, second, common, contrast),
      target,
    );
    const candidate = await evaluator({
      ratings: proposed,
      seasons,
      seeds: trainingSeeds,
      signal: options.signal,
    });
    const accepted =
      headResidualLoss(candidate) < headResidualLoss(current) && candidate.loss <= current.loss * 1.2;
    options.onIteration?.(options.iterations + iteration + 1, {
      ...current,
      proposedRatings: proposed,
      stepAccepted: accepted,
    });
    if (!accepted) {
      diagnostics.rejectedSteps++;
      break;
    }
    diagnostics.acceptedSteps++;
    currentRatings = proposed;
    current = candidate;
    options.onRatings?.(currentRatings);
  }
  return { ratings: currentRatings, report: current };
}

function mergeReports(
  teams: Team[],
  target: RatingMap,
  ratings: RatingMap,
  reports: CalibrationReport[],
): CalibrationReport {
  const wins = emptyWins(teams);
  let seasons = 0;
  const seeds = new Set<number>();
  for (const report of reports) {
    addWins(wins, report.championCounts);
    seasons += report.seasonsUsed;
    for (const seed of report.seedBank) seeds.add(seed);
  }
  return reportFromState(teams, ratings, target, wins, seasons, reports.at(-1)?.scoreModel, [...seeds]);
}

export async function calibrateRatings(
  teams: Team[],
  fixtures: Fixture[],
  target: RatingMap,
  initial: RatingMap,
  model: ScoreModel,
  options: CalibrationOptions,
): Promise<CalibrationReport> {
  const ids = teams.map(team => team.id);
  const normalSeasons = Math.max(1, Math.round(options.seasons));
  const coarseSeasons = Math.max(1, Math.round(options.coarseSeasons ?? Math.min(15_000, Math.max(5_000, normalSeasons / 3))));
  const jacobianSeasons = Math.max(1, Math.round(options.jacobianSeasons ?? coarseSeasons));
  const headSeasons = Math.max(
    1,
    Math.round(options.headSeasons ?? (normalSeasons >= 30_000 ? 100_000 : normalSeasons)),
  );
  const finalSeasons = Math.max(
    1,
    Math.round(options.finalSeasons ?? (normalSeasons >= 30_000 ? 200_000 : normalSeasons)),
  );
  const finalMaxSeasons = Math.max(
    finalSeasons,
    Math.round(options.finalMaxSeasons ?? (normalSeasons >= 30_000 ? 300_000 : finalSeasons)),
  );
  const finalBatchSeasons = Math.max(1, Math.round(options.finalBatchSeasons ?? 50_000));
  const startMode = options.startMode ?? 'hybrid';
  const evaluator = options.evaluator ?? createCalibrationEvaluator(teams, fixtures, target, model);
  const evaluate = (
    ratings: RatingMap,
    seasons: number,
    seeds: number[],
    iteration: number,
    progress = false,
    seasonOffset = 0,
  ) =>
    evaluator({
      ratings,
      seasons,
      seeds,
      seasonOffset,
      signal: options.signal,
      onProgress: progress ? info => options.onSeasonProgress?.(iteration, info) : undefined,
    });

  // Removing the old adjacent-gap compression changes the meaningful scale by
  // roughly an order of magnitude. Keep ratingEffect fixed and search ratings.
  const scaleGrid = [...linspace(0.025, 0.25, 12), ...linspace(0.05, 0.14, 7)];
  const startCandidates: { label: string; ratings: RatingMap }[] = [];
  if (startMode !== 'warm') {
    for (const scale of scaleGrid) {
      startCandidates.push({
        label: `market-scale ${scale.toFixed(3)}`,
        ratings: projectMarketOrder(ratingsFromLogMarket(target, scale), target),
      });
    }
  }
  if (startMode !== 'cold') {
    startCandidates.push({ label: 'warm initial ratings', ratings: projectMarketOrder(initial, target) });
  }
  const uniqueCandidates = [...new Map(startCandidates.map(item => [ratingKey(ids, item.ratings), item])).values()];
  options.onPhase?.('scale', `${startMode} start: ${uniqueCandidates.length} candidates, unified objective`);
  let selectedRatings = uniqueCandidates[0]?.ratings ?? projectMarketOrder(initial, target);
  let selectedCoarse: CalibrationReport | null = null;
  for (let index = 0; index < uniqueCandidates.length; index++) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const candidate = uniqueCandidates[index];
    options.onPhase?.('scale', `${candidate.label} (${index + 1}/${uniqueCandidates.length})`);
    const report = await evaluate(
      candidate.ratings,
      coarseSeasons,
      options.trainingSeeds ?? defaultSeeds(options.seed, 1_000),
      0,
      false,
    );
    options.onIteration?.(0, report);
    if (!selectedCoarse || report.loss < selectedCoarse.loss) {
      selectedCoarse = report;
      selectedRatings = candidate.ratings;
      options.onRatings?.(selectedRatings);
    }
  }

  let currentRatings = selectedRatings;
  // The last probed scale need not be the selected scale. Reset callback state
  // before streaming the selected candidate's normal-fidelity evaluation.
  options.onRatings?.(currentRatings);

  const untilClean = options.untilTeamsWithinTolerance === true;
  const maxIterations = Math.max(1, options.iterations);
  const refreshEvery = Math.max(1, options.jacobianRefresh ?? 3);
  const finiteDifference = options.finiteDifference ?? 0.01;
  const trustRegion = options.trustRegion ?? 0.05;
  const optimizer: OptimizerDiagnostics = {
    acceptedSteps: 0,
    rejectedSteps: 0,
    jacobianRefreshes: 0,
    broydenUpdates: 0,
    lastConditionEstimate: null,
    titleProbabilitySensitivity: Object.fromEntries(ids.map(id => [id, 0])),
  };

  let bestRatings = currentRatings;
  let bestValidation!: CalibrationReport;
  let finalReport!: CalibrationReport;
  let attempt = 0;

  while (true) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    attempt += 1;
    const seedBump = (attempt - 1) * 97;
    const cycleTrainingSeeds = options.trainingSeeds ?? defaultSeeds(options.seed + seedBump, 1_000);
    const cycleValidationSeeds = options.validationSeeds ?? defaultSeeds(options.seed + seedBump, 9_000);

    if (attempt > 1) {
      currentRatings = perturbRatings(ids, bestRatings, attempt, target);
      options.onRatings?.(currentRatings);
      options.onPhase?.(
        'refine',
        `재시도 ${attempt} · 시드 변경 · 허용오차 밖 ${outsideToleranceCount(finalReport)}팀 클리어까지`,
      );
    }

    let current = await evaluate(currentRatings, normalSeasons, cycleTrainingSeeds, attempt, true);
    let validation = await evaluate(currentRatings, normalSeasons, cycleValidationSeeds, attempt, false);
    if (attempt === 1 || validation.loss < bestValidation.loss) {
      bestValidation = validation;
      bestRatings = currentRatings;
    }

    let jacobian: number[][] | null = null;
    let damping = options.damping ?? 0.35;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!jacobian || iteration % refreshEvery === 0) {
        options.onPhase?.(
          'refine',
          `시도 ${attempt} · Jacobian ${iteration + 1}: ${ids.length - 1} central differences`,
        );
        const estimated = await estimateJacobian(
          evaluator,
          teams,
          target,
          currentRatings,
          jacobianSeasons,
          cycleTrainingSeeds,
          finiteDifference,
          options.signal,
          (done, total) => options.onPhase?.('refine', `시도 ${attempt} · Jacobian ${done}/${total}`),
        );
        jacobian = estimated.jacobian;
        optimizer.titleProbabilitySensitivity = estimated.sensitivity;
        optimizer.jacobianRefreshes++;
      }

      const baseResidual = objectiveResidualVector(teams, target, current.simulated);
      const solved = regularizedLeastSquaresStep(jacobian, baseResidual, damping);
      if (!solved) {
        damping *= 10;
        optimizer.rejectedSteps++;
        jacobian = null;
        continue;
      }
      optimizer.lastConditionEstimate = solved.conditionEstimate;
      const step = clampZeroSumBasisStep(clampStep(solved.step, trustRegion), trustRegion);
      const proposedRatings = projectMarketOrder(applyZeroSumBasisStep(ids, currentRatings, step), target);
      const candidate = await evaluate(proposedRatings, normalSeasons, cycleTrainingSeeds, iteration + 1, true);
      const accepted = candidate.loss < current.loss;
      options.onIteration?.(iteration + 1, {
        ...current,
        proposedRatings,
        stepAccepted: accepted,
        optimizer: { ...optimizer },
      });
      if (!accepted) {
        optimizer.rejectedSteps++;
        damping *= 4;
        if (iteration % refreshEvery === refreshEvery - 1) jacobian = null;
        continue;
      }

      const oldResidual = baseResidual;
      const oldRatings = currentRatings;
      currentRatings = proposedRatings;
      current = candidate;
      optimizer.acceptedSteps++;
      damping = Math.max(1e-4, damping * 0.55);
      const newResidual = objectiveResidualVector(teams, target, current.simulated);
      jacobian = broydenUpdate(
        jacobian,
        basisStepBetween(ids, oldRatings, currentRatings),
        newResidual.map((value, index) => value - oldResidual[index]),
      );
      optimizer.broydenUpdates++;
      options.onRatings?.(currentRatings);
      validation = await evaluate(currentRatings, normalSeasons, cycleValidationSeeds, iteration + 1, false);
      if (validation.loss < bestValidation.loss) {
        bestValidation = validation;
        bestRatings = currentRatings;
      }
      if (teamsAreWithinTolerance(validation) && iteration >= 1) break;
    }

    options.onPhase?.('head', `시도 ${attempt} · head polish: ${headSeasons.toLocaleString()} seasons`);
    const polished = await polishHead(
      teams,
      target,
      bestRatings,
      evaluator,
      headSeasons,
      cycleTrainingSeeds,
      options,
      optimizer,
    );
    const polishedValidation = await evaluate(
      polished.ratings,
      normalSeasons,
      cycleValidationSeeds,
      maxIterations + 1,
      false,
    );
    if (polishedValidation.loss < bestValidation.loss) {
      bestValidation = polishedValidation;
      bestRatings = polished.ratings;
    }

    options.onRatings?.(bestRatings);
    options.onPhase?.(
      'final',
      `시도 ${attempt} · independent validation: ${finalSeasons.toLocaleString()} seasons`,
    );
    const finalReports: CalibrationReport[] = [
      await evaluate(bestRatings, finalSeasons, cycleValidationSeeds, 0, true),
    ];
    finalReport = finalReports[0];
    while (
      finalReport.seasonsUsed < finalMaxSeasons &&
      validationIsAmbiguous(
        calibrationObjective(teams, target, finalReport.simulated, finalReport.seasonsUsed),
      )
    ) {
      const batch = Math.min(finalBatchSeasons, finalMaxSeasons - finalReport.seasonsUsed);
      options.onPhase?.(
        'final',
        `시도 ${attempt} · confidence boundary ambiguous; adding ${batch.toLocaleString()} seasons`,
      );
      finalReports.push(
        await evaluate(
          bestRatings,
          batch,
          cycleValidationSeeds,
          0,
          true,
          Math.ceil(finalReport.seasonsUsed / cycleValidationSeeds.length),
        ),
      );
      finalReport = mergeReports(teams, target, bestRatings, finalReports);
    }

    if (teamsAreWithinTolerance(finalReport) || !untilClean) break;

    options.onPhase?.(
      'refine',
      `최종 검증 허용오차 밖 ${outsideToleranceCount(finalReport)}팀 · 재시도 계속`,
    );
  }

  return {
    ...finalReport,
    ratings: { ...bestRatings },
    evaluatedRatings: { ...bestRatings },
    bestRatings: { ...bestRatings },
    bestValidationLoss: bestValidation.loss,
    optimizer,
  };
}

export { objectiveParameters, toleranceForTarget } from './objective';
export { projectMarketOrder } from './parameterization';
