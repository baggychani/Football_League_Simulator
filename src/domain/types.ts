export interface Team {
  id: string;
  name: string;
  nameKo?: string;
  abbr: string;
  color: string;
  secondaryColor: string;
  crestUrl?: string;
  /**
   * Long-run institutional support used by the dynamic-strength model.
   * It is data, not a club-id special case: 1 is the strongest protected tier,
   * values between 0 and 1 are partial support, and 0 means no protection.
   */
  structuralTier?: number;
}
export interface PointsRules {
  win: number;
  draw: number;
  loss: number;
}
export type TableTieBreaker =
  | 'headToHeadPoints'
  | 'headToHeadGoalDifference'
  | 'headToHeadAwayGoals'
  | 'goalDifference'
  | 'goalsFor'
  | 'wins';
export type RatingMap = Record<string, number>;
export interface Fixture { homeId: string; awayId: string; round: number }
export interface MatchScore { homeGoals: number; awayGoals: number; lambdaHome: number; lambdaAway: number }
export interface PlayedMatch extends Fixture, MatchScore { season: number }
export interface TeamSeasonState { teamId: string; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number }
export interface LeagueRow extends TeamSeasonState { position: number }
export type QualificationStatus = 'champion' | 'champions' | 'europa' | 'relegated';
export interface QualificationRules {
  championPosition: number;
  championsLeaguePositions: readonly number[];
  europaLeaguePositions: readonly number[];
}
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
export interface DivisionMovementSummary {
  sourceSeason: number;
  sourceSeasonLabel: string;
  promotedTeamIds: string[];
  relegatedTeamIds: string[];
}
export interface RecordPage { category: RecordCategory; entries: RecordEntry[]; total: number; offset: number; limit: number }
export interface SeasonArchivePage { entries: SeasonArchiveEntry[]; total: number; offset: number; limit: number }
export interface ChampionHistoryPage { entries: ChampionEntry[]; total: number; offset: number; limit: number }
export interface StrengthLayerData { base: number; noForm: number; current: number; mediumImpact: number; formImpact: number; latent: { base: number; medium: number; form: number; current: number } }
export interface RatingDistribution { mean: number; sd: number; min: number; max: number; range: number }
export interface SimulationSnapshot {
  season: number;
  completedSeasons: number;
  round: number;
  totalMatches: number;
  /** Current visible top-division roster after promotion and relegation. */
  teams: Team[];
  table: LeagueRow[];
  recent: PlayedMatch[];
  recentChampions: ChampionEntry[];
  recordPreviews: Partial<Record<RecordCategory, RecordEntry[]>>;
  championshipLeaders: TeamTitleSummary[];
  qualifications?: Partial<Record<string, QualificationStatus>>;
  /** Promotion and relegation that produced the current season's roster. */
  previousSeasonMovements?: DivisionMovementSummary;
  archiveSeasonCount: number;
  recordsVersion: number;
  strengths?: Record<string, number>;
  strengthLayers?: Record<string, StrengthLayerData>;
  strengthDiagnostics?: {
    base: RatingDistribution;
    medium: RatingDistribution;
    form: RatingDistribution;
    current: RatingDistribution;
  };
}
