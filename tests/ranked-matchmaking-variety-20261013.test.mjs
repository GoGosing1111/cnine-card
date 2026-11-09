import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRankedCandidate,rankedMatchBand} from '../shared/ranked-matchmaking-v2.mjs';

const settings={matchSeasonRange:250,matchCardRange:20};
const candidate=(id,scoreDiff=0,powerDiff=0)=>({id,scoreDiff,powerDiff});
function distribution(rows,options={}){
 const counts=new Map();
 for(let i=0;i<2000;i++){
  const row=selectRankedCandidate(rows,settings,{...options,random:()=>(i+0.5)/2000});
  counts.set(row.id,(counts.get(row.id)||0)+1);
 }
 return counts;
}

test('equally suitable opponents are all selectable without a fixed ID preference',()=>{
 const rows=Array.from({length:20},(_,i)=>candidate(i+1)),counts=distribution(rows);
 assert.equal(counts.size,20);
 for(const count of counts.values())assert(count>=99&&count<=101);
});

test('recent five are avoided before weighting; recent twenty penalize repeated meetings',()=>{
 const rows=Array.from({length:8},(_,i)=>candidate(i+1));
 const counts=distribution(rows,{recentOpponentIds:[1,2,3,4,5]});
 assert.deepEqual([...counts.keys()],[6,7,8]);
 const penalized=distribution([candidate(1),candidate(2)],{recentOpponentIds:[90,91,92,93,94,1,1,1,1]});
 assert(penalized.get(1)>0,'A frequency penalty is not a permanent ban');
 assert(penalized.get(1)<penalized.get(2)/5);
 const expired=distribution([candidate(1),candidate(2)],{recentOpponentIds:[...Array(20).fill(90),1,1,1,1]});
 assert.equal(expired.get(1),expired.get(2),'Older history must not permanently suppress an opponent');
});

test('closeness has more weight while normal-band priority and hard caps remain intact',()=>{
 const counts=distribution([candidate(1),candidate(2,200,20)]);
 assert(counts.get(1)>counts.get(2)*2);assert(counts.get(2)>0);
 const rows=[candidate(1,250,20),candidate(2,251,20),candidate(3,501,0),candidate(4,0,41),candidate(5,NaN,0)];
 for(const random of [()=>0,()=>0.999]){
  const result=selectRankedCandidate(rows,settings,{random});assert.equal(result.id,1);assert.equal(result.matchStage,0);
 }
 assert.equal(selectRankedCandidate(rows.slice(2),settings),null);
});

test('small and exhausted pools relax recency without rejecting every opponent',()=>{
 assert.equal(selectRankedCandidate([candidate(1)],settings,{recentOpponentIds:Array(20).fill(1)}).id,1);
 assert.equal(selectRankedCandidate([candidate(1),candidate(2)],settings,{recentOpponentIds:[1,2,1,2,1]}).id,2);
 assert.equal(selectRankedCandidate([candidate(1),candidate(2),candidate(3)],settings,{recentOpponentIds:[1,2,3,1,2]}).id,3);
 const fallback=selectRankedCandidate([candidate(1),candidate(2,350,30),candidate(3,500,40)],settings,{recentOpponentIds:[1,1]});
 assert.equal(fallback.id,2);assert.equal(fallback.matchStage,1);
});

test('stable scores no longer trap a healthy pool in a five-opponent cycle',()=>{
 let seed=20261013;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const rows=Array.from({length:24},(_,i)=>candidate(i+1,i,2)),recent=[],sequence=[];
 for(let i=0;i<120;i++){
  const next=selectRankedCandidate(rows,settings,{recentOpponentIds:recent,random});
  assert(!recent.slice(0,5).includes(next.id));assert.equal(rankedMatchBand(next,settings),0);
  sequence.push(next.id);recent.unshift(next.id);recent.length=Math.min(20,recent.length);
 }
 assert(new Set(sequence.slice(-20)).size>=12,'Repeated play must reach a broader set of equally suitable opponents');
 assert(new Set(sequence).size>=22);
});

test('two recently alternating peers can yield to a fresh neighbor one band away',()=>{
 const rows=[candidate(1),candidate(2),candidate(3,300,21),candidate(4,480,38)];
 assert.equal(selectRankedCandidate(rows,settings,{recentOpponentIds:[1,2,1,2,1]}).id,3);
 assert.equal(selectRankedCandidate(rows,settings,{recentOpponentIds:[1,3]}).id,2);
 assert.equal(selectRankedCandidate(rows.filter(r=>r.id!==3),settings,{recentOpponentIds:[1,2]}).id,2);
});

test('upper-tier rescue only replaces an empty pool or a lone last opponent, within both hard caps',()=>{
 const cfg={...settings,tiers:[{id:'diamond',min:1300}]},peer=(id,scoreDiff,powerDiff=10,lowerScore=1500)=>({...candidate(id,scoreDiff,powerDiff),lowerScore});
 const lone=peer(1,498),rescue=peer(2,503);
 const pick=(rows,recent=[])=>selectRankedCandidate(rows,cfg,{recentOpponentIds:recent,random:()=>0});
 assert.equal(pick([rescue]).matchStage,3);assert.equal(pick([lone,rescue]).id,1);assert.equal(pick([lone,rescue],[1]).id,2);
 assert.equal(pick([lone,peer(3,490),rescue],[1,3]).id,3);
 assert.equal(pick([peer(1,750,20,1300)]).matchStage,3);
 for(const row of [peer(1,751),peer(1,510,20.1),peer(1,510,10,1299)])assert.equal(pick([row]),null);
});
