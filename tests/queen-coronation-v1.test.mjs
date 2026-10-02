import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/queen-coronation-v1.js',import.meta.url),'utf8');
const now=Date.now(),chief={active:true,status:'ACTIVE',ordinal:7,nickname:'왕실 검수',startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+86400000).toISOString(),inaugurationVersion:42};
function runtime({blockedStorage=false}={}){
  const local=new Map(),session=new Map(),nodes=new Map(),calls=[];
  let focused=false,dialog;
  const window={document:{activeElement:{isConnected:true,focus(){focused=true;}},getElementById:id=>nodes.get(id),body:{appendChild(el){nodes.set(el.id,el);}},createElement(){
    const events={},controls={};dialog={setAttribute(){},classList:{add(){}},querySelector(s){return controls[s]??=(s==='#chiefHideToday'?{checked:false}:{focus(){}});},addEventListener(type,fn){events[type]=fn;},showModal(){},close(){events.close?.();},remove(){nodes.delete(this.id);}};return dialog;
  }}};
  for(const [name,map] of [['localStorage',local],['sessionStorage',session]])window[name]={getItem(key){if(blockedStorage)throw Error('blocked');return map.get(key)||null;},setItem(key,value){if(blockedStorage)throw Error('blocked');map.set(key,value);}};
  window.apiRequest=async(...args)=>{calls.push(args);return {chief};};
  vm.runInNewContext(source,{window,Date});
  return {api:window.QueenCoronation,window,local,session,calls,nodes,get dialog(){return dialog;},get focused(){return focused;}};
}
test('coronation follows current authoritative tenure, status, and the 24-hour automatic window',()=>{
  const {api}=runtime();
  assert.equal(api.describe(chief,now).newlyCrowned,true);
  for(const change of [{active:false},{status:'SUSPENDED'},{status:'REMOVED'},{startsAt:'invalid'},{startsAt:new Date(now+1000).toISOString()},{endsAt:new Date(now-1).toISOString()}])assert.equal(api.describe({...chief,...change},now).active,false);
  const old={...chief,startsAt:new Date(now-86400000).toISOString()};
  assert.equal(api.describe(old,now).active,true);assert.equal(api.describe(old,now).newlyCrowned,false);
  for(const ordinal of [0,-1,10000,'2.5','unknown',null])assert.equal(api.describe({...chief,ordinal},now).title,'현임 여왕');
  assert.equal(api.describe(chief,now).title,'제7대 여왕');
});
test('automatic display preserves session/day dismissal while explicit replay remains available',()=>{
  const r=runtime();assert.equal(r.api.show(chief,{automatic:true}),true);
  assert.equal(r.api.show(chief,{automatic:true}),false);
  r.dialog.querySelector('#chiefHideToday').checked=true;r.dialog.querySelector('#chiefPopupClose').onclick();
  assert.equal(r.focused,true);assert.equal(r.nodes.size,0);
  assert.equal(r.session.get('cnine-chief-seen-session:42'),'1');assert.ok(Number(r.local.get('cnine-chief-hide-day:42'))>Date.now());
  assert.equal(r.api.show(chief,{automatic:true}),false);assert.equal(r.api.show(chief),true);
  r.dialog.querySelector('.queen-close').onclick();
  assert.equal(r.api.show({...chief,inaugurationVersion:43},{automatic:true}),true);
});
test('older tenure does not auto-open, unavailable storage does not break closing, nickname is escaped',()=>{
  const r=runtime({blockedStorage:true});
  assert.equal(r.api.show({...chief,startsAt:new Date(now-172800000).toISOString()},{automatic:true}),false);
  assert.equal(r.api.show({...chief,nickname:'<img onerror="bad">',avatar:{lobbyImage:'/wrong-avatar.png'}},{automatic:true}),true);
  assert.ok(r.dialog.innerHTML.includes('&lt;img onerror=&quot;bad&quot;&gt;'));
  assert.ok(r.dialog.innerHTML.includes('queen-coronation-v1-1536.webp'));assert.ok(!r.dialog.innerHTML.includes('wrong-avatar'));
  r.dialog.querySelector('.queen-close').onclick();assert.equal(r.api.show(chief,{automatic:true}),false);
});
test('replay reads fresh status without account mutation and refuses suspended tenure',async()=>{
  const r=runtime();assert.equal(await r.api.open(),true);
  assert.equal(r.calls.length,1);assert.equal(r.calls[0][0],'chief/status');assert.equal(r.calls[0][2].ttl,0);assert.equal(r.calls[0][2].microcache,false);assert.equal(r.calls[0][2].replaceInflight,true);assert.equal(r.calls[0][1].method,undefined);
  r.dialog.querySelector('.queen-close').onclick();
  r.window.apiRequest=async()=>({chief:{...chief,status:'SUSPENDED'}});
  await assert.rejects(r.api.open(),/현재 즉위식을 볼 수 있는 여왕이 없습니다/);assert.equal(r.nodes.size,0);
});
test('coup succession shows the new female commander art and escaped chief replacement names',()=>{
  const r=runtime(),coup={...chief,source:'COUP',nickname:'진짜디임',avatar:{lobbyImage:'/wrong-avatar.png'},coupSuccession:{status:'APPOINTED',roundId:'coup-one',previousNickname:'<하이희야♡>'}};
  assert.equal(r.api.describe(coup,now).title,'제7대 족장');assert.equal(r.api.show(coup,{automatic:true}),true);
  assert.equal(r.dialog.className,'queen-coronation coup-succession');
  for(const text of ['coup-succession-v2123-20261002.png','쿠데타','성공','족장 교체','&lt;하이희야♡&gt;','진짜디임'])assert.ok(r.dialog.innerHTML.includes(text),text);
  assert.ok(!r.dialog.innerHTML.includes('wrong-avatar'));assert.ok(!r.dialog.innerHTML.includes('queen-crown-v1.svg'));
  r.dialog.querySelector('#chiefHideToday').checked=true;r.dialog.querySelector('.queen-close').onclick();
  assert.equal(r.api.show(coup,{automatic:true}),false);assert.equal(r.api.show(coup),true);
});
