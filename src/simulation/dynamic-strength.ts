import type { Fixture, MatchScore, RatingMap, Team } from '../domain/types';
import { IndependentPoissonDistribution, type OutcomeProbabilities } from './score-model';

export const dynamicParameters = {
  tierTwo: .35, rhoSame: .82, rhoBreak: .45, breakRecoveryTier: .18, fMax: .27, beta: .9, resultWeight: .75, scoreWeight: .25,
  formWeight: .5,
  omegaZ: .1, rhoH: .72, tauH: .28, phi0: .62, phiSupport: .10, phiRecovery: .10, kC: .08, tauC: .28, etaC: .25, gammaC: .5,
  kB: .015, tauB: .28, etaB: .45, kappaTier: .01, tauTier: .65, rhoL: .75, eGain: .014, eLoss: .006, eDecay: .985, eThreshold: .52, eMax: .75
};

const tierOne = new Set(['man-city','liverpool','chelsea','man-united','arsenal']);
const tierTwo = new Set(['tottenham','newcastle','aston-villa']);
export function clubTier(teamId: string) { return tierOne.has(teamId) ? 1 : tierTwo.has(teamId) ? dynamicParameters.tierTwo : 0; }

export interface DynamicTeamState { base: number; initialBase: number; medium: number; momentum: number; form: number; seasonShock: number; history: number; acquired: number; positiveRun: number; negativeRun: number; tier: number }
export type DynamicStrengthState = Record<string, DynamicTeamState>;
const clip=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const sign=(value:number)=>value===0?0:value>0?1:-1;

export function createDynamicStrength(teams: Team[], ratings: RatingMap): DynamicStrengthState {
  return Object.fromEntries(teams.map(team=>[team.id,{base:ratings[team.id] ?? 0,initialBase:ratings[team.id] ?? 0,medium:0,momentum:0,form:0,seasonShock:0,history:0,acquired:0,positiveRun:0,negativeRun:0,tier:clubTier(team.id)}]));
}
export function baseRatings(state: DynamicStrengthState): RatingMap { return Object.fromEntries(Object.entries(state).map(([id,value])=>[id,value.base])); }
export function noFormRatings(state: DynamicStrengthState): RatingMap { return Object.fromEntries(Object.entries(state).map(([id,value])=>[id,value.base+value.medium])); }
export function effectiveRatings(state: DynamicStrengthState): RatingMap { return Object.fromEntries(Object.entries(state).map(([id,value])=>[id,value.base+value.medium+dynamicParameters.formWeight*value.form])); }
export function structuralSupport(team: DynamicTeamState) { return clip(team.tier+team.acquired,0,1); }

export function applyDynamicMatch(
  state: DynamicStrengthState,
  fixture: Fixture,
  score: MatchScore,
  precomputedOutcomes?: OutcomeProbabilities,
) {
  const home=state[fixture.homeId], away=state[fixture.awayId];
  const outcomes=precomputedOutcomes ?? new IndependentPoissonDistribution(score.lambdaHome,score.lambdaAway).outcomeProbabilities();
  const homeWin=outcomes.home, draw=outcomes.draw;
  const homeExpected=homeWin+.5*draw; const homeActual=score.homeGoals===score.awayGoals?.5:score.homeGoals>score.awayGoals?1:0; const outcomeShock=homeActual-homeExpected;
  const expectedMargin=score.lambdaHome-score.lambdaAway; const standardisedMargin=((score.homeGoals-score.awayGoals)-expectedMargin)/Math.sqrt(score.lambdaHome+score.lambdaAway+1e-8);
  const shock=dynamicParameters.resultWeight*outcomeShock+dynamicParameters.scoreWeight*Math.tanh(standardisedMargin/2);
  updateMomentum(home,shock); updateMomentum(away,-shock);
}
function updateMomentum(team: DynamicTeamState, shock: number) {
  const breaksRun=sign(team.momentum)!==0&&sign(team.momentum)!==sign(shock); const recoveringFromSlump=team.momentum<0&&shock>0;
  let rho=breaksRun?dynamicParameters.rhoBreak:dynamicParameters.rhoSame; if(recoveringFromSlump) rho*=1-dynamicParameters.breakRecoveryTier*structuralSupport(team);
  team.momentum=rho*team.momentum+shock; team.form=dynamicParameters.fMax*Math.tanh(dynamicParameters.beta*team.momentum); team.seasonShock+=shock;
}

/** Updates B/C/E only after the season; tier alters persistence, never a match's raw rating. */
export function closeDynamicSeason(state: DynamicStrengthState, playedByTeam: Record<string,number>) {
  for(const [teamId,team] of Object.entries(state)) { const seasonPerformance=team.seasonShock/Math.max(1,playedByTeam[teamId] ?? 38); const previousHistory=team.history;
    team.history=dynamicParameters.rhoH*team.history+seasonPerformance; const consistency=Math.max(0,Math.tanh((seasonPerformance*previousHistory)/(dynamicParameters.tauH**2)));
    team.positiveRun=dynamicParameters.rhoL*team.positiveRun+Math.max(0,seasonPerformance); team.negativeRun=dynamicParameters.rhoL*team.negativeRun+Math.max(0,-seasonPerformance);
    team.acquired=clip(dynamicParameters.eDecay*team.acquired+dynamicParameters.eGain*Math.max(0,team.positiveRun-dynamicParameters.eThreshold)*consistency-dynamicParameters.eLoss*Math.max(0,team.negativeRun-dynamicParameters.eThreshold),0,dynamicParameters.eMax);
    const support=structuralSupport(team); const mediumCarry=team.medium>=0?clip(dynamicParameters.phi0+dynamicParameters.phiSupport*support,0,1):clip(dynamicParameters.phi0-dynamicParameters.phiRecovery*support,0,1);
    const mediumShock=dynamicParameters.kC*Math.tanh(seasonPerformance/dynamicParameters.tauC)*(1+dynamicParameters.gammaC*consistency); team.medium=mediumCarry*team.medium+(seasonPerformance<0?1-dynamicParameters.etaC*support:1)*mediumShock;
    const baseShock=dynamicParameters.kB*consistency*Math.tanh(seasonPerformance/dynamicParameters.tauB); let baseStar=team.base+(seasonPerformance<0?1-dynamicParameters.etaB*support:1)*baseShock;
    const belowInitial=Math.max(0,team.initialBase-baseStar); baseStar+=dynamicParameters.kappaTier*team.tier*Math.tanh(belowInitial/dynamicParameters.tauTier); team.base=baseStar;
    team.momentum*=dynamicParameters.omegaZ; team.form=dynamicParameters.fMax*Math.tanh(dynamicParameters.beta*team.momentum); team.seasonShock=0;
  }
  // The match model depends only on rating differences. Keep the coordinate
  // system centred so a common long-run drift cannot leak into diagnostics.
  const meanBase=Object.values(state).reduce((sum,team)=>sum+team.base,0)/Math.max(1,Object.keys(state).length);
  for(const team of Object.values(state)){team.base-=meanBase;team.initialBase-=meanBase;}
}
