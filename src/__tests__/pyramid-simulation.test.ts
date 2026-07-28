import { describe, expect, it } from 'vitest';
import { activeRatings } from '../data/active-data';
import { activeLeague } from '../data/league-catalog/active';
import { clubCatalogById } from '../data/league-catalog/catalog';
import { createRng } from '../simulation/rng';
import { IndependentPoissonModel } from '../simulation/score-model';
import {
  advanceCompetitionToFixture,
  createClosedTwoTierSystem,
  createCompetitionSeasonState,
  finalizeCompetitionTable,
  rolloverClosedTwoTierRosters,
  simulateEflSixTeamPromotionPlayoff,
} from '../simulation/competition-season-runner';
import {
  closeDynamicSeason,
  createDynamicStrength,
  structuralSupport,
} from '../simulation/dynamic-strength';
import { createClosedTwoTierRatings } from '../simulation/league-system-ratings';
import {
  applyStructuralSeason,
  createStructuralClubState,
  structuralSupport as structuralStateSupport,
} from '../simulation/structural-state';
import { neutralMatchContext } from '../simulation/match-context';

describe('structural and match context model', () => {
  it('migrates the legacy prior into separate axes and lets success build status', () => {
    const established = {
      id: 'established',
      name: 'Established',
      abbr: 'EST',
      color: '#111111',
      secondaryColor: '#FFFFFF',
      structuralTier: 1,
    };
    const challenger = {
      id: 'challenger',
      name: 'Challenger',
      abbr: 'CHA',
      color: '#222222',
      secondaryColor: '#FFFFFF',
    };
    expect(structuralStateSupport(createStructuralClubState(established))).toBe(1);
    const state = createStructuralClubState(challenger);
    applyStructuralSeason(state, {
      competitionTier: 2,
      expectedPosition: 12,
      finalPosition: 3,
      fieldSize: 24,
      promoted: true,
    }, .08);
    expect(state.resources).toBeGreaterThan(0);
    expect(state.prestige).toBeGreaterThan(0);
    expect(structuralStateSupport(state)).toBeGreaterThan(0);
  });

  it('uses a symmetric structural target instead of a one-way initial-base floor', () => {
    const clubs = [
      {
        id: 'a',
        name: 'A',
        abbr: 'AAA',
        color: '#111111',
        secondaryColor: '#FFFFFF',
        structuralTier: 1,
      },
      {
        id: 'b',
        name: 'B',
        abbr: 'BBB',
        color: '#222222',
        secondaryColor: '#FFFFFF',
        structuralTier: 1,
      },
    ];
    const state = createDynamicStrength(clubs, { a: 0, b: 0 });
    state.a.base = .2;
    state.b.base = -.2;
    const before = state.a.base - state.b.base;
    closeDynamicSeason(state, { a: 38, b: 38 });
    expect(state.a.base - state.b.base).toBeLessThan(before);
    expect(structuralSupport(state.a)).toBe(1);
  });

  it('plumbs effort, fatigue, performance and tempo separately into scoring', () => {
    const model = new IndependentPoissonModel();
    const home = {
      id: 'home',
      name: 'Home',
      abbr: 'HOM',
      color: '#111111',
      secondaryColor: '#FFFFFF',
    };
    const away = {
      id: 'away',
      name: 'Away',
      abbr: 'AWA',
      color: '#222222',
      secondaryColor: '#FFFFFF',
    };
    const neutral = model.expectedScore(home, away, { home: 0, away: 0 });
    const context = neutralMatchContext();
    context.home.effortShift = .03;
    context.away.fatigueShift = .02;
    context.tempoShift = .05;
    const adjusted = model.expectedScore(home, away, { home: 0, away: 0 }, context);
    expect(adjusted.rawDifference).toBeCloseTo(.05);
    expect(adjusted.lambdaHome).toBeGreaterThan(neutral.lambdaHome);
    expect(adjusted.lambdaAway).toBeGreaterThan(0);
  });
});

describe('closed Premier League and Championship runner', () => {
  it('runs 38 and 46 rounds independently and exchanges exactly three clubs', () => {
    const lowerTemplate = activeLeague.system.competitions.find(
      competition => competition.tier === activeLeague.competition.tier + 1,
    )!;
    const system = createClosedTwoTierSystem(
      activeLeague.system,
      activeLeague.competition,
      lowerTemplate,
    );
    const [upper, lower] = system.competitions;
    const rosters = Object.fromEntries(system.competitions.map(competition => [
      competition.id,
      [...competition.clubIds],
    ]));
    const clubIds = system.competitions.flatMap(competition => competition.clubIds);
    const clubs = [...new Set(clubIds)].map(id => clubCatalogById[id]);
    const teamsById = Object.fromEntries(clubs.map(club => [club.id, club]));
    const ratings = createClosedTwoTierRatings(
      activeRatings,
      rosters[upper.id],
      rosters[lower.id],
    );
    const dynamicState = createDynamicStrength(clubs, ratings);
    const model = new IndependentPoissonModel();
    const upperState = createCompetitionSeasonState(upper, rosters[upper.id]);
    const lowerState = createCompetitionSeasonState(lower, rosters[lower.id]);
    const upperEnvironment = {
      season: 1,
      teamsById,
      dynamicState,
      model,
      rng: createRng(101),
    };
    const lowerEnvironment = {
      season: 1,
      teamsById,
      dynamicState,
      model,
      rng: createRng(202),
    };

    advanceCompetitionToFixture(
      upperState,
      upperState.fixtures.length,
      upperEnvironment,
    );
    advanceCompetitionToFixture(
      lowerState,
      lowerState.fixtures.length,
      lowerEnvironment,
    );
    const upperTable = finalizeCompetitionTable(upperState, upperEnvironment);
    const lowerTable = finalizeCompetitionTable(lowerState, lowerEnvironment);
    const playoffWinner = simulateEflSixTeamPromotionPlayoff(
      lowerState,
      lowerTable,
      lowerEnvironment,
    );
    const rollover = rolloverClosedTwoTierRosters({
      system,
      clubs,
      currentRosters: rosters,
      upperTable,
      lowerTable,
      lowerPlayoffWinnerId: playoffWinner,
    });

    expect(upperState.matches).toHaveLength(380);
    expect(lowerState.matches).toHaveLength(552);
    expect(lowerState.postseasonMatches).toHaveLength(7);
    expect(upperTable.every(row => row.played === 38)).toBe(true);
    expect(lowerTable.every(row => row.played === 46)).toBe(true);
    expect(rollover.resolution.movements.filter(
      movement => movement.direction === 'promotion',
    )).toHaveLength(3);
    expect(rollover.resolution.movements.filter(
      movement => movement.direction === 'relegation',
    )).toHaveLength(3);
    expect(rollover.rosters[upper.id]).toHaveLength(20);
    expect(rollover.rosters[lower.id]).toHaveLength(24);
    expect(
      rollover.rosters[upper.id].filter(id => rosters[lower.id].includes(id)),
    ).toHaveLength(3);
    expect(
      rollover.rosters[lower.id].filter(id => rosters[upper.id].includes(id)),
    ).toHaveLength(3);
    expect(new Set(Object.values(rollover.rosters).flat()).size).toBe(44);
    expect(rollover.rosters[upper.id]).toContain(lowerTable[0].teamId);
    expect(rollover.rosters[upper.id]).toContain(lowerTable[1].teamId);
    expect(rollover.rosters[upper.id]).toContain(playoffWinner);
  });
});
