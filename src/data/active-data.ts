import calibratedRatings from './calibrated-ratings.json';
import defaultMarket from './default-market.json';
import polymarketMeta from './polymarket-meta.json';
import { activeLeague } from './league-catalog/active';

function assertExactFiniteTeamMap(
  label: string,
  candidate: Readonly<Record<string, unknown>>,
  bounds?: { min: number; max: number },
) {
  const expectedIds = new Set(activeLeague.clubs.map(club => club.id));
  const keys = Object.keys(candidate);
  const missing = [...expectedIds].filter(id => !(id in candidate));
  const extra = keys.filter(id => !expectedIds.has(id));
  const invalid = keys.filter(id => {
    const value = candidate[id];
    return typeof value !== 'number'
      || !Number.isFinite(value)
      || (bounds !== undefined && (value < bounds.min || value > bounds.max));
  });
  if (missing.length || extra.length || invalid.length) {
    throw new Error(
      `${label} does not match ${activeLeague.competition.id}: `
      + `missing=[${missing.join(',')}], extra=[${extra.join(',')}], `
      + `invalid=[${invalid.join(',')}]`,
    );
  }
}

function assertMarketMeta(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Active market metadata must be an object.');
  }
  const value = candidate as Record<string, unknown>;
  const stringFields = ['slug', 'title', 'fetchedAt', 'source'];
  const arrayFields = [
    'matchedTeams',
    'unmatchedPolymarket',
    'missingTeams',
    'changedTeams',
  ];
  if (
    stringFields.some(field =>
      typeof value[field] !== 'string' || value[field].length === 0
    )
    || arrayFields.some(field =>
      !Array.isArray(value[field])
      || value[field].some(item => typeof item !== 'string')
    )
  ) {
    throw new Error('Active market metadata has an invalid shape.');
  }
  if (
    !Number.isFinite(Date.parse(value.fetchedAt as string))
    || !/^https:\/\//.test(value.source as string)
    || arrayFields.some(field =>
      new Set(value[field] as string[]).size
      !== (value[field] as string[]).length
    )
  ) {
    throw new Error('Active market metadata has invalid provenance.');
  }
  if (
    activeLeague.market
    && value.slug !== activeLeague.market.eventSlug
  ) {
    throw new Error('Active market metadata slug does not match the provider.');
  }
  const expectedIds = new Set(activeLeague.clubs.map(club => club.id));
  const describedIds = new Set([
    ...(value.matchedTeams as string[]),
    ...(value.missingTeams as string[]),
  ]);
  const invalidChanged = (value.changedTeams as string[])
    .filter(id => !expectedIds.has(id));
  const matched = value.matchedTeams as string[];
  const missing = value.missingTeams as string[];
  if (
    matched.some(id => missing.includes(id))
    || matched.length + missing.length !== expectedIds.size
    || describedIds.size !== expectedIds.size
    || [...describedIds].some(id => !expectedIds.has(id))
    || invalidChanged.length
  ) {
    throw new Error('Active market metadata does not match the active roster.');
  }
}

assertExactFiniteTeamMap(
  'Active ratings',
  calibratedRatings.ratings as Readonly<Record<string, unknown>>,
);
const simulatedProbabilityTotal = Object.values(
  calibratedRatings.simulatedProbability,
).reduce((sum, value) => sum + value, 0);
if (Math.abs(simulatedProbabilityTotal - 1) > 1e-8) {
  throw new Error('Active simulated probabilities must sum to one.');
}
if (
  !Object.values(defaultMarket).some(value => value > 0)
) {
  throw new Error('Active market snapshot must contain a positive price.');
}
assertExactFiniteTeamMap(
  'Active simulated probability',
  calibratedRatings.simulatedProbability as Readonly<Record<string, unknown>>,
  { min: 0, max: 1 },
);
assertExactFiniteTeamMap(
  'Active market snapshot',
  defaultMarket as Readonly<Record<string, unknown>>,
  { min: 0, max: 1 },
);
assertMarketMeta(polymarketMeta);

const activeDiagnostics =
  calibratedRatings.teamDiagnostics as Readonly<Record<string, unknown>>;
const expectedDiagnosticIds = new Set(activeLeague.clubs.map(club => club.id));
const diagnosticKeys = Object.keys(activeDiagnostics);
if (
  diagnosticKeys.length !== expectedDiagnosticIds.size
  || diagnosticKeys.some(id => !expectedDiagnosticIds.has(id))
) {
  throw new Error('Active calibration diagnostics do not match the active roster.');
}
const outsideTolerance = new Set<string>(
  calibratedRatings.teamsOutsideTolerance as string[],
);
diagnosticKeys.forEach(id => {
  const diagnostic = activeDiagnostics[id];
  if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) {
    throw new Error(`Active calibration diagnostic is invalid: ${id}`);
  }
  const item = diagnostic as Record<string, unknown>;
  const interval = item.confidenceInterval95;
  if (
    typeof item.withinTolerance !== 'boolean'
    || typeof item.tolerance !== 'number'
    || !Number.isFinite(item.tolerance)
    || item.tolerance <= 0
    || typeof item.target !== 'number'
    || !Number.isFinite(item.target)
    || typeof item.simulated !== 'number'
    || !Number.isFinite(item.simulated)
    || typeof item.residual !== 'number'
    || !Number.isFinite(item.residual)
    || typeof item.normalizedResidual !== 'number'
    || !Number.isFinite(item.normalizedResidual)
    || !interval
    || typeof interval !== 'object'
    || Array.isArray(interval)
  ) {
    throw new Error(`Active calibration diagnostic status is invalid: ${id}`);
  }
  const confidence = interval as Record<string, unknown>;
  const residual = item.residual as number;
  const simulated = item.simulated as number;
  const target = item.target as number;
  const tolerance = item.tolerance as number;
  const normalizedResidual = item.normalizedResidual as number;
  const withinTolerance = item.withinTolerance as boolean;
  if (
    typeof confidence.low !== 'number'
    || !Number.isFinite(confidence.low)
    || typeof confidence.high !== 'number'
    || !Number.isFinite(confidence.high)
    || confidence.low < 0
    || confidence.high > 1
    || confidence.low > confidence.high
    || simulated < confidence.low - 1e-12
    || simulated > confidence.high + 1e-12
    || Math.abs(
      residual - (simulated - target)
    ) > 1e-10
    || Math.abs(
      normalizedResidual - residual / tolerance
    ) > 1e-10
    || withinTolerance
      !== (Math.abs(residual) <= tolerance + 1e-12)
    || Math.abs(
      simulated
      - calibratedRatings.simulatedProbability[
        id as keyof typeof calibratedRatings.simulatedProbability
      ]
    ) > 1e-10
  ) {
    throw new Error(`Active calibration diagnostic values are inconsistent: ${id}`);
  }
  if (outsideTolerance.has(id) === withinTolerance) {
    throw new Error(`Active calibration tolerance summary is inconsistent: ${id}`);
  }
});
if (
  typeof calibratedRatings.createdAt !== 'string'
  || !Number.isFinite(Date.parse(calibratedRatings.createdAt))
) {
  throw new Error('Active calibration timestamp is invalid.');
}

/**
 * Binds league metadata to the current ratings and market artifacts.
 * A future league selector can replace this module with a registry lookup
 * without changing simulator or presentation code.
 */
export const activeRatingsArtifact = calibratedRatings;
export const activeRatings =
  calibratedRatings.ratings as Readonly<Record<string, number>>;
export const activeMarketSnapshot =
  defaultMarket as Readonly<Record<string, number>>;
export const activeMarketMeta = polymarketMeta;
