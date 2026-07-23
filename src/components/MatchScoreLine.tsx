import { teamAbbrStyle, teamById } from '../data/teams';
import type { Team } from '../domain/types';

function Crest({ team }: { team: Team }) {
  return (
    <i className="match-crest" style={{ background: team.color, boxShadow: `inset 0 0 0 1px ${team.secondaryColor}55` }}>
      <img
        src={team.crestUrl}
        alt=""
        onError={event => {
          event.currentTarget.style.display = 'none';
        }}
      />
    </i>
  );
}

function Abbr({ team, colored = true }: { team: Team; colored?: boolean }) {
  const style = colored ? teamAbbrStyle(team) : undefined;
  return (
    <span
      className={`team-abbr${style?.backgroundColor ? ' chip' : ''}`}
      style={style}
      title={team.name}
    >
      {team.abbr}
    </span>
  );
}

export function MatchScoreLine({
  homeId,
  awayId,
  homeGoals,
  awayGoals,
}: {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
}) {
  const home = teamById[homeId];
  const away = teamById[awayId];
  return (
    <span className="match-score-line">
      <Crest team={home} />
      <Abbr team={home} />
      <span className="match-score">
        <span className="match-goal">{homeGoals}</span>
        <span className="match-sep">–</span>
        <span className="match-goal">{awayGoals}</span>
      </span>
      <Abbr team={away} />
      <Crest team={away} />
    </span>
  );
}

export function TeamAbbrLabel({ teamId, colored = true }: { teamId: string; colored?: boolean }) {
  const team = teamById[teamId];
  return (
    <span className="team-abbr-label">
      <Crest team={team} />
      <Abbr team={team} colored={colored} />
    </span>
  );
}
