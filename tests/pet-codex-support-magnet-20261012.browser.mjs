// Real local support/pet endpoints; no production accounts or writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {supportFixture} from './helpers/server-support-fixture.mjs';
import {handlePetEquipment} from '../functions/_pet_equipment.js';
import {loadPetBattleSnapshot} from '../functions/_pet_account.js';
import {emptySupport,SUPPORT_DURATION_MS} from '../shared/server-support-v1.mjs';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.QA_OUTPUT_DIR;
assert(out&&!path.resolve(out).startsWith(path.resolve(root)));await mkdir(out,{recursive:true});
const f=await supportFixture(),errors=[],reports=[],posts=[];
await f.exec(`CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER);
CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,'PET_POTENTIAL_POTION',7,7);`);
const write=(key,value)=>f.run('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
const record=async key=>JSON.parse((await f.one('SELECT value FROM app_meta WHERE key=?',key))?.value||'null');
const supportRecord=()=>record('server_support_v1:2');
const user={id:2,serverUserId:2,nickname:'펫 도감 검수',role:'USER',coin:1234,owned:[],quantities:{}};
let loseResponse=false;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):undefined,key=url.pathname.slice(5);
    if(key.startsWith('server-support/')){
      if(key==='server-support/pet')posts.push(body);
      const result=await f.call(key,{user:2,body,method:req.method});
      if(key==='server-support/pet'&&loseResponse&&result.status===200){loseResponse=false;res.writeHead(200,{'content-type':'application/json'});return res.end();}
      return json(res,result.body,result.status);
    }
    if(key.startsWith('pets/v1/')){
      const request=new Request('https://support.test/api/'+key,{method:req.method,headers:{authorization:'Bearer qa-2',origin:'https://support.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      const result=await handlePetEquipment({path:key,request,env:f.env,deps:f.deps});
      if(!result)throw Error('Unexpected pet route '+key);return json(res,await result.json(),result.status);
    }
    return json(res,{'me':{user},'me/summary':{user},'shell/summary':{user,inventory:{},messages:{unread:0}},'service/status':{maintenance:{active:false}}}[key]||{visible:false,enabled:false,items:[],messages:[],unread:0});
  }
  let route=decodeURIComponent(url.pathname);if(route.endsWith('/'))route+='index.html';const file=path.resolve(root,'.'+route);
  if(!file.startsWith(path.resolve(root)+path.sep))throw Error('outside root');
  const mime={'.html':'text/html;charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));
}catch(error){res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const shot=async(page,name)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
try{
  for(const [name,viewport]of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
    const initial={...emptySupport(),revision:1,startsAt:f.clock.now,endsAt:f.clock.now+SUPPORT_DURATION_MS};
    await write('server_support_v1:2',initial);
    await write('pet_potentials_v1:2',{revision:0,pets:{}});
    await write('pet_loadout_v1:2',{revision:1,petCode:f.pets[0].code,audit:[]});
    const context=await browser.newContext({viewport,hasTouch:name==='mobile'});
    await context.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','qa-2');localStorage.setItem('cnine_battle_sound','OFF');},user);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/pet-codex/');
    const button=page.locator('[data-pet-support-magnet]'),select=code=>page.locator(`[data-pet-select="${code}"]`).click();
    await button.waitFor();await page.waitForFunction(()=>!document.querySelector('[data-pet-support-magnet]').disabled);
    assert(await button.isEnabled());
    await button.click();await page.waitForFunction(()=>document.querySelector('[data-pet-support-magnet]')?.textContent==='이 펫에 적용 중');
    assert.equal((await supportRecord()).magnetPetCode,f.pets[0].code);assert.equal((await supportRecord()).revision,2);
    assert.equal((await loadPetBattleSnapshot(f.env,2)).magnet,true);
    await shot(page,name+'-applied');
    await select(f.pets[1].code);assert(await button.isEnabled());loseResponse=true;
    await button.click();await page.waitForFunction(()=>document.querySelector('[data-pet-support-magnet]')?.textContent==='자석 적용 결과 재확인');
    const lost=posts.at(-1);assert.equal((await supportRecord()).revision,3);
    await page.reload();await button.waitFor();await page.waitForFunction(()=>document.querySelector('[data-pet-support-magnet]')?.textContent==='자석 적용 결과 재확인');
    await button.click();await page.waitForFunction(()=>document.querySelector('[data-pet-support-magnet]')?.textContent==='이 펫에 적용 중');
    assert.deepEqual(posts.at(-1),lost);assert.equal((await supportRecord()).revision,3);
    assert.equal((await supportRecord()).endsAt,initial.endsAt);
    assert.equal((await loadPetBattleSnapshot(f.env,2)).magnet,false,'old pet loses temporary magnet');
    await page.locator('[data-pet-equip]').click();await page.waitForFunction(()=>document.querySelector('[data-pet-equip]')?.textContent.includes('장착 중'));
    assert.equal((await loadPetBattleSnapshot(f.env,2)).magnet,true,'new equipped pet has magnet');
    assert.equal((await f.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='PET_POTENTIAL_POTION'")).quantity,7);
    assert.deepEqual((await record('pet_potentials_v1:2')).pets,{});
    await select(f.pets[2].code);assert(await button.isDisabled());assert.match(await button.textContent(),/보유한 펫/);
    await select(f.pets[1].code);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal clipping');
    await shot(page,name+'-transferred');
    // The actual standalone navigation keeps season pass, hides support entry/back link.
    await page.waitForFunction(()=>document.querySelector('soop-adventure-lobby')?.supportNavigation);
    await page.evaluate(()=>document.querySelector('soop-adventure-lobby').controls.openMenu('all'));
    await page.waitForFunction(()=>document.querySelector('soop-adventure-lobby').seasonPassVisible===true);
    assert.equal(await page.locator('.ss-menu-link').count(),0);
    await page.evaluate(()=>document.querySelector('soop-adventure-lobby').supportNavigation.openSeasonPass());
    await page.locator('.sp-calendar').waitFor();assert.equal(await page.locator('[data-ss-back]').count(),0);
    assert.equal(await page.locator('[data-ss-support]').count(),0);
    await page.locator('.ss-close[data-ss-close]').click();
    await page.evaluate(()=>document.querySelector('soop-adventure-lobby').shadowRoot.getElementById('menu-dialog').close());
    // Preserve permanent potential and block inactive membership using real API state.
    await write('pet_potentials_v1:2',{revision:1,pets:{[f.pets[0].code]:{potential:'MAGNET',attempts:1}}});
    await page.reload();await button.waitFor();await select(f.pets[0].code);assert(await button.isDisabled());assert.match(await button.textContent(),/영구 자석/);
    await write('pet_potentials_v1:2',{revision:0,pets:{}});await page.reload();await button.waitFor();await select(f.pets[0].code);
    const before=await supportRecord();await write('server_support_v1:2',{...before,revision:before.revision+1,revokedAt:f.clock.now});
    await button.click();await page.waitForFunction(()=>document.querySelector('[data-pet-status]')?.textContent.includes('종료'));
    assert.equal(await button.count(),0);assert.equal((await supportRecord()).magnetPetCode,before.magnetPetCode);
    await page.reload();await page.waitForFunction(()=>document.querySelector('.pet-equipment')?.getAttribute('aria-busy')==='false');assert.equal(await button.count(),0);
    reports.push({viewport:name,passed:['apply','transfer','no potion cost','same receipt after reload','permanent potential preserved','unowned blocked','expired/revoked blocked','hidden support entry','season pass accessible','no clipping']});
    await context.close();console.log(name+' pet codex/support QA passed');
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(out,'report.json'),JSON.stringify({reports,errors},null,2));
}catch(error){console.error('Browser errors:',errors);for(const page of browser.contexts().flatMap(c=>c.pages()))await shot(page,'failure');throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();}
