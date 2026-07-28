/// <reference lib="webworker" />
import { teams as initialTopTeams } from '../data/teams';
import { activeLeague } from '../data/league-catalog/active';
import { clubCatalogById } from '../data/league-catalog/catalog';
import {
  formatCompetitionSeason,
  matchesPerRound as competitionMatchesPerRound,
  regularSeasonRounds,
} from '../data/league-catalog/types';
import { activeRatings } from '../data/active-data';
import { createDoubleRoundRobin } from '../domain/fixtures';
import { resolveDecisivePlayoffs } from '../domain/decisive-playoffs';
import {
  emptyTable,
  remainTiedAfterTableRules,
  sortLeagueTable,
} from '../domain/standings';
import { calculateQualificationStatuses } from '../domain/qualification';
import type { LeagueSeasonRosters } from '../domain/promotion';
import type { ChampionEntry, ChampionHistoryPage, DivisionMovementSummary, LeagueRow, PlayedMatch, RatingMap, RecordBook, RecordCategory, RecordEntry, RecordLeaderboard, RecordPage, RecordPoint, SeasonArchiveEntry, SeasonArchivePage, Team, TeamSeasonState, UpsetRecordMetadata } from '../domain/types';
import { createRng, type RandomGenerator } from './rng';
import { IndependentPoissonModel, type OutcomeProbabilities, type ScoreDistribution } from './score-model';
import { assessScoreline, assessUpset, type UpsetAssessment } from './match-probability';
import { closeDynamicSeason, createDynamicStrength, dynamicParameters, effectiveRatings, structuralSupport, type DynamicStrengthState } from './dynamic-strength';
import { neutralExpectedResult, strengthDiagnostics, toStrengthLayers } from './strength-index';
import {
  advanceCompetitionToFixture,
  createClosedTwoTierSystem,
  createCompetitionSeasonState,
  finalizeCompetitionTable,
  rolloverClosedTwoTierRosters,
  simulateEflSixTeamPromotionPlayoff,
  type CompetitionSeasonState,
} from './competition-season-runner';
import { createClosedTwoTierRatings } from './league-system-ratings';
import { applyMatchTransition, simulateMatchStep } from './match-step';
import {
  createSeasonExpectations,
  structuralOutcomesFromTable,
  type SeasonExpectations,
} from './season-expectation';
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from './worker-protocol';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: SimulationWorkerResponse) => ctx.postMessage(message);
let ratings = activeRatings as RatingMap;
const lowerCompetitionTemplate = activeLeague.system.competitions.find(
  competition => competition.tier === activeLeague.competition.tier + 1,
);
if (!lowerCompetitionTemplate) {
  throw new Error(`${activeLeague.system.id}: a second division is required`);
}
const twoTierSystem = createClosedTwoTierSystem(
  activeLeague.system,
  activeLeague.competition,
  lowerCompetitionTemplate,
);
const upperCompetition = twoTierSystem.competitions[0];
const lowerCompetition = twoTierSystem.competitions[1];
const twoTierClubIds = [...new Set(
  twoTierSystem.competitions.flatMap(competition => competition.clubIds),
)];
const twoTierClubs = twoTierClubIds.map(id => {
  const club = clubCatalogById[id];
  if (!club) throw new Error(`Missing club identity for ${id}`);
  return club;
});
const teamMap = Object.fromEntries(
  twoTierClubs.map(team => [team.id, team]),
) as Record<string, Team>;
const initialRosters: LeagueSeasonRosters = Object.fromEntries(
  twoTierSystem.competitions.map(competition => [
    competition.id,
    [...competition.clubIds],
  ]),
);
let rosters: LeagueSeasonRosters = initialRosters;
let pendingRosters: LeagueSeasonRosters | null = null;
let previousSeasonMovements: DivisionMovementSummary | undefined;
let pendingSeasonMovements: DivisionMovementSummary | undefined;
let teams: Team[] = [...initialTopTeams];
let fixtures = createDoubleRoundRobin(teams.map(team => team.id));
let systemRatings = createClosedTwoTierRatings(
  ratings,
  initialRosters[upperCompetition.id],
  initialRosters[lowerCompetition.id],
);
const model = new IndependentPoissonModel();
const matchesPerRound = competitionMatchesPerRound(upperCompetition);
const roundsPerSeason = regularSeasonRounds(upperCompetition);
const matchesPerTeam = roundsPerSeason;
const upperRelegationPositions =
  upperCompetition.relegation?.automatic?.positions ?? [];
