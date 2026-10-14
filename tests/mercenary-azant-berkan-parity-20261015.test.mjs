import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {AZANT_BALANCE,AZANT_COMBAT,azantPlaybackRate} from '../shared/mercenary-azant-v1.mjs';
import {BERKAN_BALANCE,BERKAN_TEMPO,BERKAN_PVP_SKILL_CAP_SCALE,BERKAN_PVP_BASIC_DAMAGE_SCALE,berkanPlaybackRate} from '../shared/mercenary-berkan-v1.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {buildFighter,createPvpBattleV2,createPveBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {azantBalanceCandidate as candidate} from '../scripts/measure-azant-berkan-20261014.mjs';
import {tierCards,tierDecks,fixture} from './helpers/mercenary-operating-roster-v2144.mjs';
import equipped from './helpers/berkan-pvp-equipped-fixtures-20260930.json' with {type:'json'};
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

const normalize=id=>typeof id==='string'?id.replace(/V-05[56]/g,'PARITY'):id;
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,key.toLowerCase().endsWith('id')?normalize(row[key]):row[key]]));
const impactKeys=['targetId','damage','absorbed','dodge','targetHpAfter','targetMaxHp','targetShieldAfter','targetMaxShield'];
const fighterRows=rows=>rows.map(row=>pick(row,['id','hp','maxHp','shield','maxShield','attack','defense','speed','gauge','alive','mercenaryLink']));
function outcome(battle){
 const r=battle.result;
 return {winner:r.winner,reason:r.reason,actions:r.actions,mercenaryActions:r.mercenaryActions,duration:r.duration,
  final:Object.fromEntries(['A','B'].map(side=>[side,fighterRows(r.final[side])])),
  mercenaries:Object.fromEntries(['A','B'].map(side=>[side,fighterRows(r.final.mercenaries?.[side]||[])])),
  damage:r.timeline.filter(e=>e.impacts||e.hits||Number.isFinite(e.damage)).map(e=>({seq:e.seq,at:e.at,actorId:normalize(e.actorId),sourceAttackerId:normalize(e.sourceAttackerId),
   contacts:(e.impacts||e.hits||[e]).map(h=>pick(h,impactKeys))}))};
}
const report={scope:'SAME_INPUT_CANONICAL_COMBAT_PARITY',pairedCases:{plain:0,equipped:0,pve:0,duo:0,hunt:0},mismatches:0};
const same=(a,b,label)=>assert.deepEqual(outcome(a),outcome(b),label);

test('Azant shares Berkan raw skill, cadence, basic damage, cap and playback policy',()=>{
 assert.equal(AZANT_BALANCE,BERKAN_BALANCE);assert.equal(AZANT_COMBAT.speedScale,BERKAN_TEMPO.speedScale);
 assert.equal(AZANT_COMBAT.actionCredit,BERKAN_TEMPO.actionCredit);assert.equal(AZANT_COMBAT.pvpSkillCapScale,BERKAN_PVP_SKILL_CAP_SCALE);
 assert.equal(AZANT_COMBAT.pvpBasicDamageScale,BERKAN_PVP_BASIC_DAMAGE_SCALE);
 for(const engine of [{paceScale:1},{paceScale:2},{reducedMotion:true}])assert.equal(azantPlaybackRate(engine),berkanPlaybackRate(engine));
});

function harness(code,mode){
 const actor=buildMercenaryFighter(candidate(code),'A',mode,buildFighter);
 const targets=Array.from({length:5},(_,i)=>({id:'T'+i,slot:i,row:i<2?'FRONT':'BACK',attack:50+i,openingAttack:100-i,hp:1e9,maxHp:1e9,shield:100,alive:true}));
 const hits=[],events=[],runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit(a,t,ratio,options){hits.push({target:t.id,ratio,...options});return{damage:1000*ratio,dodge:t.id==='T3'};},
  damage(t,n){const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return{absorbed,hpDamage};},knockout(){},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {actor,targets,hits,events,runtime,act(){actor.actions++;runtime.beforeAction(actor);}};
}
test('PVP targets rear opening threats; PVE alternates volley then area with separate cooldowns and one cast budget',()=>{
 for(const mode of ['PVP','PVE']){
  const a=harness('V-056',mode),b=harness('V-055',mode);for(const h of [a,b])for(const [i,t]of h.targets.entries())t.attack=100-i;a.act();b.act();
  assert.deepEqual(a.hits,b.hits);assert.deepEqual(a.hits.map(h=>h.target),['T4','T3']);assert.deepEqual(a.targets,b.targets);
  assert.equal(a.runtime.state(a.actor).energy,65);assert.equal(a.runtime.state(a.actor).cooldown.get('MS-057'),6);
  if(mode==='PVE'){
   a.act();b.act();assert.deepEqual(a.hits,b.hits);assert.deepEqual(a.targets,b.targets);
   assert.equal(a.runtime.state(a.actor).energy,30);assert.equal(a.runtime.state(a.actor).cooldown.get('MS-058'),7);
   const area=a.events.find(e=>e.type==='MERCENARY_AZANT_AREA');assert.equal(area.hits.length,5);assert.equal(new Set(area.targetIds).size,5);
  }else{a.act();assert.equal(a.events.filter(e=>e.type==='MERCENARY_AZANT_AREA').length,0);assert.equal(a.runtime.state(a.actor).energy,65);}
  assert.equal(a.runtime.beforeBasicDamage(a.actor,a.targets[0],1001),b.runtime.beforeBasicDamage(b.actor,b.targets[0],1001));
 }
});

