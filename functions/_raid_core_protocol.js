// A new key prevents any stale preview-era ON/reward values from bypassing the
// staged v2021 rollout. The production default is always TEST + reward locked.
const SETTINGS_KEY='raid_core_protocol_settings_v2021';
const FOUNDATION_KEY='raid_core_protocol_foundation_v2021';
const INSTANCE_TABLE='raid_core_instances_v1924';
const PARTICIPANT_TABLE='raid_core_participants_v1924';
const RECEIPT_TABLE='raid_core_receipts_v1924';
const REWARD_RECEIPT_TABLE='raid_core_reward_receipts_v2021';
const OPERATIONS=Object.freeze({
  BREAK:{key:'BREAK',name:'파쇄',label:'BREACH',roles:['ATTACK','SPEED'],description:'공격형·속도형 카드로 붕괴 코어의 외피를 파괴합니다.'},
  BLOCK:{key:'BLOCK',name:'차단',label:'INTERCEPT',roles:['DEFENSE'],description:'방어형 카드로 코어 간 에너지 연결을 차단합니다.'},
  STABILIZE:{key:'STABILIZE',name:'안정화',label:'STABILIZE',roles:['HP'],description:'HP형·회복 카드로 폭주 에너지를 안정화합니다.'}
});
const CORE_BUFFS=Object.freeze({
  BREAK:{id:'GRAVITY_ARMOR',core:'BREAK',name:'초중력 외피',effect:'누적 피해 18% 경감',damageReductionPct:18},
  BLOCK:{id:'COUNTER_CURRENT',core:'BLOCK',name:'역류 전도체',effect:'누적 피해 14% 경감',damageReductionPct:14},
  STABILIZE:{id:'REGEN_LOOP',core:'STABILIZE',name:'자가 복원 루프',effect:'누적 피해 16% 경감',damageReductionPct:16}
});
const DIRECTIONS=['UP','RIGHT','DOWN','LEFT'];
const WEAKNESSES=['ATTACK','DEFENSE','SPEED','HP'];

const integer=(value,fallback=0,min=0,max=2147483647)=>Math.max(min,Math.min(max,Math.floor(Number.isFinite(Number(value))?Number(value):fallback)));
const cleanText=(value,max=200)=>String(value??'').trim().slice(0,max);
const jsonSafe=(value,fallback={})=>{try{return value?JSON.parse(value):fallback}catch{return fallback}};
const isOwner=user=>String(user?.role||'').trim().toUpperCase()==='OWNER';
const cleanStringList=(value,maxItems=80,maxLength=60)=>[...new Set((Array.isArray(value)?value:String(value||'').split(/[\n,]/)).map(item=>cleanText(item,maxLength)).filter(Boolean))].slice(0,maxItems);
const stableHash=value=>Array.from(String(value||'')).reduce((hash,char)=>(Math.imul(hash^char.charCodeAt(0),16777619)>>>0),2166136261);
const normalizeOperation=value=>OPERATIONS[String(value||'').trim().toUpperCase()]?.key||'';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

export function defaultCoreRaidSettings(){
  return {
    mode:'TEST',title:'심연 관측소: 붕괴 코어',subtitle:'ABYSS OBSERVATORY / CORE PROTOCOL',
    description:'속성 약점을 분석하고 세 작전을 분담해 멸절 프로토콜을 차단하십시오.',
    bossName:'오메가 코어 · 아르케온',bossImage:'/assets/responsive/project-v/monsters/hunt-068-omega-09-sd-v1-768.webp',
    windowMinutes:20,dailyEntries:3,maxParticipants:30,bossMaxHp:300000000,damageScale:180,bossCombatPowerPercent:90,
    analysisRequired:200,coreRequired:120,suppressionRequired:300,
    sequenceLength:6,sequenceWindowMs:5500,mashTarget:24,mashWindowMs:5000,
    rewardLocked:true,rewardCoin:0,rewardShards:0,testUsers:[],testUserIds:[]
  };
}

export function cleanCoreRaidSettings(raw={}){
  const base=defaultCoreRaidSettings(),mode=['OFF','TEST','ON'].includes(String(raw.mode||'').toUpperCase())?String(raw.mode).toUpperCase():base.mode;
  return {
    mode,title:cleanText(raw.title||base.title,60),subtitle:cleanText(raw.subtitle||base.subtitle,80),description:cleanText(raw.description||base.description,240),
    bossName:cleanText(raw.bossName||base.bossName,60),bossImage:cleanText(raw.bossImage||base.bossImage,420),
    windowMinutes:integer(raw.windowMinutes,base.windowMinutes,5,120),dailyEntries:integer(raw.dailyEntries,base.dailyEntries,1,20),maxParticipants:integer(raw.maxParticipants,base.maxParticipants,3,100),
    bossMaxHp:integer(raw.bossMaxHp,base.bossMaxHp,1000000,2000000000),damageScale:integer(raw.damageScale,base.damageScale,1,5000),bossCombatPowerPercent:integer(raw.bossCombatPowerPercent,base.bossCombatPowerPercent,20,300),
    analysisRequired:integer(raw.analysisRequired,base.analysisRequired,50,10000),coreRequired:integer(raw.coreRequired,base.coreRequired,50,10000),suppressionRequired:integer(raw.suppressionRequired,base.suppressionRequired,50,10000),
    sequenceLength:integer(raw.sequenceLength,base.sequenceLength,4,12),sequenceWindowMs:integer(raw.sequenceWindowMs,base.sequenceWindowMs,3000,15000),mashTarget:integer(raw.mashTarget,base.mashTarget,10,80),mashWindowMs:integer(raw.mashWindowMs,base.mashWindowMs,3000,15000),
    rewardLocked:raw.rewardLocked!==false,rewardCoin:integer(raw.rewardCoin,base.rewardCoin,0,2000000000),rewardShards:integer(raw.rewardShards,base.rewardShards,0,1000000),
    testUsers:cleanStringList(raw.testUsers),testUserIds:cleanStringList(raw.testUserIds,80,24).map(Number).filter(Number.isInteger).filter(id=>id>0)
  };
}

export function coreRaidFeatureAccess(user,settings={}){
  const cfg=cleanCoreRaidSettings(settings),owner=isOwner(user),nickname=cleanText(user?.nickname,60).toLocaleLowerCase('ko-KR'),userId=Number(user?.id||0);
  const testerByName=cfg.testUsers.some(name=>name.toLocaleLowerCase('ko-KR')===nickname),testerById=cfg.testUserIds.includes(userId),tester=owner||testerByName||testerById;
  const accessible=cfg.mode==='ON'||(cfg.mode==='TEST'&&tester);
  return {visible:cfg.mode!=='OFF'&&accessible,accessible,owner,tester,mode:cfg.mode,rewardLocked:cfg.rewardLocked};
}

