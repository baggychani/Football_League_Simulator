import type { OutcomeProbabilities, ScoreDistribution } from './score-model';
import { logFactorial, poissonLogProbability, SCORE_TAIL_TOLERANCE } from './score-model';

const LN_10 = Math.log(10);
const LN_2 = Math.log(2);
const MIN_POSITIVE_PROBABILITY = Number.MIN_VALUE;

export interface ExactScoreAssessment {
  exactScoreLogProbability: number;
  exactScoreProbability: number;
  exactScoreSurprisal: number;
  totalGoalsLogProbability: number;
  conditionalAllocationLogProbability: number;
}

export interface UpsetAssessment extends ExactScoreAssessment {
  isUpset: true;
  winnerSide: 'home' | 'away';
  loserSide: 'home' | 'away';
  winnerProbability: number;
  loserProbability: number;
  drawProbability: number;
  decisiveWinnerShare: number;
  winOddsRatio: number;
  gapBits: number;
  lambdaWinner: number;
  lambdaLoser: number;
  expectedGoalShare: number;
  observedGoalShare: number;
  likelihoodRatioDeviance: number;
  conditionalAllocationTailLogProbability: number;
  conditionalAllocationTailProbability: number;
  conditionalAllocationSurprisal: number;
  upsetLogPValue: number;
  upsetPValue: number;
  upsetSurprisal: number;
  modelVersion: string;
}

function probabilityFromLog(logProbability: number) {
  return Math.max(MIN_POSITIVE_PROBABILITY, Math.exp(logProbability));
}

function logAddExp(left: number, right: number) {
  if (left === Number.NEGATIVE_INFINITY) return right;
  if (right === Number.NEGATIVE_INFINITY) return left;
  const maximum = Math.max(left, right);
  return maximum + Math.log(Math.exp(left - maximum) + Math.exp(right - maximum));
}

export function conditionalBinomialLogProbability(
  total: number,
  successes: number,
  probability: number,
) {
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    !Number.isInteger(successes) ||
    successes < 0 ||
    successes > total ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1
  ) return Number.NEGATIVE_INFINITY;
  if (probability === 0) return successes === 0 ? 0 : Number.NEGATIVE_INFINITY;
  if (probability === 1) return successes === total ? 0 : Number.NEGATIVE_INFINITY;
  return logFactorial(total) - logFactorial(successes) - logFactorial(total - successes) +
    successes * Math.log(probability) +
    (total - successes) * Math.log1p(-probability);
}

export function conditionalBinomialUpperTail(
  total: number,
  minimumSuccesses: number,
  probability: number,
) {
  let logProbability = Number.NEGATIVE_INFINITY;
  for (let successes = minimumSuccesses; successes <= total; successes++) {
    logProbability = logAddExp(
      logProbability,
      conditionalBinomialLogProbability(total, successes, probability),
    );
  }
  return {
    logProbability,
    probability: probabilityFromLog(logProbability),
  };
}

function devianceTerm(observed: number, expected: number) {
  return observed === 0 ? 0 : observed * Math.log(observed / expected);
}

export function likelihoodRatioDeviance(
  winnerGoals: number,
  loserGoals: number,
  expectedWinnerShare: number,
) {
  const total = winnerGoals + loserGoals;
  if (total <= 0) return 0;
  const observedWinnerShare = winnerGoals / total;
  return 2 * total * (
    devianceTerm(observedWinnerShare, expectedWinnerShare) +
    devianceTerm(1 - observedWinnerShare, 1 - expectedWinnerShare)
  );
}

export function assessScoreline(
  distribution: ScoreDistribution,
  homeGoals: number,
  awayGoals: number,
): ExactScoreAssessment {
  const { lambdaHome, lambdaAway } = distribution.expectation();
  const totalGoals = homeGoals + awayGoals;
  const totalLambda = lambdaHome + lambdaAway;
  const homeGoalShare = totalLambda > 0 ? lambdaHome / totalLambda : .5;
  const exactScoreLogProbability = distribution.logProbability(homeGoals, awayGoals);
  const totalGoalsLogProbability = poissonLogProbability(totalLambda, totalGoals);
  const conditionalAllocationLogProbability = conditionalBinomialLogProbability(
    totalGoals,
    homeGoals,
    homeGoalShare,
  );

  return {
    exactScoreLogProbability,
    exactScoreProbability: probabilityFromLog(exactScoreLogProbability),
    exactScoreSurprisal: -exactScoreLogProbability / LN_10,
    totalGoalsLogProbability,
    conditionalAllocationLogProbability,
  };
}

