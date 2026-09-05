// V2035: a bounded, atomic evolution batch. The receipt and every debit/grant
// commit together; retrying a lost response reads the receipt, never rolls again.
export const EVOLUTION_BATCH_LIMITS = {maxCards:20,maxAttemptsPerCard:10};
const RECEIPTS='card_evolution_batch_receipts_v2035';
const SCHEMA_KEY='safe_runtime_upgrade_v2035_evolution_batch';

async function ensureSchema(env){
  if((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA_KEY).first())?.value==='1')return;
  const ddl=[`CREATE TABLE IF NOT EXISTS ${RECEIPTS}(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,plan_json TEXT NOT NULL,response_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`];
  if(env.DB.dialect==='postgres')await env.DB.execSchema(ddl);
  else for(const sql of ddl)await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").bind(SCHEMA_KEY).run();
}

export function validateEvolutionBatch(body={}){
  const {evolutionType,cardIds,attemptsPerCard,requestId,expectedPolicy}=body;
  if(!['SSR_TO_MA','MA_TO_PRESTIGE','LIMITED_TO_ZENITH'].includes(evolutionType))throw new Error('진화 종류를 선택하세요.');
  if(typeof requestId!=='string'||!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId))throw new Error('진화 요청 ID가 올바르지 않습니다.');
  if(!Array.isArray(cardIds)||!cardIds.length||cardIds.length>EVOLUTION_BATCH_LIMITS.maxCards||cardIds.some(id=>typeof id!=='string'||!id.trim()||id.length>120)||new Set(cardIds).size!==cardIds.length)throw new Error('서로 다른 카드를 1~20종 선택하세요.');
  if(!Number.isInteger(attemptsPerCard)||attemptsPerCard<1||attemptsPerCard>EVOLUTION_BATCH_LIMITS.maxAttemptsPerCard)throw new Error('카드별 최대 시도 횟수는 1~10회입니다.');
  if(expectedPolicy!==undefined&&(!expectedPolicy||['coinCost','shardCost','masterStarCost','successRate','pityAttempts'].some(key=>!Number.isFinite(expectedPolicy[key])||expectedPolicy[key]<0)))throw new Error('진화 비용과 확률을 다시 확인하세요.');
  return {evolutionType,cardIds,attemptsPerCard,requestId,...(expectedPolicy?{expectedPolicy:Object.fromEntries(['coinCost','shardCost','masterStarCost','successRate','pityAttempts'].map(key=>[key,expectedPolicy[key]]))}:{})};
}

