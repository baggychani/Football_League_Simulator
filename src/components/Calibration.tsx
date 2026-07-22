import { Fragment, useMemo, useState } from 'react';
import { normalizeMarketProbabilities } from '../calibration/market';
import calibrated from '../data/calibrated-ratings.json';
import raw from '../data/default-market.json';
import { teams } from '../data/teams';

interface StoredCalibration {
  ratings: Record<string, number>;
  simulatedProbability?: Record<string, number>;
  probabilityError?: Record<string, number>;
  probabilityTolerance?: Record<string, number>;
  standardError?: Record<string, number>;
}

export function Calibration({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(JSON.stringify(raw, null, 2));
  const [error, setError] = useState('');
  const parsed = useMemo(() => {
    try {
      return normalizeMarketProbabilities(JSON.parse(text), teams);
    } catch {
      return null;
    }
  }, [text]);
  const currentRaw = useMemo(() => {
    try {
      return JSON.parse(text) as Record<string, number>;
    } catch {
      return {};
    }
  }, [text]);
  const rawTotal = Object.values(currentRaw).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const stored = calibrated as unknown as StoredCalibration;

  const openLab = () => {
    try {
      const market = JSON.parse(text) as Record<string, number>;
      normalizeMarketProbabilities(market, teams);
      localStorage.setItem('football-simulator.calibration-market', JSON.stringify(market));
      window.open('/calibrate.html', '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <div className="modal">
      <section className="calibration">
        <button className="close" onClick={onClose}>×</button>
        <p className="eyebrow">고급 도구</p>
        <h2>시장 확률 보정</h2>
        <p>
          Polymarket Yes 가격을 입력하세요. 현재 합계는 <b>{(rawTotal * 100).toFixed(2)}%</b>이며,
          보정 전에 100%로 정규화됩니다.
        </p>
        <textarea value={text} onChange={event => { setText(event.target.value); setError(''); }} />
        <div className="cal-actions">
          <button className="primary" onClick={openLab}>웹 보정실 열기</button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="cal-table calibration-result">
          <b>구단</b><b>시장값</b><b>정규화 목표</b><b>검증 평균</b><b>오차 / 허용</b><b>강도</b>
          {teams.map(team => {
            const simulated = stored.simulatedProbability?.[team.id];
            const residual = stored.probabilityError?.[team.id];
            const tolerance = stored.probabilityTolerance?.[team.id];
            const standardError = stored.standardError?.[team.id];
            return (
              <Fragment key={team.id}>
                <span>{team.name}</span>
                <span>{currentRaw[team.id] === undefined ? '—' : `${(currentRaw[team.id] * 100).toFixed(2)}%`}</span>
                <span>{parsed ? `${(parsed[team.id] * 100).toFixed(2)}%` : '—'}</span>
                <span title={standardError === undefined ? undefined : `MC SE ${(standardError * 100).toFixed(3)}pp`}>
                  {simulated === undefined ? '보정 실행 필요' : `${(simulated * 100).toFixed(2)}%`}
                </span>
                <span>
                  {residual === undefined
                    ? '—'
                    : `${residual >= 0 ? '+' : ''}${(residual * 100).toFixed(2)}pp${tolerance === undefined ? '' : ` / ±${(tolerance * 100).toFixed(2)}`}`}
                </span>
                <span>{stored.ratings[team.id]?.toFixed(3) ?? '—'}</span>
              </Fragment>
            );
          })}
        </div>
        <p className="fine">
          장시간 보정은 프로젝트 루트에서 <code>python calibrate.py</code>를 실행하세요. 완료 결과는
          <code>src/data/calibrated-ratings.json</code>과 timestamp 사본에 저장됩니다.
        </p>
      </section>
    </div>
  );
}
