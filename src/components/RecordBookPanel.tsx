import { teamById } from '../data/teams';
import type { ChampionEntry, RecordCategory, RecordEntry, SimulationSnapshot } from '../domain/types';
import { MatchScoreLine, TeamAbbrLabel } from './MatchScoreLine';

type PageTarget = RecordCategory | 'championHistory' | 'seasonArchive';

const labels: Record<RecordCategory, string> = {
  mostGoalsMatch: '최다 득점 경기', biggestUpset: '최대 이변', lowestProbabilityWin: '최저 승리확률 승리',
  rarestScoreline: '가장 희귀한 스코어', biggestUnderdogBlowout: '가장 압도적인 언더독 승리',
  biggestWin: '최대 점수 차 승리', highestScoringDraw: '최고 득점 무승부',
  longestWinningStreak: '최다 연승', longestLosingStreak: '최대 연패', longestUnbeatenStreak: '최다 무패', longestWinlessStreak: '최다 무승',
  highestSeasonPoints: '최고 승점', lowestSeasonPoints: '최저 승점', mostSeasonWins: '최다 승', fewestSeasonLosses: '최소 패', mostSeasonGoals: '최다 득점', fewestSeasonGoalsConceded: '최소 실점',
};

function formatRound(round: number) {
  return `${round}R`;
}

function period(entry: RecordEntry) {
  if (!entry.start || !entry.end) return entry.seasonLabel;
  return `${entry.start.seasonLabel} ${formatRound(entry.start.round)} → ${entry.end.seasonLabel} ${formatRound(entry.end.round)}${entry.ongoing ? ' · 진행 중' : ''}`;
}

function metadataNumber(entry: RecordEntry, key: string) {
  const value = entry.metadata?.[key];
  return typeof value === 'number' ? value : undefined;
}

