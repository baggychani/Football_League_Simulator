import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clubCatalog, competitionCatalogById } from '../src/data/league-catalog/catalog';
import type { ClubDefinition, CountryCode } from '../src/data/league-catalog/types';
import { replaceFile } from './file-system';

type WikiSource = {
  clubId: string;
  wikidataId: string;
  article: string;
  file: string;
  sourceUrl: string;
  fetchedAt: string;
};

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(projectRoot, 'public', 'crests', 'sources.json');
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const headers = {
  Accept: 'application/json,image/png,image/*;q=0.8',
  'Api-User-Agent': 'FootballSimulator/1.0 (local data preparation)',
};
let requestQueue = Promise.resolve();
let nextRequestAt = 0;

function valuesFor(name: string) {
  const direct = process.argv
    .filter(argument => argument.startsWith(`${name}=`))
    .flatMap(argument => argument.slice(name.length + 1).split(','));
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    direct.push(...process.argv[index + 1].split(','));
  }
  return direct.map(value => value.trim()).filter(Boolean);
}

const requestedCompetitionIds = valuesFor('--competition');
const requestedCountryCodes = new Set(
  valuesFor('--country').map(value => value.toUpperCase()),
);
const requestedClubIds = new Set(valuesFor('--club'));
requestedCompetitionIds.forEach(id => {
  const competition = competitionCatalogById[id];
  if (!competition) throw new Error(`Unknown competition: ${id}`);
  competition.clubIds.forEach(clubId => requestedClubIds.add(clubId));
});

async function exists(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function paceRequest() {
  requestQueue = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise(resolveDelay => setTimeout(resolveDelay, delay));
    // Wikimedia's public APIs are shared infrastructure. A deliberately slow
    // single-file pipeline is more reliable than bursts that trigger 429s.
    nextRequestAt = Date.now() + 1_500;
  });
  await requestQueue;
}

async function fetchWithRetry(url: string, attempts = 6) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await paceRequest();
      const response = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolveDelay =>
      setTimeout(resolveDelay, Math.min(15_000, attempt * 2_000))
    );
  }
  throw lastError;
}

async function fetchJson<T>(url: URL) {
  return await (await fetchWithRetry(url.toString())).json() as T;
}

function normalized(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(fc|afc|cf|calcio|football|club|futbol|deportivo|ssd|ss|us)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const countryHints: Record<CountryCode, readonly string[]> = {
  ENG: ['england', 'english', 'wales', 'welsh'],
  ESP: ['spain', 'spanish'],
  ITA: ['italy', 'italian'],
};

function scoreEntity(
  club: ClubDefinition,
  item: { label?: string; description?: string },
) {
  const label = normalized(item.label ?? '');
  const expected = normalized(club.name);
  const description = (item.description ?? '').toLowerCase();
  const isFootballClub =
    /association football club|football club|soccer club/.test(description);
  let score = 0;
  if (label === expected) score += 120;
  else if (label.includes(expected) || expected.includes(label)) score += 60;
  if (isFootballClub) score += 45;
  else score -= 110;
  if (countryHints[club.countryCode].some(hint => description.includes(hint))) score += 15;
  const reserveClub = Boolean(club.parentClubId);
  if (!reserveClub && /\b(women|women's|youth|academy|under-?2[13]|reserve)\b/.test(description)) {
    score -= 100;
  }
  if (reserveClub && /\b(reserve|under-?2[13]|b team|next gen|futuro)\b/.test(description)) {
    score += 20;
  }
  return score;
}

type SearchResponse = {
  search: Array<{
    id: string;
    label?: string;
    description?: string;
  }>;
};

async function searchEntities(query: string) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    format: 'json',
    limit: '8',
    origin: '*',
  }).toString();
  return (await fetchJson<SearchResponse>(url)).search;
}

async function resolveEntity(club: ClubDefinition) {
  const candidates = await searchEntities(`${club.name} football club`);
  let ranked = candidates
    .map(item => ({ item, score: scoreEntity(club, item) }))
    .sort((left, right) => right.score - left.score);
  if (!ranked[0] || ranked[0].score < 70) {
    const fallback = await searchEntities(club.name);
    ranked = [...candidates, ...fallback]
      .filter((item, index, values) =>
        values.findIndex(candidate => candidate.id === item.id) === index
      )
      .map(item => ({ item, score: scoreEntity(club, item) }))
      .sort((left, right) => right.score - left.score);
  }
  return ranked[0]?.score >= 70 ? ranked[0].item : undefined;
}

