import { useEffect, useMemo, useRef, useState } from 'react';
import { teams, teamById } from './data/teams';
import initialRatings from './data/calibrated-ratings.json';
import defaultMarket from './data/default-market.json';
import { normalizeMarketProbabilities } from './calibration/market';
import { toStrengthIndices } from './simulation/strength-index';
import type { LeagueRow, SimulationSnapshot } from './domain/types';
import { LeagueTable } from './components/LeagueTable';
import { CalibrationLab } from './components/CalibrationLab';
import { ModelGuide } from './components/ModelGuide';
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
    history: [],
  });
  const [champion, setChampion] = useState<any>(null);
  const [guide, setGuide] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useFixedSeed, setUseFixedSeed] = useState(false);
  const worker = useRef<Worker | null>(null);

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
      if (data.type === 'champion') {
        setStatus('complete');
        setChampion(data.champion);
      } else if (data.type === 'snapshot') setStatus('running');
      else if (data.type === 'reset') setStatus('idle');
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
  const reset = () => {
    setChampion(null);
    worker.current?.postMessage({ type: 'reset' });
  };
  const market = useMemo(() => normalizeMarketProbabilities(defaultMarket, teams), []);
  const selectedTeam = teamById[selected];
  const record = snapshot.records;
  const baseRatings = initialRatings.ratings as Record<string, number>;
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

  if (view === 'lab') {
    return (
      <CalibrationLab
        onBack={() => {
          setView('sim');
          const url = new URL(location.href);
          url.searchParams.delete('view');
          history.replaceState(null, '', url);
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
              <button type="button" className="rail-start pause" onClick={() => { setStatus('paused'); worker.current?.postMessage({ type: 'pause' }); }}>
                일시정지
              </button>
            ) : (
              <button type="button" className="rail-start" onClick={status === 'paused' ? () => { setStatus('running'); worker.current?.postMessage({ type: 'resume' }); } : begin}>
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

          <section className="rail-block grow">
            <div className="rail-title">최근 경기</div>
            <div className="rail-feed">
              {snapshot.recent.length ? (
                snapshot.recent
                  .slice()
                  .reverse()
                  .slice(0, 6)
                  .map((match, index) => (
                    <p key={index}>
                      {teamById[match.homeId].name}{' '}
                      <b>
                        {match.homeGoals}–{match.awayGoals}
                      </b>{' '}
                      {teamById[match.awayId].name}
                    </p>
                  ))
              ) : (
                <p className="empty">시작 후 표시</p>
              )}
            </div>
          </section>
        </aside>

        <main className="sim-main">
          <section className="app-center">
            <LeagueTable rows={snapshot.table} teams={teams} selectedId={selected} />
          </section>

          <div className="sim-side-stack">
          <aside className="app-rail right">
          <section className="rail-block ratings-block">
            <div className="rail-title">
              시장 확률 · 전력 <span>0–100 · 동적</span>
            </div>
            <div className="rail-ratings">
              {visibleRatings.map(team => (
                  <div className="rail-rating-row" key={team.id}>
                    <i style={{ background: team.color }}>
                      <img src={team.crestUrl} alt="" />
                    </i>
                    <span>{team.name}</span>
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

          <section className="rail-block championship-block">
            <div className="rail-title">누적 우승 횟수 <span>{snapshot.completedSeasons}시즌</span></div>
            <div className="championship-list">
              {Object.entries(snapshot.championships ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([teamId, wins]) => (
                  <div key={teamId}>
                    <span>{teamById[teamId].name}</span>
                    <b>{wins}회</b>
                  </div>
                ))}
              {snapshot.completedSeasons === 0 && <p className="empty">시뮬레이션 후 표시</p>}
            </div>
          </section>
          </aside>
          <section className="records-card">
            <div className="records-card-title">
              <b>시즌 · 기록</b>
              <span>경기 · 시즌 뉴스</span>
            </div>
            <div className="rail-feed compact">
              {record?.mostGoals && (
                <p>
                  <small>{formatSeason(record.mostGoals.season - 1)} · {record.mostGoals.round}R</small>
                  최다 골{' '}
                  <b>
                    {teamById[record.mostGoals.homeId].name} {record.mostGoals.homeGoals}–
                    {record.mostGoals.awayGoals} {teamById[record.mostGoals.awayId].name}
                  </b>
                </p>
              )}
              {record?.biggestUpset && (
                <p>
                  <small>{formatSeason(record.biggestUpset.season - 1)} · {record.biggestUpset.round}R</small>
                  최대 이변{' '}
                  <b>
                    {teamById[record.biggestUpset.homeId].name} {record.biggestUpset.homeGoals}–
                    {record.biggestUpset.awayGoals} {teamById[record.biggestUpset.awayId].name}
                  </b>
                  <small>역배 승리 확률 {(record.biggestUpset.winnerProbability * 100).toFixed(1)}% · 상대 승리 확률 {(record.biggestUpset.favoriteProbability * 100).toFixed(1)}%</small>
                </p>
              )}
              {snapshot.history.slice(0, 3).map(item => (
                <p key={item.season}>
                  {formatSeason(item.season - 1)}{' '}
                  <b>{teamById[item.championId].name}</b>
                  <small>선택 {item.selectedPosition}위 · {item.selectedPoints}점</small>
                </p>
              ))}
              {!record?.mostGoals && snapshot.history.length === 0 && <p className="empty">기록 없음</p>}
            </div>
          </section>
          </div>
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
    </div>
  );
}
