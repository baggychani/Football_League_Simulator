import type { Team } from '../domain/types';

// 2026/27 Premier League: Burnley / West Ham / Wolves relegated;
// Coventry / Ipswich / Hull promoted.
export const teams: Team[] = [
  ['arsenal', 'Arsenal', '#EF233C', 57],
  ['aston-villa', 'Aston Villa', '#95BFE5', 58],
  ['bournemouth', 'Bournemouth', '#D71920', 1044],
  ['brentford', 'Brentford', '#E30613', 402],
  ['brighton', 'Brighton', '#0057B8', 397],
  ['chelsea', 'Chelsea', '#034694', 61],
  ['coventry', 'Coventry City', '#69A8D8', 1076],
  ['crystal-palace', 'Crystal Palace', '#1B458F', 354],
  ['everton', 'Everton', '#003399', 62],
  ['fulham', 'Fulham', '#111111', 63],
  ['hull', 'Hull City', '#F18A00', 322],
  ['ipswich', 'Ipswich Town', '#0033A0', 349],
  ['leeds', 'Leeds United', '#FFCD00', 341],
  ['liverpool', 'Liverpool', '#C8102E', 64],
  ['man-city', 'Manchester City', '#6CABDD', 65],
  ['man-united', 'Manchester United', '#DA291C', 66],
  ['newcastle', 'Newcastle United', '#241F20', 67],
  ['nottingham-forest', 'Nottingham Forest', '#DD0000', 351],
  ['sunderland', 'Sunderland', '#EB172B', 71],
  ['tottenham', 'Tottenham', '#132257', 73],
].map(([id, name, color, footballDataId]) => ({
  id: id as string,
  name: name as string,
  color: color as string,
  crestUrl: `https://crests.football-data.org/${footballDataId}.png`,
}));

export const teamById = Object.fromEntries(teams.map(team => [team.id, team]));
