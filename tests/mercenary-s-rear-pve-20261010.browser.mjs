import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {fixture,scenarios,snapshot} from '../scripts/measure-s-rear-pve-20261010.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/s-rear-pve-20261010');
fs.mkdirSync(out,{recursive:true});
const raw=structuredClone(MERCENARY_CMS_SEED.document);
for(const m of fixture.targets)Object.assign(raw.mercenaries.find(r=>r.code===m.code),{rank:m.rank,position:m.position,role:m.role});
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(raw),revision:61});
const available=['fur/manifest-v2.json','zenith/manifest-v1.json'].flatMap(p=>JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p))).characters);
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+['style','card','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1','no-light-beams-v1789'].map(f=>'<link rel="stylesheet" href="/css/'+f+'.css">').join('')+'</head><body><div id="modal"></div>'+['js/project-v-battle-art-adapter-v1.js','js/project-v-tier-battle-art-adapter-v1.js','js/project-v-monster-battle-art-adapter-v1.js','js/project-v-unassigned-battle-fallback-v1.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','js/battle-v3-live.js'].map(f=>'<script src="/'+f+'"></script>').join('')+'</body></html>';
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET')return res.writeHead(405).end();
 if(url.pathname==='/s-rear-qa'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
 if(url.pathname==='/qa-battle'){
  const mode=url.searchParams.get('mode'),loadout=snapshot({code:'V-008',equipment:1000000,suit:7000000});
  const cards=loadout.cards.map((c,i)=>({...c,id:ids[i],name:available.find(a=>a.cardId===ids[i])?.member,image:'/'+available.find(a=>a.cardId===ids[i])?.sourceArt}));
  const monster=scenarios.find(s=>s.mode==='APOCALYPSE'&&s.id==='75').monster;
  const battle=mode==='PVE'?createPveBattleV2({cards,mercenary:loadout.mercenary,monster,characterBonus:1000000,seed:48337576,bossUltimatePercent:0}):
   createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:loadout.mercenary,defenderMercenary:snapshot({code:'V-004',equipment:1000000}).mercenary,attackerEquipmentBonus:1000000,defenderEquipmentBonus:1000000,seed:7919});
  return json(res,{cards,payload:{mode,battlefieldMode:mode==='PVP'?'PVP':'APOCALYPSE',monster,battleV2:battle}});
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
  await page.goto(base+'/mercenary-codex/?view=all#V-008');
  const note=page.locator('.balance-note').filter({hasText:'전력 연계'});await note.waitFor();
  assert.match(await note.innerText(),/PVE에서는 아군 카드 2회, PVP에서는 1회/);assert.match(await note.innerText(),/적의 기본 공격 우선 대상/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await note.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-codex.png')});
  const battles=[];
  for(const mode of ['PVE','PVP']){
   await page.goto(base+'/s-rear-qa');
   const playback=await page.evaluate(async mode=>{
    const data=await fetch('/qa-battle?mode='+mode).then(r=>r.json());window.cnineCardCatalog=()=>data.cards;
    const api=window.ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(...args)=>(window.qaEngine=await original(...args));
    const modal=document.getElementById('modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode});
    await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode});
    const engine=window.qaEngine;await engine.deployCards({instant:true,force:true});await engine.setVisible(true);
    const timeline=data.payload.battleV2.result.timeline;
    const event=mode==='PVE'?timeline.find(e=>e.type==='TURN'&&e.actorId?.startsWith('B:')&&e.targetId==='A:MERCENARY:V-008'&&e.damage>0&&!e.dodge):
     timeline.find(e=>e.type==='MERCENARY_HIT'&&e.actorId==='A:MERCENARY:V-008'&&e.damage>0&&!e.dodge);
    if(!event)throw Error('Missing canonical '+mode+' hit');
    const hpCalls=[],sync=engine.syncTargetHp;
    engine.syncTargetHp=function(target,hp){const value=sync.call(this,target,hp);hpCalls.push({id:target.id,input:hp,hp:target.hp});return value;};
    if(mode==='PVP'){
     // Isolated playback starts after the opening roster and HP-buff events.
     engine.eventHpPercent(engine.combatantById(event.targetId),null,event.targetMaxHp);
     engine.skillChipPlayback?.remember(event);await engine.playMercenaryEvent(event);
    }
    else await engine.playEvents([event],{timedInternal:true});
    engine.syncTargetHp=sync;
    return {mode,targetId:event.targetId,actorId:event.actorId,expectedHpPercent:event.targetHpAfter/event.targetMaxHp*100,hpCalls};
   },mode);
   assert.ok(playback.hpCalls.some(c=>c.id===playback.targetId&&Math.abs(c.input-playback.expectedHpPercent)<1e-8&&Math.abs(c.hp-playback.expectedHpPercent)<1e-8),JSON.stringify(playback));
   await page.screenshot({path:path.join(out,label+'-'+mode.toLowerCase()+'.png')});
   battles.push(playback);await page.evaluate(()=>window.ProjectVPixiBattle.destroy());
  }
  assert.deepEqual(errors,[]);reports.push({label,viewport,codex:'PASS',overflow:false,battles,errors});await page.close();
 }
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({source:'canonical server battles + shipped V3 bundle/live wrapper',reports},null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',viewports:2,battles:4,out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
