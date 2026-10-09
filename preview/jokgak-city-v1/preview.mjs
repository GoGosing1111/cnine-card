import {CITY_ROLES,CITY_PLACES,CITY_RULES,cityShift} from '/shared/jokgak-city-v1.mjs';
const names=['밤의산책자','네온러너','거리의의사','빨간우체통','달빛상인','항구의그림자','초록신호','블루사이렌','새벽배송','마지막택시','도시의별','유리정원'];
const me={userId:900001,nickname:'도시 탐험가',active:true,role:'POLICE',location:'MARKET',health:80,wanted:0,jailedUntil:0,nextActionAt:0,nextMoveAt:0,protectedUntil:0,revision:0};
const residents=CITY_PLACES.flatMap((place,placeIndex)=>names.map((nickname,i)=>({userId:100+placeIndex*100+i,nickname,active:true,role:CITY_ROLES[(i+placeIndex)%7].code,location:place.id,health:50+(i*7)%51,wanted:i%3===0?2:0,jailedUntil:0,nextActionAt:0,nextMoveAt:0,protectedUntil:0,revision:0})));
window.loadUser=()=>({id:me.userId,nickname:me.nickname});
const receipts=new Map();
window.CityPreview={
  async request(path,body){
    await new Promise(resolve=>setTimeout(resolve,100));
    const url=new URL(path,'http://preview/'),action=url.pathname.slice(1);
    if(action==='status'){const location=url.searchParams.get('location')||'MARKET',after=Number(url.searchParams.get('after')||0);const people=[...residents,...(me.active?[me]:[])].filter(p=>p.location===location&&p.userId>after).sort((a,b)=>a.userId-b.userId);return structuredClone({ok:true,serverNow:Date.now(),shift:cityShift(),rules:CITY_RULES,roles:CITY_ROLES,places:CITY_PLACES,mine:me,location,people:people.slice(0,10),nextCursor:people.length>10?people[9].userId:null});}
    if(action==='result'){if(receipts.has(url.searchParams.get('requestId')))return receipts.get(url.searchParams.get('requestId'));throw Object.assign(Error('아직 기록이 없습니다.'),{status:404});}
    if(receipts.has(body?.requestId))return receipts.get(body.requestId);
    const target=[me,...residents].find(p=>p.userId===body?.targetId);const result={ok:true,action,location:me.location,requestId:body?.requestId};
    if(action==='join'){me.active=true;me.location='HOME';}
    if(action==='leave')me.active=false;
    if(action==='move')me.location=body.location;
    if(action==='heal'){target.health=Math.min(100,target.health+(me.role==='DOCTOR'?50:25));me.nextActionAt=Date.now()+30000;}
    if(action==='inspect'){result.inspection={nickname:target.nickname,role:target.role,wanted:target.wanted,cardPower:2850000,cards:[{rarity:'SSS',name:'시연 카드 1',title:'전열'},{rarity:'SS',name:'시연 카드 2',title:'전열'},{rarity:'SS',name:'시연 카드 3',title:'중열'},{rarity:'SS',name:'시연 카드 4',title:'후열'},{rarity:'SS',name:'시연 카드 5',title:'후열'}]};me.nextActionAt=Date.now()+10000;}
    if(['attack','arrest'].includes(action)){
      const fixture=await (await fetch('./battle-fixture.json')).json();Object.assign(result,fixture,{attackerNickname:me.nickname,defenderNickname:target.nickname,action});
      result.result=result.battleV2.result.winner==='A'?'WIN':'LOSE';
      if(result.result==='WIN')target.health=Math.max(0,target.health-25);else me.health=Math.max(0,me.health-25);
      if(action==='arrest'&&result.result==='WIN'){target.jailedUntil=Date.now()+60000;target.location='POLICE';target.wanted=0;}
      if(action==='attack')me.wanted=Math.min(5,me.wanted+1);me.nextActionAt=Date.now()+15000;
    }
    result.mine={...me};result.target=target?{...target}:null;receipts.set(body?.requestId,result);return result;
  }
};
const options=CITY_ROLES.map(r=>`<option value="${r.code}" ${r.code===me.role?'selected':''}>${r.name}</option>`).join('');
document.getElementById('previewRole').innerHTML=options;
document.getElementById('previewRole').onchange=async event=>{me.role=event.target.value;me.nextActionAt=0;me.jailedUntil=0;await window.JokgakCity.bind();};
document.getElementById('previewNotice').onclick=()=>window.JokgakCity.showNotice({id:'preview-notice',requestId:'preview-request',action:'attack',actorId:101,actorName:'밤의산책자',location:me.location,winner:'A',health:55,jailedUntil:0});
document.getElementById('previewCity').innerHTML=window.JokgakCity.view();await window.JokgakCity.bind();
// The same V3 asset manifest as the live game, generated for this isolated page.
await import('./battle-loader.js');
