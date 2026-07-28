import type { FootballDataProvider } from '../league-catalog/types';

export type MatchStatus =
  | 'scheduled'
  | 'postponed'
  | 'cancelled'
  | 'live'
  | 'suspended'
  | 'finished'
  | 'awarded'
  | 'abandoned';

export type MatchStage =
  | 'regular-season'
  | 'promotion-playoff'
  | 'relegation-playoff'
  | 'title-playoff'
  | 'qualification-playoff'
  | 'cup';

export interface DataProvenance {
  provider: FootballDataProvider | 'official-competition' | 'official-club';
  providerRecordId?: string;
  sourceUrl: string;
  fetchedAt: string;
  /** Provider schema/model version, especially important for xG. */
  version?: string;
  licenseUrl?: string;
}

export interface ScorePart {
  home: number;
  away: number;
}

export interface RealMatchScore {
  halfTime?: ScorePart;
  fullTime?: ScorePart;
  extraTime?: ScorePart;
  penalties?: ScorePart;
}

export interface RealMatchRecord {
  /** Stable internal ID. Never use a provider ID as the primary key. */
  id: string;
  competitionId: string;
  seasonId: string;
  stage: MatchStage;
  round?: number;
  leg?: 1 | 2;
  status: MatchStatus;
  homeClubId: string;
  awayClubId: string;
  kickoffUtc?: string;
  /** IANA zone used to recover the published local time. */
  venueTimeZone?: string;
  previousKickoffUtc?: string;
  venue?: {
    id?: string;
    name: string;
    city?: string;
    neutral: boolean;
  };
  score?: RealMatchScore;
  attendance?: number;
  referee?: {
    id?: string;
    name: string;
  };
  provenance: DataProvenance;
  updatedAt: string;
}

export interface StandingAdjustment {
  id: string;
  competitionId: string;
  seasonId: string;
  clubId: string;
  pointsDelta: number;
  effectiveAt: string;
  reason: string;
  provenance: DataProvenance;
}

export interface MatchDataSnapshot {
  schemaVersion: 1;
  competitionId: string;
  seasonId: string;
  generatedAt: string;
  /**
   * `complete` promises the entire regular-season schedule. Partial snapshots
   * can safely contain a date window or only recently updated fixtures.
   */
  coverage: 'complete' | 'partial';
  matches: readonly RealMatchRecord[];
  standingAdjustments: readonly StandingAdjustment[];
}

export type CollectionState =
  | 'collected'
  | 'contract-ready'
  | 'deferred';

export interface CollectionCoverageItem {
  id: string;
  state: CollectionState;
  requiredFor: readonly ('identity' | 'simulation' | 'live' | 'analytics')[];
  refreshTarget: string;
  note: string;
}
