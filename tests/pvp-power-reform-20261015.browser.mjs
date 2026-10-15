// Isolated local GET-only fixtures. The review flag is changed in an HTTP
// response for this browser only; production files and accounts remain untouched.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {snapshot,reviewOptions} from './helpers/pvp-power-reform-20261015.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/pvp-power-reform-20261015');
fs.mkdirSync(out,{recursive:true});
const codex=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
const valter=codex.cards.find(c=>c.code==='V-996');
const account={accountId:7,available:true,policy:{mode:'ON'},leveling:{enabled:false},cards:[{...valter,...snapshot('V-996'),totalCopies:1,duplicates:0,level:1,canDeploy:true}],loadouts:{PVE:{mercenaryCode:'V-996',revision:0},PVP:{mercenaryCode:'V-996',revision:0}}};
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const battle=createPvpBattleV2({attackerCards:deck.map(c=>({...c,power:4e7})),defenderCards:deck,attackerMercenary:snapshot('V-996'),defenderMercenary:snapshot('V-055'),seed:7919,...reviewOptions});
const event=battle.result.timeline.find(e=>e.type==='TURN'&&e.actorId.startsWith('A:')&&!e.actorId.includes('MERCENARY'));
assert.ok(event?.damage>0);const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:structuredClone(battle)};payload.battleV2.result.timeline=[];
const template=fs.readFileSync(path.join(root,'preview/mercenary-limited-ayoon-heeya-v3-20261008/index.html'),'utf8');
const html=template.replace('<script defer src="preview.bundle.js"></script>','<script defer src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script defer src="/qa-boot.js"></script>').replace(/<body>[\s\S]*<\/body>/,'<body><header><h1>PVP 전투력 개편 · 로컬 검수</h1><p>라이브 미반영 · 서버 판정 피해 연결</p></header><main id="lab-modal"></main></body>');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const data=await fetch('/qa-data').then(r=>r.json());window.cnineCardCatalog=()=>data.deck;
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('lab-modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'PVP',playerName:'개편 검수',opponentName:'검수 상대'});
 const renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:'PVP',playerName:'개편 검수'});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});engine.actionPlaybackSpeed=()=>3;
 window.PowerQA={engine,renderer,event:data.event,ready:true};
 }catch(e){window.qaError=e.stack;}});`;
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{try{
 if(req.method!=='GET')return res.writeHead(405).end();
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/api/mercenary-codex')return json(res,codex);
 if(url.pathname==='/api/mercenaries/v3/state')return json(res,account);
 if(url.pathname.startsWith('/api/'))return json(res,{visible:false,enabled:false,items:[]});
 if(url.pathname==='/qa-data')return json(res,{deck,payload,event});
 if(url.pathname==='/qa-battle.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
 if(url.pathname==='/qa-boot.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(boot);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});
 fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.message));
  await page.route('**/shared/pvp-power-balance-v1.mjs',async route=>{
   const source=fs.readFileSync(path.join(root,'shared/pvp-power-balance-v1.mjs'),'utf8');assert.ok(source.includes('PVP_POWER_BALANCE_RELEASED=false'));
   await route.fulfill({contentType:'text/javascript',body:source.replace('PVP_POWER_BALANCE_RELEASED=false','PVP_POWER_BALANCE_RELEASED=true')});
  });
  await page.goto(base+'/mercenary-codex/?mode=PVP#V-996');
  await page.locator('.deployment-card').filter({hasText:'내 용병'}).waitFor();
  assert.ok((await page.locator('.deployment-card').innerText()).includes('180,000'));
  assert.ok((await page.locator('.limited-combat-note').innerText()).includes('PVP 개편 기준'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('.combat-panel').screenshot({path:path.join(out,label+'-pvp-codex.png')});
  await page.locator('.limited-combat-note').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  assert.ok(await page.locator('.limited-combat-note').evaluate(el=>el.getBoundingClientRect().bottom<innerHeight-80),'description can be read above the bottom navigation');
  await page.locator('.limited-combat-note').screenshot({path:path.join(out,label+'-pvp-description.png')});
  await page.locator('[data-loadout-mode="PVE"]').click();
  assert.ok((await page.locator('.deployment-card').innerText()).includes('1,080,000'));
  assert.ok(!(await page.locator('.combat-panel').innerText()).includes('PVP 개편 기준'));
  checks.push({label,modeDisplay:{PVP:180000,PVE:1080000},overflow:false});
  await page.goto(base+'/qa-battle.html');await page.waitForFunction(()=>window.PowerQA?.ready||window.qaError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.qaError),undefined);
  const played=await page.evaluate(async()=>{const q=window.PowerQA,calls=[],original=q.engine.syncTargetHp.bind(q.engine);q.engine.syncTargetHp=(t,h)=>{calls.push({id:t.id,hp:h});return original(t,h);};await q.engine.playEvents([q.event],{timedInternal:true});return {calls,event:q.event,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  const expectedHp=event.targetHpAfter/event.targetMaxHp*100;
  assert.ok(played.calls.some(c=>c.id===event.targetId&&Math.abs(c.hp-expectedHp)<1e-8),JSON.stringify(played));
  assert.equal(played.calls.length,event.hits?.length||1,'visual hits use the authoritative split without another damage application');assert.equal(played.overflow,false);
  checks.push({label,v3ServerHit:{actorId:event.actorId,targetId:event.targetId,damage:event.damage,hpAfter:event.targetHpAfter},hpMatched:true});
  await page.screenshot({path:path.join(out,label+'-pvp-battle.png'),fullPage:true});await page.close();
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASS',environment:'LOCAL_MOCK_ONLY',checks,errors},null,2)+'\n');
 console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
