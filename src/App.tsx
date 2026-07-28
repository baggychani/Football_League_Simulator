import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { teams, teamById } from './data/teams';
import { activeLeague } from './data/league-catalog/active';
import {
  formatCompetitionSeason,
  regularSeasonRounds,
} from './data/league-catalog/types';
import {
  activeMarketSnapshot,
  activeRatings,
} from './data/active-data';
import { normalizeMarketProbabilities } from './calibration/market';
import { readStoredMarket, readStoredRatings } from './calibration/market-storage';
import { toStrengthIndices } from './simulation/strength-index';
import type { ChampionHistoryPage, LeagueRow, RecordCategory, RecordPage, SeasonArchivePage, SimulationSnapshot, TeamTitleSummary } from './domain/types';
import { LeagueTable } from './components/LeagueTable';
import { CalibrationLab } from './components/CalibrationLab';
import { ModelGuide } from './components/ModelGuide';
import { RecordBookPanel, recordPageLabel, renderChampionEntry, renderRecordPageEntry } from './components/RecordBookPanel';
import { MatchScoreLine, TeamAbbrLabel } from './components/MatchScoreLine';
import {
  StrengthPulseChart,
  type StrengthPlayback,
  type StrengthSample,
} from './components/StrengthPulseChart';
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from './simulation/worker-protocol';
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
type RightPage = 'strength' | 'records' | 'news';
type ChampionResult = LeagueRow & {
  margin: number;
  seed: number;
  selectedId: string;
};
type DisplayFrame = {
  frame: number;
  snapshot: SimulationSnapshot;
  champion?: ChampionResult;
};
const roundsPerSeason = regularSeasonRounds(activeLeague.competition);
const speedOptions = [...new Set([2, 5, 10, roundsPerSeason])];
const formatSeason = (seasonNumber: number) =>
  formatCompetitionSeason(activeLeague.competition, seasonNumber);
const formatSeasonRound = (seasonNumber: number, round: number) => {
  const season = formatSeason(seasonNumber)
    .split('/')
    .map(part => part.slice(-2))
    .join('/');
  return round > 0 ? `${season} · ${round}R` : season;
};
const randomSeed = () => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] || 1);
};
const initialSnapshot = (): SimulationSnapshot => ({
  season: 1,
  completedSeasons: 0,
  round: 0,
  totalMatches: 0,
  teams: [...teams],
  table: blankRows.map(row => ({ ...row })),
  recent: [],
  recentChampions: [],
  recordPreviews: {},
  championshipLeaders: [],
  archiveSeasonCount: 0,
  recordsVersion: 0,
});

function strengthSampleFromFrame(frame: DisplayFrame): StrengthSample {
  return {
    frame: frame.frame,
    tick: frame.snapshot.totalMatches,
    season: frame.snapshot.season,
    round: frame.snapshot.round,
    absoluteRound: Math.max(
      0,
      (frame.snapshot.season - 1) * roundsPerSeason + frame.snapshot.round,
    ),
    values: { ...frame.snapshot.strengths },
  };
}

function AnimatedTitleCount({ titles }: { titles: number }) {
  const [transition, setTransition] = useState<{
    current: number;
    previous: number | null;
    version: number;
  }>({ current: titles, previous: null, version: 0 });

  useEffect(() => {
    setTransition(current => current.current === titles
      ? current
      : { current: titles, previous: current.current, version: current.version + 1 });
    const timer = window.setTimeout(() => {
      setTransition(current => ({ ...current, previous: null }));
    }, 480);
    return () => window.clearTimeout(timer);
  }, [titles]);

  return (
    <span className="championship-count-transition" aria-label={`${titles}회`}>
      <span className="championship-count-value" aria-hidden="true">
        {transition.previous !== null ? (
          <b className="championship-count is-leaving">{transition.previous}</b>
        ) : null}
        <b
          className={`championship-count${transition.version ? ' is-entering' : ''}`}
          key={transition.version}
        >
          {transition.current}
        </b>
      </span>
      <span className="championship-count-unit" aria-hidden="true">회</span>
    </span>
  );
}

