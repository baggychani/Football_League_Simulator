export interface TeamMatchContext {
  /** Value of the result to the club's currently live season goals. */
  stakes: number;
  /** Small deterministic shift in mean performance. */
  effortShift: number;
  /** Match-day performance draw prepared outside the score model. */
  performanceShift: number;
  /** Schedule and workload cost. */
  fatigueShift: number;
}

export interface MatchContext {
  home: TeamMatchContext;
  away: TeamMatchContext;
  /** Common log-goal-rate shift: positive is a more open match. */
  tempoShift: number;
  /** Override for neutral-site or competition-specific home advantage. */
  homeAdvantage?: number;
}

const neutralTeamContext = (): TeamMatchContext => ({
  stakes: 0,
  effortShift: 0,
  performanceShift: 0,
  fatigueShift: 0,
});

export function neutralMatchContext(): MatchContext {
  return {
    home: neutralTeamContext(),
    away: neutralTeamContext(),
    tempoShift: 0,
  };
}
