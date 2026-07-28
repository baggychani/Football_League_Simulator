import { describe, expect, it } from 'vitest';
import { teams } from '../data/teams';
import { clubsForCompetition } from '../data/league-catalog/club';
import { segunda2026, spainClubs } from '../data/league-catalog/spain';
import { createDoubleRoundRobin } from '../domain/fixtures';
import { normalizeMarketProbabilities } from '../calibration/market';
import { createRng } from '../simulation/rng';
import { IndependentPoissonModel } from '../simulation/score-model';
import { simulateSeason } from '../simulation/season-simulator';
import {
  applyResult,
  emptyTable,
  remainTiedAfterTableRules,
  sortLeagueTable,
} from '../domain/standings';
import { resolveDecisivePlayoffs } from '../domain/decisive-playoffs';
import { applyDynamicMatch, closeDynamicSeason, createDynamicStrength, dynamicParameters, effectiveRatings } from '../simulation/dynamic-strength';
import { toStrengthIndices, toStrengthLayers } from '../simulation/strength-index';

describe('league engine',()=>{
  it('creates exactly 380 home-and-away fixtures and 38 matches per club',()=>{ const fixtures=createDoubleRoundRobin(teams.map(t=>t.id)); expect(fixtures).toHaveLength(380); for(const team of teams) expect(fixtures.filter(f=>f.homeId===team.id||f.awayId===team.id)).toHaveLength(38); });
  it('normalizes a market and rejects invalid values',()=>{ const result=normalizeMarketProbabilities({arsenal:2,'man-city':1},teams); expect(Object.values(result).reduce((a,b)=>a+b,0)).toBeCloseTo(1); expect(()=>normalizeMarketProbabilities({arsenal:-1},teams)).toThrow(); expect(()=>normalizeMarketProbabilities({},teams)).toThrow(); });
  it('is deterministic for a seed and produces non-negative integer scores',()=>{ const model=new IndependentPoissonModel(); const ratings=Object.fromEntries(teams.map(t=>[t.id,0])); const a=model.simulateScore(teams[0],teams[1],ratings,createRng(4)); const b=model.simulateScore(teams[0],teams[1],ratings,createRng(4)); expect(a).toEqual(b); expect(Number.isInteger(a.homeGoals)&&a.homeGoals>=0).toBe(true); });
  it('accumulates points and orders by points, goal difference, then goals scored',()=>{ const table=emptyTable(['a','b']); applyResult(table,{homeId:'a',awayId:'b',round:1},{homeGoals:2,awayGoals:1,lambdaHome:0,lambdaAway:0}); const sorted=sortLeagueTable(table); expect(sorted[0].teamId).toBe('a'); expect(sorted[0].points).toBe(3); expect(sorted[0].goalDifference).toBe(1); });
  it('uses competition-defined points instead of assuming 3-1-0',()=>{ const table=emptyTable(['a','b']); applyResult(table,{homeId:'a',awayId:'b',round:1},{homeGoals:1,awayGoals:1,lambdaHome:0,lambdaAway:0},{win:2,draw:1,loss:0}); applyResult(table,{homeId:'a',awayId:'b',round:2},{homeGoals:1,awayGoals:0,lambdaHome:0,lambdaAway:0},{win:2,draw:1,loss:0}); expect(table.a.points).toBe(3); expect(table.b.points).toBe(1); });
  it('can rank equal-point clubs by a competition head-to-head sequence',()=>{
    const table=emptyTable(['a','b']);
    Object.assign(table.a,{played:2,wins:1,draws:0,losses:1,goalsFor:3,goalsAgainst:2,goalDifference:1,points:3});
    Object.assign(table.b,{played:2,wins:1,draws:0,losses:1,goalsFor:5,goalsAgainst:3,goalDifference:2,points:3});
    const matches=[
      {homeId:'a',awayId:'b',round:1,season:1,homeGoals:2,awayGoals:0,lambdaHome:0,lambdaAway:0},
    ];
    expect(sortLeagueTable(table,['goalDifference'],matches)[0].teamId).toBe('b');
    expect(sortLeagueTable(table,['headToHeadPoints','goalDifference'],matches)[0].teamId).toBe('a');
  });
  it('uses a decisive match only when every configured table rule remains tied',()=>{
    const table=emptyTable(['a','b']);
    Object.assign(table.a,{played:2,wins:1,draws:0,losses:1,goalsFor:2,goalsAgainst:2,goalDifference:0,points:3});
    Object.assign(table.b,{played:2,wins:1,draws:0,losses:1,goalsFor:2,goalsAgainst:2,goalDifference:0,points:3});
    const tableRules=['goalDifference','goalsFor','wins'] as const;
    const sorted=sortLeagueTable(table,tableRules);
    expect(remainTiedAfterTableRules(table,table.a,table.b,tableRules)).toBe(true);
    const resolved=resolveDecisivePlayoffs(
      sorted,
      [{positions:[1,2],purpose:'title',format:'single-match',trigger:'all-tiebreakers-tied'}],
      (upper,lower)=>remainTiedAfterTableRules(table,table[upper.teamId],table[lower.teamId],tableRules),
      (_upper,lower)=>lower,
    );
    expect(resolved.map(row=>row.teamId)).toEqual(['b','a']);
  });
  it('plays a complete reproducible season',()=>{ const fixtures=createDoubleRoundRobin(teams.map(t=>t.id)); const ratings=Object.fromEntries(teams.map(t=>[t.id,0])); const run=(seed:number)=>simulateSeason(teams,fixtures,ratings,createRng(seed),new IndependentPoissonModel()); const season=run(5); expect(season.matches).toHaveLength(380); expect(season.table.every(row=>row.played===38)).toBe(true); expect(run(5).championId).toBe(season.championId); });
  it('simulates a 22-club Spanish division without Premier League size assumptions',()=>{
    const clubs=clubsForCompetition(spainClubs,segunda2026);
    const fixtures=createDoubleRoundRobin(clubs.map(club=>club.id));
    const ratings=Object.fromEntries(clubs.map(club=>[club.id,0]));
    const season=simulateSeason(
      clubs,
      fixtures,
      ratings,
      createRng(12),
      new IndependentPoissonModel(),
      1,
      {
        dynamic:false,
        points:segunda2026.points,
        tieBreakers:segunda2026.tieBreakers,
      },
    );
    expect(fixtures).toHaveLength(22*21);
    expect(season.table).toHaveLength(22);
    expect(season.table.every(row=>row.played===42)).toBe(true);
  });
  it('preserves league-wide match, result, goal and point invariants across seeds',()=>{
    const fixtures=createDoubleRoundRobin(teams.map(team=>team.id));
    const ratings=Object.fromEntries(teams.map(team=>[team.id,0]));
    for(let seed=1;seed<=8;seed++){
      const season=simulateSeason(teams,fixtures,ratings,createRng(seed),new IndependentPoissonModel());
      const totals=season.table.reduce((sum,row)=>({
        played:sum.played+row.played,
        wins:sum.wins+row.wins,
        draws:sum.draws+row.draws,
        losses:sum.losses+row.losses,
        goalsFor:sum.goalsFor+row.goalsFor,
        goalsAgainst:sum.goalsAgainst+row.goalsAgainst,
        points:sum.points+row.points,
      }),{played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,points:0});
      expect(totals.played).toBe(fixtures.length*2);
      expect(totals.wins).toBe(totals.losses);
      expect(totals.goalsFor).toBe(totals.goalsAgainst);
      expect(totals.draws%2).toBe(0);
      expect(totals.points).toBe(totals.wins*3+totals.draws);
    }
  });
  it('gives an unexpected upset more short-term lift than an expected win, without exceeding the cap',()=>{ const pair=[{id:'sunderland',name:'Sunderland',abbr:'SUN',color:'#f00',secondaryColor:'#fff'},{id:'arsenal',name:'Arsenal',abbr:'ARS',color:'#fff',secondaryColor:'#f00'}]; const ratings={sunderland:-1,arsenal:1}; const upset=createDynamicStrength(pair,ratings); const expected=createDynamicStrength(pair,ratings); const fixture={homeId:'sunderland',awayId:'arsenal',round:1}; applyDynamicMatch(upset,fixture,{homeGoals:2,awayGoals:0,lambdaHome:.35,lambdaAway:2.4}); applyDynamicMatch(expected,fixture,{homeGoals:2,awayGoals:0,lambdaHome:2.4,lambdaAway:.35}); expect(upset.sunderland.form).toBeGreaterThan(expected.sunderland.form); for(let i=0;i<30;i++)applyDynamicMatch(upset,fixture,{homeGoals:2,awayGoals:0,lambdaHome:.35,lambdaAway:2.4}); expect(Math.abs(upset.sunderland.form)).toBeLessThanOrEqual(dynamicParameters.fMax); });
  it('uses tier only as season-to-season protection, not an initial match bonus',()=>{ const clubs=[{id:'arsenal',name:'Arsenal',abbr:'ARS',color:'#f00',secondaryColor:'#fff',structuralTier:1},{id:'sunderland',name:'Sunderland',abbr:'SUN',color:'#fff',secondaryColor:'#f00',structuralTier:0}]; const state=createDynamicStrength(clubs,{arsenal:0,sunderland:0}); expect(state.arsenal.form).toBe(state.sunderland.form); state.arsenal.seasonShock=-12; state.sunderland.seasonShock=-12; state.arsenal.history=-.5; state.sunderland.history=-.5; closeDynamicSeason(state,{arsenal:38,sunderland:38}); expect(state.arsenal.base).toBeGreaterThan(state.sunderland.base); });
  it('uses a translation-invariant neutral expected-result strength index',()=>{ const clubs=teams.slice(0,4); const ratings=Object.fromEntries(clubs.map((team,index)=>[team.id,index*.1])); const shifted=Object.fromEntries(clubs.map(team=>[team.id,ratings[team.id]+7])); const first=toStrengthIndices(clubs,ratings); const second=toStrengthIndices(clubs,shifted); expect(second).toEqual(first); expect(Object.values(first).reduce((sum,value)=>sum+value,0)/clubs.length).toBe(50); });
  it('stores base, medium and form layers while weighting form once',()=>{ const clubs=teams.slice(0,3); const state=createDynamicStrength(clubs,Object.fromEntries(clubs.map(team=>[team.id,0]))); state[clubs[0].id].medium=.08; state[clubs[0].id].form=.2; const layers=toStrengthLayers(clubs,state); expect(layers[clubs[0].id].noForm).toBeGreaterThan(layers[clubs[0].id].base); expect(layers[clubs[0].id].current).toBeGreaterThan(layers[clubs[0].id].noForm); expect(effectiveRatings(state)[clubs[0].id]).toBeCloseTo(.08+dynamicParameters.formWeight*.2); });
  it('centres the long-run base coordinate after every season',()=>{ const clubs=teams.slice(0,4); const state=createDynamicStrength(clubs,Object.fromEntries(clubs.map((team,index)=>[team.id,index*.1]))); for(const team of clubs)state[team.id].seasonShock=.4; closeDynamicSeason(state,Object.fromEntries(clubs.map(team=>[team.id,38]))); const mean=Object.values(state).reduce((sum,value)=>sum+value.base,0)/clubs.length; expect(mean).toBeCloseTo(0,10); });
});
