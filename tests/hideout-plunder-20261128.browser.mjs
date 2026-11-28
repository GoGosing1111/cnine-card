import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile, mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {prepareRaidWallet} from './helpers/hideout-raid-rewards.mjs';
import {jointFixture} from './helpers/joint-db.mjs';
import {emptyHideout, HIDEOUT_KEY} from '../shared/personal-hideout-v1.mjs';
import {handlePersonalHideout, readHideout} from '../functions/_personal_hideout.js';
import {handleHideoutPlunder} from '../functions/_hideout_plunder.js';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fur from '../assets/ui/project-v/characters/fur/manifest-v1.json' with {type:'json'};

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(import.meta.dirname,'..'), origin='http://localhost', day='2026-11-28';
const opening=Date.parse(day+'T20:30:00+09:00');
const cards=fur.characters.slice(0,5).map((c,i)=>({id:c.cardId,title:c.title,name:c.member,rarity:'FUR',grade:'FUR',
  base_power:100000,power:100000,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],image:c.sourceArt,sourceArt:c.sourceArt}));
const ids=cards.map(c=>c.id),user={id:7,serverUserId:7,nickname:'검수 계정 7',role:'USER',coin:1000000,
  pigCoin:0,masterStars:0,owned:ids,quantities:Object.fromEntries(ids.map(id=>[id,1])),attendance:{totalDays:0},history:[],breakthroughs:{},testCoinGrantedV13:true,collectionRepairR6:true};
const shells={'me':{user},'me/summary':{user},cards:{cards},'service/status':{maintenance:{active:false}},
  'loot-shop/balance':{pigCoins:0},'shell/summary':{inventory:{},messages:{unread:0}},packs:{packs:[]},messages:{messages:[],unread:0},'live-operations':{items:[]}};
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json',
  '.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const cache=new Map(),git=promisify(execFile);
async function staticFile(file){
  if(!cache.has(file))cache.set(file,readFile(path.join(root,file)).catch(async()=>{
    const blob=await git('git',['cat-file','blob','HEAD:'+file],{cwd:root,encoding:'buffer',maxBuffer:40e6,windowsHide:true});return blob.stdout;
  }).catch(()=>null));
  return cache.get(file);
}