const DISPLAY_LEAD_ROUNDS = 3;
const MAX_ENTRIES: Partial<Record<RecordCategory, number>> = {
  biggestUpset: 200,
  lowestProbabilityWin: 200,
  rarestScoreline: 200,
  biggestUnderdogBlowout: 200,
};
const directions: Record<RecordCategory, 'max' | 'min'> = {
  mostGoalsMatch: 'max', biggestUpset: 'max', lowestProbabilityWin: 'min', rarestScoreline: 'min',
  biggestUnderdogBlowout: 'max', biggestWin: 'max', highestScoringDraw: 'max',
  longestWinningStreak: 'max', longestLosingStreak: 'max', longestUnbeatenStreak: 'max', longestWinlessStreak: 'max',
  highestSeasonPoints: 'max', lowestSeasonPoints: 'min', mostSeasonWins: 'max', fewestSeasonLosses: 'min',
  mostSeasonGoals: 'max', fewestSeasonGoalsConceded: 'min',
};
type StreakName = 'longestWinningStreak' | 'longestLosingStreak' | 'longestUnbeatenStreak' | 'longestWinlessStreak';
interface ActiveStreak { length: number; start?: RecordPoint; last?: RecordPoint }
type TeamStreaks = Record<StreakName, ActiveStreak>;
interface PreMatchTeamStrength { base: number; noForm: number; current: number; tier: number }
interface PreMatchStrengths { home: PreMatchTeamStrength; away: PreMatchTeamStrength }

let running = false, paused = false, selected = '', seed = 1, total = 0, completed = 0, season = 1, fixtureIndex = 0, startNext = false, speed = 1;
let runTimer: ReturnType<typeof setTimeout> | null = null;
let table: Record<string, TeamSeasonState> = emptyTable(teams.map(team => team.id));
let currentMatches: PlayedMatch[] = [];
let rng: RandomGenerator = createRng(1);
let lowerRng: RandomGenerator = createRng(2);
let lowerSeasonState: CompetitionSeasonState = createCompetitionSeasonState(
  lowerCompetition,
  initialRosters[lowerCompetition.id],
);
let upperExpectations: SeasonExpectations = {};
let lowerExpectations: SeasonExpectations = {};
let championHistory: ChampionEntry[] = [];
let seasonArchive: SeasonArchiveEntry[] = [];
let recordBook: RecordBook = {};
let championships: Record<string, number> = {};
let countedChampionId = '';
let finalTableOverride: ReturnType<typeof sortLeagueTable> | null = null;
let streaks: Record<string, TeamStreaks> = {};
let recordsVersion = 0;
let dynamicState: DynamicStrengthState = createDynamicStrength(twoTierClubs, systemRatings);
let displayFrame = 0;

const seasonLabel = (value: number) => formatCompetitionSeason(activeLeague.competition, value);
const point = (round: number): RecordPoint => ({ season, seasonLabel: seasonLabel(season), round });
function postDisplaySnapshot(nextSnapshot: ReturnType<typeof snapshot>) {
  displayFrame += 1;
  post({ type: 'snapshot', snapshot: nextSnapshot, displayFrame });
}
function postDisplayChampion(
  nextSnapshot: ReturnType<typeof snapshot>,
  selectedId: string,
  champion: LeagueRow & { margin: number; seed: number },
) {
  displayFrame += 1;
  post({ type: 'champion', snapshot: nextSnapshot, displayFrame, selectedId, champion });
}
const createStreaks = (): Record<string, TeamStreaks> => Object.fromEntries(twoTierClubs.map(({ id }) => [id, {
  longestWinningStreak: { length: 0 }, longestLosingStreak: { length: 0 }, longestUnbeatenStreak: { length: 0 }, longestWinlessStreak: { length: 0 },
}]));

function metadataNumber(entry: RecordEntry, key: string, fallback = 0) {
  const value = entry.metadata?.[key];
  return typeof value === 'number' ? value : fallback;
}

