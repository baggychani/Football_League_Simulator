import { englandClubs, englandLeagueSystem } from './england';
import { italyClubs, italyLeagueSystem } from './italy';
import { spainClubs, spainLeagueSystem } from './spain';
import type { ClubDefinition, CompetitionDefinition, LeagueSystemDefinition } from './types';
import { assertLeagueCatalogValid } from './validation';

export const leagueSystems: readonly LeagueSystemDefinition[] = [
  englandLeagueSystem,
  spainLeagueSystem,
  italyLeagueSystem,
];

export const clubCatalog: readonly ClubDefinition[] = [
  ...englandClubs,
  ...spainClubs,
  ...italyClubs,
];

assertLeagueCatalogValid(leagueSystems, clubCatalog);

export const clubCatalogById = Object.fromEntries(
  clubCatalog.map(club => [club.id, club]),
) as Readonly<Record<string, ClubDefinition>>;

export const competitionCatalogById = Object.fromEntries(
  leagueSystems.flatMap(system => system.competitions).map(competition => [
    competition.id,
    competition,
  ]),
) as Readonly<Record<string, CompetitionDefinition>>;
