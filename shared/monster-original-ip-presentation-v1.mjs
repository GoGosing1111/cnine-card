import {ORIGINAL_IP_MONSTERS} from './monster-original-ip-data-v1.mjs';

// Presentation only: never change persisted IDs, skill codes, combat or receipts.
export const ORIGINAL_IP_VERSION='20261013-original-ip-v1';
const hunt=new Map(ORIGINAL_IP_MONSTERS.flatMap(e=>e.monsterIds.map(id=>[id,e])));
const raids=new Map(ORIGINAL_IP_MONSTERS.filter(e=>e.raidId).map(e=>[e.raidId,e]));
const codes=new Map(ORIGINAL_IP_MONSTERS.filter(e=>e.raidCode).map(e=>[e.raidCode,e]));
const raidNames=new Map(ORIGINAL_IP_MONSTERS.filter(e=>e.scope==='RAID'||e.raidId||e.raidCode).flatMap(e=>[e.name,...e.previousNames].map(name=>[name,e])));
const skills=[['팔문둔갑 · 야가이','홍룡 돌격'],['목둔 · 목룡 강림','고목룡 강림'],['스사노오','수호령'],['아마테라스','흑염'],['츠쿠요미','환야'],['신라천정','천공 반발'],['지폭천성','중력 봉인'],['해의 호흡','태양 검식'],['해의호흡','태양검식'],['월아천충','흑월 파동'],['무월','흑월'],['패왕색','군왕의 기백'],['견문색','예지'],['기어5','태양 각성'],['기어 5','태양 각성']];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const originalHuntPresentation=id=>hunt.get(Number(id))||null;
export const originalRaidPresentation=id=>raids.get(Number(id))||codes.get(String(id))||raidNames.get(String(id))||null;
export const originalSkillLabel=text=>skills.reduce((s,[a,b])=>s.replaceAll(a,b),String(text??''));
export function originalMonsterPresentation(unit={},kind=''){
  if(!unit||typeof unit!=='object')return null;
  if(unit.originalIpKey)return ORIGINAL_IP_MONSTERS.find(e=>e.key===unit.originalIpKey)||null;
  for(const value of [unit.cardId,unit.monsterId,unit.monster_id,unit.linked_battle_monster_id]){
    const raw=String(value??'');
    const weekly=raw.match(/^(?:MONSTER:)?RAID:(\d+):BOSS$/);
    if(weekly)return raids.get(Number(weekly[1]))||null;
    if(codes.has(raw))return codes.get(raw);
    const special=raw.match(/(?:^|:)MONSTER:(MADARA|LICH_KING|CORE_RAID_BOSS|CORE_ARCHEON)$/);
    if(special)return codes.get(special[1].startsWith('CORE_')?'CORE_PROTOCOL':special[1]);
    if(raw==='CORE_ARCHEON')return codes.get('CORE_PROTOCOL');
    const id=raw.match(/^(?:MONSTER:)?(\d+)$/)?.[1];
    if(id&&hunt.has(Number(id)))return hunt.get(Number(id));
  }
  if(kind==='monster')return hunt.get(Number(unit.id))||codes.get(String(unit.id))||(unit.id==='CORE_ARCHEON'?codes.get('CORE_PROTOCOL'):null)||raids.get(Number(String(unit.id).match(/^RAID:(\d+):BOSS$/)?.[1]))||null;
  if(kind==='raid')return raidNames.get(String(unit.bossName??unit.boss_name??unit.name))||codes.get(String(unit.code))||raids.get(Number(unit.bossId??unit.boss_id??unit.id))||null;
  return null;
}
export function presentOriginalMonster(unit,entry=originalMonsterPresentation(unit)){
  if(!entry)return unit;
  const result={...unit,originalIpKey:entry.key,originalCardArt:entry.sourceArt};
  for(const key of ['name','title'])if(own(unit,key))result[key]=entry.name;
  for(const key of ['image','image_url','imageUrl','sourceArt','originalCardArt'])if(own(unit,key))result[key]=entry.sourceArt;
  result.battleSprite=entry.battleSprite;
  result.projectVMonsterArt={...unit.projectVMonsterArt,scope:'BATTLE_ENGINE_ONLY',kind:unit.projectVMonsterArt?.kind||'MONSTER_SD',name:entry.name,
    primaryUrl:entry.battleSprite,pngFallbackUrl:entry.battleSprite,footAnchor:entry.footAnchor,objectFit:'contain',objectPosition:'50% 100%',technicalPass:true,approved:true};
  for(const key of ['ultimateMediaUrl','ultimate_media_url','ultimateSoundUrl','ultimate_sound_url'])if(own(unit,key))result[key]='';
  for(const key of ['ultimateName','ultimate_name','ultimateDescription','ultimate_description','ultimateWarningText','ultimate_warning_text'])if(own(unit,key))result[key]=originalSkillLabel(unit[key]);
  return result;
}

