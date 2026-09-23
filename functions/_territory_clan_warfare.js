import {readRuntimeData,cacheRuntimeData,invalidateRuntimeData} from './_runtime_data_cache.js';

const SCHEMA='territory_clan_warfare_20260923_v1';
export const TERRITORY_SKILL_COOLDOWN_MS=45*60*1000;
const rows=result=>result?.results||[];
const ms=value=>Date.parse(String(value||'').includes('T')?value:String(value||'').replace(' ','T')+'Z');
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
export const isClanWarfare=round=>Number(round?.warfare_version||0)===4;

// Independent of the old territory foundation fast gate: already initialized
// production databases must also run this additive upgrade.
export async function ensureTerritoryClanSchema(env){
  if(readRuntimeData(env,SCHEMA))return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA).first();
  if(!marker){
    const pg=env.DB.dialect==='postgres',int=pg?'BIGINT':'INTEGER';
    const additions={territory_war_v3_rounds:{warfare_version:'INTEGER NOT NULL DEFAULT 0',clan_season_id:int,clan_opened_at:'TEXT',skill_action_token:'TEXT'},territory_war_v3_users:{clan_id:int,mandatory_clan:'INTEGER NOT NULL DEFAULT 0'},territory_war_v3_fronts:{skill_action_token:'TEXT'}};
    const sql=[];
    for(const [table,columns] of Object.entries(additions)){
      const existing=new Set(rows(await env.DB.prepare(`PRAGMA table_info(${table})`).all()).map(row=>row.name));
      for(const [column,type] of Object.entries(columns))if(!existing.has(column))sql.push(`ALTER TABLE ${table} ADD COLUMN ${pg?'IF NOT EXISTS ':''}${column} ${type}`);
    }
    sql.push(
      `CREATE TABLE IF NOT EXISTS territory_war_clans(round_id ${int} NOT NULL,clan_id ${int} NOT NULL,side TEXT NOT NULL CHECK(side IN ('A','B')),position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 3),name TEXT NOT NULL,mark_key TEXT NOT NULL,primary_color TEXT NOT NULL,PRIMARY KEY(round_id,clan_id),UNIQUE(round_id,side,position))`,
      `CREATE TABLE IF NOT EXISTS territory_war_skill_cooldowns(round_id ${int} NOT NULL,side TEXT NOT NULL,operation TEXT NOT NULL,ready_at_ms ${int} NOT NULL,PRIMARY KEY(round_id,side,operation))`,
      `CREATE TABLE IF NOT EXISTS territory_war_skill_receipts(request_id TEXT PRIMARY KEY,round_id ${int} NOT NULL,user_id ${int} NOT NULL,side TEXT NOT NULL,operation TEXT NOT NULL,result_json TEXT NOT NULL,used_at_ms ${int} NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS territory_war_mutation_guards(token TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))`
    );
    if(pg)await env.DB.execSchema(sql);else await env.DB.batch(sql.map(s=>env.DB.prepare(s)));
    await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(SCHEMA,'1').run();
  }
  cacheRuntimeData(env,SCHEMA,true,1800000);
}

export function randomClanSides(clans,random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){
  if(clans.length!==8||new Set(clans.map(c=>Number(c.clan_id))).size!==8)fail('공식 클랜 8개가 준비되어야 영토전을 개막할 수 있습니다.');
  const shuffled=[...clans];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
  return shuffled.map((clan,index)=>({...clan,side:index<4?'A':'B',position:index%4}));
}

