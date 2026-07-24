import { useEffect, useMemo, useRef, useState } from 'react';
import { teams, teamById } from './data/teams';
import initialRatings from './data/calibrated-ratings.json';
import defaultMarket from './data/default-market.json';
import { normalizeMarketProbabilities } from './calibration/market';
import { readStoredMarket, readStoredRatings } from './calibration/market-storage';
import { toStrengthIndices } from './simulation/strength-index';
import type { ChampionHistoryPage, LeagueRow, RecordCategory, RecordPage, SeasonArchivePage, SimulationSnapshot } from './domain/types';
import { LeagueTable } from './components/LeagueTable';
import { CalibrationLab } from './components/CalibrationLab';
import { ModelGuide } from './components/ModelGuide';
import { RecordBookPanel, recordPageLabel, renderChampionEntry, renderRecordPageEntry } from './components/RecordBookPanel';
import { MatchScoreLine } from './components/MatchScoreLine';
import './lab.css';

const blankRows: LeagueRow[] = teams.map((team, index) => ({
  teamId: team.id,
  position: index + 1,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
}));

type View = 'sim' | 'lab';
const speedOptions = [2, 5, 10, 38] as const;
const formatSeason = (completedSeasons: number) => {
  const firstYear = 2026 + completedSeasons;
  return `${firstYear}/${String((firstYear + 1) % 100).padStart(2, '0')}`;
};
const formatSeasonRound = (completedSeasons: number, round: number) => {
  const firstYear = 2026 + completedSeasons;
  const season = `${String(firstYear).slice(-2)}/${String(firstYear + 1).slice(-2)}`;
  return round > 0 ? `${season} · ${round}R` : season;
};
const randomSeed = () => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] || 1);
};

