import { updateMarketFromPolymarket } from './market-update-core';
import { EPL_CHAMPION_EVENT_SLUG } from '../src/calibration/polymarket';

const dryRun = process.argv.includes('--dry-run');

function arg(name: string, fallback: string) {
  const prefixed = process.argv.find(item => item.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const slug = arg('--slug', EPL_CHAMPION_EVENT_SLUG);
const result = await updateMarketFromPolymarket({ slug, write: !dryRun });

console.log(`Polymarket · ${result.meta.title}`);
console.log(`matched ${result.meta.matchedTeams.length}/${Object.keys(result.market).length} teams`);
if (result.meta.unmatchedPolymarket.length) {
  console.log(`unmapped on Polymarket: ${result.meta.unmatchedPolymarket.join(', ')}`);
}
if (result.meta.missingTeams.length) {
  console.log(`kept previous price: ${result.meta.missingTeams.join(', ')}`);
}
if (result.changed.length) {
  console.log(
    'updated:',
    result.changed
      .map(
        id =>
          `${id} ${((result.previous[id] ?? 0) * 100).toFixed(2)}% → ${(result.market[id] * 100).toFixed(2)}%`,
      )
      .join(' · '),
  );
} else {
  console.log('no price changes');
}

if (dryRun) {
  console.log('\n(dry run — file not written)');
  process.exit(0);
}

console.log(`\nwrote src/data/default-market.json`);
console.log(`wrote src/data/polymarket-meta.json`);
