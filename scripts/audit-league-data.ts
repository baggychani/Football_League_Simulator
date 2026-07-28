import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeLeague } from '../src/data/league-catalog/active';
import { clubCatalog, leagueSystems } from '../src/data/league-catalog/catalog';
import { validateLeagueCatalog } from '../src/data/league-catalog/validation';
import { footballDataCollectionPolicy } from '../src/data/football-data/collection-policy';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const strictCrests = process.argv.includes('--strict-crests');
const discoveredSourcesPath = resolve(projectRoot, 'public', 'crests', 'sources.json');

function isPng(data: Uint8Array) {
  return data.length >= 8
    && data[0] === 0x89
    && data[1] === 0x50
    && data[2] === 0x4e
    && data[3] === 0x47
    && data[4] === 0x0d
    && data[5] === 0x0a
    && data[6] === 0x1a
    && data[7] === 0x0a;
}

async function hasLocalCrest(path: string) {
  try {
    return isPng(await readFile(resolve(projectRoot, 'public', path.replace(/^\//, ''))));
  } catch {
    return false;
  }
}

const catalogErrors = validateLeagueCatalog(leagueSystems, clubCatalog);
const discoveredSources: Record<string, { sourceUrl?: string; file?: string }> =
  await readFile(discoveredSourcesPath, 'utf8')
  .then(value =>
    JSON.parse(value) as Record<string, { sourceUrl?: string; file?: string }>
  )
  .catch(() => (
    {} as Record<string, { sourceUrl?: string; file?: string }>
  ));
const crestAvailability = new Map(
  await Promise.all(clubCatalog.map(async club => [club.id, await hasLocalCrest(club.crestUrl)] as const)),
);

for (const system of leagueSystems) {
  console.log(`${system.nameKo} · 프로 범위 ${system.professionalTierRange[0]}~${system.professionalTierRange[1]}부`);
  for (const competition of system.competitions) {
    const localCount = competition.clubIds.filter(id => crestAvailability.get(id)).length;
    console.log(
      `  ${competition.nameKo}: ${competition.clubIds.length}/${competition.expectedClubCount} clubs`
      + ` · ${competition.rosterStatus}`
      + ` · local crests ${localCount}/${competition.clubIds.length}`,
    );
  }
}

const duplicateCoverageIds = footballDataCollectionPolicy
  .map(item => item.id)
  .filter((id, index, values) => values.indexOf(id) !== index);
const invalidCoverageItems = footballDataCollectionPolicy.filter(
  item =>
    !item.requiredFor.length
    || !item.refreshTarget.trim()
    || !item.note.trim(),
);
const providerMappedClubs = clubCatalog.filter(
  club => Object.keys(club.providerIds ?? {}).length > 0,
).length;
console.log(
  `Football-data coverage · provider-mapped clubs `
  + `${providerMappedClubs}/${clubCatalog.length}`,
);
for (const state of ['collected', 'contract-ready', 'deferred'] as const) {
  const items = footballDataCollectionPolicy
    .filter(item => item.state === state)
    .map(item => item.id);
  console.log(`  ${state}: ${items.length} · ${items.join(', ')}`);
}

const activeMissing = activeLeague.competition.clubIds.filter(id => !crestAvailability.get(id));
const allMissing = clubCatalog.filter(club => !crestAvailability.get(club.id)).map(club => club.id);
const missingProvenance = clubCatalog
  .filter(club =>
    crestAvailability.get(club.id)
    && !club.crestSourceUrl
    && !discoveredSources[club.id]?.sourceUrl
  )
  .map(club => club.id);
const historicalDiscoveredSources = Object.entries(discoveredSources)
  .filter(([clubId, source]) => {
    if (!crestAvailability.get(clubId)) return false;
    const file = (source.file ?? '').toLowerCase();
    return /\b(old|former|historic|historical)\b/.test(file)
      || /\b(?:18|19|20)\d{2}\s*[-–]\s*(?:18|19|20)\d{2}\b/.test(file)
      || /\b(?:logo|crest|badge|emblem)\D{0,4}(?:18|19|200\d|201\d)\b/.test(file)
      || /\bwiki(?:voyage|quote|pedia|media|books|news)\b/.test(file)
      || /\b(?:league|competition|serie c sky)\b.*\blogo\b/.test(file);
  })
  .map(([clubId, source]) => `${clubId} (${source.file})`);
if (allMissing.length) {
  console.warn(`Pending local crests (${allMissing.length}): ${allMissing.join(', ')}`);
}
if (catalogErrors.length) {
  console.error(`Catalog errors:\n- ${catalogErrors.join('\n- ')}`);
}
if (duplicateCoverageIds.length || invalidCoverageItems.length) {
  console.error(
    `Football-data collection policy errors: duplicate=[`
    + `${duplicateCoverageIds.join(', ')}], invalid=[`
    + `${invalidCoverageItems.map(item => item.id).join(', ')}]`,
  );
}
if (missingProvenance.length) {
  console.error(
    `Local crests without a recorded source: ${missingProvenance.join(', ')}`,
  );
}
if (historicalDiscoveredSources.length) {
  console.error(
    `Discovered crest sources appear historical or non-club: `
    + historicalDiscoveredSources.join(', '),
  );
}
if (activeMissing.length) {
  console.error(`Active competition is missing local crests: ${activeMissing.join(', ')}`);
}
if (
  catalogErrors.length
  || duplicateCoverageIds.length
  || invalidCoverageItems.length
  || activeMissing.length
  || missingProvenance.length
  || historicalDiscoveredSources.length
  || (strictCrests && allMissing.length)
) {
  process.exitCode = 1;
} else {
  console.log('League data audit passed.');
}
