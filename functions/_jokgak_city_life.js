import {cityLifeKey,CITY_SUPPLIES,applyCityLifeView} from '../shared/jokgak-city-life-v1.mjs';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const fail=(message,code='CITY_SERVICE')=>{throw Object.assign(Error(message),{status:409,code});};
export function cityLifeClaim(env,row,life,requestId){
  const key=cityLifeKey(row.user_id),next=JSON.stringify(life),tag=requestId+':life:'+row.user_id;
  return [row.life_raw==null?p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,next):p(env,'UPDATE app_meta SET value=? WHERE key=? AND value=?',next,key,row.life_raw),cityGuard(env,tag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,next]),cityGuardEnd(env,tag)];
}
export async function prepareCityService(env,{user,action,product,me,life,policy,now,requestId}){
  const cfg=policy.life,statements=[];
  if(me.nextActionAt>now)fail('다음 행동까지 잠시 기다려 주세요.','CITY_COOLDOWN');
  let effect,price=0,name;
  if(action==='eat'){
    if(me.location!=='RESTAURANT')fail('식당으로 이동한 뒤 식사하세요.');
    effect=cfg.meal;name='식당 식사';
  }else if(action==='treat'){
    if(me.location!=='HOSPITAL')fail('병원으로 이동한 뒤 진료를 받으세요.');
    effect=cfg.treatment;name='병원 진료';
  }else{
    effect=cfg.supplies.find(x=>x.code===product);name=CITY_SUPPLIES.find(x=>x.code===product)?.name;
    if(!effect)fail('상점 상품을 확인하세요.');
    if(action==='buy'&&me.location!=='SHOP')fail('도시 상점으로 이동한 뒤 구매하세요.');
  }
  if(!effect.enabled)fail('현재 이용할 수 없는 상품·서비스입니다.');
  const bag=life.bags[policy.mode];
  if(action==='buy'){
    if((bag[product]||0)>=99)fail('도시 소지품은 종류별 최대 99개까지 보관할 수 있습니다.');
    bag[product]=(bag[product]||0)+1;price=effect.price;
  }else{
    if(action==='use'&&!(bag[product]>0))fail('보유한 도시 소지품이 없습니다.');
    if(!(effect.hunger&&life.hunger<100||effect.wellness&&life.wellness<100||effect.health&&me.health<me.maxHealth))fail('이미 해당 상태가 가득 차 있습니다.');
    life.hunger=Math.min(100,life.hunger+(effect.hunger||0));life.wellness=Math.min(100,life.wellness+(effect.wellness||0));me.health=Math.min(me.maxHealth,me.health+(effect.health||0));
    if(action==='use')bag[product]--;else price=effect.price;
  }
  const paid=policy.mode==='ON'&&price>0;
  if(paid){
    const coin=Number((await p(env,'SELECT coin FROM users WHERE id=?',user.id).first())?.coin||0);
    if(coin<price)fail('코인이 부족합니다.','CITY_COIN');
    if(env.DB.dialect==='postgres')statements.push(p(env,'SELECT id FROM users WHERE id=? FOR UPDATE',user.id));
    const tag=requestId+':cost';
    statements.push(cityGuard(env,tag,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)',[user.id,price]),cityGuardEnd(env,tag),p(env,'UPDATE users SET coin=coin-? WHERE id=?',price,user.id),p(env,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',-price,'JOKGAK_CITY_SERVICE:'+requestId+':'+action,user.id));
  }
  me.nextActionAt=now+cfg.serviceCooldownMs;applyCityLifeView(me,life,policy);
  return {statements,result:{action,product:product||null,name,price,paid,test:policy.mode==='TEST',bag:me.bag,hunger:me.hunger,wellness:me.wellness,health:me.health}};
}
