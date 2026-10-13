// Loopback-only browser fixture: real shared lobby + real favorites handler/SQL.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleMenuFavorites} from '../functions/_menu_favorites.js';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),output=process.env.MENU_FAVORITES_QA_DIR;
if(!output)throw Error('Set MENU_FAVORITES_QA_DIR outside the checkout.');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await fs.mkdir(output,{recursive:true});
const db=new PGlite();await db.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)');
const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const result=await db.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}});
let failWrite=false;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.avif':'image/avif','.woff2':'font/woff2','.json':'application/json'};
const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
const bootstrap=`window.qaUser={serverUserId:81001,nickname:'즐겨찾기 검수',coin:1000};window.qaHidden=[];window.qaNavigation=[];localStorage.setItem('cnine_card_api_token','qa-81001');
const lobby=window.qaLobby=SoopAdventureLobby.create({getUser:()=>qaUser,isRouteVisible:id=>!qaHidden.includes(id),navigate:(id,href)=>{qaNavigation.push({id,href:href||null});lobby.setRoute(id);},openChief:()=>{},openAccount:()=>{}});lobby.setAttribute('data-shared-navigation','');lobby.dataset.view='home';lobby.dataset.route='home';document.body.append(lobby);`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/')return send(res,200,`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080c17;color:white;height:100dvh}soop-adventure-lobby{position:fixed;inset:0}</style><script defer src="/js/soopketmon-v21-exact-shell-adapter.js" data-enabled="false"></script><script defer src="/js/adventure-lobby-v2107.js"></script><script defer src="/__qa-bootstrap.js"></script></head><body></body></html>`,'text/html');
  if(url.pathname==='/__qa-bootstrap.js')return send(res,200,bootstrap,'text/javascript');
  if(url.pathname==='/api/me/menu-favorites'){
   if(req.method==='POST'&&failWrite){failWrite=false;return send(res,503,{error:'QA injected save failure'});}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const id=Number(String(req.headers.authorization||'').match(/^Bearer qa-(\d+)$/)?.[1]);
   const request=new Request('http://127.0.0.1'+req.url,{method:req.method,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const response=await handleMenuFavorites({path:'me/menu-favorites',request,env:{DB},deps:{authenticate:async()=>id?{id}:null,readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
   return send(res,response.status,response.body);
  }
  if(url.pathname.startsWith('/api/'))return send(res,200,{visible:false,seasonPass:{visible:false},support:{visible:false}});
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep))return send(res,404,{});
  return send(res,200,await fs.readFile(file),mime[path.extname(file)]||'application/octet-stream');
 }catch(error){send(res,500,{error:String(error)});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const device=viewport.width>700?'pc':'mobile',context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(device+': '+error.message));
  await page.goto(base);await page.locator('soop-adventure-lobby').waitFor();
  const host=page.locator('soop-adventure-lobby'),menu=host.locator('#menu-dialog');
  const ready=async()=>page.waitForFunction(()=>{const root=document.querySelector('soop-adventure-lobby')?.shadowRoot;return root&&root.getElementById('favorites-status').hidden;});
  await ready();
  const openFavorites=async()=>{await host.locator(device==='pc'?'.sidebar [data-category="favorites"]':'.mobile-dock [data-category="favorites"]').click();await ready();};
  const star=id=>host.locator(`[data-favorite-route="${id}"]`);
  async function add(id,search){await host.locator('#menu-favorites').locator('..').locator('[data-category="all"]').click();await host.locator('#menu-search').fill(search);await star(id).click();await ready();assert.equal(await star(id).getAttribute('aria-pressed'),'true');}
  await openFavorites();
  if(device==='pc'){
   assert.equal(await host.locator('#empty-favorites').isVisible(),true);
   await add('hunt','몬스터 토벌');await add('mercenaryDex','용병도감');await add('pvp','랭크전');
   await host.locator('#menu-favorites').click();await ready();assert.equal(await host.locator('.menu-result-row').count(),3);
   await star('pvp').focus();await page.keyboard.press('Space');await ready();assert.equal(await host.locator('.menu-result-row').count(),2);
   await page.reload();await ready();await openFavorites();assert.equal(await host.locator('.menu-result-row').count(),2);
   checks.push({device,emptyState:true,add:true,removeByKeyboard:true,reloadPersistence:true});
  }else{
   assert.equal(await host.locator('.menu-result-row').count(),2,'new device reads the same account favorites from the server');
   checks.push({device,otherDevicePersistence:true});
  }
  await host.locator('#menu-search').fill('용병');assert.equal(await host.locator('.menu-result-row').count(),1);await host.locator('#clear-search').click();
  const box=await menu.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));assert.ok(box.scroll<=box.width+1,'menu has no horizontal overflow');
  const stars=await host.locator('.menu-favorite-toggle').evaluateAll(nodes=>nodes.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  assert.ok(stars.every(b=>b.width>=44&&b.height>=44));
  await page.screenshot({path:path.join(output,device+'-favorites.png')});
  await host.locator('[data-route="mercenaryDex"]').click();assert.equal(await menu.isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>qaNavigation.at(-1)),{id:'mercenaryDex',href:'/mercenary-codex/'});
  await openFavorites();failWrite=true;await star('hunt').click();await host.locator('#favorites-status').filter({hasText:'저장하지 못'}).waitFor();assert.equal(await star('hunt').getAttribute('aria-pressed'),'true');
  await host.locator('#favorites-retry').click();await ready();
  await page.evaluate(()=>{qaHidden=['hunt'];qaLobby.refreshMenus();});assert.equal(await star('hunt').count(),0);
  await page.evaluate(()=>{qaHidden=[];qaLobby.refreshMenus();});assert.equal(await star('hunt').count(),1);
  await page.evaluate(()=>{qaUser={serverUserId:81002,nickname:'다른 계정'};localStorage.setItem('cnine_card_api_token','qa-81002');qaLobby.update({user:qaUser});});await ready();assert.equal(await host.locator('.menu-result-row').count(),0);
  if(device==='mobile'){
   await host.locator('#close-menu').click();const dock=await host.locator('.mobile-dock button').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert.ok(dock.every(b=>b.width>=44&&b.height>=44));
  }
  checks.push({device,search:true,starTouchTarget44:true,noOverflow:true,standaloneDestination:true,saveFailurePreservesState:true,hiddenRouteFiltered:true,accountIsolation:true});await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
