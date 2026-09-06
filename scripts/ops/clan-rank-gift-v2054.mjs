import {CLAN_RANKED_TEAMS_SQL} from '../../functions/_clan_ranking.js';

export const CAMPAIGN='clan-rank-bonus-20260906-season4-fm-first';
export const RECEIPT_KEY='ops:clan-rank-bonus:20260906:season4';
export const TITLE='클랜 순위 기념 보상';
export const CLANS=[
  {id:7,name:'FM',members:21,amount:'5000000000',label:'1위 · 50억'},
  {id:4,name:'한화',members:22,amount:'3000000000',label:'2위 · 30억'},
  ...[[1,'DK'],[2,'삼성'],[3,'T1'],[5,'LG'],[6,'롯데'],[8,'DC']].map(([id,name])=>({id,name,members:22,amount:'1000000000',label:'클랜 참여 · 10억'}))
];
const check=(ok,message)=>{if(!ok)throw new Error(message)};
const q=async(client,sql,values=[]) => (await client.query(sql,values)).rows;
const bodyFor=clan=>`${clan.name} 클랜 · ${clan.label} 코인\n현재 클랜원 1인당 지급하는 특별 보상입니다. 메시지에서 수령해 주세요.\n시즌 종료 자동 정산 보상과는 별개입니다.`;
const hash=async members=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(members.map(m=>[String(m.user_id),Number(m.clan_id)]))))),x=>x.toString(16).padStart(2,'0')).join('');

async function audience(client){
  const [season]=await q(client,'SELECT id,phase FROM clan_seasons ORDER BY id DESC LIMIT 1');
  check(Number(season?.id)===4&&season.phase==='ACTIVE','Current active season differs from season 4');
  const teams=await q(client,CLAN_RANKED_TEAMS_SQL.replace('?', '$1'),[4]);
  check(teams.length===8&&Number(teams[0]?.clan_id)===7&&Number(teams[1]?.clan_id)===4,'FM / Hanwha rank verification failed');
  const members=await q(client,`SELECT m.user_id,m.clan_id FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 ORDER BY m.user_id`,[4]);
  check(members.length===175&&new Set(members.map(m=>String(m.user_id))).size===175,'Expected 175 unique current members');
  for(const clan of CLANS){
    const team=teams.find(t=>Number(t.clan_id)===clan.id);
    check(team?.name===clan.name&&Number(team.member_count)===clan.members&&members.filter(m=>Number(m.clan_id)===clan.id).length===clan.members,`Clan identity / membership changed: ${clan.name}`);
  }
  return {members,fingerprint:await hash(members),ranks:teams.map((t,index)=>({rank:index+1,clanId:Number(t.clan_id),name:t.name,score:Number(t.score),wins:Number(t.wins),losses:Number(t.losses),combatPoints:Number(t.combat_points),difference:Number(t.combat_point_difference),members:Number(t.member_count)}))};
}

async function moneyStorage(client){
  const required=[['users','coin'],['user_message_rewards','reward_amount'],['user_message_reward_claim_receipts_v1222','reward_amount'],['user_message_reward_claim_receipts_v1222','balance_before'],['user_message_reward_claim_receipts_v1222','balance_after'],['coin_logs','change_amount'],['coin_logs','balance_after']];
  const columns=await q(client,`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`,[[...new Set(required.map(([table])=>table))]]);
  return required.map(([table,column])=>({table,column,type:columns.find(c=>c.table_name===table&&c.column_name===column)?.data_type||'MISSING'}));
}

export async function inspectClanRankGift(client){
  const snapshot=await audience(client);
  const [existing]=await q(client,'SELECT COUNT(*) n FROM user_messages WHERE campaign_key=$1 OR title=$2',[CAMPAIGN,TITLE]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY]);
  return {campaign:CAMPAIGN,receiptExists:Boolean(saved),existingMessages:Number(existing.n),fingerprint:snapshot.fingerprint,ranks:snapshot.ranks,
    recipients:175,totalCoin:'303000000000',delivery:'MESSAGE',groups:CLANS,storage:await moneyStorage(client)};
}

