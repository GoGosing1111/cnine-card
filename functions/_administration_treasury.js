const ACCOUNT_TABLE='administration_treasury_v2030';
const TAX_RECEIPT_TABLE='administration_tax_receipts_v2030';
const LEDGER_TABLE='administration_treasury_ledger_v2030';
const PROPOSAL_TABLE='administration_budget_proposals_v2030';
const DISTRIBUTION_TABLE='administration_budget_distributions_v2030';
export const TREASURY_PREDICTION_SUBSIDY_TABLE='administration_prediction_subsidies_v2030';

export const SHOP_TAX_BPS=100;
export const TREASURY_RESERVE_BPS=2000;
const FINAL_APPROVER_NICKNAME='핑크빛유두';
const CHIEF_META_KEY='chief_appointment_v1';
const PROPOSAL_CAP_BPS=Object.freeze({PERSONAL:1000,PREDICTION_SUBSIDY:3000,TOP_CLAN_DIVIDEND:5000});
const PROPOSAL_LABELS=Object.freeze({PERSONAL:'족장 개인 집행',PREDICTION_SUBSIDY:'승부예측 지원금',TOP_CLAN_DIVIDEND:'1위 클랜 균등 지급'});
const SOURCE_LABELS=Object.freeze({CARD_PACK:'카드팩',PRIME_EQUIPMENT:'프라임 장비상자',PRIME_VEHICLE:'프라임 이동수단팩',AVATAR_SHOP:'아바타 상점'});
let foundationPromise=null;

const safeJson=(value,fallback={})=>{try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:fallback}catch{return fallback}};
const text=(value,max=300)=>String(value??'').trim().slice(0,max);
const integer=value=>{const number=Number(value);return Number.isSafeInteger(number)?number:NaN};
const changes=result=>Number(result?.meta?.changes||0);

export function calculateShopTax(grossCoin){
  const gross=integer(grossCoin);
  if(!Number.isSafeInteger(gross)||gross<=0)return 0;
  return Math.floor(gross/100);
}

export function treasurySpendable(balance,reserveBps=TREASURY_RESERVE_BPS){
  const safeBalance=Math.max(0,integer(balance)||0),reserve=Math.floor(safeBalance*Math.max(0,Math.min(10000,integer(reserveBps)||0))/10000);
  return {balance:safeBalance,reserve,spendable:Math.max(0,safeBalance-reserve)};
}

export function proposalLimit(balance,type,reserveBps=TREASURY_RESERVE_BPS){
  const funds=treasurySpendable(balance,reserveBps),capBps=PROPOSAL_CAP_BPS[String(type||'').toUpperCase()]||0;
  return {...funds,capBps,limit:Math.floor(funds.spendable*capBps/10000)};
}

export function equalClanDistribution(requestedAmount,memberCount){
  const requested=Math.max(0,integer(requestedAmount)||0),members=Math.max(0,integer(memberCount)||0);
  if(!members)return {memberCount:0,perMember:0,executedAmount:0,remainder:requested};
  const perMember=Math.floor(requested/members),executedAmount=perMember*members;
  return {memberCount:members,perMember,executedAmount,remainder:requested-executedAmount};
}

export function isTreasuryFinalApprover(user){
  return String(user?.role||'').trim().toUpperCase()==='OWNER'&&String(user?.nickname||'').trim()===FINAL_APPROVER_NICKNAME;
}

