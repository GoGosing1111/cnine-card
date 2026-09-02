import {Application, Assets, BlurFilter, Container, Graphics, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {CameraController} from './CameraController.js';
import {SkillTimeline} from './SkillTimeline.js';
import {BattleAudioMixer} from './BattleAudioMixer.js';
import {configureDamageText, createBattlePools} from './ObjectPool.js';
import {AVATAR_LAYER_ORDER, BattleCharacter, CHARACTER_STATE, TEAM} from './BattleCharacter.js';
import {normalizeSkillEffectKind, roleEffectProfile, SkillEffectFX, SKILL_EFFECT_KIND, triggerWhiteFlash} from './SkillEffectFX.js';
import {AdvancementEffectFX, advancementEffectProfile, normalizeAdvancementEffectCode} from './AdvancementEffectFX.js';
import {AccountBattleUnit} from './AccountBattleUnit.js';
import {resolveAccountBattleSuitAnimation} from './AccountBattleSuitAnimationCatalog.js';
import {ApocalypseBossUltimateFX, APOCALYPSE_BOSS_ULTIMATE_PROFILE} from './ApocalypseBossUltimateFX.js';

const DESKTOP={width:1600,height:820};
const MOBILE={width:1050,height:1500};
const CARD={width:168,height:252,scale:.88};
const BUNDLE='project-v-battle-v3';
const ISO_GRID={columns:7,rows:6};
const PLAYBACK_SPEED=1.3;
const ADVANCEMENT_LOAD_DEADLINE_MS=900;
const APOCALYPSE_FX_LOAD_DEADLINE_MS=2200;
const DEFAULT_BATTLEFIELD_MODE='HUNT';
const BATTLEFIELD_ASSETS=Object.freeze({
  HUNT:'../../assets/ui/project-v/battlefields/v3-nightmare-forest-battlefield-v1.png',
  TOWER:'../../assets/ui/project-v/battlefields/v3-infinite-tower-sanctum-v1.png',
  PVP:'../../assets/ui/coin-prediction/arena-v1.png',
  RAID:'../../assets/ui/project-v/battlefields/v3-world-raid-obsidian-citadel-v1.png',
  ESCORT:'../../assets/ui/escort/escort-fortress-route-bg-v1.webp?v=1830',
  SIEGE:'../../assets/ui/project-v/battlefields/v3-siege-fortress-courtyard-v1.png'
});
const LEGACY_BATTLEFIELD='../../assets/ui/idle-dungeon/enchanted-card-battlefield-v4.webp';
const ISO_FORMATIONS=Object.freeze({
  allies:[
    {gridX:0,gridY:1,baseScale:.52},
    {gridX:2,gridY:1,baseScale:.5},
    {gridX:0,gridY:3,baseScale:.51},
    {gridX:2,gridY:3,baseScale:.49},
    {gridX:0,gridY:5,baseScale:.5}
  ],
  enemies:[
    {gridX:6,gridY:0,baseScale:.58},
    {gridX:6,gridY:2,baseScale:.64},
    {gridX:4,gridY:2,baseScale:.58},
    {gridX:4,gridY:0,baseScale:.56},
    {gridX:4,gridY:4,baseScale:.57}
  ]
});
// Auxiliary PVE account unit station. It owns a sixth support tile inside the
// existing grid, while remaining outside the canonical five-card arrays.
const ACCOUNT_BATTLE_UNIT_FORMATION=Object.freeze({
  gridX:2,
  gridY:5,
  baseScale:.48
});
const ACCOUNT_BATTLE_UNIT_ESCORT_FORMATION=Object.freeze({
  gridX:1,
  gridY:5,
  baseScale:.48
});

function validateFormationTiles(formations=ISO_FORMATIONS){
  const occupied=new Set();
  Object.entries(formations).forEach(([team,slots])=>{
    slots.forEach(({gridX,gridY},index)=>{
      if(!Number.isInteger(gridX)||!Number.isInteger(gridY)){
        throw new Error(`FORMATION_TILE_NOT_CENTERED:${team}:${index}`);
      }
      if(gridX<0||gridX>=ISO_GRID.columns||gridY<0||gridY>=ISO_GRID.rows){
        throw new Error(`FORMATION_TILE_OUT_OF_RANGE:${team}:${gridX}:${gridY}`);
      }
      const key=`${gridX}:${gridY}`;
      if(occupied.has(key))throw new Error(`FORMATION_TILE_OCCUPIED:${key}`);
      occupied.add(key);
    });
  });
}

validateFormationTiles({...ISO_FORMATIONS,account:[ACCOUNT_BATTLE_UNIT_FORMATION,ACCOUNT_BATTLE_UNIT_ESCORT_FORMATION]});

const CARD_DATA=[
  {name:'FAKER',grade:'FUR',level:10,hp:88,art:'fakerArt',frame:'fakerFrame',logo:'t1Logo',wordmark:'fakerWordmark',color:0xff365c,effectProfile:'CRIMSON_RIFT',effectKind:'ATTACK',ability:'불사대마왕 · 공격력 증폭'},
  {name:'김택용',grade:'PRESTIGE',level:13,hp:71,art:'taekArt',frame:null,color:0x52e6ff,effectProfile:'STORM_COMMAND',effectKind:'SPEED',ability:'폭풍의 지휘 · 연속 공격'},
  {name:'쁠리',grade:'ZENITH',level:10,hp:93,art:'zenithArt',frame:'zenithFrame',color:0xa86cff,effectProfile:'MOON_BLOOM',effectKind:'HEAL',ability:'천상개화 · 궁극기 증폭'},
  {name:'비키니 아윤',grade:'LIMITED',level:13,hp:84,art:'ayoonArt',frame:null,color:0xff72c7,effectProfile:'WIND_CHAIN',effectKind:'ATTACK',ability:'질풍의 연계 · 추가 타격'},
  {name:'프로필찍는 봉준',grade:'FUR',level:10,hp:62,art:'bongArt',frame:null,color:0x65d9ff,effectProfile:'GUARD_PULSE',effectKind:'DEFENSE',ability:'강철의 의지 · 피해 감소'}
];

const ASSETS={
  boss:'../../assets/tower/BOSS7.jpg',
  fakerArt:'../../assets/cards/7777777.jpg',
  taekArt:'../../assets/pre/8.jpg',
  zenithArt:'../../assets/cards/ZENITH/V1.jpg',
  ayoonArt:'../../assets/cards/0725/3.jpg',
  bongArt:'../../assets/NEWCARD/8.jpg',
  fakerSprite:'../../assets/ui/project-v/characters/deck-faker-sd-v1.png?v=33-alpha-clean',
  taekSprite:'../../assets/ui/project-v/characters/deck-kimtaekyong-sd-v1.png?v=33-alpha-clean',
  ppliSprite:'../../assets/ui/project-v/characters/deck-ppli-sd-v1.png?v=33-alpha-clean',
  ayoonSprite:'../../assets/ui/project-v/characters/deck-bikini-ayoon-sd-v1.png?v=33-alpha-clean',
  bongSprite:'../../assets/ui/project-v/characters/deck-bongjun-sd-v1.png?v=33-alpha-clean',
  slimeSprite:'../../assets/ui/project-v/monsters/nightmare-slime-sd-v1.png?v=33-alpha-clean',
  fakerFrame:'../../assets/ui/card-frames/faker-t1-championship-frame-v2.png',
  zenithFrame:'../../assets/ui/card-frames/zenith-frame-concept-v2.png',
  t1Logo:'../../assets/ui/brands/t1-logo-red-official-cropped.png',
  fakerWordmark:'../../assets/ui/card-frames/faker-wordmark-clear-v2.svg',
  // Production FX atlas hook:
  // slashAtlas:'../../assets/effects/slash-yellow/slash-yellow.json'
};

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const hasFiniteNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));

function openingShieldState(payload,card){
  const timeline=Array.isArray(payload?.battleV2?.result?.timeline)?payload.battleV2.result.timeline:[];
  const identities=new Set([card?.id,card?.cardId,card?.card_id].map(value=>String(value||'').trim()).filter(Boolean));
  const opening=timeline.find(event=>String(event?.type||'').toUpperCase()==='START_EFFECT'
    &&String(event?.effect||'').toUpperCase()==='SHIELD'
    &&identities.has(String(event?.targetId||'').trim())
    &&hasFiniteNumber(event?.shieldAfter));
  if(!opening&&timeline.length)return {current:0,maximum:0};
  const current=Math.max(0,Number(opening?.shieldAfter??card?.shield)||0);
  const maximum=Math.max(current,Number(card?.maxShield||card?.max_shield)||0);
  return {current,maximum};
}

function combatRoleFromCard(card){
  return normalizeSkillEffectKind(card?.type||card?.powerType||card?.power_type||card?.effectKind||card?.uniqueAbility?.dominantType||card?.unique_ability?.dominant_type);
}

function assignCombatRole(character,card,{boss=false}={}){
  if(!character)return character;
  const kind=boss?normalizeSkillEffectKind(card?.type||'ATTACK'):combatRoleFromCard(card);
  const profile=roleEffectProfile(kind);
  character.effectKind=kind;
  character.effectProfile=card?.effectProfile||card?.uniqueAbility?.effectProfile||({ATTACK:'CRIMSON_RIFT',DEFENSE:'GUARD_PULSE',SPEED:'WIND_CHAIN',HP:'MOON_BLOOM'}[kind]);
  character.accent=Number(card?.accentColor)||profile.accent;
  character.abilityLabel=card?.uniqueAbility?.effectName||card?.effectName||profile.label;
  return character;
}

function advancementCodesFromPayload(payload){
  const timeline=Array.isArray(payload?.battleV2?.result?.timeline)?payload.battleV2.result.timeline:[];
  const codes=timeline.map(event=>{
    const type=String(event?.type||'').trim().toUpperCase();
    const activation=normalizeAdvancementEffectCode(event?.advancementClass||event?.classCode);
    if(type==='TURN'&&event?.dodge===true&&activation==='AFTERIMAGE')return activation;
    if(type==='TURN'&&event?.dodge!==true&&activation==='SHATTER')return activation;
    if(type==='COUNTER'&&activation==='RIPOSTE')return activation;
    if((type==='ADVANCEMENT'||type==='ADVANCEMENT_SEALED')&&activation==='IMMORTAL')return activation;
    return '';
  });
  return [...new Set(codes.filter(Boolean))];
}

function normalizeBattlefieldMode(value){
  const mode=String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
  if(/TOWER|INFINITE/.test(mode))return 'TOWER';
  if(/PVP|RANK|RANKED|ARENA/.test(mode))return 'PVP';
  if(/RAID|WORLD_BOSS|BOSS_RAID/.test(mode))return 'RAID';
  if(/ESCORT|CONVOY|TRANSPORT/.test(mode))return 'ESCORT';
  if(/SIEGE|SEAL|TERRITORY|FORTRESS/.test(mode))return 'SIEGE';
  return DEFAULT_BATTLEFIELD_MODE;
}

function battlefieldModeFromPayload(payload){
  if(typeof payload==='string')return normalizeBattlefieldMode(payload);
  if(payload?.floor)return 'TOWER';
  const monster=payload?.monster||{};
  const battle=payload?.battleV2||{};
  return normalizeBattlefieldMode(
    payload?.battlefieldMode||payload?.battlefield||payload?.contentType||payload?.mode||
    battle?.battlefieldMode||battle?.contentType||battle?.mode||battle?.type||
    monster?.battlefieldMode||monster?.contentType||monster?.mode||monster?.type
  );
}

const ACCOUNT_UNIT_PVE_MODE=/(?:^|_)(?:PVE|HUNT|TOWER|RAID|SEAL|ESCORT|DUNGEON|APOCALYPSE|SCRAPYARD|IDLE)(?:_|$)/;
const ACCOUNT_UNIT_FORBIDDEN_MODE=/(?:^|_)(?:PVP|RANK|RANKED|ARENA|SIEGE|TERRITORY|CAPTAIN|CLAN)(?:_|$)/;
const ACCOUNT_WEAPON_CUTOUTS=Object.freeze({
  EQ_1785427638137:'/assets/ui/project-v/account-battle-suits/weapons/avalon-m4a1-v1.png',
  EQ_1785961232958:'/assets/ui/project-v/account-battle-suits/weapons/infinity-ak-v1.png',
  EQ_1785961300455:'/assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png',
  EQ_1786966923833:'/assets/ui/project-v/account-battle-suits/weapons/sovereign-sks-v1.png'
});
// Presentation-only cadence for the auxiliary PVE unit. These profiles never
// mutate authoritative HP or the canonical five-card action list. ARs keep a
// recognisable automatic burst, while the M200 and SKS retain their slower
// physical weapon cadence instead of being visually treated like an AR.
const ACCOUNT_BATTLE_UNIT_SUSTAINED_FIRE_PROFILES=Object.freeze({
  DEFAULT:Object.freeze({weaponClass:'AR',fireMode:'FULL_AUTO',roundsPerBurst:4,intraBurstDelayMs:45,burstDelayMs:150,playbackRate:1.8}),
  EQ_1785427638137:Object.freeze({weaponClass:'M4A1_AR',fireMode:'FULL_AUTO',roundsPerBurst:4,intraBurstDelayMs:40,burstDelayMs:140,playbackRate:1.85}),
  EQ_1785961232958:Object.freeze({weaponClass:'AK_AR',fireMode:'FULL_AUTO',roundsPerBurst:3,intraBurstDelayMs:75,burstDelayMs:210,playbackRate:1.6}),
  EQ_1785961300455:Object.freeze({weaponClass:'M200_SNIPER',fireMode:'BOLT_ACTION',roundsPerBurst:1,intraBurstDelayMs:0,burstDelayMs:760,playbackRate:1}),
  EQ_1786966923833:Object.freeze({weaponClass:'SKS_DMR',fireMode:'SEMI_AUTO',roundsPerBurst:2,intraBurstDelayMs:170,burstDelayMs:390,playbackRate:1.12})
});

