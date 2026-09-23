// Local-only browser review of the actual index, navigation and territory UI.
// API responses use synthetic accounts; transaction semantics have DB tests.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
import {territorySkillCatalog} from '../functions/_territory_clan_warfare.js';
import {factionReviewCards} from '../tests/helpers/clan-faction-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.TERRITORY_QA_DIR;
if(!out)throw Error('Set TERRITORY_QA_DIR outside the deploy tree');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res)})});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'})});
const checks=[],errors=[],user={id:1,serverUserId:1,nickname:'영토전 검수 지휘관',role:'OWNER',coin:1234567,cardShards:10,masterStars:10,pigCoin:0,owned:factionReviewCards.map(c=>c.id),quantities:Object.fromEntries(factionReviewCards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
function fixture(phase='RECRUITING',mandatory=true){
  const now=Date.now(),operations=territorySkillCatalog(T.OPERATIONS,{...T.DEFAULTS}),skills=()=>Object.fromEntries(Object.keys(operations).map(code=>[code,{ready:true,readyAt:null}]));
  const teams=['DK','SAMSUNG','T1','HANWHA','LG','LOTTE','FM','DC'].map((mark,i)=>({clanId:i+1,name:['DK','삼성','T1','한화','LG','롯데','FM','DC'][i],markKey:mark,memberCount:18+i%3,side:i<4?'A':'B'}));
  return {mode:'ON',settings:{...T.DEFAULTS,teamAName:'청룡 연합',teamBName:'적룡 연합'},round:{id:59,warfare_version:4,status:phase,current_front_index:4,current_front_id:1,recruitment_ends_at:new Date(now+3600000).toISOString(),ends_at:new Date(now+36000000).toISOString(),version:1},clans:{enabled:true,teams},nodes:T.NODES,front:phase==='RECRUITING'?null:{id:1,sequence:1,node_index:4,node_name:'중앙 교전지',a_hp:1380000,a_max_hp:1500000,b_hp:1200000,b_max_hp:1500000},counts:{total:156,A:79,B:77},mine:mandatory?{user_id:1,side:'A',clan_id:1,mandatory_clan:1,deck_power:1000000,formation_power:1000000,energy:10,attacks:30,damage:50000,formation_breakdown_json:'{"deckComplete":true}',contribution_rank:1,contribution_total:156}:null,registration:{canRegister:!mandatory,canCancel:false},counter:phase==='RECRUITING'?null:{model:'SKILL_COOLDOWN',cooldownMinutes:45,mineSide:'A',isCommander:true,canActivate:true,operations,A:{skills:skills(),readyCount:8,ready:true,operation:{active:false}},B:{skills:skills(),readyCount:8,ready:true,operation:{active:false}}},commanders:{mineSide:'A',A:{user_id:1,nickname:user.nickname,command_score:50000},B:{user_id:2,nickname:'상대 지휘관'},canBroadcast:true},commandMessages:[],ranking:[{user_id:1,clan_id:1,side:'A',nickname:user.nickname,attacks:30,damage:50000}],recentActions:[],recentResults:[],truce:{active:false},comeback:{active:false},fatigue:{active:false},lastDefense:{active:false},serverNow:new Date(now).toISOString()};
}
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  let data=fixture(),lastKey='',calls=0;
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',error=>errors.push(error.message));page.on('dialog',d=>d.dismiss());
  await page.addInitScript(u=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','territory-local-qa');},user);
  await page.route('**/api/**',async route=>{
    const key=new URL(route.request().url()).pathname.slice(5);
    if(key==='territory-war/state'||key==='territory-war/state-lite')return route.fulfill({json:data});
    if(key==='territory-war/activate-operation'){
      const body=JSON.parse(route.request().postData());assert.ok(body.requestId);lastKey=body.requestId;calls++;
      data.counter.A.skills[body.operation]={ready:false,readyAt:new Date(Date.now()+45*60000).toISOString()};data.counter.A.readyCount--;
      return route.fulfill({json:{ok:true,activated:true,result:{damage:120000},state:data}});
    }
    if(key==='territory-war/register'){data.mine={user_id:1,side:null,deck_power:1000000,mandatory_clan:0};data.registration={canRegister:false,canCancel:true};return route.fulfill({json:{ok:true,state:data}})}
    if(key==='territory-war/unregister'){data.mine=null;data.registration={canRegister:true,canCancel:false};return route.fulfill({json:{ok:true,state:data}})}
    if(key==='territory-war/refresh-loadout'){if(data.mine)data.mine.formation_breakdown_json='{"deckComplete":true}';return route.fulfill({json:{ok:true,deckPower:1000000,state:data}})}
    return route.fulfill({json:({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:factionReviewCards},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:true,ordinal:3,nickname:'검수 족장',startsAt:new Date(Date.now()-172800000).toISOString(),remainingMs:86400000}},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{serverNow:new Date().toISOString(),items:[]},'pvp/config':{settings:{enabled:true}}})[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}}});
  });
  await page.goto(base+'/');await page.waitForFunction(()=>typeof openTerritoryWar==='function');
  const lobby=page.locator('soop-adventure-lobby');await lobby.locator('.stage-character').waitFor();
  if(viewport.width>980)await lobby.locator('.sidebar [data-category="pvp"]').click();else await lobby.locator('.mobile-dock [data-category="all"]').click();
  await lobby.locator('.menu-result[data-route="territory"]').click();await page.locator('.tw5-recruit-alliances').waitFor();
  assert.equal(await page.locator('.tw5-recruit-alliances img').count(),8);assert.equal(await page.locator('[data-tw3-unregister]').count(),0);
  await page.locator('[data-tw3-loadout-refresh]').click();await page.locator('[data-tw3-loadout-refresh]:not([disabled])').waitFor();
  assert.ok(await page.locator('#territoryWarModalV3').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.locator('#territoryWarModalV3').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'recruit-'+viewport.width+'.png'),fullPage:true});checks.push(viewport.width+' menu, eight clan marks, mandatory enrollment, refresh, no cancellation');
  data=fixture('RECRUITING',false);await page.evaluate(()=>openTerritoryWar());await page.locator('[data-tw3-register]:not([disabled])').click();await page.locator('[data-tw3-unregister]').click();await page.evaluate(()=>{window.confirm=()=>true});await page.locator('[data-tw3-unregister]').click();await page.locator('[data-tw3-register]:not([disabled])').waitFor();checks.push(viewport.width+' clanless join/cancel');
  data=fixture('ACTIVE');await page.evaluate(()=>openTerritoryWar());await page.locator('.tw4-scoreboard .tw5-clan').first().waitFor();
  assert.equal(await page.locator('.tw4-scoreboard article .tw5-clan').count(),8);await page.screenshot({path:path.join(out,'battlefield-'+viewport.width+'.png')});
  await page.locator('[data-tw4-drawer="operations"]').first().click();await page.locator('.tw5-skill-grid').waitFor();assert.equal(await page.locator('.tw5-skill-grid button').count(),8);
  await page.locator('[data-tw3-operation="INFILTRATION"]').click();await page.locator('[data-tw4-drawer="operations"]').first().click();assert.ok(await page.locator('[data-tw3-operation="INFILTRATION"]').isDisabled());assert.ok(await page.locator('[data-tw3-operation="ASSAULT"]').isEnabled());assert.equal(calls,1);assert.ok(lastKey);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('cnine-territory-skill:')).length),0);
  await page.waitForFunction(()=>{const d=document.querySelector('.tw4-drawer-layer.open .tw4-drawer');if(!d)return false;const m=new DOMMatrix(getComputedStyle(d).transform);return Math.abs(m.e)<.5&&Math.abs(m.f)<.5});await page.screenshot({path:path.join(out,'skills-'+viewport.width+'.png')});assert.ok(await page.locator('.tw4-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  for(const src of await page.locator('.tw5-clan img').evaluateAll(nodes=>nodes.map(n=>({complete:n.complete,width:n.naturalWidth}))))assert.ok(src.complete&&src.width>0);
  await page.locator('[data-tw3-operation="REGROUP"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'skills-bottom-'+viewport.width+'.png')});
  checks.push(viewport.width+' map, skill request id, per-skill cooldown, other skill ready, readable drawer');
  data=fixture('ACTIVE');data.mine.formation_breakdown_json='{"deckComplete":false}';await page.evaluate(()=>openTerritoryWar());assert.equal(await page.locator('[data-tw3-attack]').count(),0);await page.locator('.tw4-attack-button[data-tw4-drawer="loadout"]').click();await page.locator('[data-tw3-loadout-refresh]:not([disabled])').click();await page.locator('[data-tw3-attack]').waitFor();checks.push(viewport.width+' incomplete mandatory deck leads to preparation and restores attack after refresh');await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks,errors}));
}finally{fs.writeFileSync(path.join(out,'qa-results.json'),JSON.stringify({checks,errors},null,2));await browser.close();server.close()}
