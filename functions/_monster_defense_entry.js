import {DEFENSE_KEY,DEFENSE_DAILY_ENTRY_LIMIT,validDefenseRoom} from '../shared/monster-defense-v1.mjs';
import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';

const p=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const read=async(env,key)=>(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
const fail=(code,message)=>{throw Object.assign(Error(message),{code:'DEFENSE_ENTRY_'+code,status:409});};
export const defenseDailyEntryKey=id=>'monster_defense_daily_entry_v1:'+Number(id);
export const defenseEntryReceiptKey=id=>'monster_defense_entry_receipt_v1:'+id;
export function defenseEntryDay(at=Date.now()){
 const day=new Date(at+9*3600000).toISOString().slice(0,10);
 return {day,resetAt:Date.parse(day+'T00:00:00+09:00')+86400000};
}
export function defenseDailyEntryView(raw,at=Date.now()){
 const period=defenseEntryDay(at),stored=raw===null?null:JSON.parse(raw);
 if(stored&&(stored.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(stored.day)||!Number.isSafeInteger(stored.used)||stored.used<0||stored.used>DEFENSE_DAILY_ENTRY_LIMIT))throw Error('Invalid defense daily entry record');
 if(stored?.day>period.day)throw Error('Defense daily entry clock moved backwards');
 const used=stored?.day===period.day?stored.used:0;
 return {...period,limit:DEFENSE_DAILY_ENTRY_LIMIT,used,remaining:DEFENSE_DAILY_ENTRY_LIMIT-used,serverNow:at};
}
export async function readDefenseDailyEntry(env,userId,at=Date.now()){
 return defenseDailyEntryView(await read(env,defenseDailyEntryKey(userId)),at);
}
export async function assertDefenseDailyEntry(env,userId){
 const quota=await readDefenseDailyEntry(env,userId);
 if(quota.remaining===0)fail('EMPTY','오늘 디펜스 참여 횟수 3회를 모두 사용했습니다. 한국시간 00:00에 초기화됩니다.');
 return quota;
}
export async function readDefenseEntry(env,room){
 const raw=await read(env,defenseEntryReceiptKey(room.id));if(raw===null)return null;
 const receipt=JSON.parse(raw),userIds=room.players.filter(p=>!p.bot).map(p=>Number(p.id)).sort((a,b)=>a-b);
 if(receipt.creationRequest!==room.creationRequest||receipt.createdAt!==room.createdAt||JSON.stringify(receipt.userIds)!==JSON.stringify(userIds))throw Error('Defense daily entry receipt collision');
 return receipt;
}
// A durable start intent precedes this single transaction. Either every real
// participant spends one attempt or nobody does; receipt replay survives a lost
// response, midnight, DO restart and concurrent attempts in different rooms.
export async function spendDefenseDailyEntry(env,room,at){
 if(room.operatingMode!=='ON'||room.practice)return {version:1,charged:false};
 const ids=room.players.filter(p=>!p.bot).map(p=>Number(p.id)).sort((a,b)=>a-b);
 if(!validDefenseRoom(room.id)||!room.creationRequest||!room.entryPending||room.phase!=='PREP'||room.accountRoster!==true||![2,3].includes(room.capacity)||ids.length!==room.capacity||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('Invalid defense daily entry proof');
 const prior=await readDefenseEntry(env,room);if(prior)return prior;
 await ensureJointAtomicSchema(env);
 for(let attempt=0;attempt<4;attempt++){
  const replay=await readDefenseEntry(env,room);if(replay)return replay;
  const now=at??Date.now(),keys=[DEFENSE_KEY,...ids.map(defenseDailyEntryKey)],rows=(await p(env,`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`,...keys).all()).results,values=new Map(rows.map(r=>[r.key,r.value]));
  const settingsRaw=values.get(DEFENSE_KEY)??null;if(settingsRaw===null||JSON.parse(settingsRaw).mode!=='ON')fail('CLOSED','디펜스 운영 상태가 변경됐습니다. 현재 설정을 다시 확인하세요.');
  const token=crypto.randomUUID(),quotas={},statements=[];
  for(const id of ids){
   const key=defenseDailyEntryKey(id),raw=values.get(key)??null,before=defenseDailyEntryView(raw,now);
   if(before.remaining===0)fail('EMPTY',`${room.players.find(p=>Number(p.id)===id)?.name||'참가자'}님의 오늘 디펜스 참여 횟수가 0회입니다. 한국시간 00:00에 초기화됩니다.`);
   const next=JSON.stringify({version:1,day:before.day,used:before.used+1,token});
   statements.push(raw===null?p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',key,next):p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',next,key,raw),jointGuard(env.DB,token+':'+id,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,next]),jointGuardEnd(env.DB,token+':'+id));
   quotas[id]=defenseDailyEntryView(next,now);
  }
  const receipt={version:1,roomId:room.id,creationRequest:room.creationRequest,createdAt:room.createdAt,userIds:ids,charged:true,at:now,day:defenseEntryDay(now).day,quotas};
  try{
   await env.DB.batch([p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',defenseEntryReceiptKey(room.id),JSON.stringify(receipt)),jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[DEFENSE_KEY,settingsRaw]),...statements,jointGuardEnd(env.DB,token)]);
   return receipt;
  }catch(error){
   const saved=await readDefenseEntry(env,room);if(saved)return saved;
   const fresh=(await p(env,`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`,...keys).all()).results,actual=new Map(fresh.map(r=>[r.key,r.value]));
   if(keys.every(key=>(actual.get(key)??null)===(values.get(key)??null)))throw error;
  }
 }
 throw Object.assign(Error('디펜스 참여 횟수를 확인 중입니다. 잠시 후 다시 연결해 주세요.'),{status:503,code:'DEFENSE_ENTRY_BUSY'});
}
