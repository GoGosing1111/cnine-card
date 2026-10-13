import assert from 'node:assert/strict';
import {MERCENARY_SSS_SHARD_ITEM as ITEM} from '../../functions/_mercenary_sss_shard.js';
export const KEY='ops:territory:71:sss-shard-message:20261014:v1';
const COIN_KEY='ops:territory:71:extra-coins:20261014:v1';
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;
export async function verify(c,receipt){
 assert.equal(receipt.operationKey,KEY);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.ids.length,80);
 const rows=await q(c,`SELECT m.id::text mid,m.user_id::text uid,r.user_id::text ruid,r.reward_type,r.reward_amount::text amount,r.claimed_at,c.balance_before::text,c.balance_after::text FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id WHERE m.campaign_key=$1`,[KEY]);
 assert.deepEqual(rows.map(r=>r.uid).sort(),[...receipt.ids].sort());
 for(const r of rows){assert.equal(r.ruid,r.uid);assert.equal(r.reward_type,ITEM.code);assert.equal(r.amount,'1');assert.ok(receipt.messageIds.includes(r.mid));if(r.claimed_at)assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),1n);}
 return {recipients:80,messages:rows.length,quantityEach:1,claimed:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0};
}
// Caller owns the transaction: catalog, attachments, audit and receipt commit together.
export async function send(c){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]);if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verify(c,receipt)};}
 const [coin]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR SHARE',[COIN_KEY]);assert.ok(coin);const prior=JSON.parse(coin.value);assert.equal(prior.status,'COMPLETED');assert.equal(prior.round.id,'71');assert.equal(prior.round.winner_side,'A');const ids=prior.gifts.find(g=>g.key==='winner').ids;assert.equal(ids.length,80);assert.equal(new Set(ids).size,80);
 const [round]=await q(c,'SELECT status,winner_side,settled_at FROM territory_war_v3_rounds WHERE id=71 FOR SHARE');assert.equal(round.status,'FINISHED');assert.equal(round.winner_side,'A');assert.equal(round.settled_at,prior.round.settled_at);
 const members=await q(c,"SELECT p.user_id::text uid,u.status FROM territory_war_v3_users p JOIN users u ON u.id=p.user_id WHERE p.round_id=71 AND p.side='A' ORDER BY p.user_id FOR SHARE");assert.deepEqual(members.map(x=>x.uid).sort(),[...ids].sort());assert.ok(members.every(x=>x.status==='ACTIVE'));
 assert.equal((await q(c,'SELECT id FROM user_messages WHERE campaign_key=$1',[KEY])).length,0);
 await c.query(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(code) DO NOTHING`,[ITEM.code,ITEM.name,ITEM.subtitle,ITEM.description,ITEM.category,ITEM.rarity,ITEM.image,ITEM.sortOrder]);
 const [item]=await q(c,'SELECT code,name,category,image_url,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM.code]);assert.equal(item.name,ITEM.name);assert.equal(item.category,'MATERIAL');assert.equal(item.image_url,ITEM.image);assert.equal(Number(item.is_active),1);
 const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT uid,'ADMIN','영토전 71회차 승리팀 추가 보상 · SSS 용병 카드 조각','영토전 71회차 ‘털’ 승리팀 보상입니다.\nSSS 용병 카드 조각 1개를 드립니다. 보상 수령 버튼을 눌러주세요.\n코인 보상은 앞서 별도 메시지로 지급되었습니다.','ITEM_REWARD',$2 FROM unnest($1::bigint[]) x(uid) RETURNING id::text`,[ids,KEY]);assert.equal(messages.length,80);
 const rewards=await q(c,"INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,$2,1 FROM user_messages WHERE campaign_key=$1 RETURNING id::text",[KEY,ITEM.code]);assert.equal(rewards.length,80);
 const receipt={operationKey:KEY,status:'COMPLETED',round:prior.round,ids,messageIds:messages.map(x=>x.id),rewardIds:rewards.map(x=>x.id),item:ITEM,quantityEach:1,delivery:'MESSAGE',completedAt:new Date().toISOString(),authorization:'등록해 이전에 리소스 있을거야; 승리팀 SSS 용병카드조각 1개'};
 const verification=await verify(c,receipt);const [owner]=await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
 const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'TERRITORY_SSS_SHARD_MESSAGES','USER_MESSAGE',$2,$3,$4) RETURNING id::text",[owner.id,KEY,JSON.stringify({messages:0}),JSON.stringify(receipt)]);receipt.auditId=audit.id;
 await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[KEY,JSON.stringify(receipt)]);
 return {receipt,verification,replayed:false};
}
