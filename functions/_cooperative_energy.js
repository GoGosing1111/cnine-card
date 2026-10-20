import {contentEnergy,contentEnergyView,COOP_ENERGY_MAXIMUM} from '../shared/content-energy-v1.mjs';
import {COOP_SETTINGS_KEY,coopRewardDay} from '../shared/cooperative-rewards-v1.mjs';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';

const p=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const read=async(env,key)=>(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
export const coopEnergyKey=id=>'coop_energy_v1:'+Number(id);
export const coopEntryKey=id=>'coop_entry_energy_v1:'+id;
const fail=(code,message)=>{throw Object.assign(Error(message),{code:'COOP_'+code,status:409});};
async function load(env,id,at){
 const key=coopEnergyKey(id);let raw=await read(env,key);
 if(raw===null){
  // Convert the old balance once; changing the date never refills this key.
  const legacy=await read(env,`coop_reward_day_v1:${coopRewardDay(at).day}:${Number(id)}`),used=legacy===null?0:JSON.parse(legacy).count;
  if(!Number.isSafeInteger(used)||used<0||used>COOP_ENERGY_MAXIMUM)throw Error('Invalid legacy cooperative quota');
  const initial=JSON.stringify(contentEnergy(null,{at,maximum:COOP_ENERGY_MAXIMUM,initial:COOP_ENERGY_MAXIMUM-used}));
  await p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',key,initial).run();
  raw=await read(env,key);
 }
 return {key,raw,energy:contentEnergy(JSON.parse(raw),{at,maximum:COOP_ENERGY_MAXIMUM})};
}
export async function coopEnergy(env,id,at=Date.now()){
 return contentEnergyView((await load(env,id,at)).energy,{at,maximum:COOP_ENERGY_MAXIMUM});
}
export async function readCoopEntry(env,room){
 const raw=await read(env,coopEntryKey(room.id));if(raw===null)return null;
 const receipt=JSON.parse(raw),ids=room.members.map(m=>Number(m.id)).sort((a,b)=>a-b);
 if(receipt.creationRequest!==room.creationRequest||JSON.stringify(receipt.userIds)!==JSON.stringify(ids))throw Error('Cooperative energy receipt collision');
 return receipt;
}
// One database transaction charges all three players or none. A durable room
// intent is persisted before this call, allowing restart/response-loss replay.
export async function spendCoopEnergy(env,room,at=Date.now()){
 const prior=await readCoopEntry(env,room);if(prior)return prior;
 const userIds=room.members.map(m=>Number(m.id)).sort((a,b)=>a-b);
 if(userIds.length!==3||new Set(userIds).size!==3)throw Error('Invalid cooperative entry members');
 await ensureJointAtomicSchema(env);
 for(let attempt=0;attempt<4;attempt++){
  const replay=await readCoopEntry(env,room);if(replay)return replay;
  const configRaw=await read(env,COOP_SETTINGS_KEY),config=configRaw===null?{mode:'TEST'}:JSON.parse(configRaw);
  if(config.mode==='OFF')fail('CLOSED','격전지가 운영 중지되어 출전할 수 없습니다.');
  const charged=room.rewardPolicy?.mode==='ON';
  if(charged&&config.mode!=='ON')fail('CLOSED','격전지 운영 모드가 변경되어 다시 준비해야 합니다.');
  const balances=[];
  if(charged)for(const id of userIds){
   const before=await load(env,id,at);
   if(before.energy.current<1)fail('ENERGY_EMPTY',`${room.members.find(m=>m.id===id)?.name||'참가자'}님의 행동력이 부족합니다. 3시간마다 1회 충전됩니다.`);
   balances.push({id,...before});
  }
  const token=crypto.randomUUID(),energies={},statements=[];
  for(const before of balances){
   const next={...before.energy,current:before.energy.current-1},raw=JSON.stringify({...next,token});
   statements.push(p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,before.key,before.raw),jointGuard(env.DB,token+':'+before.id,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[before.key,raw]),jointGuardEnd(env.DB,token+':'+before.id));
   energies[before.id]=contentEnergyView(next,{at,maximum:COOP_ENERGY_MAXIMUM});
  }
  const receipt={version:1,roomId:room.id,creationRequest:room.creationRequest,userIds,charged,at,energies};
  try{
   await env.DB.batch([p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',coopEntryKey(room.id),JSON.stringify(receipt)),jointGuard(env.DB,token,configRaw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',configRaw===null?[COOP_SETTINGS_KEY]:[COOP_SETTINGS_KEY,configRaw]),...statements,jointGuardEnd(env.DB,token)]);
   return receipt;
  }catch(error){
   const saved=await readCoopEntry(env,room);if(saved)return saved;
   let changed=await read(env,COOP_SETTINGS_KEY)!==configRaw;
   for(const before of balances)if(await read(env,before.key)!==before.raw)changed=true;
   if(!changed)throw error;
  }
 }
 fail('ENERGY_BUSY','행동력을 갱신 중입니다. 잠시 후 다시 준비해 주세요.');
}
