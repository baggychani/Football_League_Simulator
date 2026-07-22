/** Outcome probabilities under the same independent-Poisson model used to generate the score. */
function poissonMass(lambda: number, goals: number) { let value=Math.exp(-lambda); for(let k=1;k<=goals;k++) value*=lambda/k; return value; }
export function outcomeProbability(lambdaHome: number, lambdaAway: number, outcome: 'home'|'draw'|'away') {
  const cap=40; // At max configured λ, omitted tail mass is negligible.
  const home=Array.from({length:cap+1},(_,k)=>poissonMass(lambdaHome,k)); const away=Array.from({length:cap+1},(_,k)=>poissonMass(lambdaAway,k));
  let homeWin=0, draw=0, cumulativeAway=0;
  for(let goals=0;goals<=cap;goals++){ homeWin+=home[goals]*cumulativeAway; draw+=home[goals]*away[goals]; cumulativeAway+=away[goals]; }
  return outcome==='home'?homeWin:outcome==='draw'?draw:Math.max(0,1-homeWin-draw);
}

export const upsetCriteria = {
  maxWinnerProbability: .30,
  minFavoriteGap: .10,
} as const;

export function scoreUpset(winnerProbability: number, favoriteProbability: number, goalMargin: number) {
  if (
    winnerProbability > upsetCriteria.maxWinnerProbability ||
    favoriteProbability - winnerProbability < upsetCriteria.minFavoriteGap
  ) return null;
  return (favoriteProbability-winnerProbability)*(1+.35*Math.max(0,goalMargin-1));
}

/**
 * An upset must first be a clear underdog win. Score margin is deliberately
 * ignored until that gate passes, so a favorite's 9-1 win can never become an
 * "upset" merely because it was spectacular.
 */
export function assessUpset(
  lambdaHome: number,
  lambdaAway: number,
  winner: 'home'|'away',
  goalMargin: number,
) {
  const favorite = winner === 'home' ? 'away' : 'home';
  const winnerProbability = outcomeProbability(lambdaHome,lambdaAway,winner);
  const favoriteProbability = outcomeProbability(lambdaHome,lambdaAway,favorite);
  const upsetIndex=scoreUpset(winnerProbability,favoriteProbability,goalMargin);
  if (upsetIndex===null) return null;

  return {
    winnerProbability,
    favoriteProbability,
    upsetIndex,
  };
}
