export interface Team {
  id: string;
  name: string;
  abbr: string;
  color: string;
  secondaryColor: string;
  crestUrl?: string;
}
export type RatingMap = Record<string, number>;
export interface Fixture { homeId: string; awayId: string; round: number }
export interface MatchScore { homeGoals: number; awayGoals: number; lambdaHome: number; lambdaAway: number }
export interface PlayedMatch extends Fixture, MatchScore { season: number }
export interface TeamSeasonState { teamId: string; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number }
export interface LeagueRow extends TeamSeasonState { position: number }
export interface SeasonResult { table: LeagueRow[]; matches: PlayedMatch[]; championId: string; fixtures: Fixture[] }
export type Speed = '1' | '5' | '10' | '100' | '1000' | 'max';
export type RecordCategory =
  | 'mostGoalsMatch'
  | 'biggestUpset'
  | 'lowestProbabilityWin'
  | 'rarestScoreline'
  | 'biggestUnderdogBlowout'
  | 'biggestWin'
  | 'highestScoringDraw'
  | 'longestWinningStreak'
  | 'longestLosingStreak'
  | 'longestUnbeatenStreak'
  | 'longestWinlessStreak'
  | 'highestSeasonPoints'
  | 'lowestSeasonPoints'
  | 'mostSeasonWins'
  | 'fewestSeasonLosses'
  | 'mostSeasonGoals'
  | 'fewestSeasonGoalsConceded';

export interface RecordPoint { season: number; seasonLabel: string; round: number }
export type RecordMetadataValue = number | string | boolean;
export type RecordMetadata = Record<string, RecordMetadataValue>;
export interface UpsetRecordMetadata extends RecordMetadata {
  winnerId: string;
  loserId: string;
  winnerProbability: number;
  loserProbability: number;
  drawProbability: number;
  decisiveWinnerShare: number;
  winOddsRatio: number;
  gapBits: number;
  lambdaWinner: number;
  lambdaLoser: number;
  expectedGoalShare: number;
  observedGoalShare: number;
  exactScoreLogProbability: number;
  exactScoreProbability: number;
  exactScoreSurprisal: number;
  totalGoalsLogProbability: number;
  conditionalAllocationLogProbability: number;
  likelihoodRatioDeviance: number;
  conditionalAllocationTailLogProbability: number;
  conditionalAllocationTailProbability: number;
  conditionalAllocationSurprisal: number;
  upsetLogPValue: number;
  upsetPValue: number;
  upsetSurprisal: number;
  baseWinnerStrength: number;
  baseLoserStrength: number;
  noFormWinnerStrength: number;
  noFormLoserStrength: number;
  currentWinnerStrength: number;
  currentLoserStrength: number;
  structuralGap: number;
  winnerTier: number;
  loserTier: number;
  giantKilling: boolean;
  classification: string;
  actualMargin: number;
  modelVersion: string;
}
export interface RecordEntry {
  id: string;
  category: RecordCategory;
  value: number;
  teamIds: string[];
  opponentIds?: string[];
  season: number;
  seasonLabel: string;
  round?: number;
  start?: RecordPoint;
  end?: RecordPoint;
  ongoing?: boolean;
  match?: PlayedMatch;
  metadata?: RecordMetadata;
}
export interface RecordLeaderboard { category: RecordCategory; direction: 'max' | 'min'; previewCount: number; storedCount: number; entries: RecordEntry[] }
export type RecordBook = Partial<Record<RecordCategory, RecordLeaderboard>>;
export interface ChampionEntry { season: number; seasonLabel: string; championId: string; runnerUpId: string; championPoints: number; runnerUpPoints: number; titleMargin: number; selectedPosition: number; selectedPoints: number }
export interface SeasonArchiveEntry extends ChampionEntry { lastPlaceTeamId: string; lastPlacePoints: number; totalGoals: number; totalDraws: number; homeWins: number; awayWins: number; highestScoringTeamId: string; bestDefenceTeamId: string; finalTable: LeagueRow[] }
export interface TeamTitleSummary { teamId: string; titles: number }
export interface RecordPage { category: RecordCategory; entries: RecordEntry[]; total: number; offset: number; limit: number }
export interface SeasonArchivePage { entries: SeasonArchiveEntry[]; total: number; offset: number; limit: number }
export interface ChampionHistoryPage { entries: ChampionEntry[]; total: number; offset: number; limit: number }
export interface StrengthLayerData { base: number; noForm: number; current: number; mediumImpact: number; formImpact: number; latent: { base: number; medium: number; form: number; current: number } }
export interface RatingDistribution { mean: number; sd: number; min: number; max: number; range: number }
export interface SimulationSnapshot { season: number; completedSeasons: number; round: number; totalMatches: number; table: LeagueRow[]; recent: PlayedMatch[]; recentChampions: ChampionEntry[]; recordPreviews: Partial<Record<RecordCategory, RecordEntry[]>>; championshipLeaders: TeamTitleSummary[]; archiveSeasonCount: number; recordsVersion: number; strengths?: Record<string, number>; strengthLayers?: Record<string, StrengthLayerData>; strengthDiagnostics?: { base: RatingDistribution; medium: RatingDistribution; form: RatingDistribution; current: RatingDistribution } }