for(const width of [1440,390])test('lobby to raid, recorded battle, recovered loot and repair at '+width+'px',{timeout:145000},async t=>{
  const db=await jointFixture(t,{});db.env.PERSONAL_HIDEOUT_ENABLED='1';
  db.env.HIDEOUT_PLUNDER_ENABLED='1';await prepareRaidWallet(db);
  let now=opening,dropReply=true;const attacks=[],consoleErrors=[];
  const deps={...db.deps,now:()=>now,pvpDeckSnapshot:async(_env,id)=>cards.map(c=>({...c,base_power:id===7?2000000:100000})),battleSettings:async()=>({}),cardBattlePower:c=>c.base_power,
    loadPetBattleSnapshot:async()=>null,releasedMercenarySnapshot:async()=>null,createPvpBattleV2};
  for(const id of [7,8]){
    const home=emptyHideout();home.level=id===7?1:2;home.rooms=['main'];home.durability=id===7?60:100;
    Object.assign(home.parts,{STEEL:40,WIRE:20});
    home.placements=[{kind:'decor',id:'sofa',code:'sofa',room:'main',x:520,y:310,flipped:false}];
    if(id===8)home.placements.push({kind:'decor',id:'gun',code:'autocannon',room:'main',x:740,y:270,flipped:false},
      {kind:'decor',id:'turret',code:'turret',room:'main',x:285,y:670,flipped:width>800});
    await db.setting(HIDEOUT_KEY(id),home);
  }
  const opponent=await handleHideoutPlunder({path:'hideout/raid/join',env:db.env,deps,request:new Request(origin+'/api/hideout/raid/join',
    {method:'POST',headers:{origin,authorization:'Bearer local-account-8','content-type':'application/json'},body:JSON.stringify({day,requestId:crypto.randomUUID()})})});
  assert.equal(opponent.status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width,height:width>800?960:844},isMobile:width<800,hasTouch:width<800,serviceWorkers:'block'});
  page.setDefaultTimeout(22000);
  page.on('pageerror',e=>consoleErrors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.addInitScript(user=>{
    localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-account-7');
    localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
  },user);
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
    if(url.pathname.startsWith('/api/')){
      const endpoint=url.pathname.slice(5);
      if(!endpoint.startsWith('hideout'))return route.fulfill({json:shells[endpoint]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}}});
      const request=new Request(url,{method:req.method(),headers:{...req.headers(),origin},...(req.postData()?{body:req.postData()}:{})});
      const response=await (endpoint.startsWith('hideout/raid')?handleHideoutPlunder:handlePersonalHideout)({path:endpoint,env:db.env,deps,request});
      const data=await response.json();
      if(endpoint==='hideout/raid/attack'&&response.ok){
        attacks.push({id:JSON.parse(req.postData()).requestId,data});
        if(dropReply){dropReply=false;return route.fulfill({status:503,json:{error:'검수 응답 유실'}});}
      }
      return route.fulfill({status:response.status,json:data});
    }
    const file=decodeURIComponent(url.pathname.slice(1))||'index.html',body=await staticFile(file);
    return body?route.fulfill({body,contentType:mime[path.extname(file)]||'application/octet-stream'}):route.fulfill({status:404,body:''});
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.addLocatorHandler(page.locator('.soop-consent-dialog[open]'),()=>page.locator('[data-soop-close]').first().click());
  const lobby=page.locator('soop-adventure-lobby'),entry=page.locator('[data-ph-action="raid"]');
  await lobby.locator('.hideout-shortcut').click();
  await page.locator('[data-tab="defense"]').click();
  const turretCard=page.locator('.ph-defense-card').filter({has:page.getByRole('heading',{name:'포탑',exact:true})});
  await turretCard.getByText('강화 구조재',{exact:true}).waitFor();
  assert.match(await turretCard.locator('li').filter({hasText:'동력 코어'}).innerText(),/0 \/ 2/);
  assert(await turretCard.getByRole('button',{name:'포탑 설치 · 재료 부족'}).isDisabled());
  await page.locator('.ph-defense-sources summary').click();
  assert.match(await page.locator('.ph-defense-sources dl').innerText(),/1\.75%/);
  await entry.click();
  const dialog=page.locator('.ph-raid-dialog[open]'),button=name=>dialog.locator('[data-raid="'+name+'"]');
  await button('rules').click();await dialog.getByText('진영 배정',{exact:true}).waitFor();
  await button('rules').click();
  await button('join').click();await button('cancel-join').click();
  await button('join').click();await button('confirm-join').click();
  const attack=button('attack');await attack.waitFor();
  await dialog.getByLabel('청팀 1명 0점').waitFor();await dialog.getByLabel('홍팀 1명 0점').waitFor();
  assert.equal(await dialog.locator('[data-scout-piece]').count(),3);
  assert.equal(await dialog.locator('[data-scout-piece="turret"] > span').evaluate(el=>el.style.transform),width>800?'scaleX(-1)':'scaleX(1)');
  await button('select').click();assert.equal(attacks.length,0);
  assert.match(await dialog.innerText(),/일반 아파트/);
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  const out=process.env.HIDEOUT_PLUNDER_QA_OUTPUT;
  if(out){await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'raid-'+width+'.png')});}
  await attack.click();await button('retry').waitFor();
  await button('close').click();await entry.click();
  await page.evaluate(finalHp=>{
    window.turretVolley=[];window.turretHealthFrames=[];
    const sample=()=>{
      const field=window.ProjectVPixiBattle?.diagnostics?.()?.battlefield,shot=field?.hideoutLastShot,turret=field?.hideoutTurret;
      if(turret?.axis&&turret.hp!==window.turretHealthFrames.at(-1)?.hp)window.turretHealthFrames.push(turret);
      if(shot?.facility==='turret'&&shot.axis&&shot.fired===window.turretVolley.length+1)window.turretVolley.push(shot);
      if(window.turretHealthFrames.at(-1)?.hp!==finalHp||window.turretVolley.length<3)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  },attacks[0].data.turretHp.hp);
  await button('retry').click();
  await page.waitForFunction(()=>{const d=window.ProjectVPixiBattle?.diagnostics?.();return d?.battlefield?.hideoutFurniture===3 && d.battlefield.hideoutLastShot?.facility==='turret' &&
    d.battlefield.asset.endsWith('battle-apartment.webp') && document.querySelector('.ph-raid-dialog .is-v3-ready canvas');},null,{timeout:45000});
  await page.waitForFunction(()=>window.turretVolley.length===3,null,{timeout:25000});
  const volley=await page.evaluate(()=>window.turretVolley);
  const hits=attacks[0].data.battleV2.result.timeline.find(e=>e.type==='HIDEOUT_DEFENSE_FIRE'&&e.facility==='turret').hits;
  assert.deepEqual(volley.map(s=>s.targetId),hits.map(h=>h.targetId));
  for(const shot of volley){
    assert.deepEqual(shot.foot,volley[0].foot);assert.equal(shot.flipped,width>800);
    const angle=p=>Math.atan2(p.y-shot.axis.y,p.x-shot.axis.x),delta=angle(shot.muzzle)-angle(shot.impact);
    assert(Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))<Math.PI/30,'muzzle faces the recorded target');
  }
  if(out)await page.screenshot({path:path.join(out,'battle-'+width+'.png')});
  const state=attacks[0].data.battleV2.result,healthHits=state.timeline.filter(e=>e.type==='HIDEOUT_TURRET_HIT');
  await page.waitForFunction(hp=>window.turretHealthFrames.at(-1)?.hp===hp,state.hideoutTurret.hp,{timeout:75000});
  const states=await page.evaluate(()=>window.turretHealthFrames);
  assert.deepEqual(states.map(s=>s.hp),[state.hideoutTurret.maxHp,...healthHits.map(e=>e.targetHpAfter)]);
  assert(states.every(s=>s.roll===0&&Number.isInteger(s.pose)));
  assert.equal(states[0].hud,'포탑 100%');
  for(const s of states){
    assert.equal(s.headVisible,s.hp>0);
    assert.equal(s.hud,s.hp?'포탑 '+Math.max(1,Math.round(100*s.hp/s.maxHp))+'%':'포탑 파괴');
  }
  if(width!==1440)await dialog.locator('.ph-raid-battle-close').click();
  await page.waitForFunction(()=>!document.querySelector('.ph-raid-battle-close'),null,{timeout:105000});
  await dialog.locator('.ph-raid-result').waitFor();await button('replay').waitFor();
  const final=state.hideoutTurret;
  const finalText=final.hp?final.hp.toLocaleString('ko-KR')+' / '+final.maxHp.toLocaleString('ko-KR'):'0 · 파괴';
  await dialog.getByText(finalText,{exact:true}).waitFor();
  assert.equal(await button('attack').count(),0);
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  assert.match(await dialog.locator('.ph-raid-victory').innerText(),/스틸 인라인 엔진[\s\S]*스틸 래더 프레임[\s\S]*피그코인/);
  assert.equal(attacks.length,2);assert.equal(attacks[0].id,attacks[1].id);assert.equal(attacks[1].data.replayed,true);
  const result=attacks[0].data,def=(await readHideout(db.env,8)).state;
  assert.equal(result.after,def.durability);assert.equal(def.parts.STEEL,40-(result.loot.STEEL||0));
  await button('back').click();await attack.waitFor();
  await dialog.locator('.ph-raid-history summary').click();await button('history').first().click();
  await dialog.locator('.ph-raid-result').waitFor();await button('replay').click();
  await page.waitForFunction(()=>{const s=window.ProjectVPixiBattle?.diagnostics?.()?.battlefield?.hideoutTurret;return s?.headVisible&&s.hp===s.maxHp;},null,{timeout:25000});
  await dialog.locator('.ph-raid-battle-close').click();assert.equal(attacks.length,2);
  await button('close').click();now=opening+90*60000;await entry.click();
  await button('repair').click();
  await page.getByText('내구도 80 / 100',{exact:true}).waitFor();
  assert.equal((await readHideout(db.env,7)).state.parts.WIRE,19+(result.loot.WIRE||0));
  delete db.env.HIDEOUT_PLUNDER_ENABLED;
  await button('close').click();
  await entry.waitFor({state:'detached'});
  await page.locator('[data-ph-action="edit"]').waitFor();
  assert.deepEqual(consoleErrors.filter(e=>/hideout|plunder|DefenderFurniture/i.test(e)),[]);
});