function chronologicalOrder(left: RecordEntry, right: RecordEntry) {
  return left.season - right.season ||
    (left.round ?? 99) - (right.round ?? 99) ||
    left.id.localeCompare(right.id);
}

function compareRecords(left: RecordEntry, right: RecordEntry) {
  if (left.category === 'biggestUpset') {
    return metadataNumber(left, 'upsetLogPValue') - metadataNumber(right, 'upsetLogPValue') ||
      metadataNumber(right, 'gapBits') - metadataNumber(left, 'gapBits') ||
      metadataNumber(left, 'exactScoreLogProbability') - metadataNumber(right, 'exactScoreLogProbability') ||
      chronologicalOrder(left, right);
  }
  if (left.category === 'biggestUnderdogBlowout') {
    return metadataNumber(left, 'conditionalAllocationTailLogProbability') -
      metadataNumber(right, 'conditionalAllocationTailLogProbability') ||
      metadataNumber(right, 'winOddsRatio') - metadataNumber(left, 'winOddsRatio') ||
      metadataNumber(right, 'actualMargin') - metadataNumber(left, 'actualMargin') ||
      metadataNumber(left, 'exactScoreLogProbability') - metadataNumber(right, 'exactScoreLogProbability') ||
      chronologicalOrder(left, right);
  }
  if (left.category === 'rarestScoreline') {
    return metadataNumber(left, 'exactScoreLogProbability') -
      metadataNumber(right, 'exactScoreLogProbability') ||
      chronologicalOrder(left, right);
  }
  if (left.category === 'lowestProbabilityWin') {
    return metadataNumber(left, 'winnerProbability') - metadataNumber(right, 'winnerProbability') ||
      metadataNumber(right, 'winOddsRatio') - metadataNumber(left, 'winOddsRatio') ||
      chronologicalOrder(left, right);
  }
  const direction = directions[left.category];
  const valueOrder = direction === 'max' ? right.value - left.value : left.value - right.value;
  return valueOrder || chronologicalOrder(left, right);
}

function addRecord(entry: RecordEntry) {
  const category = entry.category;
  const max = MAX_ENTRIES[category] ?? 50;
  const board = recordBook[category] ?? { category, direction: directions[category], previewCount: 3, storedCount: max, entries: [] } satisfies RecordLeaderboard;
  const old = board.entries.findIndex(item => item.id === entry.id);
  if (old >= 0) board.entries[old] = entry; else board.entries.push(entry);
  board.entries.sort(compareRecords);
  board.entries = board.entries.slice(0, max);
  recordBook[category] = board;
  recordsVersion++;
}

function matchRecord(category: RecordCategory, match: PlayedMatch, value: number, metadata?: RecordEntry['metadata'], extra?: Partial<RecordEntry>) {
  addRecord({ id: `${category}:${match.season}:${match.round}:${match.homeId}:${match.awayId}`, category, value, teamIds: [match.homeId, match.awayId], opponentIds: [match.awayId, match.homeId], season: match.season, seasonLabel: seasonLabel(match.season), round: match.round, match: { ...match, ...(extra?.match ?? {}) }, metadata, ...extra });
}

function updateStreak(teamId: string, category: StreakName, qualifies: boolean, end: RecordPoint) {
  const active = streaks[teamId][category];
  if (!qualifies) {
    if (active.start) {
      const id = `${category}:${teamId}:${active.start.season}:${active.start.round}`;
      const entry = recordBook[category]?.entries.find(item => item.id === id);
      if (entry) entry.ongoing = false;
    }
    active.length = 0; active.start = undefined; active.last = undefined; return;
  }
  if (!active.length) active.start = end;
  active.length++;
  active.last = end;
  addRecord({ id: `${category}:${teamId}:${active.start!.season}:${active.start!.round}`, category, value: active.length, teamIds: [teamId], season: end.season, seasonLabel: end.seasonLabel, round: end.round, start: active.start, end, ongoing: true });
}

function displayTier(tier: number) {
  return tier >= 1 ? 1 : tier > 0 ? 2 : 0;
}

function capturePreMatchStrengths(homeId: string, awayId: string): PreMatchStrengths {
  const capture = (teamId: string): PreMatchTeamStrength => {
    const strength = dynamicState[teamId];
    return {
      base: strength.base,
      noForm: strength.base + strength.medium,
      current: strength.base + strength.medium + dynamicParameters.formWeight * strength.form,
      tier: displayTier(structuralSupport(strength)),
    };
  };
  return { home: capture(homeId), away: capture(awayId) };
}

