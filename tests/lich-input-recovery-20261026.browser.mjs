// Six-player final window, real inline client/API, lost request before commit.
// External network is blocked and production account data is never imported.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {tickLichRoom} from '../functions/_raid_lich_king.js';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=process.env.LICH_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'lich-recovery-'));
fs.mkdirSync(out,{recursive:true});
const baseline=process.env.LICH_RECOVERY_BASELINE?execFileSync('git',['show',process.env.LICH_RECOVERY_BASELINE+':raid/lich-king/live.mjs'],{cwd:root,encoding:'utf8'}):null;
let h,held,calls=[];
const user={id:1,serverUserId:1,nickname:'검수 공대장',role:'OWNER',coin:123456789,cardShards:12000,masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(value,status=200)=>{if(res.destroyed)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      if(key.startsWith('raid/lich/')||key.startsWith('admin/raid/lich/')){
        const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        if(key==='raid/lich/action'){
          calls.push(JSON.parse(body));
          if(held&&!held.reached){held.reached=true;held.arrived();await held.promise;}
        }
        const response=await h.handle(request),value=await response.json();return json(value,response.status);
      }
      return json({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'loot-shop/balance':{pigCoins:0},'live-operations':{serverNow:new Date().toISOString(),items:[]},'raid/status':{current:null,settings:{enabled:true},participants:[]},'raid/core/feature':{visible:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    if(baseline&&url.pathname==='/raid/lich-king/live.mjs'){res.writeHead(200,{'content-type':mime['.mjs'],'cache-control':'no-store'});return res.end(baseline);}
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
    h=await lichLiveFixture();calls=[];
    const members=[1,2,3,6,7,8];for(const id of members)h.setDeck(id,accountDeck((id-1)%3+1));
    const roomId=await h.party();
    for(const id of [6,7,8]){assert.equal((await h.command('join',{roomId},id)).status,200);await h.command('assign',{roomId,targetId:String(id),role:['ASSAULT','WARDEN','RESCUE'][id-6]});}
    for(const id of members)assert.equal((await h.command('ready',{roomId,ready:true},id)).status,200);
    assert.equal((await h.command('start',{roomId})).status,200);
    const read=async()=>JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(({user,roomId})=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-qa-1');sessionStorage.setItem('lichLiveRoom',roomId);
      localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    },{user,roomId});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').waitFor({state:'visible'});await page.locator('#lichRaidTab').click();
    await page.waitForFunction(()=>globalThis.LichRaidLive?.diagnostics().mounted,{},{timeout:30000});
    const room=await read(),now=Date.now();
    room.round=5;room.step='TRANSITION';room.challenge.deadline=now;room.clock=now;room.endsAt=now+60000;tickLichRoom(room,now);
    room.step='EXPOSED';room.challenge.deadline=now+12000;room.boss.hp=Math.floor(room.boss.maxHp/300);room.revision++;
    await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);await page.evaluate(()=>LichRaidLive.sync());
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.round===7&&LichRaidLive.diagnostics().state.step==='EXPOSED');
    let release,arrived;held={promise:new Promise(r=>release=r),arrival:new Promise(r=>arrived=r),release,arrived,reached:false};
    const started=Date.now();await page.locator('[data-action="STRIKE"]').click();await held.arrival;
    assert.equal(await page.locator('[data-action="STRIKE"]').isDisabled(),true);
    await page.screenshot({path:path.join(out,'pending-'+width+'.png'),fullPage:true});
    await page.waitForFunction(()=>!document.querySelector('[data-action="STRIKE"]').disabled,{},{timeout:4500});
    const recoveredMs=Date.now()-started;assert.ok(recoveredMs<5000,'recover within the unchanged 12s attack window');
    await page.locator('[data-action="STRIKE"]').click();
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.status==='CLEAR',{},{timeout:5000});
    assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1],'retry retains the original receipt and intent');
    held.release();held=null;
    const before=await read();const replay=await h.call('action',{body:calls[0]});assert.equal(replay.status,200);
    const after=await read();assert.equal(after.boss.hp,0);assert.equal(after.revision,before.revision);assert.equal(after.events.filter(e=>e.type==='RESULT').length,1);
    assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_lich_receipts_v1 WHERE request_id=?','1:'+calls[0].requestId)).n),1);
    assert.equal(Number((await h.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=?','LICH_KING_ENTRY_TICKET')).quantity),4);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,'clear-'+width+'.png'),fullPage:true});
    reports.push({width,members:6,hpPercent:room.boss.hp/room.boss.maxHp*100,windowMs:12000,recoveredMs,sameReceipt:true,resultCount:1,extraTicketSpent:0,status:'CLEAR',pageErrors:errors});
    await context.close();await h.close();h=null;
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports},null,2));console.log(JSON.stringify({out,reports}));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({baseline:process.env.LICH_RECOVERY_BASELINE||null,error:error.message},null,2));console.error('Artifacts:',out);throw error;}
finally{held?.release();await browser.close();await new Promise(resolve=>server.close(resolve));if(h)await h.close();}
