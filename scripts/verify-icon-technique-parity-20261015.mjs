import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {azantBalanceCandidate as mercenary} from './measure-azant-berkan-20261014.mjs';

// Compare complete receipts, not only winners. The baseline is the committed
// engine before these eight preparation-only techniques were introduced.
const baselineRef=process.env.ICON_PARITY_BASE||'0fb6b15cf1c71bcfce7c3500a5beb1378d5292fc';
const root=process.cwd(),out=path.join(root,'tmp/icon-techniques-parity');
fs.mkdirSync(out,{recursive:true});
const baselineFiles=new Set(['functions/_battle_v2_preview.js','functions/_icon_combat.js','functions/_mercenary_combat.js']);
const oldSource={name:'pre-techniques-source',setup(builder){builder.onLoad({filter:/[\\/]functions[\\/]_(battle_v2_preview|icon_combat|mercenary_combat)\.js$/},args=>{
 const relative=path.relative(root,args.path).replaceAll('\\','/');
 if(!baselineFiles.has(relative))return;
 return {contents:execFileSync('git',['show',baselineRef+':'+relative],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}),loader:'js',resolveDir:path.dirname(args.path)};
});}};
for(const [name,plugins] of [['before',[oldSource]],['after',[]]])await build({entryPoints:['functions/_battle_v2_preview.js'],outfile:path.join(out,name+'.mjs'),bundle:true,format:'esm',platform:'node',logLevel:'silent',plugins});
const before=await import(pathToFileURL(path.join(out,'before.mjs'))),after=await import(pathToFileURL(path.join(out,'after.mjs')));
const normal=(i)=>({id:'CONTROL-'+i,grade:['ZENITH','ZENITH','FUR','FUR','PRESTIGE'][i%5],name:'격리 대조 '+i,power:180000,power_type:'NONE'});
const cards=(defs=[],mode='PVP')=>Array.from({length:5},(_,i)=>{
 const def=defs[i];if(!def)return normal(i);
 const card={...normal(i),id:def.cardId,grade:'ICON',name:def.name};
 return {...card,iconRole:iconRoleSnapshot(card,defaultIconRoles(),mode)};
});
const rows=[];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function compare(kind,label,input){
 const old=before[kind](structuredClone(input)),current=after[kind](structuredClone(input));
 const expected=hash(old),actual=hash(current);
 assert.deepEqual(current,old,label);
 rows.push({kind,label,sha256:actual,baselineSha256:expected,unchanged:actual===expected});
}
for(const [i,def] of ICON_ROLES.entries()){
 const deck=cards([def,ICON_ROLES[(i+1)%ICON_ROLES.length]]),enemy=cards([ICON_ROLES[(i+4)%ICON_ROLES.length]]);
 for(const seed of [1,17,43,99])for(const reverse of [false,true])compare('createPvpBattleV2',def.code+'-'+seed+'-'+reverse,{attackerCards:reverse?enemy:deck,defenderCards:reverse?deck:enemy,attackerEquipmentBonus:40000,defenderEquipmentBonus:25000,seed});
 for(const seed of [3,37,101])compare('createPveBattleV2',def.code+'-pve-'+seed,{cards:cards([def],'PVE'),monster:{id:1,name:'격리 대조 보스',battle_power:780000},seed});
}
for(const seed of [2,31,73]){
 compare('createPvpBattleV2','plain-'+seed,{attackerCards:cards(),defenderCards:cards(),seed});
 const squad=(ownerId,offset)=>({ownerId,ownerName:'검수 '+ownerId,cards:cards([ICON_ROLES[offset]])});
 compare('createDuoBattleV2','duo-'+seed,{attackerSquads:[squad(101,0),squad(102,1)],defenderSquads:[squad(201,6),squad(202,8)],seed});
}
for(const code of ['V-055','V-056','V-049','V-046','V-021'])for(const seed of [7,29]){
 compare('createPvpBattleV2',code+'-merc-pvp-'+seed,{attackerCards:cards([ICON_ROLES[3]]),defenderCards:cards([ICON_ROLES[4]]),attackerMercenary:mercenary(code),defenderMercenary:mercenary('V-021'),seed});
 compare('createPveBattleV2',code+'-merc-pve-'+seed,{cards:cards([ICON_ROLES[3]],'PVE'),mercenary:mercenary(code),monster:{id:1,name:'격리 용병 대조 보스',battle_power:780000},seed});
}
const report={baselineRef,scope:'FULL_RECEIPT_EQUALITY_WITHOUT_TRUSTED_TECHNIQUE_PREPARATION',pairedBattles:rows.length,battles:rows.length*2,mismatches:0,rows};
const target=path.join(root,process.env.ICON_PARITY_REPORT||'docs/qa/icon-techniques-20261015/unchanged-controls.json');
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pairedBattles:rows.length,battles:rows.length*2,mismatches:0,report:path.relative(root,target)}));