function upsetRecordMetadata(
  match: PlayedMatch,
  assessment: UpsetAssessment,
  strengths: PreMatchStrengths,
): UpsetRecordMetadata {
  const winnerId = assessment.winnerSide === 'home' ? match.homeId : match.awayId;
  const loserId = assessment.winnerSide === 'home' ? match.awayId : match.homeId;
  const winnerStrength = strengths[assessment.winnerSide];
  const loserStrength = strengths[assessment.loserSide];
  const structuralWinnerShare = neutralExpectedResult(winnerStrength.noForm, loserStrength.noForm);
  const rawStructuralGap = 100 * (1 - 2 * structuralWinnerShare);
  const structuralGap = Math.abs(rawStructuralGap) < .05 ? 0 : rawStructuralGap;
  const giantKilling = winnerStrength.tier === 0 && loserStrength.tier === 1;
  const classification = giantKilling
    ? 'Tier 0 → Tier 1 자이언트 킬링'
    : structuralGap > 0
      ? '구조적 언더독 승리'
      : '경기 당일 언더독 승리';

  return {
    ...assessment,
    winnerId,
    loserId,
    winnerGoals: assessment.winnerSide === 'home' ? match.homeGoals : match.awayGoals,
    loserGoals: assessment.winnerSide === 'home' ? match.awayGoals : match.homeGoals,
    lambdaHome: match.lambdaHome,
    lambdaAway: match.lambdaAway,
    baseWinnerStrength: winnerStrength.base,
    baseLoserStrength: loserStrength.base,
    noFormWinnerStrength: winnerStrength.noForm,
    noFormLoserStrength: loserStrength.noForm,
    currentWinnerStrength: winnerStrength.current,
    currentLoserStrength: loserStrength.current,
    structuralGap,
    winnerTier: winnerStrength.tier,
    loserTier: loserStrength.tier,
    giantKilling,
    classification,
    actualMargin: Math.abs(match.homeGoals - match.awayGoals),
  };
}

function updateMatchRecords(
  match: PlayedMatch,
  distribution: ScoreDistribution,
  outcomes: OutcomeProbabilities,
  strengths: PreMatchStrengths,
) {
  const goals = match.homeGoals + match.awayGoals;
  const exactScore = assessScoreline(distribution, match.homeGoals, match.awayGoals);
  const scoreMetadata = {
    ...exactScore,
    lambdaHome: match.lambdaHome,
    lambdaAway: match.lambdaAway,
    modelVersion: distribution.modelVersion,
  };
  matchRecord('mostGoalsMatch', match, goals, { totalGoals: goals });
  matchRecord('rarestScoreline', match, exactScore.exactScoreLogProbability, scoreMetadata);
  const margin = Math.abs(match.homeGoals - match.awayGoals);
  if (margin) {
    const winnerSide = match.homeGoals > match.awayGoals ? 'home' : 'away';
    const loserSide = winnerSide === 'home' ? 'away' : 'home';
    const winnerId = winnerSide === 'home' ? match.homeId : match.awayId;
    const loserId = winnerSide === 'home' ? match.awayId : match.homeId;
    const winnerProbability = outcomes[winnerSide];
    const loserProbability = outcomes[loserSide];
    const winOddsRatio = loserProbability / winnerProbability;
    matchRecord('biggestWin', match, margin, { margin, winnerId, loserId });
    matchRecord('lowestProbabilityWin', match, winnerProbability, {
      ...scoreMetadata,
      winnerId,
      loserId,
      winnerProbability,
      loserProbability,
      drawProbability: outcomes.draw,
      decisiveWinnerShare: winnerProbability / (winnerProbability + loserProbability),
      winOddsRatio,
      gapBits: Math.log2(winOddsRatio),
    });
  }
  if (match.homeGoals === match.awayGoals) matchRecord('highestScoringDraw', match, goals, { totalGoals: goals });
  if (margin) {
    const upset = assessUpset(
      distribution,
      match.homeGoals,
      match.awayGoals,
      outcomes,
    );
    if (upset) {
      const metadata = upsetRecordMetadata(match, upset, strengths);
      matchRecord('biggestUpset', match, upset.upsetSurprisal, metadata);
      matchRecord(
        'biggestUnderdogBlowout',
        match,
        upset.conditionalAllocationSurprisal,
        metadata,
      );
    }
  }
  const currentPoint = point(match.round);
  const homeWin = match.homeGoals > match.awayGoals;
  const awayWin = match.awayGoals > match.homeGoals;
  updateStreak(match.homeId, 'longestWinningStreak', homeWin, currentPoint);
  updateStreak(match.awayId, 'longestWinningStreak', awayWin, currentPoint);
  updateStreak(match.homeId, 'longestLosingStreak', awayWin, currentPoint);
  updateStreak(match.awayId, 'longestLosingStreak', homeWin, currentPoint);
  updateStreak(match.homeId, 'longestUnbeatenStreak', !awayWin, currentPoint);
  updateStreak(match.awayId, 'longestUnbeatenStreak', !homeWin, currentPoint);
  updateStreak(match.homeId, 'longestWinlessStreak', !homeWin, currentPoint);
  updateStreak(match.awayId, 'longestWinlessStreak', !awayWin, currentPoint);
}