export async function verifyClanRankGift(client){
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY]);
  check(saved,'Gift audit receipt is missing');const receipt=JSON.parse(saved.value);
  check(receipt.status==='COMPLETED'&&receipt.campaign===CAMPAIGN&&receipt.title===TITLE&&receipt.delivery==='MESSAGE'&&receipt.noImmediateWalletCredit===true,'Gift receipt contract differs');
  const recipients=new Map((receipt.recipients||[]).map(m=>[String(m.userId),m]));
  check(recipients.size===175&&receipt.recipients.length===175,'Receipt audience differs');
  for(const clan of CLANS)check(receipt.recipients.filter(m=>m.clanId===clan.id&&m.amount===clan.amount).length===clan.members,'Receipt clan distribution differs');
  const messages=await q(client,`SELECT m.id,m.user_id,m.title,m.body,m.message_type,r.id reward_id,r.user_id reward_user_id,r.reward_type,r.reward_amount,r.claimed_at,c.reward_id claim_receipt,c.reward_amount claim_amount
    FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id WHERE m.campaign_key=$1`,[CAMPAIGN]);
  check(messages.length===175,'Message or reward count differs');let total=0n,claimed=0;const seen=new Set();
  for(const m of messages){
    const id=String(m.user_id),recipient=recipients.get(id),clan=CLANS.find(c=>c.id===recipient?.clanId);
    check(clan&&!seen.has(id),'Wrong or duplicate recipient');seen.add(id);
    check(m.title===TITLE&&m.body===bodyFor(clan)&&m.message_type==='COIN_REWARD','Wrong reward message');
    check(String(m.reward_user_id)===id&&m.reward_type==='COIN'&&String(m.reward_amount)===clan.amount,'Wrong coin reward');
    check(receipt.messageIds.includes(String(m.id))&&receipt.rewardIds.includes(String(m.reward_id)),'Receipt message / reward ID mismatch');
    if(m.claimed_at){check(m.claim_receipt!=null&&String(m.claim_amount)===clan.amount,'Claim receipt missing or incorrect');claimed++}
    total+=BigInt(m.reward_amount);
  }
  check(total===303000000000n,'Total differs from 3030억');
  return {ok:true,campaign:CAMPAIGN,recipients:175,messages:messages.length,totalCoin:String(total),groups:CLANS,claimed,pending:175-claimed,completedAt:receipt.completedAt};
}

// Must run inside the caller's transaction. Never credits wallets or settles the season.
export async function sendClanRankGift(client,expectedFingerprint){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[RECEIPT_KEY]);
  const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[RECEIPT_KEY]);
  if(prior)return {...await verifyClanRankGift(client),replayed:true};
  // Keep the exact approved audience stable during this short all-or-nothing batch.
  await client.query('LOCK TABLE clan_members IN SHARE MODE');
  const preview=await inspectClanRankGift(client);
  check(preview.existingMessages===0,'Existing campaign messages require reconciliation, not a second grant');
  check(/^[a-f0-9]{64}$/.test(expectedFingerprint||'')&&preview.fingerprint===expectedFingerprint,'Recipient snapshot changed');
  check(preview.storage.every(c=>c.type==='bigint'),'Coin storage is not BIGINT end-to-end');
  const snapshot=await audience(client);
  const recipients=snapshot.members.map(m=>({userId:String(m.user_id),clanId:Number(m.clan_id),amount:CLANS.find(c=>c.id===Number(m.clan_id)).amount}));
  const ids=recipients.map(m=>m.userId),amounts=recipients.map(m=>m.amount),bodies=recipients.map(m=>bodyFor(CLANS.find(c=>c.id===m.clanId)));
  const messages=await q(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT user_id,'ADMIN',$3,body,'COIN_REWARD',$4 FROM unnest($1::bigint[],$2::text[]) AS audience(user_id,body)
    ON CONFLICT DO NOTHING RETURNING id,user_id`,[ids,bodies,TITLE,CAMPAIGN]);
  check(messages.length===175,'Partial message insert');
  const rewards=await q(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT m.id,m.user_id,'COIN',a.amount FROM user_messages m JOIN unnest($1::bigint[],$2::bigint[]) AS a(user_id,amount) ON a.user_id=m.user_id
    WHERE m.campaign_key=$3 ON CONFLICT DO NOTHING RETURNING id,message_id`,[ids,amounts,CAMPAIGN]);
  check(rewards.length===175,'Partial reward insert');
  const receipt={status:'COMPLETED',campaign:CAMPAIGN,title:TITLE,completedAt:new Date().toISOString(),seasonId:4,fingerprint:snapshot.fingerprint,ranks:snapshot.ranks,recipients,
    messageIds:messages.map(m=>String(m.id)),rewardIds:rewards.map(r=>String(r.id)),totalCoin:'303000000000',delivery:'MESSAGE',noImmediateWalletCredit:true,
    actor:'CODEX_OPERATIONS',authorization:'FM1등으로 바꿔주고 보상 변경해서 지급해 / 클랜원 1인당 메시지 지급'};
  const saved=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now()) RETURNING key',[RECEIPT_KEY,JSON.stringify(receipt)]);
  check(saved.length===1,'Audit receipt insert failed');
  return {...await verifyClanRankGift(client),replayed:false};
}
