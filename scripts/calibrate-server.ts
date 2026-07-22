#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const dataDir = join(root, 'src', 'data');
const outputPath = join(dataDir, 'calibrated-ratings.json');
const port = Number(process.env.CALIBRATE_PORT || 27184);

function stampedRatingsName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `calibrated-ratings_${stamp}.json`;
}

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function safePath(urlPath: string) {
  const cleaned = normalize(decodeURIComponent(urlPath.split('?')[0] || '/')).replace(/^(\.\.[/\\])+/, '');
  const absolute = resolve(dist, '.' + (cleaned === '/' ? '/calibrate.html' : cleaned));
  if (!absolute.startsWith(dist)) return null;
  return absolute;
}

async function readBody(req: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function validateCalibrationPayload(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Calibration payload must be an object.');
  const payload = value as Record<string, unknown>;
  if (payload.schemaVersion !== 2) throw new Error('Unsupported calibration schemaVersion.');
  if (payload.calibrationMode !== 'static-baseline') throw new Error('Expected static-baseline calibration mode.');
  if (!payload.ratings || typeof payload.ratings !== 'object') throw new Error('Missing calibrated ratings.');
  const values = Object.values(payload.ratings as Record<string, unknown>);
  if (values.length !== 20 || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Expected 20 finite calibrated ratings.');
  }
  if (!payload.teamDiagnostics || typeof payload.teamDiagnostics !== 'object') {
    throw new Error('Missing team calibration diagnostics.');
  }
}

if (!existsSync(dist)) {
  console.error('dist/ 없음. 먼저 npm run build 를 실행하세요.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && url.pathname === '/api/save-calibration') {
      const body = await readBody(req);
      validateCalibrationPayload(JSON.parse(body));
      const stampedName = stampedRatingsName();
      const stampedPath = join(dataDir, stampedName);
      await writeFile(outputPath, body, 'utf8');
      await writeFile(stampedPath, body, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, path: 'src/data/calibrated-ratings.json', stamped: `src/data/${stampedName}` }));
      console.log(`saved ${outputPath}`);
      console.log(`saved ${stampedPath}`);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    let filePath = safePath(url.pathname === '/' ? '/calibrate.html' : url.pathname);
    if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(dist, 'calibrate.html');
    }
    const type = mime[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end((error as Error).message);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Calibration lab: http://127.0.0.1:${port}/`);
});
