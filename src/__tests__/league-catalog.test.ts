import { describe, expect, it } from 'vitest';
import { clubCatalog, leagueSystems } from '../data/league-catalog/catalog';
import { activeMarketSnapshot, activeRatings } from '../data/active-data';
import {
  activeLeague,
  assertInfiniteSimulatorCompatible,
  defineActiveLeague,
  preparedTopLeagues,
} from '../data/league-catalog/active';
import { englandClubs, englandLeagueSystem } from '../data/league-catalog/england';
import {
  italyClubs,
  italyLeagueSystem,
  serieA2026,
} from '../data/league-catalog/italy';
import {
  laLiga2026,
  spainClubs,
  spainLeagueSystem,
} from '../data/league-catalog/spain';
import { clubsForCompetition } from '../data/league-catalog/club';
import type {
  ClubDefinition,
  CompetitionDefinition,
  CountryCode,
} from '../data/league-catalog/types';
import { regularSeasonRounds } from '../data/league-catalog/types';
import { validateLeagueCatalog } from '../data/league-catalog/validation';
import { createDoubleRoundRobin } from '../domain/fixtures';
import {
  buildNextSeasonRosters,
  initialLeagueSeasonRosters,
  resolveLeagueMovements,
  type CompetitionSeasonOutcome,
} from '../domain/promotion';
import type { LeagueRow } from '../domain/types';

function table(teamIds: readonly string[]): LeagueRow[] {
  return teamIds.map((teamId, index) => ({
    teamId,
    position: index + 1,
    played: (teamIds.length - 1) * 2,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: Math.max(0, (teamIds.length - index) * 3),
  }));
}

function outcome(
  competition: CompetitionDefinition,
  promotionPlayoffWinners: readonly string[] = [],
  relegationPlayoffLosers: readonly string[] = [],
): CompetitionSeasonOutcome {
  const tables = competition.groups
    ? Object.fromEntries(
        Object.entries(competition.groups).map(([group, ids]) => [group, table(ids)]),
      )
    : { overall: table(competition.clubIds) };
  return {
    competitionId: competition.id,
    tables,
    promotionPlayoffWinners,
    relegationPlayoffLosers,
  };
}

