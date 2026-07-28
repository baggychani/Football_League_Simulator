import type { Fixture } from './types';

/** Circle method: every pair plays once home and once away. */
export function createDoubleRoundRobin(teamIds: readonly string[]): Fixture[] {
  if (teamIds.length < 2 || teamIds.length % 2) throw new Error('An even number of at least two teams is required.');
  const rotating = [...teamIds]; const firstLeg: Fixture[] = []; const n = rotating.length;
  for (let round = 1; round < n; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rotating[i]; const b = rotating[n - 1 - i];
      const flip = (round + i) % 2 === 0;
      firstLeg.push({ homeId: flip ? b : a, awayId: flip ? a : b, round });
    }
    rotating.splice(1, 0, rotating.pop()!);
  }
  return [...firstLeg, ...firstLeg.map(f => ({ homeId: f.awayId, awayId: f.homeId, round: f.round + n - 1 }))];
}