function roleOf(card={}){
  const role=String(card.power_type||card.powerType||card.type||card.uniqueAbility?.dominantType||'NONE').trim().toUpperCase();
  return WEAKNESSES.includes(role)?role:'NONE';
}

export function coreRaidRoleCounts(cards=[]){
  return (Array.isArray(cards)?cards:[]).reduce((out,card)=>{const role=roleOf(card);out[role]=(out[role]||0)+1;return out;},{ATTACK:0,DEFENSE:0,SPEED:0,HP:0,NONE:0});
}

function kstEntryDate(now=Date.now()){
  const date=new Date(Number(now)+9*3600000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function cycleIdentity(now,windowMinutes){
  const shifted=Number(now)+9*3600000,date=new Date(shifted),minutes=date.getUTCHours()*60+date.getUTCMinutes(),slot=Math.floor(minutes/windowMinutes),day=kstEntryDate(now);
  return {cycleKey:`${day}-${String(slot).padStart(3,'0')}`,instanceId:`CORE-${day.replaceAll('-','')}-${String(slot).padStart(3,'0')}`,startsAt:new Date(Math.floor(Number(now)/(windowMinutes*60000))*windowMinutes*60000).toISOString(),endsAt:new Date((Math.floor(Number(now)/(windowMinutes*60000))+1)*windowMinutes*60000).toISOString()};
}

export function createCoreRaidChallenge({instanceId='',userId=0,cards=[],settings={}}={}){
  const cfg=cleanCoreRaidSettings(settings),seed=stableHash(`${instanceId}:${userId}:${(Array.isArray(cards)?cards:[]).map(card=>card.id||card.cardId).join(',')}:CORE-QTE-V1`);
  const weaknessCycle=Array.from({length:5},(_,index)=>WEAKNESSES[stableHash(`${seed}:W:${index}`)%WEAKNESSES.length]);
  const sequence=Array.from({length:cfg.sequenceLength},(_,index)=>DIRECTIONS[stableHash(`${seed}:S:${index}`)%DIRECTIONS.length]);
  const mashTarget=cfg.mashTarget+(seed%3)-1;
  return {challengeId:`QTE-${seed.toString(16).padStart(8,'0')}`,seed,weaknessCycle,sequence,sequenceWindowMs:cfg.sequenceWindowMs,mashTarget,mashWindowMs:cfg.mashWindowMs,issuedFor:{instanceId:String(instanceId),userId:Number(userId)}};
}

function normalizeDirection(value){
  const key=String(value||'').trim().toUpperCase();
  return {ARROWUP:'UP',W:'UP',UP:'UP',ARROWRIGHT:'RIGHT',D:'RIGHT',RIGHT:'RIGHT',ARROWDOWN:'DOWN',S:'DOWN',DOWN:'DOWN',ARROWLEFT:'LEFT',A:'LEFT',LEFT:'LEFT'}[key]||'';
}

function normalizeTrace(rows=[],windowMs=10000,max=160){
  let previous=-1;
  return (Array.isArray(rows)?rows:[]).slice(0,max).map((row,index)=>{
    const at=clamp(typeof row==='number'?row:row?.at,0,windowMs+750),key=normalizeDirection(row?.key||row?.direction||'');
    const monotonic=at>=previous;previous=Math.max(previous,at);
    return {at,key,index,monotonic};
  });
}

export function evaluateCoreRaidQte(challenge={},rawResults={}){
  const sequenceWindowMs=integer(challenge.sequenceWindowMs,5500,1000,20000),mashWindowMs=integer(challenge.mashWindowMs,5000,1000,20000),expected=(Array.isArray(challenge.sequence)?challenge.sequence:[]).map(normalizeDirection).filter(Boolean);
  const sequenceTrace=normalizeTrace(rawResults.sequence?.inputs||rawResults.sequence?.trace||[],sequenceWindowMs,64);
  let sequenceIndex=0,mistakes=0,completedAt=null;
  for(const input of sequenceTrace){
    if(!input.monotonic||!input.key){mistakes++;continue}
    if(input.key===expected[sequenceIndex]){sequenceIndex++;if(sequenceIndex>=expected.length){completedAt=input.at;break}}
    else mistakes++;
  }
  const sequenceSuccess=expected.length>0&&sequenceIndex===expected.length&&Number(completedAt)<=sequenceWindowMs;
  const sequencePerfect=sequenceSuccess&&mistakes===0&&Number(completedAt)<=sequenceWindowMs*.72;

  const mashTrace=normalizeTrace(rawResults.mash?.presses||rawResults.mash?.trace||[],mashWindowMs,180).filter(row=>row.monotonic&&row.at<=mashWindowMs),mashTarget=integer(challenge.mashTarget,24,1,100);
  let validPresses=0,lastAt=-1000,mashCompletedAt=null;
  for(const press of mashTrace){if(press.at-lastAt>=28){validPresses++;lastAt=press.at;if(validPresses===mashTarget)mashCompletedAt=press.at}}
  const mashSuccess=validPresses>=mashTarget,mashPerfect=mashSuccess&&Number(mashCompletedAt)<=mashWindowMs*.72;
  return {
    sequence:{success:sequenceSuccess,perfect:sequencePerfect,progress:sequenceIndex,total:expected.length,mistakes,completedAt:completedAt===null?null:Math.round(completedAt)},
    mash:{success:mashSuccess,perfect:mashPerfect,count:validPresses,target:mashTarget},
    allSuccess:sequenceSuccess&&mashSuccess,perfectCount:Number(sequencePerfect)+Number(mashPerfect),suppressionScore:(sequenceSuccess?50:0)+(mashSuccess?50:0)+(sequencePerfect?10:0)+(mashPerfect?10:0)
  };
}

function operationScore(operation,roles){
  if(operation==='BREAK')return Math.min(100,roles.ATTACK*22+roles.SPEED*18+(roles.DEFENSE+roles.HP+roles.NONE)*4);
  if(operation==='BLOCK')return Math.min(100,roles.DEFENSE*30+roles.HP*10+(roles.ATTACK+roles.SPEED+roles.NONE)*4);
  if(operation==='STABILIZE')return Math.min(100,roles.HP*30+roles.DEFENSE*10+(roles.ATTACK+roles.SPEED+roles.NONE)*4);
  return 0;
}

export function coreRaidContribution({cards=[],totalPower=0,operation='',challenge={},qte={},settings={}}={}){
  const cfg=cleanCoreRaidSettings(settings),roles=coreRaidRoleCounts(cards),cycle=Array.isArray(challenge.weaknessCycle)?challenge.weaknessCycle:[],cardRows=Array.isArray(cards)?cards:[];
  const analysisScore=cardRows.slice(0,5).reduce((score,card,index)=>score+(roleOf(card)===cycle[index]?20:6),0);
  const op=normalizeOperation(operation),coreScore=operationScore(op,roles),mechanicScore=analysisScore+coreScore+Number(qte.suppressionScore||0),qteFactor=qte.allSuccess?1.18:.82,analysisFactor=.8+analysisScore/500;
  const totalDamage=Math.max(1,Math.min(2000000000,Math.round(Number(totalPower||0)*cfg.damageScale*qteFactor*analysisFactor)));
  return {operation:op,roles,analysisScore,coreScore,suppressionScore:Number(qte.suppressionScore||0),mechanicScore,totalDamage};
}

export function resolveCoreRaidAggregate(rows=[],settings={}){
  const cfg=cleanCoreRaidSettings(settings),resolved=(Array.isArray(rows)?rows:[]).filter(row=>String(row.status||'').toUpperCase()==='RESOLVED');
  const sum=key=>resolved.reduce((total,row)=>total+Math.max(0,Number(row[key]||0)),0),analysisScore=sum('analysis_score'),suppressionScore=sum('suppression_score'),rawDamage=sum('total_damage');
  const coreScores={BREAK:resolved.filter(row=>String(row.operation)==='BREAK').reduce((n,row)=>n+Number(row.core_score||0),0),BLOCK:resolved.filter(row=>String(row.operation)==='BLOCK').reduce((n,row)=>n+Number(row.core_score||0),0),STABILIZE:resolved.filter(row=>String(row.operation)==='STABILIZE').reduce((n,row)=>n+Number(row.core_score||0),0)};
  const analysisReady=analysisScore>=cfg.analysisRequired,coresReady=Object.values(coreScores).every(score=>score>=cfg.coreRequired),suppressionReady=suppressionScore>=cfg.suppressionRequired;
  const bossBuffs=analysisReady?Object.keys(CORE_BUFFS).filter(core=>coreScores[core]<cfg.coreRequired).map(core=>({...CORE_BUFFS[core]})):[],bossDamageReductionPct=Math.min(60,bossBuffs.reduce((sum,buff)=>sum+Number(buff.damageReductionPct||0),0)),effectiveDamage=Math.round(rawDamage*(1-bossDamageReductionPct/100));
  const damageGate=!analysisReady ? 0.30 : !coresReady ? 0.70 : !suppressionReady ? 0.95 : 1,
        bossHp=Math.max(0,Math.ceil(cfg.bossMaxHp-Math.min(effectiveDamage,cfg.bossMaxHp*damageGate))),
        phase=!analysisReady?1:!coresReady?2:3,
        cleared=analysisReady&&coresReady&&suppressionReady&&bossHp<=0;
  return {phase,phaseLabel:phase===1?'코어 탐색':phase===2?'삼중 코어 분리':'멸절 프로토콜',analysisScore,analysisRequired:cfg.analysisRequired,coreScores,coreRequired:cfg.coreRequired,suppressionScore,suppressionRequired:cfg.suppressionRequired,totalDamage:rawDamage,effectiveDamage,bossBuffs,bossDamageReductionPct,bossHp,bossMaxHp:cfg.bossMaxHp,analysisReady,coresReady,suppressionReady,cleared,resolvedCount:resolved.length};
}

function normalizeBattleCard(card,index){
  const id=String(card?.id||card?.cardId||`CORE-CARD-${index+1}`);
  const battleSprite=String(card?.battleSprite||card?.battle_sprite||'');
  // LIVE V3 owns presentation: the roster keeps the card source art while the
  // Pixi character resolver consumes battleSprite independently.
  const image=String(card?.sourceArt||card?.source_art||card?.originalCardArt||card?.image||card?.image_url||'');
  return {...card,id,cardId:id,name:card?.name||card?.title||`CARD ${index+1}`,title:card?.title||card?.name||`CARD ${index+1}`,image,image_url:image,...(battleSprite?{battleSprite,battle_sprite:battleSprite}:{}),grade:String(card?.grade||card?.rarity||'SSR').toUpperCase(),powerType:roleOf(card),power_type:roleOf(card),hp:100,maxHp:100};
}

function participantDeckSnapshot(participant={}){
  const parsed=jsonSafe(participant.deck_snapshot,Array.isArray(participant.cards)?participant.cards:[]),snapshot=Array.isArray(parsed)?{cards:parsed}:parsed&&typeof parsed==='object'?parsed:{};
  return {...snapshot,cards:(Array.isArray(snapshot.cards)?snapshot.cards:[]).slice(0,5).map(normalizeBattleCard)};
}

function coreBossEngineMonster(cfg,totalPower){
  return {id:'CORE_ARCHEON',name:cfg.bossName,image:cfg.bossImage,image_url:cfg.bossImage,is_boss:1,battle_power:Math.max(1000,Math.round(Number(totalPower||1)*cfg.bossCombatPowerPercent/100)),pve_hp_percent:170,pve_attack_percent:92,pve_defense_percent:108,pve_speed_percent:95,pve_shield_percent:12,pve_attack_count:1,pve_forced_action_every:8};
}

function mechanicTimeline({engineTimeline=[],cards=[],challenge={},operation='',bossBuffs=[],bossId=''}){
  const combat=(Array.isArray(engineTimeline)?engineTimeline:[]).filter(event=>String(event?.type||'').toUpperCase()!=='RESULT'),first=Math.ceil(combat.length*.34),second=Math.ceil(combat.length*.68),weaknessEvents=cards.map((card,index)=>{const weakness=challenge.weaknessCycle?.[index]||WEAKNESSES[index%4],match=roleOf(card)===weakness;return {type:'RAID_WEAKNESS_REVEAL',weakness,matched:match,actorId:card.id||card.cardId,label:`약점 ${weakness} · ${match?'분석 성공':'부분 분석'}`}});
  const timeline=[
    {type:'RAID_PHASE_CHANGE',phase:1,label:'1페이즈 · 코어 탐색'},...weaknessEvents,...combat.slice(0,first),
    {type:'RAID_PHASE_CHANGE',phase:2,label:'2페이즈 · 삼중 코어 분리'},
    {type:'RAID_OPERATION_REVEAL',operation,label:`${OPERATIONS[operation]?.name||'미지정'} 작전 전개`},
    ...bossBuffs.map(buff=>({type:'RAID_BOSS_BUFF',buffId:buff.id,core:buff.core,label:`${buff.name} 활성`,effect:buff.effect,damageReductionPct:buff.damageReductionPct})),
    ...combat.slice(first,second),{type:'RAID_CORE_BREAK',operation,label:`${OPERATIONS[operation]?.name||'코어'} 신호 전송`},
    {type:'RAID_PHASE_CHANGE',phase:3,label:'3페이즈 · 멸절 프로토콜'},...combat.slice(second),
    {type:'RAID_QTE_SEQUENCE',qteId:'SEQUENCE',title:'코어 좌표 추적',sequence:challenge.sequence,windowMs:challenge.sequenceWindowMs,label:'화면을 지정 방향으로 밀거나 방향키를 순서대로 입력하십시오.'},
    {type:'RAID_QTE_MASH',qteId:'MASH',title:'구속 파쇄',target:challenge.mashTarget,windowMs:challenge.mashWindowMs,label:'연타하여 즉사 구속을 파괴하십시오.'},
    {type:'RAID_STAGGER',qteCondition:'ALL_SUCCESS',label:'멸절 프로토콜 차단 · 코어 그로기'},
    {type:'BOSS_ULTIMATE',qteCondition:'ANY_FAILURE',actorId:bossId,label:'멸절 프로토콜',hits:cards.map(card=>({targetId:card.id||card.cardId,damage:99999999,targetHpAfter:0,critical:true}))},
    {type:'RESULT',qteCondition:'ALL_SUCCESS',winner:'A',reason:'CORE_PROTOCOL_SUCCESS',label:'개인 기믹 수행 성공'},
    {type:'RESULT',qteCondition:'ANY_FAILURE',winner:'B',reason:'CORE_PROTOCOL_FAILURE',label:'개인 기믹 수행 실패'}
  ];
  timeline.forEach((event,index)=>event.seq=index+1);
  return timeline;
}

export function buildCoreRaidBattlePayload({participant={},settings={},aggregate={},createBattle=null,accountNickname=''}={}){
  const cfg=cleanCoreRaidSettings(settings),snapshot=participantDeckSnapshot(participant),cards=snapshot.cards,challenge=jsonSafe(participant.challenge_json,participant.challenge||{}),operation=normalizeOperation(participant.operation);
  const bossBuffs=(Array.isArray(aggregate?.bossBuffs)?aggregate.bossBuffs:[]).map(buff=>({id:cleanText(buff.id,40),core:normalizeOperation(buff.core),name:cleanText(buff.name,60),effect:cleanText(buff.effect,100),damageReductionPct:integer(buff.damageReductionPct,0,0,60)})).filter(buff=>buff.id&&buff.core);
  const equipment=snapshot.characterBonus&&typeof snapshot.characterBonus==='object'?snapshot.characterBonus:{},battleSuitPve=Math.max(0,Number(equipment.battleSuitPve||0)),battleSuit=battleSuitPve>0&&equipment.equippedBattleSuit?{...equipment.equippedBattleSuit,pvePower:battleSuitPve,weapon:equipment.equippedWeapon||null,accountNickname:cleanText(accountNickname,60)}:null,monster=coreBossEngineMonster(cfg,participant.total_power),engine=typeof createBattle==='function'?createBattle({cards,characterBonus:Math.max(0,Number(equipment.pve||0)-battleSuitPve),battleSuit,monster,seed:stableHash(`${participant.instance_id}:${participant.user_id}:CORE-BATTLE-V2021`)}):null;
  const engineBoss=engine?.teams?.B?.cards?.[0]||{id:'B:0:MONSTER:CORE_ARCHEON',cardId:'MONSTER:CORE_ARCHEON',name:cfg.bossName,title:cfg.bossName,image:cfg.bossImage,image_url:cfg.bossImage,grade:'BOSS',isBoss:true,hp:100,maxHp:100};
  const boss={...engineBoss,monsterId:'CORE-ARCHEON',name:cfg.bossName,title:cfg.bossName,image:cfg.bossImage,image_url:cfg.bossImage,grade:'BOSS',isBoss:true,mode:'RAID',contentType:'CORE_PROTOCOL',projectVMonsterArt:{scope:'BATTLE_ENGINE_ONLY',kind:'CORE_PROTOCOL_BOSS_SD',primaryUrl:cfg.bossImage,pngFallbackUrl:cfg.bossImage,footAnchor:{x:.5,y:.94},objectFit:'contain',objectPosition:'50% 100%',scaleMultiplier:1.15,approved:true,technicalPass:true}};
  const battleV2=engine?{...engine,teams:{...engine.teams,B:{...engine.teams?.B,cards:[boss]}},result:{...engine.result,winner:'PENDING',reason:'CORE_PROTOCOL_PENDING',timeline:mechanicTimeline({engineTimeline:engine.result?.timeline,cards:engine.teams?.A?.cards||cards,challenge,operation,bossBuffs,bossId:boss.id})}}:{teams:{A:{cards},B:{cards:[boss]}},result:{winner:'PENDING',reason:'CORE_PROTOCOL_PENDING',timeline:mechanicTimeline({cards,challenge,operation,bossBuffs,bossId:boss.id})}};
  return {ok:true,mode:'RAID',battlefieldMode:'RAID',contentType:'CORE_PROTOCOL',presentation:{owner:'PROJECT_V_V3_LIVE',characterRenderer:'PROJECT_V_PIXI_V3',rosterRenderer:'LIVE_V3_ROSTER',cardFrameRenderer:'LIVE_CARD_FRAME',preserveCardSourceArt:true},monster:boss,cards,playerPower:Number(snapshot.power||participant.total_power||0),cardPower:Number(snapshot.cardPower||0),characterBonus:equipment,equippedBattleSuit:equipment.equippedBattleSuit||null,equippedWeapon:equipment.equippedWeapon||null,coreRaid:{operation,challengeId:challenge.challengeId,bossBuffs},battleV2};
}

function schemaStatements(env){
  const postgres=env.DB?.dialect==='postgres',userType=postgres?'BIGINT':'INTEGER',nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')":'CURRENT_TIMESTAMP';
  return [
    `CREATE TABLE IF NOT EXISTS ${INSTANCE_TABLE}(instance_id TEXT PRIMARY KEY,cycle_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'BATTLE',boss_hp BIGINT NOT NULL,boss_max_hp BIGINT NOT NULL,phase INTEGER NOT NULL DEFAULT 1,analysis_score INTEGER NOT NULL DEFAULT 0,break_score INTEGER NOT NULL DEFAULT 0,block_score INTEGER NOT NULL DEFAULT 0,stabilize_score INTEGER NOT NULL DEFAULT 0,suppression_score INTEGER NOT NULL DEFAULT 0,participant_count INTEGER NOT NULL DEFAULT 0,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,cleared_at TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE INDEX IF NOT EXISTS idx_raid_core_instances_live_v1924 ON ${INSTANCE_TABLE}(status,ends_at,instance_id)`,
    `CREATE TABLE IF NOT EXISTS ${PARTICIPANT_TABLE}(instance_id TEXT NOT NULL,user_id ${userType} NOT NULL,entry_date TEXT NOT NULL,operation TEXT NOT NULL,deck_snapshot TEXT NOT NULL,role_counts_json TEXT NOT NULL,challenge_json TEXT NOT NULL,total_power BIGINT NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'JOINED',analysis_score INTEGER NOT NULL DEFAULT 0,core_score INTEGER NOT NULL DEFAULT 0,suppression_score INTEGER NOT NULL DEFAULT 0,mechanic_score INTEGER NOT NULL DEFAULT 0,total_damage BIGINT NOT NULL DEFAULT 0,qte_result_json TEXT NOT NULL DEFAULT '{}',joined_at TEXT NOT NULL DEFAULT ${nowDefault},resolved_at TEXT,updated_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(instance_id,user_id))`,
    `CREATE INDEX IF NOT EXISTS idx_raid_core_participant_rank_v1924 ON ${PARTICIPANT_TABLE}(instance_id,status,mechanic_score DESC,total_damage DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_raid_core_participant_daily_v1924 ON ${PARTICIPANT_TABLE}(user_id,entry_date)`,
    `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE}(request_id TEXT PRIMARY KEY,instance_id TEXT NOT NULL,user_id ${userType} NOT NULL,action_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE TABLE IF NOT EXISTS ${REWARD_RECEIPT_TABLE}(instance_id TEXT NOT NULL,user_id ${userType} NOT NULL,request_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'PENDING',reward_coin BIGINT NOT NULL DEFAULT 0,reward_shards BIGINT NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(instance_id,user_id))`,
    `CREATE INDEX IF NOT EXISTS idx_raid_core_reward_request_v2021 ON ${REWARD_RECEIPT_TABLE}(request_id,status)`
  ];
}

async function ensure(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FOUNDATION_KEY).first();if(marker?.value==='1')return true;
  const statements=schemaStatements(env);if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function')await env.DB.execSchema(statements);else await env.DB.batch(statements.map(sql=>env.DB.prepare(sql)));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(SETTINGS_KEY,JSON.stringify(defaultCoreRaidSettings())),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(FOUNDATION_KEY,'1')
  ]);
  return true;
}