// This projection is installed only at the selected content response boundary.
// Old saved rooms/receipts receive current art without mutating their gameplay snapshot.
export function presentOriginalIpResponse(path,data){
  if(path==='live-operations'&&Array.isArray(data?.items))return {...data,items:data.items.map(item=>{
    if(item.kind!=='RAID')return item;
    const entry=originalRaidPresentation(item.title);
    return entry?{...item,title:entry.name}:item;
  })};
  if(!/^(?:(?:battle|tower|rift|raid)(?:\/|$)|admin\/(?:battle|tower|raid)(?:[-/]|$))/.test(path)||!data||typeof data!=='object')return data;
  const special=/^(?:admin\/)?raid\/madara\//.test(path)?codes.get('MADARA'):/^(?:admin\/)?raid\/lich\//.test(path)?codes.get('LICH_KING'):/^(?:admin\/)?raid\/core(?:[-/]|$)/.test(path)?codes.get('CORE_PROTOCOL'):null;
  const raidRoute=/^(?:admin\/)?raid(?:[-/]|$)/.test(path);
  const main=originalMonsterPresentation(data.monster,'monster')||originalMonsterPresentation(data.current,'raid')||special;
  function visit(value,key='',parentEntry=main){
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(row=>visit(row,key,parentEntry));
    const monsterKind=['monster','monsters','operatingFloor'].includes(key)?'monster':'';
    const raidKind=raidRoute&&['bosses','weeklyBosses','todayBoss','current','rooms','bossProfile'].includes(key)?'raid':'';
    let entry=originalMonsterPresentation(value,monsterKind||raidKind);
    if(!entry&&special&&/^MONSTER:CORE_(?:RAID_)?BOSS$/.test(String(value.cardId||'')))entry=special;
    const isUnit=Boolean(entry&&(monsterKind||value.isMonster||/MONSTER:/.test(String(value.cardId||''))));
    const isFloor=Boolean(entry&&!isUnit&&(own(value,'monsterName')||own(value,'monster_name')||own(value,'monsterImage')||own(value,'monster_image')));
    const raidEntry=raidKind?entry:(special&&own(value,'bossName')?special:null);
    const owner=entry||parentEntry;
    const out={};
    for(const [k,v]of Object.entries(value))out[k]=visit(v,k,owner);
    if(isUnit)Object.assign(out,presentOriginalMonster(out,entry));
    if(raidRoute&&key==='minions'){
      const minionEntry={PAIN_ANIMAL:hunt.get(30),PAIN_ASURA:hunt.get(15),FLAME_DISCIPLE:hunt.get(26),MOON_DISCIPLE:hunt.get(31),HOLLOW_REAPER:raids.get(8),SOUL_CAPTAIN:hunt.get(29)}[value.code??value.id];
      if(minionEntry){out.battleSprite=minionEntry.battleSprite;if(own(out,'sprite'))out.sprite=minionEntry.battleSprite;if(own(out,'image'))out.image=minionEntry.battleSprite;if(value.code==='HOLLOW_REAPER')out.name='흑월의 망령';}
    }
    if(special?.raidCode==='CORE_PROTOCOL'&&/^(?:MONSTER:)?CORE_NODE_/.test(String(value.cardId||value.id||''))){
      Object.assign(out,presentOriginalMonster(out,special));
      for(const k of ['name','title'])if(own(value,k))out[k]=value[k];
    }
    if(isFloor){
      for(const k of ['monsterName','monster_name'])if(own(out,k))out[k]=entry.name;
      for(const k of ['monsterImage','monster_image'])if(own(out,k))out[k]=entry.sourceArt;
    }
    if(raidEntry){
      for(const k of ['bossName','boss_name','name'])if(own(out,k))out[k]=raidEntry.name;
      for(const k of ['bossImage','boss_image','image','image_url','sourceArt'])if(own(out,k))out[k]=raidEntry.sourceArt;
      if(own(out,'bossName')||own(out,'bossBattleSprite'))out.bossBattleSprite=raidEntry.battleSprite;
      if(own(out,'battleSprite'))out.battleSprite=raidEntry.battleSprite;
    }
    if(owner&&['bossUltimate','ultimate','skill'].includes(key)){
      for(const k of ['mediaUrl','soundUrl'])if(own(out,k))out[k]='';
      for(const k of ['name','description','warningText'])if(own(out,k))out[k]=originalSkillLabel(out[k]);
      if(key==='bossUltimate')out.presentation='V3_EXISTING_EFFECT';
    }
    if(owner&&value.type==='BOSS_ULTIMATE'&&own(out,'label'))out.label=originalSkillLabel(out.label);
    return out;
  }
  return visit(data);
}