function externalEntrants(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

function externalClubDefinitions(
  ids: readonly string[],
  countryCode: CountryCode,
): ClubDefinition[] {
  return ids.map((id, index) => ({
    id,
    name: id,
    nameKo: id,
    abbr: `X${String(index).padStart(2, '0')}`,
    color: '#222222',
    secondaryColor: '#EEEEEE',
    countryCode,
    crestUrl: `/crests/test/${id}.png`,
    identityVerifiedAt: '2026-07-28',
  }));
}

describe('league catalog', () => {
  it('contains unique, internally consistent 2026/27 league systems', () => {
    expect(validateLeagueCatalog(leagueSystems, clubCatalog)).toEqual([]);
    expect(englandLeagueSystem.competitions.map(competition => competition.clubIds.length))
      .toEqual([20, 24, 24, 24]);
  });

  it('binds active ratings and market data to exactly the active roster', () => {
    const expected = [...activeLeague.competition.clubIds].sort();
    expect(Object.keys(activeRatings).sort()).toEqual(expected);
    expect(Object.keys(activeMarketSnapshot).sort()).toEqual(expected);
    expect(() => defineActiveLeague({
      ...activeLeague,
      clubs: activeLeague.clubs.slice(1),
    })).toThrow(/active club roster mismatch/);
  });

  it('can construct validated top-flight definitions for Spain and Italy', () => {
    const definitions = [
      defineActiveLeague({
        system: spainLeagueSystem,
        competition: laLiga2026,
        clubs: clubsForCompetition(spainClubs, laLiga2026),
        ui: { wordmark: 'LL', kicker: 'LALIGA' },
      }),
      defineActiveLeague({
        system: italyLeagueSystem,
        competition: serieA2026,
        clubs: clubsForCompetition(italyClubs, serieA2026),
        ui: { wordmark: 'SA', kicker: 'SERIE A' },
      }),
    ];
    expect(definitions.map(definition => definition.clubs.length)).toEqual([20, 20]);
    expect(assertInfiniteSimulatorCompatible(preparedTopLeagues['esp-la-liga']))
      .toBe(preparedTopLeagues['esp-la-liga']);
    expect(() =>
      assertInfiniteSimulatorCompatible(preparedTopLeagues['ita-serie-a'])
    ).toThrow(/decisive playoffs must be simulated/);
  });

  it('builds complete home-and-away fixtures for every loaded division and group', () => {
    leagueSystems.forEach(system => {
      system.competitions.forEach(competition => {
        const rosters = competition.groups
          ? Object.values(competition.groups)
          : [competition.clubIds];
        rosters.forEach(clubIds => {
          const fixtures = createDoubleRoundRobin([...clubIds]);
          expect(fixtures).toHaveLength(clubIds.length * (clubIds.length - 1));
          expect(Math.max(...fixtures.map(fixture => fixture.round)))
            .toBe(regularSeasonRounds(competition));
          clubIds.forEach(clubId => {
            expect(fixtures.filter(fixture =>
              fixture.homeId === clubId || fixture.awayId === clubId
            )).toHaveLength((clubIds.length - 1) * 2);
          });
        });
      });
    });
  });

  it('resolves the full English professional pyramid and keeps every roster size stable', () => {
    const [premierLeague, championship, leagueOne, leagueTwo] =
      englandLeagueSystem.competitions;
    const resolution = resolveLeagueMovements(englandLeagueSystem, [
      outcome(premierLeague),
      outcome(championship, [championship.clubIds[2]]),
      outcome(leagueOne, [leagueOne.clubIds[2]]),
      outcome(leagueTwo, [leagueTwo.clubIds[3]]),
    ]);

    expect(resolution.externalVacancies).toEqual({ 'eng-league-two': 2 });
    expect(resolution.movements).toHaveLength(22);
    const feederIds = ['national-league-champion', 'national-league-playoff-winner'];
    const next = buildNextSeasonRosters(
      englandLeagueSystem,
      resolution,
      [...englandClubs, ...externalClubDefinitions(feederIds, 'ENG')],
      { 'eng-league-two': feederIds },
    );
    expect(next['eng-premier-league']).toHaveLength(20);
    expect(next['eng-championship']).toHaveLength(24);
    expect(next['eng-league-one']).toHaveLength(24);
    expect(next['eng-league-two']).toHaveLength(24);
    expect(next['eng-premier-league']).toContain(championship.clubIds[0]);
    expect(next['eng-premier-league']).not.toContain(premierLeague.clubIds[17]);
  });

  it('carries promoted and relegated clubs into the following season instead of restoring the base roster', () => {
    const [premierLeague, championship, leagueOne, leagueTwo] =
      englandLeagueSystem.competitions;
    const initial = initialLeagueSeasonRosters(englandLeagueSystem);
    const firstResolution = resolveLeagueMovements(englandLeagueSystem, [
      outcome(premierLeague),
      outcome(championship, [championship.clubIds[2]]),
      outcome(leagueOne, [leagueOne.clubIds[2]]),
      outcome(leagueTwo, [leagueTwo.clubIds[3]]),
    ], initial);
    const feederIds = ['national-1', 'national-2', 'national-3', 'national-4'];
    const clubsWithFeeders = [
      ...englandClubs,
      ...externalClubDefinitions(feederIds, 'ENG'),
    ];
    const first = buildNextSeasonRosters(
      englandLeagueSystem,
      firstResolution,
      clubsWithFeeders,
      { 'eng-league-two': ['national-1', 'national-2'] },
      initial,
    );
    const flatOutcome = (
      competition: CompetitionDefinition,
      roster: readonly string[],
      promotion: readonly string[] = [],
    ): CompetitionSeasonOutcome => ({
      competitionId: competition.id,
      tables: { overall: table(roster) },
      promotionPlayoffWinners: promotion,
      relegationPlayoffLosers: [],
    });
    const secondResolution = resolveLeagueMovements(englandLeagueSystem, [
      flatOutcome(premierLeague, first[premierLeague.id]),
      flatOutcome(championship, first[championship.id], [first[championship.id][2]]),
      flatOutcome(leagueOne, first[leagueOne.id], [first[leagueOne.id][2]]),
      flatOutcome(leagueTwo, first[leagueTwo.id], [first[leagueTwo.id][3]]),
    ], first);
    const second = buildNextSeasonRosters(
      englandLeagueSystem,
      secondResolution,
      clubsWithFeeders,
      { 'eng-league-two': ['national-3', 'national-4'] },
      first,
    );
    expect(second[premierLeague.id]).not.toEqual(initial[premierLeague.id]);
    expect(second[premierLeague.id]).toContain(first[championship.id][0]);
    expect(Object.values(second).flat()).not.toContain('national-1');
  });

  it('rejects a playoff winner that was not in a playoff position', () => {
    const [premierLeague, championship, leagueOne, leagueTwo] =
      englandLeagueSystem.competitions;
    expect(() => resolveLeagueMovements(englandLeagueSystem, [
      outcome(premierLeague),
      outcome(championship, [championship.clubIds[10]]),
      outcome(leagueOne, [leagueOne.clubIds[2]]),
      outcome(leagueTwo, [leagueTwo.clubIds[3]]),
    ])).toThrow(/ineligible promotion playoff winner/);
  });

  it('resolves the Spanish loaded pyramid, including grouped promotion routes', () => {
    const [laLiga, segunda, primeraFederacion] = spainLeagueSystem.competitions;
    const groupTables = Object.values(primeraFederacion.groups!);
    const resolution = resolveLeagueMovements(spainLeagueSystem, [
      outcome(laLiga),
      outcome(segunda, [segunda.clubIds[2]]),
      outcome(primeraFederacion, [groupTables[0][1], groupTables[1][1]]),
    ]);

    expect(resolution.externalVacancies).toEqual({
      'esp-primera-federacion': 10,
    });
    const next = buildNextSeasonRosters(
      spainLeagueSystem,
      resolution,
      [
        ...spainClubs,
        ...externalClubDefinitions(
          externalEntrants('segunda-federacion', 10),
          'ESP',
        ),
      ],
      {
        'esp-primera-federacion': externalEntrants('segunda-federacion', 10),
      },
    );
    expect(next['esp-la-liga']).toHaveLength(20);
    expect(next['esp-segunda']).toHaveLength(22);
    expect(next['esp-primera-federacion']).toHaveLength(40);
  });

  it('resolves the Italian professional pyramid and conditional playout routes', () => {
    const [serieA, serieB, serieC] = italyLeagueSystem.competitions;
    const serieCGroups = Object.values(serieC.groups!);
    const resolution = resolveLeagueMovements(italyLeagueSystem, [
      outcome(serieA, [], [serieA.clubIds[17]]),
      outcome(serieB, [serieB.clubIds[2]], [serieB.clubIds[15]]),
      outcome(
        serieC,
        [serieCGroups[0][1]],
        serieCGroups.flatMap(group => [group[15], group[16]]),
      ),
    ]);

    expect(resolution.externalVacancies).toEqual({ 'ita-serie-c': 9 });
    const next = buildNextSeasonRosters(
      italyLeagueSystem,
      resolution,
      [
        ...italyClubs,
        ...externalClubDefinitions(externalEntrants('serie-d', 9), 'ITA'),
      ],
      { 'ita-serie-c': externalEntrants('serie-d', 9) },
    );
    expect(next['ita-serie-a']).toHaveLength(20);
    expect(next['ita-serie-b']).toHaveLength(20);
    expect(next['ita-serie-c']).toHaveLength(60);
  });

  it('requires identity data for every feeder club before rolling a roster forward', () => {
    const [premierLeague, championship, leagueOne, leagueTwo] =
      englandLeagueSystem.competitions;
    const resolution = resolveLeagueMovements(englandLeagueSystem, [
      outcome(premierLeague),
      outcome(championship, [championship.clubIds[2]]),
      outcome(leagueOne, [leagueOne.clubIds[2]]),
      outcome(leagueTwo, [leagueTwo.clubIds[3]]),
    ]);
    expect(() => buildNextSeasonRosters(
      englandLeagueSystem,
      resolution,
      englandClubs,
      { 'eng-league-two': ['unknown-feeder-1', 'unknown-feeder-2'] },
    )).toThrow(/without identity data/);
  });

  it('detects an unbalanced pair of promotion and relegation rules', () => {
    const broken = {
      ...englandLeagueSystem,
      competitions: englandLeagueSystem.competitions.map((competition, index) =>
        index === 0
          ? {
              ...competition,
              relegation: {
                automatic: {
                  ...competition.relegation!.automatic!,
                  places: 2,
                  positions: [19, 20],
                },
              },
            }
          : competition
      ),
    };
    expect(validateLeagueCatalog([broken], englandClubs))
      .toEqual(expect.arrayContaining([
        expect.stringMatching(
          /eng-premier-league relegates 2 but eng-championship promotes 3/,
        ),
      ]));
  });
});