async function readSettings(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first();return cleanCoreRaidSettings(jsonSafe(row?.value,{}));}
async function participantRows(env,instanceId){return (await env.DB.prepare(`SELECT * FROM ${PARTICIPANT_TABLE} WHERE instance_id=?`).bind(instanceId).all()).results||[];}
function publicSettings(cfg){const {testUsers:_,testUserIds:__,...value}=cleanCoreRaidSettings(cfg);return value;}

async function refreshInstance(env,row,cfg){
  if(!row)return null;const participants=await participantRows(env,row.instance_id),computed=resolveCoreRaidAggregate(participants,cfg),priorHp=Math.max(0,Number(row.boss_hp??computed.bossMaxHp)),bossHp=Math.min(priorHp,computed.bossHp),aggregate={...computed,bossHp,cleared:computed.analysisReady&&computed.coresReady&&computed.suppressionReady&&bossHp<=0},expired=Date.parse(row.ends_at||0)<=Date.now(),priorStatus=String(row.status||'').toUpperCase(),status=priorStatus==='CLEAR'?'CLEAR':priorStatus==='FAILED'?'FAILED':aggregate.cleared?'CLEAR':expired?'FAILED':'BATTLE';
  await env.DB.prepare(`UPDATE ${INSTANCE_TABLE} SET status=?,boss_hp=?,boss_max_hp=?,phase=?,analysis_score=?,break_score=?,block_score=?,stabilize_score=?,suppression_score=?,participant_count=?,cleared_at=CASE WHEN ?='CLEAR' THEN COALESCE(cleared_at,CURRENT_TIMESTAMP) ELSE cleared_at END,updated_at=CURRENT_TIMESTAMP WHERE instance_id=?`).bind(status,aggregate.bossHp,aggregate.bossMaxHp,aggregate.phase,aggregate.analysisScore,aggregate.coreScores.BREAK,aggregate.coreScores.BLOCK,aggregate.coreScores.STABILIZE,aggregate.suppressionScore,participants.length,status,row.instance_id).run();
  return {...row,status,boss_hp:aggregate.bossHp,boss_max_hp:aggregate.bossMaxHp,phase:aggregate.phase,participant_count:participants.length,aggregate};
}

