import {BOMBARDMENT_CHIPS,SKILL_CHIP_CATALOG,SKILL_CHIP_MAX_SLOTS,SKILL_CHIP_RUNTIME_ENABLED,SKILL_CHIP_BALANCE_STATUS,skillChipByCode} from '../shared/battle-suit-skill-chips.mjs';

const MIGRATION_KEY='safe_runtime_upgrade_skill_chip_bombardment_limit_20261125';
const LOADOUT_SCHEMA=`CREATE TABLE IF NOT EXISTS user_skill_chip_loadout_v2046 (
  user_id INTEGER NOT NULL,slot_no INTEGER NOT NULL CHECK(slot_no BETWEEN 1 AND 3),item_code TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,slot_no),UNIQUE(user_id,item_code)
)`;
const pairSql=BOMBARDMENT_CHIPS.map(code=>`'${code}'`).join(',');
const singleBombardmentIndex=`CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_chip_one_bombardment
  ON user_skill_chip_loadout_v2046(user_id) WHERE item_code IN (${pairSql})`;
// Prefer a usable chip, then the lowest numbered slot. Only equipment links are removed.
const reconcileBombardmentSlots=`DELETE FROM user_skill_chip_loadout_v2046 WHERE (user_id,slot_no) IN (
  SELECT user_id,slot_no FROM (
    SELECT l.user_id,l.slot_no,ROW_NUMBER() OVER (PARTITION BY l.user_id ORDER BY
      CASE WHEN i.is_active=1 AND u.quantity>0 THEN 0 ELSE 1 END,l.slot_no) AS priority
    FROM user_skill_chip_loadout_v2046 l
    LEFT JOIN inventory_items i ON i.code=l.item_code
    LEFT JOIN cnine_user_inventory u ON u.user_id=l.user_id AND u.item_code=l.item_code
    WHERE l.item_code IN (${pairSql})
  ) ranked WHERE priority>1
)`;
const ownedActiveChip=`SELECT 1 FROM cnine_user_inventory u JOIN inventory_items i ON i.code=u.item_code
  WHERE u.user_id=? AND u.item_code=? AND u.quantity>0 AND i.is_active=1`;
// No account state or unresolved database I/O is cached across Worker requests.
export async function ensureSkillChipFoundation(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MIGRATION_KEY).first();
  if(marker?.value==='1')return;
  // The project's PostgreSQL adapter intentionally ignores schema SQL in prepare/batch.
  const postgres=env.DB.dialect==='postgres';
  // Serialize old clients and simultaneous first requests while installing the index.
  const schema=[LOADOUT_SCHEMA,...(postgres?['LOCK TABLE user_skill_chip_loadout_v2046 IN SHARE ROW EXCLUSIVE MODE']:[]),
    reconcileBombardmentSlots,singleBombardmentIndex];
  if(postgres)await env.DB.execSchema(schema);
  await env.DB.batch([
    ...(postgres?[]:schema.map(sql=>env.DB.prepare(sql))),
    ...SKILL_CHIP_CATALOG.map(chip=>env.DB.prepare(`INSERT INTO inventory_items
      (code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
      VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING`).bind(chip.code,`${chip.name} 스킬칩`,'BATTLE SUIT SKILL CHIP',chip.description,'SKILL_CHIP','SPECIAL',chip.image,80+chip.sortOrder)),
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(MIGRATION_KEY)
  ]);
}

export async function skillChipPayload(env,userId){
  await ensureSkillChipFoundation(env);
  const codes=SKILL_CHIP_CATALOG.map(chip=>chip.code),marks=codes.map(()=>'?').join(',');
  const rows=await env.DB.prepare(`SELECT i.code,i.is_active,COALESCE(u.quantity,0) AS quantity,l.slot_no
    FROM inventory_items i
    LEFT JOIN cnine_user_inventory u ON u.item_code=i.code AND u.user_id=?
    LEFT JOIN user_skill_chip_loadout_v2046 l ON l.item_code=i.code AND l.user_id=?
    WHERE i.code IN (${marks})`).bind(userId,userId,...codes).all();
  const byCode=new Map((rows.results||[]).map(row=>[row.code,row])),loadout=Array(SKILL_CHIP_MAX_SLOTS).fill(null);
  const catalog=SKILL_CHIP_CATALOG.map(chip=>{
    const row=byCode.get(chip.code),quantity=Math.max(0,Number(row?.quantity||0)),active=Number(row?.is_active||0)===1;
    const slot=Number(row?.slot_no||0),equipped=quantity>0&&active&&slot>=1&&slot<=SKILL_CHIP_MAX_SLOTS;
    if(equipped)loadout[slot-1]=chip.code;
    return {...chip,quantity,owned:quantity>0,active,equipped,slot:equipped?slot:null};
  });
  return {visible:true,maxSlots:SKILL_CHIP_MAX_SLOTS,duplicateAllowed:false,scope:'PVE_BATTLE_SUIT_ONLY',battleEnabled:SKILL_CHIP_RUNTIME_ENABLED,balanceStatus:SKILL_CHIP_BALANCE_STATUS,damageBase:'BATTLE_SUIT_SINGLE_SHOT',loadout,catalog};
}