export function assessUpset(
  distribution: ScoreDistribution,
  homeGoals: number,
  awayGoals: number,
  outcomes: OutcomeProbabilities = distribution.outcomeProbabilities(),
): UpsetAssessment | null {
  if (homeGoals === awayGoals) return null;

  const winnerSide = homeGoals > awayGoals ? 'home' : 'away';
  const loserSide = winnerSide === 'home' ? 'away' : 'home';
  const winnerProbability = outcomes[winnerSide];
  const loserProbability = outcomes[loserSide];
  if (winnerProbability >= loserProbability) return null;

  const { lambdaHome, lambdaAway } = distribution.expectation();
  const lambdaWinner = winnerSide === 'home' ? lambdaHome : lambdaAway;
  const lambdaLoser = winnerSide === 'home' ? lambdaAway : lambdaHome;
  const winnerGoals = winnerSide === 'home' ? homeGoals : awayGoals;
  const loserGoals = winnerSide === 'home' ? awayGoals : homeGoals;
  const totalGoals = winnerGoals + loserGoals;
  const totalLambda = lambdaWinner + lambdaLoser;
  const expectedGoalShare = lambdaWinner / totalLambda;
  const observedGoalShare = winnerGoals / totalGoals;
  const likelihoodRatio = likelihoodRatioDeviance(
    winnerGoals,
    loserGoals,
    expectedGoalShare,
  );
  const exactScore = assessScoreline(distribution, homeGoals, awayGoals);
  const allocationTail = conditionalBinomialUpperTail(
    totalGoals,
    winnerGoals,
    expectedGoalShare,
  );

  let upsetLogPValue = Number.NEGATIVE_INFINITY;
  const comparisonTolerance = 1e-12 * Math.max(1, likelihoodRatio);
  for (const scoreline of distribution.enumerateScorelines(
    SCORE_TAIL_TOLERANCE,
    { homeGoals, awayGoals },
  )) {
    const candidateWinnerGoals = winnerSide === 'home'
      ? scoreline.homeGoals
      : scoreline.awayGoals;
    const candidateLoserGoals = winnerSide === 'home'
      ? scoreline.awayGoals
      : scoreline.homeGoals;
    if (candidateWinnerGoals <= candidateLoserGoals) continue;
    const candidateDeviance = likelihoodRatioDeviance(
      candidateWinnerGoals,
      candidateLoserGoals,
      expectedGoalShare,
    );
    if (candidateDeviance + comparisonTolerance < likelihoodRatio) continue;
    upsetLogPValue = logAddExp(upsetLogPValue, scoreline.logProbability);
  }

  const winOddsRatio = loserProbability / winnerProbability;
  return {
    ...exactScore,
    isUpset: true,
    winnerSide,
    loserSide,
    winnerProbability,
    loserProbability,
    drawProbability: outcomes.draw,
    decisiveWinnerShare: winnerProbability / (winnerProbability + loserProbability),
    winOddsRatio,
    gapBits: Math.log(winOddsRatio) / LN_2,
    lambdaWinner,
    lambdaLoser,
    expectedGoalShare,
    observedGoalShare,
    likelihoodRatioDeviance: likelihoodRatio,
    conditionalAllocationTailLogProbability: allocationTail.logProbability,
    conditionalAllocationTailProbability: allocationTail.probability,
    conditionalAllocationSurprisal: -allocationTail.logProbability / LN_10,
    upsetLogPValue,
    upsetPValue: probabilityFromLog(upsetLogPValue),
    upsetSurprisal: -upsetLogPValue / LN_10,
    modelVersion: distribution.modelVersion,
  };
}
