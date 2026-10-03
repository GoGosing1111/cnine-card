// Loopback UI verification using the actual CMS module and inline game entry.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
import {lichRewardWeek} from '../functions/_raid_lich_rewards.js';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=fs.mkdtempSync(path.join(os.tmpdir(),'lich-weekly-ui-'));
let h;
const user={id:1,serverUserId:1,nickname:'검수 공대장',role:'OWNER',coin:123456789,cardShards:12000,masterStars:2000,
  owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{
    if(url.pathname==='/__cms'){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/lich-king-raid-admin-v1.css"><body><main style="max-width:1100px;margin:16px auto;padding:12px"><section id="view-raid"></section></main><script type="module" src="/admin/lich-king-raid-admin-v1.mjs"></script></body></html>');
    }
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      if(key.startsWith('raid/lich/')||key.startsWith('admin/raid/lich/')){
        const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        const response=await h.handle(request);return json(await response.json(),response.status);
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
    h=await lichLiveFixture();await h.configure({mode:'ON'});
    await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)','raid_lich_weekly_v1:'+lichRewardWeek().weekKey+':1',JSON.stringify({count:2}));
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(u=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_admin_token','local-qa-1');
      localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    },user);
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(origin+'/__cms');await page.locator('[name="coinReward"]').waitFor();
    assert.equal(await page.locator('[name="coinReward"]').inputValue(),'0');
    await page.locator('[name="coinReward"]').fill('1000000000');await page.locator('[name="masterStarReward"]').fill('1000');
    await page.locator('#lichRaidAdmin button[type="submit"]').click();await page.locator('[data-status]').filter({hasText:'저장 완료'}).waitFor();
    await page.locator('[data-reload]').click();await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.startsWith('저장된 설정'));
    assert.equal(await page.locator('[name="coinReward"]').inputValue(),'1000000000');
    assert.equal(await page.locator('[name="masterStarReward"]').inputValue(),'1000');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,'cms-'+width+'.png'),fullPage:true});
    await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').waitFor({state:'visible'});await page.locator('#lichRaidTab').click();
    await page.locator('#lich-weeklyReward').filter({hasText:'남은 1 / 3회'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#lich-weeklyReward').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'lobby-'+width+'.png'),fullPage:true});
    const clear=await readyLichClear(h);assert.equal((await h.call('action',{body:clear.body})).status,200);
    await page.evaluate(id=>sessionStorage.setItem('lichLiveRoom',id),clear.roomId);
    await page.goto(origin+'/raid/lich-king/');await page.locator('#resultDialog').waitFor({state:'visible'});
    const paid=await page.locator('#resultReason').innerText();assert.match(paid,/마별 1,000개/);assert.match(paid,/코인 1,000,000,000/);assert.match(paid,/남은 보상 0회/);
    await page.screenshot({path:path.join(out,'clear-'+width+'.png'),fullPage:true});
    await page.locator('#retryButton').click();await page.locator('#weeklyReward').filter({hasText:'남은 0 / 3회'}).waitFor();
    assert.equal(await page.locator('#createButton').isDisabled(),false);
    const fourth=await readyLichClear(h);assert.equal((await h.call('action',{body:fourth.body})).status,200);
    await page.evaluate(id=>sessionStorage.setItem('lichLiveRoom',id),fourth.roomId);await page.reload();await page.locator('#resultDialog').waitFor({state:'visible'});
    assert.match(await page.locator('#resultReason').innerText(),/3회를 모두 수령하여 추가 보상은 지급되지 않습니다/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,'limit-'+width+'.png'),fullPage:true});
    assert.deepEqual(errors,[]);reports.push({width,cmsSaveReload:true,inlineQuota:true,clearRewards:true,limitMessage:true,overflow:false,pageErrors:errors});
    await context.close();await h.close();h=null;
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports},null,2));console.log(JSON.stringify({out,reports}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(h)await h.close();}