async function visibleInstance(env,userId,cfg,requestedId=''){
  let row=requestedId?await env.DB.prepare(`SELECT * FROM ${INSTANCE_TABLE} WHERE instance_id=?`).bind(requestedId).first():await env.DB.prepare(`SELECT * FROM ${INSTANCE_TABLE} WHERE status='BATTLE' ORDER BY created_at DESC LIMIT 1`).first();
  if(row){row=await refreshInstance(env,row,cfg);if(row.status==='BATTLE'||requestedId)return row;}
  const mine=await env.DB.prepare(`SELECT i.* FROM ${INSTANCE_TABLE} i JOIN ${PARTICIPANT_TABLE} p ON p.instance_id=i.instance_id WHERE p.user_id=? ORDER BY i.created_at DESC LIMIT 1`).bind(userId).first();return mine?refreshInstance(env,mine,cfg):null;
}

function publicParticipant(row,userId){
  if(!row)return null;return {userId:Number(row.user_id),nickname:row.nickname||'',operation:String(row.operation),status:String(row.status),rewardStatus:String(row.reward_status||''),totalPower:Number(row.total_power||0),analysisScore:Number(row.analysis_score||0),coreScore:Number(row.core_score||0),suppressionScore:Number(row.suppression_score||0),mechanicScore:Number(row.mechanic_score||0),totalDamage:Number(row.total_damage||0),isMe:Number(row.user_id)===Number(userId),qte:jsonSafe(row.qte_result_json,{})};
}