// Called under the round creation/formation lock. One transaction freezes the
// eight identities, every roster member and their current attack-deck ids.
export async function openClanWarfare(env,round,cfg){
  if(round?.status!=='RECRUITING'||round.formed_at||round.clan_opened_at)return round;
  const season=await env.DB.prepare("SELECT id FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC LIMIT 1").first();
  if(!season)return {...round,clanOpeningPending:true};
  const clans=rows(await env.DB.prepare('SELECT t.clan_id,o.name,o.mark_key,o.primary_color FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id WHERE t.season_id=? ORDER BY t.clan_id').bind(season.id).all());
  if(clans.length!==8)return {...round,clanOpeningPending:true};
  const assignments=randomClanSides(clans),opened=new Date().toISOString(),guard=`OPEN:${round.id}:${crypto.randomUUID()}`;
  const recruitmentEndsAt=ms(round.recruitment_ends_at)>Date.now()?round.recruitment_ends_at:new Date(Date.now()+Number(cfg.recruitmentHours||3)*3600000).toISOString();
  const statements=[env.DB.prepare("UPDATE territory_war_v3_rounds SET warfare_version=4,clan_season_id=?,clan_opened_at=?,recruitment_ends_at=?,version=version+1 WHERE id=? AND status='RECRUITING' AND formed_at IS NULL AND clan_opened_at IS NULL").bind(season.id,opened,recruitmentEndsAt,round.id),
    env.DB.prepare('INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE id=? AND clan_opened_at=?) THEN 1 ELSE 0 END').bind(guard,round.id,opened)];
  for(const clan of assignments)statements.push(env.DB.prepare('INSERT INTO territory_war_clans(round_id,clan_id,side,position,name,mark_key,primary_color) VALUES(?,?,?,?,?,?,?)').bind(round.id,clan.clan_id,clan.side,clan.position,clan.name,clan.mark_key,clan.primary_color));
  statements.push(env.DB.prepare(`INSERT INTO territory_war_v3_users(round_id,user_id,clan_id,mandatory_clan,side,status,deck_snapshot,energy)
    SELECT ?,m.user_id,m.clan_id,1,c.side,'WAITING',COALESCE(p.card_ids,d.card_ids,'[]'),?
    FROM clan_members m JOIN territory_war_clans c ON c.round_id=? AND c.clan_id=m.clan_id
    JOIN users u ON u.id=m.user_id LEFT JOIN pvp_active_presets a ON a.user_id=m.user_id
    LEFT JOIN pvp_deck_presets p ON p.user_id=a.user_id AND p.preset_no=a.preset_no
    LEFT JOIN pvp_decks d ON d.user_id=m.user_id WHERE m.season_id=?
    ON CONFLICT(round_id,user_id) DO UPDATE SET clan_id=excluded.clan_id,mandatory_clan=1,side=excluded.side`).bind(round.id,Number(cfg.energyMax||10),round.id,season.id));
  statements.push(env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(guard));
  try{await env.DB.batch(statements)}catch(error){
    const committed=await env.DB.prepare('SELECT * FROM territory_war_v3_rounds WHERE id=?').bind(round.id).first();
    if(committed?.clan_opened_at)return committed;
    throw error;
  }
  return {...round,warfare_version:4,clan_season_id:season.id,clan_opened_at:opened,recruitment_ends_at:recruitmentEndsAt,version:Number(round.version||0)+1};
}

export async function territoryClanView(env,round){
  if(!round?.clan_opened_at)return {enabled:isClanWarfare(round),pending:round?.status==='RECRUITING',teams:[]};
  const key=`territory:clans:${round.id}`,cached=readRuntimeData(env,key);if(cached)return cached;
  const teams=rows(await env.DB.prepare(`SELECT c.*,COUNT(w.user_id) member_count FROM territory_war_clans c LEFT JOIN territory_war_v3_users w ON w.round_id=c.round_id AND w.clan_id=c.clan_id WHERE c.round_id=? GROUP BY c.round_id,c.clan_id,c.side,c.position,c.name,c.mark_key,c.primary_color ORDER BY c.side,c.position`).bind(round.id).all()).map(c=>({clanId:Number(c.clan_id),side:c.side,name:c.name,markKey:c.mark_key,primaryColor:c.primary_color,memberCount:Number(c.member_count)}));
  return cacheRuntimeData(env,key,{enabled:true,pending:false,seasonId:Number(round.clan_season_id),openedAt:round.clan_opened_at,teams},60000);
}

export function territorySkillCatalog(base,cfg){
  const ops=structuredClone(base),duration=Number(cfg.operationDurationMinutes||10);
  Object.assign(ops.ASSAULT,{summary:`공성 기본 피해 ×8 · 공성 피해 +${cfg.assaultDamageBonusPercent}%`,description:`즉시 타격 후 ${duration}분간 총공세를 지원합니다.`});
  Object.assign(ops.INFILTRATION,{summary:`적 최대 HP ${cfg.infiltrationHpPercent}% 피해`,description:'적 대공망을 우회하는 고정 비율 타격입니다.'});
  Object.assign(ops.CARPET_BOMBING,{summary:`적 최대 HP ${cfg.carpetBombingHpPercent}% 피해`,description:`적 통합 대공망 활성 시 ${cfg.airDefenseInterceptPercent}% 요격됩니다.`});
  Object.assign(ops.SPG_BARRAGE,{summary:`공성 기본 피해 ×12 · 공성 피해 +${cfg.spgDamageBonusPercent}%`,description:`즉시 포격 후 ${duration}분간 지원합니다. 적 대포병 반격에 억제됩니다.`});
  Object.assign(ops.COUNTER_BATTERY,{summary:'공성 기본 피해 ×10 · 포격 중인 적에게 추가 피해',description:`적 자주포 활성 시 피해 +${cfg.counterBatterySuppressionPercent}%. ${duration}분간 적 포격을 억제합니다.`});
  Object.assign(ops.REGROUP,{name:'재집결 돌파',category:'OFFENSE',summary:`공성 기본 피해 ×6 · 전원 행동력 +${cfg.regroupEnergy}`,description:'재집결한 부대가 즉시 타격하고 행동력을 보충합니다.'});
  Object.assign(ops.IRON_WALL,{summary:`HP ${cfg.ironWallHealPercent}% 복구 · 피해 -${cfg.ironWallDamageReductionPercent}%`,description:`${duration}분간 방어선을 강화합니다.`});
  Object.assign(ops.AIR_DEFENSE,{summary:`피해 -${cfg.airDefenseDamageReductionPercent}% · 폭격 ${cfg.airDefenseInterceptPercent}% 요격`,description:`${duration}분간 대공망을 유지합니다.`});
  for(const op of Object.values(ops))op.cooldownMinutes=45;
  return ops;
}

