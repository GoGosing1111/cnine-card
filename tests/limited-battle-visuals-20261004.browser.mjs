import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {LIMITED_VISUALS} from '../shared/mercenary-limited-visuals-v1.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'preview/mercenary-limited-sd-skills-20261003-v1/qa/live-20261004');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1,updated_at:'2026-10-04'});
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+['style','card','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1','no-light-beams-v1789'].map(f=>'<link rel="stylesheet" href="/css/'+f+'.css">').join('')+'</head><body><div id="modal"></div>'+['js/project-v-battle-art-adapter-v1.js','js/project-v-tier-battle-art-adapter-v1.js','js/project-v-monster-battle-art-adapter-v1.js','js/project-v-unassigned-battle-fallback-v1.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','js/battle-v3-live.js'].map(f=>'<script src="/'+f+'"></script>').join('')+'</body></html>';
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');if(req.method!=='GET')return res.writeHead(405).end();
 if(u.pathname==='/live-battle-qa'){res.setHeader('content-type','text/html');return res.end(html);}
 if(u.pathname.startsWith('/api/')){res.setHeader('content-type','application/json');return res.end(JSON.stringify(u.pathname==='/api/mercenary-codex'?catalog:{ok:true,enabled:false,items:[],cards:[],loadout:{mercenaryCode:null,revision:0}}));}
 let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const [label,viewport,mode]of [['desktop',{width:1440,height:1000},'PVP'],['mobile',{width:390,height:844},'PVE']]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failures.push(r.status()+' '+r.url());});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(base+'/live-battle-qa');
  await page.evaluate(async()=>{
   const catalogs=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>fetch('/assets/ui/project-v/characters/'+p).then(r=>r.json()))),available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
   const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
   window.qaDeck=ids.map((id,i)=>{const c=available.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});window.cnineCardCatalog=()=>window.qaDeck;
   const api=window.ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(...args)=>(window.qaEngine=await original(...args));
  });
  const stages=[];
  for(const c of LIMITED_VISUALS.characters){
   await page.evaluate(async({c,mode})=>{
    const row={id:'M:A:'+c.code,cardId:c.code,code:c.code,name:c.name,actorKind:'MERCENARY',hp:100,maxHp:100,rank:c.rank,role:'LIMITED',skills:[]};
    const payload={mode,battlefieldMode:mode==='PVP'?'PVP':'HUNT',battleV2:{mode,teams:{A:{cards:window.qaDeck,mercenaries:[row]},B:{cards:window.qaDeck.map(c=>({...c,id:"B:"+c.id})),mercenaries:mode==='PVP'?[{...row,id:'M:B:'+c.code}]:[]}},result:{timeline:[]}}};
    const modal=document.getElementById('modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode});
    await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode});await window.qaEngine.deployCards({instant:true,force:true});await window.qaEngine.setVisible(true);
   },{c,mode});
   await page.waitForTimeout(180);
   const idle=await page.evaluate(()=>window.qaEngine.diagnostics().mercenaryPlayback.limited);
   for(const s of idle){assert.ok(Math.abs(s.bodyHeight-312.3894230769231)<1e-6);assert.deepEqual(s.foot,s.station);assert.equal(s.rearAura,true);if(s.code==='V-996'){assert.equal(s.textureHeight,358);assert.equal(s.originalValterFx.silhouetteCopies,18);assert.equal(s.originalValterFx.filters,6);assert.equal(s.originalValterFx.risingParticles,12);}}
   await page.screenshot({path:path.join(out,label+'-'+c.id+'.png')});
   if(c.id==='joeun'){
    const skill=await page.evaluate(async()=>{const e=window.qaEngine,a=e.mercenaries[0],target=e.enemies[0];const result=e.playMercenaryEvent({type:'MERCENARY_HIT',actorId:a.id,targetId:target.id,damage:11,targetHpAfter:89});await new Promise(r=>setTimeout(r,50));const tail=e.pendingTails.get(a);tail.instance.pause().time(1.4,false);const before=target.hp;tail.instance.progress(1,false);await result;await e.setVisible(false);await e.setVisible(true);return {before,hp:target.hp,applications:e.lastMercenaryPlayback.damageApplications,ambient:e.diagnostics().mercenaryPlayback.limited.every(s=>s.ownedAmbientClock)};});
    assert.equal(skill.before,100);assert.equal(skill.hp,89);assert.equal(skill.applications,1);assert.equal(skill.ambient,true);
   }
   const attack=await page.evaluate(async()=>{
    const e=window.qaEngine,a=e.mercenaries[0],target=e.enemies[0];window.qaApplied=0;
    const result=e.normalAttack(0,{attacker:a,target,damage:23,targetHp:77,onImpact:()=>window.qaApplied++});
    await new Promise(r=>setTimeout(r,50));const tail=e.pendingTails.get(a);if(!tail)throw Error('No registered limited playback');tail.instance.pause().time(1.4,false);
    const before={hp:target.hp,count:window.qaApplied,limited:e.diagnostics().mercenaryPlayback.limited};
    tail.instance.progress(1,false);const ok=await result;return {before,ok,hp:target.hp,count:window.qaApplied};
   });
   assert.equal(attack.before.count,0);assert.equal(attack.count,1);assert.equal(attack.hp,77);assert.equal(attack.ok,true);
   const stopped=await page.evaluate(async()=>{const e=window.qaEngine,a=e.mercenaries[0],target=e.enemies[0];let count=0;const result=e.normalAttack(0,{attacker:a,target,damage:20,targetHp:57,onImpact:()=>count++});await new Promise(r=>setTimeout(r,40));e.cancelTimelines();await result;return {hp:target.hp,count,timelines:e.simpleTimelines.size};});
   assert.equal(stopped.count,0);assert.equal(stopped.hp,77);assert.equal(stopped.timelines,0);
   stages.push({code:c.code,idle,attack,stopped});console.log(label+' '+c.code+' passed');
  }
  await page.evaluate(()=>window.ProjectVPixiBattle.destroy());
  await page.goto(base+'/mercenary-codex/?view=limited');await page.locator('.roster-row').first().waitFor();assert.equal(await page.locator('.roster-row').count(),catalog.cards.filter(c=>c.edition==='LIMITED').length);
  for(const c of LIMITED_VISUALS.characters){await page.locator('[data-code="'+c.code+'"]').click();assert.equal(await page.locator('#sdTab').isDisabled(),false);await page.locator('#sdTab').click();await page.locator('.sd-display img').evaluate(img=>img.decode());}
  await page.screenshot({path:path.join(out,label+'-codex.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);reports.push({label,mode,stages,errors,failures});await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify({status:'PASSED',out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
