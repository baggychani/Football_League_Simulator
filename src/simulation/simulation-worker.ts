/// <reference lib="webworker" />
import { teams } from '../data/teams';
import ratingsFile from '../data/calibrated-ratings.json';
import { createDoubleRoundRobin } from '../domain/fixtures';
import { applyResult, emptyTable, sortLeagueTable } from '../domain/standings';
import { createRng, type RandomGenerator } from './rng';
import { IndependentPoissonModel } from './score-model';
import { assessUpset } from './match-probability';
import { applyDynamicMatch, closeDynamicSeason, createDynamicStrength, effectiveRatings, type DynamicStrengthState } from './dynamic-strength';
import { strengthDiagnostics, toStrengthLayers } from './strength-index';
import type { PlayedMatch, RatingMap, TeamSeasonState } from '../domain/types';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const ratings=ratingsFile.ratings as RatingMap; const fixtures=createDoubleRoundRobin(teams.map(t=>t.id)); const teamMap=Object.fromEntries(teams.map(team=>[team.id,team])); const model=new IndependentPoissonModel(); const matchesPerRound=teams.length/2;
let running=false, paused=false, selected='', seed=1, total=0, completed=0, season=1, fixtureIndex=0, startNext=false, speed=1;
let table: Record<string,TeamSeasonState>=emptyTable(teams.map(team=>team.id)); let currentMatches: PlayedMatch[]=[]; let rng: RandomGenerator=createRng(1); let history:any[]=[]; let records:any={}; let championships:Record<string,number>={}; let dynamicState:DynamicStrengthState=createDynamicStrength(teams,ratings);

function prepareSeason() { table=emptyTable(teams.map(team=>team.id)); currentMatches=[]; fixtureIndex=0; rng=createRng((seed+season*2654435761)>>>0); }
function snapshot(round:number) { const strengthLayers=toStrengthLayers(teams,dynamicState); return {season,completedSeasons:completed,round,totalMatches:total,table:sortLeagueTable(table),recent:currentMatches.slice(-8),history,records,strengths:Object.fromEntries(Object.entries(strengthLayers).map(([id,value])=>[id,value.current])),strengthLayers,strengthDiagnostics:strengthDiagnostics(dynamicState),championships}; }
function updateRecords(match: PlayedMatch) { if(!records.mostGoals || match.homeGoals+match.awayGoals>records.mostGoals.homeGoals+records.mostGoals.awayGoals)records.mostGoals=match; if(match.homeGoals===match.awayGoals)return; const winner=match.homeGoals>match.awayGoals?'home':'away'; const upset=assessUpset(match.lambdaHome,match.lambdaAway,winner,Math.abs(match.homeGoals-match.awayGoals)); if(!upset)return; if(!records.biggestUpset||upset.upsetIndex>records.biggestUpset.upsetIndex)records.biggestUpset={...match,...upset}; }
function finishSeason() { const finalTable=sortLeagueTable(table); closeDynamicSeason(dynamicState,Object.fromEntries(Object.values(table).map(row=>[row.teamId,row.played]))); completed++; const selectedRow=finalTable.find(row=>row.teamId===selected)!; const championId=finalTable[0].teamId; championships[championId]=(championships[championId]??0)+1; history=[{season,championId,selectedPosition:selectedRow.position,selectedPoints:selectedRow.points},...history].slice(0,12); const finalSnapshot=snapshot(38); if(championId===selected){running=false;ctx.postMessage({type:'champion',snapshot:finalSnapshot,champion:{...selectedRow,margin:selectedRow.points-finalTable[1].points,seed}});return;} startNext=true; ctx.postMessage({type:'snapshot',snapshot:finalSnapshot}); }
function run() { if(!running||paused)return; if(startNext){season++;prepareSeason();startNext=false;}
  const round=Math.floor(fixtureIndex/matchesPerRound)+1;
  for(let i=0;i<matchesPerRound&&fixtureIndex<fixtures.length;i++,fixtureIndex++){const fixture=fixtures[fixtureIndex]; const score=model.simulateScore(teamMap[fixture.homeId],teamMap[fixture.awayId],effectiveRatings(dynamicState),rng); const match:{[K in keyof PlayedMatch]:PlayedMatch[K]}={...fixture,...score,season}; currentMatches.push(match); applyResult(table,fixture,score); applyDynamicMatch(dynamicState,fixture,score); updateRecords(match); total++;}
  if(fixtureIndex>=fixtures.length)finishSeason(); else ctx.postMessage({type:'snapshot',snapshot:snapshot(round)}); if(running)setTimeout(run,330/speed);
}
function reset() { running=false;paused=false;total=0;completed=0;season=1;fixtureIndex=0;startNext=false;history=[];records={};championships={};dynamicState=createDynamicStrength(teams,ratings);prepareSeason();ctx.postMessage({type:'reset',snapshot:snapshot(0)}); }
ctx.onmessage=({data})=>{if(data.type==='start'){reset();selected=data.selected;seed=data.seed>>>0;speed=data.speed||1;prepareSeason();running=true;run();}if(data.type==='speed')speed=data.speed||1;if(data.type==='pause')paused=true;if(data.type==='resume'){paused=false;run();}if(data.type==='reset')reset();};
