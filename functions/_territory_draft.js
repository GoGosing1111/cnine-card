import {DRAFT_LIMIT,DRAFT_NOTICE_MS,DRAFT_PREP_MS,nextDraftSlot} from './_territory_schedule.js';

export const firstDraftPrize='VICTORY150_ATTACK50_LIMITED_V1';
export const limitedShard='MERCENARY_SSS_LIMITED_SHARD';
export function draftSettlement(win,attacks){
  const bonus=Number(attacks)>=50;
  return {coin:(win?150000000000000:0)+(bonus?50000000000000:0),limitedShards:(win?10:0)+(bonus?5:0)};
}

export function limitedShardStatements(db,reward){
  const n=Number(reward.limitedShards);
  if(!(n>0))return [];
  const available="EXISTS(SELECT 1 FROM territory_war_v3_rewards WHERE round_id=? AND user_id=? AND claimed_at IS NULL)";
  return [
    db.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${available}
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
      unseen_quantity=COALESCE(cnine_user_inventory.unseen_quantity,0)+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`)
      .bind(reward.user_id,limitedShard,n,n,reward.round_id,reward.user_id),
    db.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT user_id,item_code,?,quantity,'TERRITORY_DRAFT_REWARD','TERRITORY_WAR',? FROM cnine_user_inventory
      WHERE user_id=? AND item_code=? AND ${available}`).bind(n,String(reward.round_id),reward.user_id,limitedShard,reward.round_id,reward.user_id)
  ];
}

const iso = ms => new Date(ms).toISOString();
const day = 86400000;
const kstDate = ms => iso(ms + 9 * 3600000).slice(0, 10);

export async function activeDraftRoster(env, deps, cutoff) {
  const last = kstDate(cutoff), first = kstDate(cutoff - 6*day);
  const rows = (await env.DB.prepare(`WITH attendance AS (
    SELECT a.user_id,COUNT(*) days,MAX(a.claimed_at) recent FROM attendance_logs a
    WHERE a.attendance_date BETWEEN ? AND ? AND datetime(a.claimed_at)<=datetime(?) GROUP BY a.user_id
  )
  SELECT u.id user_id,COALESCE(p.card_ids,d.card_ids,'[]') deck_snapshot
  FROM users u LEFT JOIN attendance a ON a.user_id=u.id
  LEFT JOIN pvp_active_presets ap ON ap.user_id=u.id
  LEFT JOIN pvp_deck_presets p ON p.user_id=ap.user_id AND p.preset_no=ap.preset_no
  LEFT JOIN pvp_decks d ON d.user_id=u.id
  WHERE u.status='ACTIVE' AND (u.banned_until IS NULL OR datetime(u.banned_until)<=datetime(?))
    AND (a.user_id IS NOT NULL OR datetime(u.last_login_at) BETWEEN datetime(?) AND datetime(?))
  ORDER BY COALESCE(a.days,0) DESC,
    CASE WHEN COALESCE(datetime(u.last_login_at),'') BETWEEN COALESCE(datetime(a.recent),'') AND datetime(?)
      THEN datetime(u.last_login_at) ELSE datetime(a.recent) END DESC,u.id
  LIMIT ?`).bind(first,last,iso(cutoff),iso(cutoff),iso(Date.parse(first+'T00:00:00+09:00')),iso(cutoff),iso(cutoff),DRAFT_LIMIT).all()).results || [];
  if (!rows.length) return [];
  const battle = await deps.battleSettings(env);
  // PostgreSQL can load the entire roster together. D1 has a smaller binding limit
  // for loadouts that expand into multiple mercenaries per account.
  const chunk=env.DB.dialect==='postgres'?DRAFT_LIMIT:20;
  for (let i=0; i<rows.length; i+=chunk) {
    const group=rows.slice(i,i+chunk), powers=await deps.draftFormationPowers(env,group,battle);
    for (const row of group) {
      const power=powers.get(Number(row.user_id));
      row.formation_power=power?.deckReady ? Math.round(power.power) : 0;
      if (!power?.deckReady) row.deck_snapshot='[]';
    }
  }
  return rows;
}

export function draftInsertStatements(env,roundId,assignments,energy) {
  const fields=['round_id','user_id','side','status','energy','deck_snapshot','deck_power','formation_power',
    'balance_previous_round_id','balance_previous_side','balance_previous_result','balance_previous_attacks',
    'balance_history_rounds','balance_history_active_rounds','balance_history_participation_weight',
    'balance_history_weighted_attacks','balance_history_win_weight','balance_history_loss_weight'];
  const batch=[], marks='('+fields.map(()=>'?').join(',')+')';
  // Five rows keep the number of bindings below the D1 statement limit.
  for(let i=0;i<assignments.length;i+=5){
    const rows=assignments.slice(i,i+5);
    const values=rows.flatMap(({item,side})=>[roundId,item.user_id,side,'ACTIVE',energy,item.deck_snapshot,
      item.formation_power,item.formation_power,...fields.slice(8).map(key=>item[key]??null)]);
    batch.push(env.DB.prepare('INSERT INTO territory_war_v3_users('+fields.join(',')+') VALUES '+rows.map(()=>marks).join(',')).bind(...values));
  }
  return batch;
}

