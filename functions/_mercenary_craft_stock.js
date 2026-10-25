import {mercenaryCraftDefinition,mercenaryCraftDraft} from '../shared/mercenary-craft-v1.mjs';
import {isLimitedShardCraft,LIMITED_CRAFT_STOCK_STEP,LIMITED_CRAFT_STOCK_MAX} from '../shared/mercenary-limited-shard-craft-v1.mjs';
import {readMercenaryCraft,readMercenaryCraftStock,ensureCraftAccounting} from './_mercenary_craft.js';

const conflict=()=>Object.assign(Error('제작 설정이 변경되었습니다. 새로고침 후 다시 추가하세요.'),{status:409});
const receiptPrefix='mercenary_limited_shard_stock_receipt_v1:';
export async function addLimitedShardCraftStock(env,admin,body){
 if(admin?.role!=='OWNER')throw Object.assign(Error('OWNER만 발행 한도를 추가할 수 있습니다.'),{status:403});
 if(!body||Object.keys(body).sort().join(',')!=='code,expectedRevision,requestId'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[A-Za-z0-9-]{16,100}$/.test(body.requestId))throw Object.assign(Error('제작 코드·현재 버전·요청 번호를 확인하세요.'),{status:400});
 const definition=mercenaryCraftDefinition(body.code);
 if(!isLimitedShardCraft(definition))throw Object.assign(Error('SSS 리미티드 조각 전용 발행 수량만 추가할 수 있습니다.'),{status:400});
 const receiptKey=receiptPrefix+body.requestId,payload=JSON.stringify({actor:Number(admin.id),code:body.code,expectedRevision:body.expectedRevision,requestId:body.requestId});
 const replay=async()=>{
  const r=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
  if(!r)return null;const saved=JSON.parse(r.value);
  if(saved.payload!==payload)throw Object.assign(Error('같은 요청 번호에 다른 추가 내용이 포함되었습니다.'),{status:409});
  return {...saved.result,replayed:true};
 };
 const previous=await replay();if(previous)return previous;
 const before=await readMercenaryCraft(env,definition);
 if(before.policy.revision!==body.expectedRevision)throw conflict();
 if(before.policy.stockLimit>LIMITED_CRAFT_STOCK_MAX-LIMITED_CRAFT_STOCK_STEP)throw Object.assign(Error('발행 한도 상한에 도달했습니다.'),{status:409});
 await ensureCraftAccounting(env);
 const base=before.value??JSON.stringify(mercenaryCraftDraft(definition));
 await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(definition.key,base).run();
 const next={...before.policy,revision:before.policy.revision+1,stockLimit:before.policy.stockLimit+LIMITED_CRAFT_STOCK_STEP};
 const result={code:definition.recipeCode,added:LIMITED_CRAFT_STOCK_STEP,limit:next.stockLimit,revision:next.revision};
 const p=(sql,...args)=>env.DB.prepare(sql).bind(...args),guard=crypto.randomUUID(),list=[];
 if(env.DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',definition.key));
 list.push(
  p('INSERT INTO mercenary_card_atomic_guard_v1(id,verified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?) THEN 1 ELSE 0 END',guard,definition.key,base,receiptKey),
  p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(next),definition.key),
  p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'MERCENARY_LIMITED_SHARD_STOCK_ADD','MERCENARY',definition.code,base,JSON.stringify({...next,added:LIMITED_CRAFT_STOCK_STEP,requestId:body.requestId})),
  p('INSERT INTO app_meta(key,value) VALUES(?,?)',receiptKey,JSON.stringify({payload,result})),
  p('DELETE FROM mercenary_card_atomic_guard_v1 WHERE id=?',guard)
 );
 try{await env.DB.batch(list);}catch(error){
  const saved=await replay();if(saved)return saved;
  if((await readMercenaryCraft(env,definition)).value!==base)throw conflict();
  throw error;
 }
 return {...result,replayed:false,stock:await readMercenaryCraftStock(env,definition,next)};
}
