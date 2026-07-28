import type {
  CompetitionDefinition,
} from '../league-catalog/types';
import { regularSeasonRounds } from '../league-catalog/types';
import type {
  DataProvenance,
  MatchDataSnapshot,
  RealMatchRecord,
  ScorePart,
} from './types';

function validTimestamp(value: string | undefined) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateProvenance(
  value: DataProvenance,
  label: string,
  errors: string[],
) {
  if (!value.provider || !/^https:\/\//.test(value.sourceUrl)) {
    errors.push(`${label}: invalid provider/source URL`);
  }
  if (!validTimestamp(value.fetchedAt)) {
    errors.push(`${label}: invalid fetchedAt`);
  }
  if (value.licenseUrl && !/^https:\/\//.test(value.licenseUrl)) {
    errors.push(`${label}: invalid license URL`);
  }
}

function validateScorePart(
  value: ScorePart | undefined,
  label: string,
  errors: string[],
) {
  if (!value) return;
  if (
    !Number.isSafeInteger(value.home)
    || value.home < 0
    || !Number.isSafeInteger(value.away)
    || value.away < 0
  ) {
    errors.push(`${label}: scores must be non-negative integers`);
  }
}

function validateMatch(
  match: RealMatchRecord,
  competition: CompetitionDefinition,
  clubIds: ReadonlySet<string>,
  errors: string[],
) {
  const label = `match ${match.id || '(missing id)'}`;
  if (!match.id.trim()) errors.push(`${label}: missing stable ID`);
  if (
    match.competitionId !== competition.id
    || match.seasonId !== competition.season.id
  ) {
    errors.push(`${label}: competition/season mismatch`);
  }
  if (
    !clubIds.has(match.homeClubId)
    || !clubIds.has(match.awayClubId)
    || match.homeClubId === match.awayClubId
  ) {
    errors.push(`${label}: invalid participants`);
  }
  if (
    match.round !== undefined
    && (
      !Number.isSafeInteger(match.round)
      || match.round < 1
      || match.round > regularSeasonRounds(competition)
    )
  ) {
    errors.push(`${label}: invalid round`);
  }
  if (
    match.status !== 'postponed'
    && match.status !== 'cancelled'
    && !validTimestamp(match.kickoffUtc)
  ) {
    errors.push(`${label}: kickoffUtc required for this status`);
  }
  if (
    match.kickoffUtc
    && (
      !validTimestamp(match.kickoffUtc)
      || !match.kickoffUtc.endsWith('Z')
    )
  ) {
    errors.push(`${label}: kickoffUtc must be an ISO UTC timestamp`);
  }
  if (
    match.previousKickoffUtc
    && (
      !validTimestamp(match.previousKickoffUtc)
      || !match.previousKickoffUtc.endsWith('Z')
    )
  ) {
    errors.push(`${label}: invalid previousKickoffUtc`);
  }
  if (
    match.venueTimeZone
    && !Intl.supportedValuesOf('timeZone').includes(match.venueTimeZone)
  ) {
    errors.push(`${label}: invalid IANA venue time zone`);
  }
  if (!validTimestamp(match.updatedAt)) {
    errors.push(`${label}: invalid updatedAt`);
  }
  if (
    match.attendance !== undefined
    && (!Number.isSafeInteger(match.attendance) || match.attendance < 0)
  ) {
    errors.push(`${label}: invalid attendance`);
  }
  validateProvenance(match.provenance, label, errors);
  validateScorePart(match.score?.halfTime, `${label} halfTime`, errors);
  validateScorePart(match.score?.fullTime, `${label} fullTime`, errors);
  validateScorePart(match.score?.extraTime, `${label} extraTime`, errors);
  validateScorePart(match.score?.penalties, `${label} penalties`, errors);

  if (
    (match.status === 'finished' || match.status === 'awarded')
    && !match.score?.fullTime
  ) {
    errors.push(`${label}: final status requires a full-time score`);
  }
  if (
    match.status !== 'finished'
    && match.status !== 'awarded'
    && match.score?.penalties
  ) {
    errors.push(`${label}: penalties require a final status`);
  }
  if (match.stage === 'regular-season' && match.score?.extraTime) {
    errors.push(`${label}: regular-season matches cannot have extra time`);
  }
  if (match.score?.penalties) {
    const preShootout = match.score.extraTime ?? match.score.fullTime;
    if (
      !preShootout
      || preShootout.home !== preShootout.away
      || match.score.penalties.home === match.score.penalties.away
    ) {
      errors.push(`${label}: invalid penalty-shootout score`);
    }
  }
}

