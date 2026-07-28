import type { Team } from '../domain/types';
import { activeLeague } from './league-catalog/active';
import { clubCatalogById } from './league-catalog/catalog';

/**
 * Compatibility exports for existing UI/calibration modules.
 *
 * The source of truth is now the active league definition. A future league
 * selector can replace that definition without rewriting simulation modules.
 */
export const teams: Team[] = [...activeLeague.clubs];
export const systemTeams: Team[] = [
  ...new Set(
    activeLeague.system.competitions.flatMap(competition => competition.clubIds),
  ),
].map(id => {
  const club = clubCatalogById[id];
  if (!club) throw new Error(`${activeLeague.system.id}: missing club ${id}`);
  return club;
});
export const teamById = Object.fromEntries(
  systemTeams.map(team => [team.id, team]),
);

/** Abbr text uses main color; light kits get a secondary-color chip behind. */
export function teamAbbrStyle(team: Team): { color: string; backgroundColor?: string } {
  const luminance = (hex: string) => {
    const n = Number.parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  if (luminance(team.color) >= 200) {
    return { color: team.color, backgroundColor: team.secondaryColor };
  }
  return { color: team.color };
}
