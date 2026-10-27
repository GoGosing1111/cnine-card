import {DUAL_REVIEW_CARDS} from '../../functions/_companion_preparation.js';
import {reviewMercenaries} from './companion-preparation-fixture.mjs';
import {COMPANION_PREPARATION_REVIEW as REVIEW} from '../../shared/companion-loadout-v2.mjs';
import {createPveBattleV2,createDuoBattleV2} from '../../functions/_battle_v2_preview.js';
import {buildScrapyardV3Battle} from '../../functions/_scrapyard_v3.js';
import {buildCowRoomBattle} from '../../functions/_cow_room_v3.js';
import {buildTowerV3Battle} from '../../functions/_tower_v3.js';
import {buildIdleV3Playback} from '../../functions/_idle_v3_playback.js';
import {buildCoreRaidBattlePayload,defaultCoreRaidSettings} from '../../functions/_raid_core_protocol.js';
import {createHuntSession} from '../../preview/sustained-hunt-v2/session.mjs';
import {createCooperativeBattle} from '../../functions/_cooperative_battle.js';
import {createLichRoom,addLichMember,setLichLoadout,lichBattlePayload} from '../../functions/_raid_lich_king.js';
import {createMadaraRoom,addMadaraMember,madaraBattlePayload} from '../../functions/_raid_madara.js';
import {createBlackwingRoom,addBlackwingMember,blackwingBattlePayload} from '../../functions/_raid_blackwing.js';
export const pair=reviewMercenaries().slice(0,2);
export function snapshot({dual=true,power=1e6}={}) {
 const cards=DUAL_REVIEW_CARDS.map(c=>({...c,power}));
 return {cards,ids:cards.map(c=>c.id),...(dual?{mercenaries:structuredClone(pair),[REVIEW]:true}:{mercenary:structuredClone(pair[0])}),
   accountNickname:'2명 편성 검수',characterBonus:{pve:0},cardSupportBonus:0,magicCards:[],
   power:{cards:power*5,equipment:0,battleSuit:0,mercenary:300000},singleHealerBonus:{},ultimateDamage:0};
}
export function ownerSquads({count=3,dual=true,cards=2,power=1e6}={}) {
 return Array.from({length:count},(_,i)=>{const s=snapshot({dual,power});return {ownerId:i+1,ownerName:'검수 분대 '+(i+1),cards:s.cards.slice(0,cards),...(dual?{mercenaries:s.mercenaries}:{mercenary:s.mercenary}),equipmentBonus:0};});
}
export const reviewBoss={id:'REVIEW-BOSS',name:'검수 보스',battle_power:45000000,is_boss:1,
 image:'/assets/ui/project-v/monsters/cow-room/cow-king-sd-v1.png',battleSprite:'/assets/ui/project-v/monsters/cow-room/cow-king-sd-v1.png'};
export function contentPayloads({dual=true,seed=28,power=1e6,legion=true}={}) {
 const s=snapshot({dual,power}),review=dual?{[REVIEW]:true}:{},out={};
 for(const difficulty of ['NORMAL','NIGHTMARE','APOCALYPSE'])out[difficulty]={mode:'HUNT',monster:reviewBoss,battleV2:createPveBattleV2({...s,characterBonus:0,monster:{...reviewBoss,pve_difficulty:difficulty},seed})};
 out.SCRAPYARD=buildScrapyardV3Battle({snapshot:s,difficulty:{id:'OUTER',requiredPowerStart:500000,requiredPowerEnd:10000000,waves:5},seed});
 out.COW=buildCowRoomBattle({snapshot:s,seed});
 out.TOWER=buildTowerV3Battle({snapshot:s,tier:80,seed});
 for(const win of [true,false])out['IDLE_'+(win?'WIN':'LOSS')]=buildIdleV3Playback(s,{encounter:{monster:reviewBoss,canClear:win,requiredPower:1e6,effectiveFloorSeconds:10},progress:{difficulty:'NORMAL',currentFloor:5,resets:0,running:true},serverNow:1000});
 for(const stage of ['CORE','BOSS'])out['CORE_'+stage]=buildCoreRaidBattlePayload({participant:{room_id:'QA',attempt_id:'QA-28',user_id:1,stage,operation:'BREAK',deck_snapshot:JSON.stringify(s)},settings:{...defaultCoreRaidSettings(),coreCombatPower:5e6,bossCombatPower:1e7},createBattle:createPveBattleV2});
 if(legion)out.LEGION=createHuntSession({snapshot:s,seed,random:()=>.5,now:()=>1000}).payload;
 const lich=createLichRoom({id:'QA-LICH',hostId:'1',cards:s.cards,monster:reviewBoss});
 addLichMember(lich,{id:'1',name:'검수',role:'ASSAULT'});setLichLoadout(lich,'1',s,'검수');out.LICH=lichBattlePayload(lich,'1');
 const madara=createMadaraRoom({id:'QA-MADARA',hostId:'1',monster:reviewBoss});addMadaraMember(madara,{id:'1',name:'검수',role:'ASSAULT',deck:s});out.MADARA=madaraBattlePayload(madara,'1');
 const blackwing=createBlackwingRoom({id:'QA-BLACKWING',hostId:'1',monster:reviewBoss});addBlackwingMember(blackwing,{id:'1',name:'검수',role:'BREAKER',deck:s});out.BLACKWING=blackwingBattlePayload(blackwing,'1');
 out.COOP=createCooperativeBattle({squads:ownerSquads({dual,power}),difficulty:'HARD',seed,...review}).payload;
 const all=ownerSquads({count:4,cards:5,dual,power});out.DUO={mode:'PVP',battleV2:createDuoBattleV2({attackerSquads:all.slice(0,2),defenderSquads:all.slice(2),seed,...review})};
 return out;
}
