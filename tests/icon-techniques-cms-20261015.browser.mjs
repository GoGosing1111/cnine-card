// Isolated local CMS + real preparation handler. Never contacts production or assigns a card.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {iconCmsFixture} from './helpers/icon-cms-fixture.mjs';
import {handleIconRoles} from '../functions/_icon_roles.js';
import {handleIconTechniques} from '../functions/_icon_techniques.js';
import {ICON_TECHNIQUES,ICON_TECHNIQUES_KEY} from '../shared/icon-techniques-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fs.realpathSync(process.cwd()),out=path.join(root,'preview/icon-techniques-cms-20261015');
fs.mkdirSync(out,{recursive:true});
const fixture=await iconCmsFixture(),requests=[];
let loseAck=false;
const deps={requirePermission:async()=>({id:1,role:'OWNER'}),json:(data,status=200)=>Response.json(data,{status})};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 const send=(status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(body);};
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__qa'){
   return send(200,'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/icon-grade-v1.css"><link rel="stylesheet" href="/css/icon-roles-v1.css"><link rel="stylesheet" href="/admin/icon-admin-v1.css"><style>body{margin:0;padding:16px;background:#070c14;font:14px system-ui;color:white}#root{max-width:1320px;margin:auto}@media(max-width:620px){body{padding:4px}}</style><main id="root"></main><script type="module">import{mountIconCms}from"/admin/icon-admin-v1.mjs";window.cms=mountIconCms(document.querySelector("#root"));</script></html>','text/html');
  }
  if(url.pathname==='/favicon.ico')return send(204,'');
  if(url.pathname.startsWith('/api/')){
   let body='';for await(const chunk of req)body+=chunk;
   const apiPath=url.pathname.slice(5),request=new Request(url,{method:req.method,...(body?{body}:{})});
   if(apiPath==='admin/icons/fusion')return send(200,JSON.stringify({settings:{revision:1,enabled:false,successVideoUrl:'',successVideoDurationMs:12000},policy:{coinCost:0,masterStarCost:0}}));
   if(apiPath==='admin/icon-techniques'&&req.method==='PATCH')requests.push(JSON.parse(body));
   const response=await handleIconTechniques({path:apiPath,request,env:fixture.env,deps})
    ||await handleIconRoles({path:apiPath,request,env:fixture.env,deps})
    ||await fixture.handle(request,{path:apiPath});
   if(loseAck&&apiPath==='admin/icon-techniques'&&req.method==='PATCH'&&response.status===200){loseAck=false;return send(503,JSON.stringify({error:'격리 검수: 저장 응답 유실'}));}
   return send(response.status,await response.text());
  }
  const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile())return send(404,'Not found','text/plain');
  res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream'});fs.createReadStream(target).pipe(res);
 }catch(error){send(500,JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
const report=[];
try{
 for(const width of [1440,390]){
  await fixture.pg.query('DELETE FROM app_meta WHERE key=$1',[ICON_TECHNIQUES_KEY]);
  const page=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/__qa');
  await page.waitForFunction(()=>document.querySelector('[data-it-status]')?.textContent.includes('초안 버전 1')&&document.querySelectorAll('[data-character]').length===9);
  assert.equal(await page.locator('[data-it-select]').count(),8);
  assert.equal(await page.locator('.ic-roster [data-character]').count(),9);
  assert.equal(await page.locator('[data-save]').isDisabled(),true);
  for(const def of ICON_TECHNIQUES){
   await page.locator('[data-it-select="'+def.code+'"]').click();
   assert.equal(await page.locator('.it-detail h4').first().innerText(),def.name);
   assert.equal(await page.locator('[data-it-field]').count(),def.fields.length);
   assert.ok((await page.locator('[data-it-field]').evaluateAll(elements=>elements.map(el=>el.value))).every(value=>value===''));
   assert.match(await page.locator('.it-preview a').getAttribute('href'),new RegExp('code='+def.code+'$'));
   const bad=await page.locator('.it-studio').evaluate(el=>[el,...el.querySelectorAll('input,textarea,button,a')].filter(node=>{const box=node.getBoundingClientRect();return box.left<0||box.right>innerWidth+1}).length);
   assert.equal(bad,0,def.code+' fits viewport '+width);
  }
  await page.locator('[data-it-select="CROWN_USURP"]').click();
  await page.locator('[data-it-field="firstAction"]').fill('2');
  await page.locator('[data-it-notes]').fill('독립 준비 초안 '+width);
  // Changing an existing live card must not steal or overwrite the new editor's notes.
  await page.locator('[data-character]').nth(1).click();
  assert.equal(await page.locator('[data-it-notes]').inputValue(),'독립 준비 초안 '+width);
  assert.equal(await page.locator('[data-save]').isDisabled(),true);
  const before=requests.length;loseAck=true;
  await page.locator('[data-it-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-it-save]')?.textContent==='저장 결과 재확인');
  assert.equal(await page.locator('[data-it-notes]').isDisabled(),true);
  await page.locator('[data-it-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-it-status]')?.textContent.includes('초안 저장 완료'));
  assert.equal(requests.length-before,2);
  assert.deepEqual(requests.at(-1),requests.at(-2));
  const saved=JSON.parse((await fixture.pg.query('SELECT value FROM app_meta WHERE key=$1',[ICON_TECHNIQUES_KEY])).rows[0].value);
  assert.equal(saved.revision,2);assert.equal(saved.audit.length,1);
  assert.equal(saved.document.enabled,false);
  assert.ok(saved.document.techniques.every(row=>row.enabled===false&&row.cardId===null));
  assert.equal(saved.document.techniques[0].tuning.firstAction,2);
  assert.equal(saved.document.techniques[0].tuning.maxCasts,null);
  await page.locator('.it-studio').screenshot({path:path.join(out,width+'-crown.png')});
  await page.locator('[data-it-select="RETURN_OATH"]').click();
  await page.locator('.it-studio').screenshot({path:path.join(out,width+'-return.png')});
  assert.deepEqual(errors,[]);
  report.push({width,techniques:8,existingCards:9,overflow:0,errors,saveRevision:2,retryReceiptCount:1,allOff:true,unassigned:8});
  await page.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({ok:true,report,out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fixture.close();}