function payloadModeTokens(payload){
  const battle=payload?.battleV2||{};
  return [
    payload?.battlefieldMode,payload?.battlefield,payload?.contentType,payload?.mode,payload?.type,
    battle?.battlefieldMode,battle?.contentType,battle?.mode,battle?.type,
    payload?.monster?.battlefieldMode,payload?.monster?.contentType,payload?.monster?.mode,payload?.monster?.type
  ].map(value=>String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_')).filter(Boolean);
}

function isApocalypsePayload(payload){
  const battle=payload?.battleV2||{};
  const monster=payload?.monster||{};
  if(payloadModeTokens(payload).some(value=>value.includes('APOCALYPSE')))return true;
  if(battle?.rules?.apocalypseFloorScaling)return true;
  return [payload?.difficulty,payload?.pveTab,monster?.difficulty,monster?.pveTab,monster?.tab]
    .some(value=>String(value||'').trim().toUpperCase()==='APOCALYPSE');
}

function authoritativeBattleSuitSupportFromPayload(payload){
  const battle=payload?.battleV2||{};
  const rows=[
    ...(Array.isArray(battle?.teams?.A?.supports)?battle.teams.A.supports:[]),
    ...(Array.isArray(battle?.result?.supports?.A)?battle.result.supports.A:[])
  ];
  const support=rows.find(item=>String(item?.actorKind||'').trim().toUpperCase()==='BATTLE_SUIT')||null;
  const serverTimeline=String(battle?.rules?.battleSuitDamageAuthority||support?.damageAuthority||'').trim().toUpperCase()==='SERVER_TIMELINE';
  return support&&serverTimeline?support:null;
}

function isAccountBattleUnitPvePayload(payload){
  if(!payload?.battleV2)return false;
  const tokens=payloadModeTokens(payload);
  if(tokens.some(value=>ACCOUNT_UNIT_FORBIDDEN_MODE.test(value)))return false;
  const wrapperGate=payload?.v3RenderContext?.accountBattleUnitPve;
  if(wrapperGate===false)return false;
  if(wrapperGate!==true&&!tokens.some(value=>ACCOUNT_UNIT_PVE_MODE.test(value)))return false;
  return Boolean(authoritativeBattleSuitSupportFromPayload(payload));
}

function publicEquipmentObject(payload,key){
  if(!payload||typeof payload!=='object')return null;
  // Top-level is authoritative. An explicit null means unequipped and must
  // not revive a stale characterBonus fallback.
  const ownsTop=Object.prototype.hasOwnProperty.call(payload,key);
  const value=ownsTop
    ?payload[key]
    :payload?.characterBonus?.[key]??payload?.characterBonus?.bonuses?.[key]??payload?.bonuses?.[key];
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
}

function appearanceObject(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  return value.appearance&&typeof value.appearance==='object'&&!Array.isArray(value.appearance)
    ?{...value,...value.appearance}
    :value;
}

function equipmentCode(value){
  const item=appearanceObject(value);
  return String(item?.code||item?.itemCode||item?.equipmentCode||'').trim().toUpperCase();
}

function appearanceUrl(value){
  const item=appearanceObject(value);
  if(!item)return '';
  const battleSprite=item.battleSprite;
  const source=typeof battleSprite==='object'&&battleSprite
    ?battleSprite.url||battleSprite.src||battleSprite.image
    :battleSprite;
  return rootAssetPath(source||(typeof item.appearance==='string'?item.appearance:'')||item.appearanceUrl||item.imageUrl||item.image_url||item.image||item.primaryUrl||'');
}

function weaponAppearanceUrl(value){
  const item=appearanceObject(value);
  if(!item)return '';
  const code=String(item.code||item.itemCode||item.equipmentCode||'').trim().toUpperCase();
  if(ACCOUNT_WEAPON_CUTOUTS[code])return ACCOUNT_WEAPON_CUTOUTS[code];
  const battleSprite=item.battleSprite;
  const explicit=typeof battleSprite==='object'&&battleSprite
    ?battleSprite.url||battleSprite.src||battleSprite.image
    :battleSprite;
  // Generic equipment image fields are often square card art. Only an
  // explicit transparent battle appearance may bypass the approved code map.
  return rootAssetPath(explicit||(typeof item.appearance==='string'?item.appearance:'')||item.appearanceUrl||'');
}

function accountNickname(payload){
  return String(payload?.accountNickname||payload?.user?.nickname||payload?.profile?.nickname||payload?.nickname||'').trim();
}

function rootAssetPath(value){
  const raw=String(value||'').trim().replace(/\\/g,'/');
  if(!raw)return '';
  if(/^(?:data:|blob:|https?:\/\/|\/)/i.test(raw))return raw;
  return `/${raw.replace(/^(?:\.\.\/)+/,'').replace(/^\.\//,'')}`;
}

function assetKey(value){
  try{return new URL(String(value||''),location.href).pathname}catch{return String(value||'').split('?')[0]}
}

// V1901: 모바일 크롬 렌더러가 "앗, 이런!"(Aw, Snap! = 렌더러 프로세스 OOM)로 죽는 문제.
// 캔버스 백버퍼와 MSAA 리졸브 버퍼는 GPU 가 아니라 렌더러 프로세스 메모리에 잡힌다.
// DPR 3 단말에서 resolution 2 + antialias 는 그것만으로 수십 MB 를 고정으로 쓴다.
// SD 스프라이트는 화면에서 60~110px 로 그려지므로 1.5 배율·MSAA 해제로도 육안 차이가 없다.
const LOW_MEMORY_DEVICE=(()=>{
  try{
    const memory=Number(navigator?.deviceMemory||0);
    if(memory>0&&memory<=4)return true;
    return Boolean(matchMedia('(max-width:860px)').matches||matchMedia('(pointer:coarse)').matches);
  }catch{return false}
})();

// V1901: 컷인에 쓰는 "원본 카드 아트" 다운스케일.
// v1803 이 전투 스프라이트를 384px 변형으로 돌릴 때 대상은 battle-v3-live.js 의
// SPRITE_URL_KEYS(image/imageBattle/battleImage/imageUrl/image_url/primaryUrl/pngFallbackUrl)
// 뿐이었다. 아래 originalCardArtUrl 이 고르는 sourceArtUrl/sourceArt/originalCardArt/
// imageOriginal/cardImage/image_url_original 은 그 목록에 없어서 축소를 피해 갔고,
// 그래서 한 판마다 카드 10장의 원본(평균 334KB, 디코딩하면 장당 5~6MB)이 그대로
// Assets 캐시에 들어갔다. 컷인은 화면에서 최대 반 폭이라 384 변형으로 충분하다.
// 변형이 없는 이미지(몬스터·이펙트)는 원본 그대로 통과한다.
function cutInVariantUrl(value){
  const url=rootAssetPath(value);
  if(!url)return '';
  try{
    const mapped=globalThis.cnineBattleSpriteUrl?.(url,384);
    if(mapped)return mapped;
  }catch(error){/* 매핑 실패는 원본 유지 */}
  return url;
}

function originalCardArtUrl(card,art){
  // The manifest source art is authoritative for a tactical cut-in. Runtime
  // adapters replace card.image with the SD battle sprite, so choosing image
  // fields first can accidentally put that sprite inside the card cut-in.
  const battleSpriteKey=assetKey(art?.primaryUrl);
  const candidates=[art?.sourceArtUrl,card?.sourceArt,card?.source_art,card?.originalCardArt,card?.imageOriginal,card?.cardImage,card?.image_url_original,card?.imageUrl,card?.image_url,card?.image];
  const source=candidates.find(value=>value&&assetKey(value)!==battleSpriteKey);
  // 후보 "선택"은 원본 경로 그대로 비교한다(스프라이트와 같은 그림을 컷인에 넣지 않기 위해).
  // 실제로 받는 URL 만 384 변형으로 바꾼다.
  return source?cutInVariantUrl(source):'';
}

async function loadBattleArtTexture(art){
  try{return await Assets.load(art.primaryUrl)}catch(error){
    if(!art?.pngFallbackUrl||art.pngFallbackUrl===art.primaryUrl)throw error;
    console.warn('[Project V V3] optimized sprite decode failed; PNG fallback is used.',error);
    return Assets.load(art.pngFallbackUrl);
  }
}

function textNode(text,size,color=0xffffff,weight='700',align='left'){
  return new Text({text,style:{fontFamily:'Pretendard, SUIT, Arial, sans-serif',fontSize:size,fill:color,fontWeight:weight,align,letterSpacing:size>=14?.4:0}});
}

function rectangle(width,height,color,alpha=1,radius=0,stroke=null){
  const graphics=new Graphics();
  if(radius)graphics.roundRect(0,0,width,height,radius);else graphics.rect(0,0,width,height);
  graphics.fill({color,alpha});
  if(stroke)graphics.stroke(stroke);
  return graphics;
}

function setCover(sprite,width,height){
  const scale=Math.max(width/sprite.texture.width,height/sprite.texture.height);
  sprite.scale.set(scale);
  sprite.anchor.set(.5);
  sprite.position.set(width/2,height/2);
}

function cardAperture(data){
  if(data.logo)return {x:CARD.width*.171,y:CARD.height*.173,w:CARD.width*(1-.171*2),h:CARD.height*(1-.173-.176),radius:5};
  if(data.grade==='ZENITH')return {x:CARD.width*.098,y:CARD.height*.088,w:CARD.width*.804,h:CARD.height*.834,radius:11};
  return {x:CARD.width*.08,y:CARD.height*.06,w:CARD.width*.84,h:CARD.height*.86,radius:8};
}

function addGlow(parent,width,height,color,alpha=.26){
  const glow=rectangle(width,height,color,alpha,18);
  glow.filters=[new BlurFilter({strength:22,quality:2})];
  parent.addChild(glow);
  return glow;
}

export class BattleEngine{
  constructor({host=null,onStatus=()=>{},battleData=null}={}){
    this.host=host;
    this.onStatus=onStatus;
    this.app=null;
    this.root=null;
    this.stage=null;
    this.backgroundLayer=null;
    this.combatLayer=null;
    this.effectLayer=null;
    this.uiLayer=null;
    this.camera=null;
    this.skillTimeline=null;
    this.pools=null;
    this.audio=null;
    this.advancementCodes=new Set();
    this.advancementReadyPromise=Promise.resolve(true);
    this.advancementLoadTimeouts=0;
    this.apocalypseMode=isApocalypsePayload(battleData);
    this.apocalypseBossUltimateReadyPromise=Promise.resolve(false);
    this.apocalypseBossUltimateLoadTimeouts=0;
    this.playbackEpoch=0;
    this.textures=null;
    this.cards=[];
    this.characters=[];
    this.allies=[];
    this.enemies=[];
    this.accountBattleUnit=null;
    this.accountBattleUnitEnabled=false;
    this.accountBattleUnitEquipment={battleSuit:null,weapon:null};
    this.accountBattleUnitShotCount=0;
    this.accountBattleUnitDamageEventCount=0;
    this.accountBattleUnitDamageTotal=0;
    this.accountBattleUnitSustainedShotCount=0;
    this.accountBattleUnitFireRun=null;
    this.accountBattleUnitDamageQueue=[];
    this.accountBattleUnitPreviewFireHook=null;
    this.accountBattleUnitHitReactions=new Map();
    this.lastAccountBattleUnitCameraImpulse=0;
    this.boss=null;
    this.bossHp=72;
    this.currentEnemyTarget=null;
    this.currentAllyTarget=null;
    this.lastTargetSwitch=null;
    this.battleData=battleData;
    this.livePayload=Boolean(battleData?.battleV2);
    this.liveDeployed=false;
    this.activeMonsterArt=null;
    this.activeFallbackArt=[];
    this.uniquePreviewIndex=0;
    this.visible=false;
    this.requestedVisible=false;
    this.playing=false;
    this.mounted=false;
    this.autoMode=true;
    this.mobile=false;
    this.scene={...DESKTOP};
    this.backgroundSprite=null;
    this.activeBattlefieldMode=battlefieldModeFromPayload(battleData);
    this.activeBattlefieldTexture=null;
    this.activeBattlefieldAsset=BATTLEFIELD_ASSETS[this.activeBattlefieldMode];
    this.battlefieldRequest=0;
    this.parallaxLayers=[];
    this.parallaxTicker=null;
    this.isoFloorLayer=null;
    this.isoTiles=[];
    this.isoConfig=null;
    this.objectiveSprite=null;
    this.objectiveData=null;
    this.objectiveHud=null;
    this.depthTicker=null;
    this.bottomShade=null;
    this.motes=[];
    this.moteTicker=null;
    this.simpleTimelines=new Set();
    // V1812: 전투가 길어질수록 뒷부분 재생을 빠르게 한다.
    //   판정·타임라인은 그대로고 보여주는 속도만 바뀐다.
    this.paceActions=0;
    this.paceScale=1;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onVisibility=()=>this.setVisible(this.requestedVisible);
  }

  async mount(target=this.host||document.getElementById('pvPixiBattle')){
    if(this.mounted)return this;
    if(!target)throw new Error('전투 렌더링 영역을 찾지 못했습니다.');
    this.host=target;
    this.app=new Application();
    await this.app.init({
      resizeTo:target,
      backgroundAlpha:0,
      antialias:!LOW_MEMORY_DEVICE,
      autoDensity:true,
      resolution:Math.min(devicePixelRatio||1,LOW_MEMORY_DEVICE?1.5:2),
      preference:'webgl',
      powerPreference:'high-performance'
    });
    this.app.canvas.className='pv-pixi-canvas';
    this.app.canvas.setAttribute('aria-hidden','true');
    target.appendChild(this.app.canvas);

    const battlefieldTexturePromise=this.loadBattlefieldTexture(this.activeBattlefieldMode);
    if(this.livePayload){
      // Production battles must not download the 10MB preview roster before
      // the authoritative server cards and monster are known. Empty textures
      // keep the shared actor/card geometry intact until setBattlePayload()
      // installs the live art below.
      this.textures=Object.fromEntries(Object.keys(ASSETS).map(key=>[key,Texture.EMPTY]));
    }else{
      Assets.addBundle(BUNDLE,ASSETS);
      this.textures=await Assets.loadBundle(BUNDLE);
    }
    this.activeBattlefieldTexture=await battlefieldTexturePromise;

    this.root=new Container();
    this.stage=new Container({sortableChildren:true,label:'BattleStage'});
    this.backgroundLayer=new Container({label:'BackgroundLayer'});
    // The floor is projected by gridToScreen; actors must remain on this
    // unrotated, non-squashed billboard layer. Camera shake/zoom lives on the
    // parent stage and remains intentionally visible.
    this.combatLayer=new Container({sortableChildren:true,label:'CombatBillboardLayer'});
    this.combatLayer.rotation=0;
    this.combatLayer.scale.set(1,1);
    this.combatLayer.skew.set(0,0);
    this.combatLayer.isBillboardLayer=true;
    this.effectLayer=new Container({sortableChildren:true,label:'EffectLayer'});
    this.uiLayer=new Container({sortableChildren:true,label:'UiLayer'});
    this.stage.addChild(this.backgroundLayer,this.combatLayer,this.effectLayer,this.uiLayer);
    this.root.addChild(this.stage);
    this.app.stage.addChild(this.root);

    this.camera=new CameraController(this.stage,DESKTOP);
    this.pools=createBattlePools();
    this.audio=new BattleAudioMixer();
    // Start the compact authored SFX fetch/decode beside the heavier atlases.
    // In the live shell the mixer has already adopted the start-button audio
    // context, so awaiting both prevents the first automatic hit from racing
    // an unfinished decode. Missing assets resolve false and stay silent;
    // they never revive the retired procedural sound.
    // The four authored advancement atlases decode to another ~43 MiB. They
    // must never sit inside the first-frame barrier that is protected by the
    // mobile renderer watchdog. applyBattlePayload() starts desktop warming in
    // the background; low-memory clients load one exact activation on demand.
    await Promise.all([SkillEffectFX.preloadAll(),this.audio.prepare()]);
    this.skillTimeline=new SkillTimeline({
      ...DESKTOP,
      backgroundLayer:this.backgroundLayer,
      combatLayer:this.combatLayer,
      effectLayer:this.effectLayer,
      uiLayer:this.uiLayer,
      camera:this.camera,
      pools:this.pools,
      audio:this.audio,
      ticker:this.app.ticker,
      playbackSpeed:PLAYBACK_SPEED,
      reducedMotion:this.reducedMotion
    });

    this.createBackground();
    this.createIsometricFloor();
    this.cards=CARD_DATA.map((data,index)=>this.createCard(data,index));
    this.cards.forEach(card=>this.combatLayer.addChild(card));
    await this.createCharacters();
    this.boss=this.enemies[1];
    this.currentEnemyTarget=this.boss;
    this.currentAllyTarget=this.allies[0]||null;
    if(this.boss)this.boss.isBoss=true;
    this.createUi();
    this.app.renderer.on('resize',()=>this.resize());
    this.resize();
    this.bindControls();
    document.addEventListener('visibilitychange',this.onVisibility);
    this.host.querySelector('.pv-pixi-loading')?.remove();
    this.mounted=true;
    // 최초 마운트에서는 setBattlePayload()가 배우 생성 중 실행되어 mounted=false다.
    // 호송 목표물은 Stage가 완성된 지금 한 번 더 연결해야 첫 판부터 표시된다.
    if(this.battleData)await this.setObjective(this.battleData);
    this.app.stop();
    // All critical Pixi/character work is complete. Warm the compact combat
    // sprite outside mount() so first-frame readiness never awaits audio.
    this.audio?.schedulePreload?.(60);
    return this;
  }

  attachTo(target){
    if(!target||!this.app?.canvas)return this;
    this.host=target;
    if(this.app.canvas.parentNode!==target)target.appendChild(this.app.canvas);
    if('resizeTo' in this.app)this.app.resizeTo=target;
    this.app.resize?.();
    this.resize();
    return this;
  }

  resetVisualSession({preserveTargets=false}={}){
    // A battle renderer is intentionally reused to avoid repeatedly creating
    // WebGL contexts. Everything below the renderer, however, is session data
    // and must be reset before the next server timeline is accepted.
    this.cancelTimelines();
    this.playing=false;
    this.liveDeployed=false;
    if(!preserveTargets){
      this.activeMonsterArt=null;
      this.activeFallbackArt=[];
      this.uniquePreviewIndex=0;
      this.currentEnemyTarget=null;
      this.currentAllyTarget=null;
      this.boss=null;
      this.bossHp=0;
      this.lastTargetSwitch=null;
      if(this.objectiveSprite)this.objectiveSprite.visible=false;
      if(this.objectiveHud)this.objectiveHud.visible=false;
    }
    this.cards.forEach(card=>{
      card.alpha=0;
      card.visible=false;
      card.renderable=false;
      card.position.set(card.baseX,card.baseY);
      card.scale.set(card.restScale);
      card.rotation=0;
      card.hpValue=100;
      if(card.hp)this.setHp(card.hp,100,0x64e3a9);
    });
    this.characters.forEach(character=>{
      character.root.alpha=0;
      character.root.visible=false;
      character.root.position.set(character.baseX,character.baseY);
      character.root.scale.set(character.restScale);
      character.root.tint=0xffffff;
      character.root.filters=[];
      character.setTint?.(0xffffff);
      character.setState(CHARACTER_STATE.IDLE);
      character.setHp(100);
      if(preserveTargets){
        character.setShield?.(character.startingShield||0,character.startingMaxShield||0);
      }else{
        character.startingShield=0;
        character.startingMaxShield=0;
        character.serverMaxShield=0;
        character.setShield?.(0,0);
      }
    });
    if(this.accountBattleUnit){
      this.accountBattleUnit.cancelFire();
      this.accountBattleUnit.root.alpha=0;
      this.accountBattleUnit.setActive(Boolean(preserveTargets&&this.accountBattleUnitEnabled),{deployed:false});
      if(!this.visible)this.accountBattleUnit.stopIdle();
    }
    if(this.uiLayer?.combo){
      this.uiLayer.combo.alpha=0;
      this.uiLayer.combo.text='';
    }
    if(this.uiLayer?.comboLabel)this.uiLayer.comboLabel.alpha=0;
    this.updateStatus('PROJECT V V3 · 새 전투 세션 준비');
    this.camera?.reset?.(true);
  }

  async resetSession(payload=this.battleData,target=null){
    this.requestedVisible=false;
    if(this.app){
      this.visible=false;
      this.app.stop();
    }
    this.resetVisualSession();
    if(target)this.attachTo(target);
    if(payload)await this.setBattlePayload(payload);
    // setBattlePayload installs new identities, textures and active slots.
    // Restore their transient HP/FSM/alpha state after asynchronous texture
    // work so no first-battle KO/result state can leak into battle two.
    this.resetVisualSession({preserveTargets:true});
    this.characters.forEach(character=>{
      // V1788: visible 만 되돌리면 안 된다. syncFinalState 는 전멸 처리한 캐릭터에
      // renderable=false 까지 걸어두는데, Pixi 는 renderable=false 면 visible=true 여도
      // 그리지 않는다. 여기서 같이 복구하지 않으면 그 상태가 다음 전투로 그대로 전이된다.
      character.root.visible=character.root.renderable=character.battleActive!==false;
    });
    return this;
  }

  createBackground(){
    const definitions=[
      {label:'Sky',coefficient:.2,start:0,end:.42},
      {label:'City',coefficient:.5,start:.38,end:.74},
      {label:'Ground',coefficient:1,start:.7,end:1}
    ];
    definitions.forEach(definition=>{
      const layer=new Container({label:definition.label});
      const sprite=new Sprite(this.activeBattlefieldTexture);
      sprite.alpha=.96;
      const mask=new Graphics();
      layer.addChild(sprite,mask);
      layer.mask=mask;
      layer.parallaxCoefficient=definition.coefficient;
      layer.bandStart=definition.start;
      layer.bandEnd=definition.end;
      this.parallaxLayers.push({layer,sprite,mask,...definition});
      this.backgroundLayer.addChild(layer);
    });
    this.backgroundSprite=this.parallaxLayers[0].sprite;
    this.layoutParallax(DESKTOP.width,DESKTOP.height);
    this.backgroundLayer.addChild(rectangle(DESKTOP.width,DESKTOP.height,0x03060b,.17));
    this.bottomShade=rectangle(DESKTOP.width,250,0x02040a,.62);
    this.bottomShade.y=DESKTOP.height-250;
    this.backgroundLayer.addChild(this.bottomShade);

    for(let index=0;index<32;index+=1){
      const mote=rectangle(2+(index%3),2+(index%3),index%4===0?0xffd46e:0x79e9ff,.2,4);
      mote.position.set((index*173)%DESKTOP.width,70+(index*251)%(DESKTOP.height-130));
      mote._phase=index*.41;
      this.motes.push(mote);
      this.backgroundLayer.addChild(mote);
    }
    this.moteTicker=ticker=>{
      if(!this.visible)return;
      const time=performance.now()/900;
      this.motes.forEach(mote=>{
        mote.y-=.08*ticker.deltaTime;
        mote.alpha=.13+Math.sin(time+mote._phase)*.07;
        if(mote.y<35)mote.y=this.scene.height-55;
      });
    };
    this.app.ticker.add(this.moteTicker);
    this.parallaxTicker=()=>{
      if(!this.visible||!this.stage)return;
      const cameraX=this.stage.x-this.camera.base.x;
      const cameraY=this.stage.y-this.camera.base.y;
      this.parallaxLayers.forEach(({layer,coefficient})=>{
        // The parent Stage already carries full camera motion. Moving each
        // band back by the unused portion yields exact 0.2 / 0.5 / 1.0 depth.
        layer.position.set(-cameraX*(1-coefficient),-cameraY*(1-coefficient));
      });
    };
    this.app.ticker.add(this.parallaxTicker);
  }

  async loadBattlefieldTexture(mode){
    const normalized=normalizeBattlefieldMode(mode);
    const primary=BATTLEFIELD_ASSETS[normalized]||BATTLEFIELD_ASSETS[DEFAULT_BATTLEFIELD_MODE];
    try{return await Assets.load(primary)}catch(error){
      console.warn(`[Project V V3] ${normalized} 전장 로드 실패; 호환 배경을 사용합니다.`,error);
      return Assets.load(LEGACY_BATTLEFIELD);
    }
  }

  async setBattlefield(mode,{immediate=false}={}){
    const normalized=normalizeBattlefieldMode(mode);
    this.activeBattlefieldMode=normalized;
    this.activeBattlefieldAsset=BATTLEFIELD_ASSETS[normalized];
    if(this.isoFloorLayer){
      this.drawIsometricFloor();
      this.layoutAccountBattleUnit();
      this.sortCombatDepth();
    }
    if(!this.mounted||!this.backgroundLayer)return normalized;
    if(this.activeBattlefieldTexture&&this.parallaxLayers.every(item=>item.sprite.texture===this.activeBattlefieldTexture)&&normalized===this.backgroundLayer.activeMode)return normalized;
    const request=++this.battlefieldRequest;
    const texture=await this.loadBattlefieldTexture(normalized);
    if(request!==this.battlefieldRequest)return this.activeBattlefieldMode;
    const apply=()=>{
      this.activeBattlefieldTexture=texture;
      this.backgroundLayer.activeMode=normalized;
      this.parallaxLayers.forEach(({sprite})=>{sprite.texture=texture});
      this.layoutParallax(this.scene.width,this.scene.height);
    };
    // V1934: 이 교차 페이드는 GSAP = requestAnimationFrame 으로 돈다.
    //   화면이 가려지면(탭 전환·화면 잠금·백그라운드 PWA) rAF 가 멈추고
    //   onComplete 가 영원히 안 불려서 이 await 가 풀리지 않는다.
    //   battle-v3-live 는 setBattlefield **다음에** setVisible(true) 를 부르므로
    //   "V3 WebGL 전장 구성 중" 에서 전투 진입이 통째로 막혔다(재현 확인).
    //   보이지 않을 때는 연출을 건너뛰고 즉시 적용한다 — 어차피 아무도 못 본다.
    if(immediate||this.reducedMotion||!this.visible||(typeof document!=='undefined'&&document.hidden)){apply();return normalized}
    await new Promise(resolve=>{
      let settled=false;
      const finish=()=>{if(settled)return;settled=true;clearTimeout(guard);resolve()};
      // rAF 가 도중에 멈춰도 반드시 풀리도록 시계 기반 안전장치를 함께 건다.
      const guard=setTimeout(()=>{
        if(settled)return;
        try{gsap.killTweensOf(this.backgroundLayer)}catch{}
        apply();
        this.backgroundLayer.alpha=1;
        finish();
      },700);
      gsap.to(this.backgroundLayer,{alpha:0,duration:.12,ease:'power1.out',onComplete:()=>{
        apply();
        gsap.to(this.backgroundLayer,{alpha:1,duration:.2,ease:'power1.out',onComplete:finish});
      }});
    });
    this.updateStatus?.(`전장 변경 · ${normalized}`);
    return normalized;
  }

  layoutParallax(width,height){
    this.parallaxLayers.forEach(({sprite,mask,start,end})=>{
      setCover(sprite,width,height);
      mask.clear().rect(-48,height*start-4,width+96,height*(end-start)+8).fill(0xffffff);
    });
  }

  createIsometricFloor(){
    this.isoFloorLayer=new Container({label:'IsometricFloor'});
    this.isoFloorLayer.depthSortY=-100000;
    this.isoFloorLayer.eventMode='none';
    this.combatLayer.addChild(this.isoFloorLayer);
    this.configureIsometricScene();
    this.drawIsometricFloor();
    this.depthTicker=()=>this.sortCombatDepth();
    this.app.ticker.add(this.depthTicker);
  }

  configureIsometricScene(){
    this.isoConfig=this.mobile
      ?{originX:525,originY:414,tileWidth:132,tileHeight:68,farY:470,nearY:720,minScale:.84,maxScale:1.1}
      :{originX:800,originY:292,tileWidth:190,tileHeight:90,farY:405,nearY:650,minScale:.82,maxScale:1.08};
    return this.isoConfig;
  }

  gridToScreen(gridX,gridY){
    const config=this.isoConfig||this.configureIsometricScene();
    return {
      x:config.originX+(gridX-gridY)*config.tileWidth*.5,
      y:config.originY+(gridX+gridY)*config.tileHeight*.5
    };
  }

  accountBattleUnitFormation(){
    // The escort objective owns 2:5. All ordinary PVE battlefields use the
    // user-approved one-cell-forward station; ESCORT alone falls back to the
    // previous safe support tile so the vehicle and account unit never stack.
    return this.activeBattlefieldMode==='ESCORT'
      ?ACCOUNT_BATTLE_UNIT_ESCORT_FORMATION
      :ACCOUNT_BATTLE_UNIT_FORMATION;
  }

  screenToGrid(screenX,screenY){
    const config=this.isoConfig||this.configureIsometricScene();
    const dx=(screenX-config.originX)/(config.tileWidth*.5);
    const dy=(screenY-config.originY)/(config.tileHeight*.5);
    return {gridX:(dx+dy)*.5,gridY:(dy-dx)*.5};
  }

  drawIsometricFloor(){
    if(!this.isoFloorLayer||!this.isoConfig)return;
    this.isoFloorLayer.removeChildren().forEach(child=>child.destroy?.({children:true}));
    this.isoTiles=[];
    const {columns,rows}=ISO_GRID;
    const {tileWidth,tileHeight}=this.isoConfig;
    const teamTiles={
      ally:new Set(['0:1','2:1','0:3','2:3','0:5']),
      enemy:new Set(['6:0','6:2','4:2'])
    };
    const accountFormation=this.accountBattleUnitFormation();
    const accountTileKey=`${accountFormation.gridX}:${accountFormation.gridY}`;
    this.accountBattleUnitTile=null;
    for(let row=0;row<rows;row+=1){
      for(let column=0;column<columns;column+=1){
        const point=this.gridToScreen(column,row);
        const key=`${column}:${row}`;
        const accountSupport=key===accountTileKey;
        const ally=teamTiles.ally.has(key);
        const enemy=teamTiles.enemy.has(key);
        const accent=ally?0x40cfff:enemy?0xff536b:0x6e8aa0;
        const alpha=(ally||enemy)?0.2:0.095;
        const tile=new Container({label:accountSupport?`AccountSupportTile:${key}`:`IsoTile:${key}`});
        tile.position.set(point.x,point.y);
        const lower=new Graphics()
          .poly([0,-tileHeight*.42,tileWidth*.49,0,0,tileHeight*.58,-tileWidth*.49,0])
          .fill({color:0x02060b,alpha:.74});
        lower.y=7;
        const face=new Graphics()
          .poly([0,-tileHeight*.5,tileWidth*.5,0,0,tileHeight*.5,-tileWidth*.5,0])
          .fill({color:ally?0x0a3346:enemy?0x3a111b:(column+row)%2?0x0e1922:0x101e29,alpha:(ally||enemy)?0.58:0.48})
          .stroke({width:ally||enemy?2:1,color:accent,alpha:(ally||enemy)?0.72:0.25});
        const inner=new Graphics()
          .poly([0,-tileHeight*.38,tileWidth*.38,0,0,tileHeight*.38,-tileWidth*.38,0])
          .stroke({width:1,color:accent,alpha});
        tile.addChild(lower,face,inner);
        tile.depthSortY=-100000;
        this.isoFloorLayer.addChild(tile);
        this.isoTiles.push(tile);
        if(accountSupport){
          const supportAccent=new Container({label:`AccountSupportAccent:${key}`});
          const supportFace=new Graphics()
            .poly([0,-tileHeight*.5,tileWidth*.5,0,0,tileHeight*.5,-tileWidth*.5,0])
            .fill({color:0x0a3346,alpha:.58})
            .stroke({width:2,color:0x40cfff,alpha:.72});
          const supportInner=new Graphics()
            .poly([0,-tileHeight*.38,tileWidth*.38,0,0,tileHeight*.38,-tileWidth*.38,0])
            .stroke({width:1,color:0x40cfff,alpha:.2});
          supportAccent.addChild(supportFace,supportInner);
          tile.addChild(supportAccent);
          tile.isAccountBattleUnitTile=true;
          tile.accountSupportAccent=supportAccent;
          this.accountBattleUnitTile=tile;
        }
      }
    }
    const battlefieldOutline=new Graphics();
    const top=this.gridToScreen(0,0);
    const right=this.gridToScreen(columns-1,0);
    const bottom=this.gridToScreen(columns-1,rows-1);
    const left=this.gridToScreen(0,rows-1);
    battlefieldOutline
      .poly([top.x,top.y-tileHeight*.5,right.x+tileWidth*.5,right.y,bottom.x,bottom.y+tileHeight*.5,left.x-tileWidth*.5,left.y])
      .stroke({width:3,color:0x9bdfff,alpha:.2});
    battlefieldOutline.depthSortY=-99999;
    this.isoFloorLayer.addChild(battlefieldOutline);
    this.syncAccountBattleUnitTile();
  }

  syncAccountBattleUnitTile(){
    if(!this.accountBattleUnitTile)return;
    this.accountBattleUnitTile.visible=true;
    if(this.accountBattleUnitTile.accountSupportAccent){
      this.accountBattleUnitTile.accountSupportAccent.visible=Boolean(this.accountBattleUnitEnabled);
    }
  }

  depthForY(y){
    const config=this.isoConfig||this.configureIsometricScene();
    return clamp((y-config.farY)/(config.nearY-config.farY),0,1);
  }

  perspectiveScale(baseScale,y){
    const config=this.isoConfig||this.configureIsometricScene();
    const depth=this.depthForY(y);
    return baseScale*(config.minScale+(config.maxScale-config.minScale)*depth);
  }

  enforceBillboardLayer(){
    const layer=this.combatLayer;
    if(!layer)return;
    // Do not inherit an isometric floor projection here. The map obtains its
    // diamond shape from gridToScreen(), while character/card art stays
    // upright in screen space. Parent stage camera FX remain untouched.
    if(layer.rotation!==0)layer.rotation=0;
    if(layer.skew.x!==0||layer.skew.y!==0)layer.skew.set(0,0);
    if(layer.scale.x!==1||layer.scale.y!==1)layer.scale.set(1,1);
  }

  layoutCharacterGrid(){
    const apply=(character,formation)=>{
      const point=this.gridToScreen(formation.gridX,formation.gridY);
      const responsiveBase=formation.baseScale*(this.mobile ? .84 : 1);
      const scale=this.perspectiveScale(responsiveBase,point.y);
      character.gridPosition={x:formation.gridX,y:formation.gridY};
      character.designScale=responsiveBase;
      character.perspectiveResolver=y=>this.perspectiveScale(responsiveBase,y);
      character.setFormation(point.x,point.y,scale);
      character.setCompactHud?.(this.mobile);
      character.updatePerspective(this.depthForY(point.y));
      character.root.depthSortY=point.y;
    };
    this.allies.forEach((character,index)=>apply(character,ISO_FORMATIONS.allies[index]));
    this.enemies.forEach((character,index)=>apply(character,ISO_FORMATIONS.enemies[index]));
    this.layoutAccountBattleUnit();
    this.layoutObjective();
  }

  layoutAccountBattleUnit(){
    if(!this.accountBattleUnit)return;
    const formation=this.accountBattleUnitFormation();
    const point=this.gridToScreen(formation.gridX,formation.gridY);
    const responsiveBase=formation.baseScale*(this.mobile ? .86 : 1);
    const scale=this.perspectiveScale(responsiveBase,point.y);
    this.accountBattleUnit.setFormation(point.x,point.y,scale);
    this.accountBattleUnit.root.depthSortY=point.y;
  }

  layoutObjective(){
    if(!this.objectiveSprite||!this.objectiveData)return;
    const point=this.gridToScreen(2,5),targetHeight=this.mobile?152:178;
    const textureHeight=Math.max(1,Number(this.objectiveSprite.texture?.height||1));
    const scale=targetHeight/textureHeight;
    this.objectiveSprite.position.set(point.x+(this.mobile?34:18),point.y+(this.mobile?25:18));
    this.objectiveSprite.scale.set(scale);
    this.objectiveSprite.depthSortY=this.objectiveSprite.y-2;
  }

  createObjectiveHud(){
    if(this.objectiveHud)return this.objectiveHud;
    const hud=new Container({label:'EscortObjectiveHud'});
    hud.visible=false;
    hud.zIndex=2400;

    const glow=rectangle(420,96,0x22d8f1,.13,9);
    glow.filters=[new BlurFilter({strength:18,quality:2})];
    const panel=rectangle(420,96,0x020910,.93,7,{width:1,color:0x52e6ff,alpha:.42});
    const edge=rectangle(4,96,0x42dff5,1,2);
    const cap=new Graphics().moveTo(300,0).lineTo(420,0).lineTo(420,18).stroke({width:2,color:0x42dff5,alpha:.72});
    const eyebrow=textNode('ESCORT OBJECTIVE · ABSOLUTE PRIORITY',10,0x6de8f5,'900');
    eyebrow.position.set(18,12);
    const value=textNode('장갑 수송차 0 / 0',18,0xf3f8fa,'900');
    value.position.set(18,31);
    const percentLabel=textNode('100%',14,0x75f1d0,'900','right');
    percentLabel.anchor.set(1,0);percentLabel.position.set(400,34);
    const track=rectangle(382,7,0x102733,1,4);
    track.position.set(18,61);
    const barGlow=rectangle(382,7,0x54e6cb,.45,4);
    barGlow.position.set(18,61);barGlow.filters=[new BlurFilter({strength:8,quality:1})];
    const fill=rectangle(382,7,0x54e6cb,1,4);
    fill.position.set(18,61);
    const status=textNode('MONSTER TARGET LOCK · FORCED ATTACK',10,0xffbd63,'800');
    status.position.set(18,76);

    hud.addChild(glow,panel,edge,cap,eyebrow,value,percentLabel,track,barGlow,fill,status);
    hud.valueText=value;
    hud.percentText=percentLabel;
    hud.statusText=status;
    hud.barFill=fill;
    hud.barGlow=barGlow;
    hud.glow=glow;
    hud.hpRatio=1;
    this.uiLayer.addChild(hud);
    this.objectiveHud=hud;
    this.layoutObjectiveHud();
    return hud;
  }

  layoutObjectiveHud(){
    if(!this.objectiveHud)return;
    if(this.mobile){
      this.objectiveHud.position.set(30,270);
      this.objectiveHud.scale.set(1.48);
    }else{
      this.objectiveHud.position.set(30,112);
      this.objectiveHud.scale.set(1);
    }
  }

  syncObjectiveHud({hp,maxHp,status='',animate=true}={}){
    const safeMax=Math.max(1,Number(maxHp||this.objectiveData?.maxHp||1));
    const safeHp=clamp(Number(hp??this.objectiveData?.hp??safeMax)||0,0,safeMax);
    const ratio=clamp(safeHp/safeMax,0,1);
    const hud=this.objectiveHud||this.createObjectiveHud();
    hud.visible=Boolean(this.objectiveData);
    hud.valueText.text=`장갑 수송차 ${Math.round(safeHp).toLocaleString()} / ${Math.round(safeMax).toLocaleString()}`;
    hud.percentText.text=`${Math.round(ratio*100)}%`;
    hud.statusText.text=status||'MONSTER TARGET LOCK · FORCED ATTACK';
    const danger=ratio<=.3,warning=!danger&&ratio<=.6;
    hud.barFill.tint=hud.barGlow.tint=danger?0xff526b:warning?0xffbd4e:0xffffff;
    hud.percentText.tint=danger?0xff7184:warning?0xffd06b:0xffffff;
    hud.statusText.tint=status.includes('RECOVERY')?0x72ffc3:status.includes('IMPACT')?0xff7184:0xffffff;
    gsap.killTweensOf(hud.barFill.scale);
    gsap.killTweensOf(hud.barGlow.scale);
    if(animate&&!this.reducedMotion){
      gsap.to(hud.barFill.scale,{x:ratio,duration:.24/PLAYBACK_SPEED,ease:'power2.out'});
      gsap.to(hud.barGlow.scale,{x:ratio,duration:.24/PLAYBACK_SPEED,ease:'power2.out'});
    }else{
      hud.barFill.scale.x=ratio;
      hud.barGlow.scale.x=ratio;
    }
    hud.hpRatio=ratio;

    // 혼합 캐시 상태의 구형 호송 셸도 같은 서버 수치로 보정한다.
    const dom=this.host?.closest?.('.battle-v3-live-shell')?.querySelector?.('.escort-v3-objective-hud')||document.querySelector('.escort-v3-objective-hud');
    if(dom){
      const label=dom.querySelector('b'),bar=dom.querySelector('i u'),state=dom.querySelector('span');
      if(label)label.textContent=`장갑 수송차 ${Math.round(safeHp).toLocaleString()} / ${Math.round(safeMax).toLocaleString()}`;
      if(bar)bar.style.width=`${ratio*100}%`;
      if(state&&status)state.textContent=status;
    }
    return {hp:safeHp,maxHp:safeMax,ratio};
  }

  async setObjective(payload={}){
    const objective=payload?.objective&&typeof payload.objective==='object'?payload.objective:null;
    const source=rootAssetPath(objective?.image||objective?.imageUrl||'');
    this.objectiveData=objective;
    if(objective){
      this.syncObjectiveHud({hp:objective.hp??objective.hpBefore??objective.maxHp,maxHp:objective.maxHp,status:'MONSTER TARGET LOCK · FORCED ATTACK',animate:false});
    }else if(this.objectiveHud)this.objectiveHud.visible=false;
    if(!source){if(this.objectiveSprite)this.objectiveSprite.visible=false;return null}
    try{
      const texture=await Assets.load(source);
      if(!this.objectiveSprite){
        this.objectiveSprite=new Sprite(texture);
        this.objectiveSprite.label='EscortObjective';
        this.objectiveSprite.anchor.set(.5,.88);
        this.objectiveSprite.eventMode='none';
        this.combatLayer.addChild(this.objectiveSprite);
      }else this.objectiveSprite.texture=texture;
      this.objectiveSprite.visible=true;
      this.objectiveSprite.alpha=.9;
      this.layoutObjective();
      return this.objectiveSprite;
    }catch(error){
      console.warn('[Project V V3] 호송 목표 오브젝트 로드 실패',error);
      if(this.objectiveSprite)this.objectiveSprite.visible=false;
      return null;
    }
  }

  sortCombatDepth(){
    if(!this.combatLayer)return;
    this.enforceBillboardLayer();
    this.characters.forEach(character=>{
      const depth=this.depthForY(character.root.y);
      character.root.depthSortY=character.root.y;
      character.updatePerspective(depth);
      if(character.state===CHARACTER_STATE.IDLE&&!this.playing){
        const scale=character.getPerspectiveScale(character.root.y);
        character.restScale=scale;
        character.root.restScale=scale;
        character.root.scale.set(scale);
      }
    });
    if(this.accountBattleUnit?.active){
      // The auxiliary unit keeps its station; only its body/weapon attachment
      // performs idle recoil. Depth sorting therefore reads, but never writes,
      // the fixed root position.
      this.accountBattleUnit.root.depthSortY=this.accountBattleUnit.root.y;
    }
    this.combatLayer.children.sort((a,b)=>{
      const priority=node=>{
        if(node.depthSortY===-100000)return -100000;
        if(node.depthSortY===100000)return 100000;
        const raised=Number(node.zIndex)>=900?1000000:0;
        return raised+Number(node.depthSortY??node.y??0);
      };
      return priority(a)-priority(b);
    });
  }

  async createCharacters(){
    const definitions=[
      {id:'ALLY-01',name:'FAKER',team:TEAM.ALLY,texture:this.textures.fakerArt,fullBodyTexture:this.textures.fakerSprite,cutInTexture:this.textures.fakerArt,accent:0xff394f,hp:100},
      {id:'ALLY-02',name:'김택용',team:TEAM.ALLY,texture:this.textures.taekArt,fullBodyTexture:this.textures.taekSprite,cutInTexture:this.textures.taekArt,accent:0xffca58,hp:100},
      {id:'ALLY-03',name:'쁠리',team:TEAM.ALLY,texture:this.textures.zenithArt,fullBodyTexture:this.textures.ppliSprite,cutInTexture:this.textures.zenithArt,accent:0x78a9ff,hp:100},
      {id:'ALLY-04',name:'비키니 아윤',team:TEAM.ALLY,texture:this.textures.ayoonArt,fullBodyTexture:this.textures.ayoonSprite,cutInTexture:this.textures.ayoonArt,accent:0x5de9ff,hp:100},
      {id:'ALLY-05',name:'프로필찍는 봉준',team:TEAM.ALLY,texture:this.textures.bongArt,fullBodyTexture:this.textures.bongSprite,cutInTexture:this.textures.bongArt,accent:0x5bdcff,hp:100},
      {id:'ENEMY-01',name:'어둠 슬라임',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:250,cutInTexture:this.textures.slimeSprite,accent:0xb267ff,spriteTint:0xcab0ff,hp:100},
      {id:'ENEMY-02',name:'심연 슬라임',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:285,cutInTexture:this.textures.slimeSprite,accent:0xff496f,spriteTint:0xff83a2,hp:this.bossHp},
      {id:'ENEMY-03',name:'왕관 슬라임',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:245,cutInTexture:this.textures.slimeSprite,accent:0x53dfff,spriteTint:0x90eaff,hp:100},
      {id:'ENEMY-04',name:'결투 상대 4',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:250,cutInTexture:this.textures.slimeSprite,accent:0xffa052,hp:100},
      {id:'ENEMY-05',name:'결투 상대 5',team:TEAM.ENEMY,texture:this.textures.slimeSprite,fullBodyTexture:this.textures.slimeSprite,fullBodyHeight:250,cutInTexture:this.textures.slimeSprite,accent:0xd67cff,hp:100}
    ];
    this.characters=definitions.map(definition=>{
      const character=new BattleCharacter({...definition,x:0,y:0,scale:.55});
      if(definition.spriteTint)character.setTint(definition.spriteTint);
      return character;
    });
    this.allies=this.characters.filter(character=>character.team===TEAM.ALLY);
    this.enemies=this.characters.filter(character=>character.team===TEAM.ENEMY);
    this.allies.forEach((character,index)=>assignCombatRole(character,CARD_DATA[index]));
    this.enemies.forEach(character=>assignCombatRole(character,{type:'ATTACK'}));
    this.characters.forEach(character=>{
      character.root.alpha=0;
      this.combatLayer.addChild(character.root);
    });
    this.combatLayer.sortChildren();
    if(this.battleData)await this.setBattlePayload(this.battleData);
  }

  ensureAccountBattleUnit(){
    if(this.accountBattleUnit)return this.accountBattleUnit;
    this.accountBattleUnit=new AccountBattleUnit({effectLayer:this.effectLayer});
    this.combatLayer.addChild(this.accountBattleUnit.root);
    this.layoutAccountBattleUnit();
    this.sortCombatDepth();
    return this.accountBattleUnit;
  }

  rememberPendingLiveAsset(url,resource){
    if(url&&this.pendingLiveAssets instanceof Map)this.pendingLiveAssets.set(url,resource||null);
    return resource;
  }

  async configureAccountBattleUnit(payload){
    const battleSuit=publicEquipmentObject(payload,'equippedBattleSuit');
    const weapon=publicEquipmentObject(payload,'equippedWeapon');
    const pveAllowed=isAccountBattleUnitPvePayload(payload);
    const authoredProfile=pveAllowed
      ?resolveAccountBattleSuitAnimation(equipmentCode(battleSuit),equipmentCode(weapon))
      :null;
    const suitSource=appearanceUrl(battleSuit);
    const weaponSource=weaponAppearanceUrl(weapon);
    const eligible=pveAllowed&&Boolean(battleSuit&&(authoredProfile||suitSource));
    this.accountBattleUnitEquipment={battleSuit,weapon};
    this.accountBattleUnitEnabled=false;
    this.syncAccountBattleUnitTile();
    if(!eligible){
      this.accountBattleUnit?.clearAppearance();
      this.accountBattleUnit?.setName('');
      return false;
    }

    const unit=this.ensureAccountBattleUnit();
    const suitAppearance=appearanceObject(battleSuit)||{};
    const weaponAppearance=appearanceObject(weapon)||{};
    if(authoredProfile){
      try{
        const sheetTexture=await Assets.load(authoredProfile.sheetUrl);
        this.rememberPendingLiveAsset(authoredProfile.sheetUrl,sheetTexture);
        const configured=unit.setAuthoredSheet(sheetTexture,authoredProfile,{
          height:suitAppearance.battleHeight||suitAppearance.renderHeight||278,
          scaleMultiplier:(suitAppearance.scaleMultiplier||1)*(authoredProfile.scaleMultiplier||1),
          source:authoredProfile.sheetUrl
        });
        if(!configured)throw new Error('ACCOUNT_BATTLE_SUIT_AUTHORED_ATLAS_INVALID');
        unit.setName(accountNickname(payload));
        this.accountBattleUnitEnabled=unit.setActive(true,{deployed:false});
        this.syncAccountBattleUnitTile();
        if(!this.visible)unit.stopIdle();
        this.layoutAccountBattleUnit();
        this.sortCombatDepth();
        return this.accountBattleUnitEnabled;
      }catch(error){
        console.warn('[Project V V3] PVE 배틀슈트 authored atlas 로드 실패; 정지 본체와 분리 무기로 복구합니다.',error);
      }
    }
    if(!suitSource){
      unit.clearAppearance();
      unit.setName('');
      return false;
    }
    let bodyTexture=null;
    try{bodyTexture=await Assets.load(suitSource)}catch(error){
      console.warn('[Project V V3] PVE 배틀슈트 외형 로드 실패',error);
      unit.clearAppearance();
      unit.setName('');
      return false;
    }
    this.rememberPendingLiveAsset(suitSource,bodyTexture);
    unit.setBody(bodyTexture,{
      height:suitAppearance.battleHeight||suitAppearance.renderHeight||278,
      scaleMultiplier:suitAppearance.scaleMultiplier||1,
      source:suitSource
    });
    unit.setName(accountNickname(payload));

    if(weapon&&weaponSource){
      try{
        const weaponTexture=await Assets.load(weaponSource);
        this.rememberPendingLiveAsset(weaponSource,weaponTexture);
        unit.setWeapon(weaponTexture,{
          ...weaponAppearance,
          attachment:weaponAppearance.attachment||weapon?.attachment||weaponAppearance,
          source:weaponSource
        });
      }catch(error){
        console.warn('[Project V V3] PVE 계정 무기 외형 로드 실패; 배틀슈트 본체만 유지합니다.',error);
        unit.setWeapon(Texture.EMPTY);
      }
    }else unit.setWeapon(Texture.EMPTY);

    this.accountBattleUnitEnabled=unit.setActive(true,{deployed:false});
    this.syncAccountBattleUnitTile();
    if(!this.visible)unit.stopIdle();
    this.layoutAccountBattleUnit();
    this.sortCombatDepth();
    return this.accountBattleUnitEnabled;
  }

  isAccountBattleUnitDamageEvent(event){
    if(!this.accountBattleUnitEnabled||!this.accountBattleUnit?.active)return false;
    const type=String(event?.type||'').trim().toUpperCase();
    if(type!=='TURN'&&type!=='ATTACK')return false;
    const actorKind=String(event?.actorKind||event?.damageSource||'').trim().toUpperCase();
    const actorId=String(event?.actorId||'').trim().toUpperCase();
    return actorKind==='BATTLE_SUIT'||actorKind==='BATTLE_SUIT_INDEPENDENT'||actorId.includes(':BATTLE_SUIT:');
  }

  setAccountBattleUnitPreviewFireHook(handler){
    this.accountBattleUnitPreviewFireHook=typeof handler==='function'?handler:null;
    return Boolean(this.accountBattleUnitPreviewFireHook);
  }

  clearAccountBattleUnitHitReactions(){
    for(const [victim,reaction] of this.accountBattleUnitHitReactions){
      clearTimeout(reaction.timer);
      reaction.flash?.release?.();
      if(victim?.state===CHARACTER_STATE.HIT){
        victim.setState(victim.hp<=0?CHARACTER_STATE.DEAD:CHARACTER_STATE.IDLE);
      }
    }
    this.accountBattleUnitHitReactions.clear();
  }

  triggerAccountBattleUnitBallisticHit(victim,profile={},playbackRate=1){
    if(!victim?.root)return;
    const prior=this.accountBattleUnitHitReactions.get(victim);
    if(prior){
      clearTimeout(prior.timer);
      prior.flash?.release?.();
      this.accountBattleUnitHitReactions.delete(victim);
    }
    const speed=clamp(Number(playbackRate)||1,.5,3);
    const flash=triggerWhiteFlash(victim,{durationMs:Math.max(24,Math.round((Number(profile.hitFlashMs)||62)/speed))});
    if(victim.hp>0)victim.setState(CHARACTER_STATE.HIT);
    const epoch=this.playbackEpoch;
    const timer=setTimeout(()=>{
      flash.release?.();
      this.accountBattleUnitHitReactions.delete(victim);
      if(epoch===this.playbackEpoch&&victim.state===CHARACTER_STATE.HIT){
        victim.setState(victim.hp<=0?CHARACTER_STATE.DEAD:CHARACTER_STATE.IDLE);
      }
    },Math.max(80,Math.round((Number(profile.hitReactionMs)||205)/speed)));
    this.accountBattleUnitHitReactions.set(victim,{timer,flash});

    const now=performance.now();
    if(!this.reducedMotion&&now-this.lastAccountBattleUnitCameraImpulse>95){
      this.lastAccountBattleUnitCameraImpulse=now;
      void this.timeline(timeline=>this.camera.addShake(timeline,{
        intensity:Number(profile.cameraShake)||3.2,
        duration:Number(profile.cameraShakeDuration)||.12,
        rotation:Number(profile.cameraRotation)||.0015,
        at:0
      }),()=>this.camera.reset(true),speed);
    }
  }

  showAccountBattleUnitDamage(victim,{damage=0,critical=false,playbackRate=1}={}){
    const amount=Math.max(0,Number(damage)||0);
    if(!victim?.root||!amount)return false;
    const damageLabel=this.pools.damage.acquire();
    const victimView=victim.root;
    configureDamageText(damageLabel,{kind:SKILL_EFFECT_KIND.ATTACK,damage:amount,critical:Boolean(critical),healing:0,hitCount:1,compact:this.mobile});
    damageLabel.position.set(victimView.x,victimView.y-330);
    damageLabel.visible=true;
    this.uiLayer.addChild(damageLabel);
    void this.timeline(timeline=>{
      timeline.fromTo(damageLabel,{alpha:0,y:victimView.y-320},{alpha:1,y:victimView.y-366,duration:.16,ease:'back.out(2.2)'},0);
      timeline.fromTo(damageLabel.scale,{x:.5,y:.5},{x:1.05,y:1.05,duration:.18,ease:'back.out(2.2)'},0);
      timeline.to(damageLabel,{alpha:0,y:victimView.y-402,duration:.24,ease:'power2.in'},.24);
    },()=>this.pools.damage.release(damageLabel),Math.max(.5,Number(playbackRate)||1)*PLAYBACK_SPEED);
    return true;
  }

  async playAccountBattleUnitShot(target=null,{playbackRate=1,damage=0,critical=false,targetHp=null,targetShield=null,authoritative=false}={}){
    const unit=this.accountBattleUnit;
    if(!this.visible||!this.accountBattleUnitEnabled||!unit?.active)return false;
    // Preserve the just-resolved authoritative target even when that hit set
    // its HP to zero. Retargeting here would make the cosmetic tracer fly at
    // a different enemy than the card action it visually follows.
    const victim=target?.root?target:this.enemies.find(character=>this.isAlive(character));
    if(!victim)return false;
    const previewRun=this.accountBattleUnitFireRun;
    const previewHook=previewRun?.active?this.accountBattleUnitPreviewFireHook:null;
    const weaponCode=this.accountBattleUnitSustainedFireProfile().weaponCode;
    // Cold production caches can spend hundreds of milliseconds decoding the
    // Pixi muzzle/tracer atlases. Finish that work before scheduling WebAudio;
    // otherwise the recorded impact plays while the first visual shot is still
    // waiting on textures and can be perceived as missing or detached audio.
    if(!await unit.prepareRangedFireEffects())return false;
    const visualLeadMs=unit.hasAuthoredAnimation()
      ?Math.max(0,Number(unit.authoredProfile?.durationsMs?.ready)||45)/Math.max(.5,Number(playbackRate)||1)
      :0;
    let previewPlan=null;
    if(previewHook){
      try{previewPlan=await previewHook({
        phase:'anticipation',weaponCode,visualLeadMs,playbackRate,
        isCancelled:()=>!previewRun.active||this.accountBattleUnitFireRun!==previewRun
      })}
      catch(error){console.warn('[Project V V3] preview sustained-fire audio anticipation failed',error)}
      // stop() can arrive while the preview hook is fetching/decoding its first
      // recording. Do not let that late continuation begin a visual shot after
      // the sustained run was cancelled or replaced.
      if(!previewRun.active||this.accountBattleUnitFireRun!==previewRun)return false;
    }
    const originalApply=unit.applyAuthoredFrame;
    let fireNotified=false;
    const notifyPreviewFire=()=>{
      if(!previewHook||fireNotified)return;
      fireNotified=true;
      try{
        const result=previewHook({phase:'fire',weaponCode,visualLeadMs,playbackRate,plan:previewPlan,at:performance.now()});
        result?.catch?.(error=>console.warn('[Project V V3] preview sustained-fire audio callback failed',error));
      }catch(error){console.warn('[Project V V3] preview sustained-fire audio callback failed',error)}
    };
    const wrappedApply=function(name,...args){
      const result=originalApply.call(this,name,...args);
      if(name==='fire')notifyPreviewFire();
      return result;
    };
    if(previewHook&&unit.hasAuthoredAnimation())unit.applyAuthoredFrame=wrappedApply;
    let played=false;
    try{
      if(previewHook&&!unit.hasAuthoredAnimation())notifyPreviewFire();
      played=await unit.playRangedFire({
        targetX:victim.root.x,
        targetY:victim.root.y-90,
        weaponCode,
        onImpact:({profile})=>{
          this.triggerAccountBattleUnitBallisticHit(victim,profile,playbackRate);
          if(authoritative){
            if(hasFiniteNumber(targetHp))this.syncTargetHp(victim,Number(targetHp));
            if(hasFiniteNumber(targetShield))this.syncTargetShield(victim,Number(targetShield));
            this.showAccountBattleUnitDamage(victim,{damage,critical,playbackRate});
            this.accountBattleUnitDamageEventCount+=1;
            this.accountBattleUnitDamageTotal+=Math.max(0,Number(damage)||0);
            this.updateStatus(`배틀슈트 독립 타격 · ${Math.round(Math.max(0,Number(damage)||0)).toLocaleString()}`);
          }
        },
        playbackRate
      });
    }finally{
      if(unit.applyAuthoredFrame===wrappedApply)unit.applyAuthoredFrame=originalApply;
    }
    if(played)this.accountBattleUnitShotCount+=1;
    return played;
  }

  playAccountBattleUnitCosmeticShot(target=null,{playbackRate=1}={}){
    return this.playAccountBattleUnitShot(target,{playbackRate,authoritative:false});
  }

  queueAccountBattleUnitDamageShot(target=null,options={}){
    const run=this.accountBattleUnitFireRun;
    if(!run?.active)return this.playAccountBattleUnitShot(target,options);
    this.accountBattleUnitDamageQueue??=[];
    return new Promise((resolve,reject)=>{
      this.accountBattleUnitDamageQueue.push({target,options:{...options},resolve,reject});
    });
  }

  settleAccountBattleUnitDamageQueue(value=false){
    const queue=Array.isArray(this.accountBattleUnitDamageQueue)?this.accountBattleUnitDamageQueue.splice(0):[];
    queue.forEach(entry=>entry.resolve?.(value));
    return queue.length;
  }

  accountBattleUnitSustainedFireProfile(){
    const weaponCode=equipmentCode(this.accountBattleUnitEquipment?.weapon);
    return {
      weaponCode,
      ...(ACCOUNT_BATTLE_UNIT_SUSTAINED_FIRE_PROFILES[weaponCode]||ACCOUNT_BATTLE_UNIT_SUSTAINED_FIRE_PROFILES.DEFAULT)
    };
  }

  accountBattleUnitSustainedTarget(){
    if(this.currentEnemyTarget&&this.isAlive(this.currentEnemyTarget))return this.currentEnemyTarget;
    return this.enemies.find(character=>this.isAlive(character))||null;
  }

  waitForAccountBattleUnitFire(ms,run){
    if(!run?.active||this.accountBattleUnitFireRun!==run)return Promise.resolve(false);
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{
        if(settled)return;
        settled=true;
        if(run.timer){clearTimeout(run.timer);run.timer=0}
        if(run.wake===wake)run.wake=null;
        resolve(value);
      };
      const wake=()=>finish(false);
      run.wake=wake;
      run.timer=setTimeout(()=>finish(true),Math.max(0,Number(ms)||0));
    });
  }

  startAccountBattleUnitSustainedFire(){
    this.stopAccountBattleUnitSustainedFire();
    const unit=this.accountBattleUnit;
    // Live battle playback is owned by battle-v3-live.js and does not toggle the
    // preview-only `playing` flag. Sustained fire is therefore scoped by the
    // visible PVE support unit and its explicit run lifetime, never by card turns
    // or the five-card action gauge.
    if(!this.visible||!this.accountBattleUnitEnabled||!unit?.active)return null;
    const profile=this.accountBattleUnitSustainedFireProfile();
    const run={active:true,profile,shots:0,roundInBurst:0,timer:0,wake:null,promise:null};
    this.accountBattleUnitFireRun=run;
    run.promise=(async()=>{
      try{
        while(run.active&&this.visible&&this.accountBattleUnitEnabled&&unit.active){
          const pending=this.accountBattleUnitDamageQueue?.[0]||null;
          const target=pending?.target?.root?pending.target:this.accountBattleUnitSustainedTarget();
          if(!target){
            if(!await this.waitForAccountBattleUnitFire(120,run))break;
            continue;
          }
          if(pending)this.accountBattleUnitDamageQueue.shift();
          let played=false;
          try{
            played=await this.playAccountBattleUnitShot(target,{
              ...(pending?.options||{}),
              playbackRate:profile.playbackRate,
              authoritative:Boolean(pending?.options?.authoritative)
            });
            pending?.resolve?.(played);
          }catch(error){
            pending?.reject?.(error);
            throw error;
          }
          if(!run.active||this.accountBattleUnitFireRun!==run)break;
          if(!played)break;
          run.shots+=1;
          this.accountBattleUnitSustainedShotCount+=1;
          run.roundInBurst=(run.roundInBurst+1)%profile.roundsPerBurst;
          const delay=run.roundInBurst===0?profile.burstDelayMs:profile.intraBurstDelayMs;
          if(!await this.waitForAccountBattleUnitFire(delay,run))break;
        }
      }finally{
        run.active=false;
        if(run.timer){clearTimeout(run.timer);run.timer=0}
        run.wake=null;
        this.settleAccountBattleUnitDamageQueue(false);
        if(this.accountBattleUnitFireRun===run)this.accountBattleUnitFireRun=null;
      }
      return run.shots;
    })();
    return run;
  }

  stopAccountBattleUnitSustainedFire(){
    const run=this.accountBattleUnitFireRun;
    if(!run)return Promise.resolve(0);
    run.active=false;
    if(run.timer){clearTimeout(run.timer);run.timer=0}
    const wake=run.wake;
    run.wake=null;
    wake?.();
    this.accountBattleUnit?.cancelFire();
    this.settleAccountBattleUnitDamageQueue(false);
    return run.promise||Promise.resolve(run.shots||0);
  }

  monsterFromPayload(payload){
    if(payload?.monster)return payload.monster;
    if(payload?.floor)return {
      id:payload.floor.monsterId,
      monsterId:payload.floor.monsterId,
      name:payload.floor.monsterName,
      image:payload.floor.monsterImage,
      mode:'TOWER'
    };
    const cards=payload?.battleV2?.teams?.B?.cards;
    return Array.isArray(cards)
      ?cards.find(card=>/^MONSTER:/i.test(String(card?.cardId||''))||String(card?.grade||'').toUpperCase()==='MONSTER')||null
      :null;
  }

  // V1901: Pixi 의 Assets 캐시는 URL 단위 영구 보관이고, 이 앱은 SPA/PWA 라
  // 페이지가 새로고침되지 않는다. 게다가 battle-v3-live.js 가 __V3_PIXI_MOUNTED 로
  // Application 을 계속 살려 두고 renderer.destroy() 는 setVisible(false) 만 한다.
  // 그래서 지금까지 한 세션 동안 싸운 모든 카드·몬스터 텍스처가 전부 남았다.
  // 무한의탑/자동전투처럼 판을 반복하면 이 누적만으로 모바일 렌더러가 죽는다.
  //
  // 해결: 이번 판이 쓰는 URL→Texture 를 기억해 두고, 다음 판 텍스처를 "전부 배치한 뒤"
  //       더 이상 참조되지 않는 지난 판 URL 만 unload 한다.
  //       번들 정적 자산(ASSETS/BUNDLE)과 전장 배경은 애초에 추적하지 않으므로 절대 안 지운다.
  async trackLiveAssetPreload(preloadUrls,artEntries=[]){
    const unique=[...new Set(preloadUrls)].filter(Boolean);
    const settled=await Promise.allSettled(unique.map(url=>Assets.load(url)));
    const pending=new Map();
    unique.forEach((url,index)=>{
      pending.set(url,settled[index].status==='fulfilled'?settled[index].value:null);
    });
    // loadBattleArtTexture 가 디코딩 실패 시 받아 오는 PNG 폴백도 "쓰는 중"으로 본다.
    artEntries.forEach(art=>{
      const fallback=art?.pngFallbackUrl;
      if(fallback&&!pending.has(fallback))pending.set(fallback,null);
    });
    this.pendingLiveAssets=pending;
    return pending;
  }

  async releaseStaleLiveAssets(){
    const pending=this.pendingLiveAssets;
    if(!pending)return 0;                      // preload 전에 빠져나간 호출은 건너뛴다
    this.pendingLiveAssets=null;
    const previous=this.liveAssets||new Map();
    this.liveAssets=pending;
    const stale=[],staleTextures=new Set();
    previous.forEach((texture,url)=>{
      if(pending.has(url))return;
      stale.push(url);
      if(texture)staleTextures.add(texture);
    });
    if(!stale.length)return 0;
    // 파괴된 텍스처가 스프라이트에 물려 있으면 다음 프레임에서 렌더가 통째로 실패한다
    // (= 지금 제보된 흰 화면). unload 전에 남은 참조를 반드시 끊는다.
    this.characters.forEach(character=>{
      if(character.texture&&staleTextures.has(character.texture))character.texture=Texture.EMPTY;
      if(character.cutInTexture&&staleTextures.has(character.cutInTexture))character.cutInTexture=null;
      const sprite=character.fullBodySprite;
      if(sprite?.texture&&staleTextures.has(sprite.texture))sprite.texture=Texture.EMPTY;
    });
    if(this.accountBattleUnit){
      const bodyStale=stale.some(url=>this.accountBattleUnit.usesBodyAsset?.(url))
        ||staleTextures.has(this.accountBattleUnit.bodySprite?.texture);
      const weaponStale=stale.some(url=>this.accountBattleUnit.usesWeaponAsset?.(url))
        ||staleTextures.has(this.accountBattleUnit.weaponSprite?.texture);
      if(bodyStale)this.accountBattleUnit.clearAppearance();
      else if(weaponStale)this.accountBattleUnit.setWeapon(Texture.EMPTY);
    }
    if(this.objectiveSprite?.texture&&staleTextures.has(this.objectiveSprite.texture)){
      this.objectiveSprite.texture=Texture.EMPTY;
      this.objectiveSprite.visible=false;
    }
    try{await Assets.unload(stale)}catch(error){
      console.warn('[Project V V3] 지난 판 텍스처 회수 실패',error);
    }
    return stale.length;
  }

  async setBattlePayload(payload){
    try{
      return await this.applyBattlePayload(payload);
    }finally{
      try{await this.releaseStaleLiveAssets()}catch(error){
        console.warn('[Project V V3] 텍스처 회수 예외',error);
      }
    }
  }

  async applyBattlePayload(payload){
    this.battleData=payload;
    this.livePayload=Boolean(payload?.battleV2);
    this.liveDeployed=false;
    this.accountBattleUnitDamageEventCount=0;
    this.accountBattleUnitDamageTotal=0;
    this.cards.forEach(card=>{
      card.visible=!this.livePayload;
      card.renderable=!this.livePayload;
      card.eventMode=this.livePayload?'none':'static';
      if(this.livePayload)card.alpha=0;
    });
    this.activeBattlefieldMode=battlefieldModeFromPayload(payload);
    this.activeBattlefieldAsset=BATTLEFIELD_ASSETS[this.activeBattlefieldMode];
    if(this.mounted)await Promise.all([this.setBattlefield(this.activeBattlefieldMode),this.setObjective(payload)]);
    const adapter=globalThis.ProjectVMonsterBattleArt;
    const zenithAdapter=globalThis.ProjectVBattleArt;
    const tierAdapter=globalThis.ProjectVTierBattleArt;
    const fallback=globalThis.ProjectVUnassignedBattleFallback;
    if(!this.mounted&&!this.enemies.length)return null;
    await Promise.allSettled([
      adapter?.ready?.(),
      zenithAdapter?.ready?.(),
      tierAdapter?.ready?.(),
      fallback?.ready?.()
    ].filter(Boolean));
    this.activeFallbackArt=[];

    const allyCards=Array.isArray(payload?.battleV2?.teams?.A?.cards)?payload.battleV2.teams.A.cards:[];
    const enemyCards=Array.isArray(payload?.battleV2?.teams?.B?.cards)
      ?payload.battleV2.teams.B.cards.filter(card=>!/^MONSTER:/i.test(String(card?.cardId||''))&&!['MONSTER','BOSS'].includes(String(card?.grade||'').toUpperCase()))
      :[];
    await this.prepareAdvancementRuntime(payload);
    this.prepareApocalypseBossUltimateRuntime(payload);
    const resolveCardArt=(card,team)=>card?.projectVBattleArt
      ||zenithAdapter?.resolveForBattle?.(card,{consumer:'BATTLE_ENGINE'})
      ||tierAdapter?.resolveForV3?.(card)
      ||fallback?.resolveForV3({kind:'CARD',team});
    const allyArt=allyCards.map(card=>resolveCardArt(card,'ALLY'));
    const enemyArt=enemyCards.map(card=>resolveCardArt(card,'ENEMY'));
    const monster=this.monsterFromPayload(payload);
    const specificMonsterArt=adapter?.resolveForV3(monster,{mode:monster?.mode})||monster?.projectVMonsterArt||null;
    const monsterIsBoss=Boolean(monster?.isBoss||monster?.boss||specificMonsterArt?.isBoss);
    const monsterArt=monster?(specificMonsterArt||fallback?.resolveForV3({kind:'MONSTER',team:'ENEMY',isBoss:monsterIsBoss})):null;
    const battleSuit=publicEquipmentObject(payload,'equippedBattleSuit');
    const equippedWeapon=publicEquipmentObject(payload,'equippedWeapon');
    const accountPveAllowed=isAccountBattleUnitPvePayload(payload);
    const accountAnimation=accountPveAllowed
      ?resolveAccountBattleSuitAnimation(equipmentCode(battleSuit),equipmentCode(equippedWeapon))
      :null;
    const accountSuitUrl=accountPveAllowed?(accountAnimation?.sheetUrl||appearanceUrl(battleSuit)):'';
    const accountWeaponUrl=accountSuitUrl&&!accountAnimation?weaponAppearanceUrl(equippedWeapon):'';
    const preloadUrls=[];
    const queueCardAssets=(cards,artList)=>cards.forEach((card,index)=>{
      const art=artList[index];
      if(art?.primaryUrl)preloadUrls.push(art.primaryUrl);
      const sourceArt=originalCardArtUrl(card,art);
      if(sourceArt)preloadUrls.push(sourceArt);
    });
    queueCardAssets(allyCards,allyArt);
    queueCardAssets(enemyCards,enemyArt);
    if(monsterArt?.primaryUrl)preloadUrls.push(monsterArt.primaryUrl);
    if(accountSuitUrl)preloadUrls.push(accountSuitUrl);
    if(accountWeaponUrl)preloadUrls.push(accountWeaponUrl);
    // Pixi Assets de-duplicates identical URLs. Starting every live texture
    // request together removes the previous card-by-card network waterfall.
    await this.trackLiveAssetPreload(preloadUrls,[...allyArt,...enemyArt,monsterArt]);
    await this.configureAccountBattleUnit(payload);
    this.allies.forEach((character,index)=>{
      character.battleActive=allyCards.length?index<Math.min(allyCards.length,this.allies.length):true;
      character.root.visible=character.battleActive;
    });
    for(let index=0;index<Math.min(allyCards.length,this.allies.length);index+=1){
      const card=allyCards[index];
      const art=allyArt[index];
      const target=this.allies[index];
      assignCombatRole(target,card);
      const shield=openingShieldState(payload,card);
      target.startingShield=shield.current;
      target.startingMaxShield=shield.maximum;
      target.serverMaxShield=Math.max(shield.maximum,Number(card?.maxShield||card?.max_shield)||0);
      target.setShield(shield.current,shield.maximum);
      if(!art?.primaryUrl)continue;
      const texture=await loadBattleArtTexture(art);
      target.id=card?.id||card?.cardId||target.id;
      target.cardId=card?.cardId||card?.id||target.id;
      target.serverMaxHp=Math.max(1,Number(card?.maxHp||card?.hp||100));
      target.texture=texture;
      target.useFullBodySprite(texture,260*(art.scaleMultiplier||1));
      target.setTint(0xffffff);
      const sourceArt=originalCardArtUrl(card,art);
      if(sourceArt)try{target.cutInTexture=await Assets.load(sourceArt)}catch(error){
        console.warn(`[Project V V3] ${card?.cardId||target.id} 원본 카드 컷인 로드 실패; 기존 원본을 유지합니다.`,error);
      }
      target.name=card?.name||card?.title||target.name;
      if(target.nameLabel)target.nameLabel.text=target.name;
      target.root.projectVBattleArt=art;
      if(String(art.kind||'').startsWith('UNASSIGNED_'))this.activeFallbackArt.push(art);
    }

    this.enemies.forEach(character=>{character.battleActive=false;character.root.visible=false});
    for(let index=0;index<Math.min(enemyCards.length,this.enemies.length);index+=1){
      const card=enemyCards[index];
      const art=enemyArt[index];
      const target=this.enemies[index];
      assignCombatRole(target,card);
      const shield=openingShieldState(payload,card);
      target.startingShield=shield.current;
      target.startingMaxShield=shield.maximum;
      target.serverMaxShield=Math.max(shield.maximum,Number(card?.maxShield||card?.max_shield)||0);
      target.setShield(shield.current,shield.maximum);
      if(!art?.primaryUrl)continue;
      const texture=await loadBattleArtTexture(art);
      target.id=card?.id||card?.cardId||target.id;
      target.cardId=card?.cardId||card?.id||target.id;
      target.serverMaxHp=Math.max(1,Number(card?.maxHp||card?.hp||100));
      target.texture=texture;
      target.useFullBodySprite(texture,260*(art.scaleMultiplier||1));
      target.setTint(0xffffff);
      const sourceArt=originalCardArtUrl(card,art);
      if(sourceArt)try{target.cutInTexture=await Assets.load(sourceArt)}catch(error){
        console.warn(`[Project V V3] PVP ${target.id} 원본 카드 컷인 로드 실패; 기존 원본을 유지합니다.`,error);
      }
      target.name=card?.name||card?.title||target.name;
      if(target.nameLabel)target.nameLabel.text=target.name;
      target.root.projectVBattleArt=art;
      target.isBoss=false;
      target.battleActive=true;
      target.root.visible=true;
      if(String(art.kind||'').startsWith('UNASSIGNED_'))this.activeFallbackArt.push(art);
    }

    if(!monster&&enemyCards.length){
      this.currentEnemyTarget=this.enemies.find(character=>this.isAlive(character))||this.enemies[0]||null;
      this.boss=this.currentEnemyTarget;
      this.bossHp=this.boss?.hp??0;
      return this.currentEnemyTarget?.root?.projectVBattleArt||null;
    }
    const isBoss=monsterIsBoss;
    const art=monsterArt;
    if(!art)return null;
    const texture=await loadBattleArtTexture(art);
    const target=this.enemies[1]||this.enemies[0];
    if(!target)return null;
    target.battleActive=true;
    target.root.visible=true;
    const monsterCard=payload?.battleV2?.teams?.B?.cards?.find?.(card=>/^MONSTER:/i.test(String(card?.cardId||''))||String(card?.grade||'').toUpperCase()==='MONSTER'||String(card?.grade||'').toUpperCase()==='BOSS')||payload?.battleV2?.teams?.B?.cards?.[0];
    assignCombatRole(target,monsterCard||monster,{boss:isBoss});
    const shield=openingShieldState(payload,monsterCard||monster);
    target.startingShield=shield.current;
    target.startingMaxShield=shield.maximum;
    target.serverMaxShield=Math.max(shield.maximum,Number(monsterCard?.maxShield||monsterCard?.max_shield||monster?.maxShield||monster?.max_shield)||0);
    target.setShield(shield.current,shield.maximum);
    target.id=monsterCard?.id||monster?.cardId||monster?.id&&`MONSTER:${monster.id}`||monster?.monsterId&&`MONSTER:${monster.monsterId}`||target.id;
    target.cardId=monsterCard?.cardId||monster?.cardId||target.id;
    target.serverMaxHp=Math.max(1,Number(monsterCard?.maxHp||monsterCard?.hp||monster?.maxHp||monster?.hp||100));
    target.texture=texture;
    target.cutInTexture=texture;
    target.useFullBodySprite(texture,285*(art.scaleMultiplier||1));
    target.setTint(0xffffff);
    target.name=monster?.name||art.name;
    if(target.nameLabel)target.nameLabel.text=target.name;
    target.root.projectVMonsterArt=art;
    target.isBoss=isBoss;
    this.currentEnemyTarget=target;
    this.boss=target;
    this.bossHp=target.hp;
    if(String(art.kind||'').startsWith('UNASSIGNED_'))this.activeFallbackArt.push(art);
    this.activeMonsterArt=art;
    return art;
  }

  async prepareAdvancementRuntime(payload){
    const codes=advancementCodesFromPayload(payload);
    this.advancementCodes=new Set(codes);
    const warmCodes=LOW_MEMORY_DEVICE?[]:codes;
    await AdvancementEffectFX.retain(warmCodes);
    this.advancementReadyPromise=warmCodes.length
      ?Promise.all([
        AdvancementEffectFX.preloadMany(warmCodes),
        this.audio?.prepareAdvancements?.(warmCodes)??Promise.resolve(true)
      ]).then(()=>true).catch(error=>{
        console.error('[Project V V3] 전직 연출 백그라운드 준비 실패',error);
        return false;
      })
      :Promise.resolve(true);
    return codes;
  }

  async ensureAdvancementReady(value){
    const code=normalizeAdvancementEffectCode(value);
    if(!code)return false;
    // Streaming modes may append a server-authoritative event after the initial
    // payload snapshot. The caller has already matched the exact event/class
    // pair, so include that code without trusting card-side presentation data.
    this.advancementCodes.add(code);
    const load=(async()=>{
      await AdvancementEffectFX.retain(LOW_MEMORY_DEVICE?[code]:[...this.advancementCodes]);
      const [frames,audioReady]=await Promise.all([
        AdvancementEffectFX.preload(code),
        this.audio?.prepareAdvancements?.([code])??Promise.resolve(true)
      ]);
      return Array.isArray(frames)&&frames.length===12&&audioReady!==false;
    })().catch(error=>{
      console.error(`[Project V V3] ${code} 전직 연출 준비 실패`,error);
      return false;
    });
    let timer=0;
    const ready=await Promise.race([
      load,
      new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ADVANCEMENT_LOAD_DEADLINE_MS)})
    ]);
    clearTimeout(timer);
    if(!ready)this.advancementLoadTimeouts+=1;
    return ready;
  }

  prepareApocalypseBossUltimateRuntime(payload){
    this.apocalypseMode=isApocalypsePayload(payload);
    if(!this.apocalypseMode){
      this.apocalypseBossUltimateReadyPromise=Promise.resolve(false);
      this.audio?.releaseApocalypseBossUltimate?.();
      void ApocalypseBossUltimateFX.release();
      return false;
    }
    this.apocalypseBossUltimateReadyPromise=Promise.all([
      ApocalypseBossUltimateFX.preload(),
      this.audio?.prepareApocalypseBossUltimate?.()??Promise.resolve(true)
    ]).then(([frames,audioReady])=>Array.isArray(frames)&&frames.length===12&&audioReady!==false)
      .catch(error=>{
        console.error('[Project V V3] 아포칼립스 보스 궁극기 연출 준비 실패',error);
        return false;
      });
    return true;
  }

  async ensureApocalypseBossUltimateReady(){
    if(!this.apocalypseMode)return false;
    const load=Promise.all([
      this.apocalypseBossUltimateReadyPromise,
      ApocalypseBossUltimateFX.preload(),
      this.audio?.prepareApocalypseBossUltimate?.()??Promise.resolve(true)
    ]).then(([,frames,audioReady])=>Array.isArray(frames)&&frames.length===12&&audioReady!==false)
      .catch(()=>false);
    let timer=0;
    const ready=await Promise.race([
      load,
      new Promise(resolve=>{timer=setTimeout(()=>resolve(false),APOCALYPSE_FX_LOAD_DEADLINE_MS)})
    ]);
    clearTimeout(timer);
    if(!ready)this.apocalypseBossUltimateLoadTimeouts+=1;
    return ready;
  }

  async releaseOptionalAdvancementAssets(){
    this.advancementCodes.clear();
    this.advancementReadyPromise=Promise.resolve(false);
    this.audio?.releaseAdvancements?.();
    this.audio?.releaseApocalypseBossUltimate?.();
    await AdvancementEffectFX.retain([]);
    await ApocalypseBossUltimateFX.release();
    return true;
  }

  makeHpBar(parent,width,value,color=0x64e3a9){
    const shell=rectangle(width,12,0x03070b,.92,7,{width:1,color:0xffffff,alpha:.2});
    const fill=rectangle(Math.max(2,(width-4)*value/100),8,color,1,5);
    fill.position.set(2,2);
    parent.addChild(shell,fill);
    return {shell,fill,width:width-4,value};
  }

  setHp(bar,value,color){
    bar.value=clamp(value,0,100);
    bar.fill.width=Math.max(1,bar.width*bar.value/100);
    if(color)bar.fill.tint=color;
  }

  createCard(data,index){
    const card=new Container({label:`Card:${data.name}`});
    card.position.set(52+index*192,422+[16,6,-8,6,16][index]);
    card.baseX=card.x;
    card.baseY=card.y;
    card.restScale=CARD.scale;
    card.index=index;
    card.alpha=0;
    card.scale.set(CARD.scale);
    card.eventMode='static';
    card.cursor='pointer';
    card.data=data;
    card.depthSortY=100000;
    card.artTexture=this.textures[data.art];

    const aura=addGlow(card,CARD.width,CARD.height,data.color,.17);
    aura.alpha=.35;
    card.aura=aura;
    const shadow=rectangle(CARD.width+12,CARD.height+12,0x000000,.55,18);
    shadow.position.set(-6,8);
    card.addChild(shadow);
    card.addChild(rectangle(CARD.width,CARD.height,0x07101a,1,12));

    const aperture=cardAperture(data);
    const artHost=new Container();
    const art=new Sprite(card.artTexture);
    setCover(art,aperture.w,aperture.h);
    art.position.set(aperture.x+aperture.w/2,aperture.y+aperture.h/2);
    const mask=new Graphics().roundRect(aperture.x,aperture.y,aperture.w,aperture.h,aperture.radius).fill(0xffffff);
    artHost.addChild(art,mask);
    artHost.mask=mask;
    card.addChild(artHost);

    if(data.frame&&this.textures[data.frame]){
      const frame=new Sprite(this.textures[data.frame]);
      frame.width=CARD.width;
      frame.height=CARD.height;
      card.addChild(frame);
    }else{
      const frame=new Graphics()
        .roundRect(1,1,CARD.width-2,CARD.height-2,12)
        .stroke({width:3,color:data.color,alpha:.94});
      const inner=new Graphics()
        .roundRect(7,7,CARD.width-14,CARD.height-14,8)
        .stroke({width:1,color:0xffffff,alpha:.42});
      card.addChild(frame,inner);
    }

    if(data.logo){
      const logo=new Sprite(this.textures[data.logo]);
      logo.anchor.set(.5);
      logo.width=CARD.width*.22;
      logo.height=logo.texture.height/logo.texture.width*logo.width;
      logo.position.set(CARD.width*.5,CARD.height*.147);
      card.addChild(logo);
    }
    if(data.wordmark){
      const wordmark=new Sprite(this.textures[data.wordmark]);
      wordmark.anchor.set(.5);
      wordmark.width=CARD.width*.54;
      wordmark.height=wordmark.texture.height/wordmark.texture.width*wordmark.width;
      wordmark.position.set(CARD.width*.5,CARD.height*.884);
      card.addChild(wordmark);
    }

    const gradeWidth=data.grade==='PRESTIGE'?72:56;
    const gradePlate=rectangle(gradeWidth,22,0x04070c,.86,4,{width:1,color:data.color,alpha:.78});
    gradePlate.position.set(10,9);
    card.addChild(gradePlate);
    const grade=textNode(data.grade,data.grade==='PRESTIGE'?8:10,data.color,'900');
    grade.anchor.set(.5);
    grade.position.set(10+gradeWidth/2,20);
    card.addChild(grade);
    const level=textNode(`+${data.level}`,13,0xffffff,'900','right');
    level.anchor.set(1,0);
    level.position.set(CARD.width-10,11);
    card.addChild(level);

    if(!data.wordmark){
      const namePlate=rectangle(CARD.width-24,28,0x02050a,.84,4,{width:1,color:data.color,alpha:.36});
      namePlate.position.set(12,CARD.height-43);
      card.addChild(namePlate);
      const name=textNode(data.name,data.name.length>7?10:12,0xffffff,'800','center');
      name.anchor.set(.5);
      name.position.set(CARD.width/2,CARD.height-29);
      card.addChild(name);
    }

    const hpHost=new Container();
    hpHost.position.set(5,CARD.height+8);
    card.hp=this.makeHpBar(hpHost,CARD.width-10,data.hp);
    card.hpValue=data.hp;
    card.addChild(hpHost);
    card.on('pointertap',()=>{if(!this.playing&&this.visible)this.playSingleSkill(index)});
    return card;
  }

  createBoss(){
    const holder=new Container({label:'Enemy:Zoro'});
    holder.position.set(1215,185);
    holder.baseX=holder.x;
    holder.baseY=holder.y;
    const redGlow=addGlow(holder,270,396,0xff253f,.17);
    const panel=rectangle(270,396,0x08070b,.94,10,{width:2,color:0xff5c70,alpha:.7});
    holder.addChild(panel);
    const art=new Sprite(this.textures.boss);
    setCover(art,256,330);
    art.position.set(135,168);
    const mask=new Graphics().roundRect(7,7,256,330,7).fill(0xffffff);
    holder.addChild(art,mask);
    art.mask=mask;
    holder.art=art;
    const shade=rectangle(256,120,0x05050a,.75);
    shade.position.set(7,217);
    holder.addChild(shade);
    const threat=textNode('NIGHTMARE BOSS',9,0xff7d8a,'900','center');
    threat.anchor.set(.5);threat.position.set(135,23);holder.addChild(threat);
    const name=textNode('조로',22,0xffffff,'900','center');
    name.anchor.set(.5);name.position.set(135,286);holder.addChild(name);
    const hpHost=new Container();hpHost.position.set(25,316);holder.addChild(hpHost);
    holder.hp=this.makeHpBar(hpHost,220,this.bossHp,0xff5267);
    holder.percent=textNode(`${this.bossHp}%`,12,0xff9a8d,'900','center');
    holder.percent.anchor.set(.5);holder.percent.position.set(135,351);holder.addChild(holder.percent);
    const targetRing=new Graphics().circle(135,190,112).stroke({width:1,color:0xff5d6e,alpha:.28});
    holder.addChildAt(targetRing,0);
    holder._ticker=ticker=>{
      if(!this.visible||this.playing)return;
      targetRing.rotation+=.0018*ticker.deltaTime;
      redGlow.alpha=.3+Math.sin(performance.now()/600)*.08;
    };
    this.app.ticker.add(holder._ticker);
    return holder;
  }

  createUi(){
    const statusPanel=rectangle(600,42,0x040811,.8,7,{width:1,color:0xffd43d,alpha:.28});
    statusPanel.position.set(440,758);
    this.uiLayer.addChild(statusPanel);
    const status=textNode('PixiJS 전투 코어 · GSAP 스킬 타임라인 준비',12,0xe7eef5,'700','center');
    status.anchor.set(.5);status.position.set(740,779);this.uiLayer.addChild(status);
    this.uiLayer.status=status;
    this.uiLayer.statusPanel=statusPanel;

    const comboLabel=textNode('COMBO',9,0xffd84c,'900');
    comboLabel.position.set(1030,96);comboLabel.alpha=0;this.uiLayer.addChild(comboLabel);
    const combo=textNode('0',46,0xffffff,'900');
    combo.position.set(1030,105);combo.alpha=0;this.uiLayer.addChild(combo);
    this.uiLayer.comboLabel=comboLabel;
    this.uiLayer.combo=combo;

    const banner=new Container();
    banner.position.set(510,118);banner.alpha=0;
    const glow=addGlow(banner,580,88,0xffd43d,.22);
    banner.addChild(rectangle(580,88,0x05080c,.94,7,{width:1,color:0xffdb57,alpha:.7}));
    const type=textNode('전술 스킬 발동',10,0xffdf69,'900','center');type.anchor.set(.5);type.position.set(290,23);
    const name=textNode('',23,0xffffff,'900','center');name.anchor.set(.5);name.position.set(290,55);
    banner.addChild(type,name);
    banner.typeText=type;banner.nameText=name;banner.glow=glow;
    this.uiLayer.addChild(banner);
    this.uiLayer.banner=banner;
  }

  updateStatus(message){
    if(this.uiLayer?.status)this.uiLayer.status.text=message;
    const dom=document.getElementById('pvBattleStatus');
    if(dom)dom.textContent=message;
    this.onStatus(message);
  }

  isAlive(character){
    return Boolean(character&&character.battleActive!==false&&Number(character.hp)>0&&character.state!==CHARACTER_STATE.DEAD);
  }

  combatantById(value){
    const id=String(value?.id||value||'').trim();
    if(!id)return null;
    // V1801: PVP 미러전에서 상대 카드가 내 카드로 잘못 매칭되던 문제.
    //
    // 서버 전투원 id 는 "A:0:CN-XXXX" 처럼 진영·슬롯이 박혀 유일하다.
    // 그런데 예전 구현은 세 조건을 OR 로 묶어 한 번에 find 했고, 마지막
    // 접미사 조건 id.endsWith(`:${cardId}`) 이 배열 앞쪽(아군)에서 먼저 걸렸다.
    // 양 팀이 같은 카드를 내면(인기 카드는 흔하다) 상대 전투원 id 로 조회해도
    // 내 카드가 반환됐고, 그 결과 상대의 공격이 "내 카드가 적을 때리는" 연출로
    // 재생되면서 화면에서는 내가 이기고 실제로는 지는 상황이 나왔다.
    // => 유일성이 보장되는 순서로 단계를 나누고, 후보가 둘 이상이면 포기한다.
    const exact=this.characters.find(character=>String(character.id)===id);
    if(exact)return exact;
    const byCardId=this.characters.filter(character=>String(character.cardId||'')===id);
    if(byCardId.length===1)return byCardId[0];
    const bySuffix=this.characters.filter(character=>{
      const key=String(character.cardId||character.id||'');
      return key&&id.endsWith(`:${key}`);
    });
    return bySuffix.length===1?bySuffix[0]:null;
  }

  selectLiveTarget(attacker,preferred=null){
    if(!attacker)return null;
    const candidates=attacker.team===TEAM.ENEMY?this.allies:this.enemies;
    const explicit=preferred&&typeof preferred==='object'?preferred:this.combatantById(preferred);
    if(explicit&&candidates.includes(explicit)&&this.isAlive(explicit))return explicit;
    const current=attacker.team===TEAM.ENEMY?this.currentAllyTarget:this.currentEnemyTarget;
    if(current&&candidates.includes(current)&&this.isAlive(current))return current;
    const next=candidates
      .filter(character=>this.isAlive(character))
      .sort((left,right)=>(left.root?.y||0)-(right.root?.y||0)||(left.root?.x||0)-(right.root?.x||0))[0]||null;
    if(attacker.team===TEAM.ENEMY)this.currentAllyTarget=next;
    else{
      const previous=this.currentEnemyTarget;
      this.currentEnemyTarget=next;
      this.boss=next;
      this.bossHp=next?.hp??0;
      if(previous&&next&&previous!==next){
        this.lastTargetSwitch={from:previous.id,to:next.id,at:performance.now()};
        this.updateStatus(`타깃 전환 · ${previous.name} 처치 → ${next.name} 자동 지정`);
      }
    }
    return next;
  }

  syncTargetHp(target,value){
    if(!target)return null;
    const hp=target.setHp(clamp(Number(value)||0,0,100));
    if(target.team===TEAM.ENEMY){
      if(target===this.currentEnemyTarget||target===this.boss){
        this.bossHp=hp;
        if(hp<=0){
          this.currentEnemyTarget=null;
          this.boss=null;
          this.selectLiveTarget(this.allies.find(character=>this.isAlive(character))||this.allies[0]);
        }
      }
    }else if(target===this.currentAllyTarget&&hp<=0){
      this.currentAllyTarget=null;
      this.selectLiveTarget(this.enemies.find(character=>this.isAlive(character))||this.enemies[0]);
    }
    return target;
  }

  syncTargetShield(target,value,maxValue=null){
    if(!target||!hasFiniteNumber(value))return null;
    const current=Math.max(0,Number(value)||0);
    const maximum=hasFiniteNumber(maxValue)
      ?Math.max(current,Number(maxValue)||0)
      :Math.max(current,Number(target.maxShield)||0);
    if(typeof target.setShield==='function')target.setShield(current,maximum);
    else{
      target.shield=current;
      target.maxShield=maximum;
    }
    return target;
  }

  eventHpPercent(target,value){
    if(!hasFiniteNumber(value))return null;
    const raw=Math.max(0,Number(value));
    const maxHp=Math.max(1,Number(target?.serverMaxHp||100));
    return clamp(maxHp>100||raw>100?raw/maxHp*100:raw,0,100);
  }

  syncBossHp(value){
    const attacker=this.allies.find(character=>this.isAlive(character))||this.allies[0];
    const target=this.selectLiveTarget(attacker,this.boss);
    if(!target){this.bossHp=0;return null}
    this.syncTargetHp(target,value);
    return target;
  }

  timeline(build,cleanup=()=>{},fixedTimeScale=null){
    return new Promise(resolve=>{
      let finished=false;
      const settle=value=>{
        if(finished)return;
        finished=true;
        this.simpleTimelines.delete(entry);
        cleanup();
        resolve(value);
      };
      const instance=gsap.timeline({paused:true,onComplete:()=>settle(true),onInterrupt:()=>settle(false)});
      const entry={instance,settle};
      this.simpleTimelines.add(entry);
      build(instance);
      const requestedScale=Number(fixedTimeScale);
      instance.timeScale(Number.isFinite(requestedScale)&&requestedScale>0
        ?requestedScale
        :this.reducedMotion?8:PLAYBACK_SPEED*(this.paceScale||1));
      instance.play(0);
    });
  }

  triggerAdvancementScreenFlash({durationMs=50,alpha=.26}={}){
    if(!this.root||!this.scene)return {release(){}};
    const flash=new Graphics()
      .rect(0,0,this.scene.width,this.scene.height)
      .fill({color:0xffffff,alpha:clamp(Number(alpha)||.26,0,1)});
    flash.label='V3_ADVANCEMENT_FULL_STAGE_WHITE_FLASH';
    flash.eventMode='none';
    flash.blendMode='screen';
    this.root.addChild(flash);
    let active=true;
    let timer=0;
    const release=()=>{
      if(!active)return;
      active=false;
      clearTimeout(timer);
      flash.removeFromParent();
      flash.destroy();
    };
    timer=setTimeout(release,Math.max(0,Number(durationMs)||50));
    return {release};
  }

  cancelTimelines(){
    // Invalidate event handlers still waiting on an optional atlas or recorded
    // SFX decode. The late network result may warm a cache, but it must never
    // start a stale combat timeline after recovery, reset, or modal close.
    this.playbackEpoch+=1;
    this.skillTimeline?.cancelAll();
    this.clearAccountBattleUnitHitReactions();
    [...this.simpleTimelines].forEach(entry=>{entry.instance.kill();entry.settle(false)});
    this.stopAccountBattleUnitSustainedFire();
    this.accountBattleUnit?.cancelFire();
    this.audio?.stopAll?.();
    this.pools?.releaseAll();
    this.camera?.reset(true);
    this.playing=false;
  }

  syncFinalState(final={}){
    // Server combat is authoritative. A timed-out visual tween can otherwise
    // leave a living fighter in DEAD/HIT state even though the result payload
    // says it survived. Stop every in-flight animation before restoring the
    // exact final HP/FSM state for both teams.
    this.cancelTimelines();
    const syncTeam=(rows,team)=>{
      const list=Array.isArray(rows)?rows:[];
      const claimed=new Set();
      list.forEach((row,index)=>{
        const identity=row?.id||row?.cardId||row?.card_id;
        let character=this.combatantById(identity);
        if(!character||!team.includes(character)||claimed.has(character))character=team[index]||null;
        if(!character)return;
        claimed.add(character);
        const rowMaxHp=Math.max(0,Number(row?.maxHp||0));
        const percent=rowMaxHp>0?clamp(Math.max(0,Number(row?.hp||0))/rowMaxHp*100,0,100):(this.eventHpPercent(character,row?.hp)??0);
        character.battleActive=true;
        character.root.visible=true;
        character.root.renderable=true;
        character.root.alpha=1;
        character.root.position.set(character.baseX,character.baseY);
        character.root.scale.set(character.restScale);
        character.root.rotation=0;
        character.root.tint=0xffffff;
        character.root.filters=[];
        character.setTint?.(0xffffff);
        // DEAD -> IDLE is the only valid revive transition. Apply it before
        // the positive HP value so the HUD and animation adapter agree.
        character.setState(CHARACTER_STATE.IDLE);
        character.setHp(percent);
        character.serverMaxShield=Math.max(0,Number(row?.maxShield||row?.max_shield)||0);
        character.setShield?.(Math.max(0,Number(row?.shield)||0),character.serverMaxShield);
      });
      team.forEach(character=>{
        if(claimed.has(character))return;
        character.battleActive=false;
        character.root.visible=false;
        character.root.renderable=false;
        character.setState(CHARACTER_STATE.IDLE);
        character.setHp(0);
        character.setShield?.(0,0);
      });
    };
    syncTeam(final?.A,this.allies);
    syncTeam(final?.B,this.enemies);
    this.currentAllyTarget=this.allies.find(character=>this.isAlive(character))||null;
    this.currentEnemyTarget=this.enemies.find(character=>this.isAlive(character))||null;
    this.boss=this.currentEnemyTarget;
    this.bossHp=this.currentEnemyTarget?.hp??0;
    const aliveA=this.allies.filter(character=>this.isAlive(character)).length;
    const aliveB=this.enemies.filter(character=>this.isAlive(character)).length;
    this.updateStatus(`서버 최종 상태 동기화 · 생존 ${aliveA} : ${aliveB}`);
    this.sortCombatDepth();
    return {aliveA,aliveB};
  }

  showBanner(name,color=0xffd43d,label='전술 스킬 발동'){
    const banner=this.uiLayer.banner;
    banner.nameText.text=name;
    banner.nameText.style.fill=color;
    banner.typeText.text=label;
    banner.glow.tint=color;
    return this.timeline(timeline=>{
      timeline.set(banner,{alpha:0,y:128});
      timeline.set(banner.scale,{x:.84,y:.84});
      timeline.to(banner,{alpha:1,y:118,duration:.2,ease:'power3.out'});
      timeline.to(banner.scale,{x:1,y:1,duration:.2,ease:'back.out(1.8)'},0);
      timeline.to(banner,{alpha:0,y:104,duration:.2,ease:'power2.in'},.72);
    });
  }

  deployCards({force=false,instant=false}={}){
    // Live payloads normally deploy once. The standalone QC replay deliberately
    // rewinds every actor to alpha=0, so it must be allowed to replay DEPLOY or
    // the guard would leave all five allied SD actors invisible until restore.
    if(this.livePayload&&this.liveDeployed&&!force)return Promise.resolve(true);
    if(this.livePayload)this.liveDeployed=true;
    const activeAllies=this.allies.filter(character=>character.battleActive!==false).length;
    const activeEnemies=this.enemies.filter(character=>character.battleActive!==false).length;
    this.updateStatus(this.livePayload?'전투 배치 완료 · 자동 전투 시작':`PROJECT V V3 · ${activeAllies} 대 ${activeEnemies} SD 진형 전개`);
    const activeCharacters=this.characters.filter(character=>character.battleActive!==false);
    if(instant){
      if(this.accountBattleUnitEnabled&&this.accountBattleUnit?.active){
        if(typeof this.accountBattleUnit.setActive==='function')this.accountBattleUnit.setActive(true,{deployed:true});
        else{
          this.accountBattleUnit.root.visible=true;
          this.accountBattleUnit.root.renderable=true;
          this.accountBattleUnit.root.alpha=1;
        }
        this.layoutAccountBattleUnit?.();
      }
      activeCharacters.forEach(character=>{
        const root=character.root;
        root.visible=true;
        root.renderable=true;
        root.alpha=1;
        root.x=character.baseX;
        root.y=character.baseY;
        if(root.scale?.set)root.scale.set(character.restScale);
        else if(root.scale){root.scale.x=character.restScale;root.scale.y=character.restScale}
      });
      this.sortCombatDepth?.();
      return Promise.resolve(true);
    }
    return this.timeline(timeline=>{
      if(this.accountBattleUnitEnabled&&this.accountBattleUnit?.active){
        const accountRoot=this.accountBattleUnit.root;
        accountRoot.visible=true;
        accountRoot.renderable=true;
        // Fixed station: deploy is opacity-only. No entry dash is allowed.
        timeline.fromTo(accountRoot,{alpha:0},{alpha:1,duration:.24,ease:'power2.out'},0);
      }
      activeCharacters.forEach((character,index)=>{
        const root=character.root;
        // A previous final-state sync can mark an unused actor non-renderable.
        // Replay owns a fresh five-actor preview formation, so restore both Pixi
        // visibility gates before animating alpha; alpha alone cannot revive it.
        root.visible=true;
        root.renderable=true;
        if(this.livePayload){
          timeline.fromTo(root,
            {alpha:0,x:character.baseX,y:character.baseY+28},
            {alpha:1,x:character.baseX,y:character.baseY,duration:.28,ease:'power3.out'},
            index*.035
          );
          timeline.fromTo(root.scale,
            {x:character.restScale*.86,y:character.restScale*.86},
            {x:character.restScale,y:character.restScale,duration:.28,ease:'power3.out'},
            index*.035
          );
        }else{
          const direction=character.team===TEAM.ALLY?-1:1;
          timeline.fromTo(root,
            {alpha:0,x:character.baseX+direction*90,y:character.baseY},
            {alpha:1,x:character.baseX,y:character.baseY,duration:.34,ease:'back.out(1.4)'},
            index*.045
          );
        }
      });
      this.cards.filter(card=>card.visible&&card.renderable).forEach((card,index)=>{
        timeline.fromTo(card,{alpha:0,y:card.baseY+70,rotation:(index-2)*.025},{alpha:1,y:card.baseY,rotation:0,duration:.34,ease:'back.out(1.35)'},index*.065);
        timeline.fromTo(card.scale,{x:card.restScale*.78,y:card.restScale*.78},{x:card.restScale,y:card.restScale,duration:.34,ease:'power3.out'},index*.065);
      });
    });
  }

  async normalAttack(index,{damage=128440,critical=false,attacker=null,target=null,targetHp=null,targetShield=null,healing=0,hitCount=1,advancementClass='',onImpact=()=>{}}={}){
    const requestedActor=attacker||this.allies[index%this.allies.length];
    const actor=this.isAlive(requestedActor)?requestedActor:(requestedActor?.team===TEAM.ENEMY?this.enemies:this.allies).find(character=>this.isAlive(character));
    const victim=this.selectLiveTarget(actor,target);
    if(!actor||!victim){
      this.updateStatus('공격 가능한 생존 대상이 없습니다.');
      return Promise.resolve(false);
    }
    const actorView=actor.root;
    const victimView=victim.root;
    const roleKind=normalizeSkillEffectKind(actor.effectKind);
    const roleProfile=roleEffectProfile(roleKind);
    const advancementCode=normalizeAdvancementEffectCode(advancementClass);
    const advancementProfile=advancementEffectProfile(advancementCode);
    const playbackEpoch=this.playbackEpoch;
    if(advancementProfile)await this.ensureAdvancementReady(advancementCode);
    if(playbackEpoch!==this.playbackEpoch||!this.visible)return false;
    const damageLabel=this.pools.damage.acquire();
    const impact={x:victimView.x,y:victimView.y-176};
    const isBossTarget=Boolean(victim.isBoss);
    configureDamageText(damageLabel,{kind:roleKind,damage,critical,healing,hitCount,compact:this.mobile});
    damageLabel.position.set(impact.x,victimView.y-340);damageLabel.visible=true;this.uiLayer.addChild(damageLabel);
    if(roleKind===SKILL_EFFECT_KIND.HP&&damageLabel.healLabel){
      damageLabel.healLabel.position.set(actor.baseX-impact.x,actor.baseY-165-(victimView.y-340));
    }
    const effectPoint=roleKind===SKILL_EFFECT_KIND.HP?{x:actor.baseX,y:actor.baseY-176}:impact;
    // An advancement activation replaces the normal role atlas for this one
    // authoritative hit. It is never stacked on top of the role effect.
    const skillEffect=advancementProfile
      ?AdvancementEffectFX.create(advancementCode,{
        x:effectPoint.x,y:effectPoint.y,scale:(this.mobile?.76:1)*(isBossTarget?1.08:1)
      }).attach(this.effectLayer)
      :SkillEffectFX.create({
        kind:roleKind,x:effectPoint.x,y:effectPoint.y,
        scale:(this.mobile?.78:1)*(isBossTarget?1.12:1)
      }).attach(this.effectLayer);
    let whiteFlashHandle=null;
    let hitStopTimer=null;
    const cleanup=()=>{
      if(hitStopTimer){clearTimeout(hitStopTimer);hitStopTimer=null}
      this.pools.damage.release(damageLabel);
      actorView.position.set(actor.baseX,actor.baseY);
      actorView.scale.set(actor.restScale);
      actor.setState(CHARACTER_STATE.IDLE);
      victim.setState(victim.hp<=0?CHARACTER_STATE.DEAD:CHARACTER_STATE.IDLE);
      victim.tint=0xffffff;
      whiteFlashHandle?.release();
      skillEffect.release();
    };
    this.updateStatus(`${actor.name} · ${advancementProfile?.title||roleProfile.label}${critical?' · 치명타':''}`);
    const vector={x:victimView.x-actor.baseX,y:victimView.y-actor.baseY};
    const distance=Math.max(1,Math.hypot(vector.x,vector.y));
    // Move all the way to the current target instead of nudging 86px from the
    // origin. The old distance made individual server TURN events look static.
    const stopByRole={ATTACK:isBossTarget?138:92,DEFENSE:isBossTarget?265:225,SPEED:isBossTarget?118:74,HP:isBossTarget?500:440};
    const stopDistance=stopByRole[roleKind]||stopByRole.ATTACK;
    const attackPoint={
      x:victimView.x-vector.x/distance*stopDistance,
      y:victimView.y-vector.y/distance*stopDistance
    };
    const attackScale=actor.getPerspectiveScale?.(attackPoint.y)??actor.restScale;
    const impactAt=advancementProfile?.impactAt??.25;
    // Advancement buildup is an approved authored presentation. Do not let the
    // long-battle catch-up multiplier crop its visual/audio lead-in.
    const playbackSpeed=advancementProfile
      ?(this.reducedMotion?8:PLAYBACK_SPEED)
      :(this.reducedMotion?8:PLAYBACK_SPEED*(this.paceScale||1));
    const returnAt=advancementProfile?impactAt+.18:.43;
    return this.timeline(timeline=>{
      const travelDuration=roleKind===SKILL_EFFECT_KIND.SPEED?.14:roleKind===SKILL_EFFECT_KIND.DEFENSE?.25:.22;
      timeline.call(()=>{
        actor.setState(CHARACTER_STATE.MOVE);
        if(advancementProfile)this.audio?.scheduleAdvancementImpact(advancementCode,{impactAt,playbackSpeed});
        else this.audio?.scheduleImpact(roleKind,{impactAt:.25,playbackSpeed,critical,boss:isBossTarget});
      },[],0);
      timeline.to(actorView,{x:attackPoint.x,y:attackPoint.y,duration:travelDuration,ease:roleKind===SKILL_EFFECT_KIND.SPEED?'power4.in':'power3.out'});
      timeline.to(actorView.scale,{x:attackScale*(roleKind===SKILL_EFFECT_KIND.DEFENSE?1.11:1.06),y:attackScale*(roleKind===SKILL_EFFECT_KIND.SPEED?.96:1.06),duration:travelDuration,ease:'power3.out'},0);
      timeline.call(()=>{
        actor.setState(CHARACTER_STATE.ATTACK);
        victim.setState(CHARACTER_STATE.HIT);
        victim.tint=0xffd4a0;
        whiteFlashHandle?.release();
        whiteFlashHandle=advancementProfile
          ?this.triggerAdvancementScreenFlash({durationMs:50,alpha:.26})
          :triggerWhiteFlash(victim,{durationMs:Math.round(50/PLAYBACK_SPEED)});
        if(hasFiniteNumber(targetHp))this.syncTargetHp(victim,Number(targetHp));
        if(hasFiniteNumber(targetShield))this.syncTargetShield(victim,Number(targetShield));
        onImpact(victim);
      },[],impactAt);
      if(advancementProfile)skillEffect.play(timeline,{impactAt});
      else skillEffect.play(timeline,{at:.25,playbackSpeed});
      this.camera.addShake(timeline,{
        intensity:(isBossTarget?1.22:1)*(advancementProfile?.shake||roleProfile.shake)*(critical?1.12:1),
        duration:isBossTarget?.31:.22,rotation:roleKind===SKILL_EFFECT_KIND.DEFENSE?.004:.008,at:impactAt
      });
      if(advancementProfile&&!this.reducedMotion){
        timeline.call(()=>{
          timeline.pause();
          hitStopTimer=setTimeout(()=>{hitStopTimer=null;timeline.resume()},Math.max(1,Math.round(advancementProfile.hitStopMs/playbackSpeed)));
        },[],impactAt+.005);
      }
      timeline.fromTo(damageLabel,{alpha:0,y:victimView.y-346},{alpha:1,y:victimView.y-376,duration:.18,ease:'back.out(2)'},impactAt);
      timeline.fromTo(damageLabel.scale,{x:.55,y:.55},{x:1,y:1,duration:.2,ease:'back.out(2)'},impactAt);
      timeline.to(damageLabel,{alpha:0,y:victimView.y-406,duration:.25,ease:'power2.in'},impactAt+.23);
      timeline.to(actorView,{x:actor.baseX,y:actor.baseY,duration:.3,ease:'power3.inOut'},returnAt);
      timeline.to(actorView.scale,{x:actor.restScale,y:actor.restScale,duration:.3,ease:'power3.inOut'},returnAt);
    },cleanup,advancementProfile?playbackSpeed:null);
  }

  escortObjectiveAttack(event={}){
    const actor=this.combatantById(event.actorId)||this.enemies.find(character=>this.isAlive(character));
    const objective=this.objectiveSprite;
    if(!actor||!objective||!objective.visible){
      this.updateStatus('호송차 타격 대상을 구성하지 못했습니다.');
      return Promise.resolve(false);
    }
    const actorView=actor.root;
    const damage=Math.max(0,Number(event.damage||0));
    const roleKind=normalizeSkillEffectKind(actor.effectKind||SKILL_EFFECT_KIND.ATTACK);
    const roleProfile=roleEffectProfile(roleKind);
    const impact={x:objective.x,y:objective.y-Math.max(34,objective.height*.38)};
    const damageLabel=this.pools.damage.acquire();
    // V1841: 보스 관통 포격은 크게 띄운다. 평타(장갑 스침)와 구분이 안 되면
    //   총 피해를 아무리 올려도 화면에서는 "그대로" 로 보인다.
    configureDamageText(damageLabel,{kind:SKILL_EFFECT_KIND.ATTACK,damage,critical:Boolean(event.objectiveHeavy),healing:0,hitCount:1,compact:this.mobile});
    damageLabel.position.set(impact.x,impact.y-92);damageLabel.visible=true;this.uiLayer.addChild(damageLabel);
    const skillEffect=SkillEffectFX.create({
      kind:SKILL_EFFECT_KIND.ATTACK,
      x:impact.x,
      y:impact.y,
      scale:(this.mobile?.78:1)*(event.objectiveHeavy?1.14:1)
    }).attach(this.effectLayer);
    const vector={x:objective.x-actor.baseX,y:objective.y-actor.baseY};
    const distance=Math.max(1,Math.hypot(vector.x,vector.y));
    const stopDistance=this.mobile?128:176;
    const attackPoint={x:objective.x-vector.x/distance*stopDistance,y:objective.y-vector.y/distance*stopDistance};
    const attackScale=actor.getPerspectiveScale?.(attackPoint.y)??actor.restScale;
    let whiteFlashHandle=null;
    const cleanup=()=>{
      this.pools.damage.release(damageLabel);
      actorView.position.set(actor.baseX,actor.baseY);actorView.scale.set(actor.restScale);
      actor.setState(CHARACTER_STATE.IDLE);objective.tint=0xffffff;
      whiteFlashHandle?.release();skillEffect.release();
    };
    this.updateStatus(`${actor.name} · ${event.objectiveStrikeLabel||'호송차 강제 공격'}${event.forced?' · 선제 타격':''}`);
    const playbackSpeed=this.reducedMotion?8:PLAYBACK_SPEED*(this.paceScale||1);
    return this.timeline(timeline=>{
      timeline.call(()=>{
        actor.setState(CHARACTER_STATE.MOVE);
        this.audio?.scheduleImpact(SKILL_EFFECT_KIND.ATTACK,{impactAt:.24,playbackSpeed,boss:true});
      },[],0);
      timeline.to(actorView,{x:attackPoint.x,y:attackPoint.y,duration:.24,ease:'power3.in'});
      timeline.to(actorView.scale,{x:attackScale*1.08,y:attackScale*1.08,duration:.24,ease:'power3.in'},0);
      timeline.call(()=>{
        actor.setState(CHARACTER_STATE.ATTACK);objective.tint=0xffc19c;
        whiteFlashHandle?.release();whiteFlashHandle=triggerWhiteFlash(objective,{durationMs:Math.round(60/PLAYBACK_SPEED)});
        const hp=Math.max(0,Number(event.objectiveHpAfter||0)),maxHp=Math.max(1,Number(event.objectiveMaxHp||this.objectiveData?.maxHp||1));
        this.objectiveData={...(this.objectiveData||{}),hp,hpAfter:hp,maxHp};
        this.syncObjectiveHud({hp,maxHp,status:`DIRECT IMPACT · -${Math.round(damage).toLocaleString()}`,animate:true});
      },[],.24);
      skillEffect.play(timeline,{at:.24,playbackSpeed});
      this.camera.addShake(timeline,{intensity:1.22,duration:.3,rotation:.009,at:.24});
      timeline.fromTo(damageLabel,{alpha:0,y:impact.y-74},{alpha:1,y:impact.y-112,duration:.18,ease:'back.out(2)'},.24);
      timeline.to(damageLabel,{alpha:0,y:impact.y-142,duration:.26,ease:'power2.in'},.48);
      timeline.to(actorView,{x:actor.baseX,y:actor.baseY,duration:.32,ease:'power3.inOut'},.46);
      timeline.to(actorView.scale,{x:actor.restScale,y:actor.restScale,duration:.32,ease:'power3.inOut'},.46);
    },cleanup);
  }

  async playTacticalSkill(index,{damage=386720,critical=true,label='전술 스킬',target=null,targetHp=null,targetShield=null,attacker=null,healing=0,hitCount=1}={}){
    const actor=attacker||this.allies[index%this.allies.length];
    const actorIndex=Math.max(0,this.allies.indexOf(actor));
    const card=this.cards[actorIndex%this.cards.length]||this.cards[0];
    const victim=this.selectLiveTarget(actor,target);
    if(!victim){this.updateStatus('스킬 대상이 없습니다.');return false}
    this.updateStatus(`${actor.name} · ${label}`);
    const result=await this.skillTimeline.play({
      attacker:actor,
      target:victim,
      enemies:this.enemies,
      damage,
      critical,
      title:actor.name,
      subtitle:this.livePayload?label:card.data.ability,
      accent:actor.accent||card.data.color||0x7edcff,
      effectProfile:actor.effectProfile||card.data.effectProfile,
      effectKind:actor.effectKind||card.data.effectKind,
      targetClass:victim.isBoss?'BOSS':'MONSTER',
      healing,
      hitCount,
      onImpact:()=>{
        this.syncTargetHp(victim,hasFiniteNumber(targetHp)?Number(targetHp):victim.hp-(critical?18:11));
        if(hasFiniteNumber(targetShield))this.syncTargetShield(victim,Number(targetShield));
      }
    });
    return result;
  }

  async playAdvancementMoment(value,{target=null,label='',onImpact=()=>{}}={}){
    const code=normalizeAdvancementEffectCode(value);
    const profile=advancementEffectProfile(code);
    const participant=target||this.currentAllyTarget;
    const view=participant?.root||participant?.view||participant;
    if(!profile||!view){onImpact();return Promise.resolve(false)}
    const playbackEpoch=this.playbackEpoch;
    await this.ensureAdvancementReady(code);
    if(playbackEpoch!==this.playbackEpoch||!this.visible)return false;
    const height=Math.max(0,Number(view?.height)||0);
    const point={x:Number(view.x||0),y:Number(view.y||0)-Math.max(76,Math.min(178,height*.34||178))};
    const effect=AdvancementEffectFX.create(code,{
      x:point.x,y:point.y,scale:this.mobile?.74:1
    }).attach(this.effectLayer);
    const originalScale={x:Number(view.scale?.x||1),y:Number(view.scale?.y||1)};
    let whiteFlashHandle=null;
    let hitStopTimer=null;
    const impactAt=profile.impactAt;
    const playbackSpeed=this.reducedMotion?8:PLAYBACK_SPEED;
    const cleanup=()=>{
      if(hitStopTimer){clearTimeout(hitStopTimer);hitStopTimer=null}
      whiteFlashHandle?.release();
      effect.release();
      if(view?.scale)view.scale.set(originalScale.x,originalScale.y);
    };
    this.updateStatus(`${participant?.name||'전투원'} · ${label||profile.title}`);
    return this.timeline(timeline=>{
      timeline.call(()=>this.audio?.scheduleAdvancementImpact(code,{impactAt,playbackSpeed}),[],0);
      effect.play(timeline,{impactAt});
      timeline.call(()=>{
        whiteFlashHandle?.release();
        whiteFlashHandle=this.triggerAdvancementScreenFlash({durationMs:50,alpha:.26});
        onImpact();
      },[],impactAt);
      this.camera.addShake(timeline,{intensity:profile.shake,duration:.22,rotation:code==='AFTERIMAGE'?.004:.006,at:impactAt});
      timeline.fromTo(view.scale,
        {x:originalScale.x*.96,y:originalScale.y*.96},
        {x:originalScale.x*1.04,y:originalScale.y*1.04,duration:.08,ease:'power4.out'},impactAt);
      timeline.to(view.scale,{x:originalScale.x,y:originalScale.y,duration:.16,ease:'back.out(1.8)'},impactAt+.08);
      if(!this.reducedMotion){
        timeline.call(()=>{
          timeline.pause();
          hitStopTimer=setTimeout(()=>{hitStopTimer=null;timeline.resume()},Math.max(1,Math.round(profile.hitStopMs/playbackSpeed)));
        },[],impactAt+.005);
      }
    },cleanup,playbackSpeed);
  }

  playSupportEffect(targets,{kind=SKILL_EFFECT_KIND.HP,onImpact=()=>{}}={}){
    const participants=[...new Set((Array.isArray(targets)?targets:[targets]).filter(Boolean))];
    if(!participants.length){onImpact();return Promise.resolve(false)}
    const roleKind=normalizeSkillEffectKind(kind);
    const playbackSpeed=this.reducedMotion?8:PLAYBACK_SPEED*(this.paceScale||1);
    const effects=participants.map(target=>{
      const view=target.root||target.view||target;
      const height=Math.max(0,Number(view?.height)||0);
      const y=Number(view?.y||0)-Math.max(72,Math.min(178,height*.34||178));
      return SkillEffectFX.create({
        kind:roleKind,
        x:Number(view?.x||0),
        y,
        scale:this.mobile?.72:.9
      }).attach(this.effectLayer);
    });
    const flashes=[];
    const cleanup=()=>{
      flashes.splice(0).forEach(handle=>handle?.release?.());
      effects.forEach(effect=>effect.release());
    };
    return this.timeline(timeline=>{
      timeline.call(()=>this.audio?.scheduleImpact(roleKind,{impactAt:.18,playbackSpeed}),[],0);
      effects.forEach(effect=>effect.play(timeline,{at:.18,playbackSpeed}));
      timeline.call(()=>{
        participants.forEach(target=>flashes.push(triggerWhiteFlash(target,{durationMs:Math.round(70/PLAYBACK_SPEED)})));
        onImpact();
      },[],.18);
    },cleanup);
  }

  async playApocalypseBossUltimate(event={},attacker=null){
    const hitRows=Array.isArray(event.hits)?event.hits:[];
    const hits=hitRows.map(hit=>({hit,target:this.combatantById(hit.targetId)})).filter(item=>item.target);
    if(!hits.length||!await this.ensureApocalypseBossUltimateReady())return false;
    const targets=[...new Set(hits.map(item=>item.target))];
    const center={
      x:targets.reduce((sum,target)=>sum+Number(target.root?.x||0),0)/targets.length,
      y:targets.reduce((sum,target)=>sum+Number(target.root?.y||0),0)/targets.length-(this.mobile?150:165)
    };
    const effect=ApocalypseBossUltimateFX.create({x:center.x,y:center.y,scale:this.mobile?.76:1.02}).attach(this.effectLayer);
    if(!effect.display){effect.release();return false}
    const damageLabels=hits.map(({hit,target})=>{
      const label=this.pools.damage.acquire();
      configureDamageText(label,{
        kind:SKILL_EFFECT_KIND.ATTACK,
        damage:Number(hit.damage||0)+Number(hit.absorbed||0),
        critical:Boolean(hit.critical),
        healing:Number(hit.healing||0),
        hitCount:Number(hit.hitCount||1),
        compact:this.mobile
      });
      label.position.set(target.root.x,target.root.y-(this.mobile?235:310));
      label.visible=true;
      label.alpha=0;
      this.uiLayer.addChild(label);
      return {label,target,hit};
    });
    const playbackSpeed=this.reducedMotion?8:PLAYBACK_SPEED;
    const impactAt=APOCALYPSE_BOSS_ULTIMATE_PROFILE.impactAt;
    let whiteFlashHandle=null;
    let hitStopTimer=null;
    const cleanup=()=>{
      if(hitStopTimer){clearTimeout(hitStopTimer);hitStopTimer=null}
      whiteFlashHandle?.release();
      effect.release();
      damageLabels.forEach(({label,target})=>{
        this.pools.damage.release(label);
        target.tint=0xffffff;
        target.setState(target.hp<=0?CHARACTER_STATE.DEAD:CHARACTER_STATE.IDLE);
      });
    };
    this.updateStatus(`${attacker?.name||'아포칼립스 보스'} · ${event.label||'멸절 프로토콜'}`);
    const bannerPromise=this.showBanner(event.label||'멸절 프로토콜',0xff754f,'APOCALYPSE ULTIMATE');
    const effectPromise=this.timeline(timeline=>{
      timeline.call(()=>this.audio?.scheduleApocalypseBossUltimate?.({impactAt,playbackSpeed}),[],0);
      effect.play(timeline,{impactAt});
      timeline.call(()=>{
        whiteFlashHandle?.release();
        whiteFlashHandle=this.triggerAdvancementScreenFlash({durationMs:Math.round(50/playbackSpeed),alpha:.2});
        damageLabels.forEach(({target,hit})=>{
          target.setState(CHARACTER_STATE.HIT);
          target.tint=0xffc2ac;
          this.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShieldAfter??hit.targetMaxShield);
          const hp=this.eventHpPercent(target,hit.targetHpAfter);
          if(hasFiniteNumber(hp))this.syncTargetHp(target,hp);
        });
      },[],impactAt);
      this.camera.addShake(timeline,{intensity:APOCALYPSE_BOSS_ULTIMATE_PROFILE.shake,duration:.42,rotation:.012,at:impactAt});
      damageLabels.forEach(({label,target},index)=>{
        const startY=target.root.y-(this.mobile?220:292);
        timeline.fromTo(label,{alpha:0,y:startY},{alpha:1,y:startY-42,duration:.18,ease:'back.out(2.2)'},impactAt+index*.018);
        timeline.fromTo(label.scale,{x:.52,y:.52},{x:1.08,y:1.08,duration:.2,ease:'back.out(2.2)'},impactAt+index*.018);
        timeline.to(label,{alpha:0,y:startY-78,duration:.3,ease:'power2.in'},impactAt+.3+index*.018);
      });
      if(!this.reducedMotion){
        timeline.call(()=>{
          timeline.pause();
          hitStopTimer=setTimeout(()=>{
            hitStopTimer=null;
            timeline.resume();
          },Math.max(1,Math.round(APOCALYPSE_BOSS_ULTIMATE_PROFILE.hitStopMs/playbackSpeed)));
        },[],impactAt+.005);
      }
    },cleanup,playbackSpeed);
    await Promise.all([bannerPromise,effectPromise]);
    return true;
  }

  /**
   * Portable renderer contract. The production API only needs to return this
   * ordered event list; combat results remain authoritative on the server.
   */
  // V1812: 재생 배속 단계. DEPLOY 로 매 전투 시작마다 초기화된다.
  //   40턴까지 원속도 → 80턴까지 1.28배 → 그 뒤 1.82배.
  advancePace(type){
    if(type==='DEPLOY'){this.paceActions=0;this.paceScale=1;return}
    if(type!=='TURN'&&type!=='ATTACK'&&type!=='COUNTER'&&type!=='ESCORT_OBJECTIVE_ATTACK')return;
    this.paceActions+=1;
    this.paceScale=this.paceActions>80?1.82:this.paceActions>40?1.28:1;
  }

  async playEvents(events=[],{forceDeploy=false}={}){
    for(const event of events){
      if(!this.visible)break;
      const type=String(event?.type||'').toUpperCase();
      this.advancePace(type);
      const explicitActor=this.combatantById(event.actorId)||null;
      const actor=explicitActor||clamp(Number(event.actorIndex||0),0,this.cards.length-1);
      const target=this.combatantById(event.targetId)||null;
      const targetHp=hasFiniteNumber(event.targetHp)?Number(event.targetHp):null;
      const rawTargetHp=hasFiniteNumber(event.targetHpAfter)?Number(event.targetHpAfter)
        :hasFiniteNumber(event.hpAfter)?Number(event.hpAfter)
        :targetHp!==null?targetHp
        :hasFiniteNumber(event.bossHp)?Number(event.bossHp):null;
      const resolvedTargetHp=this.eventHpPercent(target,rawTargetHp);
      const targetShieldAfter=hasFiniteNumber(event.targetShieldAfter)?Number(event.targetShieldAfter)
        :hasFiniteNumber(event.shieldAfter)?Number(event.shieldAfter):null;
      const actorShieldAfter=hasFiniteNumber(event.actorShieldAfter)?Number(event.actorShieldAfter):null;
      const syncEventShields=()=>{
        if(target&&hasFiniteNumber(targetShieldAfter)){
          this.syncTargetShield(target,targetShieldAfter,event.targetMaxShieldAfter??event.targetMaxShield);
        }
        if(explicitActor&&hasFiniteNumber(actorShieldAfter)){
          this.syncTargetShield(explicitActor,actorShieldAfter,event.actorMaxShieldAfter??event.actorMaxShield);
        }
      };
      const damage=Number(event.damage||0)+Number(event.absorbed||0);
      const healing=Math.max(0,Number(event.healing||event.healAmount||event.recoveredHp||0));
      const hitCount=Math.max(1,Number(event.hitCount||event.comboCount||1));
      if(type==='DEPLOY')await this.deployCards({force:forceDeploy});
      else if(type==='START_EFFECT'||type==='GUARD_PROTECT'){
        // START_EFFECT is the authoritative opening-shield snapshot. Targeted
        // GUARD_PROTECT events can also add a barrier during combat.
        syncEventShields();
      }
      else if(type==='ESCORT_OBJECTIVE_ATTACK')await this.escortObjectiveAttack(event);
      else if(type==='ESCORT_OBJECTIVE_RECOVERY'){
        const hp=Math.max(0,Number(event.objectiveHpAfter||0)),maxHp=Math.max(1,Number(event.objectiveMaxHp||this.objectiveData?.maxHp||1));
        this.objectiveData={...(this.objectiveData||{}),hp,hpAfter:hp,maxHp};
        this.syncObjectiveHud({hp,maxHp,status:`RECOVERY LINK · +${Math.round(Number(event.amount||0)).toLocaleString()}`,animate:true});
        if(this.objectiveSprite)this.objectiveSprite.tint=0xaaffcf;
        await this.showBanner(event.label||'호송차 긴급 복구',0x5ff0ae,'ESCORT RECOVERY');
        if(this.objectiveSprite)this.objectiveSprite.tint=0xffffff;
      }
      else if(type==='ATTACK'||type==='TURN'){
        if(this.isAccountBattleUnitDamageEvent(event)){
          await this.queueAccountBattleUnitDamageShot(target,{
            damage,
            critical:Boolean(event.critical),
            targetHp:resolvedTargetHp,
            targetShield:targetShieldAfter,
            authoritative:!event.dodge,
            playbackRate:this.paceScale||1
          });
          if(event.dodge)await this.showBanner('배틀슈트 사격 회피',0x62e9ff,'MISS');
          syncEventShields();
          continue;
        }
        if(event.dodge){
          if(type==='TURN'&&normalizeAdvancementEffectCode(event.advancementClass)==='AFTERIMAGE'){
            await this.playAdvancementMoment('AFTERIMAGE',{target,label:event.label||'잔영자 · 시공매 초월가속'});
          }
          await this.showBanner('회피 · 잔상 전개',0x62e9ff,'속도효과 발동');
          syncEventShields();
          continue;
        }
        const advancementClass=type==='TURN'&&normalizeAdvancementEffectCode(event.advancementClass)==='SHATTER'?'SHATTER':'';
        await this.normalAttack(Number(event.actorIndex||0),{damage,critical:Boolean(event.critical),attacker:explicitActor,target,targetHp:resolvedTargetHp,targetShield:targetShieldAfter,healing,hitCount,advancementClass});
      }else if(type==='SKILL'){
        await this.playTacticalSkill(Number(event.actorIndex||0),{damage,critical:Boolean(event.critical),label:event.label||event.skillName||'전술 스킬',target,targetHp:resolvedTargetHp,targetShield:targetShieldAfter,attacker:explicitActor,healing,hitCount});
      }else if(type==='COUNTER'){
        const advancementClass=normalizeAdvancementEffectCode(event.advancementClass)==='RIPOSTE'?'RIPOSTE':'';
        if(explicitActor)await this.normalAttack(0,{damage,critical:Boolean(event.critical),attacker:explicitActor,target,targetHp:resolvedTargetHp,targetShield:targetShieldAfter,healing,hitCount,advancementClass});
        else await this.bossCounter(Number(event.actorIndex||0));
      }else if(type==='ULTIMATE'||type==='PVE_ULTIMATE'){
        const liveActor=explicitActor||(this.livePayload?this.allies.find(character=>this.isAlive(character)):null);
        if(liveActor)await this.playTacticalSkill(Number(event.actorIndex||0),{damage,critical:true,label:event.label||'궁극기',target,targetHp:resolvedTargetHp,targetShield:targetShieldAfter,attacker:liveActor,healing,hitCount});
        else await this.playUltimate({target,targetHp:resolvedTargetHp});
      }else if(type==='BOSS_ULTIMATE'){
        const bossActor=explicitActor||this.enemies.find(character=>this.isAlive(character));
        const apocalypsePlayed=this.apocalypseMode&&await this.playApocalypseBossUltimate(event,bossActor);
        if(!apocalypsePlayed){
          await this.showBanner(event.label||'보스 광역 공격',0xff5c6e,'BOSS ULTIMATE');
          for(const hit of event.hits||[]){
            const hitTarget=this.combatantById(hit.targetId);
            await this.normalAttack(0,{damage:Number(hit.damage||0)+Number(hit.absorbed||0),critical:Boolean(hit.critical),attacker:bossActor,target:hitTarget,targetHp:this.eventHpPercent(hitTarget,hit.targetHpAfter),targetShield:hit.targetShieldAfter,healing:Number(hit.healing||0),hitCount:Number(hit.hitCount||1)});
          }
        }
      }else if(type==='MAGIC_CARD'){
        const label=event.magicName||event.magicCode||'마법카드';
        if(damage>0)await this.playTacticalSkill(Number(event.actorIndex||0),{damage,critical:Boolean(event.critical),label,target,targetHp:resolvedTargetHp,targetShield:targetShieldAfter,attacker:explicitActor,healing,hitCount});
        else{
          if(event.amount||healing){
            await this.playSupportEffect(target||this.currentAllyTarget,{
              kind:SKILL_EFFECT_KIND.HP,
              onImpact:()=>{if(target&&hasFiniteNumber(resolvedTargetHp))this.syncTargetHp(target,resolvedTargetHp)}
            });
          }
          await this.showBanner(label,event.amount?0x6affb7:0xb57cff,event.amount?'회복효과 발동':'마법효과 발동');
          if(!event.amount&&!healing&&target&&hasFiniteNumber(resolvedTargetHp))this.syncTargetHp(target,resolvedTargetHp);
        }
      }else if(type==='ADVANCEMENT'||type==='ADVANCEMENT_SEALED'){
        const success=normalizeAdvancementEffectCode(event.classCode)==='IMMORTAL';
        if(success){
          await this.playAdvancementMoment('IMMORTAL',{
            target,
            label:event.label||'불멸자 · 세계수 완전개화',
            onImpact:()=>{if(target&&hasFiniteNumber(resolvedTargetHp))this.syncTargetHp(target,resolvedTargetHp)}
          });
          await this.showBanner(event.label||'불멸자 · 최후 저항',0x72f5ad,type==='ADVANCEMENT_SEALED'?'봉인 저항 성공':'전직효과 발동');
        }else if(target&&hasFiniteNumber(resolvedTargetHp))this.syncTargetHp(target,resolvedTargetHp);
      }else if(type==='ADVANCEMENT_BLOCKED'){
        await this.showBanner(event.label||'불멸자 · 부활 봉인',0xff7a8d,'전직효과 차단');
      }else if(['TEAM_HEAL','REGEN','EMERGENCY_HEAL','SURVIVE','INDOMITABLE','SINGLE_HEALER_AURA'].includes(type)){
        // V1800: INDOMITABLE(방어형 불굴)은 서버가 HP 를 0 에서 1 로 되돌리는 이벤트인데
        // 여기서 빠져 있어 HP 표시가 0 에 멈췄고, 그 캐릭터가 죽은 것으로 취급됐다.
        const targetRows=Array.isArray(event.targets)?event.targets:[];
        const supportTargets=targetRows.length
          ?targetRows.map(item=>this.combatantById(item.targetId)).filter(Boolean)
          :target?[target]:type==='TEAM_HEAL'?this.allies.filter(character=>this.isAlive(character)):[];
        await this.playSupportEffect(supportTargets,{
          kind:type==='INDOMITABLE'?SKILL_EFFECT_KIND.DEFENSE:SKILL_EFFECT_KIND.HP,
          onImpact:()=>{
            if(type==='SINGLE_HEALER_AURA'||targetRows.length){
              for(const item of targetRows){
                const itemTarget=this.combatantById(item.targetId);
                if(itemTarget&&hasFiniteNumber(item.hpAfter))this.syncTargetHp(itemTarget,this.eventHpPercent(itemTarget,item.hpAfter));
              }
            }else if(target&&hasFiniteNumber(resolvedTargetHp))this.syncTargetHp(target,resolvedTargetHp);
          }
        });
        await this.showBanner(type==='TEAM_HEAL'?'아군 회복':type==='SURVIVE'?'불굴의 생존':type==='INDOMITABLE'?'방어형 · 불굴':'생명 회복',type==='INDOMITABLE'?0x69ddff:0x6affb7,type==='INDOMITABLE'?'방어효과 발동':'회복효과 발동');
      }else if(type==='KO'){
        if(target)this.syncTargetHp(target,0);
      }else if(type==='RESULT'){
        this.updateStatus(event.winner==='A'?'PROJECT V V3 · 승리':event.winner==='B'?'PROJECT V V3 · 패배':'PROJECT V V3 · 무승부');
      }else if(target&&hasFiniteNumber(resolvedTargetHp)){
        // V1800: 서버가 새 이벤트 타입을 추가해도 HP 표시가 어긋나지 않도록 마지막에 동기화한다.
        // (INDOMITABLE 누락 같은 사고가 다시 나도 최소한 생존 상태는 서버와 맞는다)
        this.syncTargetHp(target,resolvedTargetHp);
      }
      syncEventShields();
    }
  }

  async bossCounter(targetIndex=3){
    const attacker=this.selectLiveTarget({team:TEAM.ALLY},null)||this.enemies.find(character=>this.isAlive(character));
    const target=this.selectLiveTarget(attacker,this.allies[targetIndex%this.allies.length]);
    if(!attacker||!target)return false;
    this.updateStatus(`적 반격 · ${target.name} 방어 판정`);
    await this.normalAttack(0,{damage:74210,critical:false,attacker,target,targetHp:Math.max(1,target.hp-18)});
    await this.showBanner('강철의 수호 · 치명상 방지',0x69ddff,'방어효과 발동');
  }

  async playUltimate({target=null,targetHp=null}={}){
    const card=this.cards[2];
    const actor=this.allies[2];
    const victim=this.selectLiveTarget(actor,target);
    if(!victim){this.updateStatus('궁극기 대상이 없습니다.');return false}
    this.updateStatus('ZENITH 우선 발동 · 기존 궁극기 영상과 Pixi 타격 연계');
    await this.showBanner('천상개화 · 월하난무',0xc79aff,'궁극기 발동');
    const overlay=document.getElementById('pvUltimateLayer');
    const video=document.getElementById('pvUltimateVideo');
    if(overlay&&video&&!this.reducedMotion){
      overlay.classList.add('is-visible');
      video.currentTime=0;
      video.muted=true;
      const ended=new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(done)return;done=true;video.removeEventListener('ended',finish);resolve()};
        video.addEventListener('ended',finish,{once:true});
        setTimeout(finish,Math.round(2100/PLAYBACK_SPEED));
      });
      await video.play().catch(()=>{});
      await ended;
      overlay.classList.remove('is-visible');
      video.pause();
    }
    await this.skillTimeline.play({
      attacker:actor,
      target:victim,
      enemies:this.enemies,
      damage:964200,
      critical:true,
      title:'쁠리',
      subtitle:'천상개화 · 월하난무',
      accent:0xc08aff,
      effectProfile:'MOON_BLOOM',
      effectKind:'ATTACK',
      targetClass:victim.isBoss?'BOSS':'MONSTER',
      onImpact:()=>this.syncTargetHp(victim,hasFiniteNumber(targetHp)?Number(targetHp):victim.hp-38)
    });
  }

  captureLivePreviewRosterState(){
    return {
      characters:this.characters.map(character=>({
        character,
        battleActive:character.battleActive,
        visible:character.root.visible,
        renderable:character.root.renderable,
        alpha:character.root.alpha,
        hp:character.hp,
        shield:character.shield,
        maxShield:character.maxShield
      })),
      cards:this.cards.map(card=>({
        card,
        visible:card.visible,
        renderable:card.renderable,
        alpha:card.alpha,
        hpValue:card.hpValue
      })),
      currentEnemyTarget:this.currentEnemyTarget,
      currentAllyTarget:this.currentAllyTarget,
      boss:this.boss,
      bossHp:this.bossHp,
      accountAlpha:this.accountBattleUnit?.root?.alpha??0
    };
  }

  restoreLivePreviewRosterState(snapshot){
    if(!snapshot)return false;
    snapshot.characters.forEach(({character,battleActive,visible,renderable,alpha,hp,shield,maxShield})=>{
      character.battleActive=battleActive;
      character.root.visible=visible;
      character.root.renderable=renderable;
      character.root.alpha=alpha;
      character.root.position.set(character.baseX,character.baseY);
      character.root.scale.set(character.restScale);
      character.root.rotation=0;
      character.root.tint=0xffffff;
      character.root.filters=[];
      character.setTint?.(0xffffff);
      character.setState(CHARACTER_STATE.IDLE);
      character.setHp(hp);
      character.setShield?.(shield,maxShield);
    });
    snapshot.cards.forEach(({card,visible,renderable,alpha,hpValue})=>{
      card.visible=visible;
      card.renderable=renderable;
      card.alpha=alpha;
      card.position.set(card.baseX,card.baseY);
      card.scale.set(card.restScale);
      card.rotation=0;
      card.hpValue=hpValue;
      if(card.hp)this.setHp(card.hp,hpValue,0x64e3a9);
    });
    this.currentEnemyTarget=snapshot.currentEnemyTarget;
    this.currentAllyTarget=snapshot.currentAllyTarget;
    this.boss=snapshot.boss;
    this.bossHp=snapshot.bossHp;
    if(this.accountBattleUnitEnabled&&this.accountBattleUnit?.active){
      this.accountBattleUnit.cancelFire();
      this.accountBattleUnit.root.visible=true;
      this.accountBattleUnit.root.renderable=true;
      this.accountBattleUnit.root.alpha=snapshot.accountAlpha;
    }
    this.sortCombatDepth();
    return true;
  }

  async runSequence(){
    if(this.playing||!this.visible)return;
    const previewRosterSnapshot=this.captureLivePreviewRosterState();
    this.playing=true;
    const button=document.getElementById('pvBattleStart');
    if(button){button.disabled=true;button.textContent='전투 연출 중'}
    this.cancelTimelines();
    this.playing=true;
    this.currentEnemyTarget=this.enemies[1]||this.enemies[0]||null;
    this.boss=this.currentEnemyTarget;
    this.currentAllyTarget=this.allies[0]||null;
    this.lastTargetSwitch=null;
    this.bossHp=72;
    this.cards.forEach((card,index)=>{
      card.alpha=0;
      card.position.set(card.baseX,card.baseY);
      card.scale.set(card.restScale);
      card.hpValue=CARD_DATA[index].hp;
      this.setHp(card.hp,card.hpValue,0x64e3a9);
    });
    this.characters.forEach(character=>{
      character.root.alpha=0;
      character.root.position.set(character.baseX,character.baseY);
      character.root.scale.set(character.restScale);
      character.setState(CHARACTER_STATE.IDLE);
      character.setHp(character.team===TEAM.ENEMY&&character===this.boss?72:100);
    });
    this.uiLayer.combo.alpha=0;
    this.uiLayer.comboLabel.alpha=0;
    try{
      this.uiLayer.combo.alpha=1;this.uiLayer.comboLabel.alpha=1;this.uiLayer.combo.text='1';
      await this.playEvents([{type:'DEPLOY'}],{forceDeploy:true});
      this.startAccountBattleUnitSustainedFire();
      await this.playEvents([
        {type:'TURN',actorId:'A:SUPPORT:BATTLE_SUIT:QC',actorKind:'BATTLE_SUIT',damageSource:'BATTLE_SUIT_INDEPENDENT',damage:118400,critical:false,bossHp:67},
        {type:'ATTACK',actorIndex:1,damage:238150,critical:false,bossHp:62},
        {type:'TURN',actorId:'A:SUPPORT:BATTLE_SUIT:QC',actorKind:'BATTLE_SUIT',damageSource:'BATTLE_SUIT_INDEPENDENT',damage:126900,critical:true,bossHp:54},
        {type:'SKILL',actorIndex:0,damage:386720,critical:true,bossHp:44,label:'전술 스킬'},
        {type:'COUNTER',actorIndex:3},
        {type:'TURN',actorId:'A:SUPPORT:BATTLE_SUIT:QC',actorKind:'BATTLE_SUIT',damageSource:'BATTLE_SUIT_INDEPENDENT',damage:109700,critical:false,bossHp:34},
        {type:'ULTIMATE',actorIndex:2,damage:964200,targetHp:0},
        {type:'ATTACK',actorIndex:3,damage:194800,critical:false,targetHp:78}
      ]);
      this.updateStatus(`연출 완료 · 사망 대상 제외 후 ${this.currentEnemyTarget?.name||'다음 대상 없음'} 자동 전환 확인`);
    }finally{
      await this.stopAccountBattleUnitSustainedFire();
      this.playing=false;
      if(this.restoreLivePreviewRosterState(previewRosterSnapshot)){
        this.updateStatus('연출 완료 · 아군 5명·적·계정 유닛 진형 복구');
      }
      if(button){button.disabled=false;button.textContent='다시 재생'}
    }
  }

  async playSingleSkill(index){
    if(this.playing||!this.visible)return;
    this.playing=true;
    try{await this.playTacticalSkill(index,{damage:128000+index*74120,critical:index===0||index===2})}finally{this.playing=false}
  }

  async verifyTargetSwitch(){
    if(this.playing||!this.visible)return false;
    this.playing=true;
    const button=document.getElementById('pvBattleRetarget');
    if(button){button.disabled=true;button.textContent='검증 중'}
    try{
      const first=this.enemies[1]||this.enemies[0];
      const next=this.enemies.find(character=>character!==first)||null;
      this.enemies.forEach(character=>{character.setState(CHARACTER_STATE.IDLE);character.setHp(character===first?1:100);character.root.alpha=1});
      this.currentEnemyTarget=first;
      this.boss=first;
      this.bossHp=first?.hp||0;
      this.lastTargetSwitch=null;
      await this.normalAttack(0,{damage:128000,critical:true,target:first,targetHp:0});
      const selected=this.selectLiveTarget(this.allies[1]||this.allies[0]);
      const passed=Boolean(selected&&selected!==first&&this.isAlive(selected));
      if(passed)await this.normalAttack(1,{damage:88400,critical:false,target:selected,targetHp:Math.max(1,selected.hp-12)});
      this.updateStatus(passed?`타깃 전환 PASS · ${first.name} → ${selected.name}`:'타깃 전환 FAIL · 생존 대상 재선택 필요');
      return {passed,from:first?.id||null,to:selected?.id||null,expected:next?.id||null};
    }finally{
      this.playing=false;
      if(button){button.disabled=false;button.textContent='타깃 전환 검증'}
    }
  }

  bindControls(){
    document.getElementById('pvBattleStart')?.addEventListener('click',()=>this.runSequence());
    document.getElementById('pvBattleRetarget')?.addEventListener('click',()=>this.verifyTargetSwitch());
    document.getElementById('pvBattleUnique')?.addEventListener('click',event=>{
      const index=this.uniquePreviewIndex%this.allies.length;
      this.uniquePreviewIndex=(index+1)%this.allies.length;
      event.currentTarget.textContent=`다음 고유효과 · ${this.cards[this.uniquePreviewIndex]?.data?.name||'FAKER'}`;
      void this.playSingleSkill(index);
    });
    document.getElementById('pvBattleAuto')?.addEventListener('click',event=>{
      this.autoMode=!this.autoMode;
      event.currentTarget.classList.toggle('is-active',this.autoMode);
      event.currentTarget.setAttribute('aria-pressed',String(this.autoMode));
    });
  }

  resize(){
    if(!this.app||!this.root)return;
    const viewportWidth=this.app.screen.width;
    const viewportHeight=this.app.screen.height;
    this.mobile=viewportWidth<=760;
    this.scene=this.mobile?{...MOBILE}:{...DESKTOP};
    this.camera.setViewport(this.scene.width,this.scene.height);
    this.skillTimeline.width=this.scene.width;
    this.skillTimeline.height=this.scene.height;
    this.layoutParallax(this.scene.width,this.scene.height);
    this.configureIsometricScene();
    this.drawIsometricFloor();
    if(this.bottomShade){this.bottomShade.width=this.scene.width;this.bottomShade.height=this.mobile?430:250;this.bottomShade.y=this.scene.height-this.bottomShade.height}
    if(this.mobile){
      this.cards.forEach((card,index)=>{card.baseX=47+index*195;card.baseY=1100+[12,5,-5,5,12][index];card.position.set(card.baseX,card.baseY);card.restScale=.78;card.scale.set(card.restScale)});
      this.uiLayer.statusPanel.position.set(225,1354);this.uiLayer.status.position.set(525,1375);
      this.uiLayer.banner.position.set(235,150);
      this.uiLayer.comboLabel.position.set(812,735);this.uiLayer.combo.position.set(812,752);
    }else{
      this.cards.forEach((card,index)=>{card.baseX=570+index*104;card.baseY=665+[8,3,-4,3,8][index];card.position.set(card.baseX,card.baseY);card.restScale=.5;card.scale.set(card.restScale)});
      this.uiLayer.statusPanel.position.set(440,758);this.uiLayer.status.position.set(740,779);
      this.uiLayer.banner.position.set(510,118);
      this.uiLayer.comboLabel.position.set(1030,96);this.uiLayer.combo.position.set(1030,105);
    }
    this.layoutObjectiveHud();
    this.layoutCharacterGrid();
    this.sortCombatDepth();
    const scale=Math.min(viewportWidth/this.scene.width,viewportHeight/this.scene.height);
    this.root.scale.set(scale);
    this.root.position.set((viewportWidth-this.scene.width*scale)/2,(viewportHeight-this.scene.height*scale)/2);
  }

  async setVisible(next){
    this.requestedVisible=Boolean(next);
    if(!this.mounted&&this.requestedVisible)await this.mount();
    if(!this.app)return;
    this.visible=this.requestedVisible&&!document.hidden;
    if(this.visible){
      this.app.start();
      this.accountBattleUnit?.startIdle();
      // Audio must not compete with Pixi/character assets during renderer
      // construction. Start it only after the battlefield has become visible.
      this.audio?.schedulePreload?.();
      if(!this.livePayload&&this.cards.every(card=>card.alpha===0))await this.deployCards();
    }else{
      this.cancelTimelines();
      this.accountBattleUnit?.stopIdle();
      this.app.stop();
      // Explicit battle/modal close releases optional advancement GPU/audio
      // assets. A visibilitychange calls setVisible(requestedVisible), so a
      // brief hidden tab keeps requestedVisible=true and avoids re-downloading.
      if(!this.requestedVisible)await this.releaseOptionalAdvancementAssets();
    }
  }

  diagnostics(){
    return {
      mounted:this.mounted,
      visible:this.visible,
      playing:this.playing,
      renderer:this.app?.renderer?.type||'unknown',
      resolution:this.app?.renderer?.resolution||1,
      pools:this.pools?.stats()||[],
      layerOrder:this.stage?.children.map(layer=>layer.label)||[],
      backgroundDepth:this.parallaxLayers.map(item=>({layer:item.label,coefficient:item.coefficient})),
      battlefield:{
        mode:this.activeBattlefieldMode,
        asset:this.activeBattlefieldAsset,
        loading:'LAZY_ACTIVE_SCENE_ONLY',
        available:Object.keys(BATTLEFIELD_ASSETS)
      },
      objectiveHud:{
        native:true,
        visible:Boolean(this.objectiveHud?.visible),
        hp:Number(this.objectiveData?.hp??this.objectiveData?.hpAfter??0),
        maxHp:Number(this.objectiveData?.maxHp||0),
        ratio:Number(this.objectiveHud?.hpRatio||0)
      },
      formation:{allies:this.allies.length,enemies:this.enemies.length},
      accountBattleUnit:{
        ...(this.accountBattleUnit?.diagnostics?.()||{active:false,id:'ACCOUNT_BATTLE_UNIT'}),
        enabled:this.accountBattleUnitEnabled,
        pveOnly:true,
        pvePower:Number(this.battleData?.characterBonus?.battleSuitPve??this.accountBattleUnitEquipment?.battleSuit?.pvePower??0),
        metadataContract:['equippedBattleSuit','equippedWeapon'],
        metadataFallback:'characterBonus',
        canonicalAllyFormationCount:this.allies.length,
        cosmeticShots:this.accountBattleUnitShotCount,
        affectsDamage:true,
        damageAuthority:'SERVER_BATTLE_V2_TIMELINE',
        authoritativeDamageEvents:this.accountBattleUnitDamageEventCount,
        authoritativeDamageTotal:this.accountBattleUnitDamageTotal,
        formation:{
          gridX:this.accountBattleUnitFormation().gridX,
          gridY:this.accountBattleUnitFormation().gridY
        },
        sustainedFire:{
          active:Boolean(this.accountBattleUnitFireRun?.active),
          ...this.accountBattleUnitSustainedFireProfile(),
          totalShots:this.accountBattleUnitSustainedShotCount,
          queuedDamageEvents:this.accountBattleUnitDamageQueue?.length||0,
          independentOfCardTurns:true,
          independentOfActionGauge:true,
          affectsDamage:false
        }
      },
      targetSelection:{
        currentEnemy:this.currentEnemyTarget?.id||null,
        currentAlly:this.currentAllyTarget?.id||null,
        aliveEnemies:this.enemies.filter(character=>this.isAlive(character)).map(character=>character.id),
        lastSwitch:this.lastTargetSwitch
      },
      projection:{type:'ISOMETRIC',grid:ISO_GRID,config:this.isoConfig},
      depthSorting:'REALTIME_SCREEN_Y',
      billboard:{
        layer:this.combatLayer?.label,
        rotation:this.combatLayer?.rotation??0,
        scale:[this.combatLayer?.scale.x??1,this.combatLayer?.scale.y??1],
        floorProjectionInherited:false
      },
      characterAssetContract:{
        width:256,
        height:384,
        anchor:[.5,1],
        localOrigin:'SOLE_CENTER',
        skinSlots:AVATAR_LAYER_ORDER,
        animation:'INTACT_SD_FULL_BODY_SPRITE'
      },
      effectSystem:{
        renderer:'SkillEffectFX',
        layer:'EffectLayer',
        mode:'ROLE_ATLAS_V2_PLUS_SERVER_ADVANCEMENT_V1',
        kinds:['ATTACK','DEFENSE','SPEED','HP'],
        blendModes:['screen','normal'],
        roleFx:SkillEffectFX.diagnostics(),
        advancementFx:AdvancementEffectFX.diagnostics(),
        apocalypseBossUltimateFx:ApocalypseBossUltimateFX.diagnostics(),
        apocalypseBossUltimateActive:this.apocalypseMode,
        apocalypseBossUltimateLoadTimeouts:this.apocalypseBossUltimateLoadTimeouts,
        advancementActivation:['SHATTER:TURN','AFTERIMAGE:DODGE_TURN','RIPOSTE:COUNTER','IMMORTAL:ADVANCEMENT'],
        bossUltimateAdvancementFx:false,
        advancementImpactAtMs:{SHATTER:420,RIPOSTE:460,AFTERIMAGE:320,IMMORTAL:500},
        advancementWhiteFlash:{scope:'FULL_STAGE',durationMs:50,alpha:.26},
        advancementLoading:LOW_MEMORY_DEVICE?'ON_DEMAND_SINGLE_ATLAS':'BACKGROUND_TIMELINE_CODES',
        advancementLoadDeadlineMs:ADVANCEMENT_LOAD_DEADLINE_MS,
        advancementLoadTimeouts:this.advancementLoadTimeouts,
        playbackEpoch:this.playbackEpoch,
        damageTypography:'ROLE_AWARE_BITMAP_TEXT',
        audio:this.audio?.diagnostics?.(),
        collisionAtMs:[250,350],
        whiteFlashMs:50,
        releasePolicy:'AUTHORED_TAIL'
      },
      characterStates:this.characters.map(character=>({
        id:character.id,
        state:character.state,
        team:character.team,
        anchor:[.5,1],
        gridPosition:character.gridPosition,
        perspectiveDepth:character.perspectiveDepth,
        facingX:Math.sign(character.view.scale.x),
        shield:character.shield,
        maxShield:character.maxShield,
        rig:character.rigDiagnostics?.()
      }))
    };
  }

  destroy(){
    this.cancelTimelines();
    document.removeEventListener('visibilitychange',this.onVisibility);
    if(this.moteTicker)this.app?.ticker.remove(this.moteTicker);
    if(this.parallaxTicker)this.app?.ticker.remove(this.parallaxTicker);
    if(this.depthTicker)this.app?.ticker.remove(this.depthTicker);
    this.skillTimeline?.destroy();
    this.camera?.destroy();
    this.pools?.destroy();
    this.audio?.destroy();
    this.accountBattleUnit?.destroy();
    this.accountBattleUnit=null;
    this.accountBattleUnitEnabled=false;
    this.accountBattleUnitEquipment={battleSuit:null,weapon:null};
    this.advancementCodes.clear();
    this.advancementReadyPromise=Promise.resolve(false);
    this.apocalypseMode=false;
    this.apocalypseBossUltimateReadyPromise=Promise.resolve(false);
    // Role atlases are global live assets, but advancement atlases are loaded
    // per authoritative timeline. Leaving V3 must release those optional GPU
    // textures so a completed battle does not tax the next mobile screen.
    void AdvancementEffectFX.retain([]);
    void ApocalypseBossUltimateFX.release();
    this.app?.destroy(true,{children:true,texture:false});
    this.app=null;
    this.cards=[];
    this.boss=null;
    this.mounted=false;
  }
}