function treasurySchemaStatements(postgres=false){
  const idType=postgres?'BIGINT':'INTEGER',amountType=postgres?'BIGINT':'INTEGER',nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  return [
    `CREATE TABLE IF NOT EXISTS ${ACCOUNT_TABLE}(id INTEGER PRIMARY KEY,balance ${amountType} NOT NULL DEFAULT 0,total_collected ${amountType} NOT NULL DEFAULT 0,total_disbursed ${amountType} NOT NULL DEFAULT 0,total_refunded ${amountType} NOT NULL DEFAULT 0,tax_bps INTEGER NOT NULL DEFAULT ${SHOP_TAX_BPS},reserve_bps INTEGER NOT NULL DEFAULT ${TREASURY_RESERVE_BPS},version ${amountType} NOT NULL DEFAULT 0,started_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE TABLE IF NOT EXISTS ${TAX_RECEIPT_TABLE}(source_type TEXT NOT NULL,source_request_id TEXT NOT NULL,user_id ${idType} NOT NULL,gross_coin ${amountType} NOT NULL,tax_coin ${amountType} NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',label TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(source_type,source_request_id))`,
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE}(reference_key TEXT PRIMARY KEY,entry_type TEXT NOT NULL,amount ${amountType} NOT NULL,balance_after ${amountType} NOT NULL,user_id ${idType},proposal_id TEXT,source_type TEXT,source_request_id TEXT,memo TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE TABLE IF NOT EXISTS ${PROPOSAL_TABLE}(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,type TEXT NOT NULL,label TEXT NOT NULL,proposer_user_id ${idType} NOT NULL,proposer_nickname TEXT NOT NULL,chief_appointment_id TEXT NOT NULL,requested_amount ${amountType} NOT NULL,target_user_id ${idType},target_event_id ${idType},target_season_id ${idType},target_clan_id ${idType},target_label TEXT,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',executed_amount ${amountType} NOT NULL DEFAULT 0,per_recipient_amount ${amountType} NOT NULL DEFAULT 0,recipient_count INTEGER NOT NULL DEFAULT 0,decision_user_id ${idType},decision_nickname TEXT,decision_note TEXT,decided_at TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE INDEX IF NOT EXISTS idx_administration_budget_proposals_status_v2030 ON ${PROPOSAL_TABLE}(status,created_at)`,
    `CREATE TABLE IF NOT EXISTS ${DISTRIBUTION_TABLE}(proposal_id TEXT NOT NULL,user_id ${idType} NOT NULL,amount ${amountType} NOT NULL,created_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(proposal_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS ${TREASURY_PREDICTION_SUBSIDY_TABLE}(proposal_id TEXT PRIMARY KEY,event_id ${idType} NOT NULL,amount ${amountType} NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE INDEX IF NOT EXISTS idx_administration_prediction_subsidy_event_v2030 ON ${TREASURY_PREDICTION_SUBSIDY_TABLE}(event_id,status)`
  ];
}

export async function ensureAdministrationTreasuryFoundation(env){
  const db=env?.DB;if(!db)throw new Error('재정금고 데이터베이스가 연결되지 않았습니다.');
  if(!foundationPromise){
    foundationPromise=(async()=>{
      const postgres=db?.dialect==='postgres',schema=treasurySchemaStatements(postgres);
      if(postgres&&typeof db.execSchema==='function')await db.execSchema(schema);
      else await db.batch(schema.map(statement=>db.prepare(statement)));
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO ${ACCOUNT_TABLE}(id,balance,total_collected,total_disbursed,total_refunded,tax_bps,reserve_bps,version) VALUES(1,0,0,0,0,${SHOP_TAX_BPS},${TREASURY_RESERVE_BPS},0)`),
        db.prepare(`UPDATE ${ACCOUNT_TABLE} SET tax_bps=${SHOP_TAX_BPS},reserve_bps=${TREASURY_RESERVE_BPS},updated_at=CURRENT_TIMESTAMP WHERE id=1 AND (tax_bps<>${SHOP_TAX_BPS} OR reserve_bps<>${TREASURY_RESERVE_BPS})`)
      ]);
      return true;
    })().catch(error=>{foundationPromise=null;throw error});
  }
  return foundationPromise;
}

export function shopTaxStatements(env,{sourceType,sourceRequestId,userId,grossCoin,label='',guardSql='1=1',guardBindings=[]}){
  const db=env.DB,type=text(sourceType,50).toUpperCase(),requestId=text(sourceRequestId,160),uid=integer(userId),gross=integer(grossCoin),tax=calculateShopTax(gross);
  if(!type||!requestId||!Number.isSafeInteger(uid)||uid<1||!Number.isSafeInteger(gross)||gross<1||tax<1)return [];
  const bindings=Array.isArray(guardBindings)?guardBindings:[],referenceKey=`TAX:${type}:${requestId}`;
  return [
    db.prepare(`INSERT OR IGNORE INTO ${TAX_RECEIPT_TABLE}(source_type,source_request_id,user_id,gross_coin,tax_coin,status,label)
      SELECT ?,?,?,?,?,'PENDING',? WHERE ${guardSql}`).bind(type,requestId,uid,gross,tax,text(label,120),...bindings),
    db.prepare(`UPDATE ${ACCOUNT_TABLE} SET balance=balance+?,total_collected=total_collected+?,version=version+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=1 AND EXISTS(SELECT 1 FROM ${TAX_RECEIPT_TABLE} WHERE source_type=? AND source_request_id=? AND status='PENDING')`).bind(tax,tax,type,requestId),
    db.prepare(`INSERT OR IGNORE INTO ${LEDGER_TABLE}(reference_key,entry_type,amount,balance_after,user_id,source_type,source_request_id,memo)
      SELECT ?,'SHOP_TAX',?,a.balance,?,?,?,? FROM ${ACCOUNT_TABLE} a
      WHERE a.id=1 AND EXISTS(SELECT 1 FROM ${TAX_RECEIPT_TABLE} WHERE source_type=? AND source_request_id=? AND status='PENDING')`).bind(referenceKey,tax,uid,type,requestId,text(label||SOURCE_LABELS[type]||type,120),type,requestId),
    db.prepare(`UPDATE ${TAX_RECEIPT_TABLE} SET status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE source_type=? AND source_request_id=? AND status='PENDING'
      AND EXISTS(SELECT 1 FROM ${LEDGER_TABLE} WHERE reference_key=?)`).bind(type,requestId,referenceKey)
  ];
}

async function activeChief(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CHIEF_META_KEY).first(),raw=safeJson(row?.value,{}),starts=Date.parse(String(raw.startsAt||'')),ends=Date.parse(String(raw.endsAt||''));
  if(!raw.id||!raw.userId||!Number.isFinite(starts)||!Number.isFinite(ends)||Date.now()<starts||Date.now()>=ends)return {active:false};
  const user=await env.DB.prepare("SELECT id,nickname,status FROM users WHERE id=? AND status='ACTIVE'").bind(Number(raw.userId)).first();
  return user?{active:true,id:String(raw.id),userId:Number(user.id),nickname:String(user.nickname||raw.nickname||''),startsAt:new Date(starts).toISOString(),endsAt:new Date(ends).toISOString()}:{active:false};
}

async function latestChampion(env){
  try{
    const row=await env.DB.prepare(`SELECT s.id season_id,s.season_no,ss.champion_clan_id,o.name clan_name
      FROM clan_season_settlements ss JOIN clan_seasons s ON s.id=ss.season_id
      JOIN clan_organizations o ON o.id=ss.champion_clan_id
      WHERE ss.status='COMPLETED' AND ss.champion_clan_id IS NOT NULL
      ORDER BY datetime(COALESCE(ss.completed_at,ss.updated_at)) DESC,s.season_no DESC LIMIT 1`).first();
    if(!row)return null;
    const countRow=await env.DB.prepare('SELECT COUNT(*) count FROM clan_members WHERE season_id=? AND clan_id=?').bind(row.season_id,row.champion_clan_id).first();
    return {seasonId:Number(row.season_id),seasonNo:Number(row.season_no||0),clanId:Number(row.champion_clan_id),clanName:String(row.clan_name||''),memberCount:Number(countRow?.count||0)};
  }catch{return null}
}

async function openPredictionEvents(env){
  try{return (await env.DB.prepare("SELECT id,title,status,closes_at,total_pool FROM coin_prediction_events WHERE status IN ('OPEN','CLOSED') ORDER BY CASE status WHEN 'OPEN' THEN 0 ELSE 1 END,datetime(COALESCE(closes_at,created_at)) DESC LIMIT 40").all()).results||[]}catch{return []}
}

async function state(env,user){
  const [account,chief,champion,events,proposalRows,sourceRows,recentLedger]=await Promise.all([
    env.DB.prepare(`SELECT * FROM ${ACCOUNT_TABLE} WHERE id=1`).first(),activeChief(env),latestChampion(env),openPredictionEvents(env),
    env.DB.prepare(`SELECT p.*,u.nickname target_nickname FROM ${PROPOSAL_TABLE} p LEFT JOIN users u ON u.id=p.target_user_id ORDER BY CASE p.status WHEN 'PENDING' THEN 0 WHEN 'APPROVING' THEN 1 ELSE 2 END,datetime(p.created_at) DESC LIMIT 80`).all(),
    env.DB.prepare(`SELECT source_type,COUNT(*) sale_count,COALESCE(SUM(gross_coin),0) gross_coin,COALESCE(SUM(tax_coin),0) tax_coin FROM ${TAX_RECEIPT_TABLE} WHERE status='COMPLETED' GROUP BY source_type ORDER BY tax_coin DESC`).all(),
    env.DB.prepare(`SELECT * FROM ${LEDGER_TABLE} ORDER BY datetime(created_at) DESC LIMIT 40`).all()
  ]),funds=treasurySpendable(account?.balance,account?.reserve_bps),isOwner=String(user?.role||'').toUpperCase()==='OWNER',isChief=chief.active&&Number(chief.userId)===Number(user?.id),isFinalApprover=isTreasuryFinalApprover(user);
  const limits=Object.fromEntries(Object.keys(PROPOSAL_CAP_BPS).map(type=>[type,{label:PROPOSAL_LABELS[type],...proposalLimit(account?.balance,type,account?.reserve_bps)}]));
  return {ok:true,policy:{taxBps:SHOP_TAX_BPS,taxPercent:1,reserveBps:TREASURY_RESERVE_BPS,reservePercent:20,collectionScope:'SUCCESSFUL_COIN_SHOP_SALES_ONLY',buyerSurcharge:false,effectiveFrom:account?.started_at||null,finalApproverNickname:FINAL_APPROVER_NICKNAME},account:{balance:funds.balance,totalCollected:Number(account?.total_collected||0),totalDisbursed:Number(account?.total_disbursed||0),totalRefunded:Number(account?.total_refunded||0),reserve:funds.reserve,spendable:funds.spendable,version:Number(account?.version||0),updatedAt:account?.updated_at||null},access:{visible:true,isOwner,isChief,isFinalApprover,canSubmit:isChief,canDecide:isFinalApprover},chief,champion,events,limits,proposals:proposalRows.results||[],sources:(sourceRows.results||[]).map(row=>({...row,label:SOURCE_LABELS[row.source_type]||row.source_type})),ledger:recentLedger.results||[]};
}

function validateRequestId(value){const cleaned=text(value,120);return cleaned.length>=8&&/^[A-Za-z0-9:_-]+$/.test(cleaned)?cleaned:''}

async function submitProposal(env,user,body){
  const chief=await activeChief(env);if(!chief.active||Number(chief.userId)!==Number(user.id))throw Object.assign(new Error('현재 임기의 족장만 예산안을 상신할 수 있습니다.'),{status:403});
  const type=text(body.type,40).toUpperCase(),amount=integer(body.amount),reason=text(body.reason,300),requestId=validateRequestId(body.requestId||crypto.randomUUID());
  if(!PROPOSAL_CAP_BPS[type])throw Object.assign(new Error('지원하지 않는 예산 항목입니다.'),{status:400});
  if(!Number.isSafeInteger(amount)||amount<1)throw Object.assign(new Error('신청 금액은 1코인 이상의 정수여야 합니다.'),{status:400});
  if(reason.length<3)throw Object.assign(new Error('예산 사용 사유를 3자 이상 입력해 주세요.'),{status:400});
  if(!requestId)throw Object.assign(new Error('예산 요청 번호가 올바르지 않습니다.'),{status:400});
  const prior=await env.DB.prepare(`SELECT id FROM ${PROPOSAL_TABLE} WHERE request_id=?`).bind(requestId).first();if(prior)return {id:String(prior.id),replayed:true};
  const account=await env.DB.prepare(`SELECT balance,reserve_bps FROM ${ACCOUNT_TABLE} WHERE id=1`).first(),limit=proposalLimit(account?.balance,type,account?.reserve_bps);
  if(amount>limit.limit)throw Object.assign(new Error(`${PROPOSAL_LABELS[type]} 1회 상한은 현재 ${limit.limit.toLocaleString()}코인입니다.`),{status:409});
  let targetUserId=null,targetEventId=null,targetSeasonId=null,targetClanId=null,targetLabel='';
  if(type==='PERSONAL'){targetUserId=Number(chief.userId);targetLabel=chief.nickname}
  if(type==='PREDICTION_SUBSIDY'){
    targetEventId=integer(body.targetEventId);const event=await env.DB.prepare("SELECT id,title FROM coin_prediction_events WHERE id=? AND status IN ('OPEN','CLOSED')").bind(targetEventId).first();
    if(!event)throw Object.assign(new Error('지원 가능한 진행·마감 승부예측을 찾을 수 없습니다.'),{status:404});
    const duplicate=await env.DB.prepare(`SELECT 1 found FROM ${PROPOSAL_TABLE} WHERE type='PREDICTION_SUBSIDY' AND target_event_id=? AND status IN ('PENDING','APPROVING','APPROVED')`).bind(targetEventId).first();
    if(duplicate)throw Object.assign(new Error('해당 승부예측에는 이미 지원 예산이 상신되었거나 적용되었습니다.'),{status:409});targetLabel=String(event.title||'');
  }
  if(type==='TOP_CLAN_DIVIDEND'){
    const champion=await latestChampion(env);if(!champion||champion.memberCount<1)throw Object.assign(new Error('지급할 최근 완료 시즌 1위 클랜을 찾을 수 없습니다.'),{status:404});
    ({seasonId:targetSeasonId,clanId:targetClanId,clanName:targetLabel}=champion);
  }
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO ${PROPOSAL_TABLE}(id,request_id,type,label,proposer_user_id,proposer_nickname,chief_appointment_id,requested_amount,target_user_id,target_event_id,target_season_id,target_clan_id,target_label,reason,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING')`).bind(id,requestId,type,PROPOSAL_LABELS[type],user.id,user.nickname,chief.id,amount,targetUserId,targetEventId,targetSeasonId,targetClanId,targetLabel,reason).run();
  return {id,replayed:false};
}

async function decideProposal(env,user,body){
  if(!isTreasuryFinalApprover(user))throw Object.assign(new Error(`최종 승인은 OWNER ${FINAL_APPROVER_NICKNAME}만 할 수 있습니다.`),{status:403});
  const id=text(body.proposalId,80),action=text(body.action,20).toUpperCase(),note=text(body.note,300);
  if(!id||!['APPROVE','REJECT'].includes(action))throw Object.assign(new Error('승인 요청 정보가 올바르지 않습니다.'),{status:400});
  const proposal=await env.DB.prepare(`SELECT * FROM ${PROPOSAL_TABLE} WHERE id=?`).bind(id).first();if(!proposal)throw Object.assign(new Error('예산안을 찾을 수 없습니다.'),{status:404});
  if(proposal.status!=='PENDING')throw Object.assign(new Error('이미 결정되었거나 처리 중인 예산안입니다.'),{status:409});
  if(action==='REJECT'){
    const result=await env.DB.prepare(`UPDATE ${PROPOSAL_TABLE} SET status='REJECTED',decision_user_id=?,decision_nickname=?,decision_note=?,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(user.id,user.nickname,note,id).run();
    if(changes(result)!==1)throw Object.assign(new Error('예산안 상태가 동시에 변경되었습니다.'),{status:409});return {id,status:'REJECTED'};
  }
  const claim=await env.DB.prepare(`UPDATE ${PROPOSAL_TABLE} SET status='APPROVING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'`).bind(id).run();
  if(changes(claim)!==1)throw Object.assign(new Error('예산안 상태가 동시에 변경되었습니다.'),{status:409});
  try{
    const fresh=await env.DB.prepare(`SELECT * FROM ${PROPOSAL_TABLE} WHERE id=? AND status='APPROVING'`).bind(id).first(),account=await env.DB.prepare(`SELECT * FROM ${ACCOUNT_TABLE} WHERE id=1`).first();
    if(!fresh||!account)throw new Error('예산안 또는 재정금고 상태를 확인할 수 없습니다.');
    const limit=proposalLimit(account.balance,fresh.type,account.reserve_bps),requested=Number(fresh.requested_amount||0);
    if(requested>limit.limit||requested>limit.spendable)throw Object.assign(new Error(`현재 가용 예산과 항목별 상한을 초과했습니다. 승인 가능액은 ${Math.min(limit.limit,limit.spendable).toLocaleString()}코인입니다.`),{status:409});
    let executed=requested,perRecipient=0,recipientCount=1;
    if(fresh.type==='TOP_CLAN_DIVIDEND'){
      const countRow=await env.DB.prepare('SELECT COUNT(*) count FROM clan_members WHERE season_id=? AND clan_id=?').bind(fresh.target_season_id,fresh.target_clan_id).first(),distribution=equalClanDistribution(requested,Number(countRow?.count||0));
      if(distribution.memberCount<1||distribution.perMember<1)throw Object.assign(new Error('1위 클랜의 지급 대상 또는 1인 지급액이 없습니다.'),{status:409});
      executed=distribution.executedAmount;perRecipient=distribution.perMember;recipientCount=distribution.memberCount;
    }
    const beforeBalance=Number(account.balance),beforeVersion=Number(account.version),afterBalance=beforeBalance-executed,afterVersion=beforeVersion+1,ledgerKey=`BUDGET:${id}`;
    const statements=[
      env.DB.prepare(`UPDATE ${ACCOUNT_TABLE} SET balance=?,total_disbursed=total_disbursed+?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND balance=? AND version=? AND balance-?>=?`).bind(afterBalance,executed,afterVersion,beforeBalance,beforeVersion,executed,limit.reserve),
      env.DB.prepare(`INSERT OR IGNORE INTO ${LEDGER_TABLE}(reference_key,entry_type,amount,balance_after,user_id,proposal_id,memo)
        SELECT ?,'BUDGET_EXECUTION',?,a.balance,?,?,? FROM ${ACCOUNT_TABLE} a WHERE a.id=1 AND a.balance=? AND a.version=?`).bind(ledgerKey,-executed,user.id,id,`${fresh.label} · ${fresh.reason}`,afterBalance,afterVersion)
    ];
    const ledgerGuard=`EXISTS(SELECT 1 FROM ${LEDGER_TABLE} WHERE reference_key=?)`;
    if(fresh.type==='PERSONAL')statements.push(
      env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${ledgerGuard}`).bind(executed,fresh.target_user_id,ledgerKey),
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'행정부 승인 · 족장 개인 집행' FROM users WHERE id=? AND ${ledgerGuard}`).bind(executed,fresh.target_user_id,ledgerKey)
    );
    if(fresh.type==='PREDICTION_SUBSIDY')statements.push(
      env.DB.prepare(`INSERT OR IGNORE INTO ${TREASURY_PREDICTION_SUBSIDY_TABLE}(proposal_id,event_id,amount,status) SELECT ?,?,?,'ACTIVE' WHERE ${ledgerGuard}`).bind(id,fresh.target_event_id,executed,ledgerKey)
    );
    if(fresh.type==='TOP_CLAN_DIVIDEND')statements.push(
      env.DB.prepare(`INSERT OR IGNORE INTO ${DISTRIBUTION_TABLE}(proposal_id,user_id,amount) SELECT ?,user_id,? FROM clan_members WHERE season_id=? AND clan_id=? AND ${ledgerGuard}`).bind(id,perRecipient,fresh.target_season_id,fresh.target_clan_id,ledgerKey),
      env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id IN (SELECT user_id FROM ${DISTRIBUTION_TABLE} WHERE proposal_id=?) AND ${ledgerGuard}`).bind(perRecipient,id,ledgerKey),
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'행정부 승인 · 1위 클랜 균등 지급' FROM users WHERE id IN (SELECT user_id FROM ${DISTRIBUTION_TABLE} WHERE proposal_id=?) AND ${ledgerGuard}`).bind(perRecipient,id,ledgerKey)
    );
    statements.push(env.DB.prepare(`UPDATE ${PROPOSAL_TABLE} SET status='APPROVED',executed_amount=?,per_recipient_amount=?,recipient_count=?,decision_user_id=?,decision_nickname=?,decision_note=?,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='APPROVING' AND ${ledgerGuard}`).bind(executed,perRecipient,recipientCount,user.id,user.nickname,note,id,ledgerKey));
    await env.DB.batch(statements);
    const saved=await env.DB.prepare(`SELECT status,executed_amount FROM ${PROPOSAL_TABLE} WHERE id=?`).bind(id).first();
    if(saved?.status!=='APPROVED')throw Object.assign(new Error('재정금고 잔액이 동시에 변경되어 승인하지 못했습니다. 다시 시도해 주세요.'),{status:409});
    return {id,status:'APPROVED',executedAmount:Number(saved.executed_amount||0),perRecipient,recipientCount};
  }catch(error){await env.DB.prepare(`UPDATE ${PROPOSAL_TABLE} SET status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='APPROVING'`).bind(id).run().catch(()=>{});throw error}
}

export async function activePredictionSubsidy(env,eventId){
  await ensureAdministrationTreasuryFoundation(env);
  const row=await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) amount FROM ${TREASURY_PREDICTION_SUBSIDY_TABLE} WHERE event_id=? AND status='ACTIVE'`).bind(eventId).first();
  return Math.max(0,Number(row?.amount||0));
}

export function predictionSubsidyFinalizationStatements(env,{eventId,voided,amount}){
  const value=Math.max(0,integer(amount)||0);if(value<1)return [];
  if(!voided)return [env.DB.prepare(`UPDATE ${TREASURY_PREDICTION_SUBSIDY_TABLE} SET status='CONSUMED',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND status='ACTIVE'`).bind(eventId)];
  const referenceKey=`PREDICTION_REFUND:${eventId}`;
  return [
    env.DB.prepare(`UPDATE ${ACCOUNT_TABLE} SET balance=balance+?,total_refunded=total_refunded+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND EXISTS(SELECT 1 FROM ${TREASURY_PREDICTION_SUBSIDY_TABLE} WHERE event_id=? AND status='ACTIVE')`).bind(value,value,eventId),
    env.DB.prepare(`INSERT OR IGNORE INTO ${LEDGER_TABLE}(reference_key,entry_type,amount,balance_after,source_type,source_request_id,memo) SELECT ?,'PREDICTION_REFUND',?,balance,'PREDICTION_SUBSIDY',?,'무효 승부예측 지원금 환입' FROM ${ACCOUNT_TABLE} WHERE id=1 AND EXISTS(SELECT 1 FROM ${TREASURY_PREDICTION_SUBSIDY_TABLE} WHERE event_id=? AND status='ACTIVE')`).bind(referenceKey,value,String(eventId),eventId),
    env.DB.prepare(`UPDATE ${TREASURY_PREDICTION_SUBSIDY_TABLE} SET status='REFUNDED',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND status='ACTIVE' AND EXISTS(SELECT 1 FROM ${LEDGER_TABLE} WHERE reference_key=?)`).bind(eventId,referenceKey)
  ];
}

export async function handleAdministrationTreasury({path,request,env,deps}){
  if(!String(path).startsWith('administration/treasury'))return null;
  await ensureAdministrationTreasuryFoundation(env);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  if(path==='administration/treasury/state'&&request.method==='GET')return deps.json(await state(env,user));
  if(path==='administration/treasury/proposals'&&request.method==='POST'){
    try{const result=await submitProposal(env,user,await deps.readBody(request));return deps.json({...result,state:await state(env,user)})}catch(error){return deps.json({error:error.message||'예산안 상신에 실패했습니다.'},error.status||500)}
  }
  if(path==='administration/treasury/decision'&&request.method==='POST'){
    try{const result=await decideProposal(env,user,await deps.readBody(request));return deps.json({...result,state:await state(env,user)})}catch(error){return deps.json({error:error.message||'예산안 결정에 실패했습니다.'},error.status||500)}
  }
  return deps.json({error:'지원하지 않는 행정부 재정 요청입니다.'},405);
}
