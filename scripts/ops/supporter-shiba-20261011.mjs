import {canManageSupport,supportBenefits} from '../../shared/server-support-v1.mjs';
import {readSupportRecord} from '../../functions/_supporter_benefits.js';
import {prepareSupporterPetReward} from '../../functions/_supporter_pet_reward.js';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from '../../functions/_joint_atomic.js';

export const backfillKey=id=>'supporter_pet_backfill_v1:20261011:'+Number(id);
// Called only by the authenticated ops runner under both live user-lock leases.
// Each account has its own permanent receipt, so an interrupted batch resumes.
export async function backfillSupporterPet(env,admin,userId,now=Date.now()){
  if(!canManageSupport(admin)||!Number.isSafeInteger(userId)||userId<1)throw Error('Invalid supporter pet backfill actor or target');
  const DB=env.DB,key=backfillKey(userId),p=(sql,...args)=>DB.prepare(sql).bind(...args);
  const prior=async()=>{const row=await p('SELECT value FROM app_meta WHERE key=?',key).first();return row?JSON.parse(row.value):null;};
  const saved=await prior();if(saved)return {...saved,replayed:true};
  const [support,target]=await Promise.all([readSupportRecord(env,userId),p('SELECT id,nickname FROM users WHERE id=?',userId).first()]);
  if(!target)throw Error('Supporter account not found');
  target.id=Number(target.id);
  if(!supportBenefits(support.state,now).active)return {ok:true,status:'INACTIVE',target,quantity:0};
  const reward=await prepareSupporterPetReward(env,{admin,target,requestId:'supporter_shiba_backfill_20261011_'+userId,now});
  if(!reward.result.quantity)return {ok:true,status:'ALREADY_OWNED',target,quantity:0};
  const result={...reward.result,status:'GRANTED',operationKey:key},token=crypto.randomUUID();
  await ensureJointAtomicSchema(env);
  try{await DB.batch([
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',userId),p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',support.key)]:[]),
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[support.key,support.raw,key]),
    ...reward.statements,
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify(result)),
    jointGuardEnd(DB,token)
  ]);}catch(error){const replay=await prior();if(replay)return {...replay,replayed:true};throw error;}
  return result;
}
