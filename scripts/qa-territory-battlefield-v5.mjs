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
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.TERRITORY_QA_DIR;
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
try{
 for(const viewport of process.env.TERRITORY_QA_CMS_ONLY==='1'?[]:[{width:1600,height:1000},{width:390,height:844}]){
  let data=fixture();data.front.status='ACTIVE';const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
  await page.addInitScript(value=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(value));localStorage.setItem('cnine_card_api_token','local-territory-v5-review');},user);
  await page.route('**/api/**',async route=>{
    const key=new URL(route.request().url()).pathname.slice(5);
    if(key==='territory-war/state'||key==='territory-war/state-lite')return route.fulfill({json:data});
    if(key==='territory-war/attack'){
      const body=JSON.parse(route.request().postData());assert.equal(body.objective,'RELAY');assert.equal(body.frontId,1);
      const a=factionReviewCards.map(card=>({...card,power:20000000,breakthrough_level:0})),b=factionReviewCards.map(card=>({...card,power:2000,breakthrough_level:0}));
      const battleV2=createPvpBattleV2({attackerCards:a,defenderCards:b,seed:17});data.mine.energy--;data.mine.attacks++;data.battlefield.mine.points+=4;
      return route.fulfill({json:{ok:true,state:data,result:{requestId:body.requestId,objective:'RELAY',facilityPoints:4,attackerWon:true,winnerSide:'A',targetSide:'B',damage:0,personalWinCoin:5000000,nodeIndex:4,opponent:{nickname:'검수 상대'},battleV2}}});
    }
    if(key==='territory-war/activate-operation'){const body=JSON.parse(route.request().postData());assert.ok(body.requestId);data.counter.A.skills[body.operation]={ready:false,readyAt:new Date(Date.now()+45*60000).toISOString()};return route.fulfill({json:{ok:true,result:{operation:body.operation},state:data}});}
    return route.fulfill({json:({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:factionReviewCards},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',startsAt:new Date(Date.now()-172800000).toISOString(),remainingMs:86400000}},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'pvp/config':{settings:{enabled:true}}})[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}}});
  });
  await page.goto(base+'/');await page.waitForFunction(()=>typeof openTerritoryWar==='function');await page.evaluate(()=>openTerritoryWar());
  await page.locator('.tw4-map-art img').evaluate(image=>image.decode());await page.waitForTimeout(300);
  assert.equal(await page.locator('.tw4-node').count(),9);
  assert.equal(await page.locator('.tw6-front-ribbon').count(),0);
  assert.equal(await page.locator('.tw4-map-event').count(),0);
  assert.ok(await page.locator('#territoryWarModalV3').evaluate(element=>element.scrollWidth<=element.clientWidth+1));
  assert.equal(await page.locator('.tw6-fx-canvas').count(),1);
  if(viewport.width>820){
   await page.screenshot({path:path.join(out,'01-pc-strategic-map.png')});
   await page.locator('.tw4-node[data-tw4-node="4"]').click();await page.locator('.tw6-map-entry').click();
   await page.locator('.tw6-field').waitFor();await page.locator('.tw6-field-art img').evaluate(image=>image.decode());await page.waitForTimeout(350);
   assert.equal(await page.locator('.tw4-map-shell').getAttribute('data-tw6-view'),'FIELD');
   await page.locator('[data-tw6-return-map]').click();assert.equal(await page.locator('.tw4-map-shell').getAttribute('data-tw6-view'),'MAP');
   assert.equal(await page.locator('.tw4-node:visible').count(),9);await page.locator('.tw6-map-entry').click();
   await page.screenshot({path:path.join(out,'02-pc-front-entry.png')});
   await page.locator('.tw6-relay-anchor').click();await page.locator('[data-tw4-panel="facilities"]:not([hidden])').waitFor();await page.waitForTimeout(350);
   assert.equal(await page.locator('.tw6-facility').count(),3);await page.locator('.tw6-device-art img').first().evaluate(image=>image.decode());await page.screenshot({path:path.join(out,'03-pc-facilities.png')});
   await page.locator('.tw6-cannon').scrollIntoViewIfNeeded();await page.locator('.tw6-cannon img').evaluate(image=>image.decode());await page.screenshot({path:path.join(out,'04-pc-cannon.png')});
   await page.locator('.tw4-drawer>header [data-tw4-drawer-close]').click();await page.waitForTimeout(300);
   await page.locator('[data-tw4-drawer="operations"]').first().click();await page.locator('.tw5-skill-grid').waitFor();await page.waitForTimeout(350);
   assert.equal(await page.locator('.tw5-skill-grid [data-tw3-operation]').count(),12);
   await page.locator('[data-tw3-operation="EMP_PULSE"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'05-pc-new-skills.png')});
   await page.locator('.tw4-drawer>header [data-tw4-drawer-close]').click();await page.waitForTimeout(300);
   await page.waitForTimeout(350);
   await page.evaluate(()=>CNineTerritoryBattlefield.playPreview('CANNON_FIRED','A'));await page.waitForTimeout(1700);
   await page.screenshot({path:path.join(out,'06-pc-cannon-effect.png')});
  }else{
   await page.screenshot({path:path.join(out,'07-mobile-strategic-map.png')});
   await page.locator('.tw4-node[data-tw4-node="4"]').click();await page.locator('.tw6-map-entry').click();await page.locator('.tw6-field').waitFor();await page.locator('.tw6-field-art img').evaluate(image=>image.decode());await page.waitForTimeout(350);
   await page.screenshot({path:path.join(out,'08-mobile-front-entry.png')});
   await page.locator('.tw6-relay-anchor').click();await page.locator('[data-tw4-panel="facilities"]:not([hidden])').waitFor();await page.waitForTimeout(350);
   await page.locator('.tw6-device-art img').first().evaluate(image=>image.decode());await page.screenshot({path:path.join(out,'09-mobile-facilities.png')});
  }
  if(await page.locator('.tw4-drawer>header [data-tw4-drawer-close]').isVisible())await page.locator('.tw4-drawer>header [data-tw4-drawer-close]').click();await page.waitForTimeout(350);
  const boxes=await page.evaluate(()=>['.tw6-front-title','.tw6-field-navigation','.tw6-live-sitrep','.tw6-relay-anchor','.tw6-objectives','.tw4-action-dock'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{selector,x:r.x,y:r.y,w:r.width,h:r.height}}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x+1||b.x+b.w<=a.x+1||a.y+a.h<=b.y+1||b.y+b.h<=a.y+1,'overlap '+JSON.stringify([a,b]))}
  await page.locator('[data-tw6-objective="RELAY"]').click();assert.match(await page.locator('[data-tw3-attack] b').textContent(),/중계탑/);await page.locator('[data-tw3-attack]').click();
  await page.locator('.tw6-personal-battle .is-v3-ready').waitFor({timeout:60000});
  await page.screenshot({path:path.join(out,viewport.width>820?'10-pc-personal-battle.png':'11-mobile-personal-battle.png')});
  const diagnostic=await page.evaluate(()=>ProjectVPixiBattle.diagnostics());assert.match(JSON.stringify(diagnostic),/battlefield-panorama-1600/);
  await page.locator('.tw3-result-dialog').waitFor({timeout:60000});assert.match(await page.locator('.tw3-result-dialog').textContent(),/중계탑 확보 기여 \+4점/);await page.locator('[data-tw3-battle-confirm]').last().click();
  assert.equal(await page.locator('.tw4-map-shell').getAttribute('data-tw6-view'),'FIELD');
  await page.locator('[data-tw6-return-map]').click();assert.equal(await page.locator('.tw4-node:visible').count(),9);
  checks.push(viewport.width+' actual UI: map entry/return, no overlapping controls, three real facility images, objective selection, real Pixi personal battle and server result');
  await page.close();
 }
 const admin=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});let postedSettings=null;
 admin.on('pageerror',error=>errors.push('CMS: '+error.stack));admin.on('dialog',dialog=>dialog.dismiss());
 await admin.addInitScript(()=>localStorage.setItem('cnine_admin_token','local-cms-fixture'));
 await admin.route('**/api/**',async route=>{
  const key=new URL(route.request().url()).pathname.slice(5);
  if(key==='admin/territory-war/settings'){
   if(route.request().method()==='POST')postedSettings=JSON.parse(route.request().postData());
   return route.fulfill({json:{settings:{...T.DEFAULTS,mode:'ON',battlefield:{...BATTLEFIELD_DEFAULTS,...postedSettings?.battlefield}},state:fixture(),massAssaultBySide:{A:{},B:{}},roundBonusEquipment:[],isOwner:true}});
  }
  if(key==='admin/mercenaries/opening')return route.fulfill({json:{mode:'OFF',ready:false,rankCounts:{},blockers:[]}});
  return route.fulfill({json:key==='admin/dashboard'?{role:'OWNER',admin:{nickname:'CMS 검수',role:'OWNER'},stats:{users:152,cards:5,totalCoin:0,draws24h:0,banned:0,coupons:0}}:{role:'OWNER',settings:{},items:[],users:[],cards:[],events:[],maintenance:{active:false}}});
 });
 await admin.goto(base+'/admin/index.html');await admin.locator('#cms:not([hidden])').waitFor();await admin.locator('[data-view="territorywar"]').click();
 await admin.locator('#tw5-relaySiegeBonusPercent').waitFor();assert.equal(await admin.locator('[id^="tw5-"]').count(),26);
 await admin.locator('#tw5-relaySiegeBonusPercent').fill('17');await admin.locator('#tw5-supplyEnergy').fill('4');await admin.locator('#tw3Save').click();await admin.waitForTimeout(500);
 assert.equal(postedSettings.battlefield.relaySiegeBonusPercent,'17');assert.equal(postedSettings.battlefield.supplyEnergy,'4');assert.equal(postedSettings.battlefield.enabled,true);
 await admin.locator('#tw5Enabled').scrollIntoViewIfNeeded();await admin.screenshot({path:path.join(out,'12-cms-facility-policy.png')});checks.push('CMS: 26 bounded facility fields load and save under battlefield, with future-formation policy notice');await admin.close();
 assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(out,'ui-qa.json'),JSON.stringify({checks,errors,fixtureOnly:true,productionAttack:false},null,2)+'\n');await browser.close();server.close();}
console.log(JSON.stringify({checks,errors,out}));
