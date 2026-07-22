import type { LeagueRow, Team } from '../domain/types';

export function LeagueTable({
  rows,
  teams,
  selectedId,
}: {
  rows: LeagueRow[];
  teams: Team[];
  selectedId: string;
}) {
  const byId = Object.fromEntries(teams.map(team => [team.id, team]));
  return (
    <div className="standings">
      <div className="standings-head">
        <span>#</span>
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
        return (
          <div className={`standings-row${row.teamId === selectedId ? ' selected' : ''}`} key={row.teamId}>
            <span className="pos">{row.position}</span>
            <span className="club">
              <i style={{ background: team.color }}>
                <img
                  src={team.crestUrl}
                  alt=""
                  onError={event => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </i>
              {team.name}
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
