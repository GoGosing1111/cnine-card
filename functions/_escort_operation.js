const SETTINGS_KEY='escort_operation_settings_v1830';
const RUN_TABLE='pve_escort_runs_v1830';
const WEEKLY_TABLE='pve_escort_weekly_v1830';
const RECEIPT_TABLE='pve_escort_action_receipts_v1830';
const ACTIVE_STATUSES=['ACTIVE','COMPLETED_PENDING','CLAIMING'];

const DEFAULT_SECTORS=Object.freeze([
  {key:'DEPARTURE',name:'호송 집결지',label:'출발지 편성',enemyName:'혈조 정찰대',enemyImage:'/assets/responsive/project-v/monsters/tower-024-blood-crow-sd-v1-768.webp',enemyPower:125000,hazardPercent:8,isBoss:false,brief:'저장된 PVE 덱을 고정하고 출발지를 기습한 정찰대를 제거합니다.'},
  {key:'AMBUSH',name:'야간 협곡',label:'일반 습격',enemyName:'타락한 방벽기사',enemyImage:'/assets/responsive/project-v/monsters/tower-021-fallen-paladin-sd-v1-768.webp',enemyPower:165000,hazardPercent:11,isBoss:false,brief:'협곡 양측에서 수송차를 노리는 습격대를 돌파하십시오.'},
  {key:'BLOCKADE',name:'포격 검문선',label:'도로 봉쇄·포격',enemyName:'커맨더 크리그',enemyImage:'/assets/responsive/project-v/monsters/tower-064-commander-krieg-sd-v1-768.webp',enemyPower:215000,hazardPercent:14,isBoss:false,brief:'자주포 사격을 지휘하는 봉쇄 부대를 무력화합니다.'},
  {key:'REPAIR',name:'붕괴 정비기지',label:'정비 지점',enemyName:'보랏빛 공성술사',enemyImage:'/assets/responsive/project-v/monsters/tower-028-violet-magus-boss-sd-v1-768.webp',enemyPower:265000,hazardPercent:12,isBoss:true,brief:'정비 설비를 점거한 포격 지휘관을 제거하십시오.'},
  {key:'FINAL_BOSS',name:'철의 종착지',label:'추격대·최종 보스',enemyName:'오메가-09 추격형',enemyImage:'/assets/responsive/project-v/monsters/hunt-068-omega-09-sd-v1-768.webp',enemyPower:340000,hazardPercent:20,isBoss:true,brief:'마지막 추격 병기를 격파하고 호송차를 인계하십시오.'}
]);

const TACTICS=Object.freeze({
  REPAIR:{key:'REPAIR',name:'긴급 현장정비',type:'FIELD REPAIR',duration:'즉시 적용',icon:'/assets/ui/escort/tactics/tactic-field-repair-v1833.webp',description:'현재 호송차의 손상된 내구도를 즉시 복구합니다.'},
  BARRIER:{key:'BARRIER',name:'전개형 방벽',type:'AEGIS BARRIER',duration:'다음 1구간',icon:'/assets/ui/escort/tactics/tactic-aegis-barrier-v1833.webp',description:'다음 구간 호송차가 받는 피해를 45% 경감합니다.'},
  AIRSTRIKE:{key:'AIRSTRIKE',name:'융단폭격',type:'CARPET STRIKE',duration:'다음 1구간',icon:'/assets/ui/escort/tactics/tactic-carpet-strike-v1833.webp',description:'다음 구간 적 전투력을 15% 선제 약화합니다.'},
  OVERCHARGE:{key:'OVERCHARGE',name:'전술 과충전',type:'CORE OVERDRIVE',duration:'다음 1구간',icon:'/assets/ui/escort/tactics/tactic-core-overdrive-v1833.webp',description:'다음 구간 아군 전투력을 12% 강화합니다.'},
  JAMMING:{key:'JAMMING',name:'광역 교란',type:'SIGNAL JAMMER',duration:'다음 1구간',icon:'/assets/ui/escort/tactics/tactic-signal-jammer-v1833.webp',description:'다음 구간 적 전투력 8%, 호송차 피해 15%를 동시에 낮춥니다.'}
});

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const integer=(value,fallback=0,min=0,max=2147483647)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(value))?Number(value):fallback)));
const cleanText=(value,max=160)=>String(value??'').trim().slice(0,max);
const jsonSafe=(value,fallback={})=>{try{return value?JSON.parse(value):fallback}catch{return fallback}};
const isOwner=user=>String(user?.role||'').trim().toUpperCase()==='OWNER';
const hashText=value=>Array.from(String(value||'')).reduce((hash,char)=>(Math.imul(hash^char.charCodeAt(0),16777619)>>>0),2166136261);

