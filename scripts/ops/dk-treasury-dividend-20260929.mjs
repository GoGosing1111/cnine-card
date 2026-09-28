import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:treasury-top-clan:season5:DK:20260929:v1';
export const REQUESTED='501332365114';
export const SEASON_ID=5,CLAN_ID=1,RECIPIENT_COUNT=21;
export const REASON='DK 클랜 시즌 2 1위 우승 기념 · 세금 균등 지급 · 20260929';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const hash=users=>createHash('sha256').update(JSON.stringify(users.map(({id,nickname})=>({id:String(id),nickname})))).digest('hex');
const rosterSql='SELECT m.user_id::text AS id,u.nickname,u.status,u.coin::text FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id LIMIT 201';
export function validateUsers(users){
 assert.equal(users.length,RECIPIENT_COUNT);assert.equal(new Set(users.map(u=>String(u.id))).size,RECIPIENT_COUNT);
 for(const u of users){assert.match(String(u.id),/^[1-9]\d*$/);assert.ok(u.nickname)}
 assert.deepEqual(users.map(u=>Number(u.id)),users.map(u=>Number(u.id)).sort((a,b)=>a-b));
}
export async function inspect(client){
 const q=async(sql,p=[])=>(await client.query(sql,p)).rows;
 const [treasury]=await q('SELECT * FROM administration_treasury_v2030 WHERE id=1');
 const [champion]=await q(`SELECT s.id season_id,s.season_no,s.phase,ss.champion_clan_id,ss.status,o.name clan_name FROM clan_season_settlements ss JOIN clan_seasons s ON s.id=ss.season_id JOIN clan_organizations o ON o.id=ss.champion_clan_id WHERE ss.status='COMPLETED' ORDER BY s.season_no DESC LIMIT 1`);
 const users=await q(rosterSql,[SEASON_ID,CLAN_ID]);
 const existing=await q("SELECT id,request_id,status,requested_amount,executed_amount FROM administration_budget_proposals_v2030 WHERE type='TOP_CLAN_DIVIDEND' AND target_season_id=$1 AND target_clan_id=$2",[SEASON_ID,CLAN_ID]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {treasury,champion,users,recipientHash:hash(users),existing,receipt:saved?parse(saved.value):null};
}
export async function verify(client,receipt){
 const q=async(sql,p=[])=>(await client.query(sql,p)).rows;
 if(!receipt){const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Missing receipt');receipt=parse(saved.value)}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.requested,REQUESTED);
 assert.equal(receipt.recipients.length,RECIPIENT_COUNT);assert.equal(receipt.recipientHash,hash(receipt.recipients));
 const ids=receipt.recipients.map(r=>r.id),per=BigInt(REQUESTED)/BigInt(RECIPIENT_COUNT),total=per*BigInt(RECIPIENT_COUNT);
 assert.equal(receipt.perMember,String(per));assert.equal(receipt.executed,String(total));assert.equal(receipt.remainder,String(BigInt(REQUESTED)-total));
 assert.equal(BigInt(receipt.treasuryBefore.balance)-BigInt(receipt.treasuryAfter.balance),total);
 assert.equal(BigInt(receipt.treasuryAfter.total_disbursed)-BigInt(receipt.treasuryBefore.total_disbursed),total);
 const [proposal]=await q('SELECT * FROM administration_budget_proposals_v2030 WHERE request_id=$1',[OPERATION_KEY]);
 assert.equal(proposal?.status,'APPROVED');assert.equal(proposal.id,receipt.proposalId);assert.equal(String(proposal.target_season_id),String(SEASON_ID));assert.equal(String(proposal.target_clan_id),String(CLAN_ID));
 assert.equal(String(proposal.requested_amount),REQUESTED);assert.equal(String(proposal.executed_amount),String(total));assert.equal(String(proposal.per_recipient_amount),String(per));assert.equal(Number(proposal.recipient_count),RECIPIENT_COUNT);
 const distributions=await q('SELECT user_id::text AS id,amount::text FROM administration_budget_distributions_v2030 WHERE proposal_id=$1 ORDER BY user_id',[receipt.proposalId]);
 assert.deepEqual(distributions.map(r=>r.id),ids);for(const r of distributions)assert.equal(r.amount,String(per));
 const logs=await q('SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY coin_logs.user_id',[receipt.recipients.map(r=>r.coinLogId)]);
 assert.deepEqual(logs.map(r=>r.user_id),ids);
 for(let i=0;i<ids.length;i++){const r=receipt.recipients[i];assert.equal(logs[i].reason,REASON);assert.equal(logs[i].id,r.coinLogId);assert.equal(logs[i].change_amount,String(per));assert.equal(logs[i].balance_after,r.coinAfter);assert.equal(BigInt(r.coinAfter)-BigInt(r.coinBefore),per)}
 const [ledger]=await q('SELECT * FROM administration_treasury_ledger_v2030 WHERE reference_key=$1',[`BUDGET:${receipt.proposalId}`]);
 assert.equal(String(ledger?.amount),String(-total));assert.equal(String(ledger?.balance_after),receipt.treasuryAfter.balance);
 const [audit]=await q("SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='OPS_DK_TREASURY_DIVIDEND' AND target_id=$2",[receipt.auditId,OPERATION_KEY]);
 assert.ok(audit);const {auditId,...audited}=receipt;assert.deepEqual(parse(audit.after_data),audited);
 return {status:'VERIFIED',recipientCount:ids.length,perMember:String(per),executed:String(total),remainder:receipt.remainder,coinLogs:logs.length,proposalId:receipt.proposalId,auditId:receipt.auditId};
}
// Explicit one-time owner instruction; transaction covers treasury, wallets and every audit record.
// No runtime route or reusable grant endpoint imports this script.
export async function apply(client,expectedUsers,{dryRun=false}={}){
 validateUsers(expectedUsers);const q=async(sql,p=[])=>(await client.query(sql,p)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=parse(saved.value);assert.equal(receipt.recipientHash,hash(expectedUsers));const verification=await verify(client,receipt);await client.query('ROLLBACK');return {...receipt,verification,replayed:true,dryRun}}
  const [owner]=await q("SELECT id,nickname FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.equal(owner?.nickname,'핑크빛유두');
  const settlement=await q('SELECT status,champion_clan_id FROM clan_season_settlements WHERE season_id=$1 FOR SHARE',[SEASON_ID]);
  assert.equal(settlement[0]?.status,'COMPLETED');assert.equal(String(settlement[0]?.champion_clan_id),String(CLAN_ID));
  const membership=await q('SELECT user_id::text AS id FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id FOR SHARE',[SEASON_ID,CLAN_ID]);
  assert.deepEqual(membership.map(r=>r.id),expectedUsers.map(r=>String(r.id)));
  const users=await q('SELECT id::text,nickname,status,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id FOR UPDATE',[membership.map(r=>r.id)]);
  validateUsers(users);assert.equal(hash(users),hash(expectedUsers));for(const u of users)assert.equal(u.status,'ACTIVE');
  const [treasuryBefore]=await q('SELECT * FROM administration_treasury_v2030 WHERE id=1 FOR UPDATE');
  const state=await inspect(client);assert.equal(state.champion.clan_name,'DK');assert.equal(String(state.champion.season_id),String(SEASON_ID));assert.equal(state.existing.length,0,'Existing dividend for this champion');
  const reserve=BigInt(treasuryBefore.balance)*BigInt(treasuryBefore.reserve_bps)/10000n;
  const limit=(BigInt(treasuryBefore.balance)-reserve)/2n;assert.ok(BigInt(REQUESTED)<=limit,'Current treasury cap below screenshot amount');
  const per=BigInt(REQUESTED)/BigInt(users.length),total=per*BigInt(users.length),remainder=BigInt(REQUESTED)-total;
  for(const u of users)assert.ok(BigInt(u.coin)>=0n&&BigInt(u.coin)+per<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported wallet range');
  const proposalId=crypto.randomUUID(),now=new Date().toISOString();
  const proposals=await q(`INSERT INTO administration_budget_proposals_v2030(id,request_id,type,label,proposer_user_id,proposer_nickname,chief_appointment_id,requested_amount,target_season_id,target_clan_id,target_label,reason,status,executed_amount,per_recipient_amount,recipient_count,decision_user_id,decision_nickname,decision_note,decided_at,created_at,updated_at)
   VALUES($1,$2,'TOP_CLAN_DIVIDEND','1위 클랜 균등 지급',$3,$4,$5,$6,$7,$8,'DK',$9,'APPROVED',$10,$11,$12,$3,$4,$13,$14,$14,$14) RETURNING id`,[proposalId,OPERATION_KEY,owner.id,owner.nickname,`OWNER_DIRECT:${OPERATION_KEY}`,REQUESTED,SEASON_ID,CLAN_ID,REASON,String(total),String(per),users.length,'사용자 직접 집행 지시: DK 클랜 1위 우승 기념, 화면 금액 1/N 균등 지급 및 세금 차감. 일반 족장 상신이 아님.',now]);assert.equal(proposals.length,1);
  const [treasuryAfter]=await q('UPDATE administration_treasury_v2030 SET balance=balance-$1::bigint,total_disbursed=total_disbursed+$1::bigint,version=version+1,updated_at=$2 WHERE id=1 AND balance-$1::bigint >= $3::bigint RETURNING *',[String(total),now,String(reserve)]);assert.ok(treasuryAfter);
  const ledger=await q("INSERT INTO administration_treasury_ledger_v2030(reference_key,entry_type,amount,balance_after,user_id,proposal_id,memo,created_at) VALUES($1,'BUDGET_EXECUTION',$2,$3,$4,$5,$6,$7) RETURNING reference_key",[`BUDGET:${proposalId}`,String(-total),treasuryAfter.balance,owner.id,proposalId,REASON,now]);assert.equal(ledger.length,1);
  const distributions=await q('INSERT INTO administration_budget_distributions_v2030(proposal_id,user_id,amount,created_at) SELECT $1,id,$2::bigint,$3 FROM unnest($4::bigint[]) AS id RETURNING user_id',[proposalId,String(per),now,users.map(u=>u.id)]);assert.equal(distributions.length,users.length);
  const logs=await q(`WITH credited AS (UPDATE users SET coin=coin+$1::bigint WHERE id=ANY($2::bigint[]) RETURNING id,coin)
   INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at) SELECT id,$1::bigint,coin,$3,$4,$5 FROM credited RETURNING id::text,user_id::text,balance_after::text`,[String(per),users.map(u=>u.id),REASON,owner.id,now]);assert.equal(logs.length,users.length);
  const recipients=users.map(u=>{const log=logs.find(r=>r.user_id===u.id);assert.ok(log);assert.equal(BigInt(log.balance_after)-BigInt(u.coin),per);return {id:u.id,nickname:u.nickname,coinBefore:u.coin,coinAfter:log.balance_after,coinLogId:log.id}});
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',authorization:'이거 DK 클랜 1위 우승 기념 N분의1로 나눠서 지급해 세금에서 차감하고',delivery:'DIRECT',seasonId:SEASON_ID,clanId:CLAN_ID,requested:REQUESTED,perMember:String(per),executed:String(total),remainder:String(remainder),recipientHash:hash(users),proposalId,treasuryBefore,treasuryAfter,recipients,completedAt:now};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'OPS_DK_TREASURY_DIVIDEND','TREASURY',$2,$3,$4,$5) RETURNING id::text",[owner.id,OPERATION_KEY,JSON.stringify({treasury:treasuryBefore,users}),JSON.stringify(receipt),now]);assert.ok(audit);receipt.auditId=audit.id;
  const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);assert.equal(written.length,1);
  const verification=await verify(client,receipt);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,verification,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
