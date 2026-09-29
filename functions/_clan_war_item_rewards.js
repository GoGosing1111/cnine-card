import {CLAN_WAR_ITEM_REWARDS_START,clanWarItemRewardRule,validateClanWarItemRewards} from '../shared/clan-war-item-rewards-v1.mjs';
import {clanWarParticipationSettings} from './_clan_participation.js';
import {readLootShopPolicy,LOOT_SHOP_KEY} from './_loot_shop.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const clanWarItemReceiptKey=id=>`clan_war_items_v1:${Number(id)}`;
const SETTINGS_KEY='clan_settings_v1';
const time=value=>Date.parse(String(value||'').includes('T')?value:String(value||'').replace(' ','T')+'Z');

export async function settleClanWarItems(env,warId,settings){
 const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),key=clanWarItemReceiptKey(warId);
 const previous=await p('SELECT value FROM app_meta WHERE key=?',key).first();
 if(previous)return {...JSON.parse(previous.value),replayed:true};
 if(settings.mode!=='ON')return {status:'INELIGIBLE'};
 const war=await p("SELECT * FROM clan_wars WHERE id=? AND round_no<1000 AND status='COMPLETED' AND winner_clan_id IN (clan_a_id,clan_b_id) AND NOT EXISTS(SELECT 1 FROM clan_war_battles b WHERE b.war_id=clan_wars.id AND b.status IN ('PENDING','RESOLVING'))",warId).first();
 if(!war||!Number.isFinite(time(war.starts_at))||time(war.starts_at)<Date.parse(CLAN_WAR_ITEM_REWARDS_START))return {status:'INELIGIBLE'};
 const rule=clanWarItemRewardRule(await clanWarParticipationSettings(env,war,settings));validateClanWarItemRewards(rule);
 const config=await p('SELECT value FROM app_meta WHERE key=?',SETTINGS_KEY).first();
 if(!config||JSON.parse(config.value).mode!=='ON')return {status:'INELIGIBLE'};
 const loot=await readLootShopPolicy(env),minAttacks=loot.policy.sources.find(s=>s.code==='CLAN')?.minAttacks;
 if(!Number.isSafeInteger(minAttacks)||minAttacks<1)throw Error('클랜전 참가 보상 기준을 확인하세요.');
 const rows=(await p(`SELECT m.user_id,m.clan_id,
  MAX(COALESCE((SELECT completed_attacks FROM clan_participation_progress WHERE war_id=? AND user_id=m.user_id),0),
   (SELECT COUNT(*) FROM clan_war_battles b WHERE b.war_id=? AND b.attacker_user_id=m.user_id AND b.attacker_clan_id=m.clan_id AND b.status='COMPLETED')) attacks
  FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id IN (?,?)
   AND REPLACE(SUBSTR(m.joined_at,1,19),'T',' ')<=REPLACE(SUBSTR(?,1,19),'T',' ') ORDER BY m.user_id`,
  warId,warId,war.season_id,war.clan_a_id,war.clan_b_id,war.ends_at).all()).results;
 if(rows.length>100||new Set(rows.map(x=>Number(x.user_id))).size!==rows.length)throw Error('클랜전 보상 명단을 확인하세요.');
 const members=rows.map(row=>({userId:Number(row.user_id),clanId:Number(row.clan_id),attacks:Number(row.attacks)}));
 const grants=members.flatMap(m=>[
  ...(m.attacks>=minAttacks&&rule.roundParticipationMysticEnergy>0?[{userId:m.userId,itemCode:'STARLIGHT_ARMOR_CORE',amount:rule.roundParticipationMysticEnergy}]:[]),
  ...(m.clanId===Number(war.winner_clan_id)&&rule.roundVictoryMasterStars>0?[{userId:m.userId,itemCode:'MASTER_STAR',amount:rule.roundVictoryMasterStars}]:[])
 ]);
 const token=crypto.randomUUID(),at=new Date().toISOString(),reference=`WAR:${warId}:${token}`;
 const receipt={status:'COMPLETED',warId:Number(warId),seasonId:Number(war.season_id),roundNo:Number(war.round_no),winnerClanId:Number(war.winner_clan_id),rule:{...rule,minAttacks},members,grants,token,completedAt:at};
 const packed=JSON.stringify(receipt),owned='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',guard=crypto.randomUUID();
 const statements=[...(DB.dialect==='postgres'?[p('SELECT id FROM clan_wars WHERE id=? FOR UPDATE',warId),p('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR SHARE',SETTINGS_KEY,LOOT_SHOP_KEY)]:[]),
  jointGuard(DB,guard,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM clan_wars WHERE id=? AND status='COMPLETED' AND winner_clan_id=?) AND ${loot.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)'}`,
   [SETTINGS_KEY,config.value,warId,war.winner_clan_id,LOOT_SHOP_KEY,...(loot.raw===null?[]:[loot.raw])]),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',key,packed)];
 const ids=[...new Set(grants.map(g=>g.userId))].sort((a,b)=>a-b);
 if(DB.dialect==='postgres'&&ids.length)statements.push(p(`SELECT id FROM users WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,...ids));
 for(const code of ['STARLIGHT_ARMOR_CORE','MASTER_STAR']){
  const eligible=grants.filter(g=>g.itemCode===code);if(!eligible.length)continue;
  const payload=eligible.map(()=> 'SELECT CAST(? AS BIGINT) user_id,CAST(? AS BIGINT) amount').join(' UNION ALL '),values=eligible.flatMap(g=>[g.userId,g.amount]);
  const safe=crypto.randomUUID();
  statements.push(jointGuard(DB,safe,`NOT (${owned}) OR (EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1) AND NOT EXISTS(SELECT 1 FROM (${payload}) a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN cnine_user_inventory i ON i.user_id=a.user_id AND i.item_code=? WHERE u.id IS NULL OR i.quantity<0 OR i.unseen_quantity<0 OR i.quantity>?-a.amount OR i.unseen_quantity>?-a.amount))`,[key,packed,code,...values,code,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER]));
  statements.push(p(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT a.user_id,?,a.amount,a.amount,?,? FROM (${payload}) a JOIN users u ON u.id=a.user_id WHERE ${owned}
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at`,code,at,at,...values,key,packed));
  statements.push(p(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
   SELECT a.user_id,?,a.amount,i.quantity,?,'CLAN_WAR_ITEMS',? FROM (${payload}) a JOIN cnine_user_inventory i ON i.user_id=a.user_id AND i.item_code=? WHERE ${owned}`,
   code,code==='MASTER_STAR'?'클랜전 회차 승리팀 보상':'클랜전 회차 참가 보상',reference,...values,code,key,packed),jointGuardEnd(DB,safe));
 }
 const count=crypto.randomUUID();statements.push(jointGuard(DB,count,`NOT (${owned}) OR (SELECT COUNT(*) FROM inventory_logs WHERE reference_type='CLAN_WAR_ITEMS' AND reference_id=?)=?`,[key,packed,reference,grants.length]),jointGuardEnd(DB,count),jointGuardEnd(DB,guard));
 try{await DB.batch(statements);}catch(error){const saved=await p('SELECT value FROM app_meta WHERE key=?',key).first();if(saved)return {...JSON.parse(saved.value),replayed:true};throw error;}
 const saved=await p('SELECT value FROM app_meta WHERE key=?',key).first();if(!saved)throw Error('클랜전 아이템 지급 기록을 확인하세요.');
 return {...JSON.parse(saved.value),replayed:JSON.parse(saved.value).token!==token};
}

export async function settlePendingClanWarItems(env,seasonId,settings){
 if(settings.mode!=='ON')return;
 const wars=await env.DB.prepare("SELECT w.id FROM clan_wars w WHERE w.season_id=? AND w.round_no<1000 AND w.status='COMPLETED' AND REPLACE(SUBSTR(w.starts_at,1,19),'T',' ')>=? AND NOT EXISTS(SELECT 1 FROM app_meta m WHERE m.key='clan_war_items_v1:'||CAST(w.id AS TEXT)) ORDER BY w.id LIMIT 4")
  .bind(seasonId,CLAN_WAR_ITEM_REWARDS_START.slice(0,19).replace('T',' ')).all();
 for(const war of wars.results)await settleClanWarItems(env,Number(war.id),settings);
}
