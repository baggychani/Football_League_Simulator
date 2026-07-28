import { describe, expect, it } from 'vitest';
import { premierLeague2026 } from '../data/league-catalog/england';
import type {
  MatchDataSnapshot,
  RealMatchRecord,
} from '../data/football-data/types';
import {
  assertMatchDataSnapshotValid,
  validateMatchDataSnapshot,
} from '../data/football-data/validation';

const match = (
  overrides: Partial<RealMatchRecord> = {},
): RealMatchRecord => ({
  id: 'eng-premier-league:2026-27:arsenal:aston-villa:1',
  competitionId: premierLeague2026.id,
  seasonId: premierLeague2026.season.id,
  stage: 'regular-season',
  round: 1,
  status: 'scheduled',
  homeClubId: 'arsenal',
  awayClubId: 'aston-villa',
  kickoffUtc: '2026-08-15T14:00:00.000Z',
  venueTimeZone: 'Europe/London',
  venue: {
    name: 'Emirates Stadium',
    city: 'London',
    neutral: false,
  },
  provenance: {
    provider: 'official-competition',
    providerRecordId: 'fixture-1',
    sourceUrl: 'https://www.premierleague.com/',
    fetchedAt: '2026-07-28T12:00:00.000Z',
  },
  updatedAt: '2026-07-28T12:00:00.000Z',
  ...overrides,
});

const snapshot = (
  matches: readonly RealMatchRecord[],
): MatchDataSnapshot => ({
  schemaVersion: 1,
  competitionId: premierLeague2026.id,
  seasonId: premierLeague2026.season.id,
  generatedAt: '2026-07-28T12:00:00.000Z',
  coverage: 'partial',
  matches,
  standingAdjustments: [],
});

describe('provider-neutral football data contract', () => {
  it('accepts a sourced scheduled fixture with UTC and local-zone identity', () => {
    expect(() =>
      assertMatchDataSnapshotValid(snapshot([match()]), premierLeague2026)
    ).not.toThrow();
  });

  it('requires final scores and rejects extra time in a league match', () => {
    expect(validateMatchDataSnapshot(
      snapshot([match({ status: 'finished' })]),
      premierLeague2026,
    )).toEqual(expect.arrayContaining([
      expect.stringMatching(/full-time score/),
    ]));
    expect(validateMatchDataSnapshot(
      snapshot([match({
        status: 'finished',
        score: {
          fullTime: { home: 1, away: 1 },
          extraTime: { home: 2, away: 1 },
        },
      })]),
      premierLeague2026,
    )).toEqual(expect.arrayContaining([
      expect.stringMatching(/cannot have extra time/),
    ]));
  });

  it('rejects duplicate provider IDs and invalid participants', () => {
    const duplicate = match({
      id: 'second',
      homeClubId: 'arsenal',
      awayClubId: 'unknown',
    });
    const errors = validateMatchDataSnapshot(
      snapshot([match(), duplicate]),
      premierLeague2026,
    );
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/invalid participants/),
      expect.stringMatching(/duplicate provider match ID/),
    ]));
  });

  it('keeps administrative point changes sourced and separate from scores', () => {
    const value: MatchDataSnapshot = {
      ...snapshot([]),
      standingAdjustments: [{
        id: 'deduction-1',
        competitionId: premierLeague2026.id,
        seasonId: premierLeague2026.season.id,
        clubId: 'arsenal',
        pointsDelta: -3,
        effectiveAt: '2026-10-01T09:00:00.000Z',
        reason: 'Competition disciplinary decision',
        provenance: {
          provider: 'official-competition',
          sourceUrl: 'https://www.premierleague.com/',
          fetchedAt: '2026-10-01T09:05:00.000Z',
        },
      }],
    };
    expect(() =>
      assertMatchDataSnapshotValid(value, premierLeague2026)
    ).not.toThrow();
  });
});
