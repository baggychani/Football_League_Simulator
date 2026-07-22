import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EPL_CHAMPION_EVENT_SLUG,
  fetchPolymarketEplChampion,
  mergeMarketSnapshot,
} from '../src/calibration/polymarket';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const marketPath = resolve(root, 'src/data/default-market.json');
const metaPath = resolve(root, 'src/data/polymarket-meta.json');
const dryRun = process.argv.includes('--dry-run');

function arg(name: string, fallback: string) {
  const prefixed = process.argv.find(item => item.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const slug = arg('--slug', EPL_CHAMPION_EVENT_SLUG);
const previous = JSON.parse(await readFile(marketPath, 'utf8')) as Record<string, number>;
const fetched = await fetchPolymarketEplChampion(slug);
const merged = mergeMarketSnapshot(fetched.prices, previous);

const changed = Object.keys(merged).filter(id => Math.abs((merged[id] ?? 0) - (previous[id] ?? 0)) > 1e-6);
const meta = {
  slug: fetched.slug,
  title: fetched.title,
  fetchedAt: fetched.fetchedAt,
  source: fetched.source,
  matchedTeams: fetched.matched,
  unmatchedPolymarket: fetched.unmatchedPolymarket,
  missingTeams: fetched.missingTeams,
  changedTeams: changed,
};

console.log(`Polymarket · ${fetched.title}`);
console.log(`matched ${fetched.matched.length}/${Object.keys(merged).length} teams`);
if (fetched.unmatchedPolymarket.length) {
  console.log(`unmapped on Polymarket: ${fetched.unmatchedPolymarket.join(', ')}`);
}
if (fetched.missingTeams.length) {
  console.log(`kept previous price: ${fetched.missingTeams.join(', ')}`);
}
if (changed.length) {
  console.log('updated:', changed.map(id => `${id} ${((previous[id] ?? 0) * 100).toFixed(2)}% → ${(merged[id] * 100).toFixed(2)}%`).join(' · '));
} else {
  console.log('no price changes');
}

if (dryRun) {
  console.log('\n(dry run — file not written)');
  process.exit(0);
}

await writeFile(marketPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
console.log(`\nwrote ${marketPath}`);
console.log(`wrote ${metaPath}`);
