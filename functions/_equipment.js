/* V1231 CHARACTER EQUIPMENT + TITLE SYSTEM */
const EQUIPMENT_SLOTS=['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'];
const EQUIPMENT_SLOT_LABELS={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
const EQUIPMENT_SUBTYPES=['MODERN_SWORD','AXE','PISTOL','TOP','BOTTOM','SHOES','DUAL_DISK'];
const SOURCE_TYPES=['PVE','PVE_AUTO','TOWER','RAID','RIFT','PVP','CAPTAIN'];
const TITLE_UNLOCK_TYPES=['MANUAL','COLLECTION_COUNT','GRADE_COUNT','MEMBER_COMPLETE','CARD_SET','CONTENT_CLEAR'];
let foundationPromise=null;

function cleanText(value,max=120){return String(value??'').trim().slice(0,max)}
function cleanInt(value,min=0,max=100000000){const n=Math.floor(Number(value)||0);return Math.max(min,Math.min(max,n))}
function cleanRate(value){const n=Number(value);return Math.max(0,Math.min(100,Number.isFinite(n)?n:0))}
function cleanBool(value,defaultValue=true){if(value===undefined||value===null)return defaultValue;return value===true||value===1||String(value)==='1'}
function normalizeSlot(value){const x=String(value||'').trim().toUpperCase();return EQUIPMENT_SLOTS.includes(x)?x:''}
function normalizeSubtype(value){const x=String(value||'').trim().toUpperCase();return EQUIPMENT_SUBTYPES.includes(x)?x:''}
function normalizeSource(value){const x=String(value||'').trim().toUpperCase();return SOURCE_TYPES.includes(x)?x:''}
function parseJson(value,fallback={}){try{const x=typeof value==='string'?JSON.parse(value):value;return x&&typeof x==='object'?x:fallback}catch{return fallback}}
function itemPower(total){const safe=cleanInt(total,0,100000000),pve=Math.floor(safe*.9);return {total:safe,pve,pvp:safe-pve}}
function isAdmin(user){return Boolean(user&&['OWNER','ADMIN'].includes(String(user.role||'').toUpperCase()))}

export async function ensureEquipmentFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1231_character_equipment_titles'").first();
    if(marker?.value==='1')return true;
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_equipment_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        slot TEXT NOT NULL,
        subtype TEXT NOT NULL DEFAULT '',
        rarity TEXT NOT NULL DEFAULT 'NORMAL',
        image_url TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        total_power INTEGER NOT NULL DEFAULT 0,
        pve_power INTEGER NOT NULL DEFAULT 0,
        pvp_power INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_public INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_equipment_instances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'ADMIN',
        source_id TEXT NOT NULL DEFAULT '',
        request_id TEXT,
        acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_equipment_loadout (
        user_id INTEGER NOT NULL,
        slot TEXT NOT NULL,
        instance_id INTEGER NOT NULL UNIQUE,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id,slot)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_titles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        badge_text TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        pve_power INTEGER NOT NULL DEFAULT 0,
        unlock_type TEXT NOT NULL DEFAULT 'MANUAL',
        unlock_config_json TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1,
        is_public INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_character_titles (
        user_id INTEGER NOT NULL,
        title_id INTEGER NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'SYSTEM',
        source_id TEXT NOT NULL DEFAULT '',
        unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id,title_id)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_title_loadout (
        user_id INTEGER PRIMARY KEY,
        title_id INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_title_progress_events (
        user_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_key TEXT NOT NULL,
        first_cleared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        clear_count INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id,event_type,event_key)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipment_drop_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_key TEXT NOT NULL DEFAULT '*',
        enabled INTEGER NOT NULL DEFAULT 1,
        drop_rate REAL NOT NULL DEFAULT 0,
        max_drops INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_type,source_key)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipment_drop_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(profile_id,equipment_id)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipment_drop_receipts (
        request_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        source_key TEXT NOT NULL DEFAULT '',
        profile_id INTEGER,
        result TEXT NOT NULL DEFAULT 'PENDING',
        equipment_instance_id INTEGER,
        response_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(request_id,user_id,source_type,source_key)
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_equipment_instances_user ON user_equipment_instances(user_id,acquired_at DESC,id DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_equipment_instances_item ON user_equipment_instances(equipment_id,user_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_equipment_loadout_user ON user_equipment_loadout(user_id,slot)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_titles_user ON user_character_titles(user_id,unlocked_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_equipment_drop_profiles_source ON equipment_drop_profiles(source_type,source_key,enabled)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_equipment_drop_entries_profile ON equipment_drop_entries(profile_id,is_active,weight)'),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1231_character_equipment_titles','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

function publicItem(row){return {id:Number(row.id),code:row.code,name:row.name,slot:row.slot,slotLabel:EQUIPMENT_SLOT_LABELS[row.slot]||row.slot,subtype:row.subtype,rarity:row.rarity,image:row.image_url||'',description:row.description||'',totalPower:Number(row.total_power||0),pvePower:Number(row.pve_power||0),pvpPower:Number(row.pvp_power||0),isActive:row.is_active!==0,isPublic:row.is_public!==0,sortOrder:Number(row.sort_order||0)}}
function publicTitle(row,owned=false,equipped=false){return {id:Number(row.id),code:row.code,name:row.name,description:row.description||'',badgeText:row.badge_text||row.name,image:row.image_url||'',pvePower:Number(row.pve_power||0),unlockType:row.unlock_type,unlockConfig:parseJson(row.unlock_config_json,{}),isActive:row.is_active!==0,isPublic:row.is_public!==0,sortOrder:Number(row.sort_order||0),owned:Boolean(owned),equipped:Boolean(equipped),unlockedAt:row.unlocked_at||null}}

async function grantTitle(env,userId,titleId,sourceType='SYSTEM',sourceId=''){
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id) VALUES(?,?,?,?)`).bind(userId,titleId,cleanText(sourceType,40),cleanText(sourceId,120)).run();
  return Number(result?.meta?.changes||0)>0;
}

async function userCollectionState(env,userId){
  const [owned,allCards]=await Promise.all([
    env.DB.prepare(`SELECT c.id,c.rarity,c.member_id FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')`).bind(userId).all(),
    env.DB.prepare(`SELECT id,rarity,member_id FROM cards_effective_v1210 WHERE is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC'`).all()
  ]);
  const ownedIds=new Set(owned.results.map(row=>String(row.id))),gradeCounts={},memberOwned={};
  for(const row of owned.results){const grade=String(row.rarity||'').toUpperCase();gradeCounts[grade]=(gradeCounts[grade]||0)+1;const member=String(row.member_id);memberOwned[member]=(memberOwned[member]||0)+1}
  const memberTotals={};for(const row of allCards.results){const member=String(row.member_id);memberTotals[member]=(memberTotals[member]||0)+1}
  return {ownedIds,totalOwned:ownedIds.size,gradeCounts,memberOwned,memberTotals};
}

function collectionConditionMet(title,state){
  const type=String(title.unlock_type||'').toUpperCase(),cfg=parseJson(title.unlock_config_json,{});
  if(type==='COLLECTION_COUNT')return state.totalOwned>=cleanInt(cfg.count,1,100000);
  if(type==='GRADE_COUNT'){const grade=String(cfg.grade||'').toUpperCase();return Number(state.gradeCounts[grade]||0)>=cleanInt(cfg.count,1,100000)}
  if(type==='MEMBER_COMPLETE'){const member=String(cfg.memberId??cfg.member_id??'');return member&&Number(state.memberTotals[member]||0)>0&&Number(state.memberOwned[member]||0)>=Number(state.memberTotals[member]||0)}
  if(type==='CARD_SET'){const ids=Array.isArray(cfg.cardIds)?cfg.cardIds.map(String):[];return ids.length>0&&ids.every(id=>state.ownedIds.has(id))}
  return false;
}

export async function syncCollectionTitles(env,userId){
  await ensureEquipmentFoundation(env);
  const rows=await env.DB.prepare(`SELECT * FROM character_titles WHERE is_active=1 AND unlock_type IN ('COLLECTION_COUNT','GRADE_COUNT','MEMBER_COMPLETE','CARD_SET')`).all();
  if(!rows.results.length)return [];
  const state=await userCollectionState(env,userId),granted=[];
  for(const title of rows.results){if(collectionConditionMet(title,state)&&await grantTitle(env,userId,title.id,'COLLECTION',title.unlock_type))granted.push(Number(title.id))}
  return granted;
}

export async function recordCharacterProgress(env,userId,eventType,eventKey){
  await ensureEquipmentFoundation(env);
  const type=normalizeSource(eventType)||cleanText(eventType,40).toUpperCase(),key=cleanText(eventKey||'*',120)||'*';
  if(!type||!key)return [];
  const progressStatements=[env.DB.prepare(`INSERT INTO user_title_progress_events(user_id,event_type,event_key,clear_count) VALUES(?,?,?,1)
    ON CONFLICT(user_id,event_type,event_key) DO UPDATE SET clear_count=clear_count+1,updated_at=CURRENT_TIMESTAMP`).bind(userId,type,key)];
  if(key!=='*')progressStatements.push(env.DB.prepare(`INSERT INTO user_title_progress_events(user_id,event_type,event_key,clear_count) VALUES(?,?,?,1)
    ON CONFLICT(user_id,event_type,event_key) DO UPDATE SET clear_count=clear_count+1,updated_at=CURRENT_TIMESTAMP`).bind(userId,type,'*'));
  await env.DB.batch(progressStatements);
  const titles=await env.DB.prepare("SELECT * FROM character_titles WHERE is_active=1 AND unlock_type='CONTENT_CLEAR'").all(),granted=[];
  for(const title of titles.results){const cfg=parseJson(title.unlock_config_json,{}),sourceType=String(cfg.sourceType||cfg.source_type||'').toUpperCase(),sourceKey=String(cfg.sourceKey??cfg.source_id??cfg.sourceId??'*');if(sourceType&&sourceType!==type)continue;if(sourceKey!=='*'&&sourceKey!==key)continue;const required=Math.max(1,cleanInt(cfg.count,1,100000)),progressKey=sourceKey==='*'?'*':sourceKey,progress=await env.DB.prepare('SELECT clear_count FROM user_title_progress_events WHERE user_id=? AND event_type=? AND event_key=?').bind(userId,type,progressKey).first();if(Number(progress?.clear_count||0)>=required&&await grantTitle(env,userId,title.id,type,progressKey))granted.push(Number(title.id))}
  return granted;
}

export async function userEquipmentBonuses(env,userId){
  await ensureEquipmentFoundation(env);
  const row=await env.DB.prepare(`SELECT COALESCE(SUM(i.pve_power),0) AS equipment_pve,COALESCE(SUM(i.pvp_power),0) AS equipment_pvp
    FROM user_equipment_loadout l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
    JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1 WHERE l.user_id=?`).bind(userId).first();
  const title=await env.DB.prepare(`SELECT COALESCE(t.pve_power,0) AS title_pve,t.id AS title_id,t.name AS title_name
    FROM user_title_loadout l JOIN user_character_titles u ON u.user_id=l.user_id AND u.title_id=l.title_id
    JOIN character_titles t ON t.id=l.title_id AND t.is_active=1 WHERE l.user_id=?`).bind(userId).first();
  const equipmentPve=Number(row?.equipment_pve||0),equipmentPvp=Number(row?.equipment_pvp||0),titlePve=Number(title?.title_pve||0);
  return {equipmentPve,equipmentPvp,titlePve,pve:equipmentPve+titlePve,pvp:equipmentPvp,title:title?.title_id?{id:Number(title.title_id),name:title.title_name,pvePower:titlePve}:null};
}

function weightedPick(rows){const total=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.weight||0)),0);if(total<=0)return null;let roll=Math.random()*total;for(const row of rows){roll-=Math.max(0,Number(row.weight||0));if(roll<0)return row}return rows[rows.length-1]||null}