export async function territorySkillState(env,round,operations,mineSide,commanders,userId,now=Date.now()){
  const key=`territory:skill-cooldowns:${round.id}`;
  let cooldowns=readRuntimeData(env,key);
  if(!cooldowns)cooldowns=cacheRuntimeData(env,key,rows(await env.DB.prepare('SELECT side,operation,ready_at_ms FROM territory_war_skill_cooldowns WHERE round_id=?').bind(round.id).all()),5000);
  const team=side=>{const skills=Object.fromEntries(Object.keys(operations).map(code=>{const readyAt=Number(cooldowns.find(r=>r.side===side&&r.operation===code)?.ready_at_ms||0);return [code,{ready:readyAt<=now,readyAt:readyAt?new Date(readyAt).toISOString():null}]}));return {side,skills,ready:Object.values(skills).some(s=>s.ready),readyCount:Object.values(skills).filter(s=>s.ready).length,usedOperations:[],allUsed:false}};
  const isCommander=Boolean(mineSide&&Number(commanders?.[mineSide]?.user_id||0)===Number(userId));
  return {model:'SKILL_COOLDOWN',cooldownMinutes:45,A:team('A'),B:team('B'),operations,mineSide,isCommander,canActivate:isCommander&&round.status==='ACTIVE'&&!(ms(round.truce_ends_at)>now),commanderUserId:Number(commanders?.[mineSide]?.user_id||0)};
}

export async function territorySkillReceipt(env,userId,requestId,operation){
  const old=await env.DB.prepare('SELECT * FROM territory_war_skill_receipts WHERE request_id=?').bind(requestId).first();
  if(!old)return null;
  if(Number(old.user_id)!==Number(userId)||old.operation!==operation)fail('다른 전술 요청에 사용한 요청번호입니다.');
  return {...JSON.parse(old.result_json),replayed:true};
}

export function territorySkillEffect({round,front,mine,operation,cfg,requestId,damageFor,now=Date.now()}){
  const side=mine.side,enemy=side==='A'?'B':'A',hp=Number(front[enemy.toLowerCase()+'_hp']),max=Number(front[enemy.toLowerCase()+'_max_hp']);
  const enemyOp=ms(round[enemy.toLowerCase()+'_operation_ends_at'])>now?round[enemy.toLowerCase()+'_operation']:'';
  const base=damageFor(Number(mine.formation_power||mine.deck_power||1),`${requestId}:${side}:SKILL`,cfg);
  let damage=0,heal=0,intercepted=false;
  if(operation==='ASSAULT')damage=base*8;
  if(operation==='INFILTRATION')damage=max*Number(cfg.infiltrationHpPercent||12)/100;
  if(operation==='CARPET_BOMBING'){intercepted=enemyOp==='AIR_DEFENSE';damage=max*Number(cfg.carpetBombingHpPercent||10)/100*(intercepted?1-Number(cfg.airDefenseInterceptPercent||75)/100:1)}
  if(operation==='SPG_BARRAGE')damage=base*12*(enemyOp==='COUNTER_BATTERY'?1-Number(cfg.counterBatterySuppressionPercent||70)/100:1);
  if(operation==='COUNTER_BATTERY')damage=base*10*(enemyOp==='SPG_BARRAGE'?1+Number(cfg.counterBatterySuppressionPercent||70)/100:1);
  if(operation==='REGROUP')damage=base*6;
  if(operation==='IRON_WALL')heal=Math.max(0,Math.min(Number(front[side.toLowerCase()+'_max_hp'])-Number(front[side.toLowerCase()+'_hp']),Math.round(Number(front[side.toLowerCase()+'_max_hp'])*Number(cfg.ironWallHealPercent||20)/100)));
  // Same tactical damage floor as the existing siege skills. A personal battle
  // decides the capture; no new attack-count or personal coin rewards are added.
  damage=Math.max(0,Math.min(hp-1,Math.round(damage)));
  return {operation,damage,heal,intercepted,baseDamage:base,endsAt:new Date(now+Number(cfg.operationDurationMinutes||10)*60000).toISOString(),readyAt:new Date(now+TERRITORY_SKILL_COOLDOWN_MS).toISOString(),requestId,roundId:Number(round.id),frontId:Number(front.id)};
}

