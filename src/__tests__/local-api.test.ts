import { describe, expect, it } from 'vitest';
import {
  validateCalibrationPayload,
  validateMarketSavePayload,
  validateMarketSnapshot,
} from '../../scripts/local-api';
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
    teamDiagnostics: Object.fromEntries(teams.map(team => [team.id, {}])),
    teamsOutsideTolerance: [],
  };
}

function validMeta() {
  return {
    slug: 'epl-2027-champion-test',
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
  it('accepts a complete calibration payload', () => {
    expect(() => validateCalibrationPayload(validCalibrationPayload())).not.toThrow();
  });

  it('rejects calibration payloads with missing or non-finite ratings', () => {
    const missing = validCalibrationPayload();
    delete (missing.ratings as Record<string, number>).arsenal;
    expect(() => validateCalibrationPayload(missing)).toThrow(/ratings/);

    const nonFinite = validCalibrationPayload();
    (nonFinite.ratings as Record<string, number>).arsenal = Number.NaN;
    expect(() => validateCalibrationPayload(nonFinite)).toThrow(/ratings\.arsenal/);
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
});