export async function handleEvolutionBatch({request,env,deps,user,settings,overview,pickRandom,randomPercent}){
  let plan;
  try{plan=validateEvolutionBatch(await deps.readBody(request))}catch(error){return deps.json({error:error.message},400)}
  await ensureSchema(env);
  const {evolutionType:type,cardIds,attemptsPerCard,requestId}=plan;
  const planJson=JSON.stringify({evolutionType:type,cardIds,attemptsPerCard,...(plan.expectedPolicy?{expectedPolicy:plan.expectedPolicy}:{})});
  const readReceipt=()=>env.DB.prepare(`SELECT user_id,plan_json,response_json FROM ${RECEIPTS} WHERE request_id=?`).bind(requestId).first();
  const replay=prior=>Number(prior.user_id)!==Number(user.id)||prior.plan_json!==planJson
    ?deps.json({error:'같은 요청 ID를 다른 진화에 사용할 수 없습니다.',code:'EVOLUTION_REQUEST_MISMATCH'},409)
    :deps.json({...JSON.parse(prior.response_json),replayed:true});
  const prior=await readReceipt();if(prior)return replay(prior);
  if(!settings.enabled)return deps.json({error:'현재 카드 진화가 중지되어 있습니다.'},503);
  const data=await overview(env,user.id,settings),rule=data.types[type];
  if(plan.expectedPolicy&&Object.entries(plan.expectedPolicy).some(([key,value])=>Number(rule[key]||0)!==value))return deps.json({error:'진화 비용 또는 확률이 변경되었습니다. 새 조건을 확인한 뒤 다시 시작해 주세요.',code:'EVOLUTION_POLICY_CHANGED'},409);
  const selected=cardIds.map(id=>rule.candidates.find(card=>card.id===id));
  if(selected.some(card=>!card?.eligible))return deps.json({error:'진화할 수 없는 카드가 포함되어 있습니다. 카드와 덱 상태를 다시 확인하세요.',code:'EVOLUTION_STATE_CHANGED'},409);
  if(!rule.resultPool.length)return deps.json({error:'획득 가능한 결과 카드가 없습니다. 재료는 소모되지 않았습니다.',code:'EVOLUTION_POOL_EMPTY'},409);
  const cost={coin:Number(rule.coinCost||0),shards:Number(rule.shardCost||0),stars:Number(rule.masterStarCost||0)};
  const maximumAttempts=cardIds.length*attemptsPerCard;
  const before={coin:data.userResources.coin,shards:data.userResources.cardShards,stars:data.masterStars};
  if(Object.keys(cost).some(key=>cost[key]>0&&before[key]<cost[key]*maximumAttempts))return deps.json({error:'설정한 최대 시도 횟수만큼의 재료가 부족합니다. 카드 수나 시도 횟수를 줄여 주세요.',code:'EVOLUTION_MATERIAL_SHORTAGE'},400);
  const ownedRows=(await env.DB.prepare('SELECT card_id,quantity FROM user_cards WHERE user_id=?').bind(user.id).all()).results||[];
  const ownedBefore=new Map(ownedRows.map(row=>[String(row.card_id),Number(row.quantity)])),owned=new Map(ownedBefore);
  const wallet={...before},spent={coin:0,shards:0,stars:0},bonus={shards:0,stars:0};
  const results=[],attempts=[],pool=[...rule.resultPool];
  for(const card of selected){
    let failed=card.progress.success?0:card.progress.failedAttempts,total=card.progress.success?0:card.progress.totalAttempts;
    const row={source:card,attempts:[],success:false,reward:null,progress:null};
    for(let i=0;i<attemptsPerCard;i++){
      if(!pool.length){row.stoppedReason='획득 가능한 프레스티지 카드를 모두 획득했습니다.';break}
      const isPity=failed+1>=rule.pityAttempts,success=isPity||randomPercent()<rule.successRate;
      total++;
      for(const key of Object.keys(cost)){wallet[key]-=cost[key];spent[key]+=cost[key]}
      const reward=success?pickRandom(pool):null,duplicate=reward?Number(owned.get(String(reward.id))||0)>0:false;
      const rewardShards=success&&duplicate&&type==='SSR_TO_MA'?Number(deps.shardReward?.MA||120):0;
      const masterStarGained=success&&duplicate&&type==='SSR_TO_MA'?1:0;
      wallet.shards+=rewardShards;wallet.stars+=masterStarGained;bonus.shards+=rewardShards;bonus.stars+=masterStarGained;
      const attempt={cardId:card.id,attemptNo:total,success,isPity,reward,duplicate,rewardShards,masterStarGained,balances:{...wallet}};
      attempts.push(attempt);row.attempts.push(attempt);
      if(success){
        owned.set(String(reward.id),Number(owned.get(String(reward.id))||0)+1);
        if(type==='MA_TO_PRESTIGE')pool.splice(pool.findIndex(candidate=>String(candidate.id)===String(reward.id)),1);
        row.success=true;row.reward=reward;failed=0;break;
      }
      failed++;
    }
    row.progress={failedAttempts:failed,totalAttempts:total,success:row.success};
    results.push(row);
  }
  const response={ok:true,requestId,evolutionType:type,attemptsPerCard,maximumAttempts,attemptCount:attempts.length,successCount:results.filter(row=>row.success).length,results,spent,bonus,resources:{coin:wallet.coin,cardShards:wallet.shards,masterStars:wallet.stars},successEffect:rule.successEffect||null,pityAttempts:rule.pityAttempts,successRate:rule.successRate};
  const statements=[],guardId=`evolution-batch:${user.id}:${requestId}`;
  // PostgreSQL READ COMMITTED needs real row locks before snapshot guards.
  // D1's batch is serialized. Never keep a JS per-user lock across requests.
  if(env.DB.dialect==='postgres'){
    statements.push(env.DB.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(user.id));
    statements.push(env.DB.prepare("SELECT item_code FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' FOR UPDATE").bind(user.id));
    statements.push(env.DB.prepare('SELECT card_id FROM user_cards WHERE user_id=? ORDER BY card_id FOR UPDATE').bind(user.id));
    for(const table of ['pve_decks','pvp_decks','pvp_deck_presets'])statements.push(env.DB.prepare(`SELECT user_id FROM ${table} WHERE user_id=? FOR UPDATE`).bind(user.id));
    statements.push(env.DB.prepare('SELECT source_card_id FROM card_evolution_progress WHERE user_id=? ORDER BY source_card_id FOR UPDATE').bind(user.id));
  }
  const guards=[`EXISTS(SELECT 1 FROM users WHERE id=? AND coin=? AND card_shards=?)`,`COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'),0)=?`];
  const guardArgs=[user.id,before.coin,before.shards,user.id,before.stars];
  for(const card of selected){
    guards.push(`EXISTS(SELECT 1 FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND uc.quantity=? AND uc.breakthrough_level=? AND c.rarity=?)`);
    guardArgs.push(user.id,card.id,card.quantity,card.breakthroughLevel,rule.sourceGrade);
    for(const [field,value] of [['failed_attempts',card.progress.failedAttempts],['total_attempts',card.progress.totalAttempts],['is_success',card.progress.success?1:0]]){
      guards.push(`COALESCE((SELECT ${field} FROM card_evolution_progress WHERE user_id=? AND source_card_id=?),0)=?`);guardArgs.push(user.id,card.id,value);
    }
    if(type!=='SSR_TO_MA')for(const table of ['pve_decks','pvp_decks','pvp_deck_presets']){
      guards.push(`NOT EXISTS(SELECT 1 FROM ${table} d,json_each(d.card_ids) j WHERE d.user_id=? AND CAST(j.value AS TEXT)=?)`);guardArgs.push(user.id,card.id);
    }
  }
  const rewards=new Map();
  for(const row of results)if(row.success)rewards.set(String(row.reward.id),(rewards.get(String(row.reward.id))||0)+1);
  for(const [id] of rewards){
    guards.push('COALESCE((SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?),0)=?');guardArgs.push(user.id,id,ownedBefore.get(id)||0);
    guards.push("EXISTS(SELECT 1 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=? AND c.rarity=? AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC')");guardArgs.push(id,rule.targetGrade);
  }
  // Split guards so even D1's per-statement binding limit is respected.
  statements.push(env.DB.prepare(`INSERT INTO ${RECEIPTS}(request_id,user_id,plan_json,response_json) VALUES(?,?,?,?)`).bind(requestId,user.id,planJson,JSON.stringify(response)));
  let offset=0,chunk=[],chunkArgs=[],chunkNo=0;
  const flushGuard=()=>{
    if(!chunk.length)return;
    const id=`${guardId}:${chunkNo++}`;
    statements.push(env.DB.prepare(`INSERT INTO card_evolution_atomic_guard(guard_id,verified) SELECT ?,CASE WHEN ${chunk.join(' AND ')} THEN 1 ELSE 0 END`).bind(id,...chunkArgs));
    statements.push(env.DB.prepare('DELETE FROM card_evolution_atomic_guard WHERE guard_id=?').bind(id));
    chunk=[];chunkArgs=[];
  };
  for(const guard of guards){
    const count=(guard.match(/\?/g)||[]).length;
    if(chunkArgs.length+count>90)flushGuard();
    chunk.push(guard);chunkArgs.push(...guardArgs.slice(offset,offset+count));offset+=count;
  }
  flushGuard();
  statements.push(env.DB.prepare('UPDATE users SET coin=coin-?,card_shards=card_shards-?+? WHERE id=?').bind(spent.coin,spent.shards,bonus.shards,user.id));
  if(spent.stars)statements.push(env.DB.prepare("UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR'").bind(spent.stars,spent.stars,user.id));
  if(bonus.stars)statements.push(env.DB.prepare("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,'MASTER_STAR',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP").bind(user.id,bonus.stars,bonus.stars));
  for(const row of results){
    if(!row.attempts.length)continue;
    if(row.success)statements.push(env.DB.prepare('UPDATE user_cards SET quantity=0,breakthrough_level=0,last_obtained_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_id=?').bind(user.id,row.source.id));
    statements.push(env.DB.prepare(`INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts,is_success,reward_card_id,completed_at,updated_at) VALUES(?,?,?,?,?,?,${row.success?'CURRENT_TIMESTAMP':'NULL'},CURRENT_TIMESTAMP) ON CONFLICT(user_id,source_card_id) DO UPDATE SET failed_attempts=excluded.failed_attempts,total_attempts=excluded.total_attempts,is_success=excluded.is_success,reward_card_id=excluded.reward_card_id,completed_at=excluded.completed_at,updated_at=CURRENT_TIMESTAMP`).bind(user.id,row.source.id,row.progress.failedAttempts,row.progress.totalAttempts,row.success?1:0,row.reward?.id||null));
  }
  for(const [id,count] of rewards)statements.push(env.DB.prepare('INSERT INTO user_cards(user_id,card_id,quantity,first_obtained_at,last_obtained_at) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,last_obtained_at=CURRENT_TIMESTAMP').bind(user.id,id,count));
  // Five rows per insert stays below 100 bind parameters, including all audit fields.
  for(let start=0;start<attempts.length;start+=5){
    const rows=attempts.slice(start,start+5),args=[];
    rows.forEach((a,index)=>{const source=selected.find(card=>card.id===a.cardId);args.push(user.id,a.cardId,a.attemptNo,cost.coin,cost.shards,rule.successRate,a.isPity?1:0,a.success?1:0,a.reward?.id||null,a.duplicate?1:0,a.rewardShards,type,cost.stars,`batch:${requestId}:${start+index}`,a.success?1:0,source.quantity,a.success?0:source.quantity)});
    statements.push(env.DB.prepare(`INSERT INTO card_evolution_logs(user_id,source_card_id,attempt_no,coin_cost,shard_cost,success_rate,is_pity,is_success,reward_card_id,reward_duplicate,reward_shards,evolution_type,master_star_cost,request_id,source_consumed,source_quantity_before,source_quantity_after) VALUES ${rows.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')}`).bind(...args));
  }
  if(spent.coin)statements.push(env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'CARD_EVOLUTION_BATCH')").bind(user.id,-spent.coin,wallet.coin));
  if(spent.shards||bonus.shards)statements.push(env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'CARD_EVOLUTION_BATCH',NULL)").bind(user.id,bonus.shards-spent.shards,wallet.shards));
  if(spent.stars||bonus.stars)statements.push(env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,'MASTER_STAR',?,?,'CARD_EVOLUTION_BATCH','EVOLUTION',?)").bind(user.id,bonus.stars-spent.stars,wallet.stars,requestId));
  try{await env.DB.batch(statements)}catch(error){
    const completed=await readReceipt();if(completed)return replay(completed);
    if(/CHECK|verified|deadlock|serialize/i.test(String(error?.message||error)))return deps.json({error:'카드 또는 재료 상태가 변경되어 진화를 진행하지 않았습니다. 새로 확인해 주세요.',code:'EVOLUTION_STATE_CHANGED'},409);
    throw error;
  }
  return deps.json(response);
}
