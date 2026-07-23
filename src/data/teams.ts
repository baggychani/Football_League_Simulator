import type { Team } from '../domain/types';

// 2026/27 Premier League: Burnley / West Ham / Wolves relegated;
// Coventry / Ipswich / Hull promoted.
// Colors/abbr from official club kit palette.
export const teams: Team[] = (
  [
    ['arsenal', 'Arsenal', 'ARS', '#EF0107', '#FFFFFF', 57],
    ['aston-villa', 'Aston Villa', 'AVL', '#670E36', '#95BFE5', 58],
    ['bournemouth', 'Bournemouth', 'BOU', '#B50E12', '#000000', 1044],
    ['brentford', 'Brentford', 'BRE', '#E30613', '#FFFFFF', 402],
    ['brighton', 'Brighton', 'BHA', '#0057B8', '#FFFFFF', 397],
    ['chelsea', 'Chelsea', 'CHE', '#034694', '#FFFFFF', 61],
    ['coventry', 'Coventry City', 'COV', '#0BA3C8', '#FFFFFF', 1076],
    ['crystal-palace', 'Crystal Palace', 'CRY', '#1B458F', '#C4122E', 354],
    ['everton', 'Everton', 'EVE', '#003399', '#FFFFFF', 62],
    ['fulham', 'Fulham', 'FUL', '#FFFFFF', '#000000', 63],
    ['hull', 'Hull City', 'HUL', '#F5A122', '#000000', 322],
    ['ipswich', 'Ipswich Town', 'IPS', '#001A57', '#FFFFFF', 349],
    ['leeds', 'Leeds United', 'LEE', '#FFFFFF', '#1D428A', 341],
    ['liverpool', 'Liverpool', 'LIV', '#C8102E', '#FFFFFF', 64],
    ['man-city', 'Manchester City', 'MCI', '#6CABDD', '#FFFFFF', 65],
    ['man-united', 'Manchester United', 'MUN', '#DA291C', '#FFFFFF', 66],
    ['newcastle', 'Newcastle United', 'NEW', '#000000', '#FFFFFF', 67],
    ['nottingham-forest', 'Nottingham Forest', 'NFO', '#E53233', '#FFFFFF', 351],
    ['sunderland', 'Sunderland', 'SUN', '#EB172B', '#FFFFFF', 71],
    ['tottenham', 'Tottenham', 'TOT', '#FFFFFF', '#132257', 73],
  ] as const
).map(([id, name, abbr, color, secondaryColor, footballDataId]) => ({
  id,
  name,
  abbr,
  color,
  secondaryColor,
  crestUrl: `https://crests.football-data.org/${footballDataId}.png`,
}));

export const teamById = Object.fromEntries(teams.map(team => [team.id, team]));

/** Abbr text uses main color; light (white) kits get secondary-color chip behind. */
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
