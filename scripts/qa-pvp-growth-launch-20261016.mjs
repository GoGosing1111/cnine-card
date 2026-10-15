import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {levelDemo} from '../mercenary-codex/leveling/demo.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'docs/qa/pvp-growth-launch-20261016/ui');await fs.mkdir(out,{recursive:true});
let stage=1,posts=0;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  if(req.method!=='GET'){posts++;res.statusCode=405;res.end('{}');return;}
  const account=levelDemo();account.userId=7;account.policy.revision=1;
  if(stage===5){const card=account.cards.find(c=>c.code==='V-049');card.growth={level:5,experience:1350,breakthroughMask:0,revision:2};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.pathname.endsWith('/leveling/state')?account:{visible:false}));return;
 }
 if(url.pathname==='/__launch_cms'){
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/mercenary-admin-v1.css"><style>body{background:#080c17;padding:16px;margin:0}main{max-width:1240px;margin:auto}</style><main class="mc-admin mc-console"></main><script type="module">import {createMercenaryLevelEditor} from '/admin/mercenary-level-admin-v1.mjs';import {mercenaryGrowthLaunchPolicy} from '/shared/mercenary-growth-launch-20261016.mjs';const root=document.querySelector('main');let editor,policy=mercenaryGrowthLaunchPolicy({revision:1});window.launchSaves=[];const render=()=>{root.innerHTML=editor.html();editor.mount(root.querySelector('[data-level-root]'));};editor=createMercenaryLevelEditor({request:async options=>{if(options){const saved=JSON.parse(options.body).policy;window.launchSaves.push(saved);policy={...saved,revision:saved.revision+1};}return {policy:structuredClone(policy),releaseEnabled:true};},onRender:render});render();</script>`);return;
 }
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('outside root');
 if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 stage=1;await page.goto(base+'/mercenary-codex/leveling/?code=V-049');await page.locator('.hero-card img').waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('#mode').innerText(),'성장실');assert.match(await page.locator('.xp-display').innerText(),/750 EXP/);
 assert.equal(await page.locator('.qa').count(),0,'public route must not expose fake growth controls');
 await page.locator('[data-quantity="V-049"]').fill('3');assert.match(await page.locator('#calculation').innerText(),/900/);assert.equal(await page.locator('#train').isEnabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(out,name+'-growth.png'),fullPage:true});
 await page.locator('[data-target="V-996"]').click();assert.match(await page.locator('.xp-display').innerText(),/3,750 EXP/);
 stage=5;await page.goto(base+'/mercenary-codex/leveling/?code=V-049');await page.locator('.hero-card img').waitFor();
 assert.match(await page.locator('.xp-display').innerText(),/1,350 EXP/);assert.match(await page.locator('body').innerText(),/10%/);assert.equal(await page.locator('#breakthrough').isEnabled(),true);
 await page.screenshot({path:path.join(out,name+'-breakthrough.png'),fullPage:true});
 await page.goto(base+'/__launch_cms');await page.locator('[data-level-field="xpPerCard.SSS"]').waitFor();
 assert.equal(await page.locator('[data-level-field="xpPerCard.SSS"]').inputValue(),'100');assert.equal(await page.locator('[data-level-field="levels.0.requiredXp"]').inputValue(),'750');
 assert.equal(await page.locator('[data-level-field="levels.19.requiredXp"]').inputValue(),'3600');assert.equal(await page.locator('[data-level-field="mode"]').inputValue(),'ON');
 await page.locator('[data-level-field="mode"]').selectOption('OFF');await page.locator('[data-level-save]').click();await page.getByText('성장 설정 저장 완료 · 실행 OFF',{exact:true}).waitFor();
 await page.locator('[data-level-field="mode"]').selectOption('ON');await page.locator('[data-level-save]').click();await page.getByText('성장 설정 저장 완료 · 실행 ON',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.launchSaves.map(p=>[p.mode,p.levels[0].requiredXp,p.milestones[0].successChancePpm])),[['OFF',750,100000],['ON',750,100000]]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,name+'-cms.png'),fullPage:true});results.push({name,width,height,regularXp:750,limitedXp:3750,level5Xp:1350,breakthroughChancePercent:10,errors});await page.close();
 }assert.equal(posts,0);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({source:'isolated public state and CMS fixture using approved launch policy',results,posts},null,2)+'\n');console.log(JSON.stringify({results,posts}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