export async function applyTerritorySkill(env,{round,front,mine,operation,cfg,requestId,damageFor,definition,now=Date.now()}){
  if(!isClanWarfare(round)||!['A','B'].includes(mine.side)||!definition)fail('스킬을 발동할 수 없는 회차입니다.');
  const side=mine.side,own=side.toLowerCase(),enemy=side==='A'?'b':'a',result=territorySkillEffect({round,front,mine,operation,cfg,requestId,damageFor,now});
  const payload={...result,category:definition.category,summary:definition.summary,image:definition.asset};
  // Lock the front and validate its revision, then check live round/commander/
  // cooldown state. Unrelated contribution updates need not invalidate a skill.
  // The CHECK guard rolls the entire batch back on a changed battlefield.
  const s=[env.DB.prepare("UPDATE territory_war_v3_fronts SET skill_action_token=? WHERE id=? AND version=? AND status='ACTIVE' AND a_hp>0 AND b_hp>0").bind(requestId,front.id,front.version),
    env.DB.prepare(`UPDATE territory_war_v3_rounds SET skill_action_token=?,version=version+1 WHERE id=? AND status='ACTIVE' AND current_front_id=?
      AND datetime(ends_at)>datetime(?) AND (truce_ends_at IS NULL OR datetime(truce_ends_at)<=datetime(?))
      AND NOT EXISTS(SELECT 1 FROM territory_war_skill_cooldowns WHERE round_id=? AND side=? AND operation=? AND ready_at_ms>?)
      AND COALESCE((SELECT o.user_id FROM territory_war_v3_commander_overrides o JOIN territory_war_v3_users w ON w.round_id=o.round_id AND w.user_id=o.user_id AND w.side=o.side AND w.status='ACTIVE' WHERE o.round_id=? AND o.side=?),
        (SELECT w.user_id FROM territory_war_v3_users w WHERE w.round_id=? AND w.side=? AND w.status='ACTIVE' AND (w.attacks>0 OR w.defense_wins>0) ORDER BY (w.damage+w.front_finishes*10000+w.defense_wins*2500+w.counter_contribution*25) DESC,w.attacks DESC,w.user_id LIMIT 1))=?`).bind(requestId,round.id,front.id,new Date(now).toISOString(),new Date(now).toISOString(),round.id,side,operation,now,round.id,side,round.id,side,mine.user_id),
    env.DB.prepare('INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds r JOIN territory_war_v3_fronts f ON f.id=r.current_front_id WHERE r.id=? AND r.skill_action_token=? AND f.skill_action_token=?) THEN 1 ELSE 0 END').bind(requestId,round.id,requestId,requestId),
    env.DB.prepare('INSERT INTO territory_war_skill_receipts(request_id,round_id,user_id,side,operation,result_json,used_at_ms) VALUES(?,?,?,?,?,?,?)').bind(requestId,round.id,mine.user_id,side,operation,JSON.stringify(result),now),
    env.DB.prepare('INSERT INTO territory_war_skill_cooldowns(round_id,side,operation,ready_at_ms) VALUES(?,?,?,?) ON CONFLICT(round_id,side,operation) DO UPDATE SET ready_at_ms=excluded.ready_at_ms').bind(round.id,side,operation,now+TERRITORY_SKILL_COOLDOWN_MS),
    env.DB.prepare(`UPDATE territory_war_v3_fronts SET ${enemy}_hp=${enemy}_hp-?,${own}_hp=${own}_hp+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result.damage,result.heal,front.id),
    env.DB.prepare(`UPDATE territory_war_v3_rounds SET ${own}_operation=?,${own}_operation_ends_at=?,${own}_total_damage=${own}_total_damage+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(operation,result.endsAt,result.damage,round.id)];
  if(operation==='REGROUP')s.push(env.DB.prepare('UPDATE territory_war_v3_users SET energy=MIN(?,energy+?),last_recharged_at=CURRENT_TIMESTAMP WHERE round_id=? AND side=?').bind(Number(cfg.energyMax||10),Number(cfg.regroupEnergy||3),round.id,side));
  s.push(env.DB.prepare("INSERT INTO territory_war_v3_notices(round_id,type,side,title,message,payload_json) VALUES(?,'TACTICAL_OPERATION',?,?,?,?)").bind(round.id,side,`${definition.name} 발동`,`${definition.name} · 직접 피해 ${result.damage}`,JSON.stringify(payload)),env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(requestId));
  await env.DB.batch(s);
  invalidateRuntimeData(env,`territory:skill-cooldowns:${round.id}`);
  return result;
}
