import type { RatingMap } from '../domain/types';
import type { CalibrationReport } from './calibration-engine';

export function calibrationPayload(
  report: CalibrationReport,
  marketSnapshot: Record<string, number>,
  normalizedTargets: RatingMap,
  configuration: Record<string, unknown>,
) {
  return {
    schemaVersion: 2,
    calibrationMode: 'static-baseline',
    marketSnapshot,
    normalizedTargets,
    simulatedProbability: report.simulated,
    probabilityError: report.errors,
    probabilityTolerance: report.tolerances,
    normalizedResidual: report.normalizedResiduals,
    standardError: report.standardErrors,
    confidenceInterval95: report.confidenceIntervals95,
    teamDiagnostics: report.teamDiagnostics,
    headDiagnostics: report.head,
    scoreModelDiagnostics: report.scoreModel,
    ratings: report.ratings,
    evaluatedRatings: report.evaluatedRatings,
    bestRatings: report.bestRatings ?? report.ratings,
    numberOfCalibrationSeasons: report.seasonsUsed,
    validationSeedBank: report.seedBank,
    converged: report.converged,
    teamsOutsideTolerance: Object.entries(report.teamDiagnostics)
      .filter(([, value]) => !value.withinTolerance)
      .map(([id]) => id),
    loss: report.loss,
    teamLoss: report.teamLoss,
    headMassLoss: report.headMassLoss,
    headSplitLoss: report.headSplitLoss,
    mae: report.mae,
    maxError: report.maxError,
    weightedMae: report.weightedMae,
    bestValidationLoss: report.bestValidationLoss,
    optimizerDiagnostics: report.optimizer,
    configuration,
    method:
      'static CRN Monte Carlo + tolerance-normalized Huber objective + LM/Broyden + market-leading-pair mass-split polish',
    createdAt: new Date().toISOString(),
  };
}
