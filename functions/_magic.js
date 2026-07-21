const MAGIC_RARITIES=['R','SR','SSR'];
const MAGIC_DECK_TYPES=['PVE','PVP','CAPTAIN'];
const UNIQUE_CARD_GRADES=['SSR','MA','LIMITED','FUR'];

function defaultSettings(){
  return {
    enabled:false,
    ownerTestEnabled:true,
    drawEnabled:false,
    drawCost:100,
    duplicateRefund:{R:5,SR:20,SSR:80},
    acquisitionNotice:'마법 결정은 인게임 플레이를 통해서만 획득할 수 있습니다.',
    version:1
  };
}
function integer(value,fallback=0,min=0,max=100000000){
  const n=Number(value);
  return Math.min(max,Math.max(min,Number.isFinite(n)?Math.floor(n):fallback));
}
function cleanSettings(raw={}){
  const base=defaultSettings();
  return {
    ...base,
    enabled:raw.enabled===true,
    ownerTestEnabled:raw.ownerTestEnabled!==false,
    drawEnabled:raw.drawEnabled===true,
    drawCost:integer(raw.drawCost,base.drawCost,0,100000000),
    duplicateRefund:{
      R:integer(raw.duplicateRefund?.R,base.duplicateRefund.R,0,100000000),
      SR:integer(raw.duplicateRefund?.SR,base.duplicateRefund.SR,0,100000000),
      SSR:integer(raw.duplicateRefund?.SSR,base.duplicateRefund.SSR,0,100000000)
    },
    acquisitionNotice:String(raw.acquisitionNotice||base.acquisitionNotice).slice(0,240),
    version:1
  };
}
async function settings(env){
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first();
  if(!row?.value)return defaultSettings();
  try{return cleanSettings(JSON.parse(row.value))}catch{return defaultSettings()}
}
function isOwner(user){return String(user?.role||'').toUpperCase()==='OWNER'}
function visibleTo(user,cfg){return cfg.enabled||(cfg.ownerTestEnabled&&isOwner(user))}
function safeCode(value=''){
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9_]/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,50);
}
function randomPick(rows){
  const total=rows.reduce((sum,row)=>sum+Math.max(0.0001,Number(row.draw_weight||1)),0);
  let roll=Math.random()*total;
  for(const row of rows){roll-=Math.max(0.0001,Number(row.draw_weight||1));if(roll<=0)return row}
  return rows.at(-1);
}
function cardPayload(row){
  return {
    id:Number(row.id),code:String(row.code||''),name:String(row.name||''),rarity:String(row.rarity||'R'),
    imageUrl:String(row.image_url||''),description:String(row.description||''),effectType:String(row.effect_type||'NONE'),
    triggerType:String(row.trigger_type||'BATTLE_START'),effectValue:Number(row.effect_value||0),triggerChance:Number(row.trigger_chance||100),
    maxActivations:Number(row.max_activations||1),drawWeight:Number(row.draw_weight||1),
    scopes:{pve:row.scope_pve!==0,pvp:row.scope_pvp!==0,captain:row.scope_captain!==0},
    isActive:row.is_active!==0,sortOrder:Number(row.sort_order||0),quantity:Number(row.quantity||0)
  };
}
async function userStatus(env,user,cfg){
  const accessible=visibleTo(user,cfg);
  const balance=Number(user.magic_crystals||0);
  if(!accessible)return {visible:false,enabled:false,ownerTest:false,magicCrystals:balance,settings:{enabled:false,drawEnabled:false}};
  const [cards,loadouts]=await Promise.all([
    env.DB.prepare(`SELECT mc.*,COALESCE(umc.quantity,0) quantity FROM magic_cards mc LEFT JOIN user_magic_cards umc ON umc.magic_card_id=mc.id AND umc.user_id=? WHERE mc.is_active=1 ORDER BY mc.sort_order,mc.id`).bind(user.id).all(),
    env.DB.prepare(`SELECT deck_type,slot_no,magic_card_id FROM magic_card_loadouts WHERE user_id=? AND magic_card_id>0 ORDER BY deck_type,slot_no`).bind(user.id).all()
  ]);
  return {
    visible:true,enabled:cfg.enabled,ownerTest:!cfg.enabled&&cfg.ownerTestEnabled&&isOwner(user),magicCrystals:balance,
    settings:{drawEnabled:cfg.drawEnabled,drawCost:cfg.drawCost,duplicateRefund:cfg.duplicateRefund,acquisitionNotice:cfg.acquisitionNotice},
    cards:cards.results.map(cardPayload),
    loadouts:loadouts.results.map(x=>({deckType:String(x.deck_type),slotNo:Number(x.slot_no),magicCardId:Number(x.magic_card_id)}))
  };
}
async function requireOwner(request,env,authenticate){
  const user=await authenticate(request,env);
  return isOwner(user)?user:null;
}
async function adminData(env){
  const cfg=await settings(env);
  const [cards,effects,counts]=await Promise.all([
    env.DB.prepare(`SELECT * FROM magic_cards ORDER BY sort_order,id`).all(),
    env.DB.prepare(`SELECT c.id AS card_id,c.title,c.rarity,m.name AS member_name,c.image_url,COALESCE(e.attack_percent,0) attack_percent,COALESCE(e.defense_percent,0) defense_percent,COALESCE(e.hp_percent,0) hp_percent,COALESCE(e.speed_percent,0) speed_percent,COALESCE(e.effect_name,'') effect_name,COALESCE(e.effect_description,'') effect_description,COALESCE(e.effect_type,'NONE') effect_type,COALESCE(e.trigger_type,'PASSIVE') trigger_type,COALESCE(e.effect_value,0) effect_value,COALESCE(e.trigger_chance,100) trigger_chance,COALESCE(e.max_activations,1) max_activations,COALESCE(e.scope_pve,1) scope_pve,COALESCE(e.scope_pvp,1) scope_pvp,COALESCE(e.scope_captain,1) scope_captain,COALESCE(e.is_active,0) effect_active FROM cards c JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects e ON e.card_id=c.id WHERE c.rarity IN ('SSR','MA','LIMITED','FUR') AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRED') ORDER BY CASE c.rarity WHEN 'FUR' THEN 4 WHEN 'LIMITED' THEN 3 WHEN 'MA' THEN 2 ELSE 1 END DESC,m.sort_order,c.id`).all(),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM magic_cards) magic_card_count,(SELECT COUNT(*) FROM magic_cards WHERE is_active=1) active_magic_card_count,(SELECT COUNT(*) FROM user_magic_cards WHERE quantity>0) owned_record_count,(SELECT COALESCE(SUM(magic_crystals),0) FROM users) total_magic_crystals`).first()
  ]);
  return {
    settings:cfg,
    cards:cards.results.map(cardPayload),
    uniqueEffects:effects.results.map(x=>({
      cardId:String(x.card_id),title:String(x.title||''),grade:String(x.rarity||''),memberName:String(x.member_name||''),imageUrl:String(x.image_url||''),
      attackPercent:Number(x.attack_percent||0),defensePercent:Number(x.defense_percent||0),hpPercent:Number(x.hp_percent||0),speedPercent:Number(x.speed_percent||0),
      effectName:String(x.effect_name||''),effectDescription:String(x.effect_description||''),effectType:String(x.effect_type||'NONE'),triggerType:String(x.trigger_type||'PASSIVE'),
      effectValue:Number(x.effect_value||0),triggerChance:Number(x.trigger_chance||100),maxActivations:Number(x.max_activations||1),
      scopes:{pve:x.scope_pve!==0,pvp:x.scope_pvp!==0,captain:x.scope_captain!==0},isActive:x.effect_active!==0
    })),
    stats:{magicCardCount:Number(counts?.magic_card_count||0),activeMagicCardCount:Number(counts?.active_magic_card_count||0),ownedRecordCount:Number(counts?.owned_record_count||0),totalMagicCrystals:Number(counts?.total_magic_crystals||0)}
  };
}

export async function handleMagic({path,request,env,deps}){
  const {authenticate,readBody,json,profile,writeAdminLog}=deps;
  if(path==='magic/status'&&request.method==='GET'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    return json(await userStatus(env,user,await settings(env)));
  }
  if(path==='magic/equip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const cfg=await settings(env);if(!visibleTo(user,cfg))return json({error:'마법카드 시스템이 아직 공개되지 않았습니다.'},403);
    const body=await readBody(request),deckType=String(body.deckType||'').toUpperCase(),slotNo=integer(body.slotNo,0,1,5),magicCardId=body.magicCardId==null?null:integer(body.magicCardId,0,1,2147483647);
    if(!MAGIC_DECK_TYPES.includes(deckType)||!slotNo)return json({error:'장착 위치가 올바르지 않습니다.'},400);
    if(magicCardId===null){await env.DB.prepare(`INSERT INTO magic_card_loadouts(user_id,deck_type,slot_no,magic_card_id,updated_at) VALUES(?,?,?,0,CURRENT_TIMESTAMP) ON CONFLICT(user_id,deck_type,slot_no) DO UPDATE SET magic_card_id=0,updated_at=CURRENT_TIMESTAMP`).bind(user.id,deckType,slotNo).run();return json({ok:true,status:await userStatus(env,await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first(),cfg)});}
    const owned=await env.DB.prepare(`SELECT umc.quantity,mc.is_active FROM user_magic_cards umc JOIN magic_cards mc ON mc.id=umc.magic_card_id WHERE umc.user_id=? AND umc.magic_card_id=?`).bind(user.id,magicCardId).first();
    if(!owned||Number(owned.quantity||0)<=0||Number(owned.is_active||0)!==1)return json({error:'보유하지 않았거나 비활성화된 마법카드입니다.'},400);
    const used=await env.DB.prepare(`SELECT COUNT(*) count FROM magic_card_loadouts WHERE user_id=? AND deck_type=? AND magic_card_id=? AND slot_no<>?`).bind(user.id,deckType,magicCardId,slotNo).first();
    if(Number(used?.count||0)>=Number(owned.quantity||0))return json({error:'보유 수량보다 많이 장착할 수 없습니다.'},409);
    await env.DB.prepare(`INSERT INTO magic_card_loadouts(user_id,deck_type,slot_no,magic_card_id,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,deck_type,slot_no) DO UPDATE SET magic_card_id=excluded.magic_card_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,deckType,slotNo,magicCardId).run();
    const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
    return json({ok:true,status:await userStatus(env,fresh,cfg)});
  }
  if(path==='magic/draw'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const cfg=await settings(env);if(!visibleTo(user,cfg))return json({error:'마법카드 시스템이 아직 공개되지 않았습니다.'},403);if(!cfg.drawEnabled)return json({error:'마법카드 뽑기가 아직 개방되지 않았습니다.'},503);
    const body=await readBody(request),requestId=String(body.requestId||'').trim().slice(0,120);if(!requestId)return json({error:'요청 ID가 필요합니다.'},400);
    let existing=await env.DB.prepare('SELECT user_id,status,response_json FROM magic_card_draw_receipts WHERE request_id=?').bind(requestId).first();
    if(existing&&Number(existing.user_id)!==Number(user.id))return json({error:'이미 사용된 요청 ID입니다.'},409);
    if(existing?.status==='COMPLETED'&&existing.response_json){try{return json(JSON.parse(existing.response_json))}catch{}}
    if(existing?.status==='PENDING')return json({error:'이미 처리 중인 뽑기입니다.'},409);
    if(!existing){
      await env.DB.prepare(`INSERT OR IGNORE INTO magic_card_draw_receipts(request_id,user_id,status,cost,created_at,updated_at) VALUES(?,?,'PENDING',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(requestId,user.id,cfg.drawCost).run();
      existing=await env.DB.prepare('SELECT user_id,status,response_json FROM magic_card_draw_receipts WHERE request_id=?').bind(requestId).first();
      if(!existing||Number(existing.user_id)!==Number(user.id))return json({error:'뽑기 요청을 등록하지 못했습니다.'},409);
    }else{
      await env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='PENDING',cost=?,response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(cfg.drawCost,requestId,user.id).run();
    }
    let deducted=false,rewardCommitted=false;
    try{
      const pool=(await env.DB.prepare(`SELECT * FROM magic_cards WHERE is_active=1 AND draw_weight>0 ORDER BY sort_order,id`).all()).results;if(!pool.length)throw new Error('활성화된 마법카드가 없습니다.');
      const spend=await env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals-? WHERE id=? AND magic_crystals>=?').bind(cfg.drawCost,user.id,cfg.drawCost).run();
      if(Number(spend.meta?.changes||0)!==1){const e=new Error(`마법 결정이 부족합니다. (${cfg.drawCost.toLocaleString()}개 필요)`);e.status=400;throw e}deducted=true;
      const picked=randomPick(pool),owned=await env.DB.prepare('SELECT quantity FROM user_magic_cards WHERE user_id=? AND magic_card_id=?').bind(user.id,picked.id).first(),duplicate=Number(owned?.quantity||0)>0,refund=duplicate?integer(cfg.duplicateRefund?.[String(picked.rarity||'R')],0):0;
      const spentUser=await env.DB.prepare('SELECT magic_crystals FROM users WHERE id=?').bind(user.id).first();if(!spentUser)throw new Error('유저 정보를 찾을 수 없습니다.');
      const finalBalance=Number(spentUser.magic_crystals||0)+refund;
      const result={ok:true,card:cardPayload({...picked,quantity:duplicate?Number(owned.quantity||0):1}),duplicate,refund,magicCrystals:finalBalance};
      const statements=[];
      if(!duplicate)statements.push(env.DB.prepare(`INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,first_obtained_at,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,magic_card_id) DO UPDATE SET quantity=user_magic_cards.quantity+1,updated_at=CURRENT_TIMESTAMP`).bind(user.id,picked.id));
      if(refund>0)statements.push(env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(refund,user.id));
      statements.push(env.DB.prepare(`INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,?,?)`).bind(user.id,-cfg.drawCost+refund,finalBalance,duplicate?'마법카드 중복 환급':'마법카드 뽑기','MAGIC_DRAW',requestId));
      statements.push(env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(JSON.stringify(result),requestId,user.id));
      await env.DB.batch(statements);rewardCommitted=true;
      return json(result);
    }catch(error){
      if(deducted&&!rewardCommitted)await env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(cfg.drawCost,user.id).run();
      if(!rewardCommitted)await env.DB.prepare(`UPDATE magic_card_draw_receipts SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(String(error.message||error).slice(0,300),requestId,user.id).run();
      return json({error:String(error.message||error)},Number(error.status||500));
    }
  }
  if(path==='admin/magic-system'){
    const admin=await requireOwner(request,env,authenticate);if(!admin)return json({error:'마법카드 관리는 OWNER 전용입니다.'},403);
    if(request.method==='GET')return json(await adminData(env));
    if(request.method==='POST'){
      const body=await readBody(request),action=String(body.action||'').toUpperCase();
      if(action==='SAVE_SETTINGS'){
        const before=await settings(env),next=cleanSettings(body.settings||body);
        await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('magic_card_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(next)).run();
        await writeAdminLog(env,admin,'MAGIC_SETTINGS_SAVE','APP_META','magic_card_settings_v1',before,next);
        return json({ok:true,settings:next});
      }
      if(action==='SAVE_MAGIC_CARD'){
        const id=body.id?integer(body.id,0,1,2147483647):null,code=safeCode(body.code||body.name),name=String(body.name||'').trim().slice(0,60),rarity=String(body.rarity||'R').toUpperCase();
        if(!name)return json({error:'마법카드 이름을 입력하세요.'},400);if(!code)return json({error:'마법카드 코드를 입력하세요.'},400);if(!MAGIC_RARITIES.includes(rarity))return json({error:'마법카드 등급은 R·SR·SSR만 사용할 수 있습니다.'},400);
        const values=[code,name,rarity,String(body.imageUrl||'').trim().slice(0,500),String(body.description||'').trim().slice(0,300),String(body.effectType||'NONE').toUpperCase().slice(0,40),String(body.triggerType||'BATTLE_START').toUpperCase().slice(0,40),Number(body.effectValue||0),Math.min(100,Math.max(0,Number(body.triggerChance??100))),integer(body.maxActivations,1,1,99),Math.max(0.0001,Number(body.drawWeight||1)),body.scopes?.pve===false?0:1,body.scopes?.pvp===false?0:1,body.scopes?.captain===false?0:1,body.isActive===false?0:1,integer(body.sortOrder,0,0,100000)];
        if(id)await env.DB.prepare(`UPDATE magic_cards SET code=?,name=?,rarity=?,image_url=?,description=?,effect_type=?,trigger_type=?,effect_value=?,trigger_chance=?,max_activations=?,draw_weight=?,scope_pve=?,scope_pvp=?,scope_captain=?,is_active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values,id).run();
        else await env.DB.prepare(`INSERT INTO magic_cards(code,name,rarity,image_url,description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,draw_weight,scope_pve,scope_pvp,scope_captain,is_active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
        await writeAdminLog(env,admin,'MAGIC_CARD_SAVE','MAGIC_CARD',String(id||code),null,{code,name,rarity});
        return json({ok:true});
      }
      if(action==='TOGGLE_MAGIC_CARD'){
        const id=integer(body.id,0,1,2147483647);await env.DB.prepare('UPDATE magic_cards SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.isActive===true?1:0,id).run();await writeAdminLog(env,admin,'MAGIC_CARD_TOGGLE','MAGIC_CARD',String(id),null,{isActive:body.isActive===true});return json({ok:true});
      }
      if(action==='SAVE_UNIQUE_EFFECT'){
        const cardId=String(body.cardId||'').trim(),card=await env.DB.prepare(`SELECT id,rarity FROM cards WHERE id=?`).bind(cardId).first();if(!card)return json({error:'카드를 찾을 수 없습니다.'},404);if(!UNIQUE_CARD_GRADES.includes(String(card.rarity||'').toUpperCase()))return json({error:'고유 효과는 SSR 이상 카드에만 설정할 수 있습니다.'},400);
        const v=[cardId,Number(body.attackPercent||0),Number(body.defensePercent||0),Number(body.hpPercent||0),Number(body.speedPercent||0),String(body.effectName||'').trim().slice(0,80),String(body.effectDescription||'').trim().slice(0,300),String(body.effectType||'NONE').toUpperCase().slice(0,40),String(body.triggerType||'PASSIVE').toUpperCase().slice(0,40),Number(body.effectValue||0),Math.min(100,Math.max(0,Number(body.triggerChance??100))),integer(body.maxActivations,1,1,99),body.scopes?.pve===false?0:1,body.scopes?.pvp===false?0:1,body.scopes?.captain===false?0:1,body.isActive===true?1:0];
        await env.DB.prepare(`INSERT INTO card_unique_effects(card_id,attack_percent,defense_percent,hp_percent,speed_percent,effect_name,effect_description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,scope_pve,scope_pvp,scope_captain,is_active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(card_id) DO UPDATE SET attack_percent=excluded.attack_percent,defense_percent=excluded.defense_percent,hp_percent=excluded.hp_percent,speed_percent=excluded.speed_percent,effect_name=excluded.effect_name,effect_description=excluded.effect_description,effect_type=excluded.effect_type,trigger_type=excluded.trigger_type,effect_value=excluded.effect_value,trigger_chance=excluded.trigger_chance,max_activations=excluded.max_activations,scope_pve=excluded.scope_pve,scope_pvp=excluded.scope_pvp,scope_captain=excluded.scope_captain,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP`).bind(...v).run();
        await writeAdminLog(env,admin,'CARD_UNIQUE_EFFECT_SAVE','CARD',cardId,null,{effectName:body.effectName,isActive:body.isActive===true});return json({ok:true});
      }
      return json({error:'올바르지 않은 작업입니다.'},400);
    }
  }
  return null;
}