function weekKey(now=Date.now()){
  const kst=new Date(now+9*3600000),day=(kst.getUTCDay()+6)%7;
  kst.setUTCDate(kst.getUTCDate()-day);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`;
}

function cleanSector(raw={},index=0){
  const base=DEFAULT_SECTORS[index]||DEFAULT_SECTORS[0];
  return {
    key:cleanText(raw.key||base.key,32).toUpperCase().replace(/[^A-Z0-9_]/g,'_'),
    name:cleanText(raw.name||base.name,40),label:cleanText(raw.label||base.label,40),
    enemyName:cleanText(raw.enemyName||base.enemyName,60),enemyImage:cleanText(raw.enemyImage||base.enemyImage,360),
    enemyPower:integer(raw.enemyPower,base.enemyPower,1000,2000000000),hazardPercent:integer(raw.hazardPercent,base.hazardPercent,0,90),
    isBoss:raw.isBoss===true||Number(raw.isBoss)===1,brief:cleanText(raw.brief||base.brief,160)
  };
}

export function defaultEscortSettings(){
  return {mode:'TEST',title:'철벽 호송작전',description:'5개 전선을 돌파해 장갑 수송차를 목적지까지 호위하십시오.',vehicleMaxHp:10000,weeklyRunLimit:10,weeklyRewardLimit:3,baseCoin:2500000,baseShards:250,repairPercent:20,sectors:DEFAULT_SECTORS.map(cleanSector)};
}

export function cleanEscortSettings(raw={}){
  const base=defaultEscortSettings(),mode=['OFF','TEST','ON'].includes(String(raw.mode||'').toUpperCase())?String(raw.mode).toUpperCase():base.mode;
  const incoming=Array.isArray(raw.sectors)?raw.sectors:base.sectors;
  return {
    mode,title:cleanText(raw.title||base.title,60),description:cleanText(raw.description||base.description,220),
    vehicleMaxHp:integer(raw.vehicleMaxHp,base.vehicleMaxHp,1000,10000000),weeklyRunLimit:integer(raw.weeklyRunLimit,base.weeklyRunLimit,1,100),
    weeklyRewardLimit:integer(raw.weeklyRewardLimit,base.weeklyRewardLimit,1,30),baseCoin:integer(raw.baseCoin,base.baseCoin,0,2000000000),
    baseShards:integer(raw.baseShards,base.baseShards,0,1000000),repairPercent:integer(raw.repairPercent,base.repairPercent,1,100),
    sectors:Array.from({length:5},(_,index)=>cleanSector(incoming[index],index))
  };
}

let ensurePromise=null;
function schemaStatements(env){
  const postgres=env.DB?.dialect==='postgres',userIdType=postgres?'BIGINT':'INTEGER';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  // Pages 런타임 DB 역할은 기존 users 테이블 SELECT 권한만 있고 REFERENCES 권한은
  // 없을 수 있다. PostgreSQL 자가 복구 테이블은 인증된 user_id만 받아 외부 FK를
  // 생략하고, 권한 있는 정식 마이그레이션에서는 FK 계약을 그대로 적용한다.
  const userForeignKey=postgres?'':',FOREIGN KEY(user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED';
  return [
    `CREATE TABLE IF NOT EXISTS ${RUN_TABLE}(run_id TEXT PRIMARY KEY,user_id ${userIdType} NOT NULL,week_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',sector_index INTEGER NOT NULL DEFAULT 0,vehicle_hp INTEGER NOT NULL,vehicle_max_hp INTEGER NOT NULL,deck_snapshot TEXT NOT NULL,state_json TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1,reward_coin BIGINT NOT NULL DEFAULT 0,reward_shards INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},completed_at TEXT,claimed_at TEXT${userForeignKey})`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pve_escort_active_user_v1830 ON ${RUN_TABLE}(user_id) WHERE status IN ('ACTIVE','COMPLETED_PENDING','CLAIMING')`,
    `CREATE INDEX IF NOT EXISTS idx_pve_escort_runs_user_v1830 ON ${RUN_TABLE}(user_id,started_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ${WEEKLY_TABLE}(user_id ${userIdType} NOT NULL,week_key TEXT NOT NULL,started_count INTEGER NOT NULL DEFAULT 0,completed_count INTEGER NOT NULL DEFAULT 0,reward_count INTEGER NOT NULL DEFAULT 0,best_vehicle_hp_percent INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(user_id,week_key)${userForeignKey})`,
    `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE}(request_id TEXT PRIMARY KEY,user_id ${userIdType} NOT NULL,run_id TEXT,action_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault}${userForeignKey},FOREIGN KEY(run_id) REFERENCES ${RUN_TABLE}(run_id) DEFERRABLE INITIALLY DEFERRED)`,
    `CREATE INDEX IF NOT EXISTS idx_pve_escort_receipts_user_v1830 ON ${RECEIPT_TABLE}(user_id,created_at DESC)`
  ];
}
async function ensure(env){
  if(!ensurePromise)ensurePromise=(async()=>{
    const statements=schemaStatements(env);
    // PostgreSQL 호환 계층은 일반 D1 batch() 안의 DDL을 안전상 실행하지 않는다.
    // 신규 배포에서 relation이 빠졌을 때는 고정 DDL만 허용하는 execSchema()로 복구한다.
    if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function')await env.DB.execSchema(statements);
    else await env.DB.batch(statements.map(sql=>env.DB.prepare(sql)));
    return true;
  })().catch(error=>{ensurePromise=null;throw error});
  return ensurePromise;
}

