// One-time correction of the S-BODY choice-payment attempt. The original
// craft receipt remains immutable, and a separate receipt records its refund.
export const S_BODY_REFUND_KEY='ops:s-body-choice-payment-refund:20260930:user4614:v1';
const USER_ID=4614,RECIPE_ID=521,COIN=100000000000,CORE_CODE='SUIT_CORE_5',CORES=10;
const REASON='WORKSHOP_S_BODY_POLICY_REFUND_20260930';
const exact=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('잔액을 안전하게 확인할 수 없습니다.');return n};
const eq=(actual,expected,message)=>{if(actual!==expected)throw new Error(message)};
const parse=value=>{try{return JSON.parse(value)}catch{return null}};

export async function inspectSBodyRefund(env,logId){
  const id=Number(logId);
  if(!Number.isSafeInteger(id)||id<1)throw new Error('제작 기록 번호가 올바르지 않습니다.');
  const DB=env.DB;
  const [saved,log,user,item]=await Promise.all([
    DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(S_BODY_REFUND_KEY).first(),
    DB.prepare('SELECT * FROM workshop_craft_logs_v1668 WHERE id=?').bind(id).first(),
    DB.prepare('SELECT id,nickname,status,coin FROM users WHERE id=?').bind(USER_ID).first(),
    DB.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(USER_ID,CORE_CODE).first()
  ]);
  if(!log)throw new Error('대상 제작 기록이 없습니다.');
  eq(Number(log.user_id),USER_ID,'대상 계정이 다릅니다.');
  eq(Number(log.recipe_id),RECIPE_ID,'대상 레시피가 다릅니다.');
  eq(log.category,'BATTLE_SUIT_CRAFT','대상 제작 종류가 다릅니다.');
  eq(log.output_type,'EQUIPMENT','대상 결과 종류가 다릅니다.');
  eq(String(log.output_ref),'47','대상 결과 장비가 다릅니다.');
  eq(log.payment_type,'COIN','선택 결제 거래가 아닙니다.');
  eq(Number(log.coin_spent),COIN,'차감된 코인 금액이 다릅니다.');
  eq(Number(log.master_star_spent),0,'별 차감 내역이 있어 수동 검토가 필요합니다.');
  eq(Number(log.success),0,'성공한 제작은 이 환급 대상이 아닙니다.');
  eq(String(log.created_at).startsWith('2026-09-29 18:38:'),true,'대상 제작 시각이 다릅니다.');
  eq(user?.nickname,'공단','대상 계정 이름이 다릅니다.');
  eq(user?.status,'ACTIVE','대상 계정 상태가 다릅니다.');
  if(!item)throw new Error('슈트 코어 5 보유 행이 없습니다.');
  const receipt=await DB.prepare('SELECT status,payment_type,result_json FROM workshop_craft_receipts_v1668 WHERE request_id=? AND user_id=?').bind(log.request_id,USER_ID).first();
  eq(receipt?.status,'COMPLETED','원본 제작 영수증 상태가 다릅니다.');
  eq(receipt?.payment_type,'COIN','원본 제작 영수증 결제 방식이 다릅니다.');
  const result=parse(receipt.result_json);
  eq(result?.requestId,log.request_id,'원본 영수증 요청 번호가 다릅니다.');
  eq(result?.success,false,'원본 영수증은 실패가 아닙니다.');
  eq(result?.coinSpent,COIN,'원본 영수증 차감 금액이 다릅니다.');
  eq(result?.masterStarSpent,0,'원본 영수증에 별 차감이 있습니다.');
  eq(result?.attempts,1,'원본 제작 회수가 다릅니다.');
  const materials=await DB.prepare("SELECT item_code,change_amount,reference_type FROM inventory_logs WHERE user_id=? AND reference_id=? AND reason='WORKSHOP_MATERIAL'").bind(USER_ID,log.request_id).all();
  eq(materials.results?.length,1,'원본 재료 차감 기록 수가 다릅니다.');
  eq(materials.results[0].item_code,CORE_CODE,'원본 재료가 다릅니다.');
  eq(Number(materials.results[0].change_amount),-CORES,'원본 재료 차감 수량이 다릅니다.');
  eq(materials.results[0].reference_type,'WORKSHOP','원본 재료 참조가 다릅니다.');
  const coinDebits=await DB.prepare("SELECT id,created_at FROM coin_logs WHERE user_id=? AND reason='WORKSHOP_PAYMENT' AND change_amount=? ORDER BY id DESC LIMIT 20").bind(USER_ID,-COIN).all();
  const originalTime=Date.parse(String(log.created_at).replace(' ','T')+'Z');
  if(!(coinDebits.results||[]).some(row=>Math.abs(Date.parse(String(row.created_at).replace(' ','T')+'Z')-originalTime)<=60000))throw new Error('원본 코인 차감 기록을 확인할 수 없습니다.');
  return {logId:id,requestId:log.request_id,userId:USER_ID,nickname:user.nickname,coinBefore:exact(user.coin),coreBefore:exact(item.quantity),unseenBefore:exact(item.unseen_quantity),saved:parse(saved?.value)};
}

