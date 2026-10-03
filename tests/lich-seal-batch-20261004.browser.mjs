// Loopback-only latency regression in the actual inline V3 raid, PC and mobile.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=fs.mkdtempSync(path.join(os.tmpdir(),'lich-seal-ui-'));
let h; const held=new Map(),submitted=[];
const user={id:2,serverUserId:2,nickname:'검수 봉인대',role:'USER',coin:123456789,cardShards:12000,masterStars:2000,
  owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      if(key.startsWith('raid/lich/')||key.startsWith('admin/raid/lich/')){
        const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        const input=body?JSON.parse(body):null;
        if(key==='raid/lich/action')submitted.push(input);
        const hold=key==='raid/lich/action'&&held.get(input.action);
        if(hold&&!hold.reached){hold.reached=true;hold.arrived();await hold.promise;if(hold.fail)return json({error:'검수 응답 지연',retryable:true},503);}
        const response=await h.handle(request);return json(await response.json(),response.status);
      }
      return json({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'loot-shop/balance':{pigCoins:0},'live-operations':{serverNow:new Date().toISOString(),items:[]},'raid/status':{current:null,settings:{enabled:true},participants:[]},'raid/core/feature':{visible:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    if(process.env.LICH_SEAL_BASELINE_BUNDLE&&url.pathname==='/preview/lich-king-raid-v1/battle.bundle.js'){res.writeHead(200,{'content-type':'text/javascript'});return fs.createReadStream(process.env.LICH_SEAL_BASELINE_BUNDLE).pipe(res);}
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
const holdResponse=action=>{
  let release,arrived;const promise=new Promise(r=>release=r),arrival=new Promise(r=>arrived=r);
  const value={promise,arrival,arrived,release,reached:false};held.set(action,value);return value;
};
try{
  for(const [width,height]of [[1440,1000],[390,844]]){
    submitted.length=0;h=await lichLiveFixture();for(const id of [1,2,3])h.setDeck(id,accountDeck(id));
    const roomId=await h.party();for(const id of [1,2,3])await h.command('ready',{roomId,ready:true},id);
    assert.equal((await h.command('start',{roomId})).status,200);
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(({user,roomId})=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-qa-2');sessionStorage.setItem('lichLiveRoom',roomId);
      localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    },{user,roomId});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').waitFor({state:'visible'});await page.locator('#lichRaidTab').click();
    await page.waitForFunction(()=>globalThis.LichRaidLive?.diagnostics().mounted,{},{timeout:30000});
    const read=async()=>JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
    const nextRound=async reverse=>{
      let room=await read(),now=Date.now();room.step='TRANSITION';room.challenge.deadline=now;room.clock=now;room.endsAt=now+120000;
      await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);await h.call('status?roomId='+roomId);
      room=await read();now=Date.now();room.challenge.seals[0].reverse=reverse;
      Object.assign(room.challenge,{castAt:now-1,castDeadline:now+22000,deadline:now+25000,curseAt:now+18000,curseDeadline:now+23000});room.clock=now;
      await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
      await page.evaluate(()=>LichRaidLive.sync());
      const a=await page.evaluate(()=>LichRaidLive.diagnostics().state.controls.find(a=>a.action==='SEAL'));
      return a.reverse?[...a.sequence].reverse():a.sequence;
    };
    const press=rune=>page.locator('[data-action="SEAL"][data-target="'+rune+'"]').click();
    const runes=await nextRound(width<700),slow=holdResponse('SEAL');
    await press(runes[0]);
    assert.equal(await page.locator('[data-action="SEAL"]').first().isDisabled(),false,'the first rune must not wait for a server round trip');
    assert.equal(submitted.filter(x=>x.action==='SEAL').length,0,'no per-rune request before all selections');
    await page.evaluate(()=>LichRaidLive.sync());
    assert.equal(await page.locator('.lk-coop-task[data-kind="SEAL"] p').textContent(),'선택 1 / 3 · '+runes[0],'a poll preserves unsubmitted keys');
    await press(runes[1]);assert.equal(await page.locator('[data-action="SEAL"]').first().isDisabled(),false);
    await page.screenshot({path:path.join(out,'continuous-runes-'+width+'.png'),fullPage:true});
    await press(runes[2]);await slow.arrival;
    const batch=submitted.filter(x=>x.action==='SEAL');assert.equal(batch.length,1);assert.deepEqual(batch[0].targets,runes);
    assert.equal((await read()).challenge.seals[0].index,0,'only the server can complete the seal');
    assert.equal(await page.locator('.lk-coop-task[data-kind="SEAL"] [data-task-clock]').textContent(),'3 / 3 입력 완료');
    assert.equal(await page.locator('[data-action="INTERRUPT"]').isDisabled(),false);
    await page.locator('[data-action="INTERRUPT"]').click();
    await page.screenshot({path:path.join(out,'submitted-runes-'+width+'.png'),fullPage:true});
    slow.release();held.clear();
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.challenge.sealed&&LichRaidLive.diagnostics().inflightActions.length===0);
    assert.equal((await read()).doom,0);assert.equal((await read()).challenge.interrupted,true);
    // A failed request clears only its submitted draft and retains the request
    // identity, so a real player can enter again instead of staying disabled.
    const retryRunes=await nextRound(false),failed=holdResponse('SEAL');failed.fail=true;
    for(const rune of retryRunes)await press(rune);await failed.arrival;failed.release();held.clear();
    await page.waitForFunction(()=>LichRaidLive.diagnostics().inflightActions.length===0&&!document.querySelector('[data-action="SEAL"]').disabled);
    assert.equal((await read()).challenge.seals[0].index,0);
    for(const rune of retryRunes)await press(rune);
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.challenge.sealed);
    const attempts=submitted.filter(x=>x.action==='SEAL');assert.equal(attempts.length,3);assert.equal(attempts[1].requestId,attempts[2].requestId);
    assert.equal((await read()).doom,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);reports.push({width,reverse:width<700,immediateContinuousInput:true,oneSubmission:true,pollPreservesDraft:true,independentInterrupt:true,retryAfterFailure:true,authoritativeSeal:true,pageErrors:errors});
    await context.close();await h.close();h=null;
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports},null,2));console.log(JSON.stringify({out,reports}));
}catch(error){console.error('Artifacts:',out);throw error;}
finally{for(const item of held.values())item.release();await browser.close();await new Promise(resolve=>server.close(resolve));if(h)await h.close();}
