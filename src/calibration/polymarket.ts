import { teams } from '../data/teams';
import { activeLeague } from '../data/league-catalog/active';

export const ACTIVE_CHAMPION_EVENT_SLUG = activeLeague.market?.eventSlug ?? '';
/** @deprecated Compatibility name for existing commands and saved metadata. */
export const EPL_CHAMPION_EVENT_SLUG = ACTIVE_CHAMPION_EVENT_SLUG;
export const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com';

/** Polymarket groupItemTitle → simulator team id */
export const polymarketTeamIds: Readonly<Record<string, string>> =
  activeLeague.market?.teamTitleToClubId ?? {};

interface GammaMarket {
  groupItemTitle?: string;
  outcomePrices?: string;
  active?: boolean;
  closed?: boolean;
  negRiskOther?: boolean;
}

interface GammaEvent {
  slug: string;
  title: string;
  updatedAt?: string;
  markets?: GammaMarket[];
}

export interface PolymarketFetchResult {
  slug: string;
  title: string;
  fetchedAt: string;
  source: string;
  prices: Record<string, number>;
  matched: string[];
  unmatchedPolymarket: string[];
  missingTeams: string[];
}

function parseYesPrice(outcomePrices: string | undefined): number | null {
  if (!outcomePrices) return null;
  try {
    const parsed = JSON.parse(outcomePrices) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const yes = Number(parsed[0]);
    return Number.isFinite(yes) && yes >= 0 && yes <= 1 ? yes : null;
  } catch {
    return null;
  }
}

export function pricesFromGammaEvent(event: GammaEvent): Omit<PolymarketFetchResult, 'fetchedAt' | 'source'> {
  const prices: Record<string, number> = {};
  const matched: string[] = [];
  const unmatchedPolymarket: string[] = [];
  const simulatorIds = new Set(teams.map(team => team.id));

  for (const market of event.markets ?? []) {
    if (market.negRiskOther || market.active === false || market.closed) continue;
    const title = market.groupItemTitle?.trim();
    if (!title || title === 'Other' || title.startsWith('Team ')) continue;
    const yes = parseYesPrice(market.outcomePrices);
    if (yes === null) continue;
    const teamId = polymarketTeamIds[title];
    if (!teamId) {
      unmatchedPolymarket.push(title);
      continue;
    }
    if (prices[teamId] !== undefined) throw new Error(`Duplicate Polymarket market for team: ${teamId}`);
    prices[teamId] = yes;
    matched.push(teamId);
  }

  const missingTeams = teams.map(team => team.id).filter(id => !(id in prices));
  return {
    slug: event.slug,
    title: event.title,
    prices,
    matched,
    unmatchedPolymarket,
    missingTeams: missingTeams.filter(id => simulatorIds.has(id)),
  };
}

export async function fetchPolymarketChampion(
  slug = ACTIVE_CHAMPION_EVENT_SLUG,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<PolymarketFetchResult> {
  if (!slug) {
    throw new Error(
      `${activeLeague.competition.id} has no configured Polymarket champion event.`,
    );
  }
  const url = `${POLYMARKET_GAMMA_API}/events?slug=${encodeURIComponent(slug)}`;
  let response: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`Polymarket API timed out after ${timeoutMs}ms.`);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!response) throw lastError instanceof Error ? lastError : new Error('Polymarket API request failed.');
  if (!response.ok) throw new Error(`Polymarket API ${response.status}: ${response.statusText}`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Polymarket API returned invalid JSON.');
  }
  if (!Array.isArray(payload)) throw new Error('Polymarket API returned an invalid event list.');
  const event = payload[0];
  if (!event || typeof event !== 'object' || typeof (event as GammaEvent).slug !== 'string' || typeof (event as GammaEvent).title !== 'string' || !Array.isArray((event as GammaEvent).markets)) {
    throw new Error(`Polymarket event not found or malformed: ${slug}`);
  }
  return {
    ...pricesFromGammaEvent(event as GammaEvent),
    fetchedAt: new Date().toISOString(),
    source: url,
  };
}

/** @deprecated Use the competition-neutral name. */
export const fetchPolymarketEplChampion = fetchPolymarketChampion;

/** Merge live Polymarket prices with an existing snapshot for teams not listed on the market. */
export function mergeMarketSnapshot(
  live: Record<string, number>,
  previous: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const team of teams) {
    merged[team.id] = live[team.id] ?? previous[team.id] ?? 0;
  }
  return merged;
}
