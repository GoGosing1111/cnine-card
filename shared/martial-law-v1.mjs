export const MARTIAL_LAW_KEY='martial_law_event_v1';
export const MARTIAL_LAW_OPERATOR='핑크빛유두';
export const MARTIAL_LAW_DURATIONS=Object.freeze([30,60,120]);
export const martialLawLive=(s,now=Date.now())=>s?.enabled===true&&Date.parse(s.activatedAt)<=now&&Date.parse(s.endsAt)>now;
export const canManageMartialLaw=user=>String(user?.role||'').trim().toUpperCase()==='OWNER'&&user?.nickname===MARTIAL_LAW_OPERATOR;
export function cleanMartialLaw(raw={},now=Date.now()){
 const windows=[];
 for(const item of (Array.isArray(raw.windows)?raw.windows:[]).filter(w=>Array.isArray(w)&&Number.isSafeInteger(w[0])&&Number.isSafeInteger(w[1])&&w[1]>w[0]).sort((a,b)=>a[0]-b[0])){
  const last=windows.at(-1);if(last&&item[0]<=last[1])last[1]=Math.max(last[1],item[1]);else windows.push([...item]);
 }
 const state={version:1,enabled:raw.enabled===true,revision:Math.max(0,Math.floor(Number(raw.revision)||0)),generation:Math.max(0,Math.floor(Number(raw.generation)||0)),
  activatedAt:raw.activatedAt||null,endsAt:raw.endsAt||null,updatedAt:raw.updatedAt||null,durationMinutes:MARTIAL_LAW_DURATIONS.includes(raw.durationMinutes)?raw.durationMinutes:60,
  title:'리버스콜 계엄령이 선포되었습니다',coinMultiplier:.9,rechargeMultiplier:3,windows,lastRequestId:raw.lastRequestId||null,lastFingerprint:raw.lastFingerprint||null};
 state.enabled=martialLawLive(state,now);return state;
}
export function publicMartialLaw(state,now=Date.now()){
 const {windows,lastRequestId,lastFingerprint,...view}=cleanMartialLaw(state,now);return view;
}
export function composeMartialBurning(burning,policy,now=Date.now()){
 const state=cleanMartialLaw(policy,now),factor=(burning?.enabled?Number(burning.battleRewardMultiplier||1):1)*(state.enabled?0.9:1);
 return {...burning,martialLaw:publicMartialLaw(state,now),__martialLaw:state,effectiveBattleRewardMultiplier:factor};
}
export function martialEnergyConfig(cfg,policy,now=Date.now()){
 const base=Number(cfg.__martialBaseRechargeMinutes??cfg.rechargeMinutes),state=cleanMartialLaw(policy,now);
 // Internal recharge history is never serialized into public battle/config.
 return Object.defineProperties({...cfg,rechargeMinutes:base*(state.enabled?3:1)},{__martialBaseRechargeMinutes:{value:base},__martialLaw:{value:state}});
}
function segments(from,to,windows){
 const result=[];let at=from;
 for(const [start,end] of windows||[]){if(end<=at)continue;if(start>=to)break;
  if(start>at)result.push([at,Math.min(start,to),1]);at=Math.max(at,start);
  if(at<to){result.push([at,Math.min(end,to),3]);at=Math.min(end,to);}
 }
 if(at<to)result.push([at,to,1]);return result;
}
function advance(from,credit,windows){
 for(const [start,end,factor] of segments(from,Number.MAX_SAFE_INTEGER,windows)){
  const available=(end-start)/factor;if(credit<=available+1e-7)return Math.ceil(start+credit*factor-1e-7);credit-=available;
 }
 return from;
}
export const martialSqlUtc=ms=>new Date(ms).toISOString().replace('T',' ').replace(/Z$/,'').replace(/\.000$/,'');
// Preserve the partial charge across declaration, expiry and early revocation.
// The saved timestamp remains the actual last completed charge, never a reset.
export function martialRecharge(energy,last,cfg,now=Date.now()){
 const max=Number(cfg.maxEnergy),interval=Number(cfg.__martialBaseRechargeMinutes??cfg.rechargeMinutes)*60000,windows=cfg.__martialLaw?.windows||[];
 energy=Math.max(0,Math.min(max,energy));if(!Number.isFinite(last)||last>now)last=now;
 if(energy<max){
  const credit=segments(last,now,windows).reduce((sum,[a,b,f])=>sum+(b-a)/f,0),gained=Math.floor((credit+1e-7)/interval);
  if(gained>0){energy=Math.min(max,energy+gained);last=energy===max?now:advance(last,gained*interval,windows);}
 }
 return {energy,last,nextRechargeAt:energy>=max?null:new Date(advance(last,interval,windows)).toISOString()};
}
