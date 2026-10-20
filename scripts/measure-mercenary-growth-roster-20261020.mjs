import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2,createDuoBattleV2,buildFighter} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink,mercenaryDamageCapHp,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {tierCards} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';

// Anonymous, read-only operating settings. No accounts, ownership or DB access.
export const roster=JSON.parse(fs.readFileSync(new URL('../tests/helpers/mercenary-growth-roster-20261020.json',import.meta.url)));
export const cards=tierCards(250000);
export const snapshot=(code,level=1,{finalBreakthrough=level===20}={})=>{
 const base=structuredClone(roster.snapshots.find(s=>s.code===code));assert(base,code);
 const breakthroughMask=[5,10,15,20].reduce((m,l,i)=>m|(l<level||l===20&&finalBreakthrough?1<<i:0),0);
 return {...base,mercenaryLevel:{version:2,level,policyRevision:roster.growthRevision,breakthroughMask,growth:roster.growth}};
};
export const options=(code,opponent,level,side,seed,opponentLevel=4)=>({
 attackerCards:cards,defenderCards:cards,
 attackerMercenary:snapshot(side==='A'?code:opponent,side==='A'?level:opponentLevel),
 defenderMercenary:snapshot(side==='B'?code:opponent,side==='B'?level:opponentLevel),seed
});
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Capture the same engine's private hit/gauge calculations in memory. Callbacks
// only observe; full-return parity with the unmodified engine is asserted below.
export async function growthProbe(){
 const url=new URL('../functions/_battle_v2_preview.js',import.meta.url),original=fs.readFileSync(url,'utf8');
 let source=original.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(_,q,p)=>'from '+q+new URL(p,url).href+q);
 assert.equal(source.split('function hitResult(').length,2);
 source=source.replace('function hitResult(','export function hitResult(');
 const consume=source.match(/if\(!independentAction&&!\(actor===reservedMercenary&&\w+KeepsNaturalGauge\(actor\)\)\)actor\.gauge = Math\.max\(0, actor\.gauge - 100\);/g);
 assert.equal(consume?.length,1);
 source=source.replace(consume[0],`const __growthGauge=actor.gauge;\n${consume[0]}\nglobalThis.__mercenaryGrowthAudit?.clock?.(actor,reservedMercenary===actor,__growthGauge,actor.gauge);`);
 const capped='const capped = Math.min(raw * (1 - reduction), hitCap);';
 assert.equal(source.split(capped).length,2);
 source=source.replace(capped,`${capped}\nglobalThis.__mercenaryGrowthAudit?.hit?.(actor,target,raw*(1-reduction),hitCap);`);
 const engine=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let parityChecks=0;
 for(const code of ['V-984','V-981','V-999'])for(const level of [1,11]){
  const opt=options(code,'V-057',level,'A',3011);
  assert.deepEqual(engine.createPvpBattleV2(opt),createPvpBattleV2(opt));parityChecks++;
 }
 function direct(code,level,{mode='PVP',finalBreakthrough=level===20}={}){
  const own=cards.map((c,i)=>buildFighter(c,i,'A',null,mode)),enemy=cards.map((c,i)=>buildFighter(c,i,'B',null,mode));
  const actor=buildMercenaryFighter(snapshot(code,level,{finalBreakthrough}),'A',mode,buildFighter);applyMercenaryCombatLink([[...own,actor],enemy]);
  const runtime=mercenaryCombat({teams:{A:[...own,actor],B:enemy},hit:()=>({}),damage:()=>({}),knockout:()=>{},emit:()=>{},clock:()=>0});
  const hit=engine.hitResult(actor,enemy[1],()=>.5,1,false,{basicAttack:true,damageCapScale:runtime.basicDamageCapScale(actor)});
  const incomingCapHp=mercenaryDamageCapHp(actor),hpCapComponent=incomingCapHp*(actor.mercenaryLink?.tierGuard||1)-(actor.mercenaryLink?.openingShield||0);
  return {level,levelApplied:actor.mercenaryLevelApplied,attack:mercenaryEffectiveAttack(actor),maxHp:actor.maxHp,incomingCapHp,hpCapComponent,
   basicDamage:runtime.beforeBasicDamage(actor,enemy[1],hit.damage),capDamage:hit.damage,naturalSpeed:actor.speed,openingGauge:actor.gauge};
 }
 return {engine,original,parityChecks,direct};
}

// Baseline hashes protect entire PvE / Lv.1 / pre-growth replay calculations,
// including damage, skills, ordering and final states, not just helper formulas.
export function unchangedBattleHashes(){
 const rows=[];
 for(const {code}of roster.snapshots){
  rows.push({code,scenario:'PVP_LEVEL_1',hash:digest(createPvpBattleV2(options(code,'V-057',1,'A',48001,1)))});
  rows.push({code,scenario:'PVE_LEVEL_11',hash:digest(createPveBattleV2({cards,mercenary:snapshot(code,11),monster:{id:'growth-audit-boss',name:'검증 대상',power:5e8,isBoss:true},seed:48001}))});
 }
 for(const code of ['V-001','V-057','V-984','V-996']){
  const legacy=snapshot(code,11);legacy.mercenaryLevel={version:1,level:11,breakthroughMask:3,bonuses:[{level:5,type:'HP_PERCENT',value:100},{level:10,type:'ATTACK_PERCENT',value:100}]};
  const opt=options(code,'V-057',11,'A',48003);opt.attackerMercenary=legacy;delete opt.defenderMercenary.mercenaryLevel;
  rows.push({code,scenario:'PVP_LEGACY',hash:digest(createPvpBattleV2(opt))});
 }
 const squads=(side,codes)=>codes.map((code,i)=>({ownerId:side+i,ownerName:'Fixture',cards,mercenary:snapshot(code,1)}));
 rows.push({scenario:'DUO_LEVEL_1',hash:digest(createDuoBattleV2({attackerSquads:squads(1,['V-984','V-981']),defenderSquads:squads(3,['V-057','V-999']),seed:48005}))});
 return rows;
}

