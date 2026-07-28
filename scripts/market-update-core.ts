import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMarketProbabilities } from '../src/calibration/market';
import {
  EPL_CHAMPION_EVENT_SLUG,
  fetchPolymarketEplChampion,
  mergeMarketSnapshot,
} from '../src/calibration/polymarket';
import { teams } from '../src/data/teams';
import { atomicWriteFile, validateMarketMeta, validateMarketSnapshot, withWriteLock } from './local-api';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const marketPath = resolve(root, 'src/data/default-market.json');
export const metaPath = resolve(root, 'src/data/polymarket-meta.json');

export interface MarketUpdateMeta {
  slug: string;
  title: string;
  fetchedAt: string;
  source: string;
  matchedTeams: string[];
  unmatchedPolymarket: string[];
  missingTeams: string[];
  changedTeams: string[];
}

export interface MarketUpdateResult {
  market: Record<string, number>;
  target: Record<string, number>;
  previous: Record<string, number>;
  meta: MarketUpdateMeta;
  changed: string[];
}

export async function updateMarketFromPolymarket(options?: {
  slug?: string;
  write?: boolean;
}): Promise<MarketUpdateResult> {
  const slug = options?.slug ?? EPL_CHAMPION_EVENT_SLUG;
  const write = options?.write !== false;
  const run = async () => {
    const previous = validateMarketSnapshot(JSON.parse(await readFile(marketPath, 'utf8')));
    const fetched = await fetchPolymarketEplChampion(slug);
    if (fetched.missingTeams.length) {
      console.warn(`Polymarket missing ${fetched.missingTeams.length} teams; previous prices were retained.`);
    }
    const market = validateMarketSnapshot(mergeMarketSnapshot(fetched.prices, previous));
    const changed = Object.keys(market).filter(
      id => Math.abs((market[id] ?? 0) - (previous[id] ?? 0)) > 1e-6,
    );
    const meta: MarketUpdateMeta = {
      slug: fetched.slug,
      title: fetched.title,
      fetchedAt: fetched.fetchedAt,
      source: fetched.source,
      matchedTeams: fetched.matched,
      unmatchedPolymarket: fetched.unmatchedPolymarket,
      missingTeams: fetched.missingTeams,
      changedTeams: changed,
    };
    validateMarketMeta(meta);
    const target = normalizeMarketProbabilities(market, teams);

    if (write) {
      await atomicWriteFile(marketPath, `${JSON.stringify(market, null, 2)}\n`);
      await atomicWriteFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    }

    return { market, target, previous, meta, changed };
  };

  return write ? withWriteLock(run) : run();
}

export async function persistMarketSnapshot(input: {
  market: Record<string, number>;
  meta: MarketUpdateMeta;
}): Promise<MarketUpdateResult> {
  return withWriteLock(async () => {
    const previous = validateMarketSnapshot(JSON.parse(await readFile(marketPath, 'utf8')));
    const market = validateMarketSnapshot(mergeMarketSnapshot(input.market, previous));
    const changed = Object.keys(market).filter(
      id => Math.abs((market[id] ?? 0) - (previous[id] ?? 0)) > 1e-6,
    );
    const meta: MarketUpdateMeta = {
      ...input.meta,
      changedTeams: changed,
    };
    validateMarketMeta(meta);
    const target = normalizeMarketProbabilities(market, teams);
    await atomicWriteFile(marketPath, `${JSON.stringify(market, null, 2)}\n`);
    await atomicWriteFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    return { market, target, previous, meta, changed };
  });
}
