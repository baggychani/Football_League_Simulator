import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { teams } from '../src/data/teams';

export const LOCAL_API_HEADER = 'X-Football-Local-Api';
export const LOCAL_API_HEADER_VALUE = '1';
export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 30_000;

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

function assertFiniteTeamValues(value: Record<string, unknown>, fieldName: string, options?: { max?: number }) {
  for (const [id, candidate] of Object.entries(value)) {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0 || (options?.max !== undefined && candidate > options.max)) {
      const range = options?.max === undefined ? 'a non-negative finite number' : `a number between 0 and ${options.max}`;
      throw new HttpError(400, `${fieldName}.${id} must be ${range}.`);
    }
  }
}

export function validateMarketSnapshot(value: unknown): Record<string, number> {
  const market = assertExactTeamSet(value, 'market');
  assertFiniteTeamValues(market, 'market', { max: 1 });
  if (Object.values(market).every(price => price === 0)) {
    throw new HttpError(400, 'Market must contain at least one positive price.');
  }
  return market as Record<string, number>;
}

function validateStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new HttpError(400, `${fieldName} must be an array of strings.`);
  }
}

export function validateMarketMeta(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) throw new HttpError(400, 'meta must be an object.');
  for (const field of ['slug', 'title', 'fetchedAt', 'source']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new HttpError(400, `meta.${field} must be a non-empty string.`);
    }
  }
  for (const field of ['matchedTeams', 'unmatchedPolymarket', 'missingTeams', 'changedTeams']) {
    validateStringArray(value[field], `meta.${field}`);
  }
  return value;
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
  if (Object.values(diagnostics).some(item => !isPlainObject(item))) {
    throw new HttpError(400, 'teamDiagnostics must contain objects for every team.');
  }
  if (value.normalizedTargets !== undefined) {
    const targets = assertExactTeamSet(value.normalizedTargets, 'normalizedTargets');
    assertFiniteTeamValues(targets, 'normalizedTargets', { max: 1 });
  }
  if (value.teamsOutsideTolerance !== undefined) validateStringArray(value.teamsOutsideTolerance, 'teamsOutsideTolerance');
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
    await rename(temporaryPath, filePath);
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

export function stampedRatingsName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `calibrated-ratings_${stamp}.json`;
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
