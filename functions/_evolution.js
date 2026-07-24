const DEFAULTS={
  enabled:true,
  ssrToMaMasterStarCost:1,
  maToPrestigeMasterStarCost:1
};
const EVOLUTION_TYPES={
  SSR_TO_MA:{sourceGrade:'SSR',targetGrade:'MA',minBreakthrough:10,label:'SSR → MA'},
  MA_TO_PRESTIGE:{sourceGrade:'MA',targetGrade:'PRESTIGE',minBreakthrough:13,label:'MA +13 → PRESTIGE'}
};

const clampInt=(value,fallback,min=0,max=999999)=>{
  const n=Number(value);
  return Number.isFinite(n)?Math.min(max,Math.max(min,Math.floor(n))):fallback;
};
const normalizeType=value=>EVOLUTION_TYPES[String(value||'').toUpperCase()]?String(value).toUpperCase():'SSR_TO_MA';
const resultRows=result=>Array.isArray(result?.results)?result.results:[];
const firstRow=result=>resultRows(result)[0]||null;
const parseDeck=row=>{try{return new Set(JSON.parse(row?.card_ids||'[]').map(String))}catch{return new Set()}};

async function tableColumns(env,table){
  const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return new Set((rows.results||[]).map(row=>String(row.name)));
}

async function runUpgrade(env){
  for(const sql of [
    `CREATE TABLE IF NOT EXISTS card_evolution_progress(user_id INTEGER NOT NULL,source_card_id TEXT NOT NULL,failed_attempts INTEGER NOT NULL DEFAULT 0,total_attempts INTEGER NOT NULL DEFAULT 0,is_success INTEGER NOT NULL DEFAULT 0,reward_card_id TEXT,completed_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,source_card_id))`,
    `CREATE TABLE IF NOT EXISTS card_evolution_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,source_card_id TEXT NOT NULL,attempt_no INTEGER NOT NULL,coin_cost INTEGER NOT NULL DEFAULT 0,shard_cost INTEGER NOT NULL DEFAULT 0,success_rate REAL NOT NULL DEFAULT 100,is_pity INTEGER NOT NULL DEFAULT 0,is_success INTEGER NOT NULL DEFAULT 1,reward_card_id TEXT,reward_duplicate INTEGER NOT NULL DEFAULT 0,reward_shards INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS card_evolution_atomic_guard(guard_id TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1))`,
    `CREATE INDEX IF NOT EXISTS idx_evolution_logs_user ON card_evolution_logs(user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_evolution_progress_success ON card_evolution_progress(is_success,updated_at)`
  ])await env.DB.prepare(sql).run();

  const columns=await tableColumns(env,'card_evolution_logs');
  const additions=[
    ['evolution_type',"TEXT NOT NULL DEFAULT 'SSR_TO_MA'"],
    ['master_star_cost','INTEGER NOT NULL DEFAULT 0'],
    ['request_id','TEXT'],
    ['source_consumed','INTEGER NOT NULL DEFAULT 0']
  ];
  for(const [name,type] of additions){
    if(!columns.has(name))await env.DB.prepare(`ALTER TABLE card_evolution_logs ADD COLUMN ${name} ${type}`).run();
  }
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_evolution_logs_request_id ON card_evolution_logs(request_id) WHERE request_id IS NOT NULL`).run();
  await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1157_evolution_ui_master_star','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").run();
}
let upgradePromise=null;
async function upgrade(env){
  if(!upgradePromise)upgradePromise=(async()=>{
    const done=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1157_evolution_ui_master_star'").first();
    if(done?.value==='1')return;
    await runUpgrade(env);
  })().catch(error=>{upgradePromise=null;throw error});
  return upgradePromise;
}

function cleanSettings(raw={}){
  return {
    enabled:raw.enabled!==false,
    ssrToMaMasterStarCost:clampInt(raw.ssrToMaMasterStarCost,DEFAULTS.ssrToMaMasterStarCost,1,9999),
    maToPrestigeMasterStarCost:clampInt(raw.maToPrestigeMasterStarCost,DEFAULTS.maToPrestigeMasterStarCost,1,9999)
  };
}
async function config(env){
  const rows=await env.DB.batch([
    env.DB.prepare("SELECT value FROM app_meta WHERE key='card_evolution_settings_v2'"),
    env.DB.prepare("SELECT value FROM app_meta WHERE key='card_evolution_settings_v1'")
  ]);
  const v2=firstRow(rows[0]);
  if(v2?.value){try{return cleanSettings(JSON.parse(v2.value))}catch{}}
  const legacy=firstRow(rows[1]);
  if(legacy?.value){try{return cleanSettings({enabled:JSON.parse(legacy.value).enabled})}catch{}}
  return {...DEFAULTS};
}
function costForType(settings,type){
  return type==='MA_TO_PRESTIGE'?Number(settings.maToPrestigeMasterStarCost||0):Number(settings.ssrToMaMasterStarCost||0);
}
function pickRandom(items){
  if(!items.length)return null;
  try{const values=new Uint32Array(1);crypto.getRandomValues(values);return items[values[0]%items.length]}catch{return items[Math.floor(Math.random()*items.length)]}
}
function candidatePayload(row,rule,pveDeck,pvpDeck){
  const id=String(row.id),level=Number(row.breakthrough_level||0),inPve=pveDeck.has(id),inPvp=pvpDeck.has(id);
  let blockedReason='';
  if(level<rule.minBreakthrough)blockedReason=`${rule.sourceGrade} +${rule.minBreakthrough} 강화가 필요합니다.`;
  else if(inPve)blockedReason='현재 PVE 덱에 편성된 카드입니다.';
  else if(inPvp)blockedReason='현재 PVP 덱에 편성된 카드입니다.';
  return {
    id,title:row.title,name:row.name,grade:row.grade,image:row.image,
    focusX:Number(row.focusX??50),focusY:Number(row.focusY??50),
    breakthroughLevel:level,quantity:Number(row.quantity||0),
    basePower:Number(row.base_power||0),powerType:String(row.power_type||''),
    inPve,inPvp,eligible:!blockedReason,blockedReason
  };
}
async function overview(env,userId,settings){
  const results=await env.DB.batch([
    env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId),
    env.DB.prepare(`SELECT uc.card_id AS id,uc.quantity,uc.breakthrough_level,c.title,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.power_type,c.base_power,m.name
      FROM user_cards uc JOIN cards c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id
      WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND c.rarity IN ('SSR','MA')
      ORDER BY CASE c.rarity WHEN 'MA' THEN 2 ELSE 1 END DESC,uc.breakthrough_level DESC,m.sort_order,c.title`).bind(userId),
    env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY
      FROM cards c JOIN members m ON m.id=c.member_id
      WHERE c.rarity='MA' AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.limited_total IS NULL
      ORDER BY m.sort_order,c.title`),
    env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY
      FROM cards c JOIN members m ON m.id=c.member_id
      WHERE c.rarity='PRESTIGE' AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.limited_total IS NULL
      ORDER BY m.sort_order,c.title`),
    env.DB.prepare('SELECT card_ids FROM pve_decks WHERE user_id=?').bind(userId),
    env.DB.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').bind(userId)
  ]);
  const masterStars=Number(firstRow(results[0])?.quantity||0),owned=resultRows(results[1]),pveDeck=parseDeck(firstRow(results[4])),pvpDeck=parseDeck(firstRow(results[5]));
  const build=(type,poolResult)=>{
    const rule=EVOLUTION_TYPES[type],cost=costForType(settings,type);
    const candidates=owned.filter(row=>String(row.grade).toUpperCase()===rule.sourceGrade).map(row=>candidatePayload(row,rule,pveDeck,pvpDeck));
    return {
      type,label:rule.label,sourceGrade:rule.sourceGrade,targetGrade:rule.targetGrade,minBreakthrough:rule.minBreakthrough,
      masterStarCost:cost,candidates,resultPool:resultRows(poolResult).map(row=>({...row,focusX:Number(row.focusX??50),focusY:Number(row.focusY??50)})),
      eligibleCount:candidates.filter(card=>card.eligible).length
    };
  };
  return {settings,masterStars,types:{SSR_TO_MA:build('SSR_TO_MA',results[2]),MA_TO_PRESTIGE:build('MA_TO_PRESTIGE',results[3])}};
}

async function cardInCurrentDeck(env,userId,cardId){
  const rows=await env.DB.batch([
    env.DB.prepare('SELECT card_ids FROM pve_decks WHERE user_id=?').bind(userId),
    env.DB.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').bind(userId)
  ]);
  if(parseDeck(firstRow(rows[0])).has(String(cardId)))return '현재 PVE 덱에 편성된 카드입니다.';
  if(parseDeck(firstRow(rows[1])).has(String(cardId)))return '현재 PVP 덱에 편성된 카드입니다.';
  return '';
}

export async function handleEvolution({path,request,env,deps}){
  if(!path.startsWith('evolution/')&&!path.startsWith('admin/evolution'))return null;
  await upgrade(env);
  const user=await deps.authenticate(request,env);
  if(!user)return deps.json({error:'로그인이 필요합니다.'},401);

  if(path==='admin/evolution/settings'){
    if(!deps.isAdminRole(user))return deps.json({error:'OWNER 또는 ADMIN 권한이 필요합니다.'},403);
    if(request.method==='PATCH'){
      const body=await deps.readBody(request),clean=cleanSettings(body);
      await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('card_evolution_settings_v2',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(clean)).run();
      return deps.json({ok:true,settings:clean});
    }
    const logs=await env.DB.prepare(`SELECT l.*,u.nickname,c.title source_title,r.title reward_title
      FROM card_evolution_logs l JOIN users u ON u.id=l.user_id JOIN cards c ON c.id=l.source_card_id LEFT JOIN cards r ON r.id=l.reward_card_id
      ORDER BY l.id DESC LIMIT 50`).all();
    return deps.json({settings:await config(env),logs:logs.results||[]});
  }

  const settings=await config(env);
  if(path==='evolution/overview'&&request.method==='GET')return deps.json(await overview(env,user.id,settings));

  if(path==='evolution/status'&&request.method==='GET'){
    const cardId=String(new URL(request.url).searchParams.get('cardId')||'').trim();
    const data=await overview(env,user.id,settings);
    const card=Object.values(data.types).flatMap(type=>type.candidates).find(item=>item.id===cardId)||null;
    return deps.json({...data,card});
  }

  if(path==='evolution/attempt'&&request.method==='POST'){
    if(!settings.enabled)return deps.json({error:'현재 카드 진화가 중지되어 있습니다.'},503);
    const body=await deps.readBody(request),type=normalizeType(body.evolutionType),rule=EVOLUTION_TYPES[type],cardId=String(body.cardId||'').trim(),requestId=String(body.requestId||'').trim();
    if(!cardId)return deps.json({error:'진화할 카드를 선택하세요.'},400);
    if(!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))return deps.json({error:'진화 요청 ID가 올바르지 않습니다.'},400);
    const prior=await env.DB.prepare('SELECT id FROM card_evolution_logs WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
    if(prior)return deps.json({error:'이미 처리된 진화 요청입니다.',code:'EVOLUTION_DUPLICATE_REQUEST'},409);

    const source=await env.DB.prepare(`SELECT uc.quantity,uc.breakthrough_level,c.id,c.title,c.rarity AS grade
      FROM user_cards uc JOIN cards c ON c.id=uc.card_id
      WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(user.id,cardId).first();
    if(!source)return deps.json({error:'보유한 카드가 아닙니다.'},404);
    if(String(source.grade).toUpperCase()!==rule.sourceGrade||Number(source.breakthrough_level||0)<rule.minBreakthrough)return deps.json({error:`${rule.sourceGrade} +${rule.minBreakthrough} 강화 카드만 진화할 수 있습니다.`},400);
    const deckReason=await cardInCurrentDeck(env,user.id,cardId);
    if(deckReason)return deps.json({error:deckReason},409);

    const masterStarCost=costForType(settings,type);
    const starRow=await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first();
    const masterStarBefore=Number(starRow?.quantity||0);
    if(masterStarBefore<masterStarCost)return deps.json({error:`마스터의 별이 ${masterStarCost-masterStarBefore}개 부족합니다.`},400);

    const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY
      FROM cards c JOIN members m ON m.id=c.member_id
      WHERE c.rarity=? AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND c.limited_total IS NULL
      ORDER BY c.id`).bind(rule.targetGrade).all()).results||[];
    if(!pool.length)return deps.json({error:`획득 가능한 공개 ${rule.targetGrade} 카드가 없습니다. CMS 카드 설정을 확인하세요.`},503);
    const reward=pickRandom(pool);
    const duplicate=Boolean(await env.DB.prepare('SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND COALESCE(quantity,0)>0').bind(user.id,reward.id).first());
    const rewardShards=duplicate?Number(deps.shardReward?.[rule.targetGrade]||0):0;
    const masterStarGained=duplicate&&rule.targetGrade==='MA'?1:0;
    const guardId=`${user.id}:${requestId}`;

    const statements=[
      env.DB.prepare(`INSERT INTO card_evolution_atomic_guard(guard_id,verified)
        SELECT ?,CASE WHEN EXISTS(
          SELECT 1 FROM user_cards uc JOIN cards c ON c.id=uc.card_id
          WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0 AND c.rarity=? AND COALESCE(uc.breakthrough_level,0)>=?
        ) AND EXISTS(
          SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity>=?
        ) THEN 1 ELSE 0 END`).bind(guardId,user.id,cardId,rule.sourceGrade,rule.minBreakthrough,user.id,masterStarCost),
      env.DB.prepare('UPDATE user_cards SET quantity=0,breakthrough_level=0,last_obtained_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_id=? AND quantity>0').bind(user.id,cardId),
      env.DB.prepare("UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND quantity>=?").bind(masterStarCost,masterStarCost,user.id,masterStarCost),
      env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity,first_obtained_at,last_obtained_at) VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,reward.id)
    ];
    if(rewardShards>0){
      statements.push(env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(rewardShards,user.id));
      statements.push(env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT ?,?,card_shards,'EVOLUTION_DUPLICATE',? FROM users WHERE id=?").bind(user.id,rewardShards,reward.id,user.id));
    }
    statements.push(env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'MASTER_STAR',-?,quantity,'CARD_EVOLUTION','EVOLUTION',? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id,masterStarCost,requestId,user.id));
    if(masterStarGained){
      statements.push(env.DB.prepare("UPDATE cnine_user_inventory SET quantity=quantity+1,unseen_quantity=unseen_quantity+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id));
      statements.push(env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'MASTER_STAR',1,quantity,'MA_DUPLICATE','EVOLUTION',? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id,requestId,user.id));
    }
    statements.push(
      env.DB.prepare(`INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts,is_success,reward_card_id,completed_at,updated_at)
        VALUES(?,?,0,1,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,source_card_id) DO UPDATE SET failed_attempts=0,total_attempts=card_evolution_progress.total_attempts+1,is_success=1,reward_card_id=excluded.reward_card_id,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(user.id,cardId,reward.id),
      env.DB.prepare(`INSERT INTO card_evolution_logs(user_id,source_card_id,attempt_no,coin_cost,shard_cost,success_rate,is_pity,is_success,reward_card_id,reward_duplicate,reward_shards,evolution_type,master_star_cost,request_id,source_consumed)
        VALUES(?,?,1,0,0,100,0,1,?,?,?,?,?,?,1)`).bind(user.id,cardId,reward.id,duplicate?1:0,rewardShards,type,masterStarCost,requestId),
      env.DB.prepare('DELETE FROM card_evolution_atomic_guard WHERE guard_id=?').bind(guardId)
    );

    try{await env.DB.batch(statements)}catch(error){
      const message=String(error?.message||error||'');
      if(/request_id|UNIQUE/i.test(message))return deps.json({error:'이미 처리된 진화 요청입니다.',code:'EVOLUTION_DUPLICATE_REQUEST'},409);
      if(/CHECK constraint|verified/i.test(message))return deps.json({error:'진화 재료 또는 대상 카드 상태가 변경되었습니다. 다시 확인해주세요.',code:'EVOLUTION_STATE_CHANGED'},409);
      throw error;
    }
    const [updated,starAfter]=await Promise.all([
      env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first(),
      env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id).first()
    ]);
    return deps.json({
      ok:true,success:true,evolutionType:type,sourceConsumed:true,source:{id:cardId,title:source.title,grade:source.grade,breakthroughLevel:Number(source.breakthrough_level||0)},
      reward:{...reward,focusX:Number(reward.focusX??50),focusY:Number(reward.focusY??50)},duplicate,rewardShards,masterStarGained,masterStarCost,masterStarsAfter:Number(starAfter?.quantity||0),
      user:await deps.profile(env,updated)
    });
  }

  return deps.json({error:'진화 API를 찾을 수 없습니다.'},404);
}
