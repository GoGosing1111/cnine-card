export const CITY_CASH_MAX=1000000000000;
export const defaultCityCashPolicy=()=>({startingCash:10000,theft:{enabled:true,percent:10,maxCash:2000}});
export function validateCityCashPolicy(value=defaultCityCashPolicy()){
  const fail=message=>{throw Object.assign(Error(message),{status:400,code:'CITY_CASH_POLICY'});};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['startingCash','theft'].includes(k))||!Number.isSafeInteger(value.startingCash)||value.startingCash<0||value.startingCash>1000000000)fail('도시 시작 현금은 0~10억 원으로 설정하세요.');
  const theft=value.theft===undefined?defaultCityCashPolicy().theft:value.theft;
  if(!theft||typeof theft!=='object'||Array.isArray(theft)||Object.keys(theft).some(k=>!['enabled','percent','maxCash'].includes(k))||typeof theft.enabled!=='boolean'||!Number.isSafeInteger(theft.percent)||theft.percent<0||theft.percent>100||!Number.isSafeInteger(theft.maxCash)||theft.maxCash<0||theft.maxCash>1000000000)fail('PVP 현금 강탈 사용 여부, 비율(0~100%), 1회 한도(0~10억 원)를 확인하세요.');
  return {startingCash:value.startingCash,theft:{...theft}};
}
export function ensureCityCash(life,policy,now=life.at){
  if(!['TEST','ON'].includes(policy.mode))return null;
  life.wallets??={TEST:null,ON:null};
  const mode=policy.mode;
  // Opening a wallet is once per mode. The career projector separately resets
  // the current mode's assets at a six-hour boundary when that policy is on.
  if(!life.wallets[mode])life.wallets[mode]={balance:(policy.cash||defaultCityCashPolicy()).startingCash,initialCash:(policy.cash||defaultCityCashPolicy()).startingCash,openedAt:now};
  return life.wallets[mode];
}
export function changeCityCash(life,policy,delta){
  const wallet=ensureCityCash(life,policy),balance=wallet?.balance;
  if(!wallet||!Number.isSafeInteger(delta)||!Number.isSafeInteger(balance)||balance<0||balance>CITY_CASH_MAX)throw Object.assign(Error('도시 현금 정보를 확인하지 못했습니다.'),{status:503,code:'CITY_CASH_RETRY'});
  const next=balance+delta;
  if(next<0)throw Object.assign(Error('도시 현금이 부족합니다.'),{status:409,code:'CITY_CASH_INSUFFICIENT'});
  if(!Number.isSafeInteger(next)||next>CITY_CASH_MAX)throw Object.assign(Error('도시 현금 보유 한도를 초과합니다.'),{status:409,code:'CITY_CASH_LIMIT'});
  wallet.balance=next;
  return {currency:'CITY_CASH',unit:'원',mode:policy.mode,before:balance,change:delta,after:next};
}

// Call before activity rewards. Both wallets are persisted by the combat's
// existing player/life CAS transaction and its single idempotent receipt.
export function transferCityCash(actorLife,targetLife,policy,winner,actorId,targetId,killRole=null){
  const base=policy.cash?.theft||defaultCityCashPolicy().theft;
  const bonus=killRole?.code==='GANG'?(killRole.killTheftBonusPercent??10):0;
  const rule={...base,percent:Math.min(100,base.percent+bonus),maxCash:bonus?Math.max(base.maxCash,killRole.killTheftMaxCash??4000):base.maxCash};
  const receipt={currency:'CITY_CASH',unit:'원',mode:policy.mode,percent:rule.percent,maxCash:rule.maxCash,killBonusPercent:bonus,amount:0,actorChange:0,winnerId:null,loserId:null};
  if(!rule.enabled)return {...receipt,status:'DISABLED'};
  if(winner==='DRAW')return {...receipt,status:'DRAW'};
  if(!['A','B'].includes(winner)||actorId===targetId)throw Error('CITY_CASH_BATTLE');
  const actorWins=winner==='A',winning=actorWins?actorLife:targetLife,losing=actorWins?targetLife:actorLife;
  // Validate both balances before touching either one.
  const won=changeCityCash(winning,policy,0),lost=changeCityCash(losing,policy,0);
  const amount=Math.min(Math.floor(lost.before*rule.percent/100),rule.maxCash,CITY_CASH_MAX-won.before);
  if(amount){changeCityCash(losing,policy,-amount);changeCityCash(winning,policy,amount);}
  return {...receipt,status:amount?'TRANSFERRED':!lost.before?'NO_CASH':won.before===CITY_CASH_MAX?'WALLET_LIMIT':'ZERO',amount,actorChange:actorWins?amount:-amount,winnerId:actorWins?actorId:targetId,loserId:actorWins?targetId:actorId};
}
