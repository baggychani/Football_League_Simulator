import type {
  ClubDefinition,
  CompetitionDefinition,
  CountryCode,
} from './types';

interface ClubInput {
  id: string;
  name: string;
  nameKo: string;
  abbr: string;
  color: string;
  secondaryColor: string;
  countryCode: CountryCode;
  sourceId?: number;
  crestSourceUrl?: string;
  structuralTier?: number;
  parentClubId?: string;
  identityVerifiedAt?: string;
}

const folderByCountry: Record<CountryCode, string> = {
  ENG: 'england',
  ESP: 'spain',
  ITA: 'italy',
};

export function defineClub(input: ClubInput): ClubDefinition {
  const crestSourceUrl = input.crestSourceUrl
    ?? (input.sourceId ? `https://crests.football-data.org/${input.sourceId}.png` : undefined);
  return {
    id: input.id,
    name: input.name,
    nameKo: input.nameKo,
    abbr: input.abbr,
    color: input.color,
    secondaryColor: input.secondaryColor,
    countryCode: input.countryCode,
    parentClubId: input.parentClubId,
    crestUrl: `/crests/${folderByCountry[input.countryCode]}/${input.id}.png`,
    crestSourceUrl,
    providerIds: input.sourceId
      ? { 'football-data': String(input.sourceId) }
      : undefined,
    structuralTier: input.structuralTier,
    identityVerifiedAt: input.identityVerifiedAt ?? '2026-07-28',
  };
}

export function clubsForCompetition(
  clubs: readonly ClubDefinition[],
  competition: CompetitionDefinition,
) {
  const byId = new Map(clubs.map(club => [club.id, club]));
  return competition.clubIds.map(id => {
    const club = byId.get(id);
    if (!club) throw new Error(`${competition.id}: unknown club ${id}`);
    return club;
  });
}
