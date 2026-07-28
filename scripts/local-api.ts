import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { activeLeague } from '../src/data/league-catalog/active';
import { teams } from '../src/data/teams';
import { replaceFile } from './file-system';

export const LOCAL_API_HEADER = 'X-Football-Local-Api';
export const LOCAL_API_HEADER_VALUE = '1';
export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 30_000;

export interface ValidatedMarketMeta {
  slug: string;
  title: string;
  fetchedAt: string;
  source: string;
  matchedTeams: string[];
  unmatchedPolymarket: string[];
  missingTeams: string[];
  changedTeams: string[];
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactTeamSet(value: unknown, fieldName: string) {
  if (!isPlainObject(value)) throw new HttpError(400, `${fieldName} must be an object.`);
  const expected = new Set(teams.map(team => team.id));
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some(id => !expected.has(id))) {
    throw new HttpError(400, `${fieldName} must contain exactly the known team IDs.`);
  }
  return value;
}

function assertFiniteTeamValues(
  value: Record<string, unknown>,
  fieldName: string,
  options?: { min?: number; max?: number },
) {
  for (const [id, candidate] of Object.entries(value)) {
    if (
      typeof candidate !== 'number'
      || !Number.isFinite(candidate)
      || (options?.min !== undefined && candidate < options.min)
      || (options?.max !== undefined && candidate > options.max)
    ) {
      const range = options?.min !== undefined && options.max !== undefined
        ? `a number between ${options.min} and ${options.max}`
        : 'a finite number';
      throw new HttpError(400, `${fieldName}.${id} must be ${range}.`);
    }
  }
}

export function validateMarketSnapshot(value: unknown): Record<string, number> {
  const market = assertExactTeamSet(value, 'market');
  assertFiniteTeamValues(market, 'market', { min: 0, max: 1 });
  if (Object.values(market).every(price => price === 0)) {
    throw new HttpError(400, 'Market must contain at least one positive price.');
  }
  return market as Record<string, number>;
}

function validateStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new HttpError(400, `${fieldName} must be an array of strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new HttpError(400, `${fieldName} must not contain duplicates.`);
  }
  return value;
}

export function validateMarketMeta(value: unknown): ValidatedMarketMeta {
  if (!isPlainObject(value)) throw new HttpError(400, 'meta must be an object.');
  for (const field of ['slug', 'title', 'fetchedAt', 'source']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new HttpError(400, `meta.${field} must be a non-empty string.`);
    }
  }
  for (const field of ['matchedTeams', 'unmatchedPolymarket', 'missingTeams', 'changedTeams']) {
    validateStringArray(value[field], `meta.${field}`);
  }
  if (!Number.isFinite(Date.parse(value.fetchedAt as string))) {
    throw new HttpError(400, 'meta.fetchedAt must be a valid timestamp.');
  }
  try {
    const source = new URL(value.source as string);
    if (source.protocol !== 'https:') throw new Error('not HTTPS');
  } catch {
    throw new HttpError(400, 'meta.source must be an HTTPS URL.');
  }
  if (
    activeLeague.market
    && value.slug !== activeLeague.market.eventSlug
  ) {
    throw new HttpError(400, 'meta.slug does not match the active market provider.');
  }

  const expectedIds = new Set(teams.map(team => team.id));
  const matched = value.matchedTeams as string[];
  const missing = value.missingTeams as string[];
  const changed = value.changedTeams as string[];
  const described = new Set([...matched, ...missing]);
  if (
    matched.some(id => missing.includes(id))
    || described.size !== expectedIds.size
    || [...described].some(id => !expectedIds.has(id))
  ) {
    throw new HttpError(
      400,
      'meta.matchedTeams and meta.missingTeams must partition the active roster.',
    );
  }
  if (changed.some(id => !expectedIds.has(id))) {
    throw new HttpError(400, 'meta.changedTeams contains an unknown team ID.');
  }
  return value as unknown as ValidatedMarketMeta;
}

export function validateMarketSavePayload(value: unknown) {
  if (!isPlainObject(value)) throw new HttpError(400, 'Market payload must be an object.');
  return {
    market: validateMarketSnapshot(value.market),
    meta: validateMarketMeta(value.meta),
  };
}

export function validateCalibrationPayload(value: unknown) {
  if (!isPlainObject(value)) throw new HttpError(400, 'Calibration payload must be an object.');
  if (value.schemaVersion !== 2) throw new HttpError(400, 'Unsupported calibration schemaVersion.');
  if (value.calibrationMode !== 'static-baseline') throw new HttpError(400, 'Expected static-baseline calibration mode.');

  const ratings = assertExactTeamSet(value.ratings, 'ratings');
  assertFiniteTeamValues(ratings, 'ratings');
  const diagnostics = assertExactTeamSet(value.teamDiagnostics, 'teamDiagnostics');
  for (const [id, item] of Object.entries(diagnostics)) {
    if (!isPlainObject(item)) {
      throw new HttpError(400, `teamDiagnostics.${id} must be an object.`);
    }
    for (const field of [
      'target',
      'simulated',
      'residual',
      'tolerance',
      'normalizedResidual',
      'standardError',
    ]) {
      if (typeof item[field] !== 'number' || !Number.isFinite(item[field])) {
        throw new HttpError(400, `teamDiagnostics.${id}.${field} must be finite.`);
      }
    }
    const interval = item.confidenceInterval95;
    if (
      !isPlainObject(interval)
      || typeof interval.low !== 'number'
      || !Number.isFinite(interval.low)
      || typeof interval.high !== 'number'
      || !Number.isFinite(interval.high)
      || interval.low < 0
      || interval.high > 1
      || interval.low > interval.high
    ) {
      throw new HttpError(
        400,
        `teamDiagnostics.${id}.confidenceInterval95 is invalid.`,
      );
    }
    const residual = item.residual as number;
    const tolerance = item.tolerance as number;
    const simulated = item.simulated as number;
    const target = item.target as number;
    if (
      target < 0
      || target > 1
      || simulated < 0
      || simulated > 1
      || tolerance <= 0
      || (item.standardError as number) < 0
      || typeof item.withinTolerance !== 'boolean'
      || Math.abs(residual - (simulated - target)) > 1e-10
      || Math.abs(
        (item.normalizedResidual as number) - residual / tolerance,
      ) > 1e-10
      || item.withinTolerance !== (Math.abs(residual) <= tolerance + 1e-12)
      || simulated < (interval.low as number) - 1e-12
      || simulated > (interval.high as number) + 1e-12
    ) {
      throw new HttpError(400, `teamDiagnostics.${id} has invalid status fields.`);
    }
  }
  if (value.normalizedTargets !== undefined) {
    const targets = assertExactTeamSet(value.normalizedTargets, 'normalizedTargets');
    assertFiniteTeamValues(targets, 'normalizedTargets', { min: 0, max: 1 });
    if (Math.abs((Object.values(targets) as number[]).reduce(
      (sum, item) => sum + item,
      0,
    ) - 1) > 1e-8) {
      throw new HttpError(400, 'normalizedTargets must sum to one.');
    }
  }
  const probabilities = assertExactTeamSet(
    value.simulatedProbability,
    'simulatedProbability',
  );
  assertFiniteTeamValues(
    probabilities,
    'simulatedProbability',
    { min: 0, max: 1 },
  );
  if (Math.abs((Object.values(probabilities) as number[]).reduce(
    (sum, item) => sum + item,
    0,
  ) - 1) > 1e-8) {
    throw new HttpError(400, 'simulatedProbability must sum to one.');
  }
  for (const [id, item] of Object.entries(diagnostics)) {
    const diagnostic = item as Record<string, unknown>;
    if (
      Math.abs(
        (diagnostic.simulated as number)
        - (probabilities[id] as number),
      ) > 1e-10
      || (
        value.normalizedTargets !== undefined
        && Math.abs(
          (diagnostic.target as number)
          - (
            value.normalizedTargets as Record<string, number>
          )[id]
        ) > 1e-10
      )
    ) {
      throw new HttpError(
        400,
        `teamDiagnostics.${id} disagrees with probability maps.`,
      );
    }
  }
  const outside = validateStringArray(
    value.teamsOutsideTolerance,
    'teamsOutsideTolerance',
  );
  const expectedIds = new Set(teams.map(team => team.id));
  if (outside.some(id => !expectedIds.has(id))) {
    throw new HttpError(400, 'teamsOutsideTolerance contains an unknown team ID.');
  }
  const diagnosticOutside = new Set(
    Object.entries(diagnostics)
      .filter(([, item]) => (item as Record<string, unknown>).withinTolerance === false)
      .map(([id]) => id),
  );
  if (
    outside.length !== diagnosticOutside.size
    || outside.some(id => !diagnosticOutside.has(id))
  ) {
    throw new HttpError(
      400,
      'teamsOutsideTolerance must match teamDiagnostics status.',
    );
  }
  if (
    typeof value.createdAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt))
  ) {
    throw new HttpError(400, 'createdAt must be a valid timestamp.');
  }
  return value;
}

export async function readJsonBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0) throw new HttpError(400, 'Invalid Content-Length.');
    if (length > maxBytes) throw new HttpError(413, `Request body exceeds ${maxBytes} bytes.`);
  }
  const contentType = req.headers['content-type'];
  if (contentType && !contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        reject(new HttpError(408, 'Request body timed out.'));
      }
    }, REQUEST_TIMEOUT_MS);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    req.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        req.destroy();
        fail(new HttpError(413, `Request body exceeds ${maxBytes} bytes.`));
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Request body must be valid JSON.'));
      }
    });
    req.on('error', error => fail(error));
  });
}

export function requireLocalApiHeader(req: IncomingMessage) {
  if (req.headers[LOCAL_API_HEADER.toLowerCase()] !== LOCAL_API_HEADER_VALUE) {
    throw new HttpError(403, 'Missing local API header.');
  }
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export function sendError(res: ServerResponse, error: unknown, fallbackStatusCode = 500) {
  const statusCode = error instanceof HttpError ? error.statusCode : fallbackStatusCode;
  const message = error instanceof Error ? error.message : 'Internal server error.';
  sendJson(res, statusCode, { ok: false, error: message });
}

export async function atomicWriteFile(filePath: string, data: string | Uint8Array) {
  const temporaryPath = join(dirname(filePath), `.${filePath.split(/[\\/]/).pop()}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, data);
    await replaceFile(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

let writeQueue = Promise.resolve();
export function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

export function stampedRatingsName(
  date = new Date(),
  uniqueSuffix = randomUUID().slice(0, 8),
) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23);
  return `calibrated-ratings_${stamp}_${uniqueSuffix}.json`;
}

export async function saveCalibrationPayload(body: string, outputPath: string, dataDir: string) {
  const payload = JSON.parse(body) as unknown;
  validateCalibrationPayload(payload);
  const stampedName = stampedRatingsName();
  await withWriteLock(async () => {
    await atomicWriteFile(outputPath, body);
    await atomicWriteFile(join(dataDir, stampedName), body);
  });
  return stampedName;
}
