import type { DecisivePlayoffRule } from '../data/league-catalog/types';
import type { LeagueRow } from './types';

export type DecisiveWinnerSelector = (
  upperTeamId: string,
  lowerTeamId: string,
  rule: DecisivePlayoffRule,
) => string;

/**
 * Applies only position-deciding matches configured by the competition.
 * Ordinary table sorting stays pure; the caller supplies the neutral-match
 * winner so production and counter-based calibration can use their own RNG.
 */
export function resolveDecisivePlayoffs(
  sortedRows: readonly LeagueRow[],
  rules: readonly DecisivePlayoffRule[] = [],
  remainTiedAfterTableRules: (upper: LeagueRow, lower: LeagueRow) => boolean,
  selectWinner: DecisiveWinnerSelector,
) {
  const rows = sortedRows.map(row => ({ ...row }));
  for (const rule of rules) {
    if (rule.format !== 'single-match') continue;
    const upperIndex = rule.positions[0] - 1;
    const lowerIndex = rule.positions[1] - 1;
    const upper = rows[upperIndex];
    const lower = rows[lowerIndex];
    if (!upper || !lower) continue;
    const triggered = rule.trigger === 'points-tied'
      ? upper.points === lower.points
      : remainTiedAfterTableRules(upper, lower);
    if (!triggered) continue;
    const winnerId = selectWinner(upper.teamId, lower.teamId, rule);
    if (winnerId !== upper.teamId && winnerId !== lower.teamId) {
      throw new Error(
        `${rule.purpose} playoff selected ineligible winner ${winnerId}`,
      );
    }
    if (winnerId === lower.teamId) {
      rows[upperIndex] = lower;
      rows[lowerIndex] = upper;
    }
  }
  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}
