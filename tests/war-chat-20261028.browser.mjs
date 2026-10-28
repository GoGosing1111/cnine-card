import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {warChatFixture} from './helpers/war-chat-fixture.mjs';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
const out=process.env.QA_OUT||'C:/Users/User/Downloads/upload/cnine-card/operations/war-chat-20261028/ui-v2';
test('PC/mobile real war screens: CMS switches, XSS-safe live text, refresh/reconnect, stable draft, OFF and lifecycle cleanup',async t=>{
 await mkdir(out,{recursive:true});const f=await warChatFixture(t),cf=await clanResumeFixture(t),ff=await organizationFactionFixture(t,{live:true}),tf=await territoryNetworkFixture(t);
 const realNow=Date.now,clanData=new Map();Date.now=cf.clock;try{const review=await inspectResume(cf.pg);await applyResume(cf.pg,{now:cf.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});for(const path of ['clan/overview','clan/war/planning','clan/war/field','clan/war/ready-alert','clan/faction/alerts'])clanData.set(path,await cf.call(path,{user:2,regular:true}));}finally{Date.now=realNow;}
 await tf.form();await tf.p("UPDATE territory_war_v3_users SET side='A' WHERE user_id=2").run();const territory=await T.publicState(tf.env,2,false,4,await tf.round());
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets']});t.after(()=>browser.close());const report=[];
 const style='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080e15;color:#eef3fb;font-family:system-ui}#clanRoot{max-width:1300px;margin:auto}#cms{padding:24px}#nav{display:flex;padding:12px;gap:8px}#nav button{padding:12px}</style>';
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});t.after(()=>page.close());const errors=[],tickets=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message);});page.on('request',r=>{if(r.url().includes('/api/war-chat/ticket'))tickets.push(r.postDataJSON().kind);});
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','chat-qa-2');localStorage.setItem('cnine_admin_token','chat-qa-1');localStorage.setItem('cnine_battle_sound','OFF');});
  await page.route('**/qa/**',async route=>{
   const kind=new URL(route.request().url()).pathname.split('/').at(-1);let body;
   if(kind==='cms')body='<div id="roleBadge">OWNER</div><nav id="nav"></nav><h1 id="pageTitle">CMS</h1><main id="cms"></main><script type="module" src="/admin/war-chat-admin.mjs"></script>';
   else if(kind==='clan')body='<link rel="stylesheet" href="/css/clan-v1.css"><link rel="stylesheet" href="/css/clan-war-reform-v1.css"><link rel="stylesheet" href="/css/organization-command-20261021.css"><div id="clanRoot" class="clan-shell"></div><script src="/js/organization-preparation-v1.js"></script><script src="/js/clan-v1.js"></script><script>const apiRequest=async(p,o={})=>{const r=await fetch("/api/"+p,o);return r.json()};ClanV1.state.tab="war";ClanV1.bind({apiRequest,renderShell:()=>{},clearApiCache:()=>{}})</script>';
   else body='<link rel="stylesheet" href="/css/territory-war-v1811.css"><link rel="stylesheet" href="/css/territory-war-v1824.css"><link rel="stylesheet" href="/css/territory-network-v6.css"><link rel="stylesheet" href="/css/territory-formation-20261013.css"><script src="/js/territory-artillery-fx-20261003.js"></script><script src="/js/territory-network-v6.js"></script><script src="/js/territory-battlefield-v5.js"></script><script src="/js/territory-vote-alert-v1.js"></script><script src="/js/territory-formation-20261013.js"></script><script src="/js/territory-war-v1811.js"></script><script>openTerritoryWar()</script>';
   await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><head>'+style+'</head><body>'+body+'</body></html>'});
  });
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname.slice(5);if(path.startsWith('war-chat/')||path==='admin/war-chat')return route.continue();
   let r;if(path.startsWith('clan/'))r=clanData.get(path)||{status:200,data:{}};else if(path.startsWith('organization/faction/'))r=await ff.call(path+url.search);else if(path.startsWith('territory-war/'))r={status:200,data:territory};else r={status:200,data:{items:[],alerts:[]}};
   return route.fulfill({status:r.status,json:r.data});
  });
  await page.goto(f.origin+'/qa/cms');await page.getByRole('button',{name:'채팅창',exact:true}).click();await page.getByRole('switch',{name:'클랜전 채팅'}).waitFor();
  for(const [kind,name] of [['clan','클랜전'],['territory','영토전'],['faction','세력전']]){
   if((await f.call('admin/war-chat')).settings[kind])await f.enable(kind,false);
  }
  await page.getByRole('button',{name:'새로 불러오기'}).click();await page.waitForFunction(()=>[...document.querySelectorAll('[role=switch]')].length===3&&[...document.querySelectorAll('[role=switch]')].every(b=>b.getAttribute('aria-checked')==='false'&&!b.disabled));
  await page.screenshot({path:join(out,viewport.width+'-cms-off.png'),fullPage:true});
  for(const name of ['클랜전','영토전','세력전']){await page.getByRole('switch',{name:name+' 채팅'}).click();await page.waitForFunction(()=>document.querySelector('[data-chat-admin-status]').textContent.includes('저장 완료'));}
  await page.evaluate(()=>document.getElementById('roleBadge').textContent='ADMIN');await page.waitForFunction(()=>document.querySelector('[data-view="war-chat"]').hidden);assert.equal(await page.locator('#view-war-chat').isVisible(),false);
  for(const kind of ['clan','territory','faction']){
   const path=kind==='faction'?'/organization/faction/?window=1':'/qa/'+kind;await page.goto(f.origin+path,{waitUntil:'domcontentloaded'});console.log('SCREEN',viewport.width,kind,await page.evaluate(()=>document.querySelector('.tw3-error')?.textContent||''));const dock=page.locator('[data-war-chat="'+kind+'"]');await dock.waitFor({state:'attached'});const workspace=page.locator('[data-chat-workspace="'+kind+'"]');if(kind==='territory'){await page.locator('.tw4-shell').waitFor();assert.equal(await page.locator('.tw3-error').count(),0);}if(kind==='faction')await page.locator('.faction-war').waitFor();
   if(await workspace.locator('.war-chat-launch').getAttribute('aria-expanded')!=='true')await workspace.locator('.war-chat-launch').click();await page.waitForFunction(k=>document.querySelector('[data-war-chat="'+k+'"] [data-chat-status]')?.textContent.startsWith('연결됨'),kind);
   const message='검수 '+viewport.width+' '+kind+' <img src=x onerror="window.chatXss=1">';await dock.locator('textarea').fill(message);await dock.getByRole('button',{name:'전송',exact:true}).click();await page.waitForFunction(k=>!document.querySelector('[data-war-chat="'+k+'"] textarea').value,kind);
   assert.equal(await dock.locator('li').filter({hasText:message}).count(),1);assert.equal(await dock.locator('li img,li script').count(),0);assert.equal(await page.evaluate(()=>window.chatXss),undefined);
   if(kind==='clan'&&viewport.width===1440){
    await page.waitForTimeout(1550);await fetch(f.origin+'/__lose-ack?room='+encodeURIComponent('war-chat:clan:12:1'));
    await dock.locator('textarea').fill('응답 유실 후 새로고침 복구');await dock.getByRole('button',{name:'전송',exact:true}).click();await dock.locator('li').filter({hasText:'응답 유실 후 새로고침 복구'}).waitFor();assert(await dock.locator('textarea').isDisabled());
    await page.reload();await page.waitForFunction(()=>{const input=document.querySelector('.war-chat textarea');return input&&!input.disabled&&!input.value;});assert.equal(await page.locator('[data-chat-messages] li').filter({hasText:'응답 유실 후 새로고침 복구'}).count(),1);
   }
   await dock.locator('textarea').fill('화면이 갱신되어도 유지되는 초안');const before=tickets.length;
   if(kind==='clan')await page.evaluate(()=>ClanV1.openWar());else if(kind==='territory')await page.evaluate(()=>openTerritoryWar());else await page.getByRole('button',{name:'전황',exact:true}).count().then(async n=>{if(n)await page.getByRole('button',{name:'전황',exact:true}).click();});
   await page.waitForTimeout(400);assert.equal(await dock.locator('textarea').inputValue(),'화면이 갱신되어도 유지되는 초안');assert.equal(tickets.length,before,'ordinary screen redraw must not reconnect chat');
   const surface=workspace.locator(':scope > .war-chat-surface');assert.equal(await surface.isVisible(),viewport.width>=1280);const frame=await dock.locator('.war-chat-panel').evaluate(n=>getComputedStyle(n).borderImageSource);assert(frame.includes('/mercenary-codex/command-20261021/panel-v3.webp'));const box=await dock.boundingBox();assert(box.x>=0&&box.x+box.width<=viewport.width+1&&box.y>=0&&box.y+box.height<=viewport.height+1);
   await page.screenshot({path:join(out,viewport.width+'-'+kind+'.png')});
   await page.reload();await page.waitForFunction(k=>document.querySelector('[data-war-chat="'+k+'"] [data-chat-status]')?.textContent.startsWith('연결됨'),kind);assert.equal(await page.locator('[data-chat-messages] li').filter({hasText:message}).count(),1,'reload restores committed message once');
   await f.enable(kind,false);await page.waitForFunction(()=>document.querySelector('[data-chat-status]').textContent.includes('OFF'));assert.equal(await page.locator('[data-chat-messages] li').count(),0);assert(await page.locator('.war-chat textarea').isDisabled());
   const offCount=tickets.length;await page.waitForTimeout(1200);assert.equal(tickets.length,offCount,'OFF does not poll');
   await f.enable(kind);await page.getByRole('button',{name:'다시 연결',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-chat-status]').textContent.startsWith('연결됨'));
   await page.getByRole('button',{name:'채팅 숨기기'}).click();assert(await page.locator('.war-chat-panel').isHidden());assert(await surface.isVisible());await page.screenshot({path:join(out,viewport.width+'-'+kind+'-entry.png')});
   report.push({viewport,kind,refresh:'history-once',draft:'preserved',off:'stopped',xss:'text-only',errors:[...errors]});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(join(out,'browser-report.json'),JSON.stringify(report,null,2));
});