async function settings(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first();
  return cleanEscortSettings(jsonSafe(row?.value,{}));
}

function tacticWithSettings(tactic,cfg){
  if(tactic.key!=='REPAIR')return {...tactic};
  return {...tactic,description:`현재 호송차의 손상된 내구도를 ${integer(cfg?.repairPercent,20,1,100)}% 즉시 복구합니다.`};
}
function visibleSettings(cfg){return {...cfg,tactics:Object.values(TACTICS).map(tactic=>tacticWithSettings(tactic,cfg))};}
function parseRun(row){if(!row)return null;return {...row,state:jsonSafe(row.state_json,{}) ,deck:jsonSafe(row.deck_snapshot,[])};}
function tacticChoices(runId,nextIndex,cfg){
  const keys=Object.keys(TACTICS),seed=hashText(`${runId}:${nextIndex}`),first=seed%keys.length,second=(first+1+((seed>>>8)%(keys.length-1)))%keys.length;
  return [TACTICS[keys[first]],TACTICS[keys[second]]].map(tactic=>tacticWithSettings(tactic,cfg));
}

function publicRun(row,cfg){
  const run=parseRun(row);if(!run)return null;
  const cardHp=run.state.cardHp||{},sectorIndex=clamp(run.sector_index,0,4),sector=cfg.sectors[sectorIndex];
  return {
    runId:run.run_id,status:run.status,phase:run.state.phase||'READY',weekKey:run.week_key,sectorIndex,
    sector,vehicleHp:Number(run.vehicle_hp||0),vehicleMaxHp:Number(run.vehicle_max_hp||cfg.vehicleMaxHp),
    vehiclePercent:Math.round(Number(run.vehicle_hp||0)/Math.max(1,Number(run.vehicle_max_hp||cfg.vehicleMaxHp))*1000)/10,
    deck:run.deck.map(card=>({...card,hpPercent:clamp(cardHp[String(card.id)]??100,0,100)})),
    pendingTactic:run.state.pendingTactic||null,choices:Array.isArray(run.state.choices)?run.state.choices:[],history:Array.isArray(run.state.history)?run.state.history:[],
    reward:{coin:Number(run.reward_coin||0),shards:Number(run.reward_shards||0)},startedAt:run.started_at,updatedAt:run.updated_at
  };
}

async function weeklyState(env,userId,key){
  const row=await env.DB.prepare(`SELECT * FROM ${WEEKLY_TABLE} WHERE user_id=? AND week_key=?`).bind(userId,key).first();
  return {weekKey:key,startedCount:Number(row?.started_count||0),completedCount:Number(row?.completed_count||0),rewardCount:Number(row?.reward_count||0),bestVehicleHpPercent:Number(row?.best_vehicle_hp_percent||0)};
}

async function currentRun(env,userId){
  return env.DB.prepare(`SELECT * FROM ${RUN_TABLE} WHERE user_id=? AND status IN ('ACTIVE','COMPLETED_PENDING','CLAIMING') ORDER BY started_at DESC LIMIT 1`).bind(userId).first();
}

async function statusPayload(env,user,cfg){
  const key=weekKey(),[run,weekly]=await Promise.all([currentRun(env,user.id),weeklyState(env,user.id,key)]);
  return {ok:true,ownerTest:cfg.mode==='TEST',settings:visibleSettings(cfg),run:publicRun(run,cfg),weekly,serverNow:new Date().toISOString()};
}

