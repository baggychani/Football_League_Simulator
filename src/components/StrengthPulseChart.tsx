import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Team } from '../domain/types';

export type StrengthSample = {
  frame: number;
  tick: number;
  season: number;
  round: number;
  absoluteRound: number;
  values: Record<string, number>;
};

export type StrengthPlayback = {
  fromFrame: number;
  toFrame: number | null;
  progress: number;
};

const MAX_TEAMS = 6;
const VISIBLE_ROUNDS = 15;
const SCALE_LOW = 35;
const SCALE_HIGH = 75;

type HoveredTeam = {
  id: string;
  x: number;
  y: number;
  value: number;
};

function colorLuminance(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function graphColor(team: Team) {
  const candidate = colorLuminance(team.color) >= 190 ? team.secondaryColor : team.color;
  return colorLuminance(candidate) >= 205 ? '#37003c' : candidate;
}

function initialSeries(teams: Team[], selectedId: string) {
  const preferred = [
    selectedId,
    ...[...teams]
      .sort((left, right) => (right.structuralTier ?? 0) - (left.structuralTier ?? 0))
      .map(team => team.id),
  ];
  return preferred
    .filter((id, index) => teams.some(team => team.id === id) && preferred.indexOf(id) === index)
    .slice(0, MAX_TEAMS);
}

function interpolateValue(
  from: StrengthSample,
  to: StrengthSample | undefined,
  teamId: string,
  progress: number,
) {
  const start = from.values[teamId] ?? 50;
  if (!to) return start;
  const end = to.values[teamId] ?? start;
  return start + (end - start) * progress;
}

export function StrengthPulseChart({
  samplesRef,
  playbackRef,
  teams,
  selectedId,
  isRunning,
  roundsPerSeason,
}: {
  samplesRef: MutableRefObject<StrengthSample[]>;
  playbackRef: MutableRefObject<StrengthPlayback>;
  teams: Team[];
  selectedId: string;
  isRunning: boolean;
  roundsPerSeason: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const crestImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const endpointPositionsRef = useRef<Record<string, HoveredTeam>>({});
  const [seriesIds, setSeriesIds] = useState(() => initialSeries(teams, selectedId));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hovered, setHovered] = useState<HoveredTeam | null>(null);
  const rosterKey = teams.map(team => team.id).join('|');
  const teamMap = useMemo(
    () => Object.fromEntries(teams.map(team => [team.id, team])),
    [rosterKey],
  );
  const colors = useMemo(
    () => Object.fromEntries(teams.map(team => [team.id, graphColor(team)])),
    [rosterKey],
  );
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    setSeriesIds(current => {
      const available = new Set(teams.map(team => team.id));
      const retained = current.filter(id => available.has(id));
      if (selectedId && available.has(selectedId) && !retained.includes(selectedId)) {
        retained.unshift(selectedId);
      }
      const replacements = initialSeries(teams, selectedId)
        .filter(id => !retained.includes(id));
      const next = [...retained, ...replacements].slice(0, MAX_TEAMS);
      return next.length === current.length
        && next.every((id, index) => id === current[index])
        ? current
        : next;
    });
    setHovered(null);
  }, [rosterKey, selectedId]);

  useEffect(() => {
    const available = new Set(teams.map(team => team.id));
    Object.keys(crestImagesRef.current).forEach(id => {
      if (!available.has(id)) delete crestImagesRef.current[id];
    });
    teams.forEach(team => {
      if (!team.crestUrl || crestImagesRef.current[team.id]) return;
      const image = new Image();
      image.fetchPriority = 'high';
      image.decoding = 'async';
      image.src = team.crestUrl;
      crestImagesRef.current[team.id] = image;
    });
  }, [rosterKey]);

  const toggleTeam = (id: string) => {
    setSeriesIds(current => {
      if (current.includes(id)) return current.filter(teamId => teamId !== id);
      if (current.length >= MAX_TEAMS) return current;
      return [...current, id];
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const match = Object.values(endpointPositionsRef.current)
      .map(point => ({ point, distance: Math.hypot(point.x - pointerX, point.y - pointerY) }))
      .sort((left, right) => left.distance - right.distance)[0];
    const next = match && match.distance <= 14 ? match.point : null;
    event.currentTarget.style.cursor = next ? 'pointer' : 'default';
    setHovered(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      width = Math.max(260, Math.floor(bounds.width));
      height = Math.max(150, Math.floor(bounds.height));
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const draw = () => {
      const context = canvas.getContext('2d');
      if (!context || width === 0 || height === 0) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const samples = samplesRef.current;
      const playback = playbackRef.current;
      const from = samples.find(sample => sample.frame === playback.fromFrame);
      const to = playback.toFrame === null
        ? undefined
        : samples.find(sample => sample.frame === playback.toFrame);

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const pad = { top: 16, right: 22, bottom: 34, left: 32 };
      const plotWidth = width - pad.left - pad.right;
      const plotHeight = height - pad.top - pad.bottom;
      const progress = to ? Math.max(0, Math.min(1, playback.progress)) : 0;
      const playhead = from
        ? from.absoluteRound + ((to?.absoluteRound ?? from.absoluteRound) - from.absoluteRound) * progress
        : 0;
      // Early rounds deliberately use the full 1R–15R canvas so the first
      // point enters from the left. Once it reaches the right edge, the same
      // 15-round window starts scrolling without changing its width.
      const viewEnd = Math.max(VISIBLE_ROUNDS, playhead);
      const viewStart = viewEnd - (VISIBLE_ROUNDS - 1);
      const range = SCALE_HIGH - SCALE_LOW;
      const xForRound = (absoluteRound: number) =>
        pad.left + ((absoluteRound - viewStart) / (viewEnd - viewStart || 1)) * plotWidth;
      const yForValue = (value: number) =>
        pad.top + ((SCALE_HIGH - value) / range) * plotHeight;

      context.lineWidth = 1;
      context.font = "10px 'Space Grotesk', sans-serif";
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      for (let index = 0; index <= 4; index += 1) {
        const y = pad.top + (plotHeight * index) / 4;
        const label = SCALE_HIGH - (range * index) / 4;
        context.strokeStyle = 'rgba(55, 0, 60, .12)';
        context.beginPath();
        context.moveTo(pad.left, y);
        context.lineTo(width - pad.right, y);
        context.stroke();
        context.fillStyle = 'rgba(55, 0, 60, .58)';
        context.fillText(label.toFixed(0), pad.left - 6, y);
      }

      const firstBoundaryIndex = Math.max(
        0,
        Math.ceil((viewStart - (roundsPerSeason + .5)) / roundsPerSeason),
      );
      for (
        let boundary = roundsPerSeason + .5 + firstBoundaryIndex * roundsPerSeason;
        boundary <= viewEnd;
        boundary += roundsPerSeason
      ) {
        const x = xForRound(boundary);
        context.strokeStyle = 'rgba(165, 0, 76, .42)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, pad.top);
        context.lineTo(x, height - pad.bottom);
        context.stroke();
      }

      context.strokeStyle = 'rgba(55, 0, 60, .24)';
      context.beginPath();
      context.moveTo(pad.left, height - pad.bottom);
      context.lineTo(width - pad.right, height - pad.bottom);
      context.stroke();
      context.font = "650 9px 'Pretendard Variable', sans-serif";
      context.textAlign = 'center';
      context.textBaseline = 'top';
      for (let absoluteRound = Math.ceil(viewStart); absoluteRound <= Math.floor(viewEnd); absoluteRound += 1) {
        if (absoluteRound < 1) continue;
        const x = xForRound(absoluteRound);
        const seasonRound = ((absoluteRound - 1) % roundsPerSeason) + 1;
        context.strokeStyle = 'rgba(55, 0, 60, .16)';
        context.beginPath();
        context.moveTo(x, height - pad.bottom);
        context.lineTo(x, height - pad.bottom + 5);
        context.stroke();
        if (seasonRound === 1 || seasonRound % 2 === 0) {
          context.fillStyle = seasonRound === 1 ? '#a5004c' : 'rgba(55, 0, 60, .64)';
          context.fillText(`${seasonRound}R`, x, height - pad.bottom + 8);
        }
      }

      if (!seriesIds.length || !from) {
        context.fillStyle = 'rgba(55, 0, 60, .54)';
        context.textAlign = 'center';
        context.font = "600 11px 'Pretendard Variable', sans-serif";
        context.fillText('표시할 팀을 선택하세요', width / 2, height / 2);
        frame = requestAnimationFrame(draw);
        return;
      }

      const completeSamples = samples.filter(sample =>
        sample.frame <= from.frame
        && sample.absoluteRound >= viewStart - 1
        && sample.absoluteRound <= viewEnd + 1,
      );
      const currentValues = Object.fromEntries(seriesIds.map(id => [
        id,
        interpolateValue(from, to, id, progress),
      ]));
      endpointPositionsRef.current = {};
      context.save();
      context.beginPath();
      context.rect(pad.left - 9, pad.top - 9, plotWidth + 18, plotHeight + 18);
      context.clip();
      seriesIds.forEach(id => {
        const color = colorsRef.current[id] ?? '#37003c';
        context.strokeStyle = color;
        context.lineWidth = id === selectedId ? 2.8 : 1.5;
        context.globalAlpha = id === selectedId ? 1 : 0.74;
        context.beginPath();
        const lineSamples = [
          ...completeSamples,
          ...(to && progress > 0 ? [{ ...from, absoluteRound: playhead, values: currentValues }] : []),
        ];
        lineSamples.forEach((sample, index) => {
          const x = xForRound(sample.absoluteRound);
          const y = yForValue(sample.values[id] ?? 50);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();

        const value = currentValues[id] ?? from.values[id] ?? 50;
        const endpointX = xForRound(playhead);
        const endpointY = yForValue(value);
        endpointPositionsRef.current[id] = { id, x: endpointX, y: endpointY, value };
        const crest = crestImagesRef.current[id];
        context.globalAlpha = 1;
        context.save();
        context.beginPath();
        context.arc(endpointX, endpointY, 7.5, 0, Math.PI * 2);
        context.fillStyle = '#fff';
        context.fill();
        context.clip();
        if (crest?.complete && crest.naturalWidth > 0) {
          context.drawImage(crest, endpointX - 7, endpointY - 7, 14, 14);
        } else {
          context.fillStyle = color;
          context.fillRect(endpointX - 7, endpointY - 7, 14, 14);
        }
        context.restore();
        context.strokeStyle = color;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(endpointX, endpointY, 7.5, 0, Math.PI * 2);
        context.stroke();
      });
      context.restore();
      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    frame = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [playbackRef, roundsPerSeason, samplesRef, selectedId, seriesIds]);

  return (
    <section className="strength-pulse">
      <div className="strength-pulse-head">
        <div>
          <b>실시간 전력 변동</b>
          <span className={isRunning ? 'is-running' : 'is-stopped'}>
            <i aria-hidden /> {isRunning ? 'LIVE' : '정지'}
          </span>
        </div>
        <button
          type="button"
          className="strength-team-toggle"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(open => !open)}
        >
          팀 선택 <b>{seriesIds.length}/{MAX_TEAMS}</b>
        </button>
      </div>
      {pickerOpen && (
        <div className="strength-team-picker" aria-label="그래프에 표시할 팀">
          {teams.map(team => {
            const active = seriesIds.includes(team.id);
            const unavailable = !active && seriesIds.length >= MAX_TEAMS;
            return (
              <button
                type="button"
                key={team.id}
                aria-pressed={active}
                disabled={unavailable}
                onClick={() => toggleTeam(team.id)}
              >
                <img src={team.crestUrl} alt="" />
                <span>{team.abbr}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="strength-chart-wrap">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="선택한 팀들의 라운드별 전력 변동 선 그래프"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHovered(null)}
        />
        <i className="strength-scanline" aria-hidden />
        {hovered && teamMap[hovered.id] && (
          <div
            className={`strength-hover-card${hovered.x < 180 ? ' is-left' : ''}`}
            style={{ left: hovered.x, top: Math.max(34, hovered.y), borderColor: colors[hovered.id] }}
            role="tooltip"
          >
            <img src={teamMap[hovered.id].crestUrl} alt="" />
            <span>
              <b>{teamMap[hovered.id].nameKo ?? teamMap[hovered.id].name}</b>
              <small>현재 전력 <strong>{hovered.value.toFixed(1)}</strong></small>
            </span>
          </div>
        )}
      </div>
      <div className="strength-legend" aria-label="그래프 범례">
        {seriesIds.map(id => (
          <span key={id}>
            <i style={{ background: colors[id] }} aria-hidden />
            {teamMap[id]?.abbr ?? id}
          </span>
        ))}
      </div>
    </section>
  );
}
