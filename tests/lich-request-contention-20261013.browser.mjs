// Real inline client + API + production non-queuing account lock, loopback only.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
import {UserMutationLock} from '../workers/user-lock/src/index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=fs.mkdtempSync(path.join(os.tmpdir(),'lich-contention-'));
let h,locks,calls=[];
const user={id:1,serverUserId:1,nickname:'검수 공대장',role:'OWNER',coin:123456789,cardShards:12000,masterStars:2000,
  owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const lockCall=(id,action,body)=>{
  if(!locks.has(id))locks.set(id,new UserMutationLock({}));
  return locks.get(id).fetch(new Request('https://lock/'+action,{method:'POST',body:JSON.stringify(body)})).then(r=>r.json());
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      if(key.startsWith('raid/lich/')||key.startsWith('admin/raid/lich/')){
        const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        const response=await h.handle(request),value=await response.json();
        calls.push({key,body:body?JSON.parse(body):null,status:response.status,code:value.code});
        return json(value,response.status);
      }
      return json({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'loot-shop/balance':{pigCoins:0},'live-operations':{serverNow:new Date().toISOString(),items:[]},'raid/status':{current:null,settings:{enabled:true},participants:[]},'raid/core/feature':{visible:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(error){json({error:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
  for(const [width,height]of [[1440,1000],[390,844]]){
    h=await lichLiveFixture();locks=new Map();calls=[];
    for(const id of [1,2,3])h.setDeck(id,accountDeck(id));
    const roomId=await h.party();
    h.deps.withUserMutationLock=async(_env,id,actionPath,work)=>{
      const token=crypto.randomUUID();
      if(!(await lockCall(id,'acquire',{token,actionPath,leaseMs:20000})).acquired)
        throw Object.assign(Error('같은 계정의 요청을 처리 중입니다. 잠시 후 다시 확인하세요.'),{code:'JOINT_LOCK_BUSY',status:409});
      try{return await work();}finally{await lockCall(id,'release',{token});}
    };
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(({user,roomId})=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-qa-1');sessionStorage.setItem('lichLiveRoom',roomId);
      localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    },{user,roomId});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').waitFor({state:'visible'});await page.locator('#lichRaidTab').click();
    await page.waitForFunction(()=>globalThis.LichRaidLive?.diagnostics().state?.status==='LOBBY');
    const assertRetries=kind=>{
      const sent=calls.filter(c=>c.key==='raid/lich/'+kind);
      assert.ok(sent.length>=2&&sent.length<=5,'bounded retries: '+kind);
      assert.equal(sent[0].code,'JOINT_LOCK_BUSY');assert.equal(sent.at(-1).status,200);
      assert.equal(new Set(sent.map(c=>JSON.stringify(c.body))).size,1,'same receipt and body: '+kind);
      return sent.length;
    };
    // Role assignment must wait for the earlier action rather than show a false failure.
    await lockCall(1,'acquire',{token:'prior-action',actionPath:'raid/lich/action',leaseMs:20000});
    const blockedAssign=page.waitForResponse(r=>r.url().includes('/api/raid/lich/assign')&&r.status()===409);
    await page.locator('#lich-memberList [data-target="1"][data-assign-role="WARDEN"]').scrollIntoViewIfNeeded();
    await page.locator('#lich-memberList [data-target="1"][data-assign-role="WARDEN"]').evaluate(button=>{for(let i=0;i<20;i++)button.click();});
    await blockedAssign;
    await lockCall(1,'release',{token:'prior-action'});
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.me.role==='WARDEN',{},{timeout:5000});
    const roleAttempts=assertRetries('assign');
    assert.equal(await page.locator('#lich-toast').isVisible(),false);
    assert.equal(await page.locator('#lich-lobbyNotice').isVisible(),false);
    await page.screenshot({path:path.join(out,'roles-'+width+'.png'),fullPage:true});
    await h.command('assign',{roomId,targetId:'2',role:'ASSAULT'});
    for(const id of [1,2,3])assert.equal((await h.command('ready',{roomId,ready:true},id)).status,200);
    assert.equal((await h.command('start',{roomId})).status,200);
    const read=async()=>JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
    // Advance the actual encounter to the first interrupt; no production state is used.
    let room=await read(),now=Date.now();room.step='TRANSITION';room.challenge.deadline=now;room.clock=now;room.endsAt=now+120000;
    await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
    await h.call('status?roomId='+roomId);
    room=await read();now=Date.now();
    Object.assign(room.challenge,{castAt:now-1,castDeadline:now+15000,deadline:now+25000,curseAt:now+18000,curseDeadline:now+24000});room.clock=now;
    const before=room.resources.interrupt;
    await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
    await page.evaluate(()=>LichRaidLive.sync());
    await page.waitForFunction(()=>LichRaidLive.diagnostics().mounted,{},{timeout:30000});
    await page.locator('[data-action="INTERRUPT"]').waitFor({state:'visible'});
    await lockCall(1,'acquire',{token:'overlapping-duty',actionPath:'raid/lich/action',leaseMs:20000});
    const blockedAction=page.waitForResponse(r=>r.url().includes('/api/raid/lich/action')&&r.status()===409);
    await page.locator('[data-action="INTERRUPT"]').evaluate(button=>{for(let i=0;i<20;i++)button.click();});
    await blockedAction;await lockCall(1,'release',{token:'overlapping-duty'});
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.challenge.interrupted,{},{timeout:5000});
    const actionAttempts=assertRetries('action');room=await read();
    assert.equal(room.resources.interrupt,before-1);assert.equal(room.statistics.interrupts,1);
    assert.equal(room.events.filter(e=>e.type==='RAID_LICH_INTERRUPT').length,1);
    assert.equal(await page.locator('#lich-toast').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,'interrupt-'+width+'.png'),fullPage:true});
    // A repeated packet with the accepted input still cannot spend another charge.
    const accepted=calls.filter(c=>c.key==='raid/lich/action').at(-1).body;
    assert.equal((await h.call('action',{body:accepted})).status,200);
    assert.equal((await read()).resources.interrupt,before-1);
    // A later role change in the battle remains available after the interrupt spam.
    await page.locator('#lich-partyButton').click();
    await page.locator('#lich-combatMembers [data-target="2"][data-assign-role="RESCUE"]').click();
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.members.find(m=>m.id==='2').role==='RESCUE');
    assert.equal(await page.locator('#lich-toast').isVisible(),false);
    assert.deepEqual(errors,[]);
    reports.push({width,roleAttempts,actionAttempts,roleAssignmentRecovered:true,interruptSpamClicks:20,interruptsApplied:1,resourceSpent:1,replayExactlyOnce:true,roleChangeAfterSpam:true,lockToastShown:false,sameReceipt:true,pageErrors:errors});
    await context.close();await h.close();h=null;
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports},null,2));console.log(JSON.stringify({out,reports}));
}catch(error){console.error('Artifacts:',out);throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(h)await h.close();}