function updateSeasonRecords(finalTable: ReturnType<typeof sortLeagueTable>) {
  for (const row of finalTable) {
    const data: [RecordCategory, number][] = [
      ['highestSeasonPoints', row.points], ['lowestSeasonPoints', row.points], ['mostSeasonWins', row.wins], ['fewestSeasonLosses', row.losses], ['mostSeasonGoals', row.goalsFor], ['fewestSeasonGoalsConceded', row.goalsAgainst],
    ];
    for (const [category, value] of data) addRecord({ id: `${category}:${season}:${row.teamId}`, category, value, teamIds: [row.teamId], season, seasonLabel: seasonLabel(season), metadata: { points: row.points, wins: row.wins, draws: row.draws, losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, goalDifference: row.goalDifference } });
  }
}

function applySeasonRosters() {
  if (pendingRosters) {
    rosters = Object.fromEntries(
      Object.entries(pendingRosters).map(([competitionId, ids]) => [
        competitionId,
        [...ids],
      ]),
    );
    pendingRosters = null;
    previousSeasonMovements = pendingSeasonMovements;
    pendingSeasonMovements = undefined;
  }
  teams = rosters[upperCompetition.id].map(id => teamMap[id]);
  fixtures = createDoubleRoundRobin(teams.map(team => team.id));
}

function prepareSeason() {
  applySeasonRosters();
  table = emptyTable(teams.map(team => team.id));
  currentMatches = [];
  fixtureIndex = 0;
  countedChampionId = '';
  finalTableOverride = null;
  rng = createRng((seed + season * 2654435761) >>> 0);
  lowerRng = createRng(
    ((seed ^ 0x9e3779b9) + season * 2246822519) >>> 0,
  );
  lowerSeasonState = createCompetitionSeasonState(
    lowerCompetition,
    rosters[lowerCompetition.id],
  );
  const preseasonRatings = effectiveRatings(dynamicState);
  upperExpectations = createSeasonExpectations(
    rosters[upperCompetition.id],
    preseasonRatings,
    upperCompetition.tier,
  );
  lowerExpectations = createSeasonExpectations(
    rosters[lowerCompetition.id],
    preseasonRatings,
    lowerCompetition.tier,
  );
}
function preview(category: RecordCategory) {
  const board = recordBook[category];
  if (!board?.entries.length) return [];
  return board.entries.slice(0, board.previewCount);
}
function snapshot(round: number) {
  const strengthLayers = toStrengthLayers(teams, dynamicState);
  const visibleState = Object.fromEntries(
    teams.map(team => [team.id, dynamicState[team.id]]),
  );
  const sortedTable = finalTableOverride ?? sortLeagueTable(
    table,
    activeLeague.competition.tieBreakers,
    currentMatches,
    activeLeague.competition.points,
  );
  const qualifications = activeLeague.competition.qualification
    ? calculateQualificationStatuses(
        sortedTable,
        matchesPerTeam,
        activeLeague.competition.qualification,
        activeLeague.competition.points.win,
        upperRelegationPositions,
      )
    : {};
  const clinchedChampionId = Object.entries(qualifications).find(([, status]) => status === 'champion')?.[0];
  if (clinchedChampionId && !countedChampionId) {
    championships[clinchedChampionId] = (championships[clinchedChampionId] ?? 0) + 1;
    countedChampionId = clinchedChampionId;
  }
  return {
    season, completedSeasons: completed, round, totalMatches: total, teams: [...teams], table: sortedTable, recent: currentMatches.slice(-10),
    recentChampions: championHistory.slice(0, 8),
    recordPreviews: Object.fromEntries(Object.keys(recordBook).map(category => [category, preview(category as RecordCategory)])),
    championshipLeaders: Object.entries(championships)
      .map(([teamId, titles]) => ({ teamId, titles }))
      .sort((a, b) => b.titles - a.titles || a.teamId.localeCompare(b.teamId)),
    qualifications,
    previousSeasonMovements: previousSeasonMovements
      ? {
          ...previousSeasonMovements,
          promotedTeamIds: [...previousSeasonMovements.promotedTeamIds],
          relegatedTeamIds: [...previousSeasonMovements.relegatedTeamIds],
        }
      : undefined,
    archiveSeasonCount: seasonArchive.length, recordsVersion,
    strengths: Object.fromEntries(Object.entries(strengthLayers).map(([id, value]) => [id, value.current])), strengthLayers, strengthDiagnostics: strengthDiagnostics(visibleState),
  };
}