// The public feed contains shared scheduling only. Personal orders use a separate authenticated request.
export function visibleTerritorySchedule(items,now=Date.now()){
  let nextAt=Infinity;
  const visible=[];
  for(const item of items){
    if(item.kind!=='TERRITORY_SCHEDULE'){
      const end=Date.parse(item.deadlineAt);
      if(item.kind==='TERRITORY'&&item.phase==='DRAFT_WAIT'&&now<end-DRAFT_NOTICE_MS){nextAt=Math.min(nextAt,end-DRAFT_NOTICE_MS);continue;}
      if(item.kind==='TERRITORY'&&item.phase==='DRAFT_BATTLE'&&now>=end)continue;
      visible.push(item);continue;
    }
    let cfg;
    try{cfg=JSON.parse(item.detail);}catch{continue;}
    const slot=nextDraftSlot(cfg,now);
    if(!slot||slot.battleAt===item.deadlineAt)continue;
    const notice=Date.parse(slot.noticeAt);
    if(now<notice){nextAt=Math.min(nextAt,notice);continue;}
    visible.push({kind:'TERRITORY',phase:'DRAFT_WAIT',entityId:0,title:cfg.battleName||'영토전',detail:'개전 5분 전 전선 개방',deadlineAt:slot.battleAt,sortOrder:1});
  }
  for(const item of visible){
    if(item.kind!=='TERRITORY'||!item.phase.startsWith('DRAFT_'))continue;
    const end=Date.parse(item.deadlineAt);
    for(const boundary of item.phase==='DRAFT_WAIT'?[end-DRAFT_PREP_MS,end]:[end]){
      if(boundary>now)nextAt=Math.min(nextAt,boundary);
    }
  }
  return {items:visible,nextTerritoryChangeAt:Number.isFinite(nextAt)?iso(nextAt):null};
}

export async function deliverDraftOrder(env,userId,round,cfg,{roundId,delivery,action},now=Date.now()){
  const id=Number(roundId);
  if (!Number.isSafeInteger(id)||id<1||typeof delivery!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(delivery)||
      !['reserve','shown','release'].includes(action)) return {error:'차출 통신 요청을 확인하세요.',status:400};
  const receipt='territory_draft_seen_v1:'+id+':'+userId;
  if(action==='release'){
    await env.DB.prepare('DELETE FROM app_meta WHERE key=? AND value=?').bind(receipt,delivery).run();
    return {released:true};
  }
  if(action==='shown'){
    await env.DB.prepare("UPDATE app_meta SET value='SHOWN',updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?").bind(receipt,delivery).run();
    return {acknowledged:true};
  }
  const battle=Date.parse(round?.draft_battle_at),end=Date.parse(round?.ends_at);
  if(cfg.mode!=='ON'||Number(round?.id)!==id||!Number.isFinite(battle)||
     !['RECRUITING','PREPARING','ACTIVE'].includes(round.status)||Number.isFinite(end)&&now>=end)return {order:null};
  if(now<battle-DRAFT_PREP_MS||round.status==='RECRUITING')return {order:null,retry:true};
  const mine=await env.DB.prepare("SELECT side FROM territory_war_v3_users WHERE round_id=? AND user_id=? AND status='ACTIVE' AND side IN ('A','B')").bind(id,userId).first();
  if(!mine)return {order:null};
  // Only one device can hold the short delivery lease. A vanished tab can be retried;
  // acknowledging the visible dialog permanently consumes this account/round order.
  await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,?
    WHERE EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE id=? AND status IN ('PREPARING','ACTIVE') AND datetime(ends_at)>datetime(?))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    WHERE app_meta.value=? OR (app_meta.value<>'SHOWN' AND datetime(app_meta.updated_at)<=datetime(?))`)
    .bind(receipt,delivery,iso(now),id,iso(now),delivery,iso(now-30000)).run();
  const held=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receipt).first();
  if(held?.value!==delivery)return {order:null,retry:!!held&&held.value!=='SHOWN'};
  return {order:{roundId:id,side:mine.side,teamName:String((mine.side==='A'?cfg.teamAName:cfg.teamBName)||mine.side+' 진영'),
    battleAt:iso(battle),endsAt:round.ends_at,battleName:round.battle_name||'영토전',phase:now<battle?'PREPARING':'ACTIVE'},serverNow:iso(now)};
}