async function statusPayload(env,user,cfg,requestedId=''){
  const instance=await visibleInstance(env,user.id,cfg,requestedId),entryDate=kstEntryDate(),entryRow=await env.DB.prepare(`SELECT COUNT(*) count FROM ${PARTICIPANT_TABLE} WHERE user_id=? AND entry_date=?`).bind(user.id,entryDate).first();
  if(!instance)return {ok:true,settings:publicSettings(cfg),feature:coreRaidFeatureAccess(user,cfg),current:null,me:null,participants:[],entry:{date:entryDate,used:Number(entryRow?.count||0),limit:cfg.dailyEntries,remaining:Math.max(0,cfg.dailyEntries-Number(entryRow?.count||0))},operations:Object.values(OPERATIONS),serverNow:new Date().toISOString()};
  const rows=(await env.DB.prepare(`SELECT p.*,u.nickname,COALESCE(r.status,'') AS reward_status FROM ${PARTICIPANT_TABLE} p JOIN users u ON u.id=p.user_id LEFT JOIN ${REWARD_RECEIPT_TABLE} r ON r.instance_id=p.instance_id AND r.user_id=p.user_id WHERE p.instance_id=? ORDER BY p.mechanic_score DESC,p.total_damage DESC,p.joined_at ASC`).bind(instance.instance_id).all()).results||[],meRow=rows.find(row=>Number(row.user_id)===Number(user.id));
  return {ok:true,settings:publicSettings(cfg),feature:coreRaidFeatureAccess(user,cfg),current:{id:instance.instance_id,status:instance.status,startsAt:instance.starts_at,endsAt:instance.ends_at,bossName:cfg.bossName,bossImage:cfg.bossImage,bossHp:Number(instance.aggregate.bossHp),bossMaxHp:Number(instance.aggregate.bossMaxHp),participantCount:rows.length,rewardLocked:cfg.rewardLocked,reward:{coin:cfg.rewardCoin,shards:cfg.rewardShards},...instance.aggregate},me:publicParticipant(meRow,user.id),participants:rows.slice(0,30).map(row=>publicParticipant(row,user.id)),entry:{date:entryDate,used:Number(entryRow?.count||0),limit:cfg.dailyEntries,remaining:Math.max(0,cfg.dailyEntries-Number(entryRow?.count||0))},operations:Object.values(OPERATIONS),serverNow:new Date().toISOString()};
}

