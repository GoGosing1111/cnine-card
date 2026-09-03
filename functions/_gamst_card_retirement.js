import { ensureUniqueAdvancementFoundation, resolveDominantUniqueStat } from './_unique_advancement.js';

export const GAMST_RETIREMENT_VERSION=2001;
export const GAMST_RETIREMENT_MARKER_KEY='gamst_card_retirement_v2001_completed';
export const GAMST_RETIREMENT_PLAN_TABLE='gamst_card_retirement_v2001_plan';
export const GAMST_RETIREMENT_SOURCE_CARD_IDS=Object.freeze([
  'CN-011CAD85BBB2470F',
  'CN-8D3E40884AC04D2C'
]);

const VERIFICATION_TABLE='gamst_card_retirement_v2001_verifications';
const ADVANCEMENT_TABLE='card_unique_advancements_v1937';
const FUR_REROLL_TICKET='FUR_REROLL_TICKET';
const STANDARD_REASON='GAMST_RETIREMENT_STANDARD_V2001';
const TRANSFER_REASON='GAMST_RETIREMENT_TRANSFER_V2001';

function resultRows(result){return result?.results||[]}
function finiteInteger(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function normalizedType(value){
  const type=String(value||'').trim().toUpperCase();
  if(['ATTACK','ATK','OFFENSE'].includes(type))return 'ATTACK';
  if(['DEFENSE','DEF','GUARD'].includes(type))return 'DEFENSE';
  if(['SPEED','SPD'].includes(type))return 'SPEED';
  if(['HP','HEAL','HEALER','LIFE','RECOVERY'].includes(type))return 'HP';
  return '';
}
function cardDominantType(card={}){
  const dominant=resolveDominantUniqueStat(card);
  return dominant.highest>0?dominant.dominantType:normalizedType(card.powerType??card.power_type);
}
function stableHash(value=''){
  let hash=0x811c9dc5;
  for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,0x01000193)>>>0}
  return hash>>>0;
}
function safeJson(value,fallback){try{return JSON.parse(String(value||''))}catch{return fallback}}
function uniqueNumbers(values){return [...new Set(values.map(Number).filter(Number.isFinite))]}

