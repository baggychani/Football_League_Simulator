import type {
  PointsRules,
  QualificationRules,
  TableTieBreaker,
  Team,
} from '../../domain/types';

export type CountryCode = 'ENG' | 'ESP' | 'ITA';
export type RosterStatus = 'verified' | 'provisional';
export type FootballDataProvider =
  | 'football-data'
  | 'sportmonks'
  | 'statsbomb'
  | 'wikidata';

export interface SourceReference {
  label: string;
  url: string;
  verifiedAt: string;
}

export interface ClubDefinition extends Team {
  nameKo: string;
  countryCode: CountryCode;
  /** Senior side whose division can constrain this reserve/U23 side. */
  parentClubId?: string;
  /** Stable path used by the application. The matching binary lives in public/. */
  crestUrl: string;
  crestSourceUrl?: string;
  /**
   * Provider identifiers are kept separate from the stable internal ID.
   * A provider can rename/relegate a club without changing saved simulations.
   */
  providerIds?: Partial<Record<FootballDataProvider, string>>;
  identityVerifiedAt: string;
}

export interface PositionRule {
  /** One-based final-table positions, inclusive. */
  positions: readonly number[];
  places: number;
  /** Grouped competitions apply the rule to every group unless stated otherwise. */
  scope?: 'competition' | 'per-group';
  destinationCompetitionId?: string;
  externalBoundary?: boolean;
  note?: string;
}

export interface MovementRules {
  automatic?: PositionRule;
  playoff?: PositionRule;
  conditionalPlayoff?: PositionRule;
}

export interface DecisivePlayoffRule {
  /** The adjacent table positions whose points tie triggers the playoff. */
  positions: readonly [number, number];
  purpose: 'title' | 'qualification' | 'relegation';
  format: 'single-match' | 'two-legged';
  trigger: 'points-tied' | 'all-tiebreakers-tied';
  note?: string;
}

export interface CompetitionDefinition {
  id: string;
  countryCode: CountryCode;
  name: string;
  nameKo: string;
  tier: number;
  professional: boolean;
  season: {
    id: string;
    startYear: number;
    verifiedAt: string;
    sourceUrl: string;
  };
  expectedClubCount: number;
  rosterStatus: RosterStatus;
  providerIds?: Partial<Record<FootballDataProvider, string>>;
  /**
   * Flat roster for ordinary divisions. Grouped divisions additionally expose
   * `groups`; the flat list is kept so common validation and movement code does
   * not need competition-specific branches.
   */
  clubIds: readonly string[];
  groups?: Readonly<Record<string, readonly string[]>>;
  openSlots?: number;
  legs: 2;
  points: PointsRules;
  tieBreakers: readonly TableTieBreaker[];
  qualification?: QualificationRules;
  promotion?: MovementRules;
  relegation?: MovementRules;
  /**
   * Position-deciding matches which occur after the league table is complete.
   * Stored separately from ordinary tie-breakers so a future season runner
   * cannot silently treat them as a comparator.
   */
  decisivePlayoffs?: readonly DecisivePlayoffRule[];
  rulesSources?: readonly SourceReference[];
  notes?: readonly string[];
}

export interface LeagueSystemDefinition {
  id: string;
  countryCode: CountryCode;
  name: string;
  nameKo: string;
  professionalTierRange: readonly [number, number];
  competitions: readonly CompetitionDefinition[];
  sources?: readonly SourceReference[];
  notes?: readonly string[];
}

export interface MarketProviderDefinition {
  provider: 'polymarket';
  eventSlug: string;
  teamTitleToClubId: Readonly<Record<string, string>>;
}

export interface ActiveLeagueDefinition {
  system: LeagueSystemDefinition;
  competition: CompetitionDefinition;
  clubs: readonly ClubDefinition[];
  market?: MarketProviderDefinition;
  ui: {
    wordmark: string;
    kicker: string;
  };
}

export function regularSeasonRounds(competition: CompetitionDefinition) {
  if (competition.groups) {
    const sizes = Object.values(competition.groups).map(group => group.length);
    if (!sizes.length || sizes.some(size => size !== sizes[0])) {
      throw new Error(`${competition.id}: grouped competition must have equally sized groups.`);
    }
    return (sizes[0] - 1) * competition.legs;
  }
  return (competition.clubIds.length - 1) * competition.legs;
}

export function matchesPerRound(competition: CompetitionDefinition) {
  const participantCount = competition.groups
    ? Object.values(competition.groups)[0]?.length ?? 0
    : competition.clubIds.length;
  if (participantCount < 2 || participantCount % 2 !== 0) {
    throw new Error(`${competition.id}: an even participant count is required.`);
  }
  return participantCount / 2;
}

export function formatCompetitionSeason(competition: CompetitionDefinition, seasonNumber: number) {
  const startYear = competition.season.startYear + seasonNumber - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}
