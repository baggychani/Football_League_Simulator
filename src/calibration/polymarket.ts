import { teams } from '../data/teams';

export const EPL_CHAMPION_EVENT_SLUG = 'epl-2027-champion-20260701200428749';
export const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com';

/** Polymarket groupItemTitle → simulator team id */
export const polymarketTeamIds: Record<string, string> = {
  Arsenal: 'arsenal',
  'Aston Villa': 'aston-villa',
  Bournemouth: 'bournemouth',
  Brentford: 'brentford',
  Brighton: 'brighton',
  Chelsea: 'chelsea',
  'Coventry City': 'coventry',
  'Crystal Palace': 'crystal-palace',
  Everton: 'everton',
  Fulham: 'fulham',
  'Hull City': 'hull',
  'Ipswich Town': 'ipswich',
  'Leeds United': 'leeds',
  Liverpool: 'liverpool',
  'Manchester City': 'man-city',
  'Manchester United': 'man-united',
  'Newcastle United': 'newcastle',
  'Nottingham Forest': 'nottingham-forest',
  Tottenham: 'tottenham',
  Sunderland: 'sunderland',
};

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
    return Number.isFinite(yes) && yes >= 0 ? yes : null;
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

export async function fetchPolymarketEplChampion(
  slug = EPL_CHAMPION_EVENT_SLUG,
  fetchImpl: typeof fetch = fetch,
): Promise<PolymarketFetchResult> {
  const url = `${POLYMARKET_GAMMA_API}/events?slug=${encodeURIComponent(slug)}`;
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Polymarket API ${response.status}: ${response.statusText}`);
  const payload = (await response.json()) as GammaEvent[];
  const event = payload[0];
  if (!event) throw new Error(`Polymarket event not found: ${slug}`);
  return {
    ...pricesFromGammaEvent(event),
    fetchedAt: new Date().toISOString(),
    source: url,
  };
}

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
