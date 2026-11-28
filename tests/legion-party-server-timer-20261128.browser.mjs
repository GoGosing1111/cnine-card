import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=new URL('../',import.meta.url);
const origin='http://localhost';
const hour=3600000;
// A future server event that even an up-to-date client's old event calendar cannot know.
const sample=Date.UTC(2027,0,8,2,7,7);
const entry=(await readFile(new URL('index.html',root),'utf8')).match(/<script type="module" src="(js\/legion-hunt-entry-v1\.mjs[^"]*)"/)[1];
const shell='<meta name="viewport" content="width=device-width,initial-scale=1"><button data-legion-citadel>군단토벌 파티</button><script type="module" src="'+entry+'"></script>';

for(const width of [1365,390]){
 test('server party recharge deadline and confirmed balance at '+width+'px', {timeout:35000}, async t=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  const clientTime=sample+12*hour;
  await page.clock.install({time:new Date(clientTime-1000)});
  await page.clock.pauseAt(new Date(clientTime));
  let now=sample,lobbyReads=0,releaseResponse=null;
  const events=[];
  page.on('pageerror',error=>events.push(error.message));
  const energy=(current,nextRechargeAt)=>({version:1,current,maximum:3,updatedAt:sample-427000,generation:0,rechargeMs:3*hour,nextRechargeAt,serverNow:now});
  const lobby={open:true,cowOpen:true,clanOpen:true,cowTickets:2,clanHideout:{seasonOpen:true,stage:3},rooms:[],clanRooms:[],cowRooms:[],state:null,
   partyEnergy:energy(2,sample+3*hour-427000),partyRechargeHours:3,recoveryEvent:{endsAt:sample+24*hour,label:'회복시간 50% 단축'},nextEntryAt:null};
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:shell});
   if(url.pathname==='/api/legion-party/lobby'){
    lobbyReads++;
    if(releaseResponse)await releaseResponse.promise;
    return route.fulfill({json:{...lobby,serverNow:now}});
   }
   const file=new URL('.'+url.pathname,root);
   if(!file.href.startsWith(root.href))return route.abort();
   try{
    const body=await readFile(file);
    const type=/\.m?js$/.test(url.pathname)?'text/javascript':url.pathname.endsWith('.css')?'text/css':undefined;
    return route.fulfill({body,contentType:type});
   }catch{return route.fulfill({status:404,body:''});}
  });
  await page.goto(origin);
  const click=selector=>page.locator(selector).dispatchEvent('click');
  const displayed=async(points,time)=>{
   const timer=page.locator('[data-charge-time]');
   await timer.filter({hasText:time}).waitFor({timeout:4000});
   assert.equal(await timer.textContent(),time);
   assert.equal(await page.locator('[data-party-energy]').textContent(),points);
  };
  const create=page.locator('[data-act="create"]');
  await click('[data-legion-citadel]');
  await displayed('2 / 3','02:52:53');
  assert(await create.isEnabled());
  await click('[data-ct-area="clan-dockyard"]');
  await displayed('2 / 3','02:52:53');
  await click('[data-ct-area="cow-room"]');
  await displayed('2장','방장 1장');
  await click('[data-ct-area="public"]');
  await page.clock.runFor(1005);
  await displayed('2 / 3','02:52:52');
  assert.equal(lobbyReads,1);

  // A depleted account stays blocked until the server confirms the next point.
  now+=1005;
  lobby.nextEntryAt=now+2000;
  lobby.partyEnergy=energy(0,lobby.nextEntryAt);
  await click('[data-act="refresh"]');
  await displayed('0 / 3','00:00:02');
  assert(await create.isDisabled());
  const pending=Promise.withResolvers();
  releaseResponse=pending;
  try{
   now+=2060;
   await page.clock.runFor(2060);
   await displayed('0 / 3','충전 확인 중');
   assert(await create.isDisabled());
   lobby.nextEntryAt=null;
   lobby.partyEnergy=energy(1,now+3*hour);
  }finally{releaseResponse=null;pending.resolve();}
  await displayed('1 / 3','03:00:00');
  assert.equal(lobbyReads,3);
  assert(await create.isEnabled());

  // Spare points leave nextEntryAt null; the HUD still wakes at the recharge deadline.
  lobby.partyEnergy=energy(2,now+1500);
  await click('[data-act="refresh"]');
  await displayed('2 / 3','00:00:02');
  assert(await create.isEnabled());
  now+=1560;
  lobby.partyEnergy=energy(3,null);
  await page.clock.runFor(1560);
  await displayed('3 / 3','충전 완료');
  lobby.partyEnergy=null;
  lobby.nextEntryAt=now+hour;
  await click('[data-act="refresh"]');
  await displayed('0 / 1','01:00:00');
  assert(await create.isDisabled());
  await click('[data-act="close"]');
  const closedReads=lobbyReads;
  await page.clock.runFor(16000);
  assert.equal(lobbyReads,closedReads);
  assert.deepEqual(events,[]);
 });
}
