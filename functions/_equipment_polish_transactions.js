import {POLISH_KEY,POLISH_ITEM_CODE,polishPreviewResult} from '../shared/equipment-polish-v1.mjs';
import {polishStateKey,decodePolishState} from './_equipment_growth.js';
import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
const instanceValid=id=>typeof id==='string'&&/^[1-9][0-9]{0,18}$/.test(id)&&BigInt(id)<=9223372036854775807n;
const requestValid=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(id);
const receiptKey=(user,id)=>`equipment_polish_receipt_v1:${user}:${id}`;
export async function polishQuote(env,user,current,body){
  const {settings}=current;
  if(!instanceValid(body.instanceId))throw jointError('POLISH_INPUT','장비를 선택하세요.');
  if(body.revision!==settings.revision)throw jointError('POLISH_CONFLICT','연마 설정이 변경됐습니다. 다시 확인하세요.',409);
  const [item,row]=await Promise.all([
    env.DB.prepare('SELECT x.id,i.code,i.name,i.slot FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.is_active=1 AND i.is_public=1').bind(body.instanceId,user.id).first(),
    env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(polishStateKey(body.instanceId,user.id)).first()
  ]);
  if(!item||!settings.slots.includes(item.slot))throw jointError('POLISH_NOT_OWNED','연마할 수 있는 보유 장비를 선택하세요.',404);
  const state=decodePolishState(row?.value,body.instanceId,user.id),cost=settings.costs[state.attempts];
  if(!cost)throw jointError('POLISH_COMPLETE','이 장비의 연마를 모두 완료했습니다.',409);
  if(state.levels.some((n,i)=>n>settings.options[i].maxLevel))throw jointError('POLISH_POLICY_CHANGED','기존 연마 단계보다 낮아진 설정을 확인하세요.',409);
  return {instanceId:body.instanceId,name:item.name,revision:settings.revision,state,cost,raw:row?.value??null};
}
export async function polishReceipt(env,user,requestId){
  if(!requestValid(requestId))throw jointError('POLISH_REQUEST','연마 요청 번호를 확인하세요.');
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey(user.id,requestId)).first();
  return row?JSON.parse(row.value):null;
}
export async function executePolish(env,user,current,body,{unit}={}){
  if(!requestValid(body.requestId)||!instanceValid(body.instanceId)||!Number.isInteger(body.expectedAttempts)||body.expectedAttempts<0)throw jointError('POLISH_REQUEST','장비와 연마 요청을 확인하세요.');
  const previous=await polishReceipt(env,user,body.requestId);
  const same=receipt=>receipt.instanceId===body.instanceId&&receipt.beforeAttempts===body.expectedAttempts&&receipt.revision===body.revision;
  if(previous){if(!same(previous))throw jointError('POLISH_REQUEST_CONFLICT','다른 연마에 사용한 요청 번호입니다.',409);return previous;}
  if(current.settings.executionMode!=='ON'||!current.settings.publicVisible)throw jointError('POLISH_OFF','장비 연마가 현재 닫혀 있습니다.',423);
  const quote=await polishQuote(env,user,current,body);
  if(quote.state.attempts!==body.expectedAttempts)throw jointError('POLISH_CONFLICT','장비가 이미 연마됐습니다. 최신 상태를 확인하세요.',409);
  if(unit===undefined){const n=new Uint32Array(1);crypto.getRandomValues(n);unit=n[0]/4294967296;}
  const roll=polishPreviewResult(current.settings,quote.state.levels,unit),values=[...quote.state.values];
  values[roll.selected]=Math.round((values[roll.selected]+current.settings.options[roll.selected].increment)*100)/100;
  const next={...quote.state,attempts:quote.state.attempts+1,levels:roll.levels,values},stateRaw=JSON.stringify(next),key=polishStateKey(body.instanceId,user.id),rkey=receiptKey(user.id,body.requestId),db=env.DB;
  const receipt={requestId:body.requestId,instanceId:body.instanceId,name:quote.name,revision:body.revision,beforeAttempts:quote.state.attempts,selected:roll.selected,before:roll.before,after:roll.after,beforeValues:quote.state.values,levels:roll.levels,values,total:next.attempts,state:next,cost:quote.cost,previewOnly:false,createdAt:new Date().toISOString()};
  const token=crypto.randomUUID(),c=quote.cost;
  const conditions=[`EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)`,`EXISTS(SELECT 1 FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.is_active=1 AND i.is_public=1)`,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)`,`NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)`,quote.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',`EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)`];
  const params=[user.id,c.coins,body.instanceId,user.id,POLISH_KEY,current.raw,rkey,key,...(quote.raw===null?[]:[quote.raw]),user.id,POLISH_ITEM_CODE,c.stones];
  if(c.masterStars){conditions.push('EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)');params.push(user.id,'MASTER_STAR',c.masterStars);}
  const statements=[
    jointGuard(db,token,conditions.join(' AND '),params),
    db.prepare('UPDATE users SET coin=coin-? WHERE id=?').bind(c.coins,user.id),
    db.prepare('UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=?').bind(c.stones,c.stones,user.id,POLISH_ITEM_CODE),
    ...(c.masterStars?[db.prepare('UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=?').bind(c.masterStars,c.masterStars,user.id,'MASTER_STAR')]:[]),
    ...[[POLISH_ITEM_CODE,c.stones],...(c.masterStars?[['MASTER_STAR',c.masterStars]]:[])].map(([code,quantity])=>db.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'장비 연마','EQUIPMENT_POLISH',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(-quantity,body.requestId,user.id,code)),
    db.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(key,stateRaw),
    db.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(rkey,JSON.stringify(receipt)),jointGuardEnd(db,token)
  ];
  if(db.dialect==='postgres')statements.unshift(db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(user.id));
  try{await db.batch(statements);}catch{const prior=await polishReceipt(env,user,body.requestId);if(prior&&same(prior))return prior;throw jointError('POLISH_RETRY','연마를 완료하지 못했습니다. 재료·잔액과 최신 장비 상태를 확인한 뒤 같은 요청으로 다시 확인하세요.',409);}
  return receipt;
}
