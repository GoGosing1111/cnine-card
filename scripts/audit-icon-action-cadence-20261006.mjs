import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as core from '../functions/_battle_v2_preview.js';
import {ICON_ROLES,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),output=process.argv[2];assert(output,'Output JSON required');
const fixture=JSON.parse(fs.readFileSync(new URL('../tests/helpers/icon-apocalypse-20261006.json',import.meta.url)));
const roles=JSON.parse(fs.readFileSync(new URL('../tests/helpers/icon-cadence-roles-20261006.json',import.meta.url)));
const baseline='fdc06e87a2eeb82b771a749d7e689c037582492a';
const oldModule=(file,overrides={})=>{
 let text=execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'});
 text=text.replace(/from '(\.\.?\/[^']+)'/g,(_,relative)=>`from '${overrides[relative]||new URL(relative,pathToFileURL(path.join(root,file))).href}'`);
 return 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
};
const before=await import(oldModule('functions/_battle_v2_preview.js',{'./_icon_combat.js':oldModule('functions/_icon_combat.js'),'../shared/battle-suit-skill-chips.mjs':oldModule('shared/battle-suit-skill-chips.mjs')}));
const card=(def,mode)=>{const c={id:def.cardId,title:def.name,grade:'ICON',power:180000};return {...c,iconRole:{...iconRoleSnapshot(c,roles.document,mode,roles.revision),supremacy:fixture.iconArgs.cards[2].iconRole.supremacy}};};
const actions=(r,id)=>r.timeline.filter(e=>e.actorId===id&&(['TURN','ICON_SKILL'].includes(e.type)||e.type==='ICON_STATUS'&&e.status==='CHANNEL'));
const durable=f=>Object.assign(f,{hp:1e12,maxHp:1e12,attack:1,defense:1e12,shield:0,maxShield:0});
const control={starvation:[],seals:[]};
for(const def of ICON_ROLES){
 const team=side=>[def,ICON_ROLES.find(d=>d.cardId!==def.cardId)].map((d,i)=>durable(core.buildFighter({...card(d,'PVP'),equipmentShare:500000,effectivePower:680000},i,side))).concat(Array.from({length:3},(_,i)=>durable(core.buildFighter({id:'neutral-'+i,grade:'ZENITH',power:680000},i+2,side))));
 const A=team('A'),B=team('B');for(const f of [...A,...B])f.apocalypseStatus={seal:{remaining:1000}};
 const args={teamA:A,teamB:B,seed:1,maxActions:100};
 const read=r=>[...A,...B].map(f=>({id:f.id,speed:f.speed,actions:actions(r,f.id).length}));
 control.starvation.push({name:def.name,before:read(before.simulateBattleV2Preview(args)),after:read(core.simulateBattleV2Preview(args))});
 const a=core.buildFighter(card(def,'PVP'),0,'A'),b=durable(core.buildFighter({id:'seal-target',power:1e6},0,'B'));a.speed=1e6;b.speed=1;a.hp=Math.round(a.maxHp*.1);a.magicSealCharges=1;
 const sealArgs={teamA:[a],teamB:[b],seed:11,maxActions:20},old=before.simulateBattleV2Preview(sealArgs),fixed=core.simulateBattleV2Preview(sealArgs);
 control.seals.push({name:def.name,beforeCasts:old.iconRoles[0].casts,afterCasts:fixed.iconRoles[0].casts,blocks:fixed.timeline.filter(e=>e.status==='SEAL_BLOCK').length});
 assert(fixed.iconRoles[0].casts>0&&control.seals.at(-1).blocks===1);
}
const gear=[0,100000,500000,1000000,20000000,100000000],seeds=[1,11,37,91];
const common=[...fixture.lowArgs.cards.filter(c=>c.grade!=='ICON'&&c.id!=='test-lower-clone'),{...REVIEW_DECK[3],power:93200}];assert.equal(common.length,4);
const rows=[];let battles=0;
function inspect(battle,def,scope,slot,equipment,seed,side='A'){
 const r=battle.result,actor=battle.teams[side].cards.find(c=>c.cardId===def.cardId);assert(actor);
 const own=actions(r,actor.id),skills=own.filter(e=>e.type==='ICON_SKILL'),role=actor.iconRole;
 assert(skills.length<=role.tuning.maxCasts);
 const castActions=skills.map(e=>own.indexOf(e)+1);
 assert(castActions.every((n,i)=>i===0||n-castActions[i-1]>=role.tuning.cooldownActions),def.name+' cooldown');
 for(const side of ['A','B'])for(const f of r.final[side])assert(Number.isFinite(f.hp)&&f.hp>=0&&f.hp<=f.maxHp);
 assert(r.timeline.every(e=>(e.damage==null||Number.isFinite(e.damage))&&(e.hits||[]).every(h=>h.damage==null||Number.isFinite(h.damage))));
 rows.push({scope,name:def.name,slot,equipmentPerCard:equipment,seed,side,actions:own.length,basics:own.filter(e=>e.type==='TURN').length,skills:skills.length,channels:own.filter(e=>e.status==='CHANNEL').length,castActions,winner:r.winner});
}
for(const def of ICON_ROLES)for(let slot=0;slot<5;slot++)for(const equipment of gear)for(const seed of seeds){
 const cards=[...common];cards.splice(slot,0,card(def,'PVP'));
  const pvp=core.createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerEquipmentBonus:equipment*5,defenderEquipmentBonus:equipment*5,seed});
 battles++;
 inspect(pvp,def,'PVP',slot,equipment,seed,'A');inspect(pvp,def,'PVP',slot,equipment,seed,'B');
 const pveCards=cards.map(c=>c.grade==='ICON'?card(def,'PVE'):c);
 for(const scope of ['PVE','APOCALYPSE']){
  const monster=scope==='APOCALYPSE'?fixture.iconArgs.monster:{id:1,name:'일반 보스 대조',power:Math.max(1000000,equipment*5),is_boss:1};
  battles++;
  inspect(core.createPveBattleV2({cards:pveCards,characterBonus:equipment*5,monster,seed}),def,scope,slot,equipment,seed);
 }
}
const pairs=[];
for(let i=0;i<7;i++)for(let j=i+1;j<7;j++)for(const equipment of gear)for(const seed of seeds){
 const cards=[card(ICON_ROLES[i],'PVP'),...common.slice(0,3),card(ICON_ROLES[j],'PVP')];
 const b=core.createPvpBattleV2({attackerCards:cards,defenderCards:[...cards].reverse(),attackerEquipmentBonus:equipment*5,defenderEquipmentBonus:equipment*5,seed});
 battles++;
 for(const side of ['A','B'])for(const def of [ICON_ROLES[i],ICON_ROLES[j]]){const f=b.teams[side].cards.find(c=>c.cardId===def.cardId),a=actions(b.result,f.id);pairs.push({pair:[i,j],name:def.name,equipmentPerCard:equipment,seed,side,actions:a.length,casts:a.filter(e=>e.type==='ICON_SKILL').length});}
}
const summary=ICON_ROLES.map(d=>({name:d.name,roles:rows.filter(r=>r.name===d.name).length,scopes:['PVP','PVE','APOCALYPSE'].map(scope=>{const list=rows.filter(r=>r.name===d.name&&r.scope===scope);return {scope,observations:list.length,totalActions:list.reduce((n,r)=>n+r.actions,0),totalSkills:list.reduce((n,r)=>n+r.skills,0),zeroActionBattles:list.filter(r=>!r.actions).length,zeroSkillBattles:list.filter(r=>!r.skills).length,firstCastActionRange:[Math.min(...list.flatMap(r=>r.castActions.slice(0,1))),Math.max(...list.flatMap(r=>r.castActions.slice(0,1)))]};})}));
const sources=Object.fromEntries(['functions/_battle_v2_preview.js','functions/_icon_combat.js','shared/battle-suit-skill-chips.mjs','shared/icon-role-visuals-v1.mjs'].map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const report={checkedAt:new Date().toISOString(),baseline,liveRoleRevision:roles.revision,liveRoleReadAt:roles.checkedAt,scope:{gearPerCard:gear,seeds,slots:[0,1,2,3,4],allIconPairs:21,side:'PVP both sides',note:'Local authoritative simulator, live role settings and saved FUR reference; controlled rosters, no production accounts or economic writes. Zero skills can reflect short fights, seals or no injured allies, not automatically a failure.'},sources,battles,actorObservations:rows.length+pairs.length,control,summary,rows,pairs};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({battles,actorObservations:report.actorObservations,seals:control.seals,summary},null,2));