type EntityResponse = {
  entities: Record<string, {
    sitelinks?: Record<string, { title: string }>;
    claims?: {
      P154?: Array<{
        mainsnak?: {
          datavalue?: { value?: unknown };
        };
      }>;
    };
  }>;
};

async function resolveArticle(entityId: string, countryCode: CountryCode) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'wbgetentities',
    ids: entityId,
    props: 'sitelinks|claims',
    format: 'json',
    origin: '*',
  }).toString();
  const response = await fetchJson<EntityResponse>(url);
  const entity = response.entities[entityId];
  const sitelinks = entity?.sitelinks ?? {};
  const logoValue = entity?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
  const logoFile = typeof logoValue === 'string'
    ? `File:${logoValue}`
    : undefined;
  const preferred = countryCode === 'ESP'
    ? ['enwiki', 'eswiki']
    : countryCode === 'ITA'
      ? ['enwiki', 'itwiki']
      : ['enwiki'];
  const key = preferred.find(candidate => sitelinks[candidate]);
  if (!key) return undefined;
  return {
    domain: key === 'eswiki'
      ? 'es.wikipedia.org'
      : key === 'itwiki'
        ? 'it.wikipedia.org'
        : 'en.wikipedia.org',
    title: sitelinks[key].title,
    logoFile,
  };
}

type ImagesResponse = {
  continue?: { imcontinue?: string };
  query?: {
    pages?: Record<string, {
      images?: Array<{ title: string }>;
    }>;
  };
};

async function articleImages(domain: string, title: string) {
  const images: string[] = [];
  let continuation: string | undefined;
  do {
    const url = new URL(`https://${domain}/w/api.php`);
    const params: Record<string, string> = {
      action: 'query',
      titles: title,
      prop: 'images',
      imlimit: 'max',
      format: 'json',
      origin: '*',
    };
    if (continuation) params.imcontinue = continuation;
    url.search = new URLSearchParams(params).toString();
    const response = await fetchJson<ImagesResponse>(url);
    Object.values(response.query?.pages ?? {}).forEach(page => {
      page.images?.forEach(image => images.push(image.title));
    });
    continuation = response.continue?.imcontinue;
  } while (continuation);
  return images;
}

const ignoredImageWords = [
  'flag', 'kit ', 'jersey', 'stadium', 'ground', 'map', 'season', 'performance',
  'commons-logo', 'edit-', 'soccerball', 'match', 'squad', 'players', 'tifo',
  'wikivoyage', 'wikiquote', 'wikipedia', 'wikimedia', 'wikibooks', 'wikinews',
  'serie c sky', 'league logo', 'competition logo',
];
const genericClubWords = new Set([
  'city', 'united', 'athletic', 'football', 'club', 'calcio', 'real',
  'deportivo', 'sporting', 'team', 'under', 'town',
]);

function scoreImage(club: ClubDefinition, title: string) {
  const lower = title.toLowerCase().replace(/^file:/, '');
  if (ignoredImageWords.some(word => lower.includes(word))) return -1000;
  if (!/\.(svg|png|webp|gif|jpe?g)$/i.test(lower)) return -1000;
  let score = 0;
  if (/\.svg$/i.test(lower)) score += 24;
  else if (/\.png$/i.test(lower)) score += 12;
  if (/\blogo\b/.test(lower)) score += 110;
  else if (/\b(crest|badge|emblem|escudo|stemma)\b/.test(lower)) score += 90;
  if (/\b(old|former|historic|historical)\b/.test(lower)) score -= 120;
  const years = [...lower.matchAll(/\b(18|19|20)\d{2}\b/g)]
    .map(match => Number(match[0]));
  if (
    /\b(?:18|19|20)\d{2}\s*[-–]\s*(?:18|19|20)\d{2}\b/.test(lower)
    || /\b(?:logo|crest|badge|emblem)\D{0,4}(?:18|19|200\d|201\d)\b/.test(lower)
  ) {
    score -= 220;
  }
  if (years.some(year => year >= 2020)) score += 5;
  const tokens = club.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4 && !genericClubWords.has(token));
  score += tokens.filter(token => lower.includes(token)).length * 18;
  if (normalized(lower).includes(normalized(club.name))) score += 80;
  if (club.abbr.length >= 3 && lower.includes(club.abbr.toLowerCase())) score += 8;
  return score;
}

type ImageInfoResponse = {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        thumburl?: string;
        url: string;
        descriptionurl: string;
      }>;
    }>;
  };
};

