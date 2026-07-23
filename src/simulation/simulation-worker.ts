/// <reference lib="webworker" />
import { teams } from '../data/teams';
import ratingsFile from '../data/calibrated-ratings.json';
import { createDoubleRoundRobin } from '../domain/fixtures';
import { applyResult, emptyTable, sortLeagueTable } from '../domain/standings';
import type { ChampionEntry, ChampionHistoryPage, PlayedMatch, RatingMap, RecordBook, RecordCategory, RecordEntry, RecordLeaderboard, RecordPage, RecordPoint, SeasonArchiveEntry, SeasonArchivePage, TeamSeasonState, UpsetRecordMetadata } from '../domain/types';
import { createRng, type RandomGenerator } from './rng';
import { IndependentPoissonModel, type OutcomeProbabilities, type ScoreDistribution } from './score-model';
import { assessScoreline, assessUpset, type UpsetAssessment } from './match-probability';
import { applyDynamicMatch, closeDynamicSeason, createDynamicStrength, dynamicParameters, effectiveRatings, type DynamicStrengthState } from './dynamic-strength';
import { neutralExpectedResult, strengthDiagnostics, toStrengthLayers } from './strength-index';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const ratings = ratingsFile.ratings as RatingMap;
const fixtures = createDoubleRoundRobin(teams.map(team => team.id));
const teamMap = Object.fromEntries(teams.map(team => [team.id, team]));
const model = new IndependentPoissonModel();
const matchesPerRound = teams.length / 2;
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
let table: Record<string, TeamSeasonState> = emptyTable(teams.map(team => team.id));
let currentMatches: PlayedMatch[] = [];
let rng: RandomGenerator = createRng(1);
let championHistory: ChampionEntry[] = [];
let seasonArchive: SeasonArchiveEntry[] = [];
let recordBook: RecordBook = {};
let championships: Record<string, number> = {};
let streaks: Record<string, TeamStreaks> = {};
let recordsVersion = 0;
let dynamicState: DynamicStrengthState = createDynamicStrength(teams, ratings);

