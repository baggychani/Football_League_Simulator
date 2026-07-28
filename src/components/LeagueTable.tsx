import type {
  LeagueRow,
  QualificationRules,
  QualificationStatus,
  Team,
} from '../domain/types';

const qualificationLabel: Record<QualificationStatus, string> = {
  champion: '우승',
  champions: '챔스',
  europa: '유로파',
  relegated: '강등',
};

export function LeagueTable({
  rows,
  teams,
  selectedId,
  qualifications = {},
  qualificationRules,
  relegationPositions = [],
}: {
  rows: LeagueRow[];
  teams: Team[];
  selectedId: string;
  qualifications?: Partial<Record<string, QualificationStatus>>;
  qualificationRules?: QualificationRules;
  relegationPositions?: readonly number[];
}) {
  const byId = Object.fromEntries(teams.map(team => [team.id, team]));
  const championsBoundary = qualificationRules?.championsLeaguePositions.length
    ? Math.max(...qualificationRules.championsLeaguePositions) + 1
    : -1;
  const europaBoundary = qualificationRules
    ? Math.max(
        ...qualificationRules.championsLeaguePositions,
        ...qualificationRules.europaLeaguePositions,
      ) + 1
    : -1;
  const relegationBoundary = relegationPositions.length
    ? Math.min(...relegationPositions)
    : -1;
  return (
    <div className="standings">
      <div className="standings-head">
        <span aria-label="순위" />
        <span>구단</span>
        <span>경기</span>
        <span>승</span>
        <span>무</span>
        <span>패</span>
        <span>득</span>
        <span>실</span>
        <span>득실</span>
        <span>승점</span>
      </div>
      {rows.map(row => {
        const team = byId[row.teamId];
        const qualification = qualifications[row.teamId];
        const boundaryClass =
          row.position === championsBoundary
            ? ' boundary-champions'
            : row.position === europaBoundary
              ? ' boundary-europa'
              : row.position === relegationBoundary
                ? ' boundary-relegation'
                : '';
        return (
          <div
            className={`standings-row${row.teamId === selectedId ? ' selected' : ''}${boundaryClass}`}
            key={row.teamId}
          >
            <span className="pos">{row.position}</span>
            <span className="club">
              <i style={{ background: team.color }}>
                <img
                  src={team.crestUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  onError={event => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </i>
              <span className="club-name club-name-full">{team.nameKo ?? team.name}</span>
              <span className="club-name club-name-short" title={team.nameKo ?? team.name}>
                {team.abbr}
              </span>
              {qualification ? (
                <small className={`qualification-badge qualification-${qualification}`}>
                  {qualificationLabel[qualification]}
                </small>
              ) : null}
            </span>
            <span>{row.played}</span>
            <span>{row.wins}</span>
            <span>{row.draws}</span>
            <span>{row.losses}</span>
            <span>{row.goalsFor}</span>
            <span>{row.goalsAgainst}</span>
            <span>
              {row.goalDifference > 0 ? '+' : ''}
              {row.goalDifference}
            </span>
            <b>{row.points}</b>
          </div>
        );
      })}
    </div>
  );
}
