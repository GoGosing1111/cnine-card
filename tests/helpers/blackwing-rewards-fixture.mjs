import assert from 'node:assert/strict';
import {blackwingLiveFixture} from './blackwing-live-fixture.mjs';
import {room,scale,debt,hearts,sever,ward,damage,heal,action,members} from './blackwing-scale-scenario.mjs';
import {blackwingView,tickBlackwingRoom} from '../../functions/_raid_blackwing.js';
import {ensureLootShopSchema} from '../../functions/_loot_shop.js';
import {CORE_REWARD_DEFAULT} from '../../shared/core-raid-reward-policy-v1.mjs';
export {members};
export const rewardSettings={mode:'ON',rewardsEnabled:true,weeklyRewardLimit:3,coinReward:200000000000,pigCoinReward:100,masterStarReward:2000000,petEssenceReward:5};
export const choicePolicy=()=>({...structuredClone(CORE_REWARD_DEFAULT),revision:1,enabled:true,minimum:{rewardType:'COIN',quantity:30000000000,weight:100},entries:[['SUIT_CORE_5',1,20],['SUIT_CORE_6',1,2],['EASTERN_ARMS_WEAPON_BLUEPRINT',1,2],['SECRET_WEAPON_BLUEPRINT_CHAPTER_1',1,1],['SECRET_WEAPON_BLUEPRINT_CHAPTER_2',1,1],['EMPEROR_ENERGY',2,5]].map(([rewardRef,quantity,weight])=>({rewardType:'INVENTORY_ITEM',rewardRef,quantity,weight,enabled:true}))});
export async function rewardFixture(options){
 const h=await blackwingLiveFixture(options);await ensureLootShopSchema(h.env);
 for(const code of ['PET_ESSENCE',...choicePolicy().entries.map(e=>e.rewardRef)])await h.run('INSERT INTO inventory_items(code,name,is_active) VALUES(?,?,1)',code,code);
 await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)','reward_reveal_policy_v1:BLACKWING',JSON.stringify(choicePolicy()));
 assert.equal((await h.configure(rewardSettings)).status,200);return h;
}
// Reach the actual final attack through all five mechanics in an isolated room.
export async function readyBlackwingClear(h,{createdMode='ON',startedMode=createdMode}={}){
 await h.configure({...rewardSettings,mode:createdMode});const roomId=await h.party();
 for(const[id]of members)assert.equal((await h.command('ready',{roomId,ready:true},Number(id))).status,200);
 if(startedMode!==createdMode)await h.configure({mode:startedMode});
 const begun=await h.command('start',{roomId});assert.equal(begun.status,200,JSON.stringify(begun));
 const saved=JSON.parse((await h.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);
 const r=room(123);scale(r);debt(r);damage(r);scale(r);hearts(r);damage(r);scale(r);sever(r,'WING');damage(r);
 for(const w of [0,1,0])ward(r,w);damage(r);scale(r);debt(r);heal(r);hearts(r);for(const w of [1,2])ward(r,w);
 assert.equal(r.status,'ACTIVE');assert.equal(r.phase,4);assert.equal(r.step,'DAMAGE');
 let actor,before;
 outer:for(let i=0;i<15;i++){
  tickBlackwingRoom(r,r.clock+1800);heal(r);
  for(const[id]of members){if(blackwingView(r,id).attackRemaining<=0)continue;before=structuredClone(r);action(r,id,'STRIKE');if(r.status==='CLEAR'){actor=id;break outer;}}
 }
 assert.ok(actor,'final strike found');const final=before,shift=Date.now()-final.clock;
 const timeKeys=new Set(['clock','createdAt','startedAt','endsAt','finishedAt','at','deadline','opensAt','closesAt','firstAt','breathAt','pressureAt','healReadyAt','pausedAt','firstLockAt','lockDeadline']);
 function move(o,parent=''){for(const[k,v]of Object.entries(o)){if(v&&typeof v==='object')move(v,k);else if(Number.isFinite(v)&&(timeKeys.has(k)||parent==='lastStrike'))o[k]=v+shift;}}
 move(final);Object.assign(final,{id:roomId,releaseMode:saved.releaseMode,rewardPolicy:saved.rewardPolicy,revealPolicy:saved.revealPolicy,settingsRevision:saved.settingsRevision,lobbyEndsAt:saved.lobbyEndsAt});
 // UI QA can load the actual V3 renderer before issuing the last attack.
 final.endsAt=Date.now()+120000;final.challenge.deadline=Date.now()+90000;
 await h.run('UPDATE raid_blackwing_rooms_v1 SET state_json=?,status=? WHERE room_id=?',JSON.stringify(final),'ACTIVE',roomId);
 return {roomId,actor:Number(actor),body:{roomId,requestId:h.uid(),action:'STRIKE',token:blackwingView(final,actor).challenge.tokens.STRIKE}};
}