export default function App() {
  const [view, setView] = useState<View>('sim');
  const [selected, setSelected] = useState('sunderland');
  const [seed, setSeed] = useState(randomSeed);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>({
    season: 1,
    completedSeasons: 0,
    round: 0,
    totalMatches: 0,
    table: blankRows,
    recent: [],
    recentChampions: [],
    recordPreviews: {},
    championshipLeaders: [],
    archiveSeasonCount: 0,
    recordsVersion: 0,
  });
  const [champion, setChampion] = useState<any>(null);
  const [guide, setGuide] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useFixedSeed, setUseFixedSeed] = useState(false);
  const [historyDialog, setHistoryDialog] = useState<{ target: RecordCategory | 'championHistory' | 'seasonArchive'; title: string; page?: RecordPage | ChampionHistoryPage | SeasonArchivePage } | null>(null);
  const [marketRaw, setMarketRaw] = useState(() => readStoredMarket(defaultMarket as Record<string, number>));
  const [baseRatings, setBaseRatings] = useState(() =>
    readStoredRatings((initialRatings.ratings as Record<string, number>) ?? {}),
  );
  const worker = useRef<Worker | null>(null);

  const syncMarketFromStorage = (
    nextMarket?: Record<string, number>,
    nextRatings?: Record<string, number>,
  ) => {
    setMarketRaw(nextMarket ?? readStoredMarket(defaultMarket as Record<string, number>));
    if (nextRatings) {
      setBaseRatings(nextRatings);
      return;
    }
    setBaseRatings(readStoredRatings((initialRatings.ratings as Record<string, number>) ?? {}));
  };

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.get('team') && teamById[query.get('team')!]) setSelected(query.get('team')!);
    if (query.get('seed')) {
      setSeed(query.get('seed')!);
      setUseFixedSeed(true);
      setShowAdvanced(true);
    }
    if (query.get('view') === 'lab') setView('lab');
    const w = new Worker(new URL('./simulation/simulation-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.type === 'recordPage' || data.type === 'seasonArchivePage' || data.type === 'championHistoryPage') {
        setHistoryDialog(current => current ? { ...current, page: data.result } : current);
      }
      if (data.type === 'champion') {
        setStatus('complete');
        setChampion(data.champion);
      } else if (data.type === 'snapshot') {
        // In-flight snapshots must not overwrite an intentional pause.
        setStatus(current => (current === 'paused' || current === 'complete' ? current : 'running'));
      } else if (data.type === 'reset') setStatus('idle');
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const begin = () => {
    setChampion(null);
    setStatus('running');
    const activeSeed = useFixedSeed ? Number(seed) || 1 : Number(randomSeed());
    setSeed(String(activeSeed));
    worker.current?.postMessage({ type: 'start', selected, seed: activeSeed, speed });
  };
  const pause = () => {
    setStatus('paused');
    worker.current?.postMessage({ type: 'pause' });
  };
  const resume = () => {
    setStatus('running');
    worker.current?.postMessage({ type: 'resume' });
  };
  const reset = () => {
    setChampion(null);
    worker.current?.postMessage({ type: 'reset' });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (view !== 'sim') return;
      if (guide || historyDialog || champion) return;
      if (status === 'running') {
        event.preventDefault();
        pause();
      } else if (status === 'paused') {
        event.preventDefault();
        resume();
      } else if (status === 'idle') {
        event.preventDefault();
        begin();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [status, view, guide, historyDialog, champion, selected, seed, speed, useFixedSeed]);

  const market = useMemo(() => normalizeMarketProbabilities(marketRaw, teams), [marketRaw]);
  const selectedTeam = teamById[selected];
  const strengths = snapshot.strengths ?? toStrengthIndices(teams, baseRatings);
  const copyShare = () =>
    navigator.clipboard.writeText(`${location.origin}${location.pathname}?team=${selected}&seed=${seed}`);
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => (strengths[b.id] ?? 0) - (strengths[a.id] ?? 0)),
    [strengths],
  );
  const visibleRatings = showAllRatings ? sortedTeams : sortedTeams.slice(0, 8);
  const changeSpeed = (nextSpeed: (typeof speedOptions)[number]) => {
    const actualSpeed = speed === nextSpeed ? 1 : nextSpeed;
    setSpeed(actualSpeed);
    worker.current?.postMessage({ type: 'speed', speed: actualSpeed });
  };
  const openHistory = (target: RecordCategory | 'championHistory' | 'seasonArchive', title = recordPageLabel(target)) => {
    setHistoryDialog({ target, title });
    if (target === 'championHistory') worker.current?.postMessage({ type: 'getChampionHistoryPage', offset: 0, limit: 20 });
    else if (target === 'seasonArchive') worker.current?.postMessage({ type: 'getSeasonArchivePage', offset: 0, limit: 20 });
    else worker.current?.postMessage({ type: 'getRecordPage', category: target, offset: 0, limit: 20 });
  };

  if (view === 'lab') {
    return (
      <CalibrationLab
        onBack={() => {
          syncMarketFromStorage();
          setView('sim');
          const url = new URL(location.href);
          url.searchParams.delete('view');
          history.replaceState(null, '', url);
        }}
        onMarketUpdated={(nextMarket, nextRatings) => {
          syncMarketFromStorage(nextMarket, nextRatings);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header" aria-label="도구">
        <div className="header-actions">
          <button type="button" className="help" onClick={() => setGuide(true)} aria-label="모델 설명 열기">
            ?
          </button>
          <button
            type="button"
            className="nav-lab"
            onClick={() => {
              setView('lab');
              const url = new URL(location.href);
              url.searchParams.set('view', 'lab');
              history.replaceState(null, '', url);
            }}
          >
            시장 보정
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="app-rail left">
          <div className="sim-brand wordmark">
            PL<span>∞</span>
          </div>
          <p className="rail-kicker">PREMIER LEAGUE</p>
          <h1>무한 리그<br /><em>시뮬레이터</em></h1>

          <label className="rail-field">
            <span>구단</span>
            <select value={selected} onChange={event => setSelected(event.target.value)}>
              {teams.map(team => (
                <option value={team.id} key={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <div className="advanced-control">
            <button
              type="button"
              className="advanced-toggle"
              onClick={() => setShowAdvanced(value => !value)}
              aria-expanded={showAdvanced}
            >
              고급 설정 <span>시드 · 재현</span>
            </button>
            {showAdvanced && (
              <div className="advanced-panel">
                <label className="seed-mode">
                  <input
                    type="checkbox"
                    checked={useFixedSeed}
                    onChange={event => setUseFixedSeed(event.target.checked)}
                  />
                  같은 시드로 재현
                </label>
                {useFixedSeed ? (
                  <label className="rail-field">
                    <span>재현 시드</span>
                    <input value={seed} onChange={event => setSeed(event.target.value.replace(/\D/g, ''))} />
                  </label>
                ) : null}
              </div>
            )}
          </div>

          <div className="rail-actions">
            {status === 'running' ? (
              <button type="button" className="rail-start pause" onClick={pause}>
                일시정지
              </button>
            ) : (
              <button type="button" className="rail-start" onClick={status === 'paused' ? resume : begin}>
                {status === 'paused' ? '계속' : '시작'}
              </button>
            )}
            <button type="button" className="ghost" onClick={reset}>
              리셋
            </button>
          </div>

          <div className="speed-control" aria-label="시뮬레이션 속도">
            <span>속도 <b>×{speed}</b></span>
            <div>
              {speedOptions.map(option => (
                <button
                  type="button"
                  key={option}
                  className={speed === option ? 'active' : ''}
                  aria-pressed={speed === option}
                  onClick={() => changeSpeed(option)}
                >
                  ×{option}
                </button>
              ))}
            </div>
          </div>

          <div className="rail-stats">
            <div>
              <span>선택</span>
              <b>{selectedTeam.name}</b>
            </div>
            <div>
              <span>시즌</span>
              <b>
                {formatSeason(snapshot.completedSeasons)}
              </b>
            </div>
            <div>
              <span>라운드</span>
              <b>{snapshot.round}/38</b>
            </div>
            <div>
              <span>경과 시즌</span>
              <b>{snapshot.completedSeasons.toLocaleString()}</b>
            </div>
            <div>
              <span>경기 수</span>
              <b>{snapshot.totalMatches.toLocaleString()}</b>
            </div>
          </div>
        </aside>

        <main className="sim-main">
          <aside className="side-insights">
            <section className="rail-block ratings-block side-card">
              <div className="rail-title">시장 확률 · 전력</div>
              <div className="rail-ratings">
                {visibleRatings.map(team => (
                    <div className="rail-rating-row" key={team.id}>
                      <i style={{ background: team.color }}>
                        <img src={team.crestUrl} alt="" />
                      </i>
                      <span className="rating-abbr" title={team.name}>{team.abbr}</span>
                      <em>{(market[team.id] * 100).toFixed(1)}%</em>
                      <b className="pos">{strengths[team.id] ?? 50}</b>
                    </div>
                ))}
              </div>
              <button
                type="button"
                className="ratings-toggle"
                onClick={() => setShowAllRatings(value => !value)}
                aria-expanded={showAllRatings}
              >
                {showAllRatings ? '상위 8팀만 보기' : `전체 ${teams.length}팀 보기`}
              </button>
            </section>
          </aside>

          <div className="recent-stack">
            <section className="recent-bento" aria-label="최근 경기">
              <div className="rail-title">최근 경기 <span>{formatSeasonRound(snapshot.completedSeasons, snapshot.round)}</span></div>
              <div className="recent-feed">
                {snapshot.recent.length ? (
                  snapshot.recent
                    .slice()
                    .reverse()
                    .map((match, index) => (
                      <p key={`${match.season}-${match.round}-${match.homeId}-${index}`} className="rail-match">
                        <MatchScoreLine
                          homeId={match.homeId}
                          awayId={match.awayId}
                          homeGoals={match.homeGoals}
                          awayGoals={match.awayGoals}
                        />
                      </p>
                    ))
                ) : (
                  <p className="empty">시작 후 표시</p>
                )}
              </div>
            </section>

            <section className="rail-block championship-block side-card">
              <div className="rail-title">누적 우승 횟수 <span>{snapshot.completedSeasons}시즌</span></div>
              <div className="championship-list">
                {snapshot.championshipLeaders
                  .map(({ teamId, titles }) => (
                    <div key={teamId}>
                      <span>{teamById[teamId].name}</span>
                      <b>{titles}회</b>
                    </div>
                  ))}
                {snapshot.completedSeasons === 0 && <p className="empty">시뮬레이션 후 표시</p>}
              </div>
            </section>
          </div>

          <section className="app-center">
            <LeagueTable rows={snapshot.table} teams={teams} selectedId={selected} />
          </section>
          <RecordBookPanel snapshot={snapshot} onOpen={openHistory} />
        </main>
      </div>

      {champion && (
        <div className="champion">
          <div>
            <p>시즌 결과</p>
            <h2>
              {selectedTeam.name}
              <br />
              <em>우승</em>
            </h2>
            <div className="champ-stats">
              <span>
                걸린 시즌 <b>{snapshot.completedSeasons}</b>
              </span>
              <span>
                승점 <b>{champion.points}</b>
              </span>
              <span>
                2위와 차이 <b>+{champion.margin}</b>
              </span>
              <span>
                득실차{' '}
                <b>
                  {champion.goalDifference > 0 ? '+' : ''}
                  {champion.goalDifference}
                </b>
              </span>
            </div>
            <button className="primary" onClick={copyShare}>
              현재 설정 주소 복사
            </button>
            <button className="ghost light" onClick={begin}>
              새 시뮬레이션 시작
            </button>
          </div>
        </div>
      )}
      {guide && <ModelGuide onClose={() => setGuide(false)} />}
      {historyDialog && <div className="modal history-dialog" role="dialog" aria-modal="true" aria-label={historyDialog.title}>
        <div>
          <button className="close" type="button" onClick={() => setHistoryDialog(null)} aria-label="닫기">×</button>
          <p className="eyebrow">기록 · 역사 아카이브</p><h2>{historyDialog.title}</h2>
          <p className="history-summary">{historyDialog.page ? `${historyDialog.page.total.toLocaleString()}개 기록` : '기록을 불러오는 중…'}</p>
          <div className="history-page-list">
            {historyDialog.page && ('category' in historyDialog.page
              ? historyDialog.page.entries.map(renderRecordPageEntry)
              : historyDialog.target === 'championHistory'
                ? (historyDialog.page as ChampionHistoryPage).entries.map(renderChampionEntry)
                : (historyDialog.page as SeasonArchivePage).entries.map(entry => <div className="history-page-row" key={entry.season}><div><b>{entry.seasonLabel} · {teamById[entry.championId].name}</b><small>준우승 {teamById[entry.runnerUpId].name} · {entry.totalGoals}골 · 선택 팀 {entry.selectedPosition}위</small></div><em>+{entry.titleMargin}점</em></div>))}
          </div>
        </div>
      </div>}
    </div>
  );
}
