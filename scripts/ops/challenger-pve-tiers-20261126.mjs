import assert from 'node:assert/strict';
import {CHALLENGER_REWARD_MULTIPLIER,isChallengerResource} from '../../shared/challenger-pve-rewards-v1.mjs';
import {createHash} from 'node:crypto';
import {eclipseCombat,validateCoopCombat} from '../../shared/cooperative-settings-v1.mjs';
import {COOP_SETTINGS_KEY,validateCoopRewards} from '../../shared/cooperative-rewards-v1.mjs';
import {validateCoreRewardPolicy} from '../../shared/core-raid-reward-policy-v1.mjs';
import {LEGION_REGIONS_KEY,RUIN_DIFFICULTY} from '../../shared/legion-regions-v1.mjs';
import {validateRegionPolicy} from '../../functions/_legion_regions.js';

export const OPERATION='ops:challenger-pve-tiers:20261126:v1';
const predecessor='reward_reveal_policy_v1:COOP_TRANSCEND';
const newReveal='reward_reveal_policy_v1:COOP_ECLIPSE';
const keys=[COOP_SETTINGS_KEY,LEGION_REGIONS_KEY,predecessor,newReveal];
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');

export async function inspectPolicies(db,lock=false){
  const {rows}=await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key'+(lock?' FOR UPDATE':''),[keys]);
  return {rows,hash:digest(rows)};
}

export function expandedPolicies(rows){
  const docs=new Map(rows.map(({key,value})=>[key,JSON.parse(value)]));
  const coop=docs.get(COOP_SETTINGS_KEY),region=docs.get(LEGION_REGIONS_KEY);
  assert(!docs.has(newReveal),'Eclipse choice rewards already exist');
  assert.equal(coop.encounterVersion,3);
  assert.deepEqual(coop.combat.difficulties.map(d=>d.id),['NORMAL','HARD','EXTREME','TRANSCEND']);
  assert.deepEqual(coop.rewards.difficulties.map(d=>d.id),coop.combat.difficulties.map(d=>d.id));
  coop.combat.difficulties.push(eclipseCombat());
  const previous=coop.rewards.difficulties.at(-1);
  coop.rewards.difficulties.push({id:'ECLIPSE',coin:previous.coin*CHALLENGER_REWARD_MULTIPLIER,
    masterStars:previous.masterStars*CHALLENGER_REWARD_MULTIPLIER,
    items:previous.items.map(item=>({...item,quantity:isChallengerResource('INVENTORY_ITEM',item.code)?item.quantity*CHALLENGER_REWARD_MULTIPLIER:item.quantity}))});
  validateCoopCombat(coop.combat);
  validateCoopRewards(coop.rewards);
  coop.revision++;
  const choice={...validateCoreRewardPolicy(docs.get(predecessor)),revision:1};

  validateRegionPolicy(region);
  assert.equal(region.difficulties.length,5);
  const baseline=region.difficulties.find(d=>d.id==='calamity');
  const {id,power,bossPower,attack,shield,forced}=RUIN_DIFFICULTY;
  region.difficulties.push({id,power,bossPower,attack,shield,forced,loot:{...baseline.loot,bossStones:baseline.loot.bossStones*CHALLENGER_REWARD_MULTIPLIER}});
  for(const map of region.regions){
    if(!map.fieldDrops)continue;
    const source=map.fieldDrops.difficulties.find(d=>d.id==='calamity');
    map.fieldDrops.difficulties.push({...source,id});
  }
  validateRegionPolicy(region);
  region.revision++;
  return {coop,region,choice};
}

export async function releaseChallengerTiers(db,{expectedHash,sourceCommit,dryRun=true}){
  assert.match(expectedHash,/^[a-f0-9]{64}$/);
  assert.match(sourceCommit,/^[a-f0-9]{40}$/);
  const receipt=async()=>(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION])).rows[0];
  const prior=await receipt();
  if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
  await db.query('BEGIN');
  try{
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION]);
    const concurrent=await receipt();
    if(concurrent){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(concurrent.value)};}
    const source=await inspectPolicies(db,true);
    assert.equal(source.hash,expectedHash,'CMS settings changed since rehearsal');
    const {coop,region,choice}=expandedPolicies(source.rows);
    const updatedAt=new Date().toISOString();
    coop.updatedAt=updatedAt;
    for(const [key,value] of [[COOP_SETTINGS_KEY,coop],[LEGION_REGIONS_KEY,region]]){
      const before=source.rows.find(r=>r.key===key).value;
      const result=await db.query('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4',[JSON.stringify(value),updatedAt,key,before]);
      assert.equal(result.rowCount,1);
    }
    await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[newReveal,JSON.stringify(choice),updatedAt]);
    const saved={sourceCommit,completedAt:updatedAt,beforeHash:expectedHash,coopRevision:coop.revision,regionRevision:region.revision,choiceRevision:choice.revision};
    const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert(owner);
    const audit=await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_CHALLENGER_PVE_TIERS','APP_META',OPERATION,JSON.stringify(source.rows),JSON.stringify(saved)]);
    saved.adminLogId=String(audit.rows[0].id);
    await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION,JSON.stringify(saved),updatedAt]);
    await db.query(dryRun?'ROLLBACK':'COMMIT');
    return {replayed:false,dryRun,receipt:saved};
  }catch(e){await db.query('ROLLBACK');throw e;}
}
