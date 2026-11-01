import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateCoopCombat} from '../../shared/cooperative-settings-v1.mjs';
import {validateCoopRewards} from '../../shared/cooperative-rewards-v1.mjs';
import {validateCoreRewardPolicy} from '../../shared/core-raid-reward-policy-v1.mjs';
export const COOP_EXPANSION_OP='ops:coop-transcend:20261102:v1';
export const COOP_EXPANSION_KEYS=['cooperative_battleground_settings_v1','reward_reveal_policy_v1:COOP_EXTREME','reward_reveal_policy_v1:COOP_TRANSCEND'];
export const coopExpansionHash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function transcendCombat(combat,{powerMultiplier=60,durabilityMultiplier=6,attackPercent=300}={}){
 const next=structuredClone(validateCoopCombat(combat));assert.equal(next.difficulties.length,3);
 const extreme=next.difficulties.find(d=>d.id==='EXTREME');
 next.difficulties.push({...structuredClone(extreme),id:'TRANSCEND',recommendation:'각 분대 용병 2명·Lv.21 기준 · 최상위 카드·장비·보호·정화·화력 연계',forcedEvery:2,responseSeconds:5,overloadPercent:36,focusPercent:60,
  monsters:extreme.monsters.map((m,i)=>({...m,power:Math.round(m.power*powerMultiplier),hpPercent:[800,800,800,1000,1200][i]*durabilityMultiplier,attackPercent,defensePercent:150,attackCount:i<3?3:4}))});
 return validateCoopCombat(next);
}
export function buildCoopExpansionPlan(rows){
 const old=rows.find(r=>r.key===COOP_EXPANSION_KEYS[0]);assert(old);assert(!rows.some(r=>r.key===COOP_EXPANSION_KEYS[2]),'Upper-tier reward policy already exists');
 const before=JSON.parse(old.value);assert.equal(before.encounterVersion,3);assert.equal(before.combat.difficulties.length,3);assert.equal(before.rewards.difficulties.length,3);
 const settings=structuredClone(before);settings.combat=transcendCombat(before.combat);
 const extreme=before.rewards.difficulties.find(d=>d.id==='EXTREME');assert(extreme);
 settings.rewards.difficulties.push({...structuredClone(extreme),id:'TRANSCEND',coin:extreme.coin*2,masterStars:extreme.masterStars*2,items:extreme.items.map(i=>({...i,quantity:i.quantity*2}))});
 settings.rewards=validateCoopRewards(settings.rewards);settings.revision=before.revision+1;
 const source=rows.find(r=>r.key===COOP_EXPANSION_KEYS[1]);assert(source,'Capture the current extreme choice policy');
 const reveal=validateCoreRewardPolicy(JSON.parse(source.value));assert(!reveal.entries.some(r=>r.rewardType==='VEHICLE'));
 // The new content's server-owned multiplier doubles the drawn quantities,
 // including minimum/fallback, without changing this pool's probabilities.
 return {operationKey:COOP_EXPANSION_OP,settings,reveal:{...reveal,revision:1},choiceQuantityMultiplier:2,accountWrites:0,oldDifficultyChanges:0,existingRoomChanges:0};
}
export async function inspectCoopExpansion(db){
 const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[COOP_EXPANSION_KEYS])).rows;
 return {rows,hash:coopExpansionHash(rows)};
}
// No connection or mutation occurs on import. Live activation is a later task.
export async function applyCoopExpansion(db,{expectedHash,expectedPlanHash,sourceCommit,authorization=null,dualMercenariesReleased=false,dryRun=true}={}){
 for(const hash of [expectedHash,expectedPlanHash])assert.match(hash||'',/^[a-f0-9]{64}$/);assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);
 const previous=(await db.query('SELECT value FROM app_meta WHERE key=$1',[COOP_EXPANSION_OP])).rows[0];if(previous)return {replayed:true,receipt:JSON.parse(previous.value)};
 if(!dryRun){assert.equal(authorization,COOP_EXPANSION_OP,'Explicit live authorization required');assert.equal(dualMercenariesReleased,true,'Release two mercenaries before activation');}
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[COOP_EXPANSION_OP]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[COOP_EXPANSION_OP])).rows[0];if(prior){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  await db.query('SELECT key FROM app_meta WHERE key=ANY($1::text[]) FOR UPDATE',[COOP_EXPANSION_KEYS]);
  const before=await inspectCoopExpansion(db);assert.equal(before.hash,expectedHash,'CMS changed after review');
  const plan=buildCoopExpansionPlan(before.rows);assert.equal(coopExpansionHash(plan),expectedPlanHash,'Prepared plan changed');
  const old=before.rows.find(r=>r.key===COOP_EXPANSION_KEYS[0]),now=new Date().toISOString(),settings={...plan.settings,updatedAt:now};
  const saved=await db.query('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4',[JSON.stringify(settings),now,old.key,old.value]);assert.equal(saved.rowCount,1);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[COOP_EXPANSION_KEYS[2],JSON.stringify(plan.reveal),now]);
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner);
  const receipt={operationKey:COOP_EXPANSION_OP,status:'COMPLETED',sourceCommit,completedAt:now,beforeHash:expectedHash,planHash:expectedPlanHash,revision:settings.revision,baseReward:settings.rewards.difficulties.at(-1),choiceQuantityMultiplier:2,accountWrites:0,oldDifficultyChanges:0,existingRoomChanges:0};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_COOP_TRANSCEND_20261102','COOPERATIVE','TRANSCEND',JSON.stringify(before),JSON.stringify({receipt,plan})])).rows[0];receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[COOP_EXPANSION_OP,JSON.stringify(receipt),now]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
