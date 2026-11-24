import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {jointFixture} from '../../../tests/helpers/joint-db.mjs';
import {operatingTowerFixture} from '../../../tests/helpers/tower-live-route.mjs';
import {fixture,reviewSnapshot} from '../../../tests/helpers/tower-expansion-20261102.mjs';
import {DUAL_REVIEW_CARDS} from '../../../functions/_companion_preparation.js';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../../../shared/mercenary-unique-equipment-v1.mjs';
import {buildMercenaryEquipmentRuntime} from '../../../functions/_mercenary_equipment_v2.js';
import {towerMonsterArt} from '../../../shared/tower-monsters-20261022.mjs';
import {ensureTowerWeek} from '../../../functions/_tower_weekly.js';
import plan from './floor-plan.json' with {type:'json'};
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const root=path.resolve(import.meta.dirname,'../../..'),out=path.resolve(process.env.TOWER_ART_QA_OUT||path.join(import.meta.dirname,'browser'));
await mkdir(out,{recursive:true});
const profiles=new Map(),reports=[];
async function makeProfile(floor){
  const f=await jointFixture(),party=reviewSnapshot(),base=f.deps.raidDeckPower;
  f.setPower(900e9);
  const gear=UNIQUE_MERCENARY_EQUIPMENT.find(g=>g.tier===3&&g.slot==='WEAPON');
  party.mercenaries[1].equipment=buildMercenaryEquipmentRuntime([{instance_id:42,equipment_id:42,code:gear.code,name:gear.name,slot:gear.slot,rarity:gear.rarity,total_power:gear.totalPower,pve_power:gear.pvePower,pvp_power:gear.pvpPower}],7,'PVE',1);
  f.deps.raidDeckPower=async(...args)=>{const d=await base(...args);return {...d,cards:d.cards.map((c,i)=>({...c,image:DUAL_REVIEW_CARDS[i].image})),mercenaries:party.mercenaries};};
  const tower=await operatingTowerFixture(f,{floorNo:floor,maxFloor:149});
  f.setClock(Date.now());await ensureTowerWeek(f.env,f.deps.now());await tower.setFloor(floor);
  const floors=[{floor:150,monsterId:18,power:9e9,coin:8788e9,boss:1},...plan.floors];
  for(const id of new Set(floors.map(r=>r.monsterId))){
    const m=fixture.monsters.find(row=>Number(row.id)===id);
    await f.p('INSERT INTO battle_monsters(id,name,image_url,battle_power,is_boss) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',id,m.name,m.image_url,Number(m.battle_power),Number(m.is_boss)).run();
  }
  for(const r of floors)await f.p('INSERT INTO tower_floor_ranges(id,season_id,start_floor,end_floor,reward_coin,monster_id,power_override,is_boss,is_active) VALUES(?,1,?,?,?,?,?,?,1)',5000+r.floor,r.floor,r.floor,r.coin,r.monsterId,r.power,r.boss).run();
  return {f,tower,cards:(await f.deps.raidDeckPower(f.env,7,null,'TOWER')).cards};
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://local'),match=/^\/qa-api\/(\d+-([0-9]+))\/(.+)$/.exec(url.pathname);
  if(match){
    if(!profiles.has(match[1]))profiles.set(match[1],makeProfile(Number(match[2])));
    const {f,tower,cards}=await profiles.get(match[1]);f.setClock(Date.now());
    res.setHeader('content-type','application/json');if(match[3]==='fixture')return res.end(JSON.stringify({cards}));
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const reply=await tower.handle(match[3],new Request('https://game.example/api/'+match[3],{method:req.method,headers:{authorization:'Bearer local-account-7','content-type':'application/json',origin:'https://game.example'},...(chunks.length?{body:Buffer.concat(chunks)}:{})}));
    res.statusCode=reply.status;return res.end(await reply.text());
  }
  if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(!await stat(file).catch(()=>null))return res.writeHead(404).end();
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
  res.end(await readFile(file));
}catch(e){console.error('QA HTTP',e.message);res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const width of [1440,390])for(const floor of [160,180,200]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:960},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
  await context.addInitScript(()=>performance.setResourceTimingBufferSize(6000));
  const page=await context.newPage();page.setDefaultTimeout(45000);
  const errors=[],loaded=new Set();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.ok())loaded.add(new URL(r.url()).pathname);});
  await page.goto(origin+'/docs/qa/tower-clock-auto-next-20261022/index.html?pve=tower&profile='+width+'-'+floor);
  const guardian=towerMonsterArt(1,floor,true),normal=towerMonsterArt(1,floor);
  await page.locator('[data-abyss-action="fight"]').waitFor();
  assert.match(await page.locator('.abyss-focus').innerText(),new RegExp(guardian.name));
  await page.waitForFunction(src=>Array.from(document.images).some(i=>i.complete&&i.naturalWidth===640&&new URL(i.src).pathname===src),guardian.image);
  const entry=width+'-'+floor+'-entry.webp',battle=width+'-'+floor+'-battle.webp';
  const capture=async(name)=>{const png=await page.screenshot();const {default:sharp}=await import('sharp');await sharp(png).webp({quality:83}).toFile(path.join(out,name));};
  await capture(entry);
  const start=page.waitForResponse(r=>r.url().endsWith('/tower/start')&&r.request().method()==='POST');
  await page.locator('[data-abyss-action="fight"]').click();const reply=await start,payload=await reply.json();
  assert.equal(reply.status(),200,payload.error);
  assert.equal(payload.continuousEncounter.instances[0].battleSprite,normal.image);
  assert.equal(payload.continuousEncounter.instances.at(-1).battleSprite,guardian.image);
  await page.locator('[data-continuous-pause]:enabled').waitFor();
  if(!loaded.has(normal.image))await page.waitForResponse(r=>new URL(r.url()).pathname===normal.image,{timeout:10000}).catch(async e=>{
    console.error('Battle art',Array.from(loaded).filter(p=>/monster|hunt-tower|sprite/i.test(p)).slice(-35));
    await capture(battle);throw e;
  });
  await page.locator('[data-continuous-pause]').click();
  assert.equal(await page.locator('#modal canvas').count(),1);
  assert(loaded.has(normal.image)&&loaded.has(guardian.image));assert.deepEqual(errors,[]);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  await capture(battle);
  reports.push({width,floor,regular:normal.name,guardian:guardian.name,actors:payload.continuousEncounter.total,canvas:1,overflow,entry,battle});
  console.log(width,floor,guardian.name);await context.close();
 }
 await writeFile(path.join(out,'verification.json'),JSON.stringify({environment:'local Chrome headless',reports},null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const job of profiles.values())(await job).f.close();}