export async function grantEquipmentDrop(env,{userId,sourceType,sourceId='*',requestId=''}){
  await ensureEquipmentFoundation(env);
  const type=normalizeSource(sourceType);if(!type||!userId)return null;
  const key=cleanText(sourceId||'*',120)||'*',rid=cleanText(requestId||`${Date.now()}-${Math.random().toString(36).slice(2)}`,160);
  const prior=await env.DB.prepare('SELECT result,response_json FROM equipment_drop_receipts WHERE request_id=? AND user_id=? AND source_type=? AND source_key=?').bind(rid,userId,type,key).first();
  if(prior){if(prior.response_json)try{return JSON.parse(prior.response_json)}catch{}return null}
  const exact=await env.DB.prepare(`SELECT * FROM equipment_drop_profiles WHERE source_type=? AND source_key=? AND enabled=1 LIMIT 1`).bind(type,key).first();
  const profile=exact||await env.DB.prepare(`SELECT * FROM equipment_drop_profiles WHERE source_type=? AND source_key='*' AND enabled=1 LIMIT 1`).bind(type).first();
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO equipment_drop_receipts(request_id,user_id,source_type,source_key,profile_id,result) VALUES(?,?,?,?,?,'PENDING')`).bind(rid,userId,type,key,profile?.id||null).run();
  if(!inserted.meta.changes)return null;
  try{await recordCharacterProgress(env,userId,type,key)}catch(error){await env.DB.prepare("DELETE FROM equipment_drop_receipts WHERE request_id=? AND user_id=? AND source_type=? AND source_key=? AND result='PENDING'").bind(rid,userId,type,key).run();throw error}
  if(!profile){await env.DB.prepare("UPDATE equipment_drop_receipts SET result='NO_PROFILE',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND source_type=? AND source_key=?").bind(rid,userId,type,key).run();return null}
  if(Math.random()*100>=cleanRate(profile.drop_rate)){
    await env.DB.prepare("UPDATE equipment_drop_receipts SET result='MISS',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND source_type=? AND source_key=?").bind(rid,userId,type,key).run();return null;
  }
  const entries=await env.DB.prepare(`SELECT e.*,i.* FROM equipment_drop_entries e JOIN character_equipment_items i ON i.id=e.equipment_id WHERE e.profile_id=? AND e.is_active=1 AND e.weight>0 AND i.is_active=1 AND i.is_public=1`).bind(profile.id).all();
  const picked=weightedPick(entries.results);if(!picked){await env.DB.prepare("UPDATE equipment_drop_receipts SET result='EMPTY',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND source_type=? AND source_key=?").bind(rid,userId,type,key).run();return null}
  const created=await env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(?,?,?,?,?)`).bind(userId,picked.equipment_id,type,key,rid).run();
  const instanceId=Number(created.meta.last_row_id),item=publicItem({...picked,id:picked.equipment_id}),response={instanceId,item,sourceType:type,sourceId:key};
  await env.DB.prepare("UPDATE equipment_drop_receipts SET result='GRANTED',equipment_instance_id=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND source_type=? AND source_key=?").bind(instanceId,JSON.stringify(response),rid,userId,type,key).run();
  return response;
}

