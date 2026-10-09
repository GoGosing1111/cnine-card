import {CITY_ROLES,CITY_PLACES,cityShift} from '/shared/jokgak-city-v1.mjs';
import {changeCityCash,transferCityCash} from '/shared/jokgak-city-cash-v1.mjs';
import {defaultCitySettings} from '/shared/jokgak-city-settings-v1.mjs';
import {newCityLife,projectCityLife,applyCityLifeView,markCityDeath} from '/shared/jokgak-city-life-v1.mjs';
const policy=defaultCitySettings(),life=newCityLife(Date.now());life.hunger=35;life.wellness=65;
const names=['밤의산책자','네온러너','거리의의사','빨간우체통','달빛상인','항구의그림자','초록신호','블루사이렌','새벽배송','마지막택시','도시의별','유리정원'];
const me={userId:900001,nickname:'도시 탐험가',active:true,role:'POLICE',location:'MARKET',health:80,maxHealth:100,wanted:0,jailedUntil:0,nextActionAt:0,nextMoveAt:0,protectedUntil:0,revision:0};
const residents=CITY_PLACES.flatMap((place,placeIndex)=>names.map((nickname,i)=>({userId:100+placeIndex*100+i,nickname,active:true,role:CITY_ROLES[(i+placeIndex)%7].code,location:place.id,health:50+(i*7)%51,wanted:i%3===0?2:0,jailedUntil:0,nextActionAt:0,nextMoveAt:0,protectedUntil:0,revision:0})));
window.loadUser=()=>({id:me.userId,nickname:me.nickname});
const receipts=new Map(),residentLife=new Map(residents.map(p=>[p.userId,newCityLife(Date.now())])),offers=new Map();
const rolePolicy=code=>policy.roles.find(r=>r.code===code);
window.CityPreview={
  async request(path,body){
    await new Promise(resolve=>setTimeout(resolve,100));
    const url=new URL(path,'http://preview/'),action=url.pathname.slice(1);
    projectCityLife(me,life,Date.now(),policy);
    if(action==='status'){const location=url.searchParams.get('location')||'MARKET',after=Number(url.searchParams.get('after')||0);const people=[...residents,...(me.active?[me]:[])].filter(p=>p.location===location&&p.userId>after).sort((a,b)=>a.userId-b.userId);return structuredClone({ok:true,serverNow:Date.now(),shift:cityShift(),mode:'TEST',cash:policy.cash,life:policy.life,rules:policy.rules,roles:policy.roles,places:CITY_PLACES,mine:me,location,people:people.slice(0,10),beggingOffers:me.active&&!me.deadUntil&&!me.hospitalRequired?[...offers.values()].filter(x=>x.location===me.location&&x.endsAt>Date.now()):[],nextCursor:people.length>10?people[9].userId:null});}
    if(action==='ack'){for(const id of body.ids||[])offers.delete(id);return {ok:true};}
    if(action==='result'){if(receipts.has(url.searchParams.get('requestId')))return receipts.get(url.searchParams.get('requestId'));throw Object.assign(Error('아직 기록이 없습니다.'),{status:404});}
    if(receipts.has(body?.requestId))return receipts.get(body.requestId);
    if(me.deadUntil>Date.now()&&action!=='leave')throw Object.assign(Error('3분 사망 대기 후 병원에서 부활합니다.'),{status:409});
    const target=[me,...residents].find(p=>p.userId===body?.targetId);const result={ok:true,action,location:me.location,requestId:body?.requestId};
    if(action==='join'){me.active=true;me.location='HOME';}
    if(action==='leave')me.active=false;
    if(action==='move'){me.location=body.location;offers.clear();}
    if(['beg','alms'].includes(action)){
      const r=rolePolicy(me.role);if(me.role!=='BEGGAR'||me.nextActionAt>Date.now())throw Object.assign(Error('역할 또는 행동 대기시간을 확인하세요.'),{status:409});
      life.begging={requestId:body.requestId,kind:action,location:me.location,epoch:cityShift().id,mode:'TEST',cash:r.begCash,endsAt:Date.now()+r.begDurationMs};me.nextActionAt=Date.now()+r.begCooldownMs;
    }else life.begging=null;
    if(action==='donate'){
      const offer=[...offers.values()].find(x=>x.requestId===body.offerId&&x.actorId===body.targetId&&x.location===me.location&&x.endsAt>Date.now());
      if(!offer||me.nextActionAt>Date.now())throw Object.assign(Error('동냥이 끝났거나 행동 대기 중입니다.'),{status:409});
      changeCityCash(life,policy,-offer.cash);changeCityCash(residentLife.get(target.userId),policy,offer.cash);offers.delete(offer.id);me.nextActionAt=Date.now()+policy.life.serviceCooldownMs;
      result.donation={amount:offer.cash,mode:'TEST',donorName:me.nickname,recipientName:target.nickname};
    }
    if(['eat','treat','buy','use'].includes(action)){
      const item=action==='eat'?policy.life.meal:action==='treat'?policy.life.treatment:policy.life.supplies.find(x=>x.code===body.product),bag=life.bags.TEST;
      if(!item)throw Object.assign(Error('상품을 확인하세요.'),{status:400});
      const cash=changeCityCash(life,policy,-(action==='use'?0:item.price));
      if(action==='buy')bag[body.product]=Math.min(99,(bag[body.product]||0)+1);
      else{if(action==='use'){if(!bag[body.product])throw Object.assign(Error('소지품이 없습니다.'),{status:409});bag[body.product]--;}life.hunger=Math.min(100,life.hunger+(item.hunger||0));life.wellness=Math.min(100,life.wellness+(item.wellness||0));me.health=Math.min(100,me.health+(item.health||0));}
      me.nextActionAt=Date.now()+5000;applyCityLifeView(me,life,policy);result.service={name:action==='eat'?'식사':action==='treat'?'진료':action==='buy'?'구매':'소지품 사용',test:true,paid:false,price:action==='use'?0:item.price,currency:'CITY_CASH',cash,health:me.health,hunger:me.hunger,wellness:me.wellness};
    }
    if(action==='heal'){target.health=Math.min(100,target.health+(me.role==='DOCTOR'?50:25));me.nextActionAt=Date.now()+30000;}
    if(action==='inspect'){result.inspection={nickname:target.nickname,role:target.role,wanted:target.wanted,cardPower:2850000,cards:[{rarity:'SSS',name:'시연 카드 1',title:'전열'},{rarity:'SS',name:'시연 카드 2',title:'전열'},{rarity:'SS',name:'시연 카드 3',title:'중열'},{rarity:'SS',name:'시연 카드 4',title:'후열'},{rarity:'SS',name:'시연 카드 5',title:'후열'}]};me.nextActionAt=Date.now()+10000;}
    if(['attack','arrest'].includes(action)){
      const fixture=await (await fetch('./battle-fixture.json')).json();Object.assign(result,fixture,{attackerNickname:me.nickname,defenderNickname:target.nickname,action});
      result.result=result.battleV2.result.winner==='A'?'WIN':result.battleV2.result.winner==='B'?'LOSE':'DRAW';
      const beforeMine=me.health,beforeTarget=target.health;
      if(result.result==='WIN')target.health=Math.max(0,target.health-rolePolicy(me.role).defeatDamage);else if(result.result==='LOSE')me.health=Math.max(0,me.health-rolePolicy(target.role).defeatDamage);
      const killer=result.result==='WIN'&&target.health===0?rolePolicy(me.role):result.result==='LOSE'&&me.health===0?rolePolicy(target.role):null;
      result.theft=transferCityCash(life,residentLife.get(target.userId),policy,result.battleV2.result.winner,me.userId,target.userId,killer);
      result.effects={damageToMine:beforeMine-me.health,damageToTarget:beforeTarget-target.health};me.protectedUntil=target.protectedUntil=Date.now()+policy.rules.targetProtectionMs;
      if(action==='arrest'&&result.result==='WIN'){target.jailedUntil=Date.now()+60000;target.location='POLICE';target.wanted=0;}
      if(action==='attack')me.wanted=Math.min(5,me.wanted+1);me.nextActionAt=Date.now()+15000;
      if(me.health<=0){markCityDeath(me,life,target,Date.now(),me.location);applyCityLifeView(me,life,policy);}
    }
    applyCityLifeView(me,life,policy);result.mine={...me};result.target=target?{...target}:null;receipts.set(body?.requestId,result);return result;
  }
};
const options=CITY_ROLES.map(r=>`<option value="${r.code}" ${r.code===me.role?'selected':''}>${r.name}</option>`).join('');
document.getElementById('previewRole').innerHTML=options;
document.getElementById('previewRole').onchange=async event=>{me.role=event.target.value;me.nextActionAt=0;me.jailedUntil=0;life.begging=null;await window.JokgakCity.bind();};
document.getElementById('previewAlms').onclick=async()=>{const beg=residents.find(p=>p.location===me.location&&p.role==='BEGGAR'),requestId=crypto.randomUUID();offers.clear();if(beg)offers.set(requestId,{id:requestId,requestId,action:'alms',actorId:beg.userId,actorName:beg.nickname,location:me.location,mode:'TEST',cash:100,createdAt:Date.now(),endsAt:Date.now()+30000});await window.JokgakCity.bind();document.querySelector('.jc-map-stage').scrollIntoView({block:'center'});};
document.getElementById('previewNotice').onclick=()=>window.JokgakCity.showNotice({id:'preview-notice',requestId:'preview-request',action:'attack',actorId:101,actorName:'밤의산책자',location:me.location,winner:'A',theft:{status:'TRANSFERRED',mode:'TEST',amount:1000,actorChange:1000,percent:10,maxCash:2000},health:55,jailedUntil:0});
document.getElementById('previewDeath').onclick=async()=>{markCityDeath(me,life,{userId:101,nickname:'밤의산책자'},Date.now(),me.location);applyCityLifeView(me,life,policy);await window.JokgakCity.bind();document.getElementById('previewCity').scrollIntoView({block:'start'});};
document.getElementById('previewCity').innerHTML=window.JokgakCity.view();await window.JokgakCity.bind();
// The same V3 asset manifest as the live game, generated for this isolated page.
await import('./battle-loader.js');
