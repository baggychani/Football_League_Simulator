import { describe, expect, it } from 'vitest';
import {
  validateCalibrationPayload,
  validateMarketMeta,
  validateMarketSavePayload,
  validateMarketSnapshot,
  stampedRatingsName,
} from '../../scripts/local-api';
import { activeLeague } from '../data/league-catalog/active';
import calibratedRatings from '../data/calibrated-ratings.json';
import { teams } from '../data/teams';

function completeTeamMap(value: number) {
  return Object.fromEntries(teams.map(team => [team.id, value]));
}

function validCalibrationPayload() {
  return {
    schemaVersion: 2,
    calibrationMode: 'static-baseline',
    ratings: completeTeamMap(0),
    normalizedTargets: Object.fromEntries(teams.map(team => [team.id, 1 / teams.length])),
    simulatedProbability: Object.fromEntries(teams.map(team => [team.id, 1 / teams.length])),
    teamDiagnostics: Object.fromEntries(teams.map(team => [team.id, {
      target: 1 / teams.length,
      simulated: 1 / teams.length,
      residual: 0,
      tolerance: 0.01,
      normalizedResidual: 0,
      standardError: 0.001,
      confidenceInterval95: {
        low: 1 / teams.length - 0.002,
        high: 1 / teams.length + 0.002,
      },
      withinTolerance: true,
    }])),
    teamsOutsideTolerance: [],
    createdAt: new Date().toISOString(),
  };
}

function validMeta() {
  return {
    slug: activeLeague.market!.eventSlug,
    title: 'EPL: 2027 Champion',
    fetchedAt: new Date().toISOString(),
    source: 'https://gamma-api.polymarket.com/events?slug=test',
    matchedTeams: teams.map(team => team.id),
    unmatchedPolymarket: [],
    missingTeams: [],
    changedTeams: [],
  };
}

describe('local API validation', () => {
  it('creates collision-resistant timestamped calibration backup names', () => {
    const date = new Date('2026-07-28T10:11:12.345Z');
    expect(stampedRatingsName(date, 'abc12345'))
      .toBe('calibrated-ratings_2026-07-28_10-11-12-345_abc12345.json');
    expect(stampedRatingsName(date, 'def67890'))
      .not.toBe(stampedRatingsName(date, 'abc12345'));
  });
  it('accepts a complete calibration payload', () => {
    const payload = validCalibrationPayload();
    payload.ratings.arsenal = -0.08;
    payload.ratings['man-city'] = 0.21;
    expect(() => validateCalibrationPayload(payload)).not.toThrow();
    expect(() => validateCalibrationPayload(calibratedRatings)).not.toThrow();
  });

  it('rejects calibration payloads with missing or non-finite ratings', () => {
    const missing = validCalibrationPayload();
    delete (missing.ratings as Record<string, number>).arsenal;
    expect(() => validateCalibrationPayload(missing)).toThrow(/ratings/);

    const nonFinite = validCalibrationPayload();
    (nonFinite.ratings as Record<string, number>).arsenal = Number.NaN;
    expect(() => validateCalibrationPayload(nonFinite)).toThrow(/ratings\.arsenal/);
  });

  it('rejects calibration output whose displayed tolerance status is inconsistent', () => {
    const missingProbability = validCalibrationPayload();
    delete (missingProbability.simulatedProbability as Record<string, number>).arsenal;
    expect(() => validateCalibrationPayload(missingProbability))
      .toThrow(/simulatedProbability/);

    const inconsistent = validCalibrationPayload();
    (inconsistent as { teamsOutsideTolerance: string[] })
      .teamsOutsideTolerance = ['arsenal'];
    expect(() => validateCalibrationPayload(inconsistent))
      .toThrow(/must match teamDiagnostics/);

    const inconsistentProbability = validCalibrationPayload();
    inconsistentProbability.teamDiagnostics.arsenal.simulated += 0.001;
    expect(() => validateCalibrationPayload(inconsistentProbability))
      .toThrow(/invalid status|disagrees/);
  });

  it('rejects invalid market prices and malformed metadata', () => {
    const market = completeTeamMap(0.01);
    market.arsenal = 1.1;
    expect(() => validateMarketSnapshot(market)).toThrow(/market\.arsenal/);
    expect(() => validateMarketSavePayload({ market: completeTeamMap(0.01), meta: {} })).toThrow(/meta/);
  });

  it('accepts a complete market save payload', () => {
    expect(() => validateMarketSavePayload({ market: completeTeamMap(0.01), meta: validMeta() })).not.toThrow();
  });

  it('rejects market metadata that can corrupt the next active-data load', () => {
    expect(() => validateMarketMeta({
      ...validMeta(),
      fetchedAt: 'not-a-date',
    })).toThrow(/fetchedAt/);
    expect(() => validateMarketMeta({
      ...validMeta(),
      matchedTeams: [...teams.map(team => team.id), teams[0].id],
    })).toThrow(/duplicates/);
    expect(() => validateMarketMeta({
      ...validMeta(),
      matchedTeams: teams.slice(1).map(team => team.id),
      missingTeams: [],
    })).toThrow(/partition/);
    expect(() => validateMarketMeta({
      ...validMeta(),
      changedTeams: ['not-a-club'],
    })).toThrow(/unknown team ID/);
    expect(() => validateMarketMeta({
      ...validMeta(),
      slug: 'another-event',
    })).toThrow(/active market provider/);
    expect(() => validateMarketMeta({
      ...validMeta(),
      source: 'http://example.com/event',
    })).toThrow(/HTTPS/);
  });
});