test('actual CMS shell registers a separate OWNER menu and returns to the dashboard',async t=>{
 const f=await warChatFixture(t),browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});t.after(()=>page.close());const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('CMS ERROR',e.stack);});page.on('dialog',d=>d.dismiss());
  await page.addInitScript(()=>{localStorage.setItem('cnine_admin_token','chat-qa-1');});
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname.slice(5);if(path==='admin/war-chat')return route.continue();
   const data=path==='admin/dashboard'?{role:'OWNER',admin:{nickname:'검수 관리자',role:'OWNER'},stats:{users:8,draws24h:0,cards:0,totalCoin:0,banned:0,coupons:0}}:{items:[],logs:[],users:[],settings:{},stats:{},rankCounts:{},mode:'OFF',ready:false};
   await route.fulfill({json:data});
  });
  await page.goto(f.origin+'/admin/index.html',{waitUntil:'domcontentloaded'});
  const menu=page.locator('#nav [data-view="war-chat"]');await menu.waitFor({state:'visible'});await menu.click();
  await page.getByRole('switch',{name:'클랜전 채팅'}).waitFor();assert.equal(await page.locator('#view-war-chat').isVisible(),true);assert.equal(await page.locator('#pageTitle').textContent(),'채팅창');
  const switches=page.locator('#view-war-chat [role=switch]');assert.equal(await switches.count(),3);for(const button of await switches.all())assert.equal(await button.getAttribute('aria-checked'),'false');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#view-war-chat>header')).display==='block');if(viewport.width<800)assert((await page.locator('#view-war-chat').boundingBox()).y<250,'mobile CMS controls must start below the compact navigation');
  await page.screenshot({path:join(out,viewport.width+'-cms-actual.png'),fullPage:true});
  await page.locator('#nav [data-view="dashboard"]').click();assert(await page.locator('#view-war-chat').isHidden());assert(await page.locator('#view-dashboard').isVisible());
  await menu.click();await page.evaluate(()=>{state.role='ADMIN';state.admin={...state.admin,role:'ADMIN'};renderIdentity();});await menu.waitFor({state:'hidden'});assert(await page.locator('#view-war-chat').isHidden());
  assert.deepEqual(errors,[]);await page.close();
 }
});