async function resolveImage(domain: string, title: string) {
  const url = new URL(`https://${domain}/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '192',
    format: 'json',
    origin: '*',
  }).toString();
  const response = await fetchJson<ImageInfoResponse>(url);
  return Object.values(response.query?.pages ?? {})[0]?.imageinfo?.[0];
}

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

async function hasValidPng(path: string) {
  try {
    return isPng(await readFile(path));
  } catch {
    return false;
  }
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, WikiSource>;
  } catch {
    return {};
  }
}

async function writeManifest(manifest: Record<string, WikiSource>) {
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  try {
    await writeFile(
      temporary,
      `${JSON.stringify(Object.fromEntries(
      Object.entries(manifest).sort(([left], [right]) => left.localeCompare(right)),
      ), null, 2)}\n`,
    );
    await replaceFile(temporary, manifestPath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function syncClub(club: ClubDefinition, manifest: Record<string, WikiSource>) {
  const destination = resolve(projectRoot, 'public', club.crestUrl.replace(/^\//, ''));
  const destinationExists = await exists(destination);
  const destinationValid = destinationExists && await hasValidPng(destination);
  if (!force && destinationValid) return { status: 'cached' as const, club };
  if (destinationExists && !destinationValid) {
    await unlink(destination);
  }
  if (!destinationValid && manifest[club.id]) {
    delete manifest[club.id];
    await writeManifest(manifest);
  }

  const entity = await resolveEntity(club);
  if (!entity) return { status: 'unresolved-entity' as const, club };
  const article = await resolveArticle(entity.id, club.countryCode);
  if (!article) return { status: 'unresolved-article' as const, club };
  const images = article.logoFile
    ? []
    : await articleImages(article.domain, article.title);
  const candidateImages = [
    ...(article.logoFile ? [article.logoFile] : []),
    ...images,
  ].filter((title, index, values) => values.indexOf(title) === index);
  const rankedImages = candidateImages
    .map(title => ({
      title,
      score: scoreImage(club, title)
        + (title === article.logoFile ? 250 : 0),
    }))
    .sort((left, right) => right.score - left.score);
  const selected = rankedImages[0];
  if (!selected || selected.score < 80) {
    return { status: 'unresolved-image' as const, club, article, entity, rankedImages };
  }
  const image = await resolveImage(article.domain, selected.title);
  const sourceUrl = image?.thumburl ?? image?.url;
  if (!sourceUrl) return { status: 'unresolved-image' as const, club, article, entity, rankedImages };
  if (dryRun) {
    return { status: 'dry-run' as const, club, article, entity, selected, sourceUrl };
  }

  const data = new Uint8Array(await (await fetchWithRetry(sourceUrl)).arrayBuffer());
  if (!isPng(data)) {
    return { status: 'non-png' as const, club, article, entity, selected, sourceUrl };
  }
  if (data.byteLength > 2 * 1024 * 1024) {
    return { status: 'image-too-large' as const, club, article, entity, selected, sourceUrl };
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, data);
    await replaceFile(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  manifest[club.id] = {
    clubId: club.id,
    wikidataId: entity.id,
    article: `https://${article.domain}/wiki/${encodeURIComponent(article.title.replaceAll(' ', '_'))}`,
    file: selected.title,
    sourceUrl: image?.descriptionurl ?? sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);
  return { status: 'downloaded' as const, club, selected, bytes: data.byteLength };
}

async function parallelMap<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const result = new Array<R>(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (index < values.length) {
        const current = index;
        index += 1;
        try {
          result[current] = await task(values[current]);
        } catch (error) {
          result[current] = {
            status: 'error',
            club: values[current],
            error: error instanceof Error ? error.message : String(error),
          } as R;
        }
      }
    }),
  );
  return result;
}

const selectedClubs = clubCatalog.filter(club =>
  (!requestedCompetitionIds.length && !requestedCountryCodes.size && !requestedClubIds.size)
  || requestedClubIds.has(club.id)
  || requestedCountryCodes.has(club.countryCode)
);
const manifest = await readManifest();
const result = await parallelMap(selectedClubs, 1, club => syncClub(club, manifest));
if (!dryRun) {
  await writeManifest(manifest);
}

const counts = result.reduce<Record<string, number>>((summary, item) => {
  summary[item.status] = (summary[item.status] ?? 0) + 1;
  return summary;
}, {});
console.log('Wikipedia crest sync:', counts);
result
  .filter(item => !['cached', 'downloaded', 'dry-run'].includes(item.status))
  .forEach(item => {
    const detail = 'rankedImages' in item && item.rankedImages
      ? `; candidates: ${item.rankedImages.slice(0, 3).map(candidate =>
          `${candidate.title} (${candidate.score})`
        ).join(', ')}`
      : 'error' in item
        ? `; ${item.error}`
        : '';
    console.warn(`${item.club.id}: ${item.status}${detail}`);
  });
