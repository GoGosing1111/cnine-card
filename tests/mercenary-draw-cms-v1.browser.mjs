// Real Chrome and the actual CMS handler against isolated PostgreSQL. No live account requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(root,'../qa-mercenary-draw');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/admin/mercenary-admin-v1.js"></script></body>');
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
try{
  for(const [width,height] of [[1440,1000],[1024,900],[390,844],[360,740]]){
    const pg=new PGlite(),client={async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}},env={DB:new __postgresCompatTest.PostgresD1Database(client)};
    const call=async body=>handleMercenaryCms({path:'admin/mercenaries/draw',request:new Request(origin+'/api/admin/mercenaries/draw',{method:body?'PATCH':'GET',...(body?{body:JSON.stringify(body)}:{})}),env,deps:{requirePermission:async()=>({id:1,role:'OWNER'}),json:(body,status=200)=>({body,status})}});
    const context=await browser.newContext({viewport:{width,height},isMobile:width<760,hasTouch:width<760}),page=await context.newPage(),errors=[];
    let loseResponse=false,writes=0,catalogWrites=0;
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.route(origin+'/admin/',route=>route.fulfill({contentType:'text/html',body:html}));
    await page.route(origin+'/api/admin/mercenaries',route=>{if(route.request().method()!=='GET')catalogWrites++;return route.fulfill({json:{catalog:seed.catalog,document:structuredClone(seed.document),revision:1,updatedAt:'2026-09-12T12:00:00Z',updatedBy:1,audit:[]}});});
    await page.route(origin+'/api/admin/mercenaries/draw',async route=>{
      const isWrite=route.request().method()==='PATCH',result=await call(isWrite?route.request().postDataJSON():undefined);
      if(isWrite&&result.status===200&&!result.body.replayed)writes++;
      if(loseResponse&&isWrite&&result.status===200){loseResponse=false;return route.abort('failed');}
      return route.fulfill({status:result.status,json:result.body});
    });
    const login=async()=>{await page.evaluate(()=>{document.body.classList.remove('auth-guest');document.body.classList.add('auth-active');document.getElementById('cms').hidden=false;document.getElementById('roleBadge').textContent='OWNER';});await page.locator('[data-draw-chance="CARD_C"]').waitFor();};
    await page.goto(origin+'/admin/#mercenaries/draw');await login();
    assert.equal(await page.locator('[data-draw-chance]').count(),9);assert.equal(await page.locator('[data-draw-quantity]').count(),2);
    assert.equal(await page.locator('[data-draw-chance="CARD_SSS"]').inputValue(),'0.02');
    assert.equal(await page.locator('.md-hold strong').textContent(),'OFF');
    assert.match(await page.locator('[data-draw-total]').textContent(),/^100/);
    assert.equal(await page.locator('.mc-savebar').isVisible(),false);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);
    await page.locator('.md-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'top-'+width+'.png'),fullPage:false});
    await page.locator('.md-editor').screenshot({path:path.join(out,'complete-'+width+'.png')});
    await page.locator('[data-draw-summary]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'summary-'+width+'.png'),fullPage:false});
    await page.locator('[data-draw-chance="CARD_C"]').fill('15');await page.locator('[data-draw-reason]').fill('확률 합계 검증 중');await page.locator('[data-draw-save]').click();
    await page.locator('[data-draw-message]').filter({hasText:'100%로 맞추세요'}).waitFor();assert.equal(writes,0);
    await page.locator('[data-draw-remainder]').click();assert.equal(await page.locator('[data-draw-chance="NONE"]').inputValue(),'41');
    await page.locator('[data-draw-quantity="MASTER_STAR"]').fill('3');await page.locator('[data-draw-quantity="MYSTIC_ENERGY"]').fill('2');
    await page.locator('[data-draw-reason]').fill('기기별 확률 수량 저장 검증');await page.locator('[data-draw-save]').click();await page.locator('[data-draw-message]').filter({hasText:'확률 저장 완료'}).waitFor();
    assert.equal(writes,1);assert.equal(catalogWrites,0);
    await page.reload();await login();assert.equal(await page.locator('[data-draw-chance="CARD_C"]').inputValue(),'15');assert.equal(await page.locator('[data-draw-quantity="MASTER_STAR"]').inputValue(),'3');
    const current=await call();current.body.policy.notes='other admin tab';assert.equal((await call({policy:current.body.policy,expectedRevision:current.body.revision,requestId:crypto.randomUUID(),reason:'다른 창의 변경 기록'})).status,200);
    await page.locator('[data-draw-quantity="MASTER_STAR"]').fill('4');await page.locator('[data-draw-reason]').fill('충돌 초안 보존 검증');await page.locator('[data-draw-save]').click();await page.locator('[data-draw-message]').filter({hasText:'다른 창에서 먼저 저장'}).waitFor();
    assert.equal(await page.locator('[data-draw-quantity="MASTER_STAR"]').inputValue(),'4');
    const downloadPromise=page.waitForEvent('download');await page.locator('[data-draw-export]').click();const download=await downloadPromise;
    const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.policy.outcomes.find(row=>row.id==='MASTER_STAR').quantity,4);assert.equal(exported.policy.openingEnabled,false);
    await page.locator('[data-draw-reload]').click();await page.locator('[data-draw-quantity="MASTER_STAR"]').waitFor();assert.equal(await page.locator('[data-draw-quantity="MASTER_STAR"]').inputValue(),'3');
    await page.locator('[data-draw-quantity="MYSTIC_ENERGY"]').fill('5');await page.locator('[data-draw-reason]').fill('응답 유실 재시도 검증');loseResponse=true;await page.locator('[data-draw-save]').click();await page.locator('.md-message.is-error').waitFor();
    await page.locator('[data-draw-save]').click();await page.locator('[data-draw-message]').filter({hasText:'확률 저장 완료'}).waitFor();assert.equal(writes,2);
    const final=await call();assert.equal(final.body.revision,4);assert.equal(final.body.audit.length,4);assert.equal(final.body.userOpeningEnabled,false);assert.equal(final.body.policy.outcomes[7].quantity,5);
    await page.locator('[data-tab="roster"]').click();await page.locator('[data-field="mercenaries.3.notes"]').fill('다른 설정의 저장 전 메모');await page.locator('[data-tab="draw"]').click();assert.equal(await page.locator('[data-draw-quantity="MYSTIC_ENERGY"]').inputValue(),'5');await page.locator('[data-tab="roster"]').click();assert.equal(await page.locator('[data-field="mercenaries.3.notes"]').inputValue(),'다른 설정의 저장 전 메모');
    assert.deepEqual(errors,[]);assert.equal(catalogWrites,0);
    await page.locator('#roleBadge').evaluate(el=>el.textContent='ADMIN');assert.equal(await page.locator('#view-mercenaries').isVisible(),false);
    checks.push({width,height,outcomes:9,openingOff:true,exactTotal:true,persistence:true,conflictPreservesDraft:true,idempotentRetry:true,export:true,catalogPreserved:true,noOverflow:true,pageErrors:errors.length});
    await context.close();await pg.close();
  }
}finally{await browser.close();server.close();}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
