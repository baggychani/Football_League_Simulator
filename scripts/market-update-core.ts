import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMarketProbabilities } from '../src/calibration/market';
import {
  EPL_CHAMPION_EVENT_SLUG,
  fetchPolymarketEplChampion,
  mergeMarketSnapshot,
} from '../src/calibration/polymarket';
import { teams } from '../src/data/teams';

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
  const previous = JSON.parse(await readFile(marketPath, 'utf8')) as Record<string, number>;
  const fetched = await fetchPolymarketEplChampion(slug);
  const market = mergeMarketSnapshot(fetched.prices, previous);
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
  const target = normalizeMarketProbabilities(market, teams);

  if (write) {
    await writeFile(marketPath, `${JSON.stringify(market, null, 2)}\n`, 'utf8');
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  }

  return { market, target, previous, meta, changed };
}

export async function persistMarketSnapshot(input: {
  market: Record<string, number>;
  meta: MarketUpdateMeta;
}): Promise<MarketUpdateResult> {
  const previous = JSON.parse(await readFile(marketPath, 'utf8')) as Record<string, number>;
  const market = mergeMarketSnapshot(input.market, previous);
  normalizeMarketProbabilities(market, teams);
  const changed = Object.keys(market).filter(
    id => Math.abs((market[id] ?? 0) - (previous[id] ?? 0)) > 1e-6,
  );
  const meta: MarketUpdateMeta = {
    ...input.meta,
    changedTeams: changed,
  };
  const target = normalizeMarketProbabilities(market, teams);
  await writeFile(marketPath, `${JSON.stringify(market, null, 2)}\n`, 'utf8');
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return { market, target, previous, meta, changed };
}
