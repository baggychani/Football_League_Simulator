export interface Team { id: string; name: string; color: string; crestUrl?: string }
export type RatingMap = Record<string, number>;
export interface Fixture { homeId: string; awayId: string; round: number }
export interface MatchScore { homeGoals: number; awayGoals: number; lambdaHome: number; lambdaAway: number }
export interface PlayedMatch extends Fixture, MatchScore { season: number }
export interface TeamSeasonState { teamId: string; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number }
export interface LeagueRow extends TeamSeasonState { position: number }
export interface SeasonResult { table: LeagueRow[]; matches: PlayedMatch[]; championId: string; fixtures: Fixture[] }
export type Speed = '1' | '5' | '10' | '100' | '1000' | 'max';
export interface SimulationRecords { mostGoals?: PlayedMatch; biggestUpset?: PlayedMatch & { winnerProbability: number; favoriteProbability: number; upsetIndex: number } }
export interface StrengthLayerData { base: number; noForm: number; current: number; mediumImpact: number; formImpact: number; latent: { base: number; medium: number; form: number; current: number } }
export interface RatingDistribution { mean: number; sd: number; min: number; max: number; range: number }
export interface SimulationSnapshot { season: number; completedSeasons: number; round: number; totalMatches: number; table: LeagueRow[]; recent: PlayedMatch[]; history: { season: number; championId: string; selectedPosition: number; selectedPoints: number }[]; records?: SimulationRecords; strengths?: Record<string, number>; strengthLayers?: Record<string, StrengthLayerData>; strengthDiagnostics?: { base: RatingDistribution; medium: RatingDistribution; form: RatingDistribution; current: RatingDistribution }; championships?: Record<string, number> }
