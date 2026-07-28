#!/usr/bin/env node
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistMarketSnapshot, updateMarketFromPolymarket } from './market-update-core';
import {
  readJsonBody,
  requireLocalApiHeader,
  saveCalibrationPayload,
  sendError,
  sendJson,
  validateMarketSavePayload,
} from './local-api';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const dataDir = join(root, 'src', 'data');
const outputPath = join(dataDir, 'calibrated-ratings.json');
const port = Number(process.env.CALIBRATE_PORT || 27184);

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
  const relativePath = relative(dist, absolute);
  if (relativePath.startsWith('..') || relativePath.includes(':') || relativePath === '') return null;
  return absolute;
}

if (!existsSync(dist)) {
  console.error('dist/ 없음. 먼저 npm run build 를 실행하세요.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const requestPath = (() => {
    try {
      return new URL(req.url || '/', `http://127.0.0.1:${port}`).pathname;
    } catch {
      return '';
    }
  })();
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && url.pathname === '/api/save-calibration') {
      requireLocalApiHeader(req);
      const body = await readJsonBody(req);
      const stampedName = await saveCalibrationPayload(JSON.stringify(body), outputPath, dataDir);
      sendJson(res, 200, { ok: true, path: 'src/data/calibrated-ratings.json', stamped: `src/data/${stampedName}` });
      console.log(`saved ${outputPath}`);
      console.log(`saved ${join(dataDir, stampedName)}`);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/update-market') {
      requireLocalApiHeader(req);
      const result = await updateMarketFromPolymarket({ write: true });
      sendJson(res, 200, {
        ok: true,
        persisted: true,
        market: result.market,
        target: result.target,
        meta: result.meta,
        changedTeams: result.changed,
      });
      console.log(
        result.changed.length
          ? `updated market · ${result.changed.length} teams changed`
          : 'updated market · no price changes',
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/save-market') {
      requireLocalApiHeader(req);
      const body = validateMarketSavePayload(await readJsonBody(req));
      const result = await persistMarketSnapshot({ market: body.market, meta: body.meta as unknown as Parameters<typeof persistMarketSnapshot>[0]['meta'] });
      sendJson(res, 200, {
        ok: true,
        persisted: true,
        market: result.market,
        target: result.target,
        meta: result.meta,
        changedTeams: result.changed,
      });
      console.log('saved market snapshot from client');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
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
    const upstreamStatus = requestPath === '/api/update-market'
      ? error instanceof Error && error.message.includes('timed out') ? 504 : 502
      : 500;
    sendError(res, error, upstreamStatus);
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;

server.listen(port, '127.0.0.1', () => {
  console.log(`Calibration lab: http://127.0.0.1:${port}/`);
});
