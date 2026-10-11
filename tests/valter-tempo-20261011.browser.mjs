import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/valter-tempo-20261011');fs.mkdirSync(out,{recursive:true});
const available=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const cards=ids.map((id,i)=>{const c=available.find(c=>c.cardId===id);return {...c,id,name:c.member,image:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const mercenary={...limitedDeploymentSnapshot('V-996'),combat:fixture.combat};
const battles={PVE:createPveBattleV2({cards,mercenary,monster:{id:1,name:'행동 주기 검수',battle_power:6e10},seed:7919}),PVP:createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,seed:7919})};
const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+['style','card','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1','no-light-beams-v1789'].map(f=>'<link rel="stylesheet" href="/css/'+f+'.css">').join('')+'</head><body><div id="modal"></div>'+['js/project-v-battle-art-adapter-v1.js','js/project-v-tier-battle-art-adapter-v1.js','js/project-v-monster-battle-art-adapter-v1.js','js/project-v-unassigned-battle-fallback-v1.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','js/battle-v3-live.js'].map(f=>'<script src="/'+f+'"></script>').join('')+'</body></html>';
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET')return res.writeHead(405).end();
 if(url.pathname==='/qa'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
 if(url.pathname==='/qa-battle'){const mode=url.searchParams.get('mode');return json(res,{cards,payload:{mode,battlefieldMode:mode==='PVP'?'PVP':'HUNT',battleV2:battles[mode]}});}
 if(url.pathname.startsWith('/api/'))return json(res,{ok:true,enabled:false,items:[],cards:[]});
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  for(const mode of ['PVE','PVP']){
   await page.goto(base+'/qa');
   const mounted=await page.evaluate(async mode=>{
    const data=await fetch('/qa-battle?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.cards;
    const api=window.ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(...args)=>(window.qaEngine=await original(...args));
    const modal=document.getElementById('modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode});
    await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode});await window.qaEngine.deployCards({instant:true,force:true});await window.qaEngine.setVisible(true);
    const m=data.payload.battleV2.teams.A.mercenaries[0];
    window.qaEvents=data.payload.battleV2.result.timeline.filter(e=>e.actorId===m.id&&['TURN','MERCENARY_VALTER_AREA'].includes(e.type)).slice(0,3);
    if(window.qaEvents.length!==3)throw Error('Expected three canonical Valter attacks: '+JSON.stringify(data.payload.battleV2.result.timeline.map(e=>e.type)));
    return {speed:m.stats.speed,policyVersion:m.valterPolicyVersion,events:window.qaEvents.map(e=>({type:e.type,seq:e.seq,actorId:e.actorId}))};
   },mode);
   assert.equal(mounted.policyVersion,2);const played=await page.evaluate(async()=>{
    const engine=window.qaEngine,calls=[],sync=engine.syncTargetHp;
    engine.syncTargetHp=function(target,hp){const result=sync.call(this,target,hp);calls.push({id:target.id,hp,input:hp});return result;};
    await engine.playEvents(window.qaEvents,{timedInternal:true});engine.syncTargetHp=sync;
    const actor=engine.mercenaries.find(a=>a.cardId==='V-996'),state=engine.limitedStates.get(actor);
    const until=performance.now()+8000;while(state?.busy&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,20));
    return {calls,busy:!!state?.busy,ambient:!!state?.ambient,atStation:Math.abs(actor.root.x-actor.baseX)<1&&Math.abs(actor.root.y-actor.baseY)<1,last:engine.lastMercenaryPlayback,overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert.ok(played.calls.length>=3);assert.equal(played.busy,false);assert.equal(played.ambient,true);assert.equal(played.atStation,true);assert.equal(played.overflow,false);assert.equal(played.last.playbackRate,2.5);
   await page.screenshot({path:path.join(out,label+'-'+mode.toLowerCase()+'.png')});reports.push({label,mode,mounted,played});await page.evaluate(()=>window.ProjectVPixiBattle.destroy());
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({source:'canonical server PVE/PVP battle + shipped V3 bundle and main live wrapper',reports,pageErrors:[]},null,2)+'\n');console.log(JSON.stringify({status:'PASS',viewports:2,battles:4,out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
