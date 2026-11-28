import {operationTiers} from '../shared/field-operation-tiers.mjs';
import {coinCreditLimit,coinValue} from '../shared/coin-integer-v1.mjs';
import {buildFieldOperation} from './_field_operation_battle.js';
import {accountRankAward,accountRankBenefits} from './_account_rank.js';
import {readScrapyardSettings,ensureScrapyardFoundation,scrapyardDayRange} from './_scrapyard.js';
import {ensureEscortSchema,readEscortSettings,escortWeekKey} from './_escort_operation.js';
import {loadScrapyardV3Snapshot} from './_scrapyard_v3.js';
import {SCRAPYARD_V3_OPERATION_TABLE} from './_scrapyard_v3_runs.js';
import {encodeScrapyardRecord,decodeScrapyardRecord} from './_scrapyard_v3_record.js';
import {jointError,readJointBody} from './_joint_request.js';

const yardRuns='scrapyard_runs_v1676', yardReceipts='scrapyard_run_receipts_v1676';
const escortRuns='pve_escort_runs_v1830', escortReceipts='pve_escort_action_receipts_v1830', weekly='pve_escort_weekly_v1830';
const activeEscort="('ACTIVE','COMPLETED_PENDING','CLAIMING')";
const materials=[
  ['SCRAPYARD_SALVAGE_METAL','고철','폐차장에서 회수한 금속 재료입니다.','/assets/ui/workshop/vehicle-part-engine-v1668.png',1976],
  ['SCRAPYARD_HYDRAULIC_FRAME','유압 프레임','아틀라스에서 회수한 유압 장치의 프레임입니다.','/assets/ui/workshop/vehicle-part-frame-v1668.png',1977]
];
const p=(db,sql,...values)=>db.prepare(sql).bind(...values);
const stamp=at=>new Date(at).toISOString().replace('T',' ').slice(0,19);
const err=(code,message,status=409)=>jointError('PVE_V3_'+code,message,status);

function receiptKey(user,mode,requestId) {
  if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId))throw err('REQUEST','작전 요청 번호를 확인하세요.',400);
  return 'FO7:'+mode+':'+user.id+':'+requestId;
}

async function readReceipt(db,mode,uid,rid) {
  const table=mode==='yard'?yardReceipts:escortReceipts;
  const row=await p(db,`SELECT response_json FROM ${table} WHERE user_id=? AND request_id=? AND status='COMPLETED'`,uid,rid).first();
  return row?.response_json ? decodeScrapyardRecord(row.response_json) : null;
}

function replay(result,tier) {
  if(tier && result.tier.id!==tier)throw err('REQUEST_USED','이미 다른 난이도로 진행한 요청입니다.');
  return {...result,replayed:true};
}

function admission(mode,user,cfg,at) {
  const uid=user.id, owner=String(user.role).toUpperCase()==='OWNER';
  if(cfg.mode!=='ON'&&!(cfg.mode==='TEST'&&owner))throw err('CLOSED','현재 작전에 입장할 수 없습니다.',403);
  if(mode==='yard'){
    const {start,end}=scrapyardDayRange(at);
    const limits=owner?[]:[{sql:`(SELECT COUNT(*) FROM ${yardRuns} WHERE user_id=? AND created_at>=? AND created_at<?)<?`,
      args:[uid,start,end,cfg.dailyRuns],message:'오늘의 폐차장 입장 횟수를 모두 사용했습니다.'}];
    return [...limits,{sql:`NOT EXISTS(SELECT 1 FROM ${SCRAPYARD_V3_OPERATION_TABLE} WHERE user_id=? AND state<>'COMPLETED')`,
      args:[uid],message:'진행 중인 폐차장 원정을 먼저 마무리하세요.'}];
  }
  const week=escortWeekKey(at);
  return [
    {sql:`NOT EXISTS(SELECT 1 FROM ${escortRuns} WHERE user_id=? AND status IN ${activeEscort})`,args:[uid],message:'진행 중인 호송작전을 먼저 마무리하세요.'},
    {sql:`NOT EXISTS(SELECT 1 FROM ${weekly} WHERE user_id=? AND week_key=? AND (started_count>=? OR reward_count>=?))`,
      args:[uid,week,cfg.weeklyRunLimit,cfg.weeklyRewardLimit],message:'이번 주 호송 출전 또는 보상 횟수를 모두 사용했습니다.'}
  ];
}