async function reserveReceipt(env,{requestId,userId,runId,action}){
  const prior=await env.DB.prepare(`SELECT * FROM ${RECEIPT_TABLE} WHERE request_id=?`).bind(requestId).first();
  if(prior&&Number(prior.user_id)!==Number(userId))return {error:'이미 사용된 요청 ID입니다.',status:409};
  if(prior?.status==='COMPLETED'&&prior.response_json)return {replay:jsonSafe(prior.response_json,{ok:true,replayed:true})};
  if(prior?.status==='PENDING')return {error:'같은 요청을 처리 중입니다.',status:409};
  await env.DB.prepare(`INSERT INTO ${RECEIPT_TABLE}(request_id,user_id,run_id,action_type,status,created_at,updated_at) VALUES(?,?,?,?,'PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(request_id) DO UPDATE SET run_id=excluded.run_id,action_type=excluded.action_type,status='PENDING',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE ${RECEIPT_TABLE}.user_id=excluded.user_id`).bind(requestId,userId,runId,action).run();
  return {reserved:true};
}

async function completeReceipt(env,requestId,userId,response){
  const compact={...response,replayed:true};delete compact.battleV2;delete compact.monster;delete compact.objective;
  const statement=()=>env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(JSON.stringify(compact),requestId,userId).run();
  try{await statement()}catch(firstError){
    try{await statement()}catch(error){console.error('[escort] receipt completion failed',{requestId,userId,error:String(error?.message||error),firstError:String(firstError?.message||firstError)})}
  }
}

async function failReceipt(env,requestId,userId,error){
  try{await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(cleanText(error?.message||error,300),requestId,userId).run()}
  catch(receiptError){console.error('[escort] receipt failure mark failed',{requestId,userId,error:String(receiptError?.message||receiptError)})}
}

function requireRequestId(body){const value=cleanText(body?.requestId,120);if(!value){const error=new Error('요청 ID가 필요합니다.');error.status=400;throw error}return value;}
function roleOf(card){const raw=String(card?.power_type||card?.powerType||card?.type||card?.uniqueAbility?.dominantType||'NONE').toUpperCase();return ['ATTACK','DEFENSE','SPEED','HP'].includes(raw)?raw:'NONE';}
function roleCounts(cards){return cards.reduce((out,card)=>{const role=roleOf(card);out[role]=(out[role]||0)+1;return out;},{ATTACK:0,DEFENSE:0,SPEED:0,HP:0,NONE:0});}

function nextCardHp(finalRows,previous,healPercent){
  const next={...previous};
  for(const row of Array.isArray(finalRows)?finalRows:[]){
    const id=String(row.cardId||String(row.id||'').split(':').slice(2).join(':'));
    if(!id)continue;
    const max=Math.max(1,Number(row.maxHp||1)),hp=Math.max(0,Number(row.hp||0));
    next[id]=hp<=0?0:Math.min(100,Math.round((hp/max*100+healPercent)*10)/10);
  }
  return next;
}

function tacticEffect(key){return TACTICS[String(key||'').toUpperCase()]||null;}

export function finalizeEscortObjectiveTimeline(battleV2,{hpBefore=0,maxHp=0,totalDamage=0,recovery=0}={}){
  const timeline=Array.isArray(battleV2?.result?.timeline)?battleV2.result.timeline:[];
  const strikes=timeline.filter(event=>String(event?.type||'').toUpperCase()==='ESCORT_OBJECTIVE_ATTACK');
  const safeBefore=Math.max(0,Math.round(Number(hpBefore)||0)),safeMax=Math.max(1,Math.round(Number(maxHp)||safeBefore||1));
  const budget=Math.min(safeBefore,Math.max(0,Math.round(Number(totalDamage)||0)));
  let remaining=budget,currentHp=safeBefore;
  strikes.forEach((event,index)=>{
    const slotsLeft=strikes.length-index;
    const damage=slotsLeft>0?Math.min(currentHp,Math.ceil(remaining/slotsLeft)):0;
    const before=currentHp,after=Math.max(0,before-damage);
    remaining=Math.max(0,remaining-damage);currentHp=after;
    Object.assign(event,{targetId:'ESCORT_OBJECTIVE',targetSide:'OBJECTIVE',targetName:'장갑 수송차',damage,objectiveHpBefore:before,objectiveHpAfter:after,objectiveMaxHp:safeMax,priority:'ESCORT_VEHICLE'});
  });
  const recovered=Math.min(Math.max(0,safeMax-currentHp),Math.max(0,Math.round(Number(recovery)||0)));
  if(recovered>0){
    const resultIndex=timeline.findIndex(event=>String(event?.type||'').toUpperCase()==='RESULT');
    const recoveryEvent={type:'ESCORT_OBJECTIVE_RECOVERY',targetId:'ESCORT_OBJECTIVE',targetSide:'OBJECTIVE',targetName:'장갑 수송차',amount:recovered,objectiveHpBefore:currentHp,objectiveHpAfter:currentHp+recovered,objectiveMaxHp:safeMax,label:'호송차 긴급 복구'};
    if(resultIndex>=0)timeline.splice(resultIndex,0,recoveryEvent);else timeline.push(recoveryEvent);
    currentHp+=recovered;
  }
  timeline.forEach((event,index)=>{event.seq=index+1});
  battleV2.escortObjective={id:'ESCORT_OBJECTIVE',name:'장갑 수송차',hpBefore:safeBefore,hpAfter:currentHp,maxHp:safeMax,totalDamage:budget,recovery:recovered,strikeCount:strikes.length,targetPriority:'ABSOLUTE',ignoresInitiative:true};
  return battleV2;
}

