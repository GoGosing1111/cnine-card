import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {fixture,scenarios,snapshot,runBattle,metrics} from './measure-ss-rear-pve-20261008.mjs';
import {SS_REAR_PVE_POLICY,SS_REAR_PVE_POLICY_V1,isSsRearPveMercenary} from '../shared/mercenary-ss-rear-pve-v1.mjs';

// The four nurses have the same skill, rank and PVE stats. Use one representative
// per formation/seed rather than treating four copies as independent evidence.
export const codes=fixture.roster.filter(m=>m.rank==='SSS'||isSsRearPveMercenary(m)&&m.role!=='SUPPORT').map(m=>m.code).concat('V-051');
export function summarize(rows){
 const groups={};for(const r of rows){const g=groups[r.mode+'/'+r.group]||={total:0,wins:0,healing:0,damage:0};
  g.total+=r.total;g.wins+=r.wins;g.healing+=r.healing;g.damage+=r.mercenaryDamage;}
 return Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,{...g,winPercent:Math.round(g.wins/g.total*10000)/100,meanHealing:Math.round(g.healing/g.total)}]));
}
export function pairedComparisons(rows){
 const output={};
 for(const nurse of rows.filter(r=>r.code==='V-051')){
  const group=output[nurse.mode]||={pairs:0,nurseOnly:0,sssOnly:0,byCode:{}};
  for(const sss of rows.filter(r=>r.group==='SSS'&&['mode','scenario','equipment','formation','suit'].every(k=>r[k]===nurse[k]))){
   const individual=group.byCode[sss.code]||={pairs:0,nurseOnly:0,sssOnly:0,wins:0};
   for(let i=0;i<nurse.total;i++){
    group.pairs++;individual.pairs++;individual.wins+=sss.winsBySeed[i];
    if(nurse.winsBySeed[i]&&!sss.winsBySeed[i]){group.nurseOnly++;individual.nurseOnly++;}
    if(!nurse.winsBySeed[i]&&sss.winsBySeed[i]){group.sssOnly++;individual.sssOnly++;}
   }
  }
 }
 return output;
}
export async function measure({count=8,start=2001,modes=['LEGION'],formations=['HP2','HP0'],suits=[0],selectedCodes=codes,phase='before',onProgress=()=>{}}={}){
 const rows=[],selected=scenarios.filter(s=>modes.includes(s.mode));
 for(const scenario of selected)for(const equipment of scenario.equipment)for(const formation of formations)for(const suit of suits)for(const code of selectedCodes){
  const loadout=snapshot({code,equipment,formation,suit,adjusted:true});
  if(loadout.mercenary.pveRearCadence&&phase==='before')loadout.mercenary.pveRearCadence={...SS_REAR_PVE_POLICY_V1};
  const sum={},winsBySeed=[];for(let i=0;i<count;i++){
   const outcome=metrics(runBattle(scenario,loadout,Math.imul(start+i,7919)>>>0));winsBySeed.push(outcome.wins);
   for(const [key,value]of Object.entries(outcome))sum[key]=(sum[key]||0)+value;
  }
  rows.push({mode:scenario.mode,scenario:scenario.id,equipment,formation,suit,code,group:code==='V-051'?'SS_NURSE':fixture.roster.find(m=>m.code===code).rank==='SSS'?'SSS':'SS_RANGED',total:count,winsBySeed,...sum});
  if(rows.length%96===0)onProgress({phase,rows:rows.length,battles:rows.length*count});
 }
 return {phase,count,start,total:rows.length*count,summary:summarize(rows),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const get=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
 const options={count:Number(get('--count',8)),start:Number(get('--start',2001)),modes:get('--modes','LEGION').split(','),formations:get('--formations','HP2,HP0').split(','),suits:get('--suits','0').split(',').map(Number),selectedCodes:get('--codes',codes.join(',')).split(',')};
 const cache=get('--before-cache','../ss-rear-tier-before.json'),out=get('--out','../ss-rear-tier-comparison.json');
 const signature=createHash('sha256').update(JSON.stringify({schema:2,fixture,scenarios,codes,options,baseline:SS_REAR_PVE_POLICY_V1})).digest('hex');
 let before;
 if(fs.existsSync(cache)){const saved=JSON.parse(fs.readFileSync(cache));assert.equal(saved.signature,signature,'baseline inputs changed');before=saved.report;}
 else {before=await measure({...options,phase:'before',onProgress:p=>console.log(JSON.stringify(p))});fs.writeFileSync(cache,JSON.stringify({signature,report:before}));}
 const after=await measure({...options,phase:'after',onProgress:p=>console.log(JSON.stringify(p))});
 for(let i=0;i<before.rows.length;i++)if(before.rows[i].code!=='V-051')assert.deepEqual(after.rows[i],before.rows[i],'ranged and SSS control '+before.rows[i].code);
 const report={measuredAt:new Date().toISOString(),signature,options,policy:SS_REAR_PVE_POLICY,before,after,total:before.total+after.total,
  paired:{before:pairedComparisons(before.rows),after:pairedComparisons(after.rows)}};
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,policy:report.policy,before:before.summary,after:after.summary},null,2));
}
