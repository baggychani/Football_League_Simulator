import { useEffect, useMemo, useRef, useState } from 'react';
import {
  runBrowserCalibration,
  type CalibrationProgress,
  type TeamCalibrationRow,
} from '../calibration/browser-calibrator';
import { initialRatings, normalizeMarketProbabilities } from '../calibration/market';
import {
  EPL_CHAMPION_EVENT_SLUG,
  fetchPolymarketEplChampion,
  mergeMarketSnapshot,
  type PolymarketFetchResult,
} from '../calibration/polymarket';
import {
  META_STORAGE_KEY,
  readStoredMarket,
  writeStoredMarket,
  writeStoredRatings,
} from '../calibration/market-storage';
import calibratedRatings from '../data/calibrated-ratings.json';
import rawMarket from '../data/default-market.json';
import polymarketMeta from '../data/polymarket-meta.json';
import { teams } from '../data/teams';

const LOCAL_API_HEADERS = { 'Content-Type': 'application/json', 'X-Football-Local-Api': '1' };

type MarketMeta = {
  slug: string;
  title: string;
  fetchedAt: string;
  source: string;
  matchedTeams: string[];
  unmatchedPolymarket: string[];
  missingTeams: string[];
  changedTeams: string[];
};

type MarketUpdateResponse = {
  ok: boolean;
  persisted?: boolean;
  market: Record<string, number>;
  target: Record<string, number>;
  meta: MarketMeta;
  changedTeams: string[];
};