export async function refundSBodyChoiceAttempt(env,admin,logId){
  if(String(admin?.role).toUpperCase()!=='OWNER')throw new Error('OWNER만 환급할 수 있습니다.');
  const before=await inspectSBodyRefund(env,logId);
  if(before.saved){
    eq(before.saved.operationKey,S_BODY_REFUND_KEY,'기존 환급 기록이 다릅니다.');
    eq(before.saved.logId,before.logId,'이미 다른 제작 기록을 환급했습니다.');
    eq(before.saved.status,'COMPLETED','기존 환급 처리를 확인해야 합니다.');
    return {...before.saved,replayed:true};
  }
  const coinAfter=exact(before.coinBefore+COIN),coreAfter=exact(before.coreBefore+CORES),unseenAfter=exact(before.unseenBefore+CORES);
  const receipt={status:'COMPLETED',operationKey:S_BODY_REFUND_KEY,logId:before.logId,requestId:before.requestId,userId:USER_ID,nickname:'공단',coinRefunded:COIN,coreCode:CORE_CODE,coresRefunded:CORES,coinBefore:before.coinBefore,coinAfter,coreBefore:before.coreBefore,coreAfter,unseenBefore:before.unseenBefore,unseenAfter,reason:'S-BODY 선택 결제 오류 기간의 실패 시도 취소',completedAt:new Date().toISOString()};
  const DB=env.DB,statements=[
    DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'PENDING',CURRENT_TIMESTAMP)").bind(S_BODY_REFUND_KEY),
    ...(DB.dialect==='postgres'?[DB.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(USER_ID),DB.prepare('SELECT user_id FROM cnine_user_inventory WHERE user_id=? AND item_code=? FOR UPDATE').bind(USER_ID,CORE_CODE)]:[]),
    DB.prepare('UPDATE users SET coin=coin+? WHERE id=? AND coin=?').bind(COIN,USER_ID,before.coinBefore),
    DB.prepare('UPDATE cnine_user_inventory SET quantity=quantity+?,unseen_quantity=unseen_quantity+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity=? AND unseen_quantity=?').bind(CORES,CORES,USER_ID,CORE_CODE,before.coreBefore,before.unseenBefore),
    DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) SELECT ?,?,coin,?,? FROM users WHERE id=?').bind(USER_ID,COIN,REASON,admin.id,USER_ID),
    DB.prepare('INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) SELECT ?,?,?,quantity,?,?,?,? FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(USER_ID,CORE_CODE,CORES,REASON,'WORKSHOP_REFUND',before.requestId,admin.id,USER_ID,CORE_CODE),
    DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'OPS_S_BODY_CHOICE_REFUND','USER',?,?,?)").bind(admin.id,String(USER_ID),JSON.stringify(before),JSON.stringify(receipt)),
    DB.prepare([
      'UPDATE app_meta SET value=CASE WHEN',
      '(SELECT coin FROM users WHERE id=?)=?',
      'AND (SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?)=?',
      'AND (SELECT unseen_quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?)=?',
      'AND (SELECT count(*) FROM coin_logs WHERE user_id=? AND reason=? AND change_amount=?)=1',
      "AND (SELECT count(*) FROM inventory_logs WHERE user_id=? AND reason=? AND reference_type='WORKSHOP_REFUND' AND reference_id=? AND change_amount=?)=1",
      'THEN ? ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE key=?'
    ].join(' ')).bind(USER_ID,coinAfter,USER_ID,CORE_CODE,coreAfter,USER_ID,CORE_CODE,unseenAfter,USER_ID,REASON,COIN,USER_ID,REASON,before.requestId,CORES,JSON.stringify(receipt),S_BODY_REFUND_KEY)
  ];
  try{await DB.batch(statements)}
  catch(error){
    const saved=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(S_BODY_REFUND_KEY).first();
    const prior=parse(saved?.value);
    if(prior?.status==='COMPLETED'&&prior.logId===before.logId)return {...prior,replayed:true};
    throw error;
  }
  const [saved,coin,item,coinLog,itemLog]=await Promise.all([
    DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(S_BODY_REFUND_KEY).first(),
    DB.prepare('SELECT coin FROM users WHERE id=?').bind(USER_ID).first(),
    DB.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(USER_ID,CORE_CODE).first(),
    DB.prepare('SELECT id FROM coin_logs WHERE user_id=? AND reason=?').bind(USER_ID,REASON).all(),
    DB.prepare("SELECT id FROM inventory_logs WHERE user_id=? AND reason=? AND reference_type='WORKSHOP_REFUND' AND reference_id=?").bind(USER_ID,REASON,before.requestId).all()
  ]);
  eq(parse(saved?.value)?.operationKey,S_BODY_REFUND_KEY,'환급 영수증 저장을 확인하지 못했습니다.');
  eq(Number(coin?.coin),coinAfter,'코인 환급 잔액을 확인하지 못했습니다.');
  eq(Number(item?.quantity),coreAfter,'코어 환급 수량을 확인하지 못했습니다.');
  eq(coinLog.results?.length,1,'코인 환급 장부를 확인하지 못했습니다.');
  eq(itemLog.results?.length,1,'코어 환급 장부를 확인하지 못했습니다.');
  return {...receipt,replayed:false};
}
