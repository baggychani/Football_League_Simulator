import type { Team } from '../domain/types';

const clip = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

export interface StructuralClubState {
  /** Very slow-moving historical support and fan-base pull. */
  heritage: number;
  /** Financial ability to retain and replace sporting quality. */
  resources: number;
  /** Recent domestic and international standing. */
  prestige: number;
  /** Ability to absorb failure without compounding it. */
  institutionalStability: number;
  /** Current organisational condition; one is healthy, zero is crisis. */
  organizationalHealth: number;
}

export interface StructuralSeasonOutcome {
  competitionTier: number;
  expectedPosition: number;
  finalPosition: number;
  fieldSize: number;
  champion?: boolean;
  championsLeague?: boolean;
  europaLeague?: boolean;
  promoted?: boolean;
  relegated?: boolean;
}

export const structuralParameters = {
  supportWeights: {
    heritage: .25,
    resources: .30,
    prestige: .25,
    institutionalStability: .20,
  },
  healthSupportFloor: .85,
  heritageFollow: .0008,
  resourceEvidence: .008,
  prestigeEvidence: .016,
  stabilityRecovery: .0015,
  healthRecovery: .08,
  promotionResource: .04,
  promotionPrestige: .035,
  relegationResource: .06,
  relegationPrestige: .05,
  relegationStability: .03,
  relegationHealth: .12,
  titlePrestige: .04,
  championsLeagueResource: .01,
  championsLeaguePrestige: .02,
  europaPrestige: .01,
} as const;

/**
 * Compatibility prior for the existing catalog. It is used only to initialise
 * the separated axes; all subsequent seasons evolve those axes independently.
 */
export function legacyStructuralSupport(team: Team) {
  return clip(team.structuralTier ?? 0);
}

export function createStructuralClubState(team: Team): StructuralClubState {
  const prior = legacyStructuralSupport(team);
  return {
    heritage: prior,
    resources: prior,
    prestige: prior,
    institutionalStability: prior,
    organizationalHealth: 1,
  };
}

export function structuralSupport(state: StructuralClubState) {
  const weights = structuralParameters.supportWeights;
  const base =
    weights.heritage * state.heritage
    + weights.resources * state.resources
    + weights.prestige * state.prestige
    + weights.institutionalStability * state.institutionalStability;
  const healthFactor =
    structuralParameters.healthSupportFloor
    + (1 - structuralParameters.healthSupportFloor) * state.organizationalHealth;
  return clip(base * healthFactor);
}

export function applyStructuralSeason(
  state: StructuralClubState,
  outcome: StructuralSeasonOutcome | undefined,
  seasonPerformance: number,
) {
  if (!outcome) {
    state.organizationalHealth = clip(
      state.organizationalHealth
      + structuralParameters.healthRecovery * (1 - state.organizationalHealth),
    );
    return;
  }

  const denominator = Math.max(1, outcome.fieldSize - 1);
  const expectationDelta = clip(
    (outcome.expectedPosition - outcome.finalPosition) / denominator,
    -1,
    1,
  );
  const sportingEvidence = Math.tanh(seasonPerformance / .12);
  const evidence = clip(.65 * expectationDelta + .35 * sportingEvidence, -1, 1);

  state.resources = clip(
    state.resources
    + structuralParameters.resourceEvidence * evidence
    + (outcome.promoted ? structuralParameters.promotionResource : 0)
    - (outcome.relegated ? structuralParameters.relegationResource : 0)
    + (outcome.championsLeague ? structuralParameters.championsLeagueResource : 0),
  );
  state.prestige = clip(
    state.prestige
    + structuralParameters.prestigeEvidence * evidence
    + (outcome.promoted ? structuralParameters.promotionPrestige : 0)
    - (outcome.relegated ? structuralParameters.relegationPrestige : 0)
    + (outcome.champion ? structuralParameters.titlePrestige : 0)
    + (outcome.championsLeague ? structuralParameters.championsLeaguePrestige : 0)
    + (outcome.europaLeague ? structuralParameters.europaPrestige : 0),
  );
  state.institutionalStability = clip(
    state.institutionalStability
    + structuralParameters.stabilityRecovery * (1 - state.institutionalStability)
    - (outcome.relegated ? structuralParameters.relegationStability : 0),
  );
  state.organizationalHealth = clip(
    state.organizationalHealth
    + structuralParameters.healthRecovery * (1 - state.organizationalHealth)
    - (outcome.relegated ? structuralParameters.relegationHealth : 0)
    + (outcome.promoted ? .025 : 0),
  );
  state.heritage = clip(
    state.heritage
    + structuralParameters.heritageFollow * (state.prestige - state.heritage),
  );
}