test('stored front-only CMS upgrades read-only; balances, notes, assignments and all other mercenaries survive',()=>{
 const old=structuredClone(seed.document),card=old.mercenaries.find(c=>c.code==='V-056'),skill=old.skills.find(s=>s.id==='MS-057');
 card.skillTarget='FRONT_GROUP';card.specialty='이전 전열 포격';card.notes='운영 메모';skill.target='FRONT_GROUP';skill.trigger='PVP 전열 전용';skill.balance.cost=31;skill.notes='스킬 메모';
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 assert.deepEqual(old,before);assert.equal(next.skills.find(s=>s.id==='MS-057').target,'BACK_THREAT');assert.equal(next.mercenaries.find(c=>c.code==='V-056').skillTarget,'BACK_THREAT');
 assert.deepEqual(next.assignments,old.assignments);assert.deepEqual(next.settings,old.settings);assert.deepEqual(next.skills.find(s=>s.id==='MS-057').balance,skill.balance);
 assert.equal(next.mercenaries.find(c=>c.code==='V-056').notes,'운영 메모');assert.equal(next.skills.find(s=>s.id==='MS-057').notes,'스킬 메모');
 assert.deepEqual(next.skills.filter(s=>s.id!=='MS-057'),old.skills.filter(s=>s.id!=='MS-057'));
 assert.deepEqual(next.mercenaries.filter(c=>c.code!=='V-056'),old.mercenaries.filter(c=>c.code!=='V-056'));
 assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 const publicCard=mercenaryCodexDocument({payload_json:JSON.stringify(old),revision:61}).cards.find(c=>c.code==='V-056');
 assert.equal(publicCard.skills[0].target,'적 후열 핵심 위협');assert.match(publicCard.skills[0].trigger,/PVE·PVP/);assert.match(publicCard.combatLinkDescription,/1\.865배/);
});

test('same cards, gear, magic, seed and side produce identical PVP damage receipts and outcomes against normal SSS peers',()=>{
 const groups=[...Object.entries(tierDecks).flatMap(([name,types])=>[1e6,2e9].map(power=>({kind:'plain',name:name+'-'+power,cards:tierCards(power,types),equipment:0,magic:[],healer:fixture.singleHealerBonus}))),
  ...equipped.formations.map(f=>({kind:'equipped',name:f.id,cards:f.cards.map((key,i)=>({id:'qa-'+i,...structuredClone(equipped.cardProfiles[key])})),equipment:equipped.equipmentBonus,magic:equipped.magicProfiles[f.magic],healer:equipped.singleHealerBonus}))];
 for(const group of groups)for(const side of ['A','B'])for(const code of ['V-049','V-046'])for(const n of [13,97]){
  const args={attackerCards:group.cards,defenderCards:group.cards,attackerEquipmentBonus:group.equipment,defenderEquipmentBonus:group.equipment,attackerMagicCards:group.magic,defenderMagicCards:group.magic,singleHealerBonus:group.healer,seed:n*7919};
  const run=subject=>createPvpBattleV2({...args,attackerMercenary:candidate(side==='A'?subject:code),defenderMercenary:candidate(side==='B'?subject:code)});
  same(run('V-056'),run('V-055'),group.name+' '+side+' '+code+' '+n);report.pairedCases[group.kind]++;
 }
});

test('same personal gear and seed produce identical boss, duo and twelve-target sustained-hunt combat',()=>{
 for(const power of [1e6,2e9])for(const multiplier of [10,100])for(const n of [7,31,97]){
  const cards=tierCards(power),merc=code=>({...candidate(code),equipment:{schemaVersion:1,mode:'PVE',power:1000000}}),run=code=>createPveBattleV2({cards,mercenary:merc(code),monster:{id:1,name:'검수 보스',battle_power:power*multiplier,is_boss:1},seed:n*7919,singleHealerBonus:fixture.singleHealerBonus});
  same(run('V-056'),run('V-055'),'PVE '+power+' '+multiplier+' '+n);report.pairedCases.pve++;
 }
 const cards=tierCards(2e7),squads=(id,code)=>[{ownerId:id,cards,mercenary:candidate(code)},{ownerId:id+1,cards,mercenary:candidate('V-049')}];
 for(const side of ['A','B'])for(const n of [7,31,97]){
  const run=code=>createDuoBattleV2({attackerSquads:squads(1,side==='A'?code:'V-046'),defenderSquads:squads(3,side==='B'?code:'V-046'),seed:n*7919});
  same(run('V-056'),run('V-055'),'DUO '+side+' '+n);report.pairedCases.duo++;
 }
 for(const n of [7,31]){
  const run=code=>createHuntSession({snapshot:{cards,mercenary:candidate(code),accountNickname:'검수'},seed:n*7919,limitMs:15000}).payload.battleV2;
  same(run('V-056'),run('V-055'),'HUNT '+n);report.pairedCases.hunt++;
 }
 report.battles=Object.values(report.pairedCases).reduce((s,n)=>s+n,0)*2;
 if(process.env.AZANT_PARITY_REPORT)writeFileSync(process.env.AZANT_PARITY_REPORT,JSON.stringify(report,null,2)+'\n');
});
