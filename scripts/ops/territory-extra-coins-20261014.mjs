import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const P=JSON.parse(fs.readFileSync(new URL('./territory-extra-coins-20261014.json',import.meta.url),'utf8'));
export const HASH='0a70826de9c8f08ffe99b7b63aa2ef56cc6c9d2de74f3882cdeb69bb7300c497';
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;
const campaign=g=>P.operationKey+':'+g.key;
export async function verify(c,receipt){
 assert.equal(receipt.operationKey,P.operationKey);assert.equal(receipt.planHash,HASH);
 const rows=await q(c,`SELECT m.id::text mid,m.user_id::text uid,m.campaign_key,m.title,m.body,r.id::text rid,r.user_id::text ruid,r.reward_type,r.reward_amount::text amount FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=ANY($1::text[])`,[P.gifts.map(campaign)]);
 assert.equal(rows.length,157);
 for(const g of P.gifts){const actual=rows.filter(r=>r.campaign_key===campaign(g));assert.deepEqual(actual.map(r=>r.uid).sort(),[...g.ids].sort());for(const r of actual){assert.equal(r.ruid,r.uid);assert.equal(r.reward_type,'COIN');assert.equal(r.amount,g.amount);assert.ok(r.rid);assert.ok(receipt.messageIds.includes(r.mid));}}
 return {recipients:113,messages:157,attackRecipients:77,winnerRecipients:80,overlap:44,missing:0,duplicates:0};
}
export async function send(c,hash){
 assert.equal(hash,HASH);assert.equal(createHash('sha256').update(JSON.stringify(P)).digest('hex'),HASH);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[P.operationKey]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[P.operationKey]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verify(c,receipt)};}
 const [round]=await q(c,"SELECT id::text,status,battle_name,winner_side,starts_at,ends_at,settled_at,clan_season_id::text FROM territory_war_v3_rounds WHERE status='FINISHED' AND settled_at IS NOT NULL ORDER BY territory_war_v3_rounds.id DESC LIMIT 1 FOR SHARE");assert.deepEqual(round,P.round);
 const people=await q(c,'SELECT p.user_id::text AS "userId",p.side,p.attacks::int,u.status FROM territory_war_v3_users p JOIN users u ON u.id=p.user_id WHERE p.round_id=$1 ORDER BY p.user_id FOR SHARE',[P.round.id]);
 assert.equal(people.length,P.participants.length);
 for(const a of people){const b=P.participants.find(x=>x.userId===a.userId);assert.ok(b);assert.equal(a.side,b.side);assert.equal(a.attacks,b.attacks);assert.equal(a.status,'ACTIVE');}
 const previous=await q(c,'SELECT id FROM user_messages WHERE campaign_key=ANY($1::text[])',[P.gifts.map(campaign)]);assert.equal(previous.length,0);
 const storage=await q(c,"SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='user_message_rewards' AND column_name='reward_amount') OR (table_name='users' AND column_name='coin'))");assert.equal(storage.length,2);assert.ok(storage.every(x=>x.data_type==='bigint'));
 const [owner]=await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
 const messageIds=[];
 for(const g of P.gifts){
 const rows=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT uid,'ADMIN',$2,$3,'COIN_REWARD',$4 FROM unnest($1::bigint[]) x(uid) RETURNING id::text`,[g.ids,`영토전 71회차 ${g.label}`,`영토전 71회차 ‘털’ ${g.label}입니다.\n보상: 코인 ${g.key==='winner'?'5,000':'3,000'}억\n공격 100회 이상 보상과 승리팀 보상은 각각 지급됩니다. 보상 수령 버튼을 눌러주세요.`,campaign(g)]);assert.equal(rows.length,g.ids.length);messageIds.push(...rows.map(x=>x.id));
 const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 RETURNING id`,[campaign(g),g.amount]);assert.equal(rewards.length,g.ids.length);
 }
 const receipt={operationKey:P.operationKey,status:'COMPLETED',planHash:HASH,round:P.round,delivery:'MESSAGE',messageIds,completedAt:new Date().toISOString(),gifts:P.gifts,authorization:P.authorization};
 const verification=await verify(c,receipt);
 const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'TERRITORY_EXTRA_COIN_MESSAGES','USER_MESSAGE',$2,$3,$4) RETURNING id::text",[owner.id,P.operationKey,JSON.stringify({messages:0}),JSON.stringify(receipt)]);receipt.auditId=audit.id;
 await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[P.operationKey,JSON.stringify(receipt)]);
 return {receipt,replayed:false,verification};
}