function finishSeason() {
  const lowerEnvironment = {
    season,
    teamsById: teamMap,
    dynamicState,
    model,
    rng: lowerRng,
  };
  advanceCompetitionToFixture(
    lowerSeasonState,
    lowerSeasonState.fixtures.length,
    lowerEnvironment,
  );
  const lowerFinalTable = finalizeCompetitionTable(
    lowerSeasonState,
    lowerEnvironment,
  );
  const lowerPlayoffWinnerId = simulateEflSixTeamPromotionPlayoff(
    lowerSeasonState,
    lowerFinalTable,
    lowerEnvironment,
  );
  const sortedByTableRules = sortLeagueTable(
    table,
    upperCompetition.tieBreakers,
    currentMatches,
    upperCompetition.points,
  );
  const liveRatings = effectiveRatings(dynamicState);
  const finalTable = resolveDecisivePlayoffs(
    sortedByTableRules,
    upperCompetition.decisivePlayoffs,
    (upper, lower) => remainTiedAfterTableRules(
      table,
      table[upper.teamId],
      table[lower.teamId],
      upperCompetition.tieBreakers,
      currentMatches,
      upperCompetition.points,
    ),
    (upperId, lowerId) =>
      rng.next() < neutralExpectedResult(
        liveRatings[upperId],
        liveRatings[lowerId],
      )
        ? upperId
        : lowerId,
  );
  finalTableOverride = finalTable;
  const champion = finalTable[0], runnerUp = finalTable[1], last = finalTable.at(-1)!;
  const selectedRow = finalTable.find(row => row.teamId === selected);
  const seasonMatches = currentMatches;
  const common: ChampionEntry = { season, seasonLabel: seasonLabel(season), championId: champion.teamId, runnerUpId: runnerUp.teamId, championPoints: champion.points, runnerUpPoints: runnerUp.points, titleMargin: champion.points - runnerUp.points, selectedPosition: selectedRow?.position ?? 0, selectedPoints: selectedRow?.points ?? 0 };
  championHistory.unshift(common);
  seasonArchive.unshift({ ...common, lastPlaceTeamId: last.teamId, lastPlacePoints: last.points, totalGoals: seasonMatches.reduce((sum, match) => sum + match.homeGoals + match.awayGoals, 0), totalDraws: seasonMatches.filter(match => match.homeGoals === match.awayGoals).length, homeWins: seasonMatches.filter(match => match.homeGoals > match.awayGoals).length, awayWins: seasonMatches.filter(match => match.homeGoals < match.awayGoals).length, highestScoringTeamId: [...finalTable].sort((a, b) => b.goalsFor - a.goalsFor)[0].teamId, bestDefenceTeamId: [...finalTable].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0].teamId, finalTable });
  updateSeasonRecords(finalTable);
  if (!countedChampionId) {
    championships[champion.teamId] = (championships[champion.teamId] ?? 0) + 1;
    countedChampionId = champion.teamId;
  }
  const rollover = rolloverClosedTwoTierRosters({
    system: twoTierSystem,
    clubs: twoTierClubs,
    currentRosters: rosters,
    upperTable: finalTable,
    lowerTable: lowerFinalTable,
    lowerPlayoffWinnerId,
  });
  pendingRosters = rollover.rosters;
  const promotedIds = new Set(
    rollover.resolution.movements
      .filter(item => item.direction === 'promotion')
      .map(item => item.clubId),
  );
  const relegatedIds = new Set(
    rollover.resolution.movements
      .filter(item => item.direction === 'relegation')
      .map(item => item.clubId),
  );
  pendingSeasonMovements = {
    sourceSeason: season,
    sourceSeasonLabel: seasonLabel(season),
    promotedTeamIds: lowerFinalTable
      .filter(row => promotedIds.has(row.teamId))
      .map(row => row.teamId),
    relegatedTeamIds: finalTable
      .filter(row => relegatedIds.has(row.teamId))
      .map(row => row.teamId),
  };
  const finalQualifications = upperCompetition.qualification
    ? calculateQualificationStatuses(
        finalTable,
        matchesPerTeam,
        upperCompetition.qualification,
        upperCompetition.points.win,
        upperRelegationPositions,
      )
    : {};
  const upperFlags = Object.fromEntries(finalTable.map(row => {
    const status = finalQualifications[row.teamId];
    return [row.teamId, {
      champion: row.position === 1,
      championsLeague: status === 'champion' || status === 'champions',
      europaLeague: status === 'europa',
      relegated: relegatedIds.has(row.teamId),
    }];
  }));
  const lowerFlags = Object.fromEntries(lowerFinalTable.map(row => [
    row.teamId,
    {
      champion: row.position === 1,
      promoted: promotedIds.has(row.teamId),
    },
  ]));
  const structuralOutcomes = {
    ...structuralOutcomesFromTable(
      finalTable,
      upperExpectations,
      upperFlags,
    ),
    ...structuralOutcomesFromTable(
      lowerFinalTable,
      lowerExpectations,
      lowerFlags,
    ),
  };
  const playedByTeam: Record<string, number> = {
    ...Object.fromEntries(finalTable.map(row => [row.teamId, row.played])),
    ...Object.fromEntries(lowerFinalTable.map(row => [row.teamId, row.played])),
  };
  lowerSeasonState.postseasonMatches.forEach(match => {
    playedByTeam[match.homeId] = (playedByTeam[match.homeId] ?? 0) + 1;
    playedByTeam[match.awayId] = (playedByTeam[match.awayId] ?? 0) + 1;
  });
  closeDynamicSeason(dynamicState, playedByTeam, structuralOutcomes);
  completed++;
  const finalSnapshot = snapshot(roundsPerSeason);
  if (selectedRow && champion.teamId === selected) {
    running = false;
    startNext = true;
    postDisplayChampion(finalSnapshot, selected, {
      ...selectedRow,
      margin: champion.points - runnerUp.points,
      seed,
    });
    return;
  }
  startNext = true;
  postDisplaySnapshot(finalSnapshot);
}

