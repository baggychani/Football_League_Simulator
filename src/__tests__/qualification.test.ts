import { describe, expect, it } from 'vitest';
import { calculateQualificationStatuses } from '../domain/qualification';
import type { LeagueRow, QualificationRules } from '../domain/types';

const rules: QualificationRules = {
  championPosition: 1,
  championsLeaguePositions: [1, 2, 3, 4, 5],
  europaLeaguePositions: [6],
};
const calculate = (rows: LeagueRow[]) =>
  calculateQualificationStatuses(rows, 38, rules);
const calculateWithRelegation = (rows: LeagueRow[]) =>
  calculateQualificationStatuses(rows, 38, rules, 3, [18, 19, 20]);

function row(teamId: string, position: number, points: number, played: number): LeagueRow {
  return {
    teamId,
    position,
    played,
    points,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  };
}

describe('qualification status', () => {
  it('does not award a status before any match and shows final statuses after the season ends', () => {
    expect(calculate([
      row('a', 1, 0, 0),
      row('b', 2, 0, 0),
    ])).toEqual({});
    const finalStatuses = calculate([
      row('a', 1, 90, 38),
      row('b', 2, 80, 38),
      row('c', 3, 70, 38),
      row('d', 4, 65, 38),
      row('e', 5, 60, 38),
      row('f', 6, 55, 38),
      row('g', 7, 50, 38),
    ]);
    expect(finalStatuses).toEqual({
      a: 'champion',
      b: 'champions',
      c: 'champions',
      d: 'champions',
      e: 'champions',
      f: 'europa',
    });
  });

  it('awards the title only when nobody can equal the leader on points', () => {
    const notYet = calculate([
      row('a', 1, 80, 35),
      row('b', 2, 71, 35),
      row('c', 3, 50, 35),
    ]);
    expect(notYet.a).not.toBe('champion');

    const clinched = calculate([
      row('a', 1, 81, 35),
      row('b', 2, 71, 35),
      row('c', 3, 50, 35),
    ]);
    expect(clinched.a).toBe('champion');
  });

  it('uses one highest-priority badge and promotes Europa to Champions League', () => {
    const europa = calculate([
      row('a', 1, 90, 34),
      row('b', 2, 86, 34),
      row('c', 3, 82, 34),
      row('d', 4, 78, 34),
      row('e', 5, 74, 34),
      row('f', 6, 62, 34),
      row('g', 7, 49, 34),
    ]);
    expect(europa.f).toBe('europa');

    const champions = calculate([
      row('a', 1, 90, 35),
      row('b', 2, 86, 35),
      row('c', 3, 82, 35),
      row('d', 4, 78, 35),
      row('f', 5, 70, 35),
      row('e', 6, 58, 35),
      row('g', 7, 49, 35),
    ]);
    expect(champions.f).toBe('champions');
  });

  it('marks relegation only after survival is mathematically impossible', () => {
    const safeTeams = Array.from({ length: 17 }, (_, index) =>
      row(`safe-${index + 1}`, index + 1, 50, 35)
    );
    const clinched = calculateWithRelegation([
      ...safeTeams,
      row('bottom-a', 18, 36, 35),
      row('bottom-b', 19, 34, 35),
      row('bottom-c', 20, 32, 35),
    ]);
    expect(clinched['bottom-a']).toBe('relegated');
    expect(clinched['bottom-b']).toBe('relegated');
    expect(clinched['bottom-c']).toBe('relegated');

    const stillAlive = calculateWithRelegation([
      ...safeTeams,
      row('bottom-a', 18, 44, 35),
      row('bottom-b', 19, 42, 35),
      row('bottom-c', 20, 40, 35),
    ]);
    expect(stillAlive['bottom-a']).toBeUndefined();
  });

  it('shows all final European and relegation statuses at round 38', () => {
    const finalRows = Array.from({ length: 20 }, (_, index) =>
      row(`team-${index + 1}`, index + 1, 90 - index * 3, 38)
    );
    const statuses = calculateWithRelegation(finalRows);
    expect(statuses['team-1']).toBe('champion');
    expect(statuses['team-5']).toBe('champions');
    expect(statuses['team-6']).toBe('europa');
    expect(statuses['team-18']).toBe('relegated');
    expect(statuses['team-19']).toBe('relegated');
    expect(statuses['team-20']).toBe('relegated');
  });
});
