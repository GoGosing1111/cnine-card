// Actual index + production UI modules. All accounts and API state are local fixtures.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
import {territorySkillCatalog} from '../functions/_territory_clan_warfare.js';
import {BATTLEFIELD_DEFAULTS,battlefieldSkillCatalog} from '../shared/territory-battlefield-v5.mjs';
import {factionReviewCards} from '../tests/helpers/clan-faction-fixture.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.TERRITORY_FX_QA_DIR;
if(!out||path.resolve(out).startsWith(path.resolve(root)+path.sep))throw Error('Set TERRITORY_QA_DIR outside the deploy tree');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res)})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:'chrome'});
const checks=[],errors=[],user={id:1,serverUserId:1,nickname:'전장 검수 지휘관',role:'OWNER',coin:1234567,cardShards:10,masterStars:10,pigCoin:0,owned:factionReviewCards.map(card=>card.id),quantities:Object.fromEntries(factionReviewCards.map(card=>[card.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
function fixture(){
 const now=Date.now(),operations={...territorySkillCatalog(T.OPERATIONS,T.DEFAULTS),...battlefieldSkillCatalog()},skills=()=>Object.fromEntries(Object.keys(operations).map(code=>[code,{ready:true,readyAt:null}]));
 const teams=['DK','SAMSUNG','T1','HANWHA','LG','LOTTE','FM','DC'].map((mark,i)=>({clanId:i+1,name:['DK','삼성','T1','한화','LG','롯데','FM','DC'][i],markKey:mark,memberCount:19,side:i<4?'A':'B'}));
 return {mode:'ON',settings:{...T.DEFAULTS,teamAName:'벤츠',teamBName:'BMW',energyMax:15},round:{id:64,warfare_version:4,status:'ACTIVE',battle_name:'독일차',current_front_index:4,current_front_id:1,ends_at:new Date(now+36000000).toISOString(),version:1},clans:{enabled:true,teams},nodes:T.NODES,front:{id:1,sequence:3,node_index:4,node_name:'중앙 교전지',started_at:new Date(now-60000).toISOString(),a_hp:3900000,a_max_hp:5000000,b_hp:2100000,b_max_hp:5000000},counts:{total:152,A:76,B:76},mine:{user_id:1,side:'A',clan_id:1,mandatory_clan:1,deck_power:1000000,formation_power:1000000,energy:12,attacks:76,damage:265000,formation_breakdown_json:'{"deckComplete":true}',contribution_rank:1,contribution_total:152},registration:{canRegister:false,canCancel:false},counter:{model:'SKILL_COOLDOWN',cooldownMinutes:45,mineSide:'A',isCommander:true,canActivate:true,operations,A:{skills:skills(),readyCount:12,ready:true,operation:{active:false}},B:{skills:skills(),readyCount:12,ready:true,operation:{active:false}}},commanders:{mineSide:'A',A:{user_id:1,nickname:user.nickname,command_score:265000},B:{user_id:2,nickname:'동부 전장 지휘관'},canBroadcast:true},commandMessages:[{side:'A',nickname:user.nickname,user_id:1,created_at:new Date().toISOString(),message:'중계탑 확보 후 공성포로 중앙 방벽을 돌파합니다.'}],ranking:[{user_id:1,clan_id:1,side:'A',nickname:user.nickname,attacks:76,damage:265000}],recentActions:[],recentResults:[],truce:{active:false},comeback:{active:false},fatigue:{active:false},lastDefense:{active:false},serverNow:new Date(now).toISOString(),battlefield:{version:5,frontId:1,config:BATTLEFIELD_DEFAULTS,relay:{meter:20,owner:'A',goal:20},A:{charge:100,disabledUntil:0,breachUntil:0,cannonDueAt:0},B:{charge:76,disabledUntil:0,breachUntil:0,cannonDueAt:0},supply:{cycle:1,active:true,startsAt:now-60000,endsAt:now+240000,nextAt:now+840000,winner:'',aPoints:14,bPoints:12,goal:20},supplyClaim:null,mine:{battles:76,points:32,charge:100},events:[]}};
}
async function ready(page){
 await page.waitForFunction(()=>CNineTerritoryBattlefield.diagnostics().ready,{},{timeout:60000});
 const diagnostic=await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics());
 assert.deepEqual(diagnostic.frames,{muzzle:16,projectile:8,impact:16});assert.equal(diagnostic.failed,'');
 assert.equal(await page.locator('.tw6-fx-canvas').count(),1);return diagnostic;
}
async function fire(page,side='A'){
 await page.evaluate(async side=>{CNineTerritoryBattlefield.previewControl('stop');await CNineTerritoryBattlefield.playPreview('CANNON_FIRED',side);},side);
 await page.waitForFunction(()=>CNineTerritoryBattlefield.diagnostics().active===1);
}
async function seek(page,time){await page.evaluate(time=>CNineTerritoryBattlefield.previewControl('seek',time),time);await page.waitForTimeout(60);return page.evaluate(()=>CNineTerritoryBattlefield.diagnostics());}
try{
 if(process.env.FX_QA_MODE!=='live')for(const viewport of [{width:1600,height:1000},{width:390,height:844}]){
  const device=viewport.width>820?'pc':'mobile',context=await browser.newContext({viewport,serviceWorkers:'block',recordVideo:{dir:out,size:viewport}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(device+': '+error.stack));
  await page.goto(base+'/preview/territory-artillery-fx-20261003/index.html');await ready(page);
  await fire(page);await seek(page,.29);await page.screenshot({path:path.join(out,device+'-muzzle.png')});
  const inFlight=await seek(page,.69);assert.equal(inFlight.last.contact.phase,'flight');await page.screenshot({path:path.join(out,device+'-flight.png')});
  const contact=await seek(page,1.05);assert.deepEqual(contact.last.contact.projectile,contact.last.contact.target);
  await seek(page,1.60);await page.screenshot({path:path.join(out,device+'-impact.png')});
  await seek(page,2.65);await page.screenshot({path:path.join(out,device+'-smoke.png')});
  const paused=await seek(page,.72);await page.waitForTimeout(350);assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).last.time,paused.last.time);
  await page.evaluate(()=>CNineTerritoryBattlefield.previewControl('resume'));await page.waitForTimeout(220);assert.ok((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).last.time>.85);
  await fire(page,'B');await seek(page,.29);await page.screenshot({path:path.join(out,device+'-reverse.png')});
  await page.evaluate(()=>{CNineTerritoryBattlefield.previewControl('seek',0);CNineTerritoryBattlefield.previewControl('speed',.5);CNineTerritoryBattlefield.previewControl('resume');});
  await page.waitForTimeout(1000);const slow=await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics());assert.ok(slow.last.time>.38&&slow.last.time<.75,'half-speed timeline');
  await page.locator('#toggle').click();assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).active,0);assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).timelines,0);
  await page.locator('#toggle').click();await fire(page);await page.evaluate(()=>CNineTerritoryBattlefield.previewControl('speed',1));await page.waitForTimeout(3450);
  assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).active,0);assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).timelines,0);
  for(let i=0;i<3;i++){await fire(page,i%2?'B':'A');await page.waitForTimeout(3250);}
  await page.evaluate(()=>CNineTerritoryBattlefield.dispose());assert.equal(await page.locator('.tw6-fx-canvas').count(),0);
  checks.push(device+': authored 16/8/16 frames, exact flight/contact point, pause/seek/resume, 0.5x, FX off/on, repeat, cleanup');
  const video=page.video();await context.close();await video.saveAs(path.join(out,device+'-playback.webm'));
 }
 if(process.env.FX_QA_MODE!=='preview')for(const viewport of [{width:1600,height:1000},{width:390,height:844}]){
  const device=viewport.width>820?'pc':'mobile';let data=fixture();data.front.status='ACTIVE';
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',error=>errors.push('live '+device+': '+error.stack));page.on('dialog',dialog=>dialog.dismiss());
  await page.addInitScript(value=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(value));localStorage.setItem('cnine_card_api_token','local-territory-fx-review');},user);
  await page.route('**/api/**',async route=>{
    const key=new URL(route.request().url()).pathname.slice(5);
    if(key==='territory-war/state'||key==='territory-war/state-lite')return route.fulfill({json:data});
    if(key==='territory-war/attack'){
      const body=JSON.parse(route.request().postData());assert.equal(body.objective,'RELAY');assert.equal(body.frontId,1);
      const a=factionReviewCards.map(card=>({...card,power:20000000,breakthrough_level:0})),b=factionReviewCards.map(card=>({...card,power:2000,breakthrough_level:0}));
      const battleV2=createPvpBattleV2({attackerCards:a,defenderCards:b,seed:17});data.mine.energy--;data.mine.attacks++;
      return route.fulfill({json:{ok:true,state:data,result:{requestId:body.requestId,objective:'RELAY',facilityPoints:4,attackerWon:true,winnerSide:'A',targetSide:'B',damage:0,personalWinCoin:5000000,nodeIndex:4,opponent:{nickname:'검수 상대'},battleV2}}});
    }
    return route.fulfill({json:({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:factionReviewCards},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',startsAt:new Date(Date.now()-172800000).toISOString(),remainingMs:86400000}},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'pvp/config':{settings:{enabled:true}}})[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}}});
  });
  await page.goto(base+'/');await page.waitForFunction(()=>typeof openTerritoryWar==='function');await page.evaluate(()=>openTerritoryWar());
  await page.locator('.tw4-node[data-tw4-node="4"]').click();await page.locator('.tw6-map-entry').click();await ready(page);
  await fire(page);await seek(page,1.6);await page.screenshot({path:path.join(out,'live-'+device+'-impact.png')});
  const geometries=await page.evaluate(()=>{const a=CNineTerritoryBattlefield.diagnostics().geometry;return [a.w,a.h,a.width];});assert.ok(geometries[0]>0&&geometries[1]>0);
  await page.locator('[data-tw6-return-map]').click();assert.equal((await page.evaluate(()=>CNineTerritoryBattlefield.diagnostics())).paused,true);
  await page.locator('.tw4-node[data-tw4-node="4"]').click();await page.locator('.tw6-map-entry').click();await ready(page);
  await page.locator('[data-tw6-objective="RELAY"]').click();await page.locator('[data-tw3-attack]').click();
  await page.locator('.tw6-personal-battle .is-v3-ready').waitFor({timeout:60000});
  assert.equal(await page.locator('.tw6-fx-canvas').count(),0,'ambient renderer released to personal battle');assert.equal(await page.locator('.tw6-personal-battle canvas').count(),1);
  await page.screenshot({path:path.join(out,'live-'+device+'-personal-battle.png')});
  await page.locator('.tw3-result-dialog').waitFor({timeout:60000});assert.match(await page.locator('.tw3-result-dialog').textContent(),/중계탑 확보 기여 \+4점/);await page.locator('[data-tw3-battle-confirm]').last().click();
  await ready(page);await fire(page,'B');await seek(page,1.6);await page.screenshot({path:path.join(out,'live-'+device+'-return.png')});
  assert.equal(await page.locator('.tw6-personal-battle').count(),0);assert.equal(await page.locator('canvas.pv-pixi-canvas').count(),1);
  checks.push(device+': actual main loader, live territory entry, map pause, one renderer transfer to personal V3 combat, server result, return/replay');await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(out,'ui-qa.json'),JSON.stringify({checks,errors,fixtureOnly:true,productionAttack:false},null,2)+'\n');await browser.close();server.close();}
console.log(JSON.stringify({checks,errors,out}));