function ChampionshipLeaderboard({ leaders }: { leaders: TeamTitleSummary[] }) {
  const rowNodes = useRef(new Map<string, HTMLDivElement>());
  const previousPositions = useRef(new Map<string, DOMRect>());
  const leaderSignature = leaders.map(({ teamId, titles }) => `${teamId}:${titles}`).join('|');

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    rowNodes.current.forEach((node, teamId) => {
      if (node.isConnected) nextPositions.set(teamId, node.getBoundingClientRect());
    });
    nextPositions.forEach((next, teamId) => {
      const previous = previousPositions.current.get(teamId);
      const node = rowNodes.current.get(teamId);
      const offset = previous ? previous.top - next.top : 0;
      if (node && Math.abs(offset) > 1) {
        node.animate(
          [
            { transform: `translateY(${offset}px)` },
            { transform: 'translateY(0)' },
          ],
          { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      }
    });
    previousPositions.current = nextPositions;
  }, [leaderSignature]);

  return leaders.map(({ teamId, titles }) => (
    <div
      className="championship-entry is-new"
      key={teamId}
      ref={node => {
        if (node) rowNodes.current.set(teamId, node);
        else rowNodes.current.delete(teamId);
      }}
    >
      <span className="championship-team">
        <i style={{ background: teamById[teamId].color }}>
          <img
            src={teamById[teamId].crestUrl}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </i>
        <span className="championship-team-name">
          {teamById[teamId].nameKo ?? teamById[teamId].name}
        </span>
      </span>
      <AnimatedTitleCount titles={titles} />
    </div>
  ));
}

