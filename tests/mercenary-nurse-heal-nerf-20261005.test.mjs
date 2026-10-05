import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {NURSE_CODES,NURSE_BALANCE,NURSE_HEAL_POLICY,NURSE_SKILL_ID,nurseRuntimeSkill} from '../shared/mercenary-nurse-healers-v1.mjs';
import {battleConfig} from '../functions/_mercenary_account.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {applyNurseHealNerf,planNurseHealNerf,OPERATION_KEY,PREVIOUS_BALANCE} from '../scripts/ops/nurse-heal-nerf-20261005.mjs';
const skill=seed.document.skills.find(s=>s.id===NURSE_SKILL_ID);
function heal({legacy=false,reduction=0,converted=false}={}){
 const squads=coopSquads(),snapshot=squads[2].mercenary;
 snapshot.skills=[legacy?structuredClone(skill):nurseRuntimeSkill(skill)];
 const actor=buildMercenaryFighter(snapshot,'A','PVE',buildFighter);Object.assign(actor,{attack:1e9,maxHp:100000,hp:1000,healingReductionPercent:reduction});
 const events=[],dead={...actor,id:'A:DEAD',hp:0,alive:false};let request;
 const runtime=mercenaryCombat({teams:{A:[actor,dead],B:[]},hit:()=>assert.fail(),damage:()=>assert.fail(),knockout:()=>assert.fail(),emit:(type,data)=>events.push({type,...data}),clock:()=>0,
  ...(converted?{season2:{skillBlocked:()=>false,heal:(target,amount)=>{request=amount;const actual=Math.min(target.maxHp-target.hp,amount);target.hp+=actual;return actual;}}}:{})});
 actor.actions++;runtime.beforeAction(actor);return {actor,dead,event:events.find(e=>e.type==='MERCENARY_GROUP_HEAL'),request};
}
test('survivor concentration caps each cast at 15% before suppression in both healing paths',()=>{
 for(const converted of [false,true])for(const reduction of [0,50,100]){
  const {actor,dead,event,request}=heal({reduction,converted});const amount=15000*(1-reduction/100);
  assert.equal(event.amount,amount);assert.equal(actor.hp,1000+amount);assert.equal(dead.hp,0);assert.equal(event.heals.length,1);
  if(converted)assert.equal(request,amount);
 }
 // Saved rooms without a captured policy must replay exactly as before.
 assert.equal(heal({legacy:true}).event.amount,99000);
});
test('new account snapshots freeze the cap for all four nurses without changing CMS or other skills',()=>{
 const before=structuredClone(seed.document);
 for(const code of NURSE_CODES){const s=battleConfig(seed.document,code,1).skills[0];assert.deepEqual(s.balance,NURSE_BALANCE);assert.deepEqual(s.nurseHealing,NURSE_HEAL_POLICY);
  s.nurseHealing.maxTargetHpPercent=99;assert.equal(battleConfig(seed.document,code,1).skills[0].nurseHealing.maxTargetHpPercent,15);}
 const other=seed.document.skills.find(s=>s.id!==NURSE_SKILL_ID);assert.equal(nurseRuntimeSkill(other),other);assert.deepEqual(seed.document,before);
});
test('three-nurse cooperative encounters cap every target and retain deterministic legacy replay',()=>{
 const old=coopSquads({mercenaries:['V-051','V-052','V-053'],equipment:5000000});
 const run=squads=>createCooperativeBattle({squads,difficulty:'EXTREME',seed:7919}).payload.battleV2.result;
 const original=run(old),fresh=structuredClone(old);
 for(const squad of fresh)squad.mercenary.skills=squad.mercenary.skills.map(s=>nurseRuntimeSkill({...s,balance:{...NURSE_BALANCE}}));
 const after=run(fresh),heals=after.timeline.filter(e=>e.type==='MERCENARY_GROUP_HEAL');assert.ok(heals.length>3);
 assert.equal(new Set(heals.map(e=>e.actorId)).size,3);
 for(const e of heals){assert.ok(e.amount<=e.budget);for(const h of e.heals)assert.ok(h.amount<=Math.floor(h.targetMaxHp*.15));}
 assert.ok(original.timeline.filter(e=>e.type==='MERCENARY_GROUP_HEAL').some(e=>e.heals.some(h=>h.amount>h.targetMaxHp*.15)));
 assert.deepEqual(run(old),original,'an existing room recomputes the same saved battle');
});
test('CMS nerf only changes MS-051 balance and effect; transaction rolls back and retries once',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE')");
 const previous=structuredClone(f.document),oldSkill=previous.skills.find(s=>s.id===NURSE_SKILL_ID);oldSkill.balance={...PREVIOUS_BALANCE};oldSkill.effect='기존 회복 설명';
 const planned=planNurseHealNerf(previous);const expected=structuredClone(previous);Object.assign(expected.skills.find(s=>s.id===NURSE_SKILL_ID),{balance:{...NURSE_BALANCE},effect:planned.afterSkill.effect});
 assert.deepEqual(planned.document,expected);assert.deepEqual(oldSkill.balance,PREVIOUS_BALANCE);assert.match(planned.afterSkill.effect,/160%.*15%.*6턴/);
 assert.throws(()=>planNurseHealNerf(planned.document),/balance changed/);
 await f.pg.query("UPDATE mercenary_cms_documents_v1 SET payload_json=$1,revision=60 WHERE doc_key='config'",[JSON.stringify(previous)]);
 const before=(await f.pg.query("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'")).rows;
 const drawBefore=(await f.pg.query('SELECT * FROM mercenary_draw_config_v1')).rows;let fail=false;
 const q=async(sql,args=[])=>{if(sql.includes('pg_advisory_xact_lock'))return [];if(fail&&sql.includes('INSERT INTO mercenary_cms_audit_v1'))throw Error('AUDIT_FAILURE');return (await f.pg.query(sql,args)).rows;};
 const run=async revision=>{await f.pg.exec('BEGIN');try{const result=await applyNurseHealNerf(q,{expectedCmsRevision:revision});await f.pg.exec('COMMIT');return result;}catch(e){await f.pg.exec('ROLLBACK');throw e;}};
 await assert.rejects(()=>run(59),/revision changed/);fail=true;await assert.rejects(()=>run(60),/AUDIT_FAILURE/);
 assert.deepEqual(await q("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'"),before);assert.equal((await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).length,0);
 fail=false;const receipt=await run(60),again=await run(60);assert.equal(receipt.cmsRevision,61);assert.equal(again.replayed,true);assert.equal(again.adminAuditId,receipt.adminAuditId);
 assert.deepEqual(JSON.parse((await q("SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'"))[0].payload_json),expected);
 assert.deepEqual(await q('SELECT * FROM mercenary_draw_config_v1'),drawBefore);assert.equal(Number((await q("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_BALANCE'"))[0].n),1);
 assert.equal(await f.coin(),10000000);
});