export function validateMatchDataSnapshot(
  value: unknown,
  competition: CompetitionDefinition,
) {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['match-data snapshot must be an object'];
  }
  const candidate = value as Partial<MatchDataSnapshot>;
  if (
    !Array.isArray(candidate.matches)
    || !Array.isArray(candidate.standingAdjustments)
  ) {
    return ['match-data snapshot requires matches and standingAdjustments arrays'];
  }
  const snapshot = candidate as MatchDataSnapshot;
  if (snapshot.schemaVersion !== 1) {
    errors.push('unsupported match-data schema version');
  }
  if (
    snapshot.competitionId !== competition.id
    || snapshot.seasonId !== competition.season.id
  ) {
    errors.push('snapshot competition/season mismatch');
  }
  if (!validTimestamp(snapshot.generatedAt)) {
    errors.push('invalid snapshot generatedAt');
  }
  const clubIds = new Set(competition.clubIds);
  const matchIds = new Set<string>();
  const providerIds = new Set<string>();
  snapshot.matches.forEach(match => {
    validateMatch(match, competition, clubIds, errors);
    if (matchIds.has(match.id)) errors.push(`duplicate match ID ${match.id}`);
    matchIds.add(match.id);
    if (match.provenance.providerRecordId) {
      const providerKey =
        `${match.provenance.provider}:${match.provenance.providerRecordId}`;
      if (providerIds.has(providerKey)) {
        errors.push(`duplicate provider match ID ${providerKey}`);
      }
      providerIds.add(providerKey);
    }
  });

  const adjustmentIds = new Set<string>();
  snapshot.standingAdjustments.forEach(adjustment => {
    const label = `standing adjustment ${adjustment.id || '(missing id)'}`;
    if (!adjustment.id.trim() || adjustmentIds.has(adjustment.id)) {
      errors.push(`${label}: missing or duplicate ID`);
    }
    adjustmentIds.add(adjustment.id);
    if (
      adjustment.competitionId !== competition.id
      || adjustment.seasonId !== competition.season.id
      || !clubIds.has(adjustment.clubId)
      || !Number.isSafeInteger(adjustment.pointsDelta)
      || adjustment.pointsDelta === 0
      || !validTimestamp(adjustment.effectiveAt)
      || !adjustment.reason.trim()
    ) {
      errors.push(`${label}: invalid adjustment`);
    }
    validateProvenance(adjustment.provenance, label, errors);
  });

  if (snapshot.coverage === 'complete') {
    const regularMatches = snapshot.matches.filter(
      match => match.stage === 'regular-season',
    );
    const expected = competition.clubIds.length
      * (competition.clubIds.length - 1);
    if (regularMatches.length !== expected) {
      errors.push(
        `complete schedule has ${regularMatches.length}/${expected} matches`,
      );
    }
    const directedPairs = new Set(
      regularMatches.map(match => `${match.homeClubId}:${match.awayClubId}`),
    );
    if (directedPairs.size !== regularMatches.length) {
      errors.push('complete schedule contains a duplicate home/away pairing');
    }
  }
  return errors;
}

export function assertMatchDataSnapshotValid(
  snapshot: unknown,
  competition: CompetitionDefinition,
): asserts snapshot is MatchDataSnapshot {
  const errors = validateMatchDataSnapshot(snapshot, competition);
  if (errors.length) {
    throw new Error(`Invalid match-data snapshot:\n- ${errors.join('\n- ')}`);
  }
}