async function characterPayload(env,userId,{admin=false}={}){
  await syncCollectionTitles(env,userId);
  const [instances,loadoutRows,titleRows,titleLoadout,bonuses]=await Promise.all([
    env.DB.prepare(`SELECT x.id AS instance_id,x.source_type,x.source_id,x.acquired_at,i.* FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.user_id=? ${admin?'':"AND i.is_active=1 AND i.is_public=1"} ORDER BY i.slot,i.sort_order,x.acquired_at DESC,x.id DESC`).bind(userId).all(),
    env.DB.prepare('SELECT slot,instance_id FROM user_equipment_loadout WHERE user_id=?').bind(userId).all(),
    env.DB.prepare(`SELECT t.*,u.unlocked_at,CASE WHEN u.title_id IS NULL THEN 0 ELSE 1 END AS owned FROM character_titles t LEFT JOIN user_character_titles u ON u.title_id=t.id AND u.user_id=? WHERE ${admin?'1=1':'t.is_active=1 AND t.is_public=1'} ORDER BY t.sort_order,t.id`).bind(userId).all(),
    env.DB.prepare('SELECT title_id FROM user_title_loadout WHERE user_id=?').bind(userId).first(),
    userEquipmentBonuses(env,userId)
  ]);
  const loadout=Object.fromEntries(loadoutRows.results.map(row=>[row.slot,Number(row.instance_id)])),equippedTitleId=Number(titleLoadout?.title_id||0);
  return {slots:EQUIPMENT_SLOTS.map(slot=>({id:slot,label:EQUIPMENT_SLOT_LABELS[slot]})),instances:instances.results.map(row=>({instanceId:Number(row.instance_id),item:publicItem(row),sourceType:row.source_type,sourceId:row.source_id,acquiredAt:row.acquired_at,equipped:loadout[row.slot]===Number(row.instance_id)})),loadout,titles:titleRows.results.map(row=>publicTitle(row,Boolean(row.owned),equippedTitleId===Number(row.id))),equippedTitleId:equippedTitleId||null,bonuses};
}