async function activeCycleInstance(env,cfg){
  const cycle=cycleIdentity(Date.now(),cfg.windowMinutes);
  await env.DB.prepare(`INSERT INTO ${INSTANCE_TABLE}(instance_id,cycle_key,status,boss_hp,boss_max_hp,starts_at,ends_at) VALUES(?,?,'BATTLE',?,?,?,?) ON CONFLICT(cycle_key) DO NOTHING`).bind(cycle.instanceId,cycle.cycleKey,cfg.bossMaxHp,cfg.bossMaxHp,cycle.startsAt,cycle.endsAt).run();
  return env.DB.prepare(`SELECT * FROM ${INSTANCE_TABLE} WHERE cycle_key=?`).bind(cycle.cycleKey).first();
}

async function reserveReceipt(env,{requestId,instanceId,userId,action}){
  const prior=await env.DB.prepare(`SELECT * FROM ${RECEIPT_TABLE} WHERE request_id=?`).bind(requestId).first();
  if(prior&&Number(prior.user_id)!==Number(userId))return {error:'이미 사용된 요청 ID입니다.',status:409};
  if(prior?.status==='COMPLETED'&&prior.response_json)return {replay:jsonSafe(prior.response_json,{ok:true,replayed:true})};
  if(prior?.status==='PENDING')return {error:'같은 기믹 결과를 처리 중입니다.',status:409};
  await env.DB.prepare(`INSERT INTO ${RECEIPT_TABLE}(request_id,instance_id,user_id,action_type,status,created_at,updated_at) VALUES(?,?,?,?,'PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(request_id) DO UPDATE SET instance_id=excluded.instance_id,action_type=excluded.action_type,status='PENDING',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE ${RECEIPT_TABLE}.user_id=excluded.user_id`).bind(requestId,instanceId,userId,action).run();return {reserved:true};
}
async function completeReceipt(env,requestId,userId,response){await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(JSON.stringify({...response,replayed:true,battleV2:undefined}),requestId,userId).run();}
async function failReceipt(env,requestId,userId,error){try{await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?`).bind(cleanText(error?.message||error,300),requestId,userId).run()}catch(_){}}

async function claimCoreReward(env,user,cfg,body={},profile=null){
  if(cfg.rewardLocked)return {error:'붕괴 코어 보상은 테스트 기간 동안 잠겨 있습니다.',code:'CORE_RAID_REWARD_LOCKED',status:423};
  const instanceId=cleanText(body.instanceId,80),requestId=cleanText(body.requestId,120);if(!instanceId||!requestId)return {error:'작전 ID와 요청 ID가 필요합니다.',status:400};
  const [participant,instance,collision,existing]=await Promise.all([
    env.DB.prepare(`SELECT status FROM ${PARTICIPANT_TABLE} WHERE instance_id=? AND user_id=?`).bind(instanceId,user.id).first(),
    env.DB.prepare(`SELECT status FROM ${INSTANCE_TABLE} WHERE instance_id=?`).bind(instanceId).first(),
    env.DB.prepare(`SELECT user_id FROM ${REWARD_RECEIPT_TABLE} WHERE request_id=?`).bind(requestId).first(),
    env.DB.prepare(`SELECT * FROM ${REWARD_RECEIPT_TABLE} WHERE instance_id=? AND user_id=?`).bind(instanceId,user.id).first()
  ]);
  if(String(participant?.status||'')!=='RESOLVED'||String(instance?.status||'')!=='CLEAR')return {error:'제압 완료 후 보상을 수령할 수 있습니다.',status:409};
  if(collision&&Number(collision.user_id)!==Number(user.id))return {error:'이미 사용된 요청 ID입니다.',status:409};
  if(existing?.status==='COMPLETED'&&existing.response_json)return {response:jsonSafe(existing.response_json,{ok:true,replayed:true})};
  if(existing?.status==='PENDING'){
    const age=Math.max(0,Date.now()-Date.parse(existing.updated_at||existing.created_at||0));
    if(age<15000)return {error:'붕괴 코어 보상을 정산 중입니다.',code:'CORE_RAID_REWARD_PENDING',retryAfterMs:Math.max(1500,15000-age),status:409};
    await env.DB.prepare(`UPDATE ${REWARD_RECEIPT_TABLE} SET status='RETRYABLE',error_message='STALE_PENDING_RECOVERED',updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status='PENDING'`).bind(instanceId,user.id).run();
  }
  const rewardCoin=cfg.rewardCoin,rewardShards=cfg.rewardShards,response={ok:true,instanceId,rewardClaimed:true,reward:{coin:rewardCoin,shards:rewardShards},replayed:false};
  const reserved=existing
    ?await env.DB.prepare(`UPDATE ${REWARD_RECEIPT_TABLE} SET request_id=?,status='PENDING',reward_coin=?,reward_shards=?,response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status IN ('FAILED','RETRYABLE')`).bind(requestId,rewardCoin,rewardShards,instanceId,user.id).run()
    :await env.DB.prepare(`INSERT INTO ${REWARD_RECEIPT_TABLE}(instance_id,user_id,request_id,status,reward_coin,reward_shards) VALUES(?,?,?,'PENDING',?,?) ON CONFLICT(instance_id,user_id) DO NOTHING`).bind(instanceId,user.id,requestId,rewardCoin,rewardShards).run();
  if(Number(reserved?.meta?.changes||0)!==1)return {error:'붕괴 코어 보상을 정산 중입니다.',code:'CORE_RAID_REWARD_PENDING',retryAfterMs:2000,status:409};
  const guard=`EXISTS(SELECT 1 FROM ${REWARD_RECEIPT_TABLE} WHERE instance_id=? AND user_id=? AND request_id=? AND status='PENDING')`,guardBind=[instanceId,user.id,requestId],statements=[
    env.DB.prepare(`UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=? AND ${guard}`).bind(rewardCoin,rewardShards,user.id,...guardBind)
  ];
  if(rewardCoin>0)statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'CORE_PROTOCOL_RAID_REWARD' FROM users WHERE id=? AND ${guard}`).bind(rewardCoin,user.id,...guardBind));
  if(rewardShards>0)statements.push(env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT id,?,card_shards,'CORE_PROTOCOL_RAID_REWARD' FROM users WHERE id=? AND ${guard}`).bind(rewardShards,user.id,...guardBind));
  statements.push(env.DB.prepare(`UPDATE ${REWARD_RECEIPT_TABLE} SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND request_id=? AND status='PENDING'`).bind(JSON.stringify(response),...guardBind));
  await env.DB.batch(statements);
  if(typeof profile==='function'){
    const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();response.user=updated?await profile(env,updated):null;
    await env.DB.prepare(`UPDATE ${REWARD_RECEIPT_TABLE} SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status='COMPLETED'`).bind(JSON.stringify(response),instanceId,user.id).run();
  }
  return {response};
}

export async function handleRaidCoreProtocol({path,request,env,deps}){
  if(!path.startsWith('raid/core/')&&!path.startsWith('admin/raid/core/'))return null;
  const {authenticate,readBody,json,raidDeckPower,createPveBattleV2,profile,writeAdminLog}=deps;await ensure(env);const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);let cfg=await readSettings(env);
  if(path==='admin/raid/core/settings'){
    if(!isOwner(user))return json({error:'OWNER 권한이 필요합니다.'},403);
    if(request.method==='GET')return json({settings:cfg});
    if(request.method==='PATCH'||request.method==='POST'){const before=cfg,body=await readBody(request);cfg=cleanCoreRaidSettings(body);await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(SETTINGS_KEY,JSON.stringify(cfg)).run();if(typeof writeAdminLog==='function')await writeAdminLog(env,user,'CORE_RAID_SETTINGS_UPDATE','RAID',SETTINGS_KEY,before,cfg);return json({ok:true,settings:cfg});}
    return json({error:'지원하지 않는 요청입니다.'},405);
  }
  const feature=coreRaidFeatureAccess(user,cfg);
  if(path==='raid/core/feature'&&request.method==='GET')return json({ok:true,...feature,title:cfg.title,subtitle:cfg.subtitle});
  if(cfg.mode==='OFF')return json({error:'붕괴 코어 레이드가 현재 중지되어 있습니다.',code:'CORE_RAID_OFF'},503);
  if(!feature.accessible)return json({error:'붕괴 코어 레이드는 지정된 테스트 계정만 이용할 수 있습니다.',code:'CORE_RAID_TEST_ACCESS'},403);
  const url=new URL(request.url),requestedId=cleanText(url.searchParams.get('instanceId')||'',80);
  if(path==='raid/core/status'&&request.method==='GET')return json(await statusPayload(env,user,cfg,requestedId));
  if(path==='raid/core/join'&&request.method==='POST'){
    const body=await readBody(request),operation=normalizeOperation(body.operation);if(!operation)return json({error:'파쇄·차단·안정화 중 하나의 작전을 선택하세요.'},400);
    const entryDate=kstEntryDate(),daily=await env.DB.prepare(`SELECT COUNT(*) count FROM ${PARTICIPANT_TABLE} WHERE user_id=? AND entry_date=?`).bind(user.id,entryDate).first();if(Number(daily?.count||0)>=cfg.dailyEntries)return json({error:`오늘 붕괴 코어 출전 ${cfg.dailyEntries}회를 모두 사용했습니다.`},409);
    const instance=await activeCycleInstance(env,cfg),already=await env.DB.prepare(`SELECT * FROM ${PARTICIPANT_TABLE} WHERE instance_id=? AND user_id=?`).bind(instance.instance_id,user.id).first();if(already)return json(await statusPayload(env,user,cfg,instance.instance_id));
    const count=await env.DB.prepare(`SELECT COUNT(*) count FROM ${PARTICIPANT_TABLE} WHERE instance_id=?`).bind(instance.instance_id).first();if(Number(count?.count||0)>=cfg.maxParticipants)return json({error:'현재 붕괴 코어 작전의 최대 참가 인원이 가득 찼습니다.'},409);
    let deckInfo;try{deckInfo=await raidDeckPower(env,user.id,body.cardIds,'RAID')}catch(error){return json({error:error.message},Number(error.status||400))}const deck=deckInfo.cards;if(deck.length!==5)return json({error:'PVE 출전 덱 5장을 먼저 저장하세요.'},400);const totalPower=Math.max(1,Math.round(deckInfo.power)),challenge=createCoreRaidChallenge({instanceId:instance.instance_id,userId:user.id,cards:deck,settings:cfg}),roles=coreRaidRoleCounts(deck),snapshot={ids:deckInfo.ids,power:totalPower,basePower:deckInfo.basePower,cardPower:deckInfo.cardPower,characterBonus:deckInfo.characterBonus,synergy:deckInfo.synergy,cards:deck};
    await env.DB.batch([env.DB.prepare(`INSERT INTO ${PARTICIPANT_TABLE}(instance_id,user_id,entry_date,operation,deck_snapshot,role_counts_json,challenge_json,total_power,status) VALUES(?,?,?,?,?,?,?,?,'JOINED')`).bind(instance.instance_id,user.id,entryDate,operation,JSON.stringify(snapshot),JSON.stringify(roles),JSON.stringify(challenge),totalPower),env.DB.prepare(`UPDATE ${INSTANCE_TABLE} SET participant_count=(SELECT COUNT(*) FROM ${PARTICIPANT_TABLE} WHERE instance_id=?),updated_at=CURRENT_TIMESTAMP WHERE instance_id=?`).bind(instance.instance_id,instance.instance_id)]);
    return json(await statusPayload(env,user,cfg,instance.instance_id));
  }
  if(path==='raid/core/battle'&&request.method==='GET'){
    const instanceId=requestedId;if(!instanceId)return json({error:'붕괴 코어 작전 ID가 필요합니다.'},400);const participant=await env.DB.prepare(`SELECT * FROM ${PARTICIPANT_TABLE} WHERE instance_id=? AND user_id=?`).bind(instanceId,user.id).first();if(!participant)return json({error:'현재 붕괴 코어 작전에 참가하지 않았습니다.'},404);if(participant.status!=='JOINED')return json({error:'이 작전의 개인 기믹 전투는 이미 완료되었습니다.'},409);const instance=await env.DB.prepare(`SELECT * FROM ${INSTANCE_TABLE} WHERE instance_id=?`).bind(instanceId).first(),fresh=await refreshInstance(env,instance,cfg);if(!fresh||fresh.status!=='BATTLE')return json({error:fresh?.status==='CLEAR'?'이미 제압이 완료된 작전입니다.':'작전 시간이 종료되었습니다.'},409);return json({...buildCoreRaidBattlePayload({participant,settings:cfg,aggregate:fresh.aggregate,createBattle:createPveBattleV2,accountNickname:user.nickname}),instanceId,operation:participant.operation,challenge:jsonSafe(participant.challenge_json,{})});
  }
  if(path==='raid/core/resolve'&&request.method==='POST'){
    const body=await readBody(request),instanceId=cleanText(body.instanceId,80),requestId=cleanText(body.requestId,120);if(!instanceId||!requestId)return json({error:'작전 ID와 요청 ID가 필요합니다.'},400);let reserved=false;
    try{const receipt=await reserveReceipt(env,{requestId,instanceId,userId:user.id,action:'RESOLVE'});if(receipt.replay)return json(receipt.replay);if(receipt.error)return json({error:receipt.error},receipt.status);reserved=true;
      const participant=await env.DB.prepare(`SELECT * FROM ${PARTICIPANT_TABLE} WHERE instance_id=? AND user_id=?`).bind(instanceId,user.id).first();if(!participant||participant.status!=='JOINED')throw Object.assign(new Error('처리할 개인 기믹 전투가 없습니다.'),{status:409});
      const instanceBefore=await env.DB.prepare(`SELECT * FROM ${INSTANCE_TABLE} WHERE instance_id=?`).bind(instanceId).first(),active=await refreshInstance(env,instanceBefore,cfg);if(!active||active.status!=='BATTLE')throw Object.assign(new Error(active?.status==='CLEAR'?'이미 제압이 완료된 작전입니다.':'작전 시간이 종료되었습니다.'),{status:409});
      const challenge=jsonSafe(participant.challenge_json,{});if(String(challenge?.issuedFor?.instanceId||'')!==instanceId||Number(challenge?.issuedFor?.userId||0)!==Number(user.id))throw Object.assign(new Error('기믹 시드 검증에 실패했습니다.'),{status:409});const qte=evaluateCoreRaidQte(challenge,body.results||{}),cards=participantDeckSnapshot(participant).cards,contribution=coreRaidContribution({cards,totalPower:participant.total_power,operation:participant.operation,challenge,qte,settings:cfg});
      const changed=await env.DB.prepare(`UPDATE ${PARTICIPANT_TABLE} SET status='RESOLVED',analysis_score=?,core_score=?,suppression_score=?,mechanic_score=?,total_damage=?,qte_result_json=?,resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE instance_id=? AND user_id=? AND status='JOINED'`).bind(contribution.analysisScore,contribution.coreScore,contribution.suppressionScore,contribution.mechanicScore,contribution.totalDamage,JSON.stringify(qte),instanceId,user.id).run();if(Number(changed?.meta?.changes||0)!==1)throw Object.assign(new Error('기믹 결과가 이미 처리되었습니다.'),{status:409});
      const instance=await env.DB.prepare(`SELECT * FROM ${INSTANCE_TABLE} WHERE instance_id=?`).bind(instanceId).first(),fresh=await refreshInstance(env,instance,cfg),response={ok:true,instanceId,verified:qte,contribution,current:{id:fresh.instance_id,status:fresh.status,endsAt:fresh.ends_at,bossName:cfg.bossName,bossImage:cfg.bossImage,bossHp:fresh.aggregate.bossHp,bossMaxHp:fresh.aggregate.bossMaxHp,...fresh.aggregate},personalResult:qte.allSuccess?'SUCCESS':'FAILED'};await completeReceipt(env,requestId,user.id,response);return json(response);
    }catch(error){if(reserved)await failReceipt(env,requestId,user.id,error);return json({error:cleanText(error?.message||error,300)},Number(error?.status||500));}
  }
  if(path==='raid/core/claim'&&request.method==='POST'){
    const result=await claimCoreReward(env,user,cfg,await readBody(request),profile);if(result.response)return json(result.response);return json({error:result.error,code:result.code,retryAfterMs:result.retryAfterMs},result.status||500);
  }
  return json({error:'지원하지 않는 붕괴 코어 레이드 요청입니다.'},404);
}
