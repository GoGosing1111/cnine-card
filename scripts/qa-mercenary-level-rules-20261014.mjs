import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.resolve(process.env.LEVEL_RULES_QA_OUTPUT||'../level-rules-qa-20261014');
const require=createRequire(import.meta.url);let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
await fs.mkdir(out,{recursive:true});
const adminStyles=(await fs.readFile(path.join(root,'admin/index.html'),'utf8')).match(/<style[\s\S]*?<\/style>|<link[^>]*rel="stylesheet"[^>]*>/g).join('\n').replace(/href="(?!https?:|\/)/g,'href="/admin/');
const cms=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${adminStyles}<link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><style>body{margin:0;padding:20px;background:#080c17;color:#e5edff;font:15px sans-serif}*{box-sizing:border-box}input,select{max-width:100%}</style><main id="review"></main><script type="module">
import {createMercenaryLevelEditor} from '/admin/mercenary-level-admin-v1.mjs';import {mercenaryLevelDraft,MERCENARY_LEVEL_RULES} from '/shared/mercenary-level-v1.mjs';
let editor;const root=document.querySelector('#review'),render=()=>{root.innerHTML=editor.html();editor.mount(root);};editor=createMercenaryLevelEditor({request:async()=>({policy:mercenaryLevelDraft(),rules:MERCENARY_LEVEL_RULES,releaseEnabled:false}),onRender:render});render();</script>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/__growth_cms_review'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(cms);return;}
 if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"visible":false}');return;}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('outside root');
 if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{for(const [label,width,height]of [['desktop',1440,1080],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height},isMobile:label==='mobile',hasTouch:label==='mobile',reducedMotion:'reduce'}),errors=[];let posts=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'||r.method()==='PATCH')posts++;});
 await page.goto(base+'/mercenary-codex/leveling/?preview=1');await page.locator('.hero-card img').waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('[data-target="V-049"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-quantity="V-049"]').fill('1');assert.match(await page.locator('#calculation').innerText(),/\+300/);
 await page.locator('[data-quantity="V-049"]').fill('0');await page.locator('[data-quantity="V-055"]').fill('1');assert.match(await page.locator('#calculation').innerText(),/\+100/);
 assert.match(await page.locator('.xp-display').innerText(),/250 EXP/);
 await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:path.join(out,label+'-same-card.png'),fullPage:true});
 await page.locator('[data-target="V-996"]').click();assert.match(await page.locator('.xp-display').innerText(),/요구량 ×5/);assert.match(await page.locator('.xp-display').innerText(),/1,250 EXP/);
 await page.locator('[data-quantity="V-996"]').fill('1');assert.match(await page.locator('#calculation').innerText(),/\+300/);
 await page.locator('[data-quantity="V-049"]').fill('1');assert.match(await page.locator('#calculation').innerText(),/\+400/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:path.join(out,label+'-limited.png'),fullPage:true});
 await page.locator('.qa>summary').click();await page.locator('[data-jump="5"]').click();assert.match(await page.locator('.xp-display').innerText(),/2,250 EXP/);assert.equal(await page.locator('#breakthrough').isEnabled(),true);
 await page.goto(base+'/__growth_cms_review');await page.locator('[data-level-ready]').waitFor();
 assert.match(await page.locator('#review').innerText(),/동일 용병 재료는 3배로 고정/);assert.match(await page.locator('#review').innerText(),/정확히 5배/);
 assert.equal(await page.locator('[data-level-field="sameCardMultiplier"]').count(),0);assert.equal(await page.locator('[data-level-field="levels.0.requiredXp"]').getAttribute('max'),'200000000000');
 assert.equal(await page.locator('[data-level-field="xpPerCard.SSS"]').inputValue(),'');assert.equal(await page.locator('[data-level-save]').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.equal(posts,0);
 await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:path.join(out,label+'-cms.png'),fullPage:true});report.push({label,width,height,sameCardXp:300,otherSssXp:100,normalRequiredXp:250,limitedRequiredXp:1250,limitedLevel5RequiredXp:2250,errors,posts});await page.close();
 }await fs.writeFile(path.join(out,'report.json'),JSON.stringify({verifiedAt:new Date().toISOString(),report},null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