export async function measureRoster(){
 const probe=await growthProbe(),rows=[];
 for(const meta of roster.snapshots){
  const {code,name,rank,role}=meta,row={code,name,rank,role,direct:[1,10,11].map(level=>probe.direct(code,level)),matchups:[]};
  for(const opponent of ['V-057','V-985'])for(const level of [1,10,11]){
   const total={opponent,opponentLevel:4,level,battles:0,wins:0,draws:0,damage:0,actions:0,casts:0,hitChecks:0,clippedHits:0,extraActions:0,naturalActions:0,partialGaugeErased:0,lostGauge:0};
   for(let i=0;i<4;i++)for(const side of ['A','B']){
    const seed=createHash('sha256').update(`growth-roster:${code}:${opponent}:${i}`).digest().readUInt32BE(0),id=side+':MERCENARY:'+code;
    let actorRef=null,battle;
    globalThis.__mercenaryGrowthAudit={
     clock(a,extra,before,after){if(a.id!==id)return;actorRef=a;total[extra?'extraActions':'naturalActions']++;if(extra&&before>1e-6&&before<100&&after<before){total.partialGaugeErased++;total.lostGauge+=before-after;}},
     hit(a,t,raw,cap){if(a.id!==id)return;actorRef=a;total.hitChecks++;total.clippedHits+=Number(raw>cap);}
    };
    try{battle=probe.engine.createPvpBattleV2(options(code,opponent,level,side,seed));}finally{delete globalThis.__mercenaryGrowthAudit;}
    total.battles++;total.wins+=Number(battle.result.winner===side);total.draws+=Number(!['A','B'].includes(battle.result.winner));
    total.damage+=actorRef?.damageDealt||0;total.actions+=actorRef?.actions||0;
    total.casts+=battle.result.timeline.filter(e=>e.type==='MERCENARY_WINDUP'&&e.actorId===id&&!e.continuation).length;
   }
   row.matchups.push({...total,damagePerBattle:total.damage/total.battles,actionsPerBattle:total.actions/total.battles,castsPerBattle:total.casts/total.battles,cappedHitRatio:total.hitChecks?total.clippedHits/total.hitChecks:null});
  }
  row.basicPlateau=row.direct[2].attack>row.direct[0].attack&&row.direct[2].basicDamage===row.direct[0].basicDamage;
  row.incomingHpComponentOneForOne=Math.abs(row.direct[2].hpCapComponent-row.direct[2].maxHp)<.01;
  row.observedGaugeErasure=row.matchups.some(r=>r.level===11&&r.partialGaugeErased>0);
  rows.push(row);
 }
 return {checkedAt:new Date().toISOString(),rosterCheckedAt:roster.checkedAt,cmsRevision:roster.cmsRevision,growthRevision:roster.growthRevision,
  scope:'CONTROLLED_CANONICAL_COMPARISON_NOT_LIVE_PLAYER_WIN_RATE',
  conditions:{cards:'Identical five basic cards at power 250000; no equipment/magic/pets.',directProbe:'Full-HP defense target, RNG 0.5, basic packet including innate basic damage scale; excludes unique follow-ups.',battles:'Each code at 1/10/11 against Kangyun 4 and Halloween Ayoon 4; four paired seeds mirrored A/B.',parityChecks:probe.parityChecks},
  engineHash:createHash('sha256').update(probe.original).digest('hex'),count:rows.length,battles:rows.reduce((n,r)=>n+r.matchups.reduce((m,x)=>m+x.battles,0),0),
  summary:{basicPlateau:rows.filter(r=>r.basicPlateau).length,incomingHpComponentOneForOne:rows.filter(r=>r.incomingHpComponentOneForOne).length,observedGaugeErasure:rows.filter(r=>r.observedGaugeErasure).length,growthApplied:rows.filter(r=>r.direct.every(d=>d.levelApplied===true)).length},rows};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const base=new URL('../docs/qa/mercenary-growth-roster-20261020/',import.meta.url);
 if(process.argv.includes('--baseline')){
  const data={source:'cf4a6e9e0',rows:unchangedBattleHashes()};fs.writeFileSync(new URL('unchanged-baseline.json',base),JSON.stringify(data,null,2)+'\n');console.log({baselineBattles:data.rows.length});
 }else{
  const report=await measureRoster();fs.writeFileSync(new URL('after.json',base),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({count:report.count,battles:report.battles,summary:report.summary}));
 }
}
