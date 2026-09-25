// Actual Chromium UI, production CMS handlers, isolated PostgreSQL only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
import {handleMercenaryFusion} from '../functions/_mercenary_fusion.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,'../qa-mercenary-fusion-cms');
fs.mkdirSync(out,{recursive:true});
const pg=new PGlite();await pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)');
const env={DB:new __postgresCompatTest.PostgresD1Database({async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}})};
const json=(body,status=200)=>({body,status});
const cms=(endpoint='admin/mercenaries',body)=>handleMercenaryCms({env,path:endpoint,request:new Request('https://qa.test/api/'+endpoint,{method:body?'PATCH':'GET',...(body?{body:JSON.stringify(body)}:{})}),deps:{requirePermission:async()=>({id:1,role:'OWNER'}),json}});
const first=await cms();const document=first.body.document;
document.mercenaries.forEach((c,i)=>{if(!c.rank)c.rank=['C','B','A','S','SS'][i%5];});
assert.equal((await cms('admin/mercenaries',{document,expectedRevision:first.body.revision,requestId:crypto.randomUUID()})).status,200);
const draw=await cms('admin/mercenaries/draw');draw.body.policy.cardRules.cardWeights={'V-021':8991,'V-046':999,'V-049':10};
assert.equal((await cms('admin/mercenaries/draw',{policy:draw.body.policy,expectedRevision:draw.body.revision,requestId:crypto.randomUUID(),reason:'격리 브라우저 검수 초기값'})).status,200);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png'};
const source=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
// Keep the actual versioned entry and all production styles, isolate unrelated CMS modules.
const entry=source.match(/<script type="module" src="mercenary-admin-v1\.js[^>]*><\/script>/)[0];
const html=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',entry+'</body>');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/admin/'){res.setHeader('content-type','text/html');return res.end(html);}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
  for(const [width,height] of [[1440,1000],[390,844]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
    // Shorten only the new feature deadline for the fault recovery scenario.
    await context.addInitScript(()=>{const set=window.setTimeout;window.setTimeout=(fn,ms,...args)=>set(fn,ms===12000?500:ms,...args);});
    const page=await context.newPage(),errors=[],writes=[];let drop=false,invalidFeature=false,hangFeature=false,failCms=width===1440;
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.route('**/api/**',async route=>{
      const req=route.request(),endpoint=new URL(req.url()).pathname.slice(5),body=req.postDataJSON();
      if(req.method()!=='GET'){assert.equal(endpoint,'admin/mercenaries/draw','no gameplay writes');writes.push(body);}
      let response;
      if(endpoint==='mercenaries/v3/fusion/feature'){
        if(hangFeature)return;
        response=invalidFeature?json({enabled:true}):await handleMercenaryFusion({path:endpoint,request:new Request(req.url()),env:{},deps:{json}});
      }else if(endpoint==='admin/mercenaries/opening')response=json({mode:'OFF',revision:1,ready:false,rankCounts:{},blockers:[]});
      else if(endpoint==='admin/mercenaries'&&failCms){failCms=false;response=json({error:'CMS 일시 연결 실패'},503);}
      else response=await cms(endpoint,body);
      if(body&&drop){drop=false;return route.fulfill({status:200,body:''});}
      assert.ok(response,'Unexpected API '+endpoint);
      return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(response.body)});
    });
    const login=async()=>page.evaluate(()=>{document.body.classList.replace('auth-guest','auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});
    await page.goto(origin+'/admin/#mercenaries/fusion');await login();
    if(width===1440){await page.locator('.mc-notice.is-error').waitFor();assert.equal(await page.locator('[data-reload]').isVisible(),true);await page.locator('[data-reload]').click();}
    await page.waitForFunction(()=>document.querySelector('[data-fusion-status]')?.textContent==='ON');
    assert.equal(await page.getByRole('tab',{name:'합성 관리'}).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('[data-hyper-opening]').count(),0);
    assert.equal(await page.locator('.mf-transition:not(.mf-transition-head)').count(),5);
    assert.equal(await page.locator('[data-draw-weight]').count(),49);
    assert.match(await page.locator('.mf-rules').innerText(),/기본 보유 1장/);
    assert.equal(await page.locator('.mf-release a').getAttribute('href'),'/mercenary-codex/?fusion=preview');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('.mf-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`fusion-overview-${width}.png`)});
    if(width===390){await page.locator('.mf-rules').evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(out,'fusion-policy-390.png')});}
    const input=page.locator('[data-draw-weight="V-049"]'),before=(await cms('admin/mercenaries/draw')).body;
    if(width===1440)assert.match(await page.locator('[data-draw-weight-rate="V-049"]').innerText(),/등급 내 0\.1% · SS 합성 → 0\.01%$/);
    await input.click();await input.fill(width===1440?'20':'30');
    assert.match(await page.locator('[data-draw-weight-rate="V-049"]').innerText(),width===1440?/0\.01998002%/:/0\.02994012%/);
    await page.locator('.mf-rank').last().evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(out,`fusion-weights-${width}.png`)});
    drop=width===1440;await page.locator('[data-draw-save]').click();
    if(width===1440){await page.waitForFunction(()=>document.querySelector('[data-draw-save]').textContent.includes('재확인'));await page.locator('[data-draw-save]').click();assert.equal(writes.at(-1).requestId,writes.at(-2).requestId);}
    await page.waitForFunction(()=>document.querySelector('[data-draw-message]').textContent.includes('공유 가중치 저장 완료'));
    const after=(await cms('admin/mercenaries/draw')).body;
    assert.equal(after.revision,before.revision+1);assert.equal(after.policy.cardRules.cardWeights['V-049'],width===1440?20:30);
    assert.deepEqual(after.policy.outcomes,before.policy.outcomes);assert.equal(after.policy.notes,before.policy.notes);
    assert.match(after.audit[0].reason,/합성·하이퍼팩 공용 가중치/);
    await page.getByRole('tab',{name:'개봉 확률',exact:true}).click();
    assert.equal(await input.inputValue(),String(width===1440?20:30));
    await page.locator('[data-draw-notes]').fill('합성 화면에서 함께 저장하면 안 되는 개봉 초안');
    await page.getByRole('tab',{name:'합성 관리'}).click();
    assert.equal(await page.locator('.mf-draft-warning').isVisible(),true);assert.equal(await page.locator('[data-draw-save]').isDisabled(),true);
    await page.locator('[data-draw-reload]').click();await page.waitForFunction(()=>!document.querySelector('.mf-draft-warning'));
    assert.equal((await cms('admin/mercenaries/draw')).body.policy.notes,before.policy.notes);
    if(width===1440){
      hangFeature=true;await page.locator('[data-fusion-reload]').click();await page.waitForFunction(()=>document.querySelector('[data-fusion-status]').textContent==='확인 실패');hangFeature=false;
      invalidFeature=true;await page.locator('[data-fusion-reload]').click();await page.waitForFunction(()=>document.querySelector('[data-fusion-status]').textContent==='확인 실패');
      assert.equal(await page.locator('.mf-rules').count(),0);
      invalidFeature=false;await page.locator('[data-fusion-reload]').click();await page.waitForFunction(()=>document.querySelector('[data-fusion-status]').textContent==='ON');
      await page.getByRole('tab',{name:'용병 도감',exact:true}).click();await page.locator('[data-code="V-001"]').click();
      await page.locator('[data-field="mercenaries.0.rank"]').selectOption('SSS');
      await page.getByRole('tab',{name:'합성 관리'}).click();
      assert.equal(await page.locator('.mf-rank').filter({has:page.locator('.md-grade[data-rank="C"]')}).locator('[data-draw-weight="V-001"]').count(),1,'unsaved rank must not alter fusion probability');
    }
    await page.evaluate(()=>location.hash='#mercenaries/draw');await page.locator('[data-draw-notes]').waitFor();
    await page.evaluate(()=>location.hash='#mercenaries/fusion');await page.locator('.mf-heading').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('#roleBadge').evaluate(el=>el.textContent='ADMIN');
    await page.locator('#view-mercenaries').waitFor({state:'hidden'});
    assert.equal(await page.locator('#nav [data-view="mercenaries"]').isVisible(),false);
    await page.locator('#roleBadge').evaluate(el=>el.textContent='OWNER');
    await page.waitForFunction(()=>document.querySelector('[data-fusion-status]')?.textContent==='ON');
    assert.equal(await input.inputValue(),String(width===1440?20:30));assert.deepEqual(errors,[]);
    report.push({width,height,directLink:true,savedWeights:true,outcomesPreserved:true,retryOnce:width===1440,draftGuard:true,roleReset:true,noOverflow:true,pageErrors:errors});
    console.log('Fusion CMS flow passed '+width);await context.close();
  }
}finally{await browser.close();server.close();await pg.close();}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
