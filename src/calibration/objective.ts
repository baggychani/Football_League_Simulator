import type { RatingMap, Team } from '../domain/types';

export interface ProbabilityInterval {
  low: number;
  high: number;
}

export interface TeamCalibrationDiagnostic {
  target: number;
  simulated: number;
  residual: number;
  tolerance: number;
  normalizedResidual: number;
  standardError: number;
  confidenceInterval95: ProbabilityInterval;
  withinTolerance: boolean;
}

export interface HeadCalibrationDiagnostic {
  teamIds: [string, string];
  targetMass: number;
  simulatedMass: number;
  massResidual: number;
  massTolerance: number;
  massStandardError: number;
  targetConditionalShare: number;
  simulatedConditionalShare: number;
  targetLogSplit: number;
  simulatedLogSplit: number;
  splitResidual: number;
  splitTolerance: number;
  splitStandardError: number;
  massWithinTolerance: boolean;
  splitWithinTolerance: boolean;
}

export interface CalibrationObjective {
  loss: number;
  teamLoss: number;
  headMassLoss: number;
  headSplitLoss: number;
  diagnostics: Record<string, TeamCalibrationDiagnostic>;
  head: HeadCalibrationDiagnostic;
  converged: boolean;
}

export const objectiveParameters = {
  huberDelta: 1.5,
  headMassTolerance: 0.004,
  headSplitTolerance: 0.025,
  headMassWeight: 1,
  headSplitWeight: 1,
};

export function toleranceForTarget(target: number): number {
  if (target >= 0.2) return 0.003;
  if (target >= 0.05) return 0.005;
  if (target >= 0.01) return Math.max(0.12 * target, 0.001);
  return Math.max(0.25 * target, 0.00025);
}

export function huber(value: number, delta = objectiveParameters.huberDelta): number {
  const absolute = Math.abs(value);
  return absolute <= delta ? 0.5 * value * value : delta * (absolute - 0.5 * delta);
}

export function calibrationHeadIds(teams: Team[], target: RatingMap): [string, string] {
  const ordered = [...teams].sort((a, b) => target[b.id] - target[a.id] || a.id.localeCompare(b.id));
  if (ordered.length < 2) throw new Error('Calibration requires at least two teams.');
  return [ordered[0].id, ordered[1].id];
}

export function calibrationObjective(
  teams: Team[],
  target: RatingMap,
  simulated: RatingMap,
  seasons: number,
): CalibrationObjective {
  const diagnostics: Record<string, TeamCalibrationDiagnostic> = {};
  let teamLoss = 0;
  for (const team of teams) {
    const tgt = target[team.id];
    const sim = simulated[team.id];
    const tolerance = toleranceForTarget(tgt);
    const residual = sim - tgt;
    const standardError = Math.sqrt(Math.max(sim * (1 - sim), 0) / Math.max(1, seasons));
    const radius = 1.96 * standardError;
    const normalizedResidual = residual / tolerance;
    diagnostics[team.id] = {
      target: tgt,
      simulated: sim,
      residual,
      tolerance,
      normalizedResidual,
      standardError,
      confidenceInterval95: {
        low: Math.max(0, sim - radius),
        high: Math.min(1, sim + radius),
      },
      withinTolerance: Math.abs(residual) <= tolerance,
    };
    teamLoss += huber(normalizedResidual);
  }
  teamLoss /= teams.length;

  const teamIds = calibrationHeadIds(teams, target);
  const [first, second] = teamIds;
  const targetMass = target[first] + target[second];
  const simulatedMass = simulated[first] + simulated[second];
  const massResidual = simulatedMass - targetMass;
  const targetLogSplit = Math.log(Math.max(target[first], 1e-12) / Math.max(target[second], 1e-12));
  const simulatedLogSplit = Math.log(
    Math.max(simulated[first], 1e-12) / Math.max(simulated[second], 1e-12),
  );
  const splitResidual = simulatedLogSplit - targetLogSplit;
  const massStandardError = Math.sqrt(
    Math.max(simulatedMass * (1 - simulatedMass), 0) / Math.max(1, seasons),
  );
  const splitStandardError = Math.sqrt(
    (1 / Math.max(simulated[first], 1 / Math.max(1, seasons)) +
      1 / Math.max(simulated[second], 1 / Math.max(1, seasons))) /
      Math.max(1, seasons),
  );
  const head: HeadCalibrationDiagnostic = {
    teamIds,
    targetMass,
    simulatedMass,
    massResidual,
    massTolerance: objectiveParameters.headMassTolerance,
    massStandardError,
    targetConditionalShare: target[first] / Math.max(targetMass, 1e-12),
    simulatedConditionalShare: simulated[first] / Math.max(simulatedMass, 1e-12),
    targetLogSplit,
    simulatedLogSplit,
    splitResidual,
    splitTolerance: objectiveParameters.headSplitTolerance,
    splitStandardError,
    massWithinTolerance: Math.abs(massResidual) <= objectiveParameters.headMassTolerance,
    splitWithinTolerance: Math.abs(splitResidual) <= objectiveParameters.headSplitTolerance,
  };
  const headMassLoss =
    objectiveParameters.headMassWeight *
    (massResidual / objectiveParameters.headMassTolerance) ** 2;
  const headSplitLoss =
    objectiveParameters.headSplitWeight *
    (splitResidual / objectiveParameters.headSplitTolerance) ** 2;
  const converged =
    Object.values(diagnostics).every(value => value.withinTolerance) &&
    head.massWithinTolerance &&
    head.splitWithinTolerance;
  return {
    loss: teamLoss + headMassLoss + headSplitLoss,
    teamLoss,
    headMassLoss,
    headSplitLoss,
    diagnostics,
    head,
    converged,
  };
}

/** Fixed-length residual vector used by Gauss-Newton/LM. */
export function objectiveResidualVector(
  teams: Team[],
  target: RatingMap,
  simulated: RatingMap,
): number[] {
  const teamResiduals = teams.map(
    team => (simulated[team.id] - target[team.id]) / toleranceForTarget(target[team.id]),
  );
  const [first, second] = calibrationHeadIds(teams, target);
  const massResidual =
    (simulated[first] + simulated[second] - target[first] - target[second]) /
    objectiveParameters.headMassTolerance;
  const splitResidual =
    (Math.log(Math.max(simulated[first], 1e-12) / Math.max(simulated[second], 1e-12)) -
      Math.log(Math.max(target[first], 1e-12) / Math.max(target[second], 1e-12))) /
    objectiveParameters.headSplitTolerance;
  return [
    ...teamResiduals,
    Math.sqrt(objectiveParameters.headMassWeight) * massResidual,
    Math.sqrt(objectiveParameters.headSplitWeight) * splitResidual,
  ];
}

export function validationIsAmbiguous(objective: CalibrationObjective): boolean {
  const teamBoundaryIsAmbiguous = Object.values(objective.diagnostics).some(value =>
    Math.abs(Math.abs(value.residual) - value.tolerance) <= 1.96 * value.standardError,
  );
  const massBoundaryIsAmbiguous =
    Math.abs(Math.abs(objective.head.massResidual) - objective.head.massTolerance) <=
    1.96 * objective.head.massStandardError;
  const splitBoundaryIsAmbiguous =
    Math.abs(Math.abs(objective.head.splitResidual) - objective.head.splitTolerance) <=
    1.96 * objective.head.splitStandardError;
  return teamBoundaryIsAmbiguous || massBoundaryIsAmbiguous || splitBoundaryIsAmbiguous;
}