async function adminSystemPayload(env){
  const [items,titles,profiles,entries]=await Promise.all([
    env.DB.prepare('SELECT * FROM character_equipment_items ORDER BY slot,sort_order,id').all(),
    env.DB.prepare('SELECT * FROM character_titles ORDER BY sort_order,id').all(),
    env.DB.prepare('SELECT * FROM equipment_drop_profiles ORDER BY source_type,source_key,id').all(),
    env.DB.prepare(`SELECT e.*,i.name AS equipment_name,i.slot,i.rarity FROM equipment_drop_entries e JOIN character_equipment_items i ON i.id=e.equipment_id ORDER BY e.profile_id,e.id`).all()
  ]);
  const byProfile=new Map();for(const entry of entries.results){if(!byProfile.has(Number(entry.profile_id)))byProfile.set(Number(entry.profile_id),[]);byProfile.get(Number(entry.profile_id)).push({id:Number(entry.id),equipmentId:Number(entry.equipment_id),equipmentName:entry.equipment_name,slot:entry.slot,rarity:entry.rarity,weight:Number(entry.weight||0),isActive:entry.is_active!==0})}
  return {slots:EQUIPMENT_SLOTS.map(id=>({id,label:EQUIPMENT_SLOT_LABELS[id]})),subtypes:EQUIPMENT_SUBTYPES,sourceTypes:SOURCE_TYPES,titleUnlockTypes:TITLE_UNLOCK_TYPES,items:items.results.map(publicItem),titles:titles.results.map(row=>publicTitle(row)),profiles:profiles.results.map(row=>({id:Number(row.id),name:row.name,sourceType:row.source_type,sourceKey:row.source_key,enabled:row.enabled!==0,dropRate:Number(row.drop_rate||0),maxDrops:Number(row.max_drops||1),entries:byProfile.get(Number(row.id))||[]}))};
}

