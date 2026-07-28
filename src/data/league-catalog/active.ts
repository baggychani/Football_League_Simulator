import {
  englandClubs,
  englandLeagueSystem,
  premierLeague2026,
  premierLeaguePolymarket,
} from './england';
import {
  laLiga2026,
  spainClubs,
  spainLeagueSystem,
} from './spain';
import {
  italyClubs,
  italyLeagueSystem,
  serieA2026,
} from './italy';
import { clubsForCompetition } from './club';
import type { ActiveLeagueDefinition } from './types';

export function defineActiveLeague(
  definition: ActiveLeagueDefinition,
): ActiveLeagueDefinition {
  if (!definition.system.competitions.some(
    competition => competition.id === definition.competition.id,
  )) {
    throw new Error(
      `${definition.competition.id} is not part of ${definition.system.id}`,
    );
  }
  if (definition.competition.groups) {
    throw new Error(
      `${definition.competition.id}: the current UI requires one flat table`,
    );
  }
  const expected = definition.competition.clubIds;
  const actual = definition.clubs.map(club => club.id);
  if (
    expected.length !== actual.length
    || new Set(actual).size !== actual.length
    || expected.some(id => !actual.includes(id))
  ) {
    throw new Error(`${definition.competition.id}: active club roster mismatch`);
  }
  const activeIds = new Set(actual);
  const invalidMarketIds = Object.values(
    definition.market?.teamTitleToClubId ?? {},
  ).filter(id => !activeIds.has(id));
  if (invalidMarketIds.length) {
    throw new Error(
      `${definition.competition.id}: market maps unknown club(s) `
      + invalidMarketIds.join(', '),
    );
  }
  return definition;
}

export function assertInfiniteSimulatorCompatible(
  definition: ActiveLeagueDefinition,
) {
  const unsupported = definition.competition.decisivePlayoffs
    ?.filter(playoff => playoff.format !== 'single-match') ?? [];
  if (unsupported.length) {
    throw new Error(
      `${definition.competition.id}: ${unsupported.map(playoff => playoff.format).join(', ')} `
      + 'decisive playoffs must be simulated before this competition can become active',
    );
  }
  return definition;
}

/**
 * Single configuration seam for the current UI/worker.
 *
 * Adding a league switch later should choose one of these definitions and
 * provide its ratings/market data; simulation code no longer needs club-id or
 * "38 rounds" branches.
 */
export const preparedTopLeagues = {
  'eng-premier-league': defineActiveLeague({
    system: englandLeagueSystem,
    competition: premierLeague2026,
    clubs: clubsForCompetition(englandClubs, premierLeague2026),
    market: premierLeaguePolymarket,
    ui: {
      wordmark: 'PL',
      kicker: 'PREMIER LEAGUE',
    },
  }),
  'esp-la-liga': defineActiveLeague({
    system: spainLeagueSystem,
    competition: laLiga2026,
    clubs: clubsForCompetition(spainClubs, laLiga2026),
    ui: {
      wordmark: 'LL',
      kicker: 'LALIGA EA SPORTS',
    },
  }),
  'ita-serie-a': defineActiveLeague({
    system: italyLeagueSystem,
    competition: serieA2026,
    clubs: clubsForCompetition(italyClubs, serieA2026),
    ui: {
      wordmark: 'SA',
      kicker: 'SERIE A',
    },
  }),
} as const;

/**
 * This is intentionally the only code-level league choice. The separate
 * active-data binding then refuses to boot unless ratings/market artifacts
 * contain the exact same club IDs.
 */
export const activeCompetitionId: keyof typeof preparedTopLeagues =
  'eng-premier-league';

export const activeLeague = assertInfiniteSimulatorCompatible(
  preparedTopLeagues[activeCompetitionId],
);
