export const ROSTER_CARD_RETIREMENT_VERSION=2056;
export const ROSTER_CARD_RETIREMENT_MARKER_KEY='roster_card_retirement_v2056_completed';
export const SUPERSTAR_REROLL_TICKET_CODE='SUPERSTAR_REROLL_TICKET';
export const SON_HEUNG_MIN_CARD_ID='CN-A041807B14B54C89';
export const CHEETAH_CARD_ID='CN-5D0E2E4D58C9416F';

export const ROSTER_CARD_RETIREMENT_SOURCES=Object.freeze([
  {id:'CN-0B48C6FF8F9B4AC5',title:'Faker',member:'Faker',grade:'FUR',policy:'CHEETAH_TRANSFER'},
  {id:'CN-48BBCAC81D0E44FA',title:'Chovy',member:'Chovy',grade:'SUPERSTAR',policy:'SON_HEUNG_MIN'},
  {id:'CN-F7D77F561A7949EE',title:'Zeus',member:'Zeus',grade:'SUPERSTAR',policy:'SUPERSTAR_REROLL'},
  {id:'CN-3723AA9103A748AE',title:'셀카찍는 박틸다',member:'박틸다',grade:'LIMITED',policy:'STANDARD'},
  {id:'CN-6CCD07B14AC74665',title:'피자먹는 박틸다',member:'박틸다',grade:'LIMITED',policy:'STANDARD'},
  {id:'CN-765D30C0C1E44A18',title:'박틸다',member:'박틸다',grade:'PRESTIGE',policy:'STANDARD'},
  {id:'CN-BE9EB8304A744ECF',title:'박틸다',member:'박틸다',grade:'ZENITH',policy:'STANDARD'},
  {id:'CN-1A1DABCBFAEE495C',title:'귀척하는 밤비',member:'밤비',grade:'LIMITED',policy:'STANDARD'},
  {id:'CN-9B9094FC8CF14C24',title:'밤비',member:'밤비',grade:'PRESTIGE',policy:'STANDARD'},
  {id:'CN-C68D9F67244040E7',title:'서윤슬',member:'서윤슬',grade:'PRESTIGE',policy:'STANDARD'},
  {id:'CN-B7973C8438EF4EA8',title:'섹시한 서윤슬',member:'서윤슬',grade:'LIMITED',policy:'STANDARD'},
  {id:'CN-A3F1F6D28EFA4702',title:'송피아',member:'송피아',grade:'PRESTIGE',policy:'STANDARD'},
  {id:'CN-ECEE079AC8AC4639',title:'스파이더 한갱',member:'한갱',grade:'LIMITED',policy:'STANDARD'},
  {id:'CN-212DB3265D9945CA',title:'한갱',member:'한갱',grade:'PRESTIGE',policy:'STANDARD'},
  {id:'card-0128',title:'우산쓰는 애순이',member:'애순이',grade:'HR',policy:'STANDARD'},
  {id:'card-0129',title:'모델 애순이',member:'애순이',grade:'SSR',policy:'STANDARD'},
  {id:'card-0131',title:'맥심 애순이',member:'애순이',grade:'U',policy:'STANDARD'},
  {id:'card-0134',title:'파이널 애순이',member:'애순이',grade:'R',policy:'STANDARD'},
  {id:'card-0135',title:'잡아먹는 애순이',member:'애순이',grade:'SR',policy:'STANDARD'},
  {id:'CN-45A52B1DCC27439C',title:'미녀 애순이',member:'애순이',grade:'LIMITED',policy:'STANDARD'},
  {id:'CN-6B0D4B65D6F04355',title:'애순이',member:'애순이',grade:'ZENITH',policy:'STANDARD'},
  {id:'CN-70442F7D21A44DAC',title:'엑셀 애순이',member:'애순이',grade:'LIMITED',policy:'STANDARD'},
  {id:'CN-7FED528CE1534D7C',title:'아리 애순',member:'애순이',grade:'MA',policy:'STANDARD'},
  {id:'CN-BD8A24E268DC4439',title:'애순이',member:'애순이',grade:'PRESTIGE',policy:'STANDARD'}
]);

const CHOVY_CARD_ID='CN-48BBCAC81D0E44FA';
const ZEUS_CARD_ID='CN-F7D77F561A7949EE';
const FAKER_CARD_ID='CN-0B48C6FF8F9B4AC5';
const MEMBER_WIDE_RETIREMENTS=Object.freeze(['박틸다','애순이','밤비','서윤슬','한갱','송피아']);
const SOURCE_IDS=Object.freeze(ROSTER_CARD_RETIREMENT_SOURCES.map(card=>card.id));
const SOURCE_BY_ID=new Map(ROSTER_CARD_RETIREMENT_SOURCES.map(card=>[card.id,card]));
const DECK_SIZE=5;
const DECK_GRADE_LIMITS=Object.freeze({PRESTIGE:2,FUR:2,ZENITH:2,SUPERSTAR:1});
const GRADE_RANK=Object.freeze({C:1,U:2,R:3,SR:4,HR:5,UR:6,SSR:7,MA:8,LIMITED:9,PRESTIGE:10,FUR:11,ZENITH:12,SUPERSTAR:13});
const TICKET_BY_GRADE=Object.freeze({
  MA:'MA_REROLL_TICKET',LIMITED:'LIMITED_REROLL_TICKET',PRESTIGE:'PRESTIGE_REROLL_TICKET',FUR:'FUR_REROLL_TICKET'
});
const TICKET_CATALOG=Object.freeze([
  ['MA_REROLL_TICKET','MA 재뽑기권','MA RETIREMENT REROLL','퇴사 처리된 MA 카드를 대신해 활성 MA 카드 1장을 다시 뽑습니다.','MA',110],
  ['LIMITED_REROLL_TICKET','리미티드 재뽑기권','LIMITED RETIREMENT REROLL','퇴사 처리된 리미티드 카드를 대신해 활성 리미티드 카드 1장을 다시 뽑습니다.','LIMITED',111],
  ['PRESTIGE_REROLL_TICKET','PRESTIGE 재뽑기권','PRESTIGE RETIREMENT REROLL','퇴사 처리된 PRESTIGE 카드를 대신해 활성 PRESTIGE 카드 1장을 다시 뽑습니다.','PRESTIGE',112],
  ['FUR_REROLL_TICKET','FUR 재뽑기권','FUR RETIREMENT REROLL','퇴사 처리된 FUR 카드를 대신해 활성 FUR 카드 1장을 다시 뽑습니다.','FUR',113],
  [SUPERSTAR_REROLL_TICKET_CODE,'슈퍼스타 재뽑기권','SUPERSTAR RETIREMENT REROLL','퇴사 처리된 슈퍼스타 카드를 대신해 활성 슈퍼스타 카드 1장을 다시 뽑습니다.','SUPERSTAR',114]
]);