function metadataString(entry: RecordEntry, key: string) {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function formatProbability(probability: number | undefined) {
  if (probability === undefined || !Number.isFinite(probability)) return '—';
  const percentage = 100 * probability;
  if (percentage >= 1) return `${percentage.toFixed(1)}%`;
  if (percentage >= .01) return `${percentage.toFixed(3)}%`;
  if (percentage >= .000001) return `${percentage.toFixed(6)}%`;
  return `${percentage.toExponential(2)}%`;
}

function recordValue(entry: RecordEntry) {
  if (entry.category === 'biggestUpset') return `I ${entry.value.toFixed(2)}`;
  if (entry.category === 'biggestUnderdogBlowout') return `B ${entry.value.toFixed(2)}`;
  if (entry.category === 'lowestProbabilityWin') return formatProbability(entry.value);
  if (entry.category === 'rarestScoreline') {
    return formatProbability(metadataNumber(entry, 'exactScoreProbability'));
  }
  if (entry.match) return `${entry.value}골`;
  if (entry.category.includes('Streak')) return `${entry.value}경기`;
  if (entry.category.includes('Points')) return `${entry.value}점`;
  return String(entry.value);
}

function recordSummary(entry: RecordEntry) {
  if (entry.category === 'biggestUpset') {
    return `승리 ${formatProbability(metadataNumber(entry, 'winnerProbability'))} · 상대 ${metadataNumber(entry, 'winOddsRatio')?.toFixed(1)}배`;
  }
  if (entry.category === 'biggestUnderdogBlowout') {
    return `득점 배분 꼬리 ${formatProbability(metadataNumber(entry, 'conditionalAllocationTailProbability'))}`;
  }
  if (entry.category === 'lowestProbabilityWin') {
    return `상대 승리 ${formatProbability(metadataNumber(entry, 'loserProbability'))}`;
  }
  if (entry.category === 'rarestScoreline') {
    return `정확 스코어 확률 ${formatProbability(metadataNumber(entry, 'exactScoreProbability'))}`;
  }
  return undefined;
}

function RecordStatDetails({ entry }: { entry: RecordEntry }) {
  const details: [string, string][] = [];
  if (entry.category === 'biggestUpset' || entry.category === 'biggestUnderdogBlowout') {
    details.push(
      ['경기 전 승리확률', formatProbability(metadataNumber(entry, 'winnerProbability'))],
      ['상대 승리확률', formatProbability(metadataNumber(entry, 'loserProbability'))],
      ['승리확률 격차', `${metadataNumber(entry, 'winOddsRatio')?.toFixed(2) ?? '—'}배`],
      ['예상 득점', `${metadataNumber(entry, 'lambdaWinner')?.toFixed(2) ?? '—'} – ${metadataNumber(entry, 'lambdaLoser')?.toFixed(2) ?? '—'}`],
      ['이변 꼬리확률', formatProbability(metadataNumber(entry, 'upsetPValue'))],
      ['득점 배분 꼬리확률', formatProbability(metadataNumber(entry, 'conditionalAllocationTailProbability'))],
      ['정확 스코어 확률', formatProbability(metadataNumber(entry, 'exactScoreProbability'))],
      ['구조적 격차', `${metadataNumber(entry, 'structuralGap')?.toFixed(1) ?? '—'}점`],
      ['분류', metadataString(entry, 'classification') ?? '—'],
    );
  } else if (entry.category === 'lowestProbabilityWin') {
    details.push(
      ['경기 전 승리확률', formatProbability(metadataNumber(entry, 'winnerProbability'))],
      ['상대 승리확률', formatProbability(metadataNumber(entry, 'loserProbability'))],
      ['무승부 확률', formatProbability(metadataNumber(entry, 'drawProbability'))],
      ['상대 승리확률 비율', `${metadataNumber(entry, 'winOddsRatio')?.toFixed(2) ?? '—'}배`],
      ['정확 스코어 확률', formatProbability(metadataNumber(entry, 'exactScoreProbability'))],
    );
  } else if (entry.category === 'rarestScoreline') {
    details.push(
      ['정확 스코어 확률', formatProbability(metadataNumber(entry, 'exactScoreProbability'))],
      ['스코어 희귀성 지수', metadataNumber(entry, 'exactScoreSurprisal')?.toFixed(2) ?? '—'],
      ['홈 예상 득점', metadataNumber(entry, 'lambdaHome')?.toFixed(2) ?? '—'],
      ['원정 예상 득점', metadataNumber(entry, 'lambdaAway')?.toFixed(2) ?? '—'],
    );
  }
  if (!details.length) return null;
  return <div className="record-stat-grid">
    {details.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
  </div>;
}

function RecordMatchLine({ entry }: { entry: RecordEntry }) {
  const match = entry.match;
  if (!match) return null;
  return (
    <MatchScoreLine
      homeId={match.homeId}
      awayId={match.awayId}
      homeGoals={match.homeGoals}
      awayGoals={match.awayGoals}
    />
  );
}

function recordHeadline(entry: RecordEntry) {
  if (entry.match) return <RecordMatchLine entry={entry} />;
  const unit = entry.category.includes('Streak') ? '경기' : entry.category.includes('Points') ? '점' : '';
  return (
    <span className="record-team-line">
      <TeamAbbrLabel teamId={entry.teamIds[0]} />
      <span className="record-team-value"> · {entry.value}{unit}</span>
    </span>
  );
}

function Board({ category, entries, onOpen }: { category: RecordCategory; entries: RecordEntry[]; onOpen: (target: PageTarget, title: string) => void }) {
  return <section className="record-board">
    <div className="record-board-head"><h3>{labels[category]}</h3><button type="button" onClick={() => onOpen(category, labels[category])}>+ 전체</button></div>
    {entries.length ? entries.slice(0, 3).map((entry, index) => (
      <div className={`record-entry ${index === 0 ? 'leader' : ''} ${entry.match ? 'record-match' : ''} ${category === 'mostGoalsMatch' ? 'most-goals-match' : ''}`} key={entry.id}>
        <span className="record-rank">{index + 1}</span>
        <div className="record-entry-main">
          <div className="record-headline">{recordHeadline(entry)}</div>
          {entry.match ? (
            <div className="record-entry-sub">
              <span className="record-season">{entry.seasonLabel} {formatRound(entry.round ?? 0)}</span>
              {recordSummary(entry) && <span className="record-stat-summary"> · {recordSummary(entry)}</span>}
            </div>
          ) : (
            <div className="record-entry-sub streak">
              <span className="record-season">{period(entry)}</span>
            </div>
          )}
        </div>
        <em className="record-value">{recordValue(entry)}</em>
      </div>
    )) : <p className="record-empty">시뮬레이션 후 표시</p>}
  </section>;
}

export function recordPageLabel(target: PageTarget) { return target === 'championHistory' ? '전체 우승 역사' : target === 'seasonArchive' ? '시즌 아카이브' : labels[target]; }
export function renderRecordPageEntry(entry: RecordEntry) {
  const hasDetails = ['biggestUpset', 'biggestUnderdogBlowout', 'lowestProbabilityWin', 'rarestScoreline'].includes(entry.category);
  return (
    <div className={`history-page-row${hasDetails ? ' record-detail-row' : ''}`} key={entry.id}>
      <div>
        <div className="record-headline">{recordHeadline(entry)}</div>
        <small>
          {entry.match
            ? `${entry.seasonLabel} · ${formatRound(entry.round ?? 0)}`
            : period(entry)}
        </small>
        <RecordStatDetails entry={entry} />
      </div>
      <em>{recordValue(entry)}</em>
    </div>
  );
}
export function renderChampionEntry(entry: ChampionEntry) {
  return <div className="history-page-row" key={entry.season}><div><b>{entry.seasonLabel} · {teamById[entry.championId].name}</b><small>준우승 {teamById[entry.runnerUpId].name} · 선택 팀 {entry.selectedPosition}위 / {entry.selectedPoints}점</small></div><em>+{entry.titleMargin}점</em></div>;
}

export function RecordBookPanel({ snapshot, onOpen }: { snapshot: SimulationSnapshot; onOpen: (target: PageTarget, title: string) => void }) {
  const records = snapshot.recordPreviews;
  return <section className="records-card" aria-label="시즌과 기록">
    <div className="records-card-title"><div><b>시즌 · 기록</b></div><button type="button" onClick={() => onOpen('seasonArchive', '시즌 아카이브')}>+ 시즌 전체</button></div>
    <div className="record-groups">
      <Board category="mostGoalsMatch" entries={records.mostGoalsMatch ?? []} onOpen={onOpen} />
      <Board category="biggestWin" entries={records.biggestWin ?? []} onOpen={onOpen} />
      <Board category="biggestUpset" entries={records.biggestUpset ?? []} onOpen={onOpen} />
      <div className="record-board-slot" aria-hidden="true" />
      <Board category="longestWinningStreak" entries={records.longestWinningStreak ?? []} onOpen={onOpen} />
      <Board category="longestLosingStreak" entries={records.longestLosingStreak ?? []} onOpen={onOpen} />
      <div className="season-records"><div className="season-records-head"><h2>시즌 기록</h2><button type="button" onClick={() => onOpen('championHistory', '전체 우승 역사')}>우승 역사 +</button></div><div><Board category="highestSeasonPoints" entries={records.highestSeasonPoints ?? []} onOpen={onOpen} /><Board category="mostSeasonGoals" entries={records.mostSeasonGoals ?? []} onOpen={onOpen} /></div></div>
    </div>
  </section>;
}
