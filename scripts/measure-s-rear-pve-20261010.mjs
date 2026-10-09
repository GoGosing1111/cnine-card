import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {fixture as previous,scenarios,snapshot as oldSnapshot,runBattle,metrics} from './measure-ss-rear-pve-20261008.mjs';
import {ssRearPveSnapshot,S_REAR_PVE_POLICY} from '../shared/mercenary-ss-rear-pve-v1.mjs';
import fixture from '../tests/fixtures/s-rear-pve-20261010.json' with {type:'json'};
export {fixture,scenarios,runBattle,metrics};
export function snapshot({code='V-008',adjusted=true,...options}={}){
 const loadout=oldSnapshot({code,adjusted:true,...options});
 const source=[...fixture.targets,...fixture.controls].find(m=>m.code===code);
 if(source){
  loadout.mercenary=structuredClone(source);delete loadout.mercenary.pveRearCadence;
  if(adjusted)Object.assign(loadout.mercenary,ssRearPveSnapshot(loadout.mercenary));
 }
 return loadout;
}
export async function measure({count=4,start=6101,onProgress=()=>{}}={}){
 const codes=[...fixture.targets.map(m=>m.code),'V-004','V-049'],rows=[];
 for(const scenario of scenarios.filter(s=>s.mode==='APOCALYPSE'))for(const equipment of scenario.equipment)
  for(const formation of ['HP2','HP0'])for(const suit of [0,7000000])for(const code of codes){
   const before=[],after=[],deltas=[];
   for(let n=0;n<count;n++){
    const seed=Math.imul(start+n,7919)>>>0;
    const b=runBattle(scenario,snapshot({code,equipment,formation,suit,adjusted:false}),seed);
    const a=runBattle(scenario,snapshot({code,equipment,formation,suit,adjusted:true}),seed);
    if(!fixture.targets.some(m=>m.code===code))assert.deepEqual(a,b,'Unaffected control '+code);
    before.push(Number(b.winner==='A'));after.push(Number(a.winner==='A'));
    const id='A:MERCENARY:'+code;
    const shots=r=>r.timeline.filter(e=>e.type==='TURN'&&e.actorId?.startsWith('B:')&&e.targetId===id).length;
    deltas.push({seed,before:metrics(b),after:metrics(a),hitsBefore:shots(b),hitsAfter:shots(a)});
   }
   rows.push({monsterId:scenario.id,monster:scenario.name,equipment,formation,suit,code,total:count,before,after,deltas});
   if(rows.length%60===0)onProgress({rows:rows.length,battles:rows.length*count*2});
  }
 const summary=codes.map(code=>{
  const group=rows.filter(r=>r.code===code),total=group.length*count;
  const wins=key=>group.reduce((sum,r)=>sum+r[key].reduce((s,n)=>s+n,0),0);
  return {code,name:fixture.targets.find(m=>m.code===code)?.name||previous.roster.find(m=>m.code===code)?.name,
   totalPerPhase:total,beforeWins:wins('before'),afterWins:wins('after'),beforePercent:wins('before')/total*100,afterPercent:wins('after')/total*100};
 });
 const regressions=rows.filter(r=>r.code==='V-008').flatMap(r=>r.deltas.filter((d,i)=>r.before[i]&&!r.after[i]).map(d=>({monsterId:r.monsterId,monster:r.monster,equipment:r.equipment,formation:r.formation,suit:r.suit,...d})));
 assert.ok(regressions.length,'Must reproduce reported Astel clear before the fix');
 return {measuredAt:new Date().toISOString(),source:'CONTROLLED_SIMULATION',cmsCapturedAt:fixture.capturedAt,
  bossFixture:'tests/fixtures/ss-rear-pve-20261008.json',count,start,totalBattles:rows.length*count*2,policy:S_REAR_PVE_POLICY,
  summary,astelReproductions:regressions,rows,unaffectedControls:['V-004','V-049'],
  limitation:'동일 덱·장비·슈트·난수 통제 비교. 충분한 전력으로 S가 클리어하는 것은 허용하며 실유저 전체 승률을 의미하지 않는다.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const get=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
 const report=await measure({count:Number(get('--count',4)),start:Number(get('--start',6101)),onProgress:console.log});
 const out=get('--out','docs/s-rear-pve-20261010.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({totalBattles:report.totalBattles,summary:report.summary,astelReproductions:report.astelReproductions.length,first:report.astelReproductions[0]},null,2));
}