export async function handleEscortOperation({path,request,env,deps}){
  if(!path.startsWith('escort/')&&!path.startsWith('admin/escort/'))return null;
  const {authenticate,readBody,json,pveDeckSnapshot,battleSettings,cardBattlePower,createPveBattleV2,userEquipmentBonuses,cardUniqueDeckState,magicBattleLoadout,writeAdminLog}=deps;
  await ensure(env);
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  let cfg=await settings(env);

  if(path==='admin/escort/settings'){
    if(!isOwner(user))return json({error:'OWNER 권한이 필요합니다.'},403);
    if(request.method==='GET'){
      const stats=await env.DB.prepare(`SELECT COUNT(*) total_runs,SUM(CASE WHEN status='CLAIMED' THEN 1 ELSE 0 END) claimed_runs,SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed_runs FROM ${RUN_TABLE}`).first();
      return json({settings:visibleSettings(cfg),stats:{totalRuns:Number(stats?.total_runs||0),claimedRuns:Number(stats?.claimed_runs||0),failedRuns:Number(stats?.failed_runs||0)}});
    }
    if(request.method==='POST'||request.method==='PATCH'){
      const body=await readBody(request),next=cleanEscortSettings(body);
      await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(SETTINGS_KEY,JSON.stringify(next)).run();
      if(typeof writeAdminLog==='function')await writeAdminLog(env,user,'ESCORT_SETTINGS_UPDATE','ESCORT',SETTINGS_KEY,cfg,next);
      cfg=next;return json({ok:true,settings:visibleSettings(cfg)});
    }
    return json({error:'지원하지 않는 요청입니다.'},405);
  }

  if(cfg.mode==='OFF')return json({error:'호송작전이 현재 중지되어 있습니다.',code:'ESCORT_OFF'},503);
  if(cfg.mode==='TEST'&&!isOwner(user))return json({error:'호송작전 OWNER 테스트 중입니다.',code:'ESCORT_OWNER_TEST'},403);
  if(path==='escort/status'&&request.method==='GET')return json(await statusPayload(env,user,cfg));

  if(path==='escort/start'&&request.method==='POST'){
    const existing=await currentRun(env,user.id);if(existing)return json(await statusPayload(env,user,cfg));
    const key=weekKey(),weekly=await weeklyState(env,user.id,key);
    if(weekly.startedCount>=cfg.weeklyRunLimit)return json({error:`이번 주 출전 가능 횟수 ${cfg.weeklyRunLimit}회를 모두 사용했습니다.`},409);
    if(weekly.rewardCount>=cfg.weeklyRewardLimit)return json({error:`이번 주 보상 횟수 ${cfg.weeklyRewardLimit}회를 모두 달성했습니다.`},409);
    const deck=await pveDeckSnapshot(env,user.id);if(deck.length!==5)return json({error:'PVE 출전 덱 5장을 먼저 저장하세요.'},400);
    const runId=crypto.randomUUID(),state={phase:'READY',cardHp:Object.fromEntries(deck.map(card=>[String(card.id),100])),pendingTactic:null,choices:[],history:[]};
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ${RUN_TABLE}(run_id,user_id,week_key,status,sector_index,vehicle_hp,vehicle_max_hp,deck_snapshot,state_json) VALUES(?,? ,?,'ACTIVE',0,?,?,?,?)`).bind(runId,user.id,key,cfg.vehicleMaxHp,cfg.vehicleMaxHp,JSON.stringify(deck),JSON.stringify(state)),
      env.DB.prepare(`INSERT INTO ${WEEKLY_TABLE}(user_id,week_key,started_count,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id,week_key) DO UPDATE SET started_count=${WEEKLY_TABLE}.started_count+1,updated_at=CURRENT_TIMESTAMP`).bind(user.id,key)
    ]);
    return json(await statusPayload(env,user,cfg));
  }

  if(path==='escort/fight'&&request.method==='POST'){
    const body=await readBody(request);let requestId='';
    try{
      requestId=requireRequestId(body);const row=await currentRun(env,user.id);if(!row||row.status!=='ACTIVE')throw Object.assign(new Error('진행 중인 호송작전이 없습니다.'),{status:409});
      const run=parseRun(row);if(run.state.phase!=='READY')throw Object.assign(new Error('구간 전투 전에 전술 선택을 완료하세요.'),{status:409});
      const receipt=await reserveReceipt(env,{requestId,userId:user.id,runId:run.run_id,action:'FIGHT'});if(receipt.replay)return json(receipt.replay);if(receipt.error)return json({error:receipt.error},receipt.status);
      const sector=cfg.sectors[clamp(run.sector_index,0,4)],battleCfg=await battleSettings(env),baseDeck=run.deck.map(card=>({...card,id:String(card.id),power:cardBattlePower(card,card.breakthrough_level,battleCfg)}));
      const unique=typeof cardUniqueDeckState==='function'?await cardUniqueDeckState(env,user,baseDeck,'PVE'):null;
      const poweredDeck=unique?.enabled?unique.cards:baseDeck,roles=roleCounts(poweredDeck),pending=tacticEffect(run.state.pendingTactic),cardHp=run.state.cardHp||{};
      const attackRoleBoost=['BLOCKADE','FINAL_BOSS'].includes(sector.key)?roles.ATTACK*.04:0,tacticBoost=pending?.key==='OVERCHARGE'?.12:0;
      const cards=poweredDeck.map(card=>({...card,power:Math.max(1,Math.round(Number(card.power||1)*(1+attackRoleBoost+tacticBoost))),startingHpPercent:clamp(cardHp[String(card.id)]??100,0,100)}));
      const equipment=typeof userEquipmentBonuses==='function'?await userEquipmentBonuses(env,user.id):{pve:0},magic=typeof magicBattleLoadout==='function'?await magicBattleLoadout(env,user,'PVE'):{cards:[]};
      const enemyReduction=(pending?.key==='AIRSTRIKE'?.15:0)+(pending?.key==='JAMMING'?.08:0),enemyPower=Math.max(1000,Math.round(sector.enemyPower*(1-enemyReduction)));
      const monster={id:`ESCORT-${sector.key}`,name:sector.enemyName,image:sector.enemyImage,image_url:sector.enemyImage,battle_power:enemyPower,is_boss:sector.isBoss?1:0,isBoss:sector.isBoss,mode:'ESCORT',contentType:'ESCORT',projectVMonsterArt:{scope:'BATTLE_ENGINE_ONLY',kind:'ESCORT_MONSTER_SD',primaryUrl:sector.enemyImage,pngFallbackUrl:sector.enemyImage,footAnchor:{x:.5,y:.94},objectFit:'contain',objectPosition:'50% 100%',scaleMultiplier:sector.isBoss?1.08:1,approved:true,technicalPass:true}};
      const seed=hashText(`${run.run_id}:${run.sector_index}:${requestId}`),battleV2=createPveBattleV2({cards,magicCards:magic?.cards||[],characterBonus:Number(equipment?.pve||0),monster,seed,singleHealerBonus:battleCfg?.engine?.singleHealerBonus,escortObjective:{id:'ESCORT_OBJECTIVE',name:'장갑 수송차'}});
      battleV2.mode='ESCORT';battleV2.contentType='ESCORT';battleV2.battlefieldMode='ESCORT';
      const won=String(battleV2?.result?.winner||'B').toUpperCase()==='A',baseDamage=Math.round(run.vehicle_max_hp*sector.hazardPercent/100),formationReduction=roles.DEFENSE*.07+(['DEPARTURE','AMBUSH'].includes(sector.key)?roles.SPEED*.05:0),tacticReduction=(pending?.key==='BARRIER'?.45:0)+(pending?.key==='JAMMING'?.15:0),damage=Math.max(0,Math.round(baseDamage*(won ? 0.58 : 1.35)*Math.max(.12,1-formationReduction-tacticReduction)));
      const hpHeal=won?roles.HP*4:0,nextHp=nextCardHp(battleV2?.result?.final?.A,cardHp,hpHeal),living=Object.values(nextHp).filter(value=>Number(value)>0).length;
      const vehicleHpAfterDamage=Math.max(0,Number(run.vehicle_hp)-damage);let vehicleHp=vehicleHpAfterDamage;if(won&&roles.HP)vehicleHp=Math.min(run.vehicle_max_hp,vehicleHp+Math.round(run.vehicle_max_hp*roles.HP*.015));if(won&&sector.key==='REPAIR')vehicleHp=Math.min(run.vehicle_max_hp,vehicleHp+Math.round(run.vehicle_max_hp*.10));
      finalizeEscortObjectiveTimeline(battleV2,{hpBefore:run.vehicle_hp,maxHp:run.vehicle_max_hp,totalDamage:damage,recovery:vehicleHp-vehicleHpAfterDamage});
      const failed=!won||living===0||vehicleHp<=0,finalSector=run.sector_index>=cfg.sectors.length-1;
      const choices=!failed&&!finalSector?tacticChoices(run.run_id,run.sector_index+1,cfg):[],phase=failed?'FAILED':finalSector?'COMPLETE':'TACTIC',status=failed?'FAILED':finalSector?'COMPLETED_PENDING':'ACTIVE';
      const history=[...(Array.isArray(run.state.history)?run.state.history:[]),{sectorIndex:run.sector_index,sectorKey:sector.key,sectorName:sector.name,result:won?'WIN':'LOSE',vehicleDamage:damage,vehicleHp,aliveCards:living,tactic:run.state.pendingTactic||null}].slice(-5);
      const state={...run.state,phase,cardHp:nextHp,pendingTactic:null,choices,history};
      const rewardFactor=.6+.4*(vehicleHp/Math.max(1,run.vehicle_max_hp)),rewardCoin=finalSector&&won?Math.round(cfg.baseCoin*rewardFactor):0,rewardShards=finalSector&&won?Math.round(cfg.baseShards*rewardFactor):0;
      const updated=await env.DB.prepare(`UPDATE ${RUN_TABLE} SET status=?,vehicle_hp=?,state_json=?,reward_coin=?,reward_shards=?,version=version+1,updated_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN ? IN ('FAILED','COMPLETED_PENDING') THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE run_id=? AND user_id=? AND status='ACTIVE' AND version=?`).bind(status,vehicleHp,JSON.stringify(state),rewardCoin,rewardShards,status,run.run_id,user.id,run.version).run();
      if(Number(updated?.meta?.changes||0)!==1)throw Object.assign(new Error('호송 상태가 갱신되었습니다. 현재 작전을 다시 불러오세요.'),{status:409});
      if(finalSector&&won)await env.DB.prepare(`INSERT INTO ${WEEKLY_TABLE}(user_id,week_key,completed_count,best_vehicle_hp_percent,updated_at) VALUES(?,?,1,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,week_key) DO UPDATE SET completed_count=${WEEKLY_TABLE}.completed_count+1,best_vehicle_hp_percent=CASE WHEN ${WEEKLY_TABLE}.best_vehicle_hp_percent>=excluded.best_vehicle_hp_percent THEN ${WEEKLY_TABLE}.best_vehicle_hp_percent ELSE excluded.best_vehicle_hp_percent END,updated_at=CURRENT_TIMESTAMP`).bind(user.id,run.week_key,Math.round(vehicleHp/run.vehicle_max_hp*100)).run();
      const fresh=await env.DB.prepare(`SELECT * FROM ${RUN_TABLE} WHERE run_id=?`).bind(run.run_id).first(),sectorSummary={sectorIndex:run.sector_index,sectorName:sector.name,result:won?'WIN':'LOSE',vehicleDamage:damage,vehicleHp,aliveCards:living,roleBonuses:roles};
      const response={ok:true,run:publicRun(fresh,cfg),sectorSummary,battleV2,monster,objective:{id:'ESCORT_OBJECTIVE',name:'장갑 수송차',image:'/assets/ui/escort/escort-armored-carrier-v1.webp?v=1830',hp:Number(run.vehicle_hp),hpAfter:vehicleHp,maxHp:run.vehicle_max_hp,targetPriority:'ABSOLUTE'}};
      await completeReceipt(env,requestId,user.id,response);return json(response);
    }catch(error){if(requestId)await failReceipt(env,requestId,user.id,error);return json({error:cleanText(error?.message||error,300)},Number(error?.status||500));}
  }

  if(path==='escort/tactic'&&request.method==='POST'){
    const body=await readBody(request);let requestId='';
    try{
      requestId=requireRequestId(body);const row=await currentRun(env,user.id);if(!row||row.status!=='ACTIVE')throw Object.assign(new Error('진행 중인 호송작전이 없습니다.'),{status:409});
      const run=parseRun(row),key=String(body.tactic||'').toUpperCase(),choice=(run.state.choices||[]).find(item=>item.key===key);if(run.state.phase!=='TACTIC'||!choice)throw Object.assign(new Error('제시된 전술 중 하나를 선택하세요.'),{status:400});
      const receipt=await reserveReceipt(env,{requestId,userId:user.id,runId:run.run_id,action:'TACTIC'});if(receipt.replay)return json(receipt.replay);if(receipt.error)return json({error:receipt.error},receipt.status);
      let vehicleHp=Number(run.vehicle_hp);if(key==='REPAIR')vehicleHp=Math.min(run.vehicle_max_hp,vehicleHp+Math.round(run.vehicle_max_hp*cfg.repairPercent/100));
      const state={...run.state,phase:'READY',pendingTactic:key==='REPAIR'?null:key,choices:[]};
      const changed=await env.DB.prepare(`UPDATE ${RUN_TABLE} SET sector_index=sector_index+1,vehicle_hp=?,state_json=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='ACTIVE' AND version=?`).bind(vehicleHp,JSON.stringify(state),run.run_id,user.id,run.version).run();
      if(Number(changed?.meta?.changes||0)!==1)throw Object.assign(new Error('전술 선택이 이미 처리되었습니다.'),{status:409});
      const fresh=await env.DB.prepare(`SELECT * FROM ${RUN_TABLE} WHERE run_id=?`).bind(run.run_id).first(),response={ok:true,run:publicRun(fresh,cfg),selectedTactic:tacticWithSettings(TACTICS[key],cfg)};await completeReceipt(env,requestId,user.id,response);return json(response);
    }catch(error){if(requestId)await failReceipt(env,requestId,user.id,error);return json({error:cleanText(error?.message||error,300)},Number(error?.status||500));}
  }

  if(path==='escort/claim'&&request.method==='POST'){
    const body=await readBody(request);let requestId='';
    try{
      requestId=requireRequestId(body);await env.DB.prepare(`UPDATE ${RUN_TABLE} SET status='COMPLETED_PENDING',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='CLAIMING' AND updated_at<datetime('now','-2 minutes')`).bind(user.id).run();
      const row=await currentRun(env,user.id);if(!row||row.status!=='COMPLETED_PENDING')throw Object.assign(new Error('수령할 호송작전 보상이 없습니다.'),{status:409});
      const receipt=await reserveReceipt(env,{requestId,userId:user.id,runId:row.run_id,action:'CLAIM'});if(receipt.replay)return json(receipt.replay);if(receipt.error)return json({error:receipt.error},receipt.status);
      const weekly=await weeklyState(env,user.id,row.week_key);if(weekly.rewardCount>=cfg.weeklyRewardLimit)throw Object.assign(new Error('이번 주 호송작전 보상 횟수를 모두 사용했습니다.'),{status:409});
      const reserved=await env.DB.prepare(`UPDATE ${RUN_TABLE} SET status='CLAIMING',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='COMPLETED_PENDING'`).bind(row.run_id,user.id).run();if(Number(reserved?.meta?.changes||0)!==1)throw Object.assign(new Error('보상을 다른 요청에서 처리 중입니다.'),{status:409});
      const balance=await env.DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(user.id).first(),coin=Number(row.reward_coin||0),shards=Number(row.reward_shards||0),coinAfter=Number(balance?.coin||0)+coin,shardsAfter=Number(balance?.card_shards||0)+shards,vehiclePercent=Math.round(Number(row.vehicle_hp||0)/Math.max(1,Number(row.vehicle_max_hp||1))*100);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?').bind(coin,shards,user.id),
        env.DB.prepare(`UPDATE ${RUN_TABLE} SET status='CLAIMED',claimed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND user_id=? AND status='CLAIMING'`).bind(row.run_id,user.id),
        env.DB.prepare(`INSERT INTO ${WEEKLY_TABLE}(user_id,week_key,reward_count,best_vehicle_hp_percent,updated_at) VALUES(?,?,1,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,week_key) DO UPDATE SET reward_count=${WEEKLY_TABLE}.reward_count+1,best_vehicle_hp_percent=CASE WHEN ${WEEKLY_TABLE}.best_vehicle_hp_percent>=excluded.best_vehicle_hp_percent THEN ${WEEKLY_TABLE}.best_vehicle_hp_percent ELSE excluded.best_vehicle_hp_percent END,updated_at=CURRENT_TIMESTAMP`).bind(user.id,row.week_key,vehiclePercent),
        env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PVE 호송작전 완료')").bind(user.id,coin,coinAfter),
        env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'PVE 호송작전 완료',NULL)").bind(user.id,shards,shardsAfter)
      ]);
      const response={ok:true,reward:{coin,shards},coinAfter,cardShardsAfter:shardsAfter,runId:row.run_id};await completeReceipt(env,requestId,user.id,response);return json(response);
    }catch(error){if(requestId)await failReceipt(env,requestId,user.id,error);return json({error:cleanText(error?.message||error,300)},Number(error?.status||500));}
  }

  if(path==='escort/abandon'&&request.method==='POST'){
    const changed=await env.DB.prepare(`UPDATE ${RUN_TABLE} SET status='ABANDONED',updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE user_id=? AND status IN ('ACTIVE','COMPLETED_PENDING')`).bind(user.id).run();
    return json({ok:true,abandoned:Number(changed?.meta?.changes||0)>0,...await statusPayload(env,user,cfg)});
  }
  return json({error:'지원하지 않는 호송작전 요청입니다.'},404);
}
