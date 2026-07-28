import type {
  ClubDefinition,
  CompetitionDefinition,
  LeagueSystemDefinition,
  MovementRules,
  PositionRule,
} from '../data/league-catalog/types';
import type { LeagueRow } from './types';

export interface CompetitionSeasonOutcome {
  competitionId: string;
  /** Flat competitions use `overall`; grouped competitions use their group keys. */
  tables: Readonly<Record<string, readonly LeagueRow[]>>;
  promotionPlayoffWinners?: readonly string[];
  relegationPlayoffLosers?: readonly string[];
}

export interface ClubMovement {
  clubId: string;
  sourceCompetitionId: string;
  destinationCompetitionId?: string;
  direction: 'promotion' | 'relegation';
  route: 'automatic' | 'playoff' | 'conditional-playoff';
  externalBoundary: boolean;
}

export interface MovementResolution {
  movements: readonly ClubMovement[];
  /**
   * Number of replacement clubs required from outside the loaded pyramid.
   * Usually only the lowest loaded tier has vacancies.
   */
  externalVacancies: Readonly<Record<string, number>>;
}

export type LeagueSeasonRosters =
  Readonly<Record<string, readonly string[]>>;

function competitionMap(system: LeagueSystemDefinition) {
  return new Map(system.competitions.map(competition => [competition.id, competition]));
}

export function initialLeagueSeasonRosters(
  system: LeagueSystemDefinition,
): LeagueSeasonRosters {
  return Object.fromEntries(
    system.competitions.map(competition => [
      competition.id,
      [...competition.clubIds],
    ]),
  );
}

function validateSeasonRosters(
  system: LeagueSystemDefinition,
  rosters: LeagueSeasonRosters,
) {
  const competitionIds = new Set(system.competitions.map(competition => competition.id));
  const rosterKeys = Object.keys(rosters);
  const unknownKeys = rosterKeys.filter(id => !competitionIds.has(id));
  const missingKeys = [...competitionIds].filter(id => !(id in rosters));
  if (unknownKeys.length || missingKeys.length) {
    throw new Error(
      `${system.id}: season roster keys differ `
      + `(missing ${missingKeys.join(', ') || 'none'}; `
      + `unknown ${unknownKeys.join(', ') || 'none'})`,
    );
  }
  const allClubIds: string[] = [];
  system.competitions.forEach(competition => {
    const clubIds = rosters[competition.id];
    if (
      clubIds.length !== competition.expectedClubCount
      || new Set(clubIds).size !== clubIds.length
    ) {
      throw new Error(
        `${competition.id}: season roster must contain exactly `
        + `${competition.expectedClubCount} unique clubs`,
      );
    }
    allClubIds.push(...clubIds);
  });
  if (new Set(allClubIds).size !== allClubIds.length) {
    throw new Error(`${system.id}: a club appears in multiple season rosters`);
  }
}

function expectedTableKeys(competition: CompetitionDefinition) {
  return competition.groups ? Object.keys(competition.groups) : ['overall'];
}

function validateOutcome(
  competition: CompetitionDefinition,
  outcome: CompetitionSeasonOutcome,
  currentClubIds: readonly string[],
) {
  const expectedKeys = expectedTableKeys(competition);
  const actualKeys = Object.keys(outcome.tables);
  if (
    expectedKeys.length !== actualKeys.length
    || expectedKeys.some(key => !actualKeys.includes(key))
  ) {
    throw new Error(
      `${competition.id}: expected tables ${expectedKeys.join(', ')}, got ${actualKeys.join(', ')}`,
    );
  }

  const expectedGroups = competition.groups ?? { overall: currentClubIds };
  const allOutcomeIds: string[] = [];
  for (const [group, expectedGroupTemplate] of Object.entries(expectedGroups)) {
    const rows = outcome.tables[group] ?? [];
    const rowIds = rows.map(row => row.teamId);
    allOutcomeIds.push(...rowIds);
    if (
      rows.length !== expectedGroupTemplate.length
      || new Set(rowIds).size !== rowIds.length
    ) {
      throw new Error(`${competition.id}.${group}: invalid final-table size or duplicate club`);
    }
    const positions = rows.map(row => row.position).sort((a, b) => a - b);
    if (positions.some((position, index) => position !== index + 1)) {
      throw new Error(`${competition.id}.${group}: positions must be exactly 1..${rows.length}`);
    }
  }
  if (
    allOutcomeIds.length !== currentClubIds.length
    || new Set(allOutcomeIds).size !== allOutcomeIds.length
    || currentClubIds.some(id => !allOutcomeIds.includes(id))
  ) {
    throw new Error(`${competition.id}: final tables do not match the current season roster`);
  }
}