export async function equippedSkillChipCodes(env,userId){
  if(!SKILL_CHIP_RUNTIME_ENABLED)return [];
  return (await skillChipPayload(env,userId)).loadout.filter(Boolean);
}

export async function handleSkillChips({path,request,env,deps}){
  if(!path.startsWith('character/skill-chips'))return null;
  const {authenticate,readBody,json}=deps;
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  const supported=(path==='character/skill-chips'&&request.method==='GET')||(['character/skill-chips/equip','character/skill-chips/unequip'].includes(path)&&request.method==='POST');
  if(!supported)return json({error:'지원하지 않는 스킬칩 요청입니다.'},404);
  await ensureSkillChipFoundation(env);
  if(request.method==='GET')return json({skillChips:await skillChipPayload(env,user.id)});
  const body=await readBody(request);
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'올바른 스킬칩 장착 요청이 아닙니다.'},400);
  const slot=body.slot,code=body.code;
  if(!Number.isInteger(slot)||slot<1||slot>SKILL_CHIP_MAX_SLOTS)return json({error:'스킬칩 슬롯은 1~3만 가능합니다.'},400);
  if(typeof code!=='string'||!skillChipByCode(code))return json({error:'등록되지 않은 스킬칩입니다.'},400);
  if(path.endsWith('/unequip')){
    // Compare-and-delete protects a newer equip in the same slot from a stale tab.
    await env.DB.prepare('DELETE FROM user_skill_chip_loadout_v2046 WHERE user_id=? AND slot_no=? AND item_code=?').bind(user.id,slot,code).run();
  }else{
    try{
      const peer=skillChipByCode(code).exclusiveWith;
      const equip=env.DB.prepare(`INSERT INTO user_skill_chip_loadout_v2046(user_id,slot_no,item_code,updated_at)
        SELECT ?,?,?,CURRENT_TIMESTAMP WHERE EXISTS(${ownedActiveChip})
        ON CONFLICT(user_id,slot_no) DO UPDATE SET item_code=excluded.item_code,updated_at=CURRENT_TIMESTAMP`).bind(user.id,slot,code,user.id,code);
      // A revoked or disabled chip is absent from the visible loadout. Its stale
      // link must not reserve the pair. A failed equip rolls both writes back.
      const result=peer?(await env.DB.batch([
        env.DB.prepare(`DELETE FROM user_skill_chip_loadout_v2046 WHERE user_id=? AND item_code=?
          AND NOT EXISTS(${ownedActiveChip}) AND EXISTS(${ownedActiveChip})`).bind(user.id,peer,user.id,peer,user.id,code),
        equip
      ]))[1]:await equip.run();
      if(!Number(result?.meta?.changes||0))return json({error:'보유한 활성 스킬칩만 장착할 수 있습니다.'},403);
    }catch(error){
      if(error?.code==='23505'||/UNIQUE constraint failed: user_skill_chip_loadout_v2046\.user_id\b|duplicate key value violates unique constraint/i.test(String(error?.message||''))){
        const peer=skillChipByCode(code).exclusiveWith;
        if(peer&&await env.DB.prepare('SELECT slot_no FROM user_skill_chip_loadout_v2046 WHERE user_id=? AND item_code=? AND slot_no<>?').bind(user.id,peer,slot).first()){
          return json({error:'헬기폭격과 양자폭탄은 둘 중 하나만 장착할 수 있습니다.'},409);
        }
        return json({error:'동일한 스킬칩은 중복 장착할 수 없습니다.'},409);
      }
      throw error;
    }
  }
  return json({ok:true,skillChips:await skillChipPayload(env,user.id)});
}
