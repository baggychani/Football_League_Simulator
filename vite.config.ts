import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { persistMarketSnapshot, updateMarketFromPolymarket } from './scripts/market-update-core';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'src', 'data');
const outputPath = join(dataDir, 'calibrated-ratings.json');

function stampedRatingsName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `calibrated-ratings_${stamp}.json`;
}

function readBody(req: import('node:http').IncomingMessage) {
  return new Promise<string>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function localApiPlugin(): Plugin {
  return {
    name: 'football-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = req.url?.split('?')[0] ?? '';
          if (req.method === 'POST' && url === '/api/update-market') {
            const result = await updateMarketFromPolymarket({ write: true });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              ok: true,
              persisted: true,
              market: result.market,
              target: result.target,
              meta: result.meta,
              changedTeams: result.changed,
            }));
            return;
          }
          if (req.method === 'POST' && url === '/api/save-market') {
            const body = JSON.parse(await readBody(req)) as {
              market?: Record<string, number>;
              meta?: Parameters<typeof persistMarketSnapshot>[0]['meta'];
            };
            if (!body.market || !body.meta) throw new Error('Expected market and meta payload.');
            const result = await persistMarketSnapshot({ market: body.market, meta: body.meta });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              ok: true,
              persisted: true,
              market: result.market,
              target: result.target,
              meta: result.meta,
              changedTeams: result.changed,
            }));
            return;
          }
          if (req.method === 'POST' && url === '/api/save-calibration') {
            const body = await readBody(req);
            const stampedName = stampedRatingsName();
            await writeFile(outputPath, body, 'utf8');
            await writeFile(join(dataDir, stampedName), body, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              ok: true,
              path: 'src/data/calibrated-ratings.json',
              stamped: `src/data/${stampedName}`,
            }));
            return;
          }
          next();
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end((error as Error).message);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        calibrate: resolve(root, 'calibrate.html'),
      },
    },
  },
});
