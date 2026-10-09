import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {ssLimitedSnapshot,sssReferences} from '../scripts/measure-ss-limited-balance-20261008.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/ss-limited-tempo-20261009');
fs.mkdirSync(out,{recursive:true});
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61});
const available=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const cards=ids.map((id,i)=>{const c=available.find(c=>c.cardId===id);return {...c,id,name:c.member,image:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+['style','card','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1','no-light-beams-v1789'].map(f=>'<link rel="stylesheet" href="/css/'+f+'.css">').join('')+'</head><body><div id="modal"></div>'+['js/project-v-battle-art-adapter-v1.js','js/project-v-tier-battle-art-adapter-v1.js','js/project-v-monster-battle-art-adapter-v1.js','js/project-v-unassigned-battle-fallback-v1.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','js/battle-v3-live.js'].map(f=>'<script src="/'+f+'"></script>').join('')+'</body></html>';
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET')return res.writeHead(405).end();
 if(url.pathname==='/ss-limited-tempo-qa'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
 if(url.pathname==='/qa-battle'){
  const mode=url.searchParams.get('mode'),mercenary=ssLimitedSnapshot(url.searchParams.get('code'));
  const battle=mode==='PVE'?createPveBattleV2({cards,mercenary,monster:{id:1,name:'전투 검수',battle_power:6e8},seed:7919}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:sssReferences.find(c=>c.code==='V-049'),seed:7919});
  return json(res,{cards,payload:{mode,battlefieldMode:mode==='PVP'?'PVP':'HUNT',battleV2:battle}});
 }
 if(url.pathname.startsWith('/api/'))return json(res,url.pathname==='/api/mercenary-codex'?catalog:{ok:true,enabled:false,items:[],cards:[],loadout:{mercenaryCode:null,revision:0}});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(base+'/mercenary-codex/?view=limited#V-990');await page.locator('.limited-combat-note').waitFor();
  assert.match(await page.locator('.limited-combat-note').innerText(),/16회.*17회/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.limited-combat-note').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-codex.png')});
  for(const code of ['V-996','V-999']){await page.locator('[data-code="'+code+'"]').click();assert.equal(await page.locator('.limited-combat-note').count(),0);}
  const battles=[];
  for(const mode of ['PVE','PVP']){
   const code=mode==='PVE'?'V-990':'V-997';await page.goto(base+'/ss-limited-tempo-qa');
   const mounted=await page.evaluate(async({mode,code})=>{
    const data=await fetch('/qa-battle?mode='+mode+'&code='+code).then(r=>r.json());window.cnineCardCatalog=()=>data.cards;
    const api=window.ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(...args)=>(window.qaEngine=await original(...args));
    const modal=document.getElementById('modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode});
    await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode});await window.qaEngine.deployCards({instant:true,force:true});await window.qaEngine.setVisible(true);
    window.qaEvent=data.payload.battleV2.result.timeline.find(e=>e.type==='MERCENARY_HIT'&&e.actorId?.endsWith(code));
    if(!window.qaEvent)throw Error('No server skill hit');
    return {speed:data.payload.battleV2.teams.A.mercenaries[0].stats.speed,policyVersion:data.payload.battleV2.teams.A.mercenaries[0].ssLimitedPolicyVersion,sequence:window.qaEvent.seq};
   },{mode,code});
   assert.equal(mounted.policyVersion,2);
   await page.screenshot({path:path.join(out,label+'-'+mode.toLowerCase()+'.png')});
   const playback=await page.evaluate(async()=>{
    const engine=window.qaEngine,event=window.qaEvent,hpCalls=[];let damageCalls=0;
    const sync=engine.syncTargetHp;engine.syncTargetHp=function(target,hp){const result=sync.call(this,target,hp);hpCalls.push({id:target.id,input:hp,hp:target.hp});return result;};
    const show=engine.showAccountBattleUnitDamage;engine.showAccountBattleUnitDamage=function(...args){damageCalls++;return show.apply(this,args);};
    engine.skillChipPlayback?.remember(event);await engine.playMercenaryEvent(event);engine.syncTargetHp=sync;engine.showAccountBattleUnitDamage=show;
    return {damageCalls,hpCalls,expectedHp:event.targetHpAfter,expectedHpPercent:event.targetHpAfter/event.targetMaxHp*100,last:engine.lastMercenaryPlayback};
   });
   assert.equal(playback.damageCalls,1);assert.ok(playback.hpCalls.some(c=>Math.abs(c.input-playback.expectedHpPercent)<1e-9&&Math.abs(c.hp-playback.expectedHpPercent)<1e-9),JSON.stringify(playback));
   battles.push({mode,code,mounted,playback});await page.evaluate(()=>window.ProjectVPixiBattle.destroy());
  }
  assert.deepEqual(errors,[]);reports.push({label,viewport,codex:'PASS',battles,errors});await page.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({source:'canonical server battle + shipped V3 bundle and live wrapper',reports},null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',viewports:2,battles:4,out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
