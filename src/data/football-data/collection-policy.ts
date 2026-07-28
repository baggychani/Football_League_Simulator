import type { CollectionCoverageItem } from './types';

/**
 * Explicit coverage prevents "we have football data" from meaning only club
 * names and crests. Deferred fields are intentional and auditable.
 */
export const footballDataCollectionPolicy: readonly CollectionCoverageItem[] = [
  {
    id: 'club-identity-and-provider-ids',
    state: 'collected',
    requiredFor: ['identity', 'simulation'],
    refreshTarget: 'every seasonal roster change',
    note: 'Stable internal IDs, Korean names, display colours and provider IDs.',
  },
  {
    id: 'competition-rosters-and-rules',
    state: 'collected',
    requiredFor: ['simulation'],
    refreshTarget: 'after official federation/league publication',
    note: 'Roster, points, tie-breakers, postseason and promotion/relegation.',
  },
  {
    id: 'fixture-schedule-and-status',
    state: 'contract-ready',
    requiredFor: ['simulation', 'live'],
    refreshTarget: 'daily; every 30 seconds while live',
    note: 'Kickoff UTC, IANA venue zone, postponements, neutral venue and status.',
  },
  {
    id: 'scores-and-standing-adjustments',
    state: 'contract-ready',
    requiredFor: ['simulation', 'live'],
    refreshTarget: 'every 30 seconds while live; verify within 6 hours of final',
    note: 'HT/FT/ET/penalties plus awarded matches and point deductions.',
  },
  {
    id: 'lineups-and-player-availability',
    state: 'deferred',
    requiredFor: ['analytics'],
    refreshTarget: 'team-news changes and confirmed lineup publication',
    note: 'Requires a stable player catalog before it can affect ratings.',
  },
  {
    id: 'match-team-statistics',
    state: 'deferred',
    requiredFor: ['analytics'],
    refreshTarget: 'after final whistle and provider correction window',
    note: 'Shots, shots on target, corners, cards, possession and rest days.',
  },
  {
    id: 'event-stream-and-expected-goals',
    state: 'deferred',
    requiredFor: ['analytics'],
    refreshTarget: 'provider-specific',
    note: 'Never combine xG across providers without provider/model version.',
  },
];
