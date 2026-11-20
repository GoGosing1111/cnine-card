import {COW_TICKETS} from '../shared/legion-cow-room.mjs';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const COW_DRAW_KEY='legion_cow_draw_seed_v1';
const sql=(db,query,...args)=>db.prepare(query).bind(...args);
const utf8=new TextEncoder();
let lastSeed,signingKey;
async function drawKey(seed){
  if(seed===lastSeed)return signingKey;
  const key=await crypto.subtle.importKey('raw',utf8.encode(seed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  lastSeed=seed;signingKey=key;return key;
}

// A keyed draw stays identical across retries. Misses need no per-battle row.
// Only the server's settled battle identity enters the draw.
export async function cowTicketOutcome(env,userId,source,eventId){
  let seed=readRuntimeData(env,COW_DRAW_KEY);
  if(seed===undefined){
    seed=(await sql(env.DB,'SELECT value FROM app_meta WHERE key=?',COW_DRAW_KEY).first())?.value||null;
    cacheRuntimeData(env,COW_DRAW_KEY,seed,seed?1800000:5000);
  }
  if(!seed)return null;
  const identity=JSON.stringify([Number(userId),source,String(eventId)]);
  const hash=new DataView(await crypto.subtle.sign('HMAC',await drawKey(seed),utf8.encode(identity)));
  // Each ticket has exactly one winning bucket in 400; discard the uneven tail.
  for(let i=0;i<hash.byteLength;i+=4){
    const value=hash.getUint32(i);
    if(value>=4294967200)continue;
    const bucket=value%400;
    return bucket<2?COW_TICKETS[bucket?'party':'solo']:null;
  }
  throw Error('Invalid cow ticket draw');
}

export async function cowTicketAward(env,userId,source,eventId,{guard='1=1',values=[]}={}){
  const ticket=await cowTicketOutcome(env,userId,source,eventId);
  if(!ticket)return {ticket:null,statements:[]};
  const db=env.DB,token=crypto.randomUUID();
  const digest=await crypto.subtle.digest('SHA-256',utf8.encode(String(eventId)));
  const key='legion-cow:drop:'+userId+':'+source+':'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  const receipt=ticket.code+'/'+token,won='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  return {ticket:{...ticket,acquisitionId:key},statements:[
    sql(db,'INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE '+guard+' ON CONFLICT(key) DO NOTHING',key,receipt,...values),
    sql(db,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE '+won+' ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,unseen_quantity=cnine_user_inventory.unseen_quantity+1,updated_at=CURRENT_TIMESTAMP',userId,ticket.code,key,receipt),
    sql(db,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,1,quantity,?,'LEGION_COW_DROP',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND "+won,source+' · 카우방 입장권',String(eventId),userId,ticket.code,key,receipt)
  ]};
}

export async function cowTicketCount(db,userId,kind){
  const row=await sql(db,'SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',userId,COW_TICKETS[kind].code).first();
  return Number(row?.quantity||0);
}
export async function requireCowTicket(db,userId,kind){
  if(await cowTicketCount(db,userId,kind)<1)throw jointError('HUNT_COW_TICKET',COW_TICKETS[kind].name+' 1장이 필요합니다.',409);
}
// Called in the same guarded transaction as the transition to active combat.
export function spendCowTicket(db,userId,kind,runId){
  const {code}=COW_TICKETS[kind],token=crypto.randomUUID();
  return [
    jointGuard(db,token,'EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1)',[userId,code]),
    sql(db,'UPDATE cnine_user_inventory SET quantity=quantity-1,unseen_quantity=MIN(unseen_quantity,quantity-1),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=1',userId,code),
    sql(db,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,-1,quantity,'카우방 출전','LEGION_COW_ENTRY',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",runId,userId,code),
    jointGuardEnd(db,token)
  ];
}
