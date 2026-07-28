import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clubCatalog, competitionCatalogById } from '../src/data/league-catalog/catalog';
import { replaceFile } from './file-system';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const force = process.argv.includes('--force');

function valuesFor(name: string) {
  const direct = process.argv
    .filter(argument => argument.startsWith(`${name}=`))
    .flatMap(argument => argument.slice(name.length + 1).split(','));
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) direct.push(...process.argv[index + 1].split(','));
  return direct.map(value => value.trim()).filter(Boolean);
}

const requestedCompetitionIds = valuesFor('--competition');
const requestedCountryCodes = new Set(valuesFor('--country').map(value => value.toUpperCase()));
const requestedClubIds = new Set<string>();
requestedCompetitionIds.forEach(id => {
  const competition = competitionCatalogById[id];
  if (!competition) throw new Error(`Unknown competition: ${id}`);
  competition.clubIds.forEach(clubId => requestedClubIds.add(clubId));
});

const selected = clubCatalog.filter(club =>
  club.crestSourceUrl
  && (
    (!requestedCompetitionIds.length && !requestedCountryCodes.size)
    || requestedClubIds.has(club.id)
    || requestedCountryCodes.has(club.countryCode)
  )
);

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

async function validExisting(path: string) {
  if (force) return false;
  try {
    return isPng(await readFile(path));
  } catch {
    return false;
  }
}

async function syncClub(club: (typeof clubCatalog)[number]) {
  const destination = resolve(projectRoot, 'public', club.crestUrl.replace(/^\//, ''));
  if (await validExisting(destination)) return { id: club.id, status: 'cached' as const };
  await mkdir(dirname(destination), { recursive: true });
  const response = await fetch(club.crestSourceUrl!, {
    headers: { Accept: 'image/png,image/*;q=0.8' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${club.id}: HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (!isPng(data)) throw new Error(`${club.id}: source did not return a PNG`);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, data);
    await replaceFile(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { id: club.id, status: 'downloaded' as const, bytes: data.byteLength };
}

async function parallelMap<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const result = new Array<R>(values.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (index < values.length) {
      const current = index;
      index += 1;
      result[current] = await task(values[current]);
    }
  }));
  return result;
}

const result = await parallelMap(selected, 6, syncClub);
const downloaded = result.filter(item => item.status === 'downloaded');
const cached = result.filter(item => item.status === 'cached');
console.log(
  `Crests ready: ${result.length} (${downloaded.length} downloaded, ${cached.length} cached)`,
);
if (!selected.length) {
  console.warn('No clubs with a configured crest source matched the requested filters.');
}