export function buildGamstRetirementPlan({sources=[],candidates=[],holders=[],ownedCandidates=[],advancements=[],refundByLevel=[]}={}){
  const sourceMap=new Map(sources.map(card=>[String(card.id),card]));
  const missingSources=GAMST_RETIREMENT_SOURCE_CARD_IDS.filter(id=>!sourceMap.has(id));
  if(missingSources.length)throw new Error(`감스트 원본 카드가 없어 정산을 중단했습니다: ${missingSources.join(', ')}`);

  const pools=new Map();
  for(const card of candidates){
    const id=String(card.id||'');
    if(!id||GAMST_RETIREMENT_SOURCE_CARD_IDS.includes(id))continue;
    const dominantType=cardDominantType(card);
    if(!dominantType)continue;
    if(!pools.has(dominantType))pools.set(dominantType,[]);
    pools.get(dominantType).push({...card,id,dominantType});
  }
  for(const pool of pools.values())pool.sort((a,b)=>a.id.localeCompare(b.id));

  const ownedByUser=new Map();
  for(const row of ownedCandidates){
    const userId=Number(row.userId??row.user_id),cardId=String((row.cardId??row.card_id)||'');
    if(!Number.isFinite(userId)||!cardId)continue;
    if(!ownedByUser.has(userId))ownedByUser.set(userId,new Set());
    ownedByUser.get(userId).add(cardId);
  }
  const advancedSources=new Set(advancements.map(row=>`${Number(row.userId??row.user_id)}:${String((row.cardId??row.card_id)||'')}`));
  const selectedByUser=new Map(),plan=[];

  const sortedHolders=[...holders].sort((a,b)=>Number(a.userId??a.user_id)-Number(b.userId??b.user_id)||String(a.cardId??a.card_id).localeCompare(String(b.cardId??b.card_id)));
  for(const row of sortedHolders){
    const userId=Number(row.userId??row.user_id),sourceCardId=String((row.cardId??row.card_id)||''),source=sourceMap.get(sourceCardId);
    const sourceQuantity=Math.max(1,finiteInteger(row.quantity,1)),sourceLevel=Math.max(0,finiteInteger(row.breakthroughLevel??row.breakthrough_level,0));
    if(!Number.isFinite(userId)||!source)throw new Error(`정산 대상 보유 행이 올바르지 않습니다: ${sourceCardId}`);
    const dominantType=cardDominantType(source);
    if(!dominantType)throw new Error(`${source.title||sourceCardId}의 고유속성을 판정할 수 없어 정산을 중단했습니다.`);

    if(sourceLevel>=13){
      const pool=pools.get(dominantType)||[];
      if(!pool.length)throw new Error(`${source.title||sourceCardId}와 같은 ${dominantType} 속성의 활성 FUR 대체 카드가 없습니다.`);
      const owned=ownedByUser.get(userId)||new Set(),selected=selectedByUser.get(userId)||new Set();
      const ordered=[...pool].sort((a,b)=>stableHash(`${userId}:${sourceCardId}:${a.id}`)-stableHash(`${userId}:${sourceCardId}:${b.id}`)||a.id.localeCompare(b.id));
      const target=ordered.find(card=>!owned.has(card.id)&&!selected.has(card.id))
        ||ordered.find(card=>!selected.has(card.id))
        ||ordered.find(card=>!owned.has(card.id))
        ||ordered[0];
      selected.add(target.id);selectedByUser.set(userId,selected);
      plan.push({
        userId,sourceCardId,sourceTitle:String(source.title||sourceCardId),sourceQuantity,sourceLevel,
        dominantType,compensationType:'TRANSFER',targetCardId:target.id,targetTitle:String(target.title||target.id),
        refundShards:0,transferredAdvancement:advancedSources.has(`${userId}:${sourceCardId}`)?1:0
      });
      continue;
    }

    if(sourceLevel>=refundByLevel.length)throw new Error(`${source.title||sourceCardId} +${sourceLevel}의 기존 퇴사 환급표가 없어 정산을 중단했습니다.`);
    if(sourceLevel>10){
      for(let level=11;level<=sourceLevel;level++){
        if(finiteInteger(refundByLevel[level],0)-finiteInteger(refundByLevel[level-1],0)<=0){
          throw new Error(`${source.title||sourceCardId} +${level} 구간의 기존 퇴사 환급 카드조각 설정이 없어 정산을 중단했습니다.`);
        }
      }
    }
    plan.push({
      userId,sourceCardId,sourceTitle:String(source.title||sourceCardId),sourceQuantity,sourceLevel,
      dominantType,compensationType:'STANDARD',targetCardId:null,targetTitle:null,
      refundShards:Math.max(0,finiteInteger(refundByLevel[sourceLevel],0)),transferredAdvancement:0
    });
  }
  return plan;
}

export function rewriteRetiredCardIds(cardIds,userId,plan=[]){
  const replacements=new Map(plan.filter(row=>Number(row.userId)===Number(userId)).map(row=>[String(row.sourceCardId),row.targetCardId?String(row.targetCardId):null]));
  const output=[];
  for(const rawId of Array.isArray(cardIds)?cardIds:[]){
    const id=String(rawId||'');
    const next=replacements.has(id)?replacements.get(id):id;
    if(next&&!output.includes(next))output.push(next);
  }
  return output;
}

function completedSummary(row,{replayed=true}={}){
  const parsed=safeJson(row?.value,null);
  return parsed?.status==='COMPLETED'?{...parsed,replayed}:null;
}

async function ensureFoundation(env){
  const postgres=env.DB?.dialect==='postgres',userIdType=postgres?'BIGINT':'INTEGER';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[
    `CREATE TABLE IF NOT EXISTS ${GAMST_RETIREMENT_PLAN_TABLE}(
      user_id ${userIdType} NOT NULL,source_card_id TEXT NOT NULL,source_title TEXT NOT NULL DEFAULT '',source_quantity INTEGER NOT NULL,
      source_level INTEGER NOT NULL,dominant_type TEXT NOT NULL,compensation_type TEXT NOT NULL,target_card_id TEXT,target_title TEXT,
      refund_shards INTEGER NOT NULL DEFAULT 0,transferred_advancement INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT ${nowDefault},
      PRIMARY KEY(user_id,source_card_id))`,
    `CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE}(
      operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT ${nowDefault})`
  ];
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}

