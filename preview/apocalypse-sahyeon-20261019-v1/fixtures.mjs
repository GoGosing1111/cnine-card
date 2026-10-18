import assert from 'node:assert/strict';
import {createPveBattleV2} from '../../functions/_battle_v2_preview.js';
import {pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';
import {presentOriginalIpResponse} from '../../shared/monster-original-ip-presentation-v1.mjs';
import {SAHYEON,doubledProfile} from './boss.mjs';
import fur from '../../assets/ui/project-v/characters/fur/manifest-v2.json' with {type:'json'};
const types=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'];
const cardsAt=power=>types.map((power_type,i)=>({id:fur.characters[i].cardId,cardId:fur.characters[i].cardId,name:fur.characters[i].member,image:'/'+fur.characters[i].sourceArt,rarity:'FUR',power,power_type}));
export function generate(reference){
 const profile=doubledProfile(reference.referenceProfile),runtime=(id,p)=>pveDifficultyRuntime({apocalypse:{enabled:true,monsterProfiles:{[id]:p}}},{id,name:id===80?'사현':'아즈마',pve_tab:'APOCALYPSE',is_boss:1,image_url:SAHYEON.sourceArt});
 const monster=runtime(80,profile).engineMonster;
 const battleV2=createPveBattleV2({cards:cardsAt(4e6),monster,seed:83});
 const events=battleV2.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL');
 assert.deepEqual(events.map(e=>e.kind),['seal','curse','ultimate']);
 assert.equal(battleV2.teams.B.cards.length,7);assert(events[2].hits.some(h=>h.damage>0));
 const a=createPveBattleV2({cards:cardsAt(4e6),monster:runtime(78,reference.referenceProfile).engineMonster,seed:83}).teams.B.cards;
 const b=battleV2.teams.B.cards;
 const ratios=b.map((unit,i)=>({slot:i,name:unit.name,powerRatio:unit.basePower/a[i].basePower,hpRatio:unit.maxHp/a[i].maxHp,attackRatio:unit.attack/a[i].attack,defenseRatio:unit.defense/a[i].defense,shieldRatio:a[i].shield?unit.shield/a[i].shield:null,speedRatio:unit.speed/a[i].speed}));
 for(const row of ratios)for(const field of ['hpRatio','attackRatio','defenseRatio'])assert(Math.abs(row[field]-2)<.00001,field+': '+row[field]);
 const compare=[];
 for(const power of [15e6,20e6,25e6,30e6]){
  const row={cardPower:power,azumaWins:0,sahyeonWins:0,scaledSahyeonWins:0,seeds:5};
  for(const seed of [17,29,41,53,67]){
   row.azumaWins+=createPveBattleV2({cards:cardsAt(power),monster:runtime(78,reference.referenceProfile).engineMonster,seed}).result.winner==='A';
   row.sahyeonWins+=createPveBattleV2({cards:cardsAt(power),monster,seed}).result.winner==='A';
   row.scaledSahyeonWins+=createPveBattleV2({cards:cardsAt(power*2),monster,seed}).result.winner==='A';
  }
  compare.push(row);
 }
 const payload=presentOriginalIpResponse('battle/attack',{mode:'APOCALYPSE',battlefieldMode:'APOCALYPSE',monster:{...monster,name:'사현',battleSprite:SAHYEON.battleSprite},battleV2});
 // The legacy monster helper marks configured art approved. This new art is
 // review-only; preserve that distinction in every serialized draft leader.
 const markDraft=value=>{if(!value||typeof value!=='object')return;if(value.projectVMonsterArt?.name===SAHYEON.name)Object.assign(value.projectVMonsterArt,{approved:false,visualApproval:false,scope:'ISOLATED_REVIEW_ONLY'});for(const child of Object.values(value))markDraft(child);};
 markDraft(payload);
 return {payload,events:payload.battleV2.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL'),balance:{readAt:reference.readAt,referencePower:reference.referenceProfile.battlePower,power:profile.battlePower,multiplier:2,ratios,compare,interpretation:'기본 전투력과 실제 HP·공격·방어·보호막 예산 2배. 승률이나 클리어 시간의 정확한 2배를 뜻하지 않습니다.'},registrationDraft:{status:'REVIEW_ONLY',registered:false,visualApproval:false,proposedId:80,name:SAHYEON.name,profile,reference:reference.referenceProfile,acquisition:null,rewardsConfirmed:false,enabled:false}};
}
