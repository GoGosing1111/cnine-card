import fs from 'node:fs';
import {buildFighter,publicFighter,simulateBattleV2Preview,createPveBattleV2} from '../../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../../functions/_mercenary_combat.js';
import {operatingMercenaries} from '../../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {MAGIC_S2_RULES,MAGIC_SEASON2_REVIEW,magicS2Card} from '../../shared/magic-season2-v1.mjs';

const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const available=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../../assets/ui/project-v/characters/'+p,import.meta.url)));
 return manifest.characters.map(c=>({...c,grade:manifest.rarity}));
});
export const reviewDeck=IDS.map(id=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('APPROVED_CARD_MISSING');
 return {id,name:c.member,title:c.title,rarity:c.grade,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:100000,power_type:'NONE'};
});

// Deterministic trigger fixtures, using real card identities/art and the actual
// server combat implementation. Modified starting HP/speed is labelled in UI.
// No live user, inventory, reward or season settings are read or written.
export function makeReviewBattle(code,level=0){
 const A=reviewDeck.map((card,i)=>({...buildFighter(card,i,'A'),maxHp:100000,hp:100000,attack:9000,defense:1000,speed:100,shield:0,maxShield:0}));
 const B=reviewDeck.map((card,i)=>({...buildFighter(card,i,'B'),maxHp:100000,hp:100000,attack:9000,defense:1000,speed:90,shield:0,maxShield:0}));
 let slot=1,magicB=[],note='동일 전투력의 5장 편성으로 발동 조건과 횟수를 확인합니다.';
 if(code==='S2_CAUSAL_SEVER'){A[0].speed=500;for(const b of B){b.shield=80000;b.maxShield=80000;b.defense=12000;}note='장착자 속도를 높여 3·6번째 공격의 관통을 확인합니다.';}
 if(['S2_FATE_INTERCEPT','S2_FALLEN_STAR'].includes(code)){slot=5;A[0].hp=100;A[1].hp=100;B[0].speed=600;note='전열 2장을 낮은 HP로 시작해 치명 피해·최종 사망을 확인합니다.';}
 if(code==='S2_OVERHEAL_FORGE'){slot=5;A[0].type='HP';A[0].speed=600;A[0].hp=99900;note='회복 풀을 가진 생명형의 작은 HP 손실을 회복해 초과 회복을 확인합니다.';}
 if(code==='S2_CONSTELLATION_SHIFT'){slot=5;A[0].hp=1000;A[1].hp=1000;note='전열 HP를 낮춰 전투 중 실제 슬롯·후열 교대를 확인합니다.';}
 if(code==='S2_SHIELD_LEDGER'){A[0].speed=500;for(const b of B){b.shield=3000;b.maxShield=3000;}note='적 보호막을 장착자의 직접 공격으로 파괴해 기록·폭발을 확인합니다.';}
 if(code==='S2_ARCANE_MIRROR'){slot=5;B[0].speed=500;magicB=[{slotNo:1,code:'S1_CHAIN_ECHO',effectType:'CHAIN_ECHO',name:'연쇄의 잔영',triggerChance:100,effectValue:45,maxActivations:2}];note='상대 S1 연쇄의 잔영을 확정 발동시켜 실제 성공 이벤트의 복제를 확인합니다.';}
 if(['S2_CONTRACT_EROSION','S2_COMMAND_SEVERANCE'].includes(code)){
  const merc=buildMercenaryFighter(structuredClone(operatingMercenaries.find(c=>c.code==='V-021')),'B','PVP',buildFighter);
  if(!merc)throw Error('OPERATING_MERCENARY_MISSING');B.push(merc);note='운영 기준 오메가-X의 스킬 배정을 사용합니다. 피해 약화·봉쇄는 용병 자신의 행동 후 해제됩니다.';
 }
 const result=simulateBattleV2Preview({teamA:A,teamB:B,magicA:[magicS2Card(code,slot,level)],magicB,seed:31,maxActions:55,singleHealerBonus:{enabled:false},[MAGIC_SEASON2_REVIEW]:true});
 const mercenaries={A:result.final.A.filter(c=>c.isMercenary),B:result.final.B.filter(c=>c.isMercenary)};
 result.final={A:result.final.A.filter(c=>!c.isMercenary),B:result.final.B.filter(c=>!c.isMercenary),mercenaries};
 const teams=Object.fromEntries([['A',A],['B',B]].map(([side,team])=>[side,{cards:team.filter(c=>!c.isMercenary).map(publicFighter),mercenaries:result.openingMercenaries?.[side]||[]}])) ;
 return {previewOnly:true,title:MAGIC_S2_RULES[code].name,mode:'PVP',battlefieldMode:'PVP',review:{code,level,note,seed:31,stagedTrigger:true},battleV2:{schemaVersion:2,mode:'PVP',engine:'BATTLE_ENGINE_V2_S2_REVIEW',rules:{formation:'FRONT_2_BACK_3'},teams,result}};
}
export function makePveReview(){return createPveBattleV2({cards:reviewDeck,magicCards:[magicS2Card('S2_ECLIPSE_PROPHECY'),magicS2Card('S2_CAUSAL_SEVER',2),magicS2Card('S2_COMMAND_SEVERANCE',3)],monster:{id:888,name:'시즌2 검수 몬스터',power:1000000,hp:3000000,attack:15000,defense:1500},seed:31,[MAGIC_SEASON2_REVIEW]:true});}
