import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {skillChipByCode} from '../../shared/battle-suit-skill-chips.mjs';
import {DEFENSE_KEY,DEFENSE_DIFFICULTIES,validateDefenseSettings} from '../../shared/monster-defense-v1.mjs';

export const chip=skillChipByCode('SKILL_CHIP_QUANTUM_BOMB');
export const drop=Object.freeze({code:chip.code,chancePercent:.01,minQuantity:1,maxQuantity:1});
export const operation='ops:quantum-bomb:defense-clear:20261125:v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const one=result=>{assert.equal(result.rows.length,1);return result.rows[0];};

export function addDefenseChip(current){
  const next=structuredClone(current);
  assert.equal(next.mode,'ON');assert.equal(next.rewardsEnabled,true);
  assert.deepEqual(next.difficulties.map(d=>d.id).sort(),DEFENSE_DIFFICULTIES.map(d=>d.id).sort());
  for(const difficulty of next.difficulties){
    const items=difficulty.clearReward.items;
    const index=items.findIndex(i=>i.code===drop.code);
    if(index<0)items.push({...drop});else items[index]={...drop};
  }
  validateDefenseSettings(next);
  return next;
}

export async function verifyDefenseChip(db){
  const get=async key=>JSON.parse(one(await db.query('SELECT value FROM app_meta WHERE key=$1',[key])).value);
  const settings=await get(DEFENSE_KEY),receipt=await get(operation);
  assert.equal(receipt.operation,operation);
  assert.deepEqual(addDefenseChip(settings),settings);
  const item=one(await db.query('SELECT name,is_active,description,image_url FROM inventory_items WHERE code=$1',[chip.code]));
  assert.equal(Number(item.is_active),1);
  assert.equal(item.description,chip.description);assert.equal(item.image_url,chip.image);
  const audit=one(await db.query('SELECT target_id FROM admin_logs WHERE id=$1',[receipt.auditId]));assert.equal(audit.target_id,operation);
  return {revision:settings.revision,mode:settings.mode,rewardsEnabled:settings.rewardsEnabled,
    difficulties:settings.difficulties.map(d=>({id:d.id,enabled:d.enabled,...d.clearReward.items.find(i=>i.code===chip.code)})),
    auditId:receipt.auditId,damageMultiplier:chip.damageMultiplier};
}

export async function applyDefenseChip(db,{dryRun=true}={}){
  await db.query('BEGIN');
  try{
    const raw=one(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DEFENSE_KEY])).value;
    if((await db.query('SELECT 1 FROM app_meta WHERE key=$1',[operation])).rows.length){
      const result=await verifyDefenseChip(db);await db.query('ROLLBACK');return {...result,replayed:true};
    }
    const before=JSON.parse(raw),next=addDefenseChip(before);
    const owner=one(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
    await db.query(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
      VALUES($1,$2,'BATTLE SUIT SKILL CHIP',$3,'SKILL_CHIP','SPECIAL',$4,$5,1) ON CONFLICT(code) DO NOTHING`,
      [chip.code,chip.name+' 스킬칩',chip.description,chip.image,80+chip.sortOrder]);
    const now=new Date().toISOString();next.revision++;next.updatedAt=now;next.updatedBy=Number(owner.id);
    delete next.lastRequest;
    next.audit=[{operationKey:operation,actorId:Number(owner.id),revision:next.revision,createdAt:now},...(next.audit||[])].slice(0,50);
    const saved=JSON.stringify(next);
    one(await db.query('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[saved,now,DEFENSE_KEY,raw]));
    const evidence={operation,completedAt:now,beforeRevision:before.revision,afterRevision:next.revision,
      beforeHash:hash(raw),afterHash:hash(saved),drop,damageMultiplier:chip.damageMultiplier};
    const audit=one(await db.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      VALUES($1,'OPS_DEFENSE_SETTINGS','MONSTER_DEFENSE',$2,$3,$4) RETURNING id`,[owner.id,operation,raw,JSON.stringify(evidence)]));
    await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[operation,JSON.stringify({...evidence,auditId:String(audit.id)}),now]);
    const result=await verifyDefenseChip(db);
    await db.query(dryRun?'ROLLBACK':'COMMIT');
    return {...result,dryRun,replayed:false};
  }catch(error){await db.query('ROLLBACK');throw error;}
}
