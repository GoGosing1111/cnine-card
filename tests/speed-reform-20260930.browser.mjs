// Real entry points, deployed bundle and original card/SD assets. Account APIs
// are intercepted; controlled combat fixtures never modify live accounts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const fixture=read('tests/fixtures/v3-completion-payload-20260928.json');
const ss=read('assets/ui/project-v/characters/superstar/manifest-v1.json').characters;
const fur=read('assets/ui/project-v/characters/fur/manifest-v1.json').characters[1];
const base=fixture.battleV2.teams.A.cards.slice(0,3).map(c=>({id:c.cardId,title:c.title,rarity:c.grade,image:c.image,type:c.type}));
base.push({id:fur.cardId,title:fur.title,rarity:'FUR',image:fur.sourceArt,type:'ATTACK'});
function deck(id){return [...base,...ss.filter(c=>c.cardId===id).map(c=>({id:c.cardId,title:c.title,rarity:'SUPERSTAR',image:c.sourceArt,type:id.includes('A041')?'SPEED':'ATTACK'}))].map(c=>{
 const e={dominantType:c.type,attackPercent:c.type==='ATTACK'?50:0,defensePercent:c.type==='DEFENSE'?50:0,hpPercent:c.type==='HP'?50:0,speedPercent:c.type==='SPEED'?50:0};
 if(c.rarity==='SUPERSTAR')Object.assign(e,{attackPercent:c.type==='SPEED'?30:50,defensePercent:30,speedPercent:c.type==='SPEED'?50:30});
 return {...c,grade:c.rarity,name:c.title,image_url:c.image,power:Math.round(90000*(1+e.attackPercent/100)),baseBattlePower:90000,uniqueAbility:e};
});}
const ours=deck('CN-A041807B14B54C89'),theirs=deck('CN-651FAC27247A4922'),cards=[...ours,theirs[4]];
const pvp=createPvpBattleV2({attackerCards:ours,defenderCards:theirs,attackerEquipmentBonus:500000,defenderEquipmentBonus:500000,seed:9931});
const monster={...fixture.monster,battlePower:300000,isBoss:true};
const pve=createPveBattleV2({cards:ours,characterBonus:500000,monster,seed:9931});
const user={id:4242,serverUserId:4242,nickname:'속도형 검수',role:'USER',coin:123456789,cardShards:0,masterStars:0,owned:ours.map(c=>c.id),quantities:Object.fromEntries(ours.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const energy={energy:100,maxEnergy:100,costPerBattle:1,unlimited:true};
const settings={enabled:true,powerByGrade:{FUR:83200,ZENITH:75625,SUPERSTAR:93200},breakthroughBonus:[0],seasonName:'개편 검수',tiers:[]};
const common={settings,deck:ours.map(c=>c.id),energy,battleEngine:{active:true,version:'V3',mode:'V3'},characterBonus:{pve:500000,pvp:500000},deckRules:{deckSize:5,gradeLimits:{FUR:2,ZENITH:2,SUPERSTAR:1}},serverNow:new Date().toISOString()};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/,''),file=path.resolve(root,relative||'index.html');
 if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const out=process.env.SPEED_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'speed-reform-qa-'));fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'}),errors=[],requests=[],missing=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url().replace(origin,''),status:r.status()});});
  page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','speed-local-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/api/**',r=>{
   const key=new URL(r.request().url()).pathname.slice(5);requests.push(key);
   const data={
    'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},
    'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'streamer-profiles':{enabled:false,profiles:[]},
    'pvp/config':{...common,battleSettings:settings,profile:{season_score:1200,tier:{id:'bronze',name:'브론즈',min:0}}},
    'pvp/match':{opponent:{id:999,nickname:'CR7 검수',season_score:1200},token:'local-only'},
    'pvp/fight':{...common,battleV2:pvp,result:pvp.result.winner==='A'?'WIN':'LOSE',opponent:'CR7 검수',scoreAfter:1200,scoreChange:0,attackerPower:pvp.teams.A.summary.power,defenderPower:pvp.teams.B.summary.power},
    'battle/config':{...common,monsters:[monster]},'battle/fight':{...common,battleV2:pve,result:pve.result.winner==='A'?'WIN':'LOSE',monster,user},
   }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   return r.fulfill({json:data});
  });
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof renderShell==='function'&&typeof ensureFeatureResources==='function');
  await page.evaluate(async()=>{
   await ensureFeatureResources('battleV2');window.__speedQA={combos:[],hp:[]};
   const api=window.ProjectVPixiBattle,original=api.mountForBattle;
   api.mountForBattle=async function(...args){
    const engine=await original(...args);window.__speedQA.engine=engine;
    const attack=engine.normalAttack;
    engine.normalAttack=async function(index,options){
     if(options?.hitSequence?.length)window.__speedQA.combos.push({count:options.hitSequence.length,targetId:options.target?.id,sequence:options.hitSequence});
     return attack.call(this,index,options);
    };
    for(const c of engine.characters){const set=c.setHp;c.setHp=function(hp){window.__speedQA.hp.push({id:this.id,hp});return set.call(this,hp);};}
    return engine;
   };
   pvpState.tab='match';renderShell('pvp');
  });
  await page.locator('#rankedMatchStart:not([disabled])').waitFor();
  await page.locator('#rankedMatchStart').click();
  await page.waitForFunction(()=>window.__speedQA.combos.length>0||document.getElementById('pvpErrorConfirm'),{},{timeout:45000});
  assert.equal(await page.locator('#pvpErrorConfirm').count(),0,await page.locator('#modal').innerText());
  await page.waitForFunction(()=>{
   const qa=window.__speedQA,engine=qa?.engine;
   if(qa?.combos.length<4)return false;
   const label=[...engine.pools.damage.inUse].find(d=>d.roleTag.text==='3 HIT · TOTAL'&&d.alpha>.8);
   if(!label)return false;
   for(const entry of engine.simpleTimelines)entry.instance.pause();
   const bounds=label.numberLabel.getBounds();
   qa.readout={total:label.numberLabel.text,hits:label.speedHitLabels.filter(x=>x.alpha>0).map(x=>x.text),bounds:{left:bounds.minX,top:bounds.minY,right:bounds.maxX,bottom:bounds.maxY},width:engine.app.screen.width,height:engine.app.screen.height};
   return true;
  });
  await page.screenshot({path:path.join(out,`pvp-${viewport.width}.png`)});
  const readout=await page.evaluate(()=>{for(const entry of __speedQA.engine.simpleTimelines)entry.instance.resume();return __speedQA.readout;});
  const number=s=>Number(s.replaceAll(',',''));
  assert.equal(number(readout.total),readout.hits.reduce((n,s)=>n+number(s),0));
  assert.ok(readout.bounds.top>=0&&readout.bounds.left>=0&&readout.bounds.right<=readout.width,'combo total fits battlefield');
  await page.locator('#pvpResultConfirm').waitFor({timeout:60000});
  const evidence=await page.evaluate(()=>({version:ProjectVPixiBattle.runtimeVersion,combos:__speedQA.combos,hp:__speedQA.hp,diagnostics:ProjectVPixiBattle.diagnostics(),overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(evidence.version,'20260930-speed-combo');assert.ok(evidence.combos.some(c=>c.count===3));assert.ok(evidence.combos.some(c=>c.count===2));
  assert.equal(evidence.overflow,false);assert.ok(evidence.diagnostics.mounted);
  for(const combo of evidence.combos)for(const hit of combo.sequence)assert.ok(evidence.hp.some(x=>x.id===combo.targetId&&Math.abs(x.hp-hit.targetHp)<0.00001),'server hit HP reached by actual bundle');
  await page.screenshot({path:path.join(out,`pvp-result-${viewport.width}.png`)});
  await page.locator('#pvpResultConfirm').click();await page.locator('#rankedMatchStart').waitFor();
  if(process.env.SPEED_QA_PVP_ONLY!=='1'){
  await page.evaluate(()=>{renderShell('battle');switchPveMode('hunt');});
  await page.locator('#battleStart:not([disabled])').waitFor();await page.locator('#battleStart').click();
  await page.locator('#pvPixiBattle canvas').waitFor({timeout:45000});
  await page.screenshot({path:path.join(out,`pve-${viewport.width}.png`)});
  await page.locator('#pveResultConfirm').waitFor({timeout:60000});
  await page.screenshot({path:path.join(out,`pve-result-${viewport.width}.png`)});
  }
  results.push({viewport,errors,missing,requests,version:evidence.version,comboCounts:evidence.combos.map(c=>c.count),readout,overflow:evidence.overflow});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  assert.deepEqual(errors,[]);assert.equal(missing.some(x=>/project-v|battle-v3|6496413|superstar/.test(x.url)),false,JSON.stringify(missing));
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));console.log('QA output: '+out);}