function cancelScheduledRun() {
  if (runTimer !== null) {
    clearTimeout(runTimer);
    runTimer = null;
  }
}

function scheduleRun() {
  cancelScheduledRun();
  if (!running || paused) return;
  runTimer = setTimeout(() => {
    runTimer = null;
    run();
  }, 330 / speed);
}

function run(scheduleNext = true) {
  if (!running || paused) return;
  if (startNext) { season++; prepareSeason(); startNext = false; }
  const round = Math.floor(fixtureIndex / matchesPerRound) + 1;
  for (let i = 0; i < matchesPerRound && fixtureIndex < fixtures.length; i++, fixtureIndex++) {
    const fixture = fixtures[fixtureIndex];
    const step = simulateMatchStep(
      fixture,
      season,
      teamMap,
      dynamicState,
      model,
      rng,
    );
    const { match, distribution, outcomes } = step;
    const preMatchStrengths = capturePreMatchStrengths(fixture.homeId, fixture.awayId);
    currentMatches.push(match);
    updateMatchRecords(match, distribution, outcomes, preMatchStrengths);
    applyMatchTransition(
      table,
      dynamicState,
      step,
      upperCompetition.points,
    );
    total++;
  }
  const lowerTarget = Math.floor(
    (fixtureIndex / Math.max(1, fixtures.length))
    * lowerSeasonState.fixtures.length,
  );
  advanceCompetitionToFixture(
    lowerSeasonState,
    lowerTarget,
    {
      season,
      teamsById: teamMap,
      dynamicState,
      model,
      rng: lowerRng,
    },
  );
  if (fixtureIndex >= fixtures.length) finishSeason();
  else postDisplaySnapshot(snapshot(round));
  if (scheduleNext) scheduleRun();
}

