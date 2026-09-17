import {readLootShopPolicy,LOOT_SHOP_KEY} from './_loot_shop.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const CLAN_PIG_ROUND_RELEASE_KEY='pig_coin_clan_round_release_v1';
export const clanWarPigReceiptKey=id=>`clan_war_pig_coin_v1:${Number(id)}`;
export async function readClanPigRoundRelease(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_PIG_ROUND_RELEASE_KEY).first();
 let value;try{value=JSON.parse(row?.value);}catch{return null;}
 return Number.isSafeInteger(value?.firstSeasonId)&&value.firstSeasonId>0&&Number.isSafeInteger(value?.firstWarId)&&value.firstWarId>0?{...value,raw:row.value}:null;
}
export async function clanWarPigPlan(env,warId){
 const release=await readClanPigRoundRelease(env);if(!release||!Number.isSafeInteger(Number(warId))||Number(warId)<release.firstWarId)return null;
 const {policy,raw}=await readLootShopPolicy(env),rule=policy.sources.find(s=>s.code==='CLAN');
 if(!policy.rewardsEnabled||!rule?.enabled)return null;
 const war=await env.DB.prepare("SELECT * FROM clan_wars WHERE id=? AND season_id>=? AND round_no<1000 AND status='COMPLETED' AND winner_clan_id IN (clan_a_id,clan_b_id) AND NOT EXISTS(SELECT 1 FROM clan_war_battles b WHERE b.war_id=clan_wars.id AND b.status IN ('PENDING','RESOLVING'))").bind(warId,release.firstSeasonId).first();
 if(!war)return null;
 const result=await env.DB.prepare(`SELECT m.user_id,m.clan_id,
  MAX(COALESCE((SELECT p.completed_attacks FROM clan_participation_progress p WHERE p.war_id=? AND p.user_id=m.user_id),0),
   (SELECT COUNT(*) FROM clan_war_battles b WHERE b.war_id=? AND b.attacker_user_id=m.user_id AND b.attacker_clan_id=m.clan_id AND b.status='COMPLETED')) attacks
  FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id IN (?,?)
   AND REPLACE(SUBSTR(m.joined_at,1,19),'T',' ')<=REPLACE(SUBSTR(?,1,19),'T',' ') ORDER BY m.user_id`)
  .bind(warId,warId,war.season_id,war.clan_a_id,war.clan_b_id,war.ends_at).all();
 const members=result.results.map(row=>{const victory=Number(row.clan_id)===Number(war.winner_clan_id)?rule.victoryAmount:0,participation=Number(row.attacks)>=rule.minAttacks?rule.participationAmount:0;return {userId:Number(row.user_id),clanId:Number(row.clan_id),attacks:Number(row.attacks),victory,participation,amount:victory+participation};});
 if(!members.length||new Set(members.map(m=>m.userId)).size!==members.length||members.some(m=>![m.userId,m.clanId,m.attacks,m.amount].every(Number.isSafeInteger)||m.userId<1||m.amount<0))throw Error('클랜전 피그코인 지급 명단을 확인하세요.');
 return {war,release,policyRaw:raw,rule,members,recipients:members.filter(m=>m.amount>0)};
}
export async function settleClanWarPigCoins(env,warId){
 const DB=env.DB,p=(sql,...values)=>DB.prepare(sql).bind(...values),key=clanWarPigReceiptKey(warId);
 const prior=await p('SELECT value FROM app_meta WHERE key=?',key).first();if(prior)return {...JSON.parse(prior.value),replayed:true};
 const plan=await clanWarPigPlan(env,Number(warId));if(!plan)return {status:'INELIGIBLE',warId:Number(warId)};
 const {war,release,policyRaw,rule,members,recipients}=plan,token=crypto.randomUUID(),now=new Date().toISOString(),reference=`WAR:${Number(war.id)}`;
 const receipt={status:'COMPLETED',warId:Number(war.id),seasonId:Number(war.season_id),roundNo:Number(war.round_no),winnerClanId:Number(war.winner_clan_id),reference,source:'CLAN',token,rule,members,recipients:recipients.length,totalAmount:recipients.reduce((n,r)=>n+r.amount,0),completedAt:now};
 const packed=JSON.stringify(receipt),owned='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',guardToken=crypto.randomUUID();
 const statements=[
  ...(DB.dialect==='postgres'?[p('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR SHARE',CLAN_PIG_ROUND_RELEASE_KEY,LOOT_SHOP_KEY),p('SELECT id FROM clan_wars WHERE id=? FOR UPDATE',war.id)]:[]),
  jointGuard(DB,guardToken,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM clan_wars WHERE id=? AND status='COMPLETED' AND winner_clan_id=?)`,[CLAN_PIG_ROUND_RELEASE_KEY,release.raw,LOOT_SHOP_KEY,policyRaw,war.id,war.winner_clan_id]),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',key,packed)
 ];
 if(recipients.length){
  const payload=recipients.map(()=> 'SELECT CAST(? AS BIGINT) user_id,CAST(? AS BIGINT) amount').join(' UNION ALL '),values=recipients.flatMap(r=>[r.userId,r.amount]),ids=recipients.map(r=>r.userId),marks=ids.map(()=>'?').join(',');
  if(DB.dialect==='postgres')statements.push(p(`SELECT id FROM users WHERE id IN (${marks}) ORDER BY id FOR UPDATE`,...ids));
  statements.push(p(`INSERT INTO pig_coin_wallets_v1(user_id,balance) SELECT a.user_id,0 FROM (${payload}) a JOIN users u ON u.id=a.user_id WHERE ${owned} ON CONFLICT(user_id) DO NOTHING`,...values,key,packed));
  if(DB.dialect==='postgres')statements.push(p(`SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id IN (${marks}) ORDER BY user_id FOR UPDATE`,...ids));
  statements.push(p(`INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at)
   SELECT ?||CAST(a.user_id AS TEXT),a.user_id,a.amount,w.balance+a.amount,'CLAN',?,? FROM (${payload}) a JOIN pig_coin_wallets_v1 w ON w.user_id=a.user_id WHERE ${owned}`,`clan-war:${war.id}:${token}:`,reference,now,...values,key,packed));
  const paid='EXISTS(SELECT 1 FROM pig_coin_ledger_v1 l WHERE l.user_id=pig_coin_wallets_v1.user_id AND l.source=\'CLAN\' AND l.reference_id=? AND l.id=?||CAST(l.user_id AS TEXT))';
  statements.push(p(`UPDATE pig_coin_wallets_v1 SET balance=balance+(SELECT l.amount FROM pig_coin_ledger_v1 l WHERE l.user_id=pig_coin_wallets_v1.user_id AND l.source='CLAN' AND l.reference_id=?) WHERE ${paid} AND ${owned}`,reference,reference,`clan-war:${war.id}:${token}:`,key,packed));
  const countToken=crypto.randomUUID();
  statements.push(jointGuard(DB,countToken,`NOT (${owned}) OR (SELECT COUNT(*) FROM pig_coin_ledger_v1 WHERE source='CLAN' AND reference_id=? AND id LIKE ?)=?`,[key,packed,reference,`clan-war:${war.id}:${token}:%`,recipients.length]),jointGuardEnd(DB,countToken));
 }
 statements.push(jointGuardEnd(DB,guardToken));await DB.batch(statements);
 const saved=await p('SELECT value FROM app_meta WHERE key=?',key).first();if(!saved)throw Error('클랜전 피그코인 지급 기록을 확인하세요.');
 const result=JSON.parse(saved.value);return {...result,replayed:result.token!==token};
}
export async function settlePendingClanWarPigCoins(env,seasonId,settings){
 if(settings.mode!=='ON')return;
 const release=await readClanPigRoundRelease(env);if(!release||Number(seasonId)<release.firstSeasonId)return;
 const {policy}=await readLootShopPolicy(env);if(!policy.rewardsEnabled||!policy.sources.find(s=>s.code==='CLAN')?.enabled)return;
 const rows=await env.DB.prepare("SELECT w.id FROM clan_wars w WHERE w.season_id=? AND w.id>=? AND w.round_no<1000 AND w.status='COMPLETED' AND NOT EXISTS(SELECT 1 FROM app_meta m WHERE m.key='clan_war_pig_coin_v1:'||CAST(w.id AS TEXT)) ORDER BY w.id LIMIT 4").bind(seasonId,release.firstWarId).all();
 for(const war of rows.results)await settleClanWarPigCoins(env,Number(war.id));
}