function pct(value: number, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

function pp(value: number) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}pp`;
}

function formatFetchedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function readStoredMeta(): MarketMeta {
  try {
    const stored = localStorage.getItem(META_STORAGE_KEY);
    if (!stored) return polymarketMeta as MarketMeta;
    return JSON.parse(stored) as MarketMeta;
  } catch {
    return polymarketMeta as MarketMeta;
  }
}

function useSmoothNumber(target: number | null, speed = 0.22) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (target === null) {
      current.current = null;
      setValue(null);
      return;
    }
    let frame = 0;
    const step = () => {
      const previous = current.current ?? target;
      const next = previous + (target - previous) * speed;
      if (Math.abs(target - next) < 1e-5) {
        current.current = target;
        setValue(target);
        return;
      }
      current.current = next;
      setValue(next);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, speed]);
  return value;
}

function LivePct({ value, digits = 2 }: { value: number | null; digits?: number }) {
  const smooth = useSmoothNumber(value);
  return <span>{smooth === null ? '—' : pct(smooth, digits)}</span>;
}

function LiveRating({ value }: { value: number }) {
  const smooth = useSmoothNumber(value, 0.26) ?? 0;
  return <span>{smooth >= 0 ? '+' : ''}{smooth.toFixed(3)}</span>;
}

function Bar({ target, simulated }: { target: number; simulated: number | null }) {
  const scale = Math.max(target * 1.2, 0.04);
  const sim = useSmoothNumber(simulated);
  return (
    <div className="lab-bar" aria-hidden>
      <i style={{ width: `${(target / scale) * 100}%` }} />
      <b style={{ width: sim === null ? '0%' : `${(sim / scale) * 100}%` }} />
    </div>
  );
}

type Tone = 'muted' | 'ok' | 'warn' | 'bad';

function toneOf(row: TeamCalibrationRow): Tone {
  if (row.error === null) return 'muted';
  if (row.tolerance !== null) {
    const absolute = Math.abs(row.error);
    if (absolute <= row.tolerance) return 'ok';
    if (absolute < row.tolerance * 2) return 'warn';
    return 'bad';
  }
  if (row.withinTolerance === null) return 'muted';
  return row.withinTolerance ? 'ok' : 'warn';
}

function toneMark(tone: Tone) {
  if (tone === 'warn') return '주의';
  if (tone === 'bad') return '초과';
  return '';
}

function Row({ row }: { row: TeamCalibrationRow }) {
  const tone = toneOf(row);
  const mark = toneMark(tone);
  const diagnosticTitle =
    row.tolerance === null
      ? undefined
      : `허용오차 ±${(row.tolerance * 100).toFixed(3)}pp · MC SE ${((row.standardError ?? 0) * 100).toFixed(3)}pp`;
  return (
    <div className={`lab-row${tone === 'warn' || tone === 'bad' ? ` lab-row-${tone}` : ''}`}>
      <div className="lab-club">
        <i style={{ background: row.color }}><img src={row.crestUrl} alt="" /></i>
        <span>{row.name}</span>
      </div>
      <div className="lab-num muted">{pct(row.market)}</div>
      <div className="lab-num accent"><LivePct value={row.target} /></div>
      <div className="lab-num"><LivePct value={row.simulated} /></div>
      <div className={`lab-num ${tone}`} title={diagnosticTitle}>
        {row.error === null ? '—' : (
          <>
            {mark && <span className="lab-tone-mark" aria-hidden>{mark}</span>}
            {pp(row.error)}
          </>
        )}
      </div>
      <div className="lab-num rating"><LiveRating value={row.rating} /></div>
      <Bar target={row.target} simulated={row.simulated} />
    </div>
  );
}

function phaseLabel(progress: CalibrationProgress) {
  if (progress.phase === 'idle') return '대기';
  if (progress.phase === 'done') return '완료';
  if (progress.phase === 'final') return '최종 검증';
  if (progress.phase === 'error') return '오류';
  return `${progress.iteration}`;
}

function rowsFromMarket(
  market: Record<string, number>,
  target: Record<string, number>,
  previousRows: TeamCalibrationRow[],
): TeamCalibrationRow[] {
  const byId = new Map(previousRows.map(row => [row.id, row]));
  return [...teams]
    .map(team => {
      const previous = byId.get(team.id);
      const sim = previous?.simulated ?? null;
      return {
        id: team.id,
        name: team.name,
        color: team.color,
        crestUrl: team.crestUrl ?? '',
        market: market[team.id] ?? 0,
        target: target[team.id],
        simulated: sim,
        error: sim === null ? null : sim - target[team.id],
        tolerance: previous?.tolerance ?? null,
        standardError: previous?.standardError ?? null,
        withinTolerance: previous?.withinTolerance ?? null,
        rating: previous?.rating ?? 0,
      };
    })
    .sort((a, b) => b.target - a.target);
}

function rowsFromSaved(
  market: Record<string, number>,
  target: Record<string, number>,
  saved: typeof calibratedRatings,
): TeamCalibrationRow[] {
  const ratings = saved.ratings as Record<string, number>;
  const simulated = (saved.simulatedProbability ?? {}) as Record<string, number>;
  const diagnostics = (saved.teamDiagnostics ?? {}) as Record<
    string,
    { tolerance?: number; standardError?: number; withinTolerance?: boolean }
  >;
  return [...teams]
    .map(team => {
      const sim = simulated[team.id] ?? null;
      const diagnostic = diagnostics[team.id];
      return {
        id: team.id,
        name: team.name,
        color: team.color,
        crestUrl: team.crestUrl ?? '',
        market: market[team.id] ?? 0,
        target: target[team.id],
        simulated: sim,
        error: sim === null ? null : sim - target[team.id],
        tolerance: diagnostic?.tolerance ?? null,
        standardError: diagnostic?.standardError ?? null,
        withinTolerance: diagnostic?.withinTolerance ?? null,
        rating: ratings[team.id] ?? 0,
      };
    })
    .sort((a, b) => b.target - a.target);
}

function metaFromFetch(fetched: PolymarketFetchResult, changedTeams: string[]): MarketMeta {
  return {
    slug: fetched.slug,
    title: fetched.title,
    fetchedAt: fetched.fetchedAt,
    source: fetched.source,
    matchedTeams: fetched.matched,
    unmatchedPolymarket: fetched.unmatchedPolymarket,
    missingTeams: fetched.missingTeams,
    changedTeams,
  };
}

export function CalibrationLab({
  onBack,
  onMarketUpdated,
}: {
  onBack?: () => void;
  onMarketUpdated?: (market: Record<string, number>, ratings?: Record<string, number>) => void;
}) {
  const [market, setMarket] = useState<Record<string, number>>(() => readStoredMarket(rawMarket as Record<string, number>));
  const target = useMemo(() => normalizeMarketProbabilities(market, teams), [market]);
  const seedRatings = useMemo(() => {
    const saved = (calibratedRatings as { ratings?: Record<string, number> }).ratings;
    return saved && Object.keys(saved).length === teams.length ? saved : initialRatings(target);
  }, [target]);

  const savedOutside = ((calibratedRatings as { teamsOutsideTolerance?: string[] }).teamsOutsideTolerance ?? []).length;
  const hasSavedResult = Boolean((calibratedRatings as { ratings?: Record<string, number> }).ratings);

  const [progress, setProgress] = useState<CalibrationProgress>(() => ({
    phase: hasSavedResult ? 'done' : 'idle',
    iteration: 0,
    iterations: 28,
    done: (calibratedRatings as { numberOfCalibrationSeasons?: number }).numberOfCalibrationSeasons ?? 0,
    total: (calibratedRatings as { numberOfCalibrationSeasons?: number }).numberOfCalibrationSeasons ?? 0,
    mae: (calibratedRatings as { mae?: number }).mae ?? null,
    maxError: (calibratedRatings as { maxError?: number }).maxError ?? null,
    loss: (calibratedRatings as { loss?: number }).loss ?? null,
    message: hasSavedResult
      ? savedOutside === 0
        ? '저장된 보정 결과 · 전 팀 허용오차 내'
        : `저장된 보정 결과 · 허용오차 밖 ${savedOutside}팀`
      : '대기',
    rows: hasSavedResult
      ? rowsFromSaved(readStoredMarket(), normalizeMarketProbabilities(readStoredMarket(), teams), calibratedRatings)
      : [...teams]
          .map(team => {
            const initialMarket = readStoredMarket();
            const initialTarget = normalizeMarketProbabilities(initialMarket, teams);
            const saved = (calibratedRatings as { ratings?: Record<string, number> }).ratings;
            const ratings = saved && Object.keys(saved).length === teams.length ? saved : initialRatings(initialTarget);
            return {
              id: team.id,
              name: team.name,
              color: team.color,
              crestUrl: team.crestUrl ?? '',
              market: initialMarket[team.id] ?? 0,
              target: initialTarget[team.id],
              simulated: null,
              error: null,
              tolerance: null,
              standardError: null,
              withinTolerance: null,
              rating: ratings[team.id] ?? 0,
            };
          })
          .sort((a, b) => b.target - a.target),
  }));
  const [busy, setBusy] = useState(false);
  const [marketBusy, setMarketBusy] = useState(false);
  const [hasResult, setHasResult] = useState(hasSavedResult);
  const [saveState, setSaveState] = useState('');
  const [marketMeta, setMarketMeta] = useState<MarketMeta>(readStoredMeta);
  const [marketFlash, setMarketFlash] = useState(false);
  const [marketStatus, setMarketStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<Record<string, unknown> | null>(null);

  const overall = useMemo(() => {
    if (progress.phase === 'done') return 100;
    if (progress.phase === 'idle') return 0;
    if (progress.total > 0) {
      return Math.min(99, 8 + 91 * (progress.done / progress.total));
    }
    return Math.min(92, 8 + (progress.iteration % 40) * 2);
  }, [progress]);

  const marketFetchedLabel = formatFetchedAt(marketMeta.fetchedAt);
  const polymarketUrl = `https://polymarket.com/event/${marketMeta.slug || EPL_CHAMPION_EVENT_SLUG}`;

  const applyMarketUpdate = (next: MarketUpdateResponse) => {
    writeStoredMarket(next.market);
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(next.meta));
    setMarket(next.market);
    setMarketMeta(next.meta);
    setProgress(previous => ({
      ...previous,
      rows: rowsFromMarket(next.market, next.target, previous.rows),
      message:
        previous.phase === 'done'
          ? next.changedTeams.length
            ? `시장 갱신 · ${next.changedTeams.length}팀 변경 · 재보정 권장`
            : '시장 갱신 · 가격 변동 없음'
          : previous.message,
    }));
    setMarketFlash(true);
    window.setTimeout(() => setMarketFlash(false), 1200);
    const stamp = formatFetchedAt(next.meta.fetchedAt);
    if (next.changedTeams.length) {
      setMarketStatus(`${next.changedTeams.length}팀 변경 · ${stamp} KST`);
    } else {
      setMarketStatus(`변동 없음 · ${stamp} KST`);
    }
    if (!next.persisted) {
      setMarketStatus(previous => `${previous} · 로컬만 반영`);
    }
    onMarketUpdated?.(next.market);
  };

  const updateMarketClientSide = async (): Promise<MarketUpdateResponse> => {
    const fetched = await fetchPolymarketEplChampion();
    const merged = mergeMarketSnapshot(fetched.prices, market);
    const nextTarget = normalizeMarketProbabilities(merged, teams);
    const changedTeams = Object.keys(merged).filter(
      id => Math.abs((merged[id] ?? 0) - (market[id] ?? 0)) > 1e-6,
    );
    const meta = metaFromFetch(fetched, changedTeams);
    let persisted = false;
    try {
      const response = await fetch('/api/save-market', {
        method: 'POST',
        headers: LOCAL_API_HEADERS,
        body: JSON.stringify({ market: merged, meta }),
      });
      if (response.ok) {
        persisted = true;
        const payload = (await response.json()) as MarketUpdateResponse;
        return { ...payload, persisted: true };
      }
    } catch {
      // Fall through to local-only update.
    }
    return {
      ok: true,
      persisted,
      market: merged,
      target: nextTarget,
      meta,
      changedTeams,
    };
  };

  const updateMarket = async () => {
    if (marketBusy || busy) return;
    setMarketBusy(true);
    setMarketStatus('Polymarket에서 불러오는 중…');
    try {
      const response = await fetch('/api/update-market', { method: 'POST', headers: { 'X-Football-Local-Api': '1' } });
      if (response.ok) {
        const payload = (await response.json()) as MarketUpdateResponse;
        applyMarketUpdate(payload);
        return;
      }
      const fallback = await updateMarketClientSide();
      applyMarketUpdate(fallback);
    } catch (error) {
      try {
        const fallback = await updateMarketClientSide();
        applyMarketUpdate(fallback);
      } catch (fallbackError) {
        setMarketStatus((fallbackError as Error).message || (error as Error).message);
      }
    } finally {
      setMarketBusy(false);
    }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setHasResult(false);
    setSaveState('');
    resultRef.current = null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const payload = await runBrowserCalibration({
        market,
        target,
        initialRatings: seedRatings,
        iterations: 8,
        seasons: 30_000,
        coarseSeasons: 10_000,
        jacobianSeasons: 10_000,
        headSeasons: 100_000,
        finalSeasons: 200_000,
        finalMaxSeasons: 300_000,
        seed: 20260722,
        untilTeamsWithinTolerance: true,
        signal: controller.signal,
        onProgress: setProgress,
      });
      resultRef.current = payload;
      setHasResult(true);
      const payloadRatings = (payload.ratings ?? {}) as Record<string, number>;
      if (Object.keys(payloadRatings).length === teams.length) {
        writeStoredRatings(payloadRatings);
        writeStoredMarket(market);
        onMarketUpdated?.(market, payloadRatings);
      }
      try {
        const response = await fetch('/api/save-calibration', {
          method: 'POST',
          headers: LOCAL_API_HEADERS,
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(await response.text());
        const saved = (await response.json()) as { stamped?: string; path?: string };
        setSaveState(
          saved.stamped
            ? `프로젝트에 저장됨 · ${saved.stamped}`
            : '프로젝트에 저장됨 · src/data/calibrated-ratings.json',
        );
      } catch {
        setSaveState('자동 저장 실패 · 아래 JSON 저장본으로 수동 저장');
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setProgress(previous => ({ ...previous, phase: 'idle', message: '중단됨' }));
      } else {
        setProgress(previous => ({ ...previous, phase: 'error', message: (error as Error).message }));
        setSaveState('보정 실패');
      }
    } finally {
      setBusy(false);
    }
  };

  const stop = () => abortRef.current?.abort();
  const download = () => {
    if (!resultRef.current) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const blob = new Blob([JSON.stringify(calibratedRatings, null, 2)], { type: 'application/json' });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `calibrated-ratings_${stamp}.json`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const blob = new Blob([JSON.stringify(resultRef.current, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `calibrated-ratings_${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const startLabel = progress.phase === 'done' || hasResult ? '처음부터 다시 보정' : '보정 시작';

  return (
    <div className="lab">
      <aside className="lab-rail">
        <div className="lab-brand">
          {onBack && (
            <button type="button" className="lab-back" onClick={onBack}>
              ← 시뮬로
            </button>
          )}
          <div className="wordmark">PL<span>∞</span></div>
          <h1>시장 보정</h1>
        </div>
        <div className="lab-phase">
          <span className="lab-phase-label">상태</span>
          <strong>{phaseLabel(progress)}</strong>
          <p>{progress.message}</p>
        </div>
        <div className={`lab-market-meta${marketFlash ? ' is-flash' : ''}`}>
          <span className="lab-phase-label">Polymarket</span>
          <p className="lab-market-date">{marketFetchedLabel} KST</p>
          {marketStatus && <p className="lab-market-status">{marketStatus}</p>}
        </div>
        <div className="lab-rail-metrics">
          <div><span>MAE</span><b>{progress.mae === null ? '—' : `${(progress.mae * 100).toFixed(3)}pp`}</b></div>
          <div><span>MAX</span><b>{progress.maxError === null ? '—' : `${(progress.maxError * 100).toFixed(3)}pp`}</b></div>
          <div><span>시즌</span><b>{progress.done.toLocaleString()}<small> / {Math.max(progress.total, 0).toLocaleString()}</small></b></div>
        </div>
        <div className="lab-progress" aria-hidden><i style={{ width: `${overall}%` }} /></div>
        <div className="lab-rail-actions">
          {!busy ? (
            <button type="button" className="lab-start" onClick={start}>{startLabel}</button>
          ) : (
            <button type="button" className="lab-stop" onClick={stop}>중단</button>
          )}
          <button type="button" className="lab-download" onClick={download} disabled={!hasResult}>
            JSON 저장본
          </button>
          {saveState && <p className="lab-save">{saveState}</p>}
        </div>
      </aside>
      <main className="lab-main">
        <div className="lab-table-wrap">
          <div className="lab-table">
            <div className="lab-head">
              <span>구단</span><span>시장</span><span>목표</span><span>시뮬.</span><span>오차</span><span>강도</span><span>목표 / 시뮬.</span>
            </div>
            {progress.rows.map(row => <Row key={row.id} row={row} />)}
          </div>
          <div className="lab-table-bar">
            <div className="lab-legend" aria-label="오차 범례">
              <span className="warn"><i aria-hidden />주의 · 허용오차 근처</span>
              <span className="bad"><i aria-hidden />초과 · 허용오차 범위 밖</span>
            </div>
            <div className="lab-market-actions">
              <button
                type="button"
                className={`lab-market-chip${marketBusy ? ' is-busy' : ''}`}
                onClick={updateMarket}
                disabled={marketBusy || busy}
              >
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path
                    d="M3.2 8a4.8 4.8 0 0 1 8.3-3.2M12.8 8a4.8 4.8 0 0 1-8.3 3.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path d="M11.2 2.6v2.7H8.5M4.8 13.4v-2.7h2.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{marketBusy ? '갱신 중' : '업데이트'}</span>
              </button>
              <a
                className="lab-market-link"
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Polymarket</span>
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M5 3h8v8M13 3 6 10M13 3H9M13 3v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