function clearSimulationState() {
  cancelScheduledRun();
  running = false;
  paused = false;
  total = 0;
  completed = 0;
  season = 1;
  fixtureIndex = 0;
  startNext = false;
  championHistory = [];
  seasonArchive = [];
  recordBook = {};
  championships = {};
  finalTableOverride = null;
  rosters = Object.fromEntries(
    Object.entries(initialRosters).map(([competitionId, ids]) => [
      competitionId,
      [...ids],
    ]),
  );
  pendingRosters = null;
  previousSeasonMovements = undefined;
  pendingSeasonMovements = undefined;
  applySeasonRosters();
  streaks = createStreaks();
  recordsVersion = 0;
  displayFrame = 0;
  systemRatings = createClosedTwoTierRatings(
    ratings,
    rosters[upperCompetition.id],
    rosters[lowerCompetition.id],
  );
  dynamicState = createDynamicStrength(twoTierClubs, systemRatings);
}

function reset() {
  clearSimulationState();
  prepareSeason();
  post({ type: 'reset', snapshot: snapshot(0), displayFrame });
}
function page<T>(entries: T[], offset = 0, limit = 20) { return { entries: entries.slice(offset, offset + limit), total: entries.length, offset, limit }; }
function normalizeSpeed(value: unknown) { const next = Number(value); return Number.isFinite(next) && next > 0 ? Math.min(next, 100) : 1; }
function validatedRatings(value: Readonly<Record<string, number>>) {
  const ids = initialTopTeams.map(team => team.id);
  const keys = Object.keys(value);
  if (
    keys.length !== ids.length
    || keys.some(id => !ids.includes(id))
    || Object.values(value).some(rating =>
      typeof rating !== 'number' || !Number.isFinite(rating)
    )
  ) {
    throw new Error('Simulation ratings must contain one finite value per active club.');
  }
  return { ...value } as RatingMap;
}

ctx.onmessage = ({ data }: MessageEvent<SimulationWorkerRequest>) => {
  if (data.type === 'start') {
    ratings = validatedRatings(data.ratings);
    clearSimulationState();
    selected = typeof data.selected === 'string' ? data.selected : '';
    seed = Number(data.seed) >>> 0;
    speed = normalizeSpeed(data.speed);
    prepareSeason();
    running = true;
    post({ type: 'reset', snapshot: snapshot(0), displayFrame });
    for (let index = 0; index < DISPLAY_LEAD_ROUNDS && running; index += 1) {
      run(false);
    }
    scheduleRun();
  }
  if (data.type === 'selected') selected = typeof data.selected === 'string' ? data.selected : '';
  if (data.type === 'speed') {
    speed = normalizeSpeed(data.speed);
    if (running && !paused) scheduleRun();
  }
  if (data.type === 'pause') { paused = true; cancelScheduledRun(); }
  if (data.type === 'resume') { paused = false; scheduleRun(); }
  if (data.type === 'continue') { running = true; paused = false; scheduleRun(); }
  if (data.type === 'reset') reset();
  if (data.type === 'getRecordPage') { const category = data.category as RecordCategory; const result: RecordPage = { category, ...page(recordBook[category]?.entries ?? [], data.offset, data.limit) }; post({ type: 'recordPage', result }); }
  if (data.type === 'getSeasonArchivePage') { const result: SeasonArchivePage = page(seasonArchive, data.offset, data.limit); post({ type: 'seasonArchivePage', result }); }
  if (data.type === 'getChampionHistoryPage') { const result: ChampionHistoryPage = page(championHistory, data.offset, data.limit); post({ type: 'championHistoryPage', result }); }
};