const CARD_SNAPSHOT_TABLE='card_retirement_v2056_card_snapshots';
const USER_SNAPSHOT_TABLE='card_retirement_v2056_user_snapshots';
const DECK_SNAPSHOT_TABLE='card_retirement_v2056_deck_snapshots';
const REASON='ROSTER_CARD_RETIREMENT_V2056';

const pack=value=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?Number(item):item);
const integer=(value,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback};
const check=(condition,message)=>{if(!condition)throw new Error(message)};
function parseJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completed(value,replayed=true){const parsed=parseJson(value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}
function normalizedIds(value){const parsed=Array.isArray(value)?value:parseJson(value,[]);return Array.isArray(parsed)?parsed.map(item=>String(item&&typeof item==='object'?(item.id??item.card_id??''):item)).filter(Boolean).slice(0,DECK_SIZE):[]}
function normalizedOwned(row={}){return{id:String(row.id||row.card_id||''),grade:String(row.grade||row.rarity||'').toUpperCase(),level:Math.max(0,integer(row.level??row.breakthrough_level)),basePower:Math.max(0,Number(row.base_power??row.basePower)||0),title:String(row.title||'')}}
function gradeAllowed(card,counts){const limit=DECK_GRADE_LIMITS[card.grade];return !limit||Number(counts.get(card.grade)||0)<limit}
function compareCandidates(a,b,preferred){
  const ap=a.id===preferred?0:1,bp=b.id===preferred?0:1;
  return ap-bp||(GRADE_RANK[b.grade]||0)-(GRADE_RANK[a.grade]||0)||b.level-a.level||b.basePower-a.basePower||a.id.localeCompare(b.id);
}

export function repairRosterRetirementDeck({cardIds=[],ownedCards=[],retiredIds=SOURCE_IDS,directReplacementBySource={[FAKER_CARD_ID]:CHEETAH_CARD_ID,[CHOVY_CARD_ID]:SON_HEUNG_MIN_CARD_ID}}={}){
  const before=normalizedIds(cardIds),retired=new Set(retiredIds.map(String)),owned=ownedCards.map(normalizedOwned).filter(card=>card.id&&!retired.has(card.id));
  const ownedById=new Map(owned.map(card=>[card.id,card])),used=new Set(),counts=new Map(),slots=[],preferred=[];
  let affected=before.some(id=>retired.has(id));
  for(const id of before){
    const card=ownedById.get(id);
    if(retired.has(id)){slots.push(null);preferred.push(String(directReplacementBySource[id]||''));continue}
    if(!card||used.has(id)||!gradeAllowed(card,counts)){affected=true;slots.push(null);preferred.push('');continue}
    slots.push(id);preferred.push('');used.add(id);counts.set(card.grade,Number(counts.get(card.grade)||0)+1);
  }
  while(slots.length<DECK_SIZE){slots.push(null);preferred.push('')}
  if(before.length!==DECK_SIZE)affected=true;
  if(!affected)return{affected:false,complete:true,before,after:[...before],changed:false,additions:[]};
  const additions=[];
  for(let index=0;index<DECK_SIZE;index++){
    if(slots[index])continue;
    const candidate=owned.filter(card=>!used.has(card.id)&&gradeAllowed(card,counts)).sort((a,b)=>compareCandidates(a,b,preferred[index]))[0];
    if(!candidate)continue;
    slots[index]=candidate.id;used.add(candidate.id);counts.set(candidate.grade,Number(counts.get(candidate.grade)||0)+1);
    additions.push({index,cardId:candidate.id,grade:candidate.grade,preferred:candidate.id===preferred[index]});
  }
  const after=slots.filter(Boolean),complete=after.length===DECK_SIZE;
  return{affected,complete,before,after,changed:pack(before)!==pack(after),additions};
}

function assertValidDeck(repair,label){
  check(repair.complete,`${label}을(를) 보유 카드 5장으로 복구할 수 없어 전체 카드 정산을 취소했습니다.`);
  check(repair.after.length===DECK_SIZE&&new Set(repair.after).size===DECK_SIZE,`${label} 복구 결과가 정확히 5장 고유 카드가 아닙니다.`);
}

async function ensureFoundation(env){
  check(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function','카드 일괄 정산은 PostgreSQL 운영 DB에서만 실행할 수 있습니다.');
  await env.DB.execSchema([
    `CREATE TABLE IF NOT EXISTS ${CARD_SNAPSHOT_TABLE}(
      operation_key TEXT NOT NULL,card_id TEXT NOT NULL,title TEXT NOT NULL,member_name TEXT NOT NULL,grade TEXT NOT NULL,
      card_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),
      PRIMARY KEY(operation_key,card_id))`,
    `CREATE TABLE IF NOT EXISTS ${USER_SNAPSHOT_TABLE}(
      operation_key TEXT NOT NULL,user_id BIGINT NOT NULL,nickname TEXT NOT NULL,source_card_id TEXT NOT NULL,source_title TEXT NOT NULL,
      source_grade TEXT NOT NULL,quantity INTEGER NOT NULL,breakthrough_level INTEGER NOT NULL,breakthrough_fail_count INTEGER NOT NULL,
      user_card_json TEXT NOT NULL,source_advancement_json TEXT,target_user_card_json TEXT,target_advancement_json TEXT,evolution_progress_json TEXT,
      compensation_type TEXT NOT NULL,target_card_id TEXT,ticket_code TEXT,ticket_quantity_before INTEGER NOT NULL DEFAULT 0,refund_shards BIGINT NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),
      PRIMARY KEY(operation_key,user_id,source_card_id))`,
    `CREATE TABLE IF NOT EXISTS ${DECK_SNAPSHOT_TABLE}(
      operation_key TEXT NOT NULL,deck_type TEXT NOT NULL,deck_key TEXT NOT NULL,user_id BIGINT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),
      PRIMARY KEY(operation_key,deck_type,deck_key))`,
    `CREATE INDEX IF NOT EXISTS idx_card_retirement_v2056_user ON ${USER_SNAPSHOT_TABLE}(user_id,source_card_id)`,
    `CREATE INDEX IF NOT EXISTS idx_card_retirement_v2056_deck_user ON ${DECK_SNAPSHOT_TABLE}(user_id,deck_type)`,
    `ALTER TABLE ${USER_SNAPSHOT_TABLE} ADD COLUMN IF NOT EXISTS ticket_quantity_before INTEGER NOT NULL DEFAULT 0`
  ]);
}

async function transaction(db,operation){
  return db.enqueue(async()=>{
    const query=async(text,values=[])=>{const result=await db.client.query({text,values});return{rows:result.rows||[],rowCount:Number(result.rowCount??result.affectedRows??0)}};
    await query('BEGIN');
    try{
      await query("SET LOCAL TIME ZONE 'UTC'");
      await query("SET LOCAL lock_timeout='3s'");
      await query("SET LOCAL statement_timeout='18s'");
      const result=await operation(query);
      await query('COMMIT');
      return result;
    }catch(error){try{await query('ROLLBACK')}catch{}throw error}
  });
}

async function tableExists(query,name){return Boolean((await query('SELECT to_regclass($1) name',[name])).rows[0]?.name)}
function arraysEqual(a,b){return a.length===b.length&&a.every((value,index)=>value===b[index])}
function refundFor(plan,refundByGrade){
  if(plan.policy==='SON_HEUNG_MIN'||plan.policy==='CHEETAH_TRANSFER')return 0;
  const rules=refundByGrade?.[plan.grade];
  check(Array.isArray(rules),`${plan.grade} 퇴사 환급표가 없어 전체 정산을 중단했습니다.`);
  check(plan.level>=0&&plan.level<rules.length,`${plan.title} +${plan.level} 환급 구간이 없어 전체 정산을 중단했습니다.`);
  if(plan.level>10)for(let level=11;level<=plan.level;level++)check(integer(rules[level])-integer(rules[level-1])>0,`${plan.title} +${level} 고급 강화 환급액이 없어 전체 정산을 중단했습니다.`);
  return Math.max(0,integer(rules[plan.level]));
}

function targetTicket(source){
  if(source.policy==='SUPERSTAR_REROLL')return SUPERSTAR_REROLL_TICKET_CODE;
  if(source.policy==='STANDARD')return TICKET_BY_GRADE[source.grade]||null;
  return null;
}

function makeDeckItem(type,row,field,key){return{type,row,userId:integer(row.user_id),field,key:String(key),raw:String(row[field]||'[]')}}

export async function ensureRosterCardRetirementV2056(env,{refundByGrade={}}={}){
  const existing=completed((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ROSTER_CARD_RETIREMENT_MARKER_KEY).first())?.value,true);
  if(existing)return existing;
  await ensureFoundation(env);
  return transaction(env.DB,async query=>{
    await query(`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`,[
      ROSTER_CARD_RETIREMENT_MARKER_KEY,pack({status:'PENDING',version:ROSTER_CARD_RETIREMENT_VERSION})
    ]);
    const marker=(await query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[ROSTER_CARD_RETIREMENT_MARKER_KEY])).rows[0];
    const replay=completed(marker?.value,true);if(replay)return replay;
    check(parseJson(marker?.value,{status:'PENDING'}).status==='PENDING','이전 카드 정산 작업이 완료되지 않은 상태입니다. 운영 점검이 필요합니다.');

    const optional={
      rifts:await tableExists(query,'pve_rift_runs'),territory:await tableExists(query,'territory_war_v3_users'),
      territoryRounds:await tableExists(query,'territory_war_v3_rounds'),alchemy:await tableExists(query,'alchemy_reward_pool_v1'),
      unifiedDrops:await tableExists(query,'unified_drop_entries_v1667'),evolution:await tableExists(query,'card_evolution_progress')
    };
    const locked=['cards','user_cards','card_unique_advancements_v1937','pve_decks','pvp_decks','pvp_deck_presets'];
    if(optional.rifts)locked.push('pve_rift_runs');if(optional.territory)locked.push('territory_war_v3_users');
    await query(`LOCK TABLE ${locked.join(',')} IN SHARE ROW EXCLUSIVE MODE NOWAIT`);

    const catalog=(await query(`SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,COALESCE(c.card_status,'PUBLIC') card_status,
        m.name member_name,m.is_active member_active,to_jsonb(raw_card)::text card_json
      FROM cards_effective_v1210 c JOIN cards raw_card ON raw_card.id=c.id JOIN members m ON m.id=c.member_id
      WHERE c.id=ANY($1::text[]) ORDER BY c.id FOR UPDATE OF raw_card`,[SOURCE_IDS])).rows;
    check(catalog.length===SOURCE_IDS.length,`정산 대상 카드 ${SOURCE_IDS.length-catalog.length}장이 카탈로그에서 누락됐습니다.`);
    const catalogById=new Map(catalog.map(card=>[String(card.id),card]));
    for(const expected of ROSTER_CARD_RETIREMENT_SOURCES){
      const actual=catalogById.get(expected.id);
      check(actual&&actual.title===expected.title&&actual.member_name===expected.member&&actual.grade===expected.grade,
        `${expected.id} 카드의 이름·멤버·등급이 확인값과 달라 전체 정산을 중단했습니다.`);
      check(integer(actual.is_active)===1&&String(actual.card_status).toUpperCase()==='PUBLIC'&&integer(actual.member_active)===1,
        `${expected.title} 카드가 활성·공개 상태가 아니어서 전체 정산을 중단했습니다.`);
    }
    const memberWide=(await query(`SELECT c.id,m.name member_name FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
      WHERE m.name=ANY($1::text[]) AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' ORDER BY c.id`,[MEMBER_WIDE_RETIREMENTS])).rows;
    for(const member of MEMBER_WIDE_RETIREMENTS){
      const actual=memberWide.filter(card=>card.member_name===member).map(card=>String(card.id)).sort();
      const expected=ROSTER_CARD_RETIREMENT_SOURCES.filter(card=>card.member===member).map(card=>card.id).sort();
      check(arraysEqual(actual,expected),`${member}의 활성 카드 목록이 사전 확인값과 달라 누락 방지를 위해 전체 정산을 중단했습니다.`);
    }
    const replacements=(await query(`SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,COALESCE(c.card_status,'PUBLIC') card_status,m.name member_name,m.is_active member_active
      FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=ANY($1::text[])`,[[SON_HEUNG_MIN_CARD_ID,CHEETAH_CARD_ID]])).rows;
    const replacementById=new Map(replacements.map(card=>[String(card.id),card])),son=replacementById.get(SON_HEUNG_MIN_CARD_ID),cheetah=replacementById.get(CHEETAH_CARD_ID);
    check(son&&son.title==='Son Heung min'&&son.member_name==='Son Heung min'&&son.grade==='SUPERSTAR'&&integer(son.is_active)===1&&String(son.card_status).toUpperCase()==='PUBLIC'&&integer(son.member_active)===1,
      '쵸비 보상 대상 손흥민 슈퍼스타 카드가 정상 활성 상태가 아니어서 전체 정산을 중단했습니다.');
    check(cheetah&&cheetah.title==='치타구'&&cheetah.member_name==='이예준'&&cheetah.grade==='FUR'&&integer(cheetah.is_active)===1&&String(cheetah.card_status).toUpperCase()==='PUBLIC'&&integer(cheetah.member_active)===1,
      '페이커 보상 대상 치타구 FUR 카드가 정상 활성 상태가 아니어서 전체 정산을 중단했습니다.');
    const owner=(await query("SELECT id FROM users WHERE UPPER(role)='OWNER' ORDER BY id LIMIT 1")).rows[0];
    check(owner?.id,'정산 감사 로그를 기록할 OWNER 계정을 찾지 못했습니다.');

    for(const [code,name,subtitle,description,rarity,sortOrder] of TICKET_CATALOG)await query(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active,updated_at)
      VALUES($1,$2,$3,$4,'REROLL',$5,'',$6,1,CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,subtitle=EXCLUDED.subtitle,description=EXCLUDED.description,category='REROLL',rarity=EXCLUDED.rarity,sort_order=EXCLUDED.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`,
      [code,name,subtitle,description,rarity,sortOrder]);

    const holders=(await query(`SELECT uc.user_id,u.nickname,uc.card_id,uc.quantity,COALESCE(uc.breakthrough_level,0) breakthrough_level,
        COALESCE(uc.breakthrough_fail_count,0) breakthrough_fail_count,to_jsonb(uc)::text user_card_json,
        (SELECT to_jsonb(a)::text FROM card_unique_advancements_v1937 a WHERE a.user_id=uc.user_id AND a.card_id=uc.card_id) source_advancement_json,
        (SELECT to_jsonb(tuc)::text FROM user_cards tuc WHERE tuc.user_id=uc.user_id AND tuc.card_id=CASE uc.card_id WHEN $2 THEN $4 WHEN $3 THEN $5 ELSE '' END) target_user_card_json,
        (SELECT to_jsonb(ta)::text FROM card_unique_advancements_v1937 ta WHERE ta.user_id=uc.user_id AND ta.card_id=CASE uc.card_id WHEN $2 THEN $4 WHEN $3 THEN $5 ELSE '' END) target_advancement_json,
        ${optional.evolution?"(SELECT to_jsonb(ep)::text FROM card_evolution_progress ep WHERE ep.user_id=uc.user_id AND ep.source_card_id=uc.card_id)":"NULL::text"} evolution_progress_json
      FROM user_cards uc JOIN users u ON u.id=uc.user_id WHERE uc.card_id=ANY($1::text[]) AND COALESCE(uc.quantity,0)>0
      ORDER BY uc.user_id,uc.card_id FOR UPDATE OF uc,u`,[SOURCE_IDS,FAKER_CARD_ID,CHOVY_CARD_ID,CHEETAH_CARD_ID,SON_HEUNG_MIN_CARD_ID])).rows;
    const affectedUsers=[...new Set(holders.map(row=>integer(row.user_id)))];
    const plans=holders.map(row=>{
      const source=SOURCE_BY_ID.get(String(row.card_id));check(source,`알 수 없는 정산 카드입니다: ${row.card_id}`);
      const plan={...source,userId:integer(row.user_id),nickname:String(row.nickname),quantity:Math.max(1,integer(row.quantity)),level:Math.max(0,integer(row.breakthrough_level)),failCount:Math.max(0,integer(row.breakthrough_fail_count)),
        userCardJson:String(row.user_card_json),sourceAdvancementJson:row.source_advancement_json||null,
        targetUserCardJson:[FAKER_CARD_ID,CHOVY_CARD_ID].includes(source.id)?(row.target_user_card_json||null):null,
        targetAdvancementJson:[FAKER_CARD_ID,CHOVY_CARD_ID].includes(source.id)?(row.target_advancement_json||null):null,evolutionProgressJson:row.evolution_progress_json||null};
      plan.targetCardId=source.id===FAKER_CARD_ID?CHEETAH_CARD_ID:source.id===CHOVY_CARD_ID?SON_HEUNG_MIN_CARD_ID:null;
      plan.refundShards=refundFor(plan,refundByGrade);plan.ticketCode=targetTicket(source);
      plan.compensationType=source.policy;return plan;
    });
    const ticketBalances=new Map();
    const ticketPlans=plans.filter(plan=>plan.ticketCode);
    if(ticketPlans.length){
      const users=[...new Set(ticketPlans.map(plan=>plan.userId))],codes=[...new Set(ticketPlans.map(plan=>plan.ticketCode))];
      const rows=(await query('SELECT user_id,item_code,quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[]) FOR UPDATE',[users,codes])).rows;
      for(const row of rows)ticketBalances.set(`${integer(row.user_id)}:${row.item_code}`,Math.max(0,integer(row.quantity)));
    }
    for(const plan of plans)plan.ticketQuantityBefore=plan.ticketCode?Number(ticketBalances.get(`${plan.userId}:${plan.ticketCode}`)||0):0;

    await query(`INSERT INTO ${CARD_SNAPSHOT_TABLE}(operation_key,card_id,title,member_name,grade,card_json)
      SELECT $1,x.card_id,x.title,x.member_name,x.grade,x.card_json FROM jsonb_to_recordset($2::jsonb)
      AS x(card_id text,title text,member_name text,grade text,card_json text) ON CONFLICT DO NOTHING`,[
      ROSTER_CARD_RETIREMENT_MARKER_KEY,pack(catalog.map(card=>({card_id:card.id,title:card.title,member_name:card.member_name,grade:card.grade,card_json:card.card_json})))
    ]);
    if(plans.length)await query(`INSERT INTO ${USER_SNAPSHOT_TABLE}(operation_key,user_id,nickname,source_card_id,source_title,source_grade,quantity,
        breakthrough_level,breakthrough_fail_count,user_card_json,source_advancement_json,target_user_card_json,target_advancement_json,evolution_progress_json,
        compensation_type,target_card_id,ticket_code,ticket_quantity_before,refund_shards)
      SELECT $1,x.user_id,x.nickname,x.source_card_id,x.source_title,x.source_grade,x.quantity,x.breakthrough_level,x.breakthrough_fail_count,x.user_card_json,
        x.source_advancement_json,x.target_user_card_json,x.target_advancement_json,x.evolution_progress_json,x.compensation_type,x.target_card_id,x.ticket_code,x.ticket_quantity_before,x.refund_shards
      FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,nickname text,source_card_id text,source_title text,source_grade text,quantity integer,
        breakthrough_level integer,breakthrough_fail_count integer,user_card_json text,source_advancement_json text,target_user_card_json text,target_advancement_json text,
        evolution_progress_json text,compensation_type text,target_card_id text,ticket_code text,ticket_quantity_before integer,refund_shards bigint) ON CONFLICT DO NOTHING`,[
      ROSTER_CARD_RETIREMENT_MARKER_KEY,pack(plans.map(plan=>({user_id:plan.userId,nickname:plan.nickname,source_card_id:plan.id,source_title:plan.title,source_grade:plan.grade,
        quantity:plan.quantity,breakthrough_level:plan.level,breakthrough_fail_count:plan.failCount,user_card_json:plan.userCardJson,source_advancement_json:plan.sourceAdvancementJson,
        target_user_card_json:plan.targetUserCardJson,target_advancement_json:plan.targetAdvancementJson,evolution_progress_json:plan.evolutionProgressJson,
        compensation_type:plan.compensationType,target_card_id:plan.targetCardId,ticket_code:plan.ticketCode,ticket_quantity_before:plan.ticketQuantityBefore,refund_shards:plan.refundShards})))
    ]);
    const snapshotCount=integer((await query(`SELECT COUNT(*) n FROM ${USER_SNAPSHOT_TABLE} WHERE operation_key=$1`,[ROSTER_CARD_RETIREMENT_MARKER_KEY])).rows[0]?.n);
    check(snapshotCount===plans.length,'사용자 카드 스냅샷 건수가 원본 보유 건수와 달라 전체 정산을 중단했습니다.');

    const fakerPlans=plans.filter(plan=>plan.id===FAKER_CARD_ID),chovyPlans=plans.filter(plan=>plan.id===CHOVY_CARD_ID);
    const applyDirectTransfer=async(sourceCardId,targetCardId,{replaceTargetAdvancement=false}={})=>{
      const directPlans=plans.filter(plan=>plan.id===sourceCardId);if(!directPlans.length)return;
      await query(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at)
        SELECT user_id,$2,quantity,breakthrough_level,breakthrough_fail_count,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM ${USER_SNAPSHOT_TABLE}
        WHERE operation_key=$1 AND source_card_id=$3
        ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+EXCLUDED.quantity,
          breakthrough_fail_count=CASE WHEN EXCLUDED.breakthrough_level>user_cards.breakthrough_level THEN EXCLUDED.breakthrough_fail_count WHEN EXCLUDED.breakthrough_level=user_cards.breakthrough_level THEN GREATEST(user_cards.breakthrough_fail_count,EXCLUDED.breakthrough_fail_count) ELSE user_cards.breakthrough_fail_count END,
          breakthrough_level=GREATEST(user_cards.breakthrough_level,EXCLUDED.breakthrough_level),last_obtained_at=CURRENT_TIMESTAMP`,
        [ROSTER_CARD_RETIREMENT_MARKER_KEY,targetCardId,sourceCardId]);
      if(replaceTargetAdvancement)await query(`DELETE FROM card_unique_advancements_v1937 target USING ${USER_SNAPSHOT_TABLE} snapshot
        WHERE snapshot.operation_key=$1 AND snapshot.source_card_id=$2 AND snapshot.user_id=target.user_id AND target.card_id=$3
        AND snapshot.source_advancement_json IS NOT NULL`,[ROSTER_CARD_RETIREMENT_MARKER_KEY,sourceCardId,targetCardId]);
      await query(`UPDATE card_unique_advancements_v1937 source SET card_id=$2,updated_at=CURRENT_TIMESTAMP FROM ${USER_SNAPSHOT_TABLE} snapshot
        WHERE snapshot.operation_key=$1 AND snapshot.source_card_id=$3 AND snapshot.user_id=source.user_id AND source.card_id=snapshot.source_card_id
        AND snapshot.source_advancement_json IS NOT NULL AND ($4::integer=1 OR snapshot.target_advancement_json IS NULL)`,
        [ROSTER_CARD_RETIREMENT_MARKER_KEY,targetCardId,sourceCardId,replaceTargetAdvancement?1:0]);
    };
    await applyDirectTransfer(FAKER_CARD_ID,CHEETAH_CARD_ID,{replaceTargetAdvancement:true});
    await applyDirectTransfer(CHOVY_CARD_ID,SON_HEUNG_MIN_CARD_ID);

    if(plans.some(plan=>plan.refundShards>0)){
      await query(`UPDATE users target SET card_shards=target.card_shards+refund.amount FROM (
        SELECT user_id,SUM(refund_shards)::bigint amount FROM ${USER_SNAPSHOT_TABLE} WHERE operation_key=$1 GROUP BY user_id) refund
        WHERE target.id=refund.user_id AND refund.amount>0`,[ROSTER_CARD_RETIREMENT_MARKER_KEY]);
      await query(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id)
        SELECT snapshot.user_id,snapshot.refund_shards,target.card_shards,$2,snapshot.source_card_id FROM ${USER_SNAPSHOT_TABLE} snapshot
        JOIN users target ON target.id=snapshot.user_id WHERE snapshot.operation_key=$1 AND snapshot.refund_shards>0`,[ROSTER_CARD_RETIREMENT_MARKER_KEY,REASON]);
    }
    if(plans.some(plan=>plan.ticketCode)){
      await query(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
        SELECT user_id,ticket_code,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM ${USER_SNAPSHOT_TABLE}
        WHERE operation_key=$1 AND ticket_code IS NOT NULL GROUP BY user_id,ticket_code ON CONFLICT(user_id,item_code) DO NOTHING`,[ROSTER_CARD_RETIREMENT_MARKER_KEY]);
      await query(`UPDATE cnine_user_inventory target SET quantity=target.quantity+ticket_grant.amount,unseen_quantity=target.unseen_quantity+ticket_grant.amount,updated_at=CURRENT_TIMESTAMP
        FROM (SELECT user_id,ticket_code,COUNT(*)::integer amount FROM ${USER_SNAPSHOT_TABLE} WHERE operation_key=$1 AND ticket_code IS NOT NULL GROUP BY user_id,ticket_code) ticket_grant
        WHERE target.user_id=ticket_grant.user_id AND target.item_code=ticket_grant.ticket_code`,[ROSTER_CARD_RETIREMENT_MARKER_KEY]);
      await query(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
        SELECT snapshot.user_id,snapshot.ticket_code,1,target.quantity,$2,'CARD_RETIREMENT',snapshot.source_card_id,$3
        FROM ${USER_SNAPSHOT_TABLE} snapshot JOIN cnine_user_inventory target ON target.user_id=snapshot.user_id AND target.item_code=snapshot.ticket_code
        WHERE snapshot.operation_key=$1 AND snapshot.ticket_code IS NOT NULL`,[ROSTER_CARD_RETIREMENT_MARKER_KEY,REASON,owner.id]);
    }

    const ownedRows=affectedUsers.length?(await query(`SELECT uc.user_id,c.id,c.title,UPPER(c.rarity) grade,COALESCE(c.base_power,0) base_power,
        COALESCE(uc.breakthrough_level,0) breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id
      WHERE uc.user_id=ANY($1::bigint[]) AND COALESCE(uc.quantity,0)>0 AND NOT(c.id=ANY($2::text[])) AND c.is_active=1
        AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 ORDER BY uc.user_id,c.id`,[affectedUsers,SOURCE_IDS])).rows:[];
    const ownedByUser=new Map();for(const row of ownedRows){const id=integer(row.user_id);if(!ownedByUser.has(id))ownedByUser.set(id,[]);ownedByUser.get(id).push(row)}
    const deckItems=[];
    if(affectedUsers.length){
      for(const row of (await query('SELECT user_id,card_ids FROM pve_decks WHERE user_id=ANY($1::bigint[]) FOR UPDATE',[affectedUsers])).rows)deckItems.push(makeDeckItem('PVE',row,'card_ids',row.user_id));
      for(const row of (await query('SELECT user_id,card_ids FROM pvp_decks WHERE user_id=ANY($1::bigint[]) FOR UPDATE',[affectedUsers])).rows)deckItems.push(makeDeckItem('PVP',row,'card_ids',row.user_id));
      for(const row of (await query('SELECT user_id,preset_no,card_ids FROM pvp_deck_presets WHERE user_id=ANY($1::bigint[]) FOR UPDATE',[affectedUsers])).rows)deckItems.push(makeDeckItem('PVP_PRESET',row,'card_ids',`${row.user_id}:${row.preset_no}`));
      if(optional.rifts)for(const row of (await query("SELECT run_id,user_id,deck_cards,state_json FROM pve_rift_runs WHERE status='ACTIVE' AND user_id=ANY($1::bigint[]) FOR UPDATE",[affectedUsers])).rows)deckItems.push(makeDeckItem('PVE_RIFT',row,'deck_cards',row.run_id));
      if(optional.territory&&optional.territoryRounds)for(const row of (await query(`SELECT w.round_id,w.user_id,w.deck_snapshot FROM territory_war_v3_users w JOIN territory_war_v3_rounds r ON r.id=w.round_id
        WHERE r.status IN ('RECRUITING','PREPARING','ACTIVE') AND w.user_id=ANY($1::bigint[]) FOR UPDATE OF w`,[affectedUsers])).rows)deckItems.push(makeDeckItem('TERRITORY',row,'deck_snapshot',`${row.round_id}:${row.user_id}`));
    }
    const repairs=[];
    for(const item of deckItems){
      const repair=repairRosterRetirementDeck({cardIds:item.raw,ownedCards:ownedByUser.get(item.userId)||[]});
      if(!repair.affected)continue;assertValidDeck(repair,`${item.type} 덱(${item.key})`);repairs.push({...item,repair});
    }
    if(repairs.length)await query(`INSERT INTO ${DECK_SNAPSHOT_TABLE}(operation_key,deck_type,deck_key,user_id,before_json,after_json)
      SELECT $1,x.deck_type,x.deck_key,x.user_id,x.before_json,x.after_json FROM jsonb_to_recordset($2::jsonb)
      AS x(deck_type text,deck_key text,user_id bigint,before_json text,after_json text) ON CONFLICT DO NOTHING`,[
      ROSTER_CARD_RETIREMENT_MARKER_KEY,pack(repairs.map(item=>({deck_type:item.type,deck_key:item.key,user_id:item.userId,before_json:item.raw,after_json:pack(item.repair.after)})))
    ]);
    for(const item of repairs){
      const next=pack(item.repair.after);let changed;
      if(item.type==='PVE')changed=await query('UPDATE pve_decks SET card_ids=$1,updated_at=CURRENT_TIMESTAMP WHERE user_id=$2 AND card_ids=$3',[next,item.userId,item.raw]);
      if(item.type==='PVP')changed=await query('UPDATE pvp_decks SET card_ids=$1,updated_at=CURRENT_TIMESTAMP WHERE user_id=$2 AND card_ids=$3',[next,item.userId,item.raw]);
      if(item.type==='PVP_PRESET')changed=await query('UPDATE pvp_deck_presets SET card_ids=$1,updated_at=CURRENT_TIMESTAMP WHERE user_id=$2 AND preset_no=$3 AND card_ids=$4',[next,item.userId,integer(item.row.preset_no),item.raw]);
      if(item.type==='PVE_RIFT'){
        const state=parseJson(item.row.state_json,{}),hp={...(state?.hp||{})};
        if(Object.prototype.hasOwnProperty.call(hp,FAKER_CARD_ID)&&!Object.prototype.hasOwnProperty.call(hp,CHEETAH_CARD_ID))hp[CHEETAH_CARD_ID]=hp[FAKER_CARD_ID];
        if(Object.prototype.hasOwnProperty.call(hp,CHOVY_CARD_ID)&&!Object.prototype.hasOwnProperty.call(hp,SON_HEUNG_MIN_CARD_ID))hp[SON_HEUNG_MIN_CARD_ID]=hp[CHOVY_CARD_ID];
        for(const id of SOURCE_IDS)delete hp[id];
        changed=await query("UPDATE pve_rift_runs SET deck_cards=$1,state_json=$2,updated_at=CURRENT_TIMESTAMP WHERE run_id=$3 AND status='ACTIVE' AND deck_cards=$4",[next,pack({...state,hp}),item.key,item.raw]);
      }
      if(item.type==='TERRITORY')changed=await query(`UPDATE territory_war_v3_users SET deck_snapshot=$1,
        formation_breakdown_json=$2,loadout_refreshed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE round_id=$3 AND user_id=$4 AND deck_snapshot=$5`,
        [next,pack({version:2,deckComplete:true,repairPending:'ROSTER_CARD_RETIREMENT_V2056_PENDING'}),integer(item.row.round_id),item.userId,item.raw]);
      check(changed?.rowCount===1,`${item.type} 덱(${item.key})이 정산 중 변경되어 전체 작업을 취소했습니다.`);
    }

    await query(`UPDATE deck_synergies SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE is_active=1 AND EXISTS(
      SELECT 1 FROM unnest($1::text[]) source_id WHERE required_card_ids LIKE ('%'||source_id||'%'))`,[SOURCE_IDS]);
    await query('DELETE FROM card_pack_cards WHERE card_id=ANY($1::text[])',[SOURCE_IDS]);
    await query('DELETE FROM card_acquisition_effects WHERE card_id=ANY($1::text[])',[SOURCE_IDS]);
    await query('UPDATE card_unique_effects SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE card_id=ANY($1::text[])',[SOURCE_IDS]);
    if(optional.alchemy)await query("UPDATE alchemy_reward_pool_v1 SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE UPPER(reward_type)='CARD' AND reward_ref=ANY($1::text[])",[SOURCE_IDS]);
    if(optional.unifiedDrops)await query("UPDATE unified_drop_entries_v1667 SET is_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE UPPER(reward_type)='CARD' AND reward_ref=ANY($1::text[])",[SOURCE_IDS]);
    if(optional.evolution)await query('DELETE FROM card_evolution_progress WHERE source_card_id=ANY($1::text[])',[SOURCE_IDS]);
    await query('DELETE FROM card_unique_advancements_v1937 WHERE card_id=ANY($1::text[])',[SOURCE_IDS]);
    const removed=(await query('DELETE FROM user_cards WHERE card_id=ANY($1::text[]) RETURNING user_id,card_id',[SOURCE_IDS])).rows;
    check(removed.length===plans.length,'삭제된 사용자 카드 건수가 스냅샷 건수와 달라 전체 정산을 중단했습니다.');
    const cardColumns=(await query(`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='cards'`)).rows.map(row=>row.column_name);
    const rerollColumns=cardColumns.includes('reroll_result_enabled')?',reroll_result_enabled=0':'';
    const materialColumns=cardColumns.includes('reroll_material_enabled')?',reroll_material_enabled=0':'';
    const retired=(await query(`UPDATE cards SET is_active=0,card_status='RETIRED',draw_weight=0${rerollColumns}${materialColumns},updated_at=CURRENT_TIMESTAMP
      WHERE id=ANY($1::text[]) RETURNING id`,[SOURCE_IDS])).rows;
    check(retired.length===SOURCE_IDS.length,'카탈로그에서 퇴사 처리된 카드 수가 대상 수와 다릅니다.');

    const finalOwnership=integer((await query('SELECT COUNT(*) n FROM user_cards WHERE card_id=ANY($1::text[]) AND quantity>0',[SOURCE_IDS])).rows[0]?.n);
    const finalAdvancement=integer((await query('SELECT COUNT(*) n FROM card_unique_advancements_v1937 WHERE card_id=ANY($1::text[])',[SOURCE_IDS])).rows[0]?.n);
    const finalPublic=integer((await query("SELECT COUNT(*) n FROM cards WHERE id=ANY($1::text[]) AND (is_active<>0 OR COALESCE(card_status,'')<>'RETIRED')",[SOURCE_IDS])).rows[0]?.n);
    check(finalOwnership===0&&finalAdvancement===0&&finalPublic===0,'퇴사 카드의 최종 제거 검증에 실패해 전체 정산을 취소했습니다.');
    for(const item of repairs){
      const table=item.type==='PVE'?'pve_decks':item.type==='PVP'?'pvp_decks':item.type==='PVP_PRESET'?'pvp_deck_presets':item.type==='PVE_RIFT'?'pve_rift_runs':'territory_war_v3_users';
      let current;
      if(item.type==='PVE'||item.type==='PVP')current=(await query(`SELECT card_ids value FROM ${table} WHERE user_id=$1`,[item.userId])).rows[0]?.value;
      else if(item.type==='PVP_PRESET')current=(await query('SELECT card_ids value FROM pvp_deck_presets WHERE user_id=$1 AND preset_no=$2',[item.userId,integer(item.row.preset_no)])).rows[0]?.value;
      else if(item.type==='PVE_RIFT')current=(await query('SELECT deck_cards value FROM pve_rift_runs WHERE run_id=$1',[item.key])).rows[0]?.value;
      else current=(await query('SELECT deck_snapshot value FROM territory_war_v3_users WHERE round_id=$1 AND user_id=$2',[integer(item.row.round_id),item.userId])).rows[0]?.value;
      check(arraysEqual(normalizedIds(current),item.repair.after),`${item.type} 덱(${item.key}) 최종 검증에 실패했습니다.`);
    }
    const fakerAdvancements=plans.filter(plan=>plan.id===FAKER_CARD_ID&&plan.sourceAdvancementJson).length;
    const superstarTicketRows=plans.filter(plan=>plan.id===ZEUS_CARD_ID).length;
    const verifyDirectTransfer=async(sourceCardId,targetCardId,{requireSourceAdvancement=false}={})=>{
      const expected=plans.filter(plan=>plan.id===sourceCardId).length;if(!expected)return 0;
      return integer((await query(`SELECT COUNT(*) n FROM ${USER_SNAPSHOT_TABLE} snapshot JOIN user_cards target
      ON target.user_id=snapshot.user_id AND target.card_id=$2 WHERE snapshot.operation_key=$1 AND snapshot.source_card_id=$3
      AND target.quantity=snapshot.quantity+COALESCE(NULLIF(snapshot.target_user_card_json,'')::jsonb->>'quantity','0')::integer
      AND target.breakthrough_level=GREATEST(snapshot.breakthrough_level,COALESCE(NULLIF(snapshot.target_user_card_json,'')::jsonb->>'breakthrough_level','0')::integer)
      AND (snapshot.source_advancement_json IS NULL OR ($4::integer=0 AND snapshot.target_advancement_json IS NOT NULL) OR EXISTS(SELECT 1 FROM card_unique_advancements_v1937 advanced
        WHERE advanced.user_id=snapshot.user_id AND advanced.card_id=$2 AND advanced.class_code=(snapshot.source_advancement_json::jsonb->>'class_code')
          AND advanced.dominant_type=(snapshot.source_advancement_json::jsonb->>'dominant_type')
          AND advanced.config_version=COALESCE((snapshot.source_advancement_json::jsonb->>'config_version')::integer,advanced.config_version)
          AND advanced.cost_master_stars=COALESCE((snapshot.source_advancement_json::jsonb->>'cost_master_stars')::integer,advanced.cost_master_stars)
          AND advanced.modifiers_json=COALESCE(snapshot.source_advancement_json::jsonb->>'modifiers_json',advanced.modifiers_json)
          AND advanced.request_id=(snapshot.source_advancement_json::jsonb->>'request_id')))`,
      [ROSTER_CARD_RETIREMENT_MARKER_KEY,targetCardId,sourceCardId,requireSourceAdvancement?1:0])).rows[0]?.n);
    };
    const fakerRows=fakerPlans.length,chovyRows=chovyPlans.length;
    const fakerVerified=await verifyDirectTransfer(FAKER_CARD_ID,CHEETAH_CARD_ID,{requireSourceAdvancement:true});
    check(fakerVerified===fakerRows,'페이커→치타구 카드·강화·전직 이전 검증에 실패했습니다.');
    const chovyVerified=await verifyDirectTransfer(CHOVY_CARD_ID,SON_HEUNG_MIN_CARD_ID);
    check(chovyVerified===chovyRows,'쵸비→손흥민 카드 보상 검증에 실패했습니다.');
    const zeusVerified=superstarTicketRows?integer((await query(`SELECT COUNT(*) n FROM ${USER_SNAPSHOT_TABLE} snapshot JOIN cnine_user_inventory inventory
      ON inventory.user_id=snapshot.user_id AND inventory.item_code=$2 WHERE snapshot.operation_key=$1 AND snapshot.source_card_id=$3
      AND inventory.quantity=snapshot.ticket_quantity_before+1`,
      [ROSTER_CARD_RETIREMENT_MARKER_KEY,SUPERSTAR_REROLL_TICKET_CODE,ZEUS_CARD_ID])).rows[0]?.n):0;
    check(zeusVerified===superstarTicketRows,'제우스 슈퍼스타 재뽑기권 지급 검증에 실패했습니다.');

    const ticketRows=plans.filter(plan=>plan.ticketCode).length,totalRefundShards=plans.reduce((sum,plan)=>sum+plan.refundShards,0);
    const byType=type=>repairs.filter(item=>item.type===type).length;
    const summary={status:'COMPLETED',version:ROSTER_CARD_RETIREMENT_VERSION,completedAt:new Date().toISOString(),retiredCards:SOURCE_IDS.length,
      ownershipRows:plans.length,affectedUsers:affectedUsers.length,snapshotRows:snapshotCount,fakerAdvancementSnapshots:fakerAdvancements,
      compensation:{fakerToCheetahRows:fakerRows,fakerAdvancementsTransferred:fakerAdvancements,chovyToSonRows:chovyRows,
        zeusSuperstarRerollTickets:superstarTicketRows,totalRerollTickets:ticketRows,totalRefundShards},
      rewrittenDecks:{pve:byType('PVE'),pvp:byType('PVP'),presets:byType('PVP_PRESET'),rifts:byType('PVE_RIFT'),territory:byType('TERRITORY')},
      verification:{ownershipRemoved:true,advancementsRemoved:true,catalogRetired:true,decksKeptAtFive:true,snapshotsRetained:true},replayed:false};
    await query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      VALUES($1,'ROSTER_CARD_RETIREMENT_V2056','CARD_BATCH',$2,$3,$4)`,[owner.id,ROSTER_CARD_RETIREMENT_MARKER_KEY,
      pack({sourceCardIds:SOURCE_IDS,snapshotTables:[CARD_SNAPSHOT_TABLE,USER_SNAPSHOT_TABLE,DECK_SNAPSHOT_TABLE]}),pack(summary)]);
    await query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1',[ROSTER_CARD_RETIREMENT_MARKER_KEY,pack(summary)]);
    console.log('ROSTER_CARD_RETIREMENT_V2056',pack(summary));
    return summary;
  });
}