export default function App() {
  const [view, setView] = useState<View>('sim');
  const [selected, setSelected] = useState('');
  const [seed, setSeed] = useState(randomSeed);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(initialSnapshot);
  const [champion, setChampion] = useState<ChampionResult | null>(null);
  const [guide, setGuide] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [rightPage, setRightPage] = useState<RightPage>('strength');
  const [championshipOrder, setChampionshipOrder] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useFixedSeed, setUseFixedSeed] = useState(false);
  const [historyDialog, setHistoryDialog] = useState<{ target: RecordCategory | 'championHistory' | 'seasonArchive'; title: string; page?: RecordPage | ChampionHistoryPage | SeasonArchivePage } | null>(null);
  const [marketRaw, setMarketRaw] = useState(() =>
    readStoredMarket(activeMarketSnapshot as Record<string, number>)
  );
  const [baseRatings, setBaseRatings] = useState(() =>
    readStoredRatings(activeRatings as Record<string, number>),
  );
  const worker = useRef<Worker | null>(null);
  const selectedRef = useRef(selected);
  const statusRef = useRef(status);
  const speedRef = useRef(speed);
  const displayFramesRef = useRef<DisplayFrame[]>([]);
  const strengthSamplesRef = useRef<StrengthSample[]>([]);
  const playbackRef = useRef<StrengthPlayback>({
    fromFrame: 0,
    toFrame: null,
    progress: 0,
  });
  const sendWorker = (message: SimulationWorkerRequest) => {
    worker.current?.postMessage(message);
  };
  const resetDisplayTimeline = (frame: DisplayFrame) => {
    displayFramesRef.current = [frame];
    strengthSamplesRef.current = [strengthSampleFromFrame(frame)];
    playbackRef.current = {
      fromFrame: frame.frame,
      toFrame: null,
      progress: 0,
    };
    setSnapshot(frame.snapshot);
  };
  const appendDisplayFrame = (frame: DisplayFrame) => {
    const previous = displayFramesRef.current;
    const last = previous.at(-1);
    if (last?.frame === frame.frame) return;
    const minimumFrame = playbackRef.current.fromFrame - 240;
    displayFramesRef.current = [...previous, frame]
      .filter(entry => entry.frame >= minimumFrame);
    strengthSamplesRef.current = [...strengthSamplesRef.current, strengthSampleFromFrame(frame)]
      .filter(entry => entry.frame >= minimumFrame);
  };

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    document.title = view === 'lab'
      ? `${activeLeague.competition.name} ∞ · 시장 보정`
      : `${activeLeague.competition.name} ∞`;
  }, [view]);

  const syncMarketFromStorage = (
    nextMarket?: Record<string, number>,
    nextRatings?: Record<string, number>,
  ) => {
    setMarketRaw(nextMarket ?? readStoredMarket(
      activeMarketSnapshot as Record<string, number>,
    ));
    if (nextRatings) {
      setBaseRatings(nextRatings);
      return;
    }
    setBaseRatings(readStoredRatings(activeRatings as Record<string, number>));
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
    w.onmessage = ({ data }: MessageEvent<SimulationWorkerResponse>) => {
      if (data.type === 'recordPage' || data.type === 'seasonArchivePage' || data.type === 'championHistoryPage') {
        setHistoryDialog(current => current ? { ...current, page: data.result } : current);
        return;
      }
      if (data.type === 'reset') {
        resetDisplayTimeline({ frame: data.displayFrame, snapshot: data.snapshot });
        return;
      }
      if (data.type === 'snapshot') {
        appendDisplayFrame({ frame: data.displayFrame, snapshot: data.snapshot });
        return;
      }
      if (data.type === 'champion') {
        appendDisplayFrame({
          frame: data.displayFrame,
          snapshot: data.snapshot,
          champion: { ...data.champion, selectedId: data.selectedId },
        });
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    let frame = 0;
    let previousTime = performance.now();

    const advance = (now: number) => {
      const elapsed = Math.max(0, now - previousTime);
      previousTime = now;
      const timeline = playbackRef.current;
      const frames = displayFramesRef.current;

      if (statusRef.current !== 'running') {
        frame = requestAnimationFrame(advance);
        return;
      }

      let index = frames.findIndex(entry => entry.frame === timeline.fromFrame);
      if (index < 0 && frames.length) {
        index = 0;
        timeline.fromFrame = frames[0].frame;
        timeline.progress = 0;
      }
      if (index < 0 || !frames[index + 1]) {
        timeline.toFrame = null;
        timeline.progress = 0;
        frame = requestAnimationFrame(advance);
        return;
      }

      let progress = timeline.progress + elapsed / (330 / Math.max(speedRef.current, 1));
      while (progress >= 1 && frames[index + 1]) {
        progress -= 1;
        index += 1;
        const displayed = frames[index];
        timeline.fromFrame = displayed.frame;
        setSnapshot(displayed.snapshot);

        if (displayed.champion) {
          timeline.progress = 0;
          timeline.toFrame = null;
          statusRef.current = 'complete';
          setStatus('complete');
          setChampion(displayed.champion);
          frame = requestAnimationFrame(advance);
          return;
        }
      }

      const next = frames[index + 1];
      if (!next) {
        timeline.progress = 0;
        timeline.toFrame = null;
      } else {
        timeline.progress = progress;
        timeline.toFrame = next.frame;
      }
      frame = requestAnimationFrame(advance);
    };

    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
    sendWorker({ type: 'selected', selected });
    if (!selected) setChampion(null);
  }, [selected]);

  const changeSelected = (nextSelected: string) => {
    selectedRef.current = nextSelected;
    setSelected(nextSelected);
    setChampion(null);
    sendWorker({ type: 'selected', selected: nextSelected });
  };

  useEffect(() => {
    if (selected && !snapshot.teams.some(team => team.id === selected)) {
      changeSelected('');
    }
  }, [selected, snapshot.teams]);

  const begin = () => {
    setChampion(null);
    statusRef.current = 'running';
    setStatus('running');
    resetDisplayTimeline({ frame: 0, snapshot: initialSnapshot() });
    const activeSeed = useFixedSeed ? Number(seed) || 1 : Number(randomSeed());
    setSeed(String(activeSeed));
    sendWorker({
      type: 'start',
      selected,
      seed: activeSeed,
      speed,
      ratings: baseRatings,
    });
  };
  const pause = () => {
    statusRef.current = 'paused';
    setStatus('paused');
    sendWorker({ type: 'pause' });
  };
  const resume = () => {
    statusRef.current = 'running';
    setStatus('running');
    sendWorker({ type: 'resume' });
  };
  const reset = () => {
    setChampion(null);
    statusRef.current = 'idle';
    setStatus('idle');
    resetDisplayTimeline({ frame: 0, snapshot: initialSnapshot() });
    sendWorker({ type: 'reset' });
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
  const rosterTeams = snapshot.teams.length ? snapshot.teams : teams;
  const selectedTeam = teamById[selected];
  const strengths = useMemo(
    () => snapshot.strengths ?? toStrengthIndices(teams, baseRatings),
    [snapshot.strengths, baseRatings],
  );
  const copyShare = () => {
    const url = new URL(location.href);
    url.search = '';
    if (selected) url.searchParams.set('team', selected);
    url.searchParams.set('seed', seed);
    return navigator.clipboard.writeText(url.toString());
  };
  // Keep the strength-page roster ordered by stable market odds so rows do not
  // reshuffle every time live strength ticks — only the numeric cells move.
  const sortedTeams = useMemo(
    () => [...rosterTeams].sort((a, b) => (market[b.id] ?? 0) - (market[a.id] ?? 0)),
    [market, rosterTeams],
  );
  useEffect(() => {
    const currentIds = snapshot.championshipLeaders.map(entry => entry.teamId);
    setChampionshipOrder(previous => {
      const next = [
        ...previous.filter(teamId => currentIds.includes(teamId)),
        ...currentIds.filter(teamId => !previous.includes(teamId)),
      ];
      return next.length === previous.length && next.every((teamId, index) => teamId === previous[index])
        ? previous
        : next;
    });
  }, [snapshot.championshipLeaders]);
  const displayedChampionshipLeaders = useMemo(
    () => [...snapshot.championshipLeaders].sort((left, right) => {
      if (right.titles !== left.titles) return right.titles - left.titles;
      const leftIndex = championshipOrder.indexOf(left.teamId);
      const rightIndex = championshipOrder.indexOf(right.teamId);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
        - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }),
    [snapshot.championshipLeaders, championshipOrder],
  );
  const countedSeasons = snapshot.completedSeasons
    + (snapshot.round < roundsPerSeason && Object.values(snapshot.qualifications ?? {}).includes('champion') ? 1 : 0);
  const changeSpeed = (nextSpeed: number) => {
    const actualSpeed = speed === nextSpeed ? 1 : nextSpeed;
    speedRef.current = actualSpeed;
    setSpeed(actualSpeed);
    sendWorker({ type: 'speed', speed: actualSpeed });
  };
  const openHistory = (target: RecordCategory | 'championHistory' | 'seasonArchive', title = recordPageLabel(target)) => {
    setHistoryDialog({ target, title });
    if (target === 'championHistory') sendWorker({ type: 'getChampionHistoryPage', offset: 0, limit: 20 });
    else if (target === 'seasonArchive') sendWorker({ type: 'getSeasonArchivePage', offset: 0, limit: 20 });
    else sendWorker({ type: 'getRecordPage', category: target, offset: 0, limit: 20 });
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
    <div
      className="app-shell"
      style={{ '--club-count': rosterTeams.length } as CSSProperties}
    >
      <div className="app-layout">
        <aside className="app-rail left">
          <div className="sim-brand wordmark">
            {activeLeague.ui.wordmark}<span>∞</span>
          </div>
          <p className="rail-kicker">{activeLeague.ui.kicker}</p>
          <h1>
            무한 리그<br />
            <span className="sim-title-line">
              <em>시뮬레이터</em>
              <button type="button" className="rail-help" onClick={() => setGuide(true)} aria-label="모델 설명 열기" title="모델 설명">
                ?
              </button>
            </span>
          </h1>

          <label className="rail-field">
            <span>구단</span>
            <select
              className={selected ? undefined : 'is-unselected'}
              value={selected}
              onChange={event => changeSelected(event.target.value)}
            >
              <option value="">선택하지 않음</option>
              {rosterTeams.map(team => (
                <option value={team.id} key={team.id}>
                  {team.nameKo ?? team.name}
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
              <b className={selectedTeam ? undefined : 'is-unselected'}>
                {selectedTeam ? selectedTeam.nameKo ?? selectedTeam.name : '선택하지 않음'}
              </b>
            </div>
            <div>
              <span>시즌</span>
              <b>
                {formatSeason(snapshot.season)}
              </b>
            </div>
            <div>
              <span>라운드</span>
              <b>{snapshot.round}/{roundsPerSeason}</b>
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
          <div className="rail-bottom">
            <button
              type="button"
              className="rail-market"
              onClick={() => {
                if (status === 'running') pause();
                setView('lab');
                const url = new URL(location.href);
                url.searchParams.set('view', 'lab');
                history.replaceState(null, '', url);
              }}
            >
              Polymarket 시장 보정 <span aria-hidden="true">↗</span>
            </button>
            <footer className="rail-credit">2026 Bae Gichan</footer>
          </div>
        </aside>

        <main className="sim-main">
          <div className="recent-stack">
            <section className="recent-bento" aria-label="최근 경기">
              <div className="rail-title">최근 경기 <span>{formatSeasonRound(snapshot.season, snapshot.round)}</span></div>
              <div className="recent-feed">
                {Array.from({ length: 10 }, (_, index) => {
                  const match = snapshot.recent[snapshot.recent.length - 1 - index];
                  return match ? (
                      <p key={`${match.season}-${match.round}-${match.homeId}-${index}`} className="rail-match">
                        <MatchScoreLine
                          homeId={match.homeId}
                          awayId={match.awayId}
                          homeGoals={match.homeGoals}
                          awayGoals={match.awayGoals}
                        />
                      </p>
                    ) : (
                      <p
                        className="rail-match is-placeholder"
                        key={`recent-placeholder-${index}`}
                        aria-hidden="true"
                      />
                    );
                })}
                {snapshot.recent.length === 0 ? (
                  <span className="recent-placeholder-label">시뮬레이션 후 표시</span>
                ) : null}
              </div>
            </section>

            <section className="rail-block movement-block side-card" aria-label="지난 시즌 승격 및 강등">
              <div className="rail-title">
                승격 · 강등
                <span>
                  {snapshot.previousSeasonMovements?.sourceSeasonLabel ?? '이전 시즌'}
                </span>
              </div>
              <div className="movement-columns">
                {([
                  ['promotion', '▲', snapshot.previousSeasonMovements?.promotedTeamIds ?? []],
                  ['relegation', '▼', snapshot.previousSeasonMovements?.relegatedTeamIds ?? []],
                ] as const).map(([kind, label, teamIds]) => (
                  <div className={`movement-column ${kind}`} key={kind}>
                    <h3>{label}</h3>
                    {teamIds.length
                      ? teamIds.map(teamId => (
                          <div className="movement-team" key={teamId}>
                            <TeamAbbrLabel teamId={teamId} />
                          </div>
                        ))
                      : Array.from({ length: 3 }, (_, index) => (
                          <div className="movement-team is-empty" key={`${kind}-${index}`} aria-hidden>
                            <span>—</span>
                          </div>
                        ))}
                  </div>
                ))}
              </div>
            </section>

            <section className="rail-block championship-block side-card">
              <div className="rail-title">누적 우승 횟수 <span>{countedSeasons}시즌</span></div>
              <div className="championship-list">
                <ChampionshipLeaderboard leaders={displayedChampionshipLeaders} />
                {snapshot.championshipLeaders.length === 0 && <p className="empty">시뮬레이션 후 표시</p>}
              </div>
            </section>
          </div>

          <section className="app-center">
            <LeagueTable
              rows={snapshot.table}
              teams={rosterTeams}
              selectedId={selected}
              qualifications={snapshot.qualifications}
              qualificationRules={activeLeague.competition.qualification}
              relegationPositions={
                activeLeague.competition.relegation?.automatic?.positions ?? []
              }
            />
          </section>
          <section className="right-pages" aria-label="상세 페이지">
            <div className="right-page-tabs" role="tablist" aria-label="오른쪽 페이지 선택">
              <button
                type="button"
                role="tab"
                id="right-tab-strength"
                aria-selected={rightPage === 'strength'}
                aria-controls="right-panel-strength"
                className={rightPage === 'strength' ? 'active' : ''}
                onClick={() => setRightPage('strength')}
              >
                전력
              </button>
              <button
                type="button"
                role="tab"
                id="right-tab-records"
                aria-selected={rightPage === 'records'}
                aria-controls="right-panel-records"
                className={rightPage === 'records' ? 'active' : ''}
                onClick={() => setRightPage('records')}
              >
                기록
              </button>
              <button
                type="button"
                role="tab"
                id="right-tab-news"
                aria-selected={rightPage === 'news'}
                aria-controls="right-panel-news"
                className={rightPage === 'news' ? 'active' : ''}
                onClick={() => setRightPage('news')}
              >
                뉴스
              </button>
            </div>
            {rightPage === 'strength' ? (
              <div
                className="right-page-body strength-page"
                id="right-panel-strength"
                role="tabpanel"
                aria-labelledby="right-tab-strength"
              >
                <section className="rail-block ratings-block side-card">
                  <div className="rail-title">구단 전력</div>
                  <div className="ratings-columns" aria-hidden>
                    <div><span>구단</span><span>우승예측</span><span>전력</span></div>
                    <div><span>구단</span><span>우승예측</span><span>전력</span></div>
                  </div>
                  <div className="rail-ratings">
                    {sortedTeams.map(team => {
                      const strength = strengths[team.id] ?? 50;
                      const strengthBand = strength >= 60 ? 'high' : strength < 40 ? 'low' : 'normal';
                      return (
                        <div className="rail-rating-row" key={team.id}>
                          <i style={{ background: team.color }}>
                            <img src={team.crestUrl} alt="" loading="eager" decoding="async" fetchPriority="high" />
                          </i>
                          <span className="rating-name" title={team.name}>{team.nameKo ?? team.name}</span>
                          <em>{((market[team.id] ?? 0) * 100).toFixed(1)}%</em>
                          <b className={`rating-value ${strengthBand}`}>{strength}</b>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <StrengthPulseChart
                  samplesRef={strengthSamplesRef}
                  playbackRef={playbackRef}
                  teams={rosterTeams}
                  selectedId={selected}
                  isRunning={status === 'running'}
                  roundsPerSeason={roundsPerSeason}
                />
              </div>
            ) : rightPage === 'records' ? (
              <div
                className="right-page-body records-page"
                id="right-panel-records"
                role="tabpanel"
                aria-labelledby="right-tab-records"
              >
                <RecordBookPanel snapshot={snapshot} onOpen={openHistory} />
              </div>
            ) : (
              <div
                className="right-page-body news-page"
                id="right-panel-news"
                role="tabpanel"
                aria-labelledby="right-tab-news"
              />
            )}
          </section>
        </main>
      </div>

      {champion && selected && champion.selectedId === selected && (
        <div className="champion-overlay">
          <div>
            <p>시즌 결과</p>
            <h2>
              {selectedTeam ? selectedTeam.nameKo ?? selectedTeam.name : '선택하지 않음'}
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
                : (historyDialog.page as SeasonArchivePage).entries.map(entry => <div className="history-page-row" key={entry.season}><div><b>{entry.seasonLabel} · {teamById[entry.championId].nameKo ?? teamById[entry.championId].name}</b><small>준우승 {teamById[entry.runnerUpId].nameKo ?? teamById[entry.runnerUpId].name} · {entry.totalGoals}골 · {entry.selectedPosition > 0 ? `선택 팀 ${entry.selectedPosition}위` : '선택 없음'}</small></div><em>+{entry.titleMargin}점</em></div>))}
          </div>
        </div>
      </div>}
    </div>
  );
}
