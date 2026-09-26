import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {NURSE_CODES,NURSE_NAMES,NURSE_SKILL_ID,NURSE_BALANCE,nurseSelectionWeights} from '../shared/mercenary-nurse-healers-v1.mjs';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCardChances,mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
import {planNurseRelease,applyNurseRelease,OPERATION_KEY} from '../scripts/ops/nurse-healers-release-20260927.mjs';
import {playNurseHeal} from '../preview/project-v-v3/source/battle/NurseHealCombatPlayback.js';
const skill=seed.document.skills.find(s=>s.id===NURSE_SKILL_ID);
export const nurseSnapshot=(code='V-051')=>{const art=seed.catalog.cards.find(c=>c.code===code);return {code,name:art.name,rank:'SS',role:'SUPPORT',position:'REAR',level:1,basePower:120000,stats:{hp:100000,attack:1000,defense:100,speed:100},skills:[skill],combat,sourceArt:art.sourceArt,battleSprite:art.battleSprite};};
const previous=d=>{const old=structuredClone(d);for(const k of ['mercenaries','assignments'])old[k]=old[k].filter(c=>!NURSE_CODES.includes(c.code));old.skills=old.skills.filter(s=>s.id!==NURSE_SKILL_ID);return old;};
function setup(){
 const actor=buildMercenaryFighter(nurseSnapshot(),'A','PVP');actor.hp=50000;
 const allies=Array.from({length:5},(_,slot)=>({...actor,id:'A:'+slot,isMercenary:false,actorKind:'CARD',slot,hp:1000}));
 const enemy={...actor,id:'B:0',side:'B',isMercenary:false,actorKind:'CARD',slot:0,hp:1000};const events=[];
 const teams={A:[...allies,actor],B:[enemy]};
 const runtime=mercenaryCombat({teams,hit:()=>{throw Error('Healing cannot hit');},damage:()=>{throw Error('Healing cannot damage');},knockout:()=>{},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 const cast=(options)=>{actor.actions++;return runtime.beforeAction(actor,options);};return {actor,allies,enemy,events,teams,runtime,cast};
}
test('four immutable user portraits and transparent SD register as SS with one reviewed shared skill',()=>{
 assert.equal(seed.catalog.cards.length,55);assert.equal(seed.catalog.skills.length,35);
 for(const [i,code]of NURSE_CODES.entries()){
  const art=seed.catalog.cards.find(c=>c.code===code),row=seed.document.mercenaries.find(c=>c.code===code);
  assert.equal(row.name,NURSE_NAMES[i]);assert.equal(row.rank,'SS');assert.equal(row.role,'SUPPORT');assert.equal(row.position,'REAR');
  assert.deepEqual(seed.document.assignments.find(c=>c.code===code).skillIds,[NURSE_SKILL_ID]);
  for(const [path,hash]of [[art.sourceArt,art.sourceArtSha256],[art.battleSprite,art.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+path,import.meta.url))).digest('hex').toUpperCase(),hash);
  assert.notEqual(art.sourceArt,art.battleSprite);
 }
 assert.deepEqual(skill.balance,NURSE_BALANCE);assert.equal(skill.review,'REVIEWED');
 assert.equal(seed.catalog.effects.images.filter(i=>i.skillId===NURSE_SKILL_ID).length,1);
});
test('complete previous CMS expands four cards and exactly one skill, retaining every operator edit',()=>{
 const old=previous(seed.document);old.mercenaries[0].name='운영 이름';old.skills[0].balance.cost=37;old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 for(const k of ['mercenaries','skills','assignments'])assert.deepEqual(next[k].slice(0,old[k].length),old[k]);assert.deepEqual(next.settings,old.settings);assert.deepEqual(old,before);
 assert.equal(next.skills.length-old.skills.length,1);assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(old,seed.document,seed.catalog));
 const partial=structuredClone(next);partial.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(partial,seed.document,seed.catalog));
});
test('a single 320% budget splits six ways, emits once and spends energy and cooldown once',()=>{
 const f=setup();assert.equal(f.cast(),false,'support still permits its ordinary basic attack');
 const heal=f.events.filter(e=>e.type==='MERCENARY_GROUP_HEAL');assert.equal(heal.length,1);assert.equal(heal[0].budget,3200);assert.equal(heal[0].amount,533*6);assert.equal(heal[0].heals.length,6);
 assert.ok(heal[0].heals.every(h=>h.amount===533));assert.equal(f.enemy.hp,1000);assert.equal(f.actor.healingDone,3198);
 assert.equal(f.runtime.state(f.actor).energy,75);assert.equal(f.runtime.state(f.actor).cooldown.get(NURSE_SKILL_ID),5);assert.equal(f.runtime.state(f.actor).pending,null);
 for(let i=0;i<3;i++)f.cast();assert.equal(f.events.filter(e=>e.type==='MERCENARY_GROUP_HEAL').length,1);
 f.cast();assert.equal(f.events.filter(e=>e.type==='MERCENARY_GROUP_HEAL').length,2);assert.equal(f.runtime.state(f.actor).energy,50);
});
test('dead allies, suit and objective are excluded; overheal and healing reduction never transfer shares',()=>{
 const f=setup();f.allies[0].hp=0;f.allies[0].alive=false;f.allies[1].hp=f.allies[1].maxHp;
 f.allies[2].healingReductionPercent=50;f.allies[3].healingReductionPercent=100;f.allies[4].hp=f.allies[4].maxHp-7;
 f.teams.A.push({...f.actor,id:'A:SUIT',isMercenary:false,isBattleSuit:true},{...f.actor,id:'ESCORT_OBJECTIVE',isMercenary:false});
 f.cast();const e=f.events.find(e=>e.type==='MERCENARY_GROUP_HEAL');assert.equal(e.heals.length,5);
 assert.deepEqual(e.heals.map(h=>h.amount),[0,320,0,7,640]);assert.equal(f.allies[0].hp,0);assert.equal(f.teams.A.at(-1).hp,50000);assert.equal(f.teams.A.at(-2).hp,50000);
 assert.ok(e.amount<=e.budget);assert.ok(f.allies.every(a=>a.hp<=a.maxHp));
});
test('full health, control, no energy, and PVP overtime do not consume a heal',()=>{
 for(const reason of ['full','stun','silence','energy','overtime']){
  const f=setup();if(reason==='full')for(const a of f.teams.A)a.hp=a.maxHp;if(reason==='stun')f.actor.stunned=true;if(reason==='silence')f.actor.silenced=true;if(reason==='energy')f.runtime.state(f.actor).energy=24;
  f.cast({healingAllowed:reason!=='overtime'});assert.equal(f.events.length,0);assert.equal(f.runtime.state(f.actor).energy,reason==='energy'?24:100);assert.equal(f.runtime.state(f.actor).cooldown.size,0);
 }
});
test('PVE and PVP retain five cards plus a healer and authoritative aggregate HP events',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'TEST-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'}));
 for(const code of NURSE_CODES){const merc={...nurseSnapshot(code),statMode:'RANK_FIXED',startingHpPercent:50};
  for(const data of [createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'검수',battle_power:1000000},seed:17}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12})]){
   assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries.length,1);assert.equal(data.teams.A.mercenaries[0].cardId,code);
   const heals=data.result.timeline.filter(e=>e.type==='MERCENARY_GROUP_HEAL');assert.ok(heals.length>0);
   for(const e of heals){assert.equal(e.skillId,NURSE_SKILL_ID);assert.ok(e.amount<=e.budget);assert.ok(e.heals.every(h=>h.targetHpAfter<=h.targetMaxHp&&h.targetId[0]===e.actorId[0]));}
  }
 }
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} nurse acquisition retries and separate loadout preserve the one shared skill`,async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(f.draw);
 const ss=mercenaryGradePools(f.document.mercenaries,seed.catalog.cards.map(c=>c.code)).SS,choices=mercenaryCardChances(1000000,ss,f.draw.cardRules);let revision=0;
 for(const code of NURSE_CODES){const ticket=choices.slice(0,ss.indexOf(code)).reduce((n,r)=>n+r.weight,0),before=await f.coin(),request={requestId:crypto.randomUUID(),count:1};
  const result=await openMercenaryCards(f.env,f.user,request,{randomInt:n=>n===1000000?0:ticket});assert.equal(result.draws[0].mercenaryCode,code);
  await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Duplicate reroll')}});assert.equal(await f.coin(),before-1000);
  await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:code,revision:revision++});const deployed=await loadMercenaryBattleSnapshot(f.env,f.user);
  assert.equal(deployed.rank,'SS');assert.equal(deployed.basePower,120000);assert.deepEqual(deployed.skills.map(s=>s.id),[NURSE_SKILL_ID]);assert.deepEqual(deployed.skills[0].balance,NURSE_BALANCE);
 }
});
test('aggregate visual applies only server HP at the impact and cancellation never applies stale healing',async()=>{
 for(const cancel of [false,true]){
  const stage=new Container(),effectLayer=new Container(),combatLayer=new Container();stage.addChild(effectLayer,combatLayer);const source=new TextureSource({width:314,height:314});
  const make=id=>{const root=new Container(),fullBodySprite=new Sprite(new Texture({source}));root.addChild(fullBodySprite);combatLayer.addChild(root);root.position.set(id==='M'?200:500,500);return {id,root,fullBodySprite,fullBodyHeight:260,hp:17,battleActive:true};};
  const actor=make('M'),target=make('A'),frames=Array.from({length:16},()=>new Texture({source}));
  const engine={mercenaryEpoch:1,playbackEpoch:1,visible:true,allies:[target],simpleTimelines:new Set(),effectLayer,combatLayer,combatantById:id=>id==='M'?actor:target,sequenceFor:async()=>({frames}),queueBanner(){},eventHpPercent:(_t,hp)=>hp/10,syncTargetHp:(t,hp)=>t.hp=hp};
  engine.timeline=async build=>{let sync;build({to(_v,options){options.onUpdate();},call(fn,_args,at){assert.equal(at,.88);sync=fn;}});assert.equal(target.hp,17);if(cancel)engine.playbackEpoch++;sync();};
  await playNurseHeal(engine,{actorId:'M',type:'MERCENARY_GROUP_HEAL',skillId:NURSE_SKILL_ID,skillName:'백의의 맹세',heals:[{targetId:'M',amount:12,targetHpAfter:123},{targetId:'A',amount:90,targetHpAfter:987}]});
  assert.equal(target.hp,cancel?17:98.7);assert.equal(actor.hp,cancel?17:12.3);assert.equal(engine.mercenaryFx,null);assert.equal(effectLayer.children.length,0);assert.equal(engine.simpleTimelines.size,0);assert.equal(source.destroyed,false);
  stage.destroy({children:true});source.destroy();
 }
});
test('release policy keeps all old weights and adds exactly weight 3 for each nurse',()=>{
 const codes=['V-044','V-045','V-050',...NURSE_CODES],weights={'V-044':99,'V-045':99,'V-050':2,'V-021':8991},next=nurseSelectionWeights(codes,weights);
 assert.equal(next['V-050'],2);assert.ok(NURSE_CODES.every(c=>next[c]===3));assert.equal(next['V-021'],8991);assert.equal(next['V-044'],99);
 assert.equal(nurseSelectionWeights(codes,next),next);assert.deepEqual(weights,{'V-044':99,'V-045':99,'V-050':2,'V-021':8991});
 const partial={...weights,'V-051':321};assert.equal(nurseSelectionWeights(codes,partial),partial);
});
test('audited CMS and draw save is atomic, rejects stale revisions and replays once',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE')");
 const old=previous(f.document),ss=old.mercenaries.filter(c=>c.rank==='SS').map(c=>c.code),normal=ss.filter(c=>c!=='V-050');
 f.draw.cardRules.cardWeights={...Object.fromEntries(normal.map(c=>[c,99])),'V-050':normal.length};
 await f.pg.query("UPDATE mercenary_cms_documents_v1 SET payload_json=$1,revision=58 WHERE doc_key='config'",[JSON.stringify(old)]);await f.pg.query('UPDATE mercenary_draw_config_v1 SET payload_json=$1,revision=18 WHERE id=1',[JSON.stringify(f.draw)]);
 const configBefore=(await f.pg.query("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'")).rows[0],drawBefore=(await f.pg.query('SELECT * FROM mercenary_draw_config_v1 WHERE id=1')).rows[0];
 assert.deepEqual(planNurseRelease(old,f.draw).policy.outcomes,f.draw.outcomes);let fail='';
 const q=async(sql,args=[])=>{if(fail&&sql.includes(fail))throw Error('RELEASE_AUDIT_FAILURE');return (await f.pg.query(sql,args)).rows;};
 const run=async expected=>{await f.pg.exec('BEGIN');try{const result=await applyNurseRelease(q,expected);await f.pg.exec('COMMIT');return result;}catch(e){await f.pg.exec('ROLLBACK');throw e;}};
 await assert.rejects(()=>run({expectedCmsRevision:57,expectedDrawRevision:18}),/revision changed/);
 fail='INSERT INTO mercenary_draw_audit_v1';await assert.rejects(()=>run({expectedCmsRevision:58,expectedDrawRevision:18}),/RELEASE_AUDIT_FAILURE/);
 assert.deepEqual((await q("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'"))[0],configBefore);assert.deepEqual((await q('SELECT * FROM mercenary_draw_config_v1 WHERE id=1'))[0],drawBefore);assert.equal((await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).length,0);
 fail='';const done=await run({expectedCmsRevision:58,expectedDrawRevision:18}),again=await run({expectedCmsRevision:58,expectedDrawRevision:18});assert.equal(done.cmsRevision,59);assert.equal(done.drawRevision,19);assert.equal(again.replayed,true);assert.equal(again.adminAuditId,done.adminAuditId);assert.equal(Number((await q("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_RELEASE'"))[0].n),1);assert.equal(await f.coin(),10000000);
});
