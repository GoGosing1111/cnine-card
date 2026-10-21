import {CITY_DISGUISE,cityDisguiseStock,applyCityDisguiseView} from '../shared/jokgak-city-disguise-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {changeCityCash} from '../shared/jokgak-city-cash-v1.mjs';
import {assignedCityRole} from './_jokgak_city_roles.js';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
const fail=(code,text)=>{throw Object.assign(Error(text),{code:'CITY_DISGUISE_'+code,status:409});};
export async function prepareCityDisguise(env,{action,me,life,policy,weights,now,requestId}){
 const stock=cityDisguiseStock(life,policy.mode,now),statements=[];
 if(me.nextActionAt>now)fail('COOLDOWN','다음 행동까지 잠시 기다려 주세요.');
 if(action==='use'&&me.role==='POLICE')fail('POLICE','경찰은 위장신분증을 사용할 수 없습니다.');
 let cash,identity=null;
 if(action==='buy'){
  if(me.location!=='MARKET')fail('MARKET','시장으로 이동한 뒤 위장신분증을 구매하세요.');
  if(stock.count>=CITY_DISGUISE.maxCount)fail('STOCK','위장신분증은 최대 99개까지 보관할 수 있습니다.');
  cash=changeCityCash(life,policy,-CITY_DISGUISE.price);stock.count++;
 }else if(action==='use'){
  if(stock.uses>=CITY_DISGUISE.maxUses)fail('LIMIT','위장신분증은 한 회차에 2번까지 사용할 수 있습니다.');
  if(stock.count<1)fail('EMPTY','시장에서 위장신분증을 먼저 구매하세요.');
  const testerFilter=policy.mode==='TEST'?` AND (u.role='OWNER'${policy.testUserIds.length?` OR c.user_id IN (${policy.testUserIds.map(()=>'?').join(',')})`:''})`:'';
  const eligible=`c.active=1 AND c.epoch=? AND c.user_id<>? AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))${testerFilter}`;
  const args=[cityShift(now).id,me.userId,...(policy.mode==='TEST'?policy.testUserIds:[])];
  const source=await env.DB.prepare(`SELECT c.user_id,u.nickname FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id WHERE ${eligible} ORDER BY RANDOM() LIMIT 1`).bind(...args).first();
  if(!source)fail('NO_TARGET','현재 도시에 위장할 다른 참여자가 없습니다. 신분증은 소모되지 않습니다.');
  const role=await assignedCityRole(env,Number(source.user_id),cityShift(now).id,weights);
  identity={sourceUserId:Number(source.user_id),nickname:source.nickname,role,startedAt:now,until:now+CITY_DISGUISE.durationMs};
  const tag=requestId+':disguise-source';
  statements.push(cityGuard(env,tag,`EXISTS(SELECT 1 FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id WHERE ${eligible} AND c.user_id=? AND u.nickname=?)`,[...args,source.user_id,source.nickname]),cityGuardEnd(env,tag));
  stock.count--;stock.uses++;stock.active=identity;
  cash=changeCityCash(life,policy,0);
 }else fail('ACTION','위장신분증의 구매·사용 요청을 확인하세요.');
 me.nextActionAt=now+policy.life.serviceCooldownMs;
 applyCityDisguiseView(me,life,policy);
 return {statements,result:{action,product:CITY_DISGUISE.code,name:CITY_DISGUISE.name,price:action==='buy'?CITY_DISGUISE.price:0,paid:action==='buy'&&policy.mode==='ON',test:policy.mode==='TEST',currency:'CITY_CASH',cash,disguise:structuredClone(me.disguise)}};
}