function eligibleIds(
  competition: CompetitionDefinition,
  outcome: CompetitionSeasonOutcome,
  rule: PositionRule,
) {
  const tables = Object.values(outcome.tables);
  if (competition.groups && rule.scope === 'competition') {
    return tables.flatMap(table =>
      table.filter(row => rule.positions.includes(row.position)).map(row => row.teamId)
    );
  }
  return tables.flatMap(table =>
    table.filter(row => rule.positions.includes(row.position)).map(row => row.teamId)
  );
}

function automaticIds(
  competition: CompetitionDefinition,
  outcome: CompetitionSeasonOutcome,
  rule: PositionRule,
) {
  const selected = eligibleIds(competition, outcome, rule);
  const multiplier = competition.groups && rule.scope === 'per-group'
    ? Object.keys(outcome.tables).length
    : 1;
  const expected = rule.places * multiplier;
  if (selected.length !== expected) {
    throw new Error(
      `${competition.id}: automatic rule selected ${selected.length}; expected ${expected}`,
    );
  }
  return selected;
}

function postseasonIds(
  competition: CompetitionDefinition,
  outcome: CompetitionSeasonOutcome,
  rule: PositionRule,
  chosen: readonly string[] | undefined,
  label: string,
) {
  const ids = [...(chosen ?? [])];
  const multiplier = competition.groups && rule.scope === 'per-group'
    ? Object.keys(outcome.tables).length
    : 1;
  const expected = rule.places * multiplier;
  if (ids.length !== expected || new Set(ids).size !== ids.length) {
    throw new Error(`${competition.id}: ${label} requires exactly ${expected} unique club(s)`);
  }
  const eligible = new Set(eligibleIds(competition, outcome, rule));
  const invalid = ids.filter(id => !eligible.has(id));
  if (invalid.length) {
    throw new Error(`${competition.id}: ineligible ${label}: ${invalid.join(', ')}`);
  }
  return ids;
}

function movement(
  competition: CompetitionDefinition,
  rule: PositionRule,
  clubId: string,
  direction: ClubMovement['direction'],
  route: ClubMovement['route'],
): ClubMovement {
  return {
    clubId,
    sourceCompetitionId: competition.id,
    destinationCompetitionId: rule.destinationCompetitionId,
    direction,
    route,
    externalBoundary: Boolean(rule.externalBoundary),
  };
}

function resolveRuleSet(
  competition: CompetitionDefinition,
  outcome: CompetitionSeasonOutcome,
  rules: MovementRules | undefined,
  direction: ClubMovement['direction'],
) {
  if (!rules) return [];
  const result: ClubMovement[] = [];
  if (rules.automatic) {
    result.push(...automaticIds(competition, outcome, rules.automatic).map(clubId =>
      movement(competition, rules.automatic!, clubId, direction, 'automatic')
    ));
  }
  if (rules.playoff) {
    const chosen = direction === 'promotion'
      ? outcome.promotionPlayoffWinners
      : outcome.relegationPlayoffLosers;
    result.push(...postseasonIds(
      competition,
      outcome,
      rules.playoff,
      chosen,
      direction === 'promotion' ? 'promotion playoff winner' : 'relegation playoff loser',
    ).map(clubId => movement(competition, rules.playoff!, clubId, direction, 'playoff')));
  }
  if (rules.conditionalPlayoff) {
    const chosen = direction === 'promotion'
      ? outcome.promotionPlayoffWinners
      : outcome.relegationPlayoffLosers;
    result.push(...postseasonIds(
      competition,
      outcome,
      rules.conditionalPlayoff,
      chosen,
      direction === 'promotion' ? 'conditional promotion winner' : 'conditional relegation loser',
    ).map(clubId =>
      movement(competition, rules.conditionalPlayoff!, clubId, direction, 'conditional-playoff')
    ));
  }
  return result;
}

export function resolveLeagueMovements(
  system: LeagueSystemDefinition,
  outcomes: readonly CompetitionSeasonOutcome[],
  currentRosters: LeagueSeasonRosters = initialLeagueSeasonRosters(system),
): MovementResolution {
  validateSeasonRosters(system, currentRosters);
  const competitions = competitionMap(system);
  const outcomesByCompetition = new Map(outcomes.map(outcome => [
    outcome.competitionId,
    outcome,
  ]));
  if (outcomesByCompetition.size !== outcomes.length) {
    throw new Error(`${system.id}: duplicate competition outcome`);
  }
  const unknownOutcomes = [...outcomesByCompetition.keys()]
    .filter(competitionId => !competitions.has(competitionId));
  if (unknownOutcomes.length) {
    throw new Error(
      `${system.id}: unknown competition outcome(s): ${unknownOutcomes.join(', ')}`,
    );
  }

  const movements: ClubMovement[] = [];
  for (const competition of system.competitions) {
    const outcome = outcomesByCompetition.get(competition.id);
    if (!outcome) throw new Error(`${system.id}: missing outcome for ${competition.id}`);
    validateOutcome(competition, outcome, currentRosters[competition.id]);
    movements.push(
      ...resolveRuleSet(competition, outcome, competition.promotion, 'promotion'),
      ...resolveRuleSet(competition, outcome, competition.relegation, 'relegation'),
    );
  }

  const movedClubIds = new Set<string>();
  for (const item of movements) {
    if (movedClubIds.has(item.clubId)) {
      throw new Error(`${item.clubId}: selected for more than one movement`);
    }
    movedClubIds.add(item.clubId);
    if (
      item.destinationCompetitionId
      && !competitions.has(item.destinationCompetitionId)
    ) {
      throw new Error(`${item.clubId}: unknown destination ${item.destinationCompetitionId}`);
    }
  }

  const externalVacancies: Record<string, number> = {};
  movements.forEach(item => {
    if (item.externalBoundary && !item.destinationCompetitionId) {
      externalVacancies[item.sourceCompetitionId] =
        (externalVacancies[item.sourceCompetitionId] ?? 0) + 1;
    }
  });
  return { movements, externalVacancies };
}

