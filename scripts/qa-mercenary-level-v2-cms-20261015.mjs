import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const root=process.cwd(),out=path.join(root,'docs/qa/mercenary-level-v2-20261015/cms');
const require=createRequire(path.join(root,'package.json'));
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const html=`<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>성장 CMS 격리 검수</title><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><style>body{background:#080c17;margin:0;padding:20px}main{max-width:1240px;margin:auto}@media(max-width:600px){body{padding:8px}}</style><main class="mc-admin mc-console"></main><script type="module">
import {createMercenaryLevelEditor} from '/admin/mercenary-level-admin-v1.mjs';
import {mercenaryLevelDraft,MERCENARY_GROWTH_REVIEW} from '/shared/mercenary-level-v1.mjs';
const p=mercenaryLevelDraft();
if(new URL(location.href).searchParams.has('configured')){p.growth=structuredClone(MERCENARY_GROWTH_REVIEW);p.xpPerCard=Object.fromEntries(Object.keys(p.xpPerCard).map(k=>[k,100]));p.levels.forEach(r=>r.requiredXp=1000);p.milestones.forEach(r=>r.successChancePpm=500000);}
let data={policy:p,releaseEnabled:false};window.saved=[];
const root=document.querySelector('main');let editor;function render(){root.innerHTML=editor.html();editor.mount(root.querySelector('[data-level-root]'));}
editor=createMercenaryLevelEditor({request:async options=>{if(options){const body=JSON.parse(options.body);window.saved.push(structuredClone(body));data={...data,policy:{...body.policy,revision:body.policy.revision+1}};}return structuredClone(data);},onRender:render});render();
</script></html>`;
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__cms'){res.setHeader('content-type','text/html;charset=utf-8');res.end(html);return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('outside');res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report=[];
try{
 for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method()))writes.push(r.url());});
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/__cms');await page.locator('[data-level-field="growth.perLevel.hpPercent"]').waitFor();
  assert.equal(await page.locator('[data-level-field="growth.perLevel.hpPercent"]').inputValue(),'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-level-field="growth.perLevel.hpPercent"]').fill('15');await page.locator('[data-level-save]').click();
  await page.waitForFunction(()=>window.saved.length===1);
  assert.equal(await page.evaluate(()=>window.saved[0].policy.mode),'OFF');
  assert.equal(await page.evaluate(()=>window.saved[0].policy.growth.perLevel.attackPercent),null);
  await page.screenshot({path:path.join(out,name+'-draft.png'),fullPage:true});
  await page.goto(base+'/__cms?configured=1');await page.locator('[data-level-growth-preview] tbody tr').first().waitFor();
  assert.equal(await page.locator('[data-level-growth-preview] tbody tr').count(),21);
  assert.match(await page.locator('[data-level-ready]').textContent(),/수치 입력 완료/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-level-growth-preview]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'-table.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);report.push({viewport:name,width,height,partialDraftSaved:true,missingValuesRemainNull:true,rows:21,errors,writes,overflow:false});await page.close();
 }
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({checkedAt:new Date().toISOString(),report},null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));}
