import {duoFixture} from './ranked-duo-db.mjs';
import {prepareDuoAutomation,reconcileDuoSeason} from '../../functions/_ranked_duo_seasons.js';
import {duoLifecycle} from '../../functions/_ranked_duo.js';
import {DUO_WEEKLY_POLICY_KEY,copyRankedDuoPolicy} from '../../shared/ranked-duo-weekly-v3.mjs';
import {duoTiers} from '../../shared/ranked-duo-season-v2.mjs';
export const day=86400000;
export async function weeklyFixture(t,options={}){
 const f=await duoFixture(t,options),settings={enabled:true,seasonName:'시즌 17',startsAt:new Date(f.clock()-4*day).toISOString(),endsAt:new Date(f.clock()+day).toISOString(),
  energy:{maxEnergy:10,costPerBattle:1,rechargeMinutes:5},winCoin:250000,initialScore:1000,winScore:24,loseScore:16,
  tiers:duoTiers().tiers.map((t,i)=>({...t,rewardCoin:100*(i+1),rewardShards:i})),challengerTier:{rewardCoin:5000000000,rewardShards:30}};
 const policy=copyRankedDuoPolicy(settings,new Date(f.clock()).toISOString());
 await prepareDuoAutomation(f.env);await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',DUO_WEEKLY_POLICY_KEY,JSON.stringify(policy)).run();
 const tick=()=>reconcileDuoSeason(f.env,{settings,deps:f.deps,now:f.clock()}),season=()=>duoLifecycle.currentSeason(f.env);
 return {...f,policy,settings,tick,season,async active(){
  await tick();for(const user of [2,3,4,5]){const r=await f.call('ranked-duo/join',{user,method:'POST'});if(r.status!==200)throw Error(JSON.stringify(r));}
  f.advance(day);for(let i=0;i<10;i++){await tick();if((await season()).status==='ACTIVE')return;}
  throw Error('WEEKLY_DID_NOT_START');
 }};
}