export async function handleEquipment({path,request,env,deps}){
  if(!(path==='character/loadout'||path.startsWith('character/')||path.startsWith('admin/equipment')||path.startsWith('admin/title')))return null;
  await ensureEquipmentFoundation(env);
  const {authenticate,readBody,json,writeAdminLog}=deps;
  if(path==='character/loadout'&&request.method==='GET'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);return json(await characterPayload(env,user.id));
  }
  if(path==='character/equipment/equip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),instanceId=cleanInt(body.instanceId,1,2147483647),owned=await env.DB.prepare(`SELECT x.id,i.slot FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.is_active=1`).bind(instanceId,user.id).first();if(!owned)return json({error:'장착할 장비를 찾을 수 없습니다.'},404);await env.DB.prepare(`INSERT INTO user_equipment_loadout(user_id,slot,instance_id,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,slot) DO UPDATE SET instance_id=excluded.instance_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,owned.slot,instanceId).run();return json({ok:true,...await characterPayload(env,user.id)});
  }
  if(path==='character/equipment/unequip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),slot=normalizeSlot(body.slot);if(!slot)return json({error:'올바른 장비 슬롯이 아닙니다.'},400);await env.DB.prepare('DELETE FROM user_equipment_loadout WHERE user_id=? AND slot=?').bind(user.id,slot).run();return json({ok:true,...await characterPayload(env,user.id)});
  }
  if(path==='character/title/equip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),titleId=cleanInt(body.titleId,1,2147483647),owned=await env.DB.prepare(`SELECT t.id FROM user_character_titles u JOIN character_titles t ON t.id=u.title_id WHERE u.user_id=? AND t.id=? AND t.is_active=1`).bind(user.id,titleId).first();if(!owned)return json({error:'보유하지 않은 칭호입니다.'},404);await env.DB.prepare(`INSERT INTO user_title_loadout(user_id,title_id,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET title_id=excluded.title_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,titleId).run();return json({ok:true,...await characterPayload(env,user.id)});
  }
  if(path==='character/title/unequip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);await env.DB.prepare('DELETE FROM user_title_loadout WHERE user_id=?').bind(user.id).run();return json({ok:true,...await characterPayload(env,user.id)});
  }

  if(path==='admin/equipment-system'&&request.method==='GET'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);return json(await adminSystemPayload(env));
  }
  if(path==='admin/equipment-item'&&['POST','PATCH'].includes(request.method)){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,0,2147483647),slot=normalizeSlot(b.slot),subtype=normalizeSubtype(b.subtype);if(!slot||!subtype)return json({error:'장비 부위와 종류를 확인하세요.'},400);const allowedSubtypes={WEAPON:['MODERN_SWORD','AXE','PISTOL'],TOP:['TOP'],BOTTOM:['BOTTOM'],SHOES:['SHOES'],ACCESSORY:['DUAL_DISK']};if(!allowedSubtypes[slot]?.includes(subtype))return json({error:'장비 부위와 세부 종류가 맞지 않습니다.'},400);const name=cleanText(b.name,80),code=cleanText(b.code||`EQ_${Date.now()}`,60).toUpperCase().replace(/[^A-Z0-9_]/g,'_');if(!name)return json({error:'장비명을 입력하세요.'},400);const duplicateCode=await env.DB.prepare('SELECT id FROM character_equipment_items WHERE code=? AND id<>?').bind(code,id||0).first();if(duplicateCode)return json({error:'이미 사용 중인 장비 코드입니다.'},409);if(id){const current=await env.DB.prepare('SELECT slot FROM character_equipment_items WHERE id=?').bind(id).first();if(!current)return json({error:'수정할 장비를 찾을 수 없습니다.'},404);if(current.slot!==slot){const ownedCount=await env.DB.prepare('SELECT COUNT(*) count FROM user_equipment_instances WHERE equipment_id=?').bind(id).first();if(Number(ownedCount?.count||0)>0)return json({error:'유저가 보유 중인 장비는 부위를 변경할 수 없습니다. 새 장비로 등록하세요.'},409)}}const power=itemPower(b.totalPower),args=[code,name,slot,subtype,cleanText(b.rarity||'NORMAL',20).toUpperCase(),cleanText(b.image,500),cleanText(b.description,500),power.total,power.pve,power.pvp,cleanBool(b.isActive)?1:0,cleanBool(b.isPublic)?1:0,cleanInt(b.sortOrder,0,100000)];if(id)await env.DB.prepare(`UPDATE character_equipment_items SET code=?,name=?,slot=?,subtype=?,rarity=?,image_url=?,description=?,total_power=?,pve_power=?,pvp_power=?,is_active=?,is_public=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...args,id).run();else await env.DB.prepare(`INSERT INTO character_equipment_items(code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...args).run();if(id&&!cleanBool(b.isActive))await env.DB.batch([env.DB.prepare('DELETE FROM user_equipment_loadout WHERE instance_id IN (SELECT id FROM user_equipment_instances WHERE equipment_id=?)').bind(id),env.DB.prepare('UPDATE equipment_drop_entries SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE equipment_id=?').bind(id)]);if(writeAdminLog)await writeAdminLog(env,admin,id?'EQUIPMENT_UPDATE':'EQUIPMENT_CREATE','EQUIPMENT',String(id||code),null,{name,slot,subtype,totalPower:power.total});return json({ok:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/equipment-item'&&request.method==='DELETE'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,1,2147483647),used=await env.DB.prepare('SELECT COUNT(*) count FROM user_equipment_instances WHERE equipment_id=?').bind(id).first();if(Number(used?.count||0)>0){await env.DB.batch([env.DB.prepare('UPDATE character_equipment_items SET is_active=0,is_public=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),env.DB.prepare('DELETE FROM user_equipment_loadout WHERE instance_id IN (SELECT id FROM user_equipment_instances WHERE equipment_id=?)').bind(id),env.DB.prepare('UPDATE equipment_drop_entries SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE equipment_id=?').bind(id)]);return json({ok:true,disabled:true,...await adminSystemPayload(env)})}await env.DB.batch([env.DB.prepare('DELETE FROM equipment_drop_entries WHERE equipment_id=?').bind(id),env.DB.prepare('DELETE FROM character_equipment_items WHERE id=?').bind(id)]);return json({ok:true,deleted:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/title-item'&&['POST','PATCH'].includes(request.method)){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,0,2147483647),unlockType=String(b.unlockType||'MANUAL').toUpperCase();if(!TITLE_UNLOCK_TYPES.includes(unlockType))return json({error:'올바른 칭호 획득 조건이 아닙니다.'},400);const name=cleanText(b.name,80),code=cleanText(b.code||`TITLE_${Date.now()}`,60).toUpperCase().replace(/[^A-Z0-9_]/g,'_');if(!name)return json({error:'칭호명을 입력하세요.'},400);const duplicateCode=await env.DB.prepare('SELECT id FROM character_titles WHERE code=? AND id<>?').bind(code,id||0).first();if(duplicateCode)return json({error:'이미 사용 중인 칭호 코드입니다.'},409);const config=typeof b.unlockConfig==='string'?parseJson(b.unlockConfig,{}):(b.unlockConfig||{}),args=[code,name,cleanText(b.description,500),cleanText(b.badgeText||name,40),cleanText(b.image,500),cleanInt(b.pvePower,0,100000000),unlockType,JSON.stringify(config),cleanBool(b.isActive)?1:0,cleanBool(b.isPublic)?1:0,cleanInt(b.sortOrder,0,100000)];if(id)await env.DB.prepare(`UPDATE character_titles SET code=?,name=?,description=?,badge_text=?,image_url=?,pve_power=?,unlock_type=?,unlock_config_json=?,is_active=?,is_public=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...args,id).run();else await env.DB.prepare(`INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,is_active,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(...args).run();if(id&&!cleanBool(b.isActive))await env.DB.prepare('DELETE FROM user_title_loadout WHERE title_id=?').bind(id).run();return json({ok:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/title-item'&&request.method==='DELETE'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,1,2147483647),used=await env.DB.prepare('SELECT COUNT(*) count FROM user_character_titles WHERE title_id=?').bind(id).first();if(Number(used?.count||0)>0){await env.DB.batch([env.DB.prepare('UPDATE character_titles SET is_active=0,is_public=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),env.DB.prepare('DELETE FROM user_title_loadout WHERE title_id=?').bind(id)]);return json({ok:true,disabled:true,...await adminSystemPayload(env)})}await env.DB.prepare('DELETE FROM character_titles WHERE id=?').bind(id).run();return json({ok:true,deleted:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/equipment-drop-profile'&&['POST','PATCH'].includes(request.method)){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,0,2147483647),sourceType=normalizeSource(b.sourceType),sourceKey=cleanText(b.sourceKey||'*',120)||'*',name=cleanText(b.name||`${sourceType} ${sourceKey}`,100),entries=Array.isArray(b.entries)?b.entries:[];if(!sourceType)return json({error:'콘텐츠 종류를 선택하세요.'},400);const duplicateProfile=await env.DB.prepare('SELECT id FROM equipment_drop_profiles WHERE source_type=? AND source_key=? AND id<>?').bind(sourceType,sourceKey,id||0).first();if(duplicateProfile)return json({error:'해당 콘텐츠와 대상 ID의 드랍 설정이 이미 존재합니다.'},409);let profileId=id;if(id)await env.DB.prepare('UPDATE equipment_drop_profiles SET name=?,source_type=?,source_key=?,enabled=?,drop_rate=?,max_drops=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,sourceType,sourceKey,cleanBool(b.enabled)?1:0,cleanRate(b.dropRate),id).run();else{const result=await env.DB.prepare(`INSERT INTO equipment_drop_profiles(name,source_type,source_key,enabled,drop_rate,max_drops) VALUES(?,?,?,?,?,1) ON CONFLICT(source_type,source_key) DO UPDATE SET name=excluded.name,enabled=excluded.enabled,drop_rate=excluded.drop_rate,updated_at=CURRENT_TIMESTAMP`).bind(name,sourceType,sourceKey,cleanBool(b.enabled)?1:0,cleanRate(b.dropRate)).run();const row=await env.DB.prepare('SELECT id FROM equipment_drop_profiles WHERE source_type=? AND source_key=?').bind(sourceType,sourceKey).first();profileId=Number(row?.id||result.meta.last_row_id)}await env.DB.prepare('DELETE FROM equipment_drop_entries WHERE profile_id=?').bind(profileId).run();const statements=[];for(const entry of entries){const equipmentId=cleanInt(entry.equipmentId,1,2147483647),weight=Math.max(0,Math.min(1000000,Number(entry.weight)||0));if(equipmentId&&weight>0)statements.push(env.DB.prepare('INSERT INTO equipment_drop_entries(profile_id,equipment_id,weight,is_active) VALUES(?,?,?,1)').bind(profileId,equipmentId,weight))}if(statements.length)await env.DB.batch(statements);return json({ok:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/equipment-drop-profile'&&request.method==='DELETE'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,1,2147483647);await env.DB.batch([env.DB.prepare('DELETE FROM equipment_drop_entries WHERE profile_id=?').bind(id),env.DB.prepare('DELETE FROM equipment_drop_profiles WHERE id=?').bind(id)]);return json({ok:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/equipment-grant'&&request.method==='POST'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),userId=cleanInt(b.userId,1,2147483647),equipmentId=cleanInt(b.equipmentId,1,2147483647),quantity=cleanInt(b.quantity||1,1,100),[targetUser,targetItem]=await Promise.all([env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(),env.DB.prepare('SELECT id FROM character_equipment_items WHERE id=? AND is_active=1').bind(equipmentId).first()]);if(!targetUser)return json({error:'지급 대상 유저를 찾을 수 없습니다.'},404);if(!targetItem)return json({error:'지급할 활성 장비를 찾을 수 없습니다.'},404);const statements=[];for(let i=0;i<quantity;i++)statements.push(env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,id,'ADMIN',?,? FROM character_equipment_items WHERE id=?`).bind(userId,String(admin.id),`ADMIN-${admin.id}-${Date.now()}-${i}`,equipmentId));await env.DB.batch(statements);return json({ok:true,quantity});
  }
  if(path==='admin/title-grant'&&request.method==='POST'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),userId=cleanInt(b.userId,1,2147483647),titleId=cleanInt(b.titleId,1,2147483647),action=String(b.action||'GRANT').toUpperCase(),[targetUser,targetTitle]=await Promise.all([env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(),env.DB.prepare('SELECT id FROM character_titles WHERE id=?').bind(titleId).first()]);if(!targetUser)return json({error:'지급 대상 유저를 찾을 수 없습니다.'},404);if(!targetTitle)return json({error:'칭호를 찾을 수 없습니다.'},404);if(action==='REVOKE'){await env.DB.batch([env.DB.prepare('DELETE FROM user_title_loadout WHERE user_id=? AND title_id=?').bind(userId,titleId),env.DB.prepare('DELETE FROM user_character_titles WHERE user_id=? AND title_id=?').bind(userId,titleId)])}else await grantTitle(env,userId,titleId,'ADMIN',String(admin.id));return json({ok:true});
  }
  return null;
}
