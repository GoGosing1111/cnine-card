import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual browser entry. Only imports, DOM, clock scheduling and HTTP
// are supplied by this harness; modal layout is covered by the browser regression.
const source=fs.readFileSync(new URL('../js/jokgak-city-v1.js',import.meta.url),'utf8').replaceAll('import(','__cityImport(');
const item=id=>({id,action:'attack',actorName:'공격자',location:'MARKET',health:75,winner:'A'});
const result=items=>({items,active:true,mine:null,serverNow:Date.now()});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function harness(initialUser={serverUserId:42,nickname:'실제 로그인 형태'}){
 let account=initialUser,handler=async()=>result([]),serial=0;
 const values=new Map(),timers=new Map(),windowEvents=new Map(),documentEvents=new Map(),requests=[],notices=new Set();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
 const listen=map=>(type,fn)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(fn);};
 const emit=map=>(type,event={})=>{for(const fn of map.get(type)||[])fn(event);};
 const document={hidden:false,getElementById:id=>id==='jokgakStyle'?{sheet:{}}:null,addEventListener:listen(documentEvents),createElement(){
  const buttons=new Map();
  return {dataset:{},setAttribute(){},insertAdjacentHTML(){},remove(){notices.delete(this);},querySelector(selector){if(!buttons.has(selector))buttons.set(selector,{});return buttons.get(selector);}};
 }};
 const config={cityPlace:()=>({name:'시장'}),cityTheftHtml:()=>'',deathClock:()=>'03:00',mountCityNoticeLayer:node=>{notices.add(node);return ()=>notices.delete(node);}};
 const sandbox={document,location:{pathname:'/'},navigator:{locks:{request:async(_name,_options,fn)=>fn({})}},localStorage:storage,sessionStorage:storage,loadUser:()=>account,
  AbortSignal,__cityImport:async()=>config,addEventListener:listen(windowEvents),
  setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),setInterval:()=>++serial,clearInterval(){},
  fetch:async(url,options)=>{const request={url,body:options.body?JSON.parse(options.body):null};requests.push(request);return {ok:true,json:async()=>handler(request)};}
 };
 sandbox.window=sandbox;vm.runInNewContext(source,sandbox,{filename:'jokgak-city-v1.js'});
 return {document,requests,notices,values,timers,
  handle:fn=>{handler=fn;},user:value=>{account=value;emit(windowEvents)('cnine:player-updated');},
  wake:()=>emit(documentEvents)('visibilitychange'),
  async tick(){const next=timers.entries().next().value;assert.ok(next,'notification timer exists');timers.delete(next[0]);await next[1].fn();},
  get notice(){return [...notices][0];},get gets(){return requests.filter(r=>r.url.endsWith('/notifications'));},get acks(){return requests.filter(r=>r.url.endsWith('/ack'));}
 };
}

test('serverUserId-only accounts poll on the existing global city entry; login wakes idle polling',async()=>{
 const h=harness();await h.tick();assert.equal(h.gets.length,1);assert.ok(h.values.has('jokgak:poll-after:42'));
 const loggedOut=harness(null);await loggedOut.tick();assert.equal(loggedOut.requests.length,0);
 loggedOut.user({serverUserId:9});assert.equal([...loggedOut.timers.values()][0].ms,1000);await loggedOut.tick();assert.equal(loggedOut.gets.length,1);
 const compatibility=harness({id:7});await compatibility.tick();assert.equal(compatibility.gets.length,1);
});

test('display and page recreation preserve unread alerts; explicit dismissal records and acknowledges only that item',async()=>{
 const h=harness();h.handle(async r=>r.body?{}:result([item('one'),item('two')]));await h.tick();
 assert.equal(h.notice.dataset.cityNoticeId,'one');assert.equal(h.acks.length,0);assert.equal(h.values.has('jokgak:seen:42'),false);
 const reloaded=harness();reloaded.handle(async()=>result([item('one')]));await reloaded.tick();assert.equal(reloaded.notice.dataset.cityNoticeId,'one');
 await h.notice.querySelector('[data-notice-dismiss]').onclick();assert.equal(h.notices.size,0);
 assert.deepEqual(h.acks[0].body,{ids:['one']});assert.deepEqual(JSON.parse(h.values.get('jokgak:seen:42')),['one']);
 await h.tick();assert.equal(h.notice.dataset.cityNoticeId,'two');
});

test('hidden responses remain unread and appear on foreground return',async()=>{
 const h=harness(),gate=deferred(),started=deferred();h.handle(async()=>{started.resolve();return gate.promise;});
 const running=h.tick();await started.promise;h.document.hidden=true;gate.resolve(result([item('background')]));await running;
 assert.equal(h.notices.size,0);assert.equal(h.acks.length,0);assert.equal(h.values.has('jokgak:seen:42'),false);
 h.document.hidden=false;h.wake();h.handle(async()=>result([item('background')]));await h.tick();assert.equal(h.notice.dataset.cityNoticeId,'background');
});

test('logout clears old alerts without acknowledging; in-flight account changes never show another account alert',async()=>{
 const h=harness();h.handle(async()=>result([item('old')]));await h.tick();h.user(null);assert.equal(h.notices.size,0);assert.equal(h.acks.length,0);
 const pending=harness(),gate=deferred(),started=deferred();pending.handle(async()=>{started.resolve();return gate.promise;});
 const running=pending.tick();await started.promise;pending.user({serverUserId:99});gate.resolve(result([item('old-account')]));await running;
 assert.equal(pending.notices.size,0);assert.equal(pending.acks.length,0);
});

test('account switch during a prior dismissal ACK retry cannot display the next old account alert',async()=>{
 const h=harness(),gate=deferred(),started=deferred();h.values.set('jokgak:seen:42',JSON.stringify(['dismissed']));
 h.handle(async r=>{if(r.body){started.resolve();return gate.promise;}return result([item('dismissed'),item('old-next')]);});
 const running=h.tick();await started.promise;h.user({serverUserId:99});gate.resolve({});await running;assert.equal(h.notices.size,0);
});

test('failed explicit ACK is retried from the seen list without redisplaying the dismissed alert',async()=>{
 const h=harness();let fail=true;h.handle(async r=>{if(r.body){if(fail){fail=false;throw Error('network');}return {};}return result([item('retry')]);});
 await h.tick();await h.notice.querySelector('[data-notice-dismiss]').onclick();assert.equal(h.notices.size,0);
 await h.tick();assert.equal(h.acks.length,2);assert.deepEqual(h.acks[1].body,{ids:['retry']});assert.equal(h.notices.size,0);
});

test('hide preference suppresses attack and death popups without acknowledging, and disabling it restores the pending alert',async()=>{
 const h=harness(),now=Date.now(),reply={...result([item('hidden')]),mine:{active:true,deadUntil:now+180000,death:{killerName:'공격자'}},noticePreferences:{hidePopups:true}};
 h.handle(async()=>reply);await h.tick();assert.equal(h.notices.size,0);assert.equal(h.acks.length,0);
 reply.noticePreferences.hidePopups=false;h.wake();await h.tick();assert.equal(h.notices.size,2);assert.equal([...h.notices].some(n=>n.dataset.cityNoticeId==='hidden'),true);
});