const seasonLabel = (value: number) => `${2025 + value}/${String((2026 + value) % 100).padStart(2, '0')}`;
const point = (round: number): RecordPoint => ({ season, seasonLabel: seasonLabel(season), round });
const createStreaks = (): Record<string, TeamStreaks> => Object.fromEntries(teams.map(({ id }) => [id, {
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
      tier: displayTier(strength.tier),
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

function prepareSeason() { table = emptyTable(teams.map(team => team.id)); currentMatches = []; fixtureIndex = 0; rng = createRng((seed + season * 2654435761) >>> 0); }
function preview(category: RecordCategory) {
  const board = recordBook[category];
  if (!board?.entries.length) return [];
  return board.entries.slice(0, board.previewCount);
}
function snapshot(round: number) {
  const strengthLayers = toStrengthLayers(teams, dynamicState);
  return {
    season, completedSeasons: completed, round, totalMatches: total, table: sortLeagueTable(table), recent: currentMatches.slice(-10),
    recentChampions: championHistory.slice(0, 8),
    recordPreviews: Object.fromEntries(Object.keys(recordBook).map(category => [category, preview(category as RecordCategory)])),
    championshipLeaders: Object.entries(championships).map(([teamId, titles]) => ({ teamId, titles })).sort((a, b) => b.titles - a.titles || a.teamId.localeCompare(b.teamId)).slice(0, 3),
    archiveSeasonCount: seasonArchive.length, recordsVersion,
    strengths: Object.fromEntries(Object.entries(strengthLayers).map(([id, value]) => [id, value.current])), strengthLayers, strengthDiagnostics: strengthDiagnostics(dynamicState),
  };
}

function finishSeason() {
  const finalTable = sortLeagueTable(table);
  const champion = finalTable[0], runnerUp = finalTable[1], last = finalTable.at(-1)!;
  const selectedRow = finalTable.find(row => row.teamId === selected) ?? finalTable[0];
  const seasonMatches = currentMatches;
  const common: ChampionEntry = { season, seasonLabel: seasonLabel(season), championId: champion.teamId, runnerUpId: runnerUp.teamId, championPoints: champion.points, runnerUpPoints: runnerUp.points, titleMargin: champion.points - runnerUp.points, selectedPosition: selectedRow.position, selectedPoints: selectedRow.points };
  championHistory.unshift(common);
  seasonArchive.unshift({ ...common, lastPlaceTeamId: last.teamId, lastPlacePoints: last.points, totalGoals: seasonMatches.reduce((sum, match) => sum + match.homeGoals + match.awayGoals, 0), totalDraws: seasonMatches.filter(match => match.homeGoals === match.awayGoals).length, homeWins: seasonMatches.filter(match => match.homeGoals > match.awayGoals).length, awayWins: seasonMatches.filter(match => match.homeGoals < match.awayGoals).length, highestScoringTeamId: [...finalTable].sort((a, b) => b.goalsFor - a.goalsFor)[0].teamId, bestDefenceTeamId: [...finalTable].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0].teamId, finalTable });
  updateSeasonRecords(finalTable);
  championships[champion.teamId] = (championships[champion.teamId] ?? 0) + 1;
  closeDynamicSeason(dynamicState, Object.fromEntries(Object.values(table).map(row => [row.teamId, row.played])));
  completed++;
  const finalSnapshot = snapshot(38);
  if (champion.teamId === selected) { running = false; ctx.postMessage({ type: 'champion', snapshot: finalSnapshot, champion: { ...selectedRow, margin: champion.points - runnerUp.points, seed } }); return; }
  startNext = true;
  ctx.postMessage({ type: 'snapshot', snapshot: finalSnapshot });
}

function run() {
  if (!running || paused) return;
  if (startNext) { season++; prepareSeason(); startNext = false; }
  const round = Math.floor(fixtureIndex / matchesPerRound) + 1;
  for (let i = 0; i < matchesPerRound && fixtureIndex < fixtures.length; i++, fixtureIndex++) {
    const fixture = fixtures[fixtureIndex];
    const score = model.simulateScore(teamMap[fixture.homeId], teamMap[fixture.awayId], effectiveRatings(dynamicState), rng);
    const match: PlayedMatch = { ...fixture, ...score, season };
    const distribution = model.distribution(score.lambdaHome, score.lambdaAway);
    const outcomes = distribution.outcomeProbabilities();
    const preMatchStrengths = capturePreMatchStrengths(fixture.homeId, fixture.awayId);
    currentMatches.push(match);
    applyResult(table, fixture, score);
    updateMatchRecords(match, distribution, outcomes, preMatchStrengths);
    applyDynamicMatch(dynamicState, fixture, score, outcomes);
    total++;
  }
  if (fixtureIndex >= fixtures.length) finishSeason(); else ctx.postMessage({ type: 'snapshot', snapshot: snapshot(round) });
  if (running) setTimeout(run, 330 / speed);
}

function reset() { running = false; paused = false; total = 0; completed = 0; season = 1; fixtureIndex = 0; startNext = false; championHistory = []; seasonArchive = []; recordBook = {}; championships = {}; streaks = createStreaks(); recordsVersion = 0; dynamicState = createDynamicStrength(teams, ratings); prepareSeason(); ctx.postMessage({ type: 'reset', snapshot: snapshot(0) }); }
function page<T>(entries: T[], offset = 0, limit = 20) { return { entries: entries.slice(offset, offset + limit), total: entries.length, offset, limit }; }

ctx.onmessage = ({ data }) => {
  if (data.type === 'start') { reset(); selected = data.selected; seed = data.seed >>> 0; speed = data.speed || 1; prepareSeason(); running = true; run(); }
  if (data.type === 'speed') speed = data.speed || 1;
  if (data.type === 'pause') paused = true;
  if (data.type === 'resume') { paused = false; run(); }
  if (data.type === 'reset') reset();
  if (data.type === 'getRecordPage') { const category = data.category as RecordCategory; const result: RecordPage = { category, ...page(recordBook[category]?.entries ?? [], data.offset, data.limit) }; ctx.postMessage({ type: 'recordPage', result }); }
  if (data.type === 'getSeasonArchivePage') { const result: SeasonArchivePage = page(seasonArchive, data.offset, data.limit); ctx.postMessage({ type: 'seasonArchivePage', result }); }
  if (data.type === 'getChampionHistoryPage') { const result: ChampionHistoryPage = page(championHistory, data.offset, data.limit); ctx.postMessage({ type: 'championHistoryPage', result }); }
};