async function checkAdmission(db,checks) {
  const sql=checks.map((c,i)=>`CASE WHEN ${c.sql} THEN 1 ELSE 0 END AS ok${i}`).join(',');
  const row=await p(db,'SELECT '+sql,...checks.flatMap(c=>c.args)).first();
  for(const [i,c] of checks.entries())if(!Number(row['ok'+i]))throw err('ENTRY',c.message);
}

function rewardStatements(db,userId,rid,mode,s) {
  if(!s.won)return [];
  const label=mode==='yard'?'폐차장 회수 정산':'호송작전 운송 정산';
  const statements=[
    p(db,'UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=?',String(s.coin),userId),
    p(db,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,CAST(? AS BIGINT),coin,? FROM users WHERE id=?',String(s.coin),label,userId)
  ];
  const items=[['MASTER_STAR',s.masterStars]];
  if(mode==='yard'){
    for(const [code,name,description,image,sort] of materials){
      statements.push(p(db,"INSERT INTO inventory_items(code,name,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,'MATERIAL','EPIC',?,?,1) ON CONFLICT(code) DO NOTHING",code,name,description,image,sort));
    }
    items.push([materials[0][0],s.scrap],[materials[1][0],s.frames]);
  }
  for(const [code,quantity] of items){
    statements.push(
      p(db,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`,userId,code,quantity,quantity),
      p(db,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
        SELECT user_id,item_code,?,quantity,?,'FIELD_OPERATION_V3',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?`,quantity,label,rid,userId,code)
    );
  }
  return statements;
}

// The receipt, admission, ledger, inventory and rank updates share one DB transaction.
// An admission race trips the NOT NULL user_id constraint before any payout is made.
export async function settleFieldOperation(env,user,result,requestId,cfg,at=Date.now(),rankAward=accountRankAward) {
  const db=env.DB,uid=user.id,mode=result.mode,rid=receiptKey(user,mode,requestId),s=result.settlement;
  const checks=admission(mode,user,cfg,at);
  if(s.won)checks.push({sql:'EXISTS(SELECT 1 FROM users WHERE id=? AND coin<=CAST(? AS BIGINT))',
    args:[uid,coinCreditLimit(s.coin)],message:'코인 보유 한도를 초과해 입장 횟수와 보상을 정산할 수 없습니다.'});
  const guard=`CASE WHEN ${checks.map(c=>'('+c.sql+')').join(' AND ')} THEN CAST(? AS BIGINT) ELSE NULL END`;
  const args=[...checks.flatMap(c=>c.args),uid], now=stamp(at), won=s.won?1:0, tier=result.tier.id;
  const response={...result,ok:true,requestId,engineVersion:'FIELD_OPERATIONS_V3',difficulty:tier};
  const stored=await encodeScrapyardRecord(response), statements=[];
  if(db.dialect==='postgres')statements.push(p(db,'SELECT id FROM users WHERE id=? FOR UPDATE',uid));
  if(mode==='yard'){
    statements.push(
      p(db,`INSERT INTO ${yardReceipts}(request_id,user_id,difficulty,status,ticket_consumed,response_json,created_at,updated_at)
        VALUES(?,${guard},?,'COMPLETED',0,?,?,?)`,rid,...args,tier,stored,now,now),
      p(db,`INSERT INTO ${yardRuns}(request_id,user_id,difficulty,deck_power,waves_total,waves_cleared,success,rewards_json,created_at)
        VALUES(?,?,?,?,2,?,?,?,?)`,rid,uid,tier,result.deckPower,s.defeated,won,JSON.stringify({coin:s.coin,masterStars:s.masterStars,scrap:s.scrap,frames:s.frames}),now)
    );
  }else{
    const week=escortWeekKey(at);
    statements.push(
      p(db,`INSERT INTO ${escortRuns}(run_id,user_id,week_key,status,sector_index,vehicle_hp,vehicle_max_hp,deck_snapshot,state_json,reward_coin,started_at,updated_at,completed_at,claimed_at)
        VALUES(?,${guard},?,?,0,?,100,'[]',?,?,?,?,?,?)`,rid,...args,week,s.won?'CLAIMED':'FAILED',s.hull,
        JSON.stringify({tier,grade:s.grade,cargo:s.cargo,clearedSectors:won}),String(s.coin),now,now,now,s.won?now:null),
      p(db,`INSERT INTO ${escortReceipts}(request_id,user_id,run_id,action_type,status,response_json,created_at,updated_at)
        VALUES(?,?,?,'OPERATION_V3','COMPLETED',?,?,?)`,rid,uid,rid,stored,now,now),
      p(db,`INSERT INTO ${weekly}(user_id,week_key,started_count,completed_count,reward_count,best_vehicle_hp_percent,updated_at)
        VALUES(?,?,1,?,?,?,?) ON CONFLICT(user_id,week_key) DO UPDATE SET started_count=${weekly}.started_count+1,
        completed_count=${weekly}.completed_count+excluded.completed_count,reward_count=${weekly}.reward_count+excluded.reward_count,
        best_vehicle_hp_percent=CASE WHEN ${weekly}.best_vehicle_hp_percent<excluded.best_vehicle_hp_percent THEN excluded.best_vehicle_hp_percent ELSE ${weekly}.best_vehicle_hp_percent END,updated_at=excluded.updated_at`,
        uid,week,won,won,s.won?s.hull:0,now)
    );
  }
  statements.push(...rewardStatements(db,uid,rid,mode,s));
  if(mode==='yard'||s.won)statements.push(...await rankAward(env,uid,mode==='yard'?'SCRAPYARD':'ESCORT',rid));
  try{await db.batch(statements);}catch(error){
    const previous=await readReceipt(db,mode,uid,rid);
    if(previous)return replay(previous,tier);
    await checkAdmission(db,checks);
    throw error;
  }
  return response;
}

export async function handleFieldOperation({path,request,env,deps,user}) {
  const {json,withUserMutationLock}=deps, mode=path.startsWith('scrapyard/')?'yard':'escort';
  if(!['GET','POST'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
  const response=async result=>{
    const row=await p(env.DB,"SELECT CAST(coin AS TEXT) AS coin,CAST(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=users.id AND item_code='MASTER_STAR'),0) AS TEXT) AS stars FROM users WHERE id=?",user.id).first();
    return json({...result,balances:{coin:coinValue(row.coin),masterStars:coinValue(row.stars)}});
  };
  const body=request.method==='GET'?{requestId:new URL(request.url).searchParams.get('requestId')}:await readJointBody(request,{fields:['requestId','tier']});
  const rid=receiptKey(user,mode,body.requestId);
  if(mode==='yard')await ensureScrapyardFoundation(env);else await ensureEscortSchema(env);
  const existing=await readReceipt(env.DB,mode,user.id,rid);
  if(existing)return response(replay(existing,body.tier));
  if(request.method==='GET')throw err('NO_RECEIPT','해당 작전 기록이 없습니다.',404);
  const tier=operationTiers.find(t=>t.id===body.tier);
  if(!tier)throw err('TIER','난이도를 확인하세요.',400);
  return withUserMutationLock(env,user.id,path,async()=>{
    const previous=await readReceipt(env.DB,mode,user.id,rid);
    if(previous)return response(replay(previous,tier.id));
    const cfg=mode==='yard'?await readScrapyardSettings(env,{fresh:true}):await readEscortSettings(env);
    const at=Date.now();
    await checkAdmission(env.DB,admission(mode,user,cfg,at));
    const benefits=await accountRankBenefits(env,user.id,mode==='yard'?'SCRAPYARD':'ESCORT');
    const snapshot=await loadScrapyardV3Snapshot(env,user,deps,'PVE',benefits);
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    const result=buildFieldOperation(snapshot,mode,tier,seed);
    return response(await settleFieldOperation(env,user,result,body.requestId,cfg,at));
  });
}