function validateReservePlacements(
  system: LeagueSystemDefinition,
  rosters: Readonly<Record<string, readonly string[]>>,
  clubs: readonly ClubDefinition[],
) {
  const tierByCompetition = new Map(
    system.competitions.map(competition => [competition.id, competition.tier]),
  );
  const competitionByClub = new Map<string, string>();
  Object.entries(rosters).forEach(([competitionId, clubIds]) => {
    clubIds.forEach(clubId => competitionByClub.set(clubId, competitionId));
  });
  const clubById = new Map(clubs.map(club => [club.id, club]));
  for (const [clubId, competitionId] of competitionByClub) {
    const parentClubId = clubById.get(clubId)?.parentClubId;
    if (!parentClubId) continue;
    const parentCompetitionId = competitionByClub.get(parentClubId);
    if (!parentCompetitionId) continue;
    const reserveTier = tierByCompetition.get(competitionId);
    const parentTier = tierByCompetition.get(parentCompetitionId);
    if (reserveTier === undefined || parentTier === undefined) continue;
    if (reserveTier <= parentTier) {
      throw new Error(
        `${clubId}: reserve side cannot occupy tier ${reserveTier} while `
        + `${parentClubId} occupies tier ${parentTier}`,
      );
    }
  }
}

export function buildNextSeasonRosters(
  system: LeagueSystemDefinition,
  resolution: MovementResolution,
  clubs: readonly ClubDefinition[],
  externalEntrants: Readonly<Record<string, readonly string[]>> = {},
  currentRosters: LeagueSeasonRosters = initialLeagueSeasonRosters(system),
) {
  validateSeasonRosters(system, currentRosters);
  const next: Record<string, string[]> = Object.fromEntries(
    system.competitions.map(competition => [
      competition.id,
      [...currentRosters[competition.id]],
    ]),
  );
  resolution.movements.forEach(item => {
    if (!next[item.sourceCompetitionId]?.includes(item.clubId)) {
      throw new Error(
        `${item.clubId}: is not rostered in ${item.sourceCompetitionId}`,
      );
    }
    next[item.sourceCompetitionId] = next[item.sourceCompetitionId]
      .filter(id => id !== item.clubId);
    if (item.destinationCompetitionId) {
      if (!next[item.destinationCompetitionId]) {
        throw new Error(
          `${item.clubId}: unknown destination ${item.destinationCompetitionId}`,
        );
      }
      next[item.destinationCompetitionId].push(item.clubId);
    }
  });

  for (const [competitionId, vacancyCount] of Object.entries(resolution.externalVacancies)) {
    const entrants = [...(externalEntrants[competitionId] ?? [])];
    if (entrants.length !== vacancyCount || new Set(entrants).size !== entrants.length) {
      throw new Error(
        `${competitionId}: expected ${vacancyCount} unique external entrant(s), got ${entrants.length}`,
      );
    }
    next[competitionId].push(...entrants);
  }

  const allIds = Object.values(next).flat();
  if (new Set(allIds).size !== allIds.length) {
    throw new Error('Next-season rosters contain a club in multiple competitions.');
  }
  const knownClubIds = new Set(clubs.map(club => club.id));
  const unknownClubIds = allIds.filter(id => !knownClubIds.has(id));
  if (unknownClubIds.length) {
    throw new Error(
      `Next-season rosters contain clubs without identity data: `
      + [...new Set(unknownClubIds)].join(', '),
    );
  }
  system.competitions.forEach(competition => {
    if (next[competition.id].length !== competition.expectedClubCount) {
      throw new Error(
        `${competition.id}: next roster has ${next[competition.id].length}, `
        + `expected ${competition.expectedClubCount}`,
      );
    }
  });
  validateReservePlacements(system, next, clubs);
  return next as Readonly<Record<string, readonly string[]>>;
}