function deckRewriteRows(rows,field,userField,plan){
  const rewrites=[];
  for(const row of rows||[]){
    const userId=Number(row[userField]),before=safeJson(row[field],[]),after=rewriteRetiredCardIds(before,userId,plan);
    if(JSON.stringify(before)!==JSON.stringify(after))rewrites.push({row,userId,before,after});
  }
  return rewrites;
}

export async function ensureGamstCardRetirement(env,{refundByLevel=[]}={}){
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(GAMST_RETIREMENT_MARKER_KEY).first());
  if(existing)return existing;

  await ensureUniqueAdvancementFoundation(env);
  await ensureFoundation(env);
  const sourceResult=await env.DB.prepare(`SELECT c.id,c.title,c.power_type AS powerType,COALESCE(cue.attack_percent,0) AS attackPercent,
      COALESCE(cue.defense_percent,0) AS defensePercent,COALESCE(cue.speed_percent,0) AS speedPercent,COALESCE(cue.hp_percent,0) AS hpPercent
      FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects cue ON cue.card_id=c.id
      WHERE c.id IN (?,?) OR m.name='감스트' OR UPPER(m.name)='GAMST' OR c.title LIKE '%감스트%' ORDER BY c.id`)
    .bind(...GAMST_RETIREMENT_SOURCE_CARD_IDS).all();
  const sources=resultRows(sourceResult),sourceIds=[...new Set(sources.map(card=>String(card.id||'')).filter(Boolean))].sort();
  const missingSourceIds=GAMST_RETIREMENT_SOURCE_CARD_IDS.filter(id=>!sourceIds.includes(id));
  if(missingSourceIds.length)throw new Error(`감스트 원본 카드가 없어 정산을 중단했습니다: ${missingSourceIds.join(', ')}`);
  const sourceIdsSql=sourceIds.map(()=>'?').join(',');
  const [candidateResult,holderResult,advancementResult,ownerResult,pveResult,pvpResult,presetResult,riftResult]=await env.DB.batch([
    env.DB.prepare(`SELECT c.id,c.title,c.power_type AS powerType,COALESCE(cue.attack_percent,0) AS attackPercent,
      COALESCE(cue.defense_percent,0) AS defensePercent,COALESCE(cue.speed_percent,0) AS speedPercent,COALESCE(cue.hp_percent,0) AS hpPercent
      FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id JOIN card_unique_effects cue ON cue.card_id=c.id AND cue.is_active=1
      WHERE UPPER(c.rarity)='FUR' AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1
        AND m.name<>'감스트' AND c.title NOT LIKE '%감스트%'
        AND c.id NOT IN (${sourceIdsSql}) ORDER BY c.id`).bind(...sourceIds),
    env.DB.prepare(`SELECT user_id AS userId,card_id AS cardId,COALESCE(quantity,0) AS quantity,
      COALESCE(breakthrough_level,0) AS breakthroughLevel FROM user_cards
      WHERE card_id IN (${sourceIdsSql}) AND COALESCE(quantity,0)>0 ORDER BY user_id,card_id`).bind(...sourceIds),
    env.DB.prepare(`SELECT user_id AS userId,card_id AS cardId FROM ${ADVANCEMENT_TABLE} WHERE card_id IN (${sourceIdsSql})`).bind(...sourceIds),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' ORDER BY id LIMIT 1"),
    env.DB.prepare(`SELECT user_id,card_ids FROM pve_decks WHERE ${sourceIds.map(()=>`card_ids LIKE ?`).join(' OR ')}`).bind(...sourceIds.map(id=>`%${id}%`)),
    env.DB.prepare(`SELECT user_id,card_ids FROM pvp_decks WHERE ${sourceIds.map(()=>`card_ids LIKE ?`).join(' OR ')}`).bind(...sourceIds.map(id=>`%${id}%`)),
    env.DB.prepare(`SELECT user_id,preset_no,card_ids FROM pvp_deck_presets WHERE ${sourceIds.map(()=>`card_ids LIKE ?`).join(' OR ')}`).bind(...sourceIds.map(id=>`%${id}%`)),
    env.DB.prepare(`SELECT run_id,user_id,deck_cards,state_json,status FROM pve_rift_runs WHERE status='ACTIVE' AND (${sourceIds.map(()=>`deck_cards LIKE ?`).join(' OR ')})`).bind(...sourceIds.map(id=>`%${id}%`))
  ]);
  const candidates=resultRows(candidateResult),candidateIds=candidates.map(card=>String(card.id));
  const ownedCandidates=candidateIds.length?(await env.DB.prepare(`SELECT user_id AS userId,card_id AS cardId FROM user_cards WHERE COALESCE(quantity,0)>0 AND card_id IN (${candidateIds.map(()=>'?').join(',')})`).bind(...candidateIds).all()).results||[]:[];
  const plan=buildGamstRetirementPlan({
    sources,candidates,holders:resultRows(holderResult),ownedCandidates,
    advancements:resultRows(advancementResult),refundByLevel
  });
  const ownerId=Number(resultRows(ownerResult)[0]?.id||0);
  if(!ownerId)throw new Error('감스트 카드 정산 감사 로그를 기록할 OWNER 계정을 찾지 못했습니다.');

  const pveRewrites=deckRewriteRows(resultRows(pveResult),'card_ids','user_id',plan);
  const pvpRewrites=deckRewriteRows(resultRows(pvpResult),'card_ids','user_id',plan);
  const presetRewrites=deckRewriteRows(resultRows(presetResult),'card_ids','user_id',plan);
  const riftRewrites=[];
  for(const row of resultRows(riftResult)){
    const userId=Number(row.user_id),before=safeJson(row.deck_cards,[]),after=rewriteRetiredCardIds(before,userId,plan);
    const state=safeJson(row.state_json,{}),hp={...(state?.hp||{})};
    for(const sourceCardId of sourceIds){
      const replacement=plan.find(item=>item.userId===userId&&item.sourceCardId===sourceCardId)?.targetCardId||null;
      if(Object.prototype.hasOwnProperty.call(hp,sourceCardId)){
        if(replacement&&!Object.prototype.hasOwnProperty.call(hp,replacement))hp[replacement]=hp[sourceCardId];
        delete hp[sourceCardId];
      }
    }
    riftRewrites.push({row,userId,before,after,state:{...state,hp},abandon:after.length!==5});
  }

  const transfers=plan.filter(row=>row.compensationType==='TRANSFER'),standard=plan.filter(row=>row.compensationType==='STANDARD');
  const distribution=new Map();
  for(const row of transfers){const key=`${row.targetCardId}:${row.targetTitle}`;distribution.set(key,(distribution.get(key)||0)+1)}
  const summary={
    status:'COMPLETED',version:GAMST_RETIREMENT_VERSION,completedAt:new Date().toISOString(),sourceCardIds:[...sourceIds],
    ownershipRows:plan.length,affectedUsers:uniqueNumbers(plan.map(row=>row.userId)).length,
    transferRows:transfers.length,transferUsers:uniqueNumbers(transfers.map(row=>row.userId)).length,
    advancementTransfers:transfers.filter(row=>row.transferredAdvancement===1).length,
    standardPolicyRows:standard.length,standardPolicyUsers:uniqueNumbers(standard.map(row=>row.userId)).length,
    refundShards:standard.reduce((sum,row)=>sum+row.refundShards,0),rerollTickets:standard.length,
    targetDistribution:[...distribution].map(([key,count])=>{const split=key.indexOf(':');return {cardId:key.slice(0,split),title:key.slice(split+1),count}}),
    rewrittenDecks:{pve:pveRewrites.length,pvp:pvpRewrites.length,presets:presetRewrites.length},
    activeRifts:{updated:riftRewrites.filter(row=>!row.abandon).length,abandoned:riftRewrites.filter(row=>row.abandon).length},
    gameRemoval:{ownership:true,catalog:true,drawPools:true,uniqueEffects:true,battleSprites:true},
    archivalCardRowsRetained:true
  };
  const runningValue=JSON.stringify({status:'RUNNING',version:GAMST_RETIREMENT_VERSION,nonce:crypto.randomUUID()});
  const completedValue=JSON.stringify(summary),guard=`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)`;
  const guarded=(sql,...values)=>env.DB.prepare(sql.replaceAll('{GUARD}',guard)).bind(...values,GAMST_RETIREMENT_MARKER_KEY,runningValue);
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(GAMST_RETIREMENT_MARKER_KEY,runningValue),
    guarded(`INSERT INTO ${GAMST_RETIREMENT_PLAN_TABLE}(user_id,source_card_id,source_title,source_quantity,source_level,dominant_type,compensation_type,target_card_id,target_title,refund_shards,transferred_advancement)
      SELECT CAST(json_extract(j.value,'$.userId') AS INTEGER),json_extract(j.value,'$.sourceCardId'),json_extract(j.value,'$.sourceTitle'),
        CAST(json_extract(j.value,'$.sourceQuantity') AS INTEGER),CAST(json_extract(j.value,'$.sourceLevel') AS INTEGER),json_extract(j.value,'$.dominantType'),
        json_extract(j.value,'$.compensationType'),NULLIF(json_extract(j.value,'$.targetCardId'),''),NULLIF(json_extract(j.value,'$.targetTitle'),''),
        CAST(json_extract(j.value,'$.refundShards') AS INTEGER),CAST(json_extract(j.value,'$.transferredAdvancement') AS INTEGER)
      FROM json_each(?) j WHERE {GUARD}
      ON CONFLICT(user_id,source_card_id) DO UPDATE SET source_title=excluded.source_title,source_quantity=excluded.source_quantity,
        source_level=excluded.source_level,dominant_type=excluded.dominant_type,compensation_type=excluded.compensation_type,
        target_card_id=excluded.target_card_id,target_title=excluded.target_title,refund_shards=excluded.refund_shards,
        transferred_advancement=excluded.transferred_advancement`,JSON.stringify(plan)),
    guarded(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at)
      SELECT p.user_id,p.target_card_id,p.source_quantity,13,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.compensation_type='TRANSFER' AND {GUARD}
      ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,
        breakthrough_level=MAX(user_cards.breakthrough_level,excluded.breakthrough_level),breakthrough_fail_count=0,last_obtained_at=CURRENT_TIMESTAMP`),
    guarded(`UPDATE ${ADVANCEMENT_TABLE} SET card_id=(SELECT p.target_card_id FROM ${GAMST_RETIREMENT_PLAN_TABLE} p
        WHERE p.user_id=${ADVANCEMENT_TABLE}.user_id AND p.source_card_id=${ADVANCEMENT_TABLE}.card_id AND p.compensation_type='TRANSFER' LIMIT 1),
      updated_at=CURRENT_TIMESTAMP WHERE card_id IN (${sourceIdsSql}) AND EXISTS(
        SELECT 1 FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.user_id=${ADVANCEMENT_TABLE}.user_id
          AND p.source_card_id=${ADVANCEMENT_TABLE}.card_id AND p.compensation_type='TRANSFER')
      AND NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} target_adv JOIN ${GAMST_RETIREMENT_PLAN_TABLE} p
        ON p.user_id=target_adv.user_id AND p.target_card_id=target_adv.card_id
        WHERE p.user_id=${ADVANCEMENT_TABLE}.user_id AND p.source_card_id=${ADVANCEMENT_TABLE}.card_id AND p.compensation_type='TRANSFER')
      AND {GUARD}`,...sourceIds),
    guarded(`UPDATE users SET card_shards=card_shards+COALESCE((SELECT SUM(p.refund_shards) FROM ${GAMST_RETIREMENT_PLAN_TABLE} p
        WHERE p.user_id=users.id AND p.compensation_type='STANDARD'),0)
      WHERE id IN (SELECT user_id FROM ${GAMST_RETIREMENT_PLAN_TABLE} WHERE compensation_type='STANDARD' AND refund_shards>0) AND {GUARD}`),
    guarded(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id)
      SELECT p.user_id,p.refund_shards,u.card_shards,?,p.source_card_id FROM ${GAMST_RETIREMENT_PLAN_TABLE} p JOIN users u ON u.id=p.user_id
      WHERE p.compensation_type='STANDARD' AND p.refund_shards>0 AND {GUARD}`,STANDARD_REASON),
    guarded(`INSERT OR IGNORE INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT DISTINCT p.user_id,?,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM ${GAMST_RETIREMENT_PLAN_TABLE} p
      WHERE p.compensation_type='STANDARD' AND {GUARD}`,FUR_REROLL_TICKET),
    guarded(`UPDATE cnine_user_inventory SET quantity=quantity+(SELECT COUNT(*) FROM ${GAMST_RETIREMENT_PLAN_TABLE} p
        WHERE p.user_id=cnine_user_inventory.user_id AND p.compensation_type='STANDARD'),
      unseen_quantity=unseen_quantity+(SELECT COUNT(*) FROM ${GAMST_RETIREMENT_PLAN_TABLE} p
        WHERE p.user_id=cnine_user_inventory.user_id AND p.compensation_type='STANDARD'),updated_at=CURRENT_TIMESTAMP
      WHERE item_code=? AND user_id IN (SELECT user_id FROM ${GAMST_RETIREMENT_PLAN_TABLE} WHERE compensation_type='STANDARD') AND {GUARD}`,FUR_REROLL_TICKET),
    guarded(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
      SELECT p.user_id,?,1,i.quantity,?,'CARD_RETIREMENT',p.source_card_id,?
      FROM ${GAMST_RETIREMENT_PLAN_TABLE} p JOIN cnine_user_inventory i ON i.user_id=p.user_id AND i.item_code=?
      WHERE p.compensation_type='STANDARD' AND {GUARD}`,FUR_REROLL_TICKET,STANDARD_REASON,ownerId,FUR_REROLL_TICKET),
    guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      SELECT ?,(CASE WHEN p.compensation_type='TRANSFER' THEN ? ELSE ? END),'USER_CARD',CAST(p.user_id AS TEXT),
        CAST(json_object('sourceCardId',p.source_card_id,'quantity',p.source_quantity,'breakthroughLevel',p.source_level) AS TEXT),
        CAST(json_object('policy',p.compensation_type,'targetCardId',COALESCE(p.target_card_id,''),'targetBreakthroughLevel',CASE WHEN p.compensation_type='TRANSFER' THEN 13 ELSE 0 END,
          'dominantType',p.dominant_type,'refundShards',p.refund_shards,'rerollTicket',CASE WHEN p.compensation_type='STANDARD' THEN ? ELSE '' END,
          'advancementTransferred',p.transferred_advancement) AS TEXT)
      FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE {GUARD}`,ownerId,TRANSFER_REASON,STANDARD_REASON,FUR_REROLL_TICKET)
  ];

  for(const item of pveRewrites)statements.push(guarded('UPDATE pve_decks SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND {GUARD}',JSON.stringify(item.after),item.userId));
  for(const item of pvpRewrites)statements.push(guarded('UPDATE pvp_decks SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND {GUARD}',JSON.stringify(item.after),item.userId));
  for(const item of presetRewrites)statements.push(guarded('UPDATE pvp_deck_presets SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND preset_no=? AND {GUARD}',JSON.stringify(item.after),item.userId,Number(item.row.preset_no)));
  for(const item of riftRewrites){
    if(item.abandon)statements.push(guarded("UPDATE pve_rift_runs SET status='ABANDONED',updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status='ACTIVE' AND {GUARD}",String(item.row.run_id)));
    else statements.push(guarded("UPDATE pve_rift_runs SET deck_cards=?,state_json=?,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status='ACTIVE' AND {GUARD}",JSON.stringify(item.after),JSON.stringify(item.state),String(item.row.run_id)));
  }

  statements.push(
    guarded(`UPDATE deck_synergies SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE is_active=1 AND (${sourceIds.map(()=>`required_card_ids LIKE ?`).join(' OR ')}) AND {GUARD}`,...sourceIds.map(id=>`%${id}%`)),
    guarded(`DELETE FROM card_pack_cards WHERE card_id IN (${sourceIdsSql}) AND {GUARD}`,...sourceIds),
    guarded(`DELETE FROM card_acquisition_effects WHERE card_id IN (${sourceIdsSql}) AND {GUARD}`,...sourceIds),
    guarded(`UPDATE card_unique_effects SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE card_id IN (${sourceIdsSql}) AND {GUARD}`,...sourceIds),
    guarded(`DELETE FROM ${ADVANCEMENT_TABLE} WHERE card_id IN (${sourceIdsSql}) AND {GUARD}`,...sourceIds),
    guarded(`DELETE FROM user_cards WHERE card_id IN (${sourceIdsSql}) AND {GUARD}`,...sourceIds),
    guarded(`UPDATE cards SET is_active=0,card_status='RETIRED',draw_weight=0,updated_at=CURRENT_TIMESTAMP
      WHERE id IN (${sourceIdsSql}) AND {GUARD}`,...sourceIds),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        (SELECT COUNT(*) FROM ${GAMST_RETIREMENT_PLAN_TABLE})=?
        AND NOT EXISTS(SELECT 1 FROM user_cards WHERE card_id IN (${sourceIdsSql}) AND COALESCE(quantity,0)>0)
        AND NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE card_id IN (${sourceIdsSql}))
        AND NOT EXISTS(SELECT 1 FROM card_pack_cards WHERE card_id IN (${sourceIdsSql}))
        AND NOT EXISTS(SELECT 1 FROM card_unique_effects WHERE card_id IN (${sourceIdsSql}) AND is_active=1)
        AND NOT EXISTS(SELECT 1 FROM cards WHERE id IN (${sourceIdsSql}) AND (is_active<>0 OR COALESCE(card_status,'')<>'RETIRED'))
        AND NOT EXISTS(SELECT 1 FROM pve_decks WHERE ${sourceIds.map(()=>`card_ids LIKE ?`).join(' OR ')})
        AND NOT EXISTS(SELECT 1 FROM pvp_decks WHERE ${sourceIds.map(()=>`card_ids LIKE ?`).join(' OR ')})
        AND NOT EXISTS(SELECT 1 FROM pvp_deck_presets WHERE ${sourceIds.map(()=>`card_ids LIKE ?`).join(' OR ')})
        AND NOT EXISTS(SELECT 1 FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.compensation_type='TRANSFER' AND NOT EXISTS(
          SELECT 1 FROM user_cards uc WHERE uc.user_id=p.user_id AND uc.card_id=p.target_card_id AND COALESCE(uc.quantity,0)>=p.source_quantity AND COALESCE(uc.breakthrough_level,0)>=13))
        AND NOT EXISTS(SELECT 1 FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.transferred_advancement=1 AND NOT EXISTS(
          SELECT 1 FROM ${ADVANCEMENT_TABLE} a WHERE a.user_id=p.user_id AND a.card_id=p.target_card_id))
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      GAMST_RETIREMENT_MARKER_KEY,plan.length,
      ...sourceIds,...sourceIds,...sourceIds,...sourceIds,...sourceIds,
      ...sourceIds.map(id=>`%${id}%`),...sourceIds.map(id=>`%${id}%`),...sourceIds.map(id=>`%${id}%`),
      completedValue),
    guarded('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=? AND {GUARD}',completedValue,GAMST_RETIREMENT_MARKER_KEY,runningValue)
  );

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(GAMST_RETIREMENT_MARKER_KEY).first());
    if(replay)return replay;
    throw new Error('다른 감스트 카드 정산 작업이 완료되지 않은 상태입니다.');
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(GAMST_RETIREMENT_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('감스트 카드 정산은 실행됐지만 완료 마커 검증에 실패했습니다.');
  console.log('GAMST_CARD_RETIREMENT_V2001',JSON.stringify(stored));
  return stored;
}
