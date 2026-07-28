import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { persistMarketSnapshot, updateMarketFromPolymarket } from './scripts/market-update-core';
import {
  readJsonBody,
  requireLocalApiHeader,
  saveCalibrationPayload,
  sendError,
  sendJson,
  validateMarketSavePayload,
} from './scripts/local-api';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'src', 'data');
const outputPath = join(dataDir, 'calibrated-ratings.json');

function localApiPlugin(): Plugin {
  return {
    name: 'football-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        try {
          if (req.method === 'POST' && url === '/api/update-market') {
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
            return;
          }
          if (req.method === 'POST' && url === '/api/save-market') {
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
            return;
          }
          if (req.method === 'POST' && url === '/api/save-calibration') {
            requireLocalApiHeader(req);
            const body = await readJsonBody(req);
            const stampedName = await saveCalibrationPayload(JSON.stringify(body), outputPath, dataDir);
            sendJson(res, 200, {
              ok: true,
              path: 'src/data/calibrated-ratings.json',
              stamped: `src/data/${stampedName}`,
            });
            return;
          }
          next();
        } catch (error) {
          const upstreamStatus = url === '/api/update-market'
            ? error instanceof Error && error.message.includes('timed out') ? 504 : 502
            : 500;
          sendError(res, error, upstreamStatus);
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
