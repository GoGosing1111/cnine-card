const DEFAULT_SETTINGS={enabled:false,prestigeEnabled:false,furEnabled:false};
const ALLOWED_GRADES=new Set(['PRESTIGE','FUR']);
const GRADE_LIMIT=2;
const safeJson=(v,fallback={})=>{try{return JSON.parse(v)}catch{return fallback}};
const cleanSettings=v=>({
  enabled:v?.enabled===true,
  prestigeEnabled:v?.prestigeEnabled===true,
  furEnabled:v?.furEnabled===true
});
async function settings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='high_grade_reroll_settings_v1'").first();return cleanSettings({...DEFAULT_SETTINGS,...safeJson(row?.value||'{}',{})});}
async function ensureColumn(env,table,column,definition){const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all();if(!(rows.results||[]).some(r=>String(r.name)===column))await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();}
export async function ensureHighGradeRerollFoundation(env){
  const [marker,usageV1,usageV2,legacyReceipts]=await Promise.all([
    env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1370_high_grade_reroll_twice'").first(),
    env.DB.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='high_grade_reroll_usage'").first(),
    env.DB.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='high_grade_reroll_usage_v2'").first(),
    env.DB.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='high_grade_reroll_receipts'").first()
  ]);
  await ensureColumn(env,'cards','reroll_material_enabled','INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(env,'cards','reroll_result_enabled','INTEGER NOT NULL DEFAULT 1');
  if(marker?.value==='1'&&usageV2?.ok)return;
  if(!usageV2?.ok){
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS high_grade_reroll_usage_v2 (
        user_id INTEGER NOT NULL,
        grade TEXT NOT NULL CHECK(grade IN ('PRESTIGE','FUR')),
        usage_no INTEGER NOT NULL CHECK(usage_no BETWEEN 1 AND 2),
        request_id TEXT NOT NULL,
        source_card_id TEXT NOT NULL,
        result_card_id TEXT NOT NULL,
        excluded_role TEXT NOT NULL,
        breakthrough_level INTEGER NOT NULL DEFAULT 0,
        response_json TEXT NOT NULL,
        used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id,grade,usage_no),
        UNIQUE(user_id,request_id)
      )`),
      env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('high_grade_reroll_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING").bind(JSON.stringify(DEFAULT_SETTINGS))
    ]);
  }
  if(usageV1?.ok){
    await env.DB.prepare(`INSERT OR IGNORE INTO high_grade_reroll_usage_v2(user_id,grade,usage_no,request_id,source_card_id,result_card_id,excluded_role,breakthrough_level,response_json,used_at)
      SELECT user_id,UPPER(grade),1,request_id,source_card_id,result_card_id,excluded_role,COALESCE(breakthrough_level,0),COALESCE(response_json,'{}'),COALESCE(used_at,CURRENT_TIMESTAMP)
      FROM high_grade_reroll_usage
      WHERE UPPER(grade) IN ('PRESTIGE','FUR')`).run();
  }else if(legacyReceipts?.ok){
    await env.DB.prepare(`INSERT OR IGNORE INTO high_grade_reroll_usage_v2(user_id,grade,usage_no,request_id,source_card_id,result_card_id,excluded_role,breakthrough_level,response_json,used_at)
      SELECT r.user_id,UPPER(r.grade),1,r.request_id,r.source_card_id,r.result_card_id,r.excluded_role,COALESCE(r.breakthrough_level,0),COALESCE(r.response_json,'{}'),COALESCE(r.updated_at,r.created_at,CURRENT_TIMESTAMP)
      FROM high_grade_reroll_receipts r
      WHERE r.status='COMPLETED' AND UPPER(r.grade) IN ('PRESTIGE','FUR')
      ORDER BY r.created_at ASC`).run();
  }
  await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1370_high_grade_reroll_twice','1',CURRENT_TIMESTAMP)").run();
}
function dominantRole(row){
  const stats=[['ATTACK',Number(row.attack_percent||0)],['DEFENSE',Number(row.defense_percent||0)],['SPEED',Number(row.speed_percent||0)],['HEALER',Number(row.hp_percent||0)]];
  const max=Math.max(...stats.map(x=>x[1]));return max>0?(stats.find(x=>x[1]===max)?.[0]||'NONE'):'NONE';
}
function roleLabel(role){return {ATTACK:'공격형',DEFENSE:'방어형',SPEED:'속도형',HEALER:'힐러형',NONE:'기본형'}[role]||role;}
async function cardRows(env,where='',bind=[]){return (await env.DB.prepare(`SELECT c.id,c.title,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.power_type AS powerType,c.base_power AS basePower,c.card_status AS cardStatus,c.is_active,COALESCE(rc.reroll_material_enabled,1) AS reroll_material_enabled,COALESCE(rc.reroll_result_enabled,1) AS reroll_result_enabled,m.name,COALESCE(e.attack_percent,0) attack_percent,COALESCE(e.defense_percent,0) defense_percent,COALESCE(e.hp_percent,0) hp_percent,COALESCE(e.speed_percent,0) speed_percent FROM cards_effective_v1210 c JOIN cards rc ON rc.id=c.id JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects e ON e.card_id=c.id AND e.is_active=1 ${where}`).bind(...bind).all()).results||[];}
async function usageMap(env,userId){
  const rows=(await env.DB.prepare("SELECT grade,usage_no,request_id,source_card_id,result_card_id,breakthrough_level,used_at FROM high_grade_reroll_usage_v2 WHERE user_id=? ORDER BY grade,usage_no").bind(userId).all()).results||[];
  const result={PRESTIGE:{used:false,usedCount:0,remaining:GRADE_LIMIT,history:[]},FUR:{used:false,usedCount:0,remaining:GRADE_LIMIT,history:[]}};
  for(const row of rows){
    const grade=String(row.grade||'').toUpperCase();
    if(!result[grade])continue;
    result[grade].history.push({usageNo:Number(row.usage_no||0),requestId:row.request_id,sourceCardId:row.source_card_id,resultCardId:row.result_card_id,breakthroughLevel:Number(row.breakthrough_level||0),usedAt:row.used_at});
  }
  for(const grade of ALLOWED_GRADES){const usedCount=result[grade].history.length;result[grade].usedCount=usedCount;result[grade].used=usedCount>=GRADE_LIMIT;result[grade].remaining=Math.max(0,GRADE_LIMIT-usedCount);}
  return result;
}
async function publicState(env,user){
  const cfg=await settings(env),usage=await usageMap(env,user.id);
  return {settings:cfg,usage,limits:{PRESTIGE:GRADE_LIMIT,FUR:GRADE_LIMIT},visible:cfg.enabled};
}
async function assertAvailable(env,userId,grade){
  const countRow=await env.DB.prepare('SELECT COUNT(*) count FROM high_grade_reroll_usage_v2 WHERE user_id=? AND grade=?').bind(userId,grade).first();
  const usedCount=Number(countRow?.count||0);
  if(usedCount>=GRADE_LIMIT){const error=new Error(`${grade} 재뽑기는 계정당 ${GRADE_LIMIT}회까지 가능하며 모두 사용했습니다.`);error.code='GRADE_REROLL_LIMIT_REACHED';error.usedCount=usedCount;throw error;}
  return {usedCount,usageNo:usedCount+1,remaining:GRADE_LIMIT-usedCount};
}
async function candidates(env,user,sourceCardId){
  const sourceOwned=await env.DB.prepare(`SELECT uc.card_id,uc.quantity,uc.breakthrough_level,c.rarity AS grade,c.title,COALESCE(rc.reroll_material_enabled,1) AS reroll_material_enabled,COALESCE(e.attack_percent,0) attack_percent,COALESCE(e.defense_percent,0) defense_percent,COALESCE(e.hp_percent,0) hp_percent,COALESCE(e.speed_percent,0) speed_percent FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN cards rc ON rc.id=c.id LEFT JOIN card_unique_effects e ON e.card_id=c.id AND e.is_active=1 WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0`).bind(user.id,String(sourceCardId)).first();
  if(!sourceOwned)throw new Error('보유하지 않은 카드입니다.');
  const grade=String(sourceOwned.grade||'').toUpperCase();if(!ALLOWED_GRADES.has(grade))throw new Error('PRESTIGE 또는 FUR 카드만 재뽑기할 수 있습니다.');
  const availability=await assertAvailable(env,user.id,grade);
  if(Number(sourceOwned.reroll_material_enabled??1)!==1)throw new Error('이 카드는 재뽑기 재료로 사용할 수 없습니다.');
  const cfg=await settings(env);if(!cfg.enabled||!(grade==='PRESTIGE'?cfg.prestigeEnabled:cfg.furEnabled))throw new Error(`${grade} 재뽑기가 현재 중지되어 있습니다.`);
  const sourceRole=dominantRole(sourceOwned);
  const pool=await cardRows(env,`WHERE UPPER(c.rarity)=? AND c.id<>? AND COALESCE(c.is_active,1)=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND COALESCE(rc.reroll_result_enabled,1)=1 AND NOT EXISTS (SELECT 1 FROM user_cards uc2 WHERE uc2.user_id=? AND uc2.card_id=c.id AND COALESCE(uc2.quantity,0)>0)`,[grade,String(sourceCardId),user.id]);
  const filtered=pool.map(x=>({...x,role:dominantRole(x),roleLabel:roleLabel(dominantRole(x))})).filter(x=>x.role!==sourceRole);
  return {source:{...sourceOwned,id:String(sourceOwned.card_id),role:sourceRole,roleLabel:roleLabel(sourceRole),breakthroughLevel:Number(sourceOwned.breakthrough_level||0)},grade,candidates:filtered,usedCount:availability.usedCount,usageNo:availability.usageNo,remaining:availability.remaining};
}
async function cardInDeck(env,userId,cardId){
  const checks=await Promise.all([
    env.DB.prepare("SELECT 1 ok FROM pve_decks WHERE user_id=? AND card_ids LIKE ? LIMIT 1").bind(userId,`%\"${cardId}\"%`).first(),
    env.DB.prepare("SELECT 1 ok FROM pvp_decks WHERE user_id=? AND card_ids LIKE ? LIMIT 1").bind(userId,`%\"${cardId}\"%`).first(),
    env.DB.prepare("SELECT 1 ok FROM pve_rift_runs WHERE user_id=? AND status='ACTIVE' AND deck_cards LIKE ? LIMIT 1").bind(userId,`%\"${cardId}\"%`).first()
  ]).catch(()=>[]);return checks.some(Boolean);
}
export async function handleHighGradeReroll({path,request,env,deps}){
  if(!(path.startsWith('high-grade-reroll')||path.startsWith('admin/high-grade-reroll')))return null;
  const {authenticate,readBody,json,requirePermission,writeAdminLog}=deps;await ensureHighGradeRerollFoundation(env);
  if(path==='high-grade-reroll/state'&&request.method==='GET'){const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);return json(await publicState(env,user));}
  if(path==='high-grade-reroll/candidates'&&request.method==='GET'){const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const url=new URL(request.url),sourceCardId=url.searchParams.get('sourceCardId');try{return json(await candidates(env,user,sourceCardId))}catch(e){return json({error:e.message,code:e.code||null},e.code==='GRADE_REROLL_LIMIT_REACHED'?409:400)}}
  if(path==='high-grade-reroll/execute'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const body=await readBody(request),sourceCardId=String(body.sourceCardId||''),requestId=String(body.requestId||'').slice(0,100);if(!sourceCardId||!requestId)return json({error:'재뽑기 요청 정보가 없습니다.'},400);
    const sameRequest=await env.DB.prepare('SELECT response_json FROM high_grade_reroll_usage_v2 WHERE user_id=? AND request_id=?').bind(user.id,requestId).first();if(sameRequest?.response_json)return json(safeJson(sameRequest.response_json,{}));
    try{
      const data=await candidates(env,user,sourceCardId);if(!data.candidates.length)return json({error:'같은 역할과 보유 카드를 제외하면 재뽑기 가능한 후보가 없습니다.'},409);
      if(await cardInDeck(env,user.id,sourceCardId))return json({error:'PVE·PVP·원정 덱에서 해당 카드를 먼저 해제하세요.'},409);
      const result=data.candidates[Math.floor(Math.random()*data.candidates.length)],level=Number(data.source.breakthroughLevel||0),remaining=Math.max(0,GRADE_LIMIT-data.usageNo),response={ok:true,grade:data.grade,usageNo:data.usageNo,usedCount:data.usageNo,limit:GRADE_LIMIT,excludedRole:data.source.role,excludedRoleLabel:data.source.roleLabel,sourceCardId,resultCardId:String(result.id),breakthroughLevel:level,remaining,card:result};
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO high_grade_reroll_usage_v2(user_id,grade,usage_no,request_id,source_card_id,result_card_id,excluded_role,breakthrough_level,response_json,used_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(user.id,data.grade,data.usageNo,requestId,sourceCardId,String(result.id),data.source.role,level,JSON.stringify(response)),
        env.DB.prepare('DELETE FROM user_cards WHERE user_id=? AND card_id=? AND quantity>0').bind(user.id,sourceCardId),
        env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,first_obtained_at,last_obtained_at) VALUES(?,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=1,breakthrough_level=excluded.breakthrough_level,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,String(result.id),level)
      ]);
      return json(response);
    }catch(e){
      if(e.code==='GRADE_REROLL_LIMIT_REACHED')return json({error:e.message,code:e.code},409);
      const used=await env.DB.prepare('SELECT request_id,response_json FROM high_grade_reroll_usage_v2 WHERE user_id=? AND grade IN (SELECT UPPER(c.rarity) FROM cards_effective_v1210 c WHERE c.id=?) ORDER BY usage_no DESC LIMIT 1').bind(user.id,sourceCardId).first().catch(()=>null);
      if(used?.request_id===requestId&&used?.response_json)return json(safeJson(used.response_json,{}));
      if(used){const count=await env.DB.prepare('SELECT COUNT(*) count FROM high_grade_reroll_usage_v2 WHERE user_id=? AND grade IN (SELECT UPPER(c.rarity) FROM cards_effective_v1210 c WHERE c.id=?)').bind(user.id,sourceCardId).first().catch(()=>null);if(Number(count?.count||0)>=GRADE_LIMIT)return json({error:`해당 등급 재뽑기는 계정당 ${GRADE_LIMIT}회까지 가능하며 모두 사용했습니다.`,code:'GRADE_REROLL_LIMIT_REACHED'},409);}
      return json({error:e.message||'재뽑기에 실패했습니다.'},500);
    }
  }
  if(path==='admin/high-grade-reroll/settings'){
    const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'설정 권한이 없습니다.'},403);
    if(request.method==='GET')return json({settings:await settings(env)});
    if(request.method==='POST'){const body=await readBody(request),before=await settings(env),next=cleanSettings(body.settings||body);await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('high_grade_reroll_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(next)).run();if(writeAdminLog)await writeAdminLog(env,admin,'HIGH_GRADE_REROLL_SETTINGS','APP_META','high_grade_reroll_settings_v1',before,next);return json({ok:true,settings:next})}
  }
  return json({error:'지원하지 않는 요청입니다.'},404);
}
