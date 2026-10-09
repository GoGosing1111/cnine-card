export const CITY_CASH_MAX=1000000000000;
export const defaultCityCashPolicy=()=>({startingCash:10000});
export function validateCityCashPolicy(value=defaultCityCashPolicy()){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='startingCash')||!Number.isSafeInteger(value.startingCash)||value.startingCash<0||value.startingCash>1000000000)throw Object.assign(Error('도시 시작 현금은 0~10억 원으로 설정하세요.'),{status:400,code:'CITY_CASH_POLICY'});
  return {...value};
}
export function ensureCityCash(life,policy,now=life.at){
  if(!['TEST','ON'].includes(policy.mode))return null;
  life.wallets??={TEST:null,ON:null};
  const mode=policy.mode;
  // Initial cash is credited once per mode. Settings edits, death, re-entry and
  // six-hour shifts never refill a previously opened wallet.
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
