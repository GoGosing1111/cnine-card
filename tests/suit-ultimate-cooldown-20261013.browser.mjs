import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {buildFighter,buildMonsterFighter,buildBattleSuitFighter,publicFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {Z_BODY_AREA_SKILL} from '../shared/z-body-area-skill.mjs';
import {X_BODY_AREA_SKILL} from '../shared/x-body-area-skill.mjs';
import {OVERLORD_AREA_SKILL} from '../shared/overlord-suit-v1.mjs';
import {SX_AREA_SKILL} from '../shared/sx-suit-v1.mjs';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.SUIT_ULTIMATE_QA_OUTPUT;
assert(out,'Set SUIT_ULTIMATE_QA_OUTPUT outside the checkout');fs.mkdirSync(out,{recursive:true});
const original=JSON.parse(fs.readFileSync(path.join(root,'preview/sx-live-v1/fixtures.json'))).multi;
const cases=[
 ['Z','BATTLE_SUIT_Z_BODY',Z_BODY_AREA_SKILL,'/assets/ui/project-v/account-battle-suits/z-sword-v1/z-body.png',1.4],
 ['X','BATTLE_SUIT_X_BODY',X_BODY_AREA_SKILL,'/assets/ui/project-v/account-battle-suits/x-sword-v1/x-body.png',2.4],
 ['OVERLORD','BATTLE_SUIT_OVERLORD',OVERLORD_AREA_SKILL,'/assets/ui/project-v/account-battle-suits/overlord-v1/overlord.png',2.5],
 ['SX','BATTLE_SUIT_SX',SX_AREA_SKILL,'/preview/battle-suit-sx-v1/assets/sources/sx-standing-approved-20261007.png',2.4]
];
const samples={};
for(const [name,code,skill,image,holdAt] of cases){
 const a=original.cards.map((card,i)=>({...buildFighter(card,i,'A',null,'PVE'),hp:1e12,maxHp:1e12,attack:1,speed:200}));
 const b=original.battleV2.teams.B.cards.map((card,i)=>({...buildMonsterFighter({id:i+1,battle_power:50000000,is_boss:0}),id:card.id,slot:i,hp:1e12,maxHp:1e12,shield:1e14,maxShield:1e14,attack:1,speed:200}));
 const suit={...original.equippedBattleSuit,code,name,pvePower:50000000,image,battleSprite:image,appearance:{battleSprite:image,battleHeight:278},skillChips:[]};
 const support=buildBattleSuitFighter(suit);
 const result=simulateBattleV2Preview({teamA:[...a,support],teamB:b,maxActions:6000,maxCombatDurationMs:47000,seed:2011});
 const events=result.timeline.filter(e=>e.chipCode===skill.code&&['SKILL_CHIP_CAST','SKILL_CHIP_HIT'].includes(e.type));
 assert.deepEqual(events.filter(e=>e.type==='SKILL_CHIP_CAST').map(e=>e.combatAtMs),[0,40000]);
 assert.equal(events.filter(e=>e.type==='SKILL_CHIP_HIT').length,50);
 const payload=structuredClone(original);payload.accountNickname=payload.playerName=name+' 궁극기 검수';payload.equippedBattleSuit=suit;payload.characterBonus={...payload.characterBonus,battleSuitPve:suit.pvePower,equippedBattleSuit:suit};
 payload.battleV2.teams.A.cards=a.map(publicFighter);payload.battleV2.teams.A.supports=[{...publicFighter(support),authoritative:true,damageAuthority:'SERVER_TIMELINE'}];payload.battleV2.teams.B.cards=b.map(publicFighter);
 for(const row of payload.continuousEncounter.instances){const fighter=b.find(f=>f.id===row.id);if(fighter)Object.assign(row,{maxHp:fighter.maxHp,hp:fighter.hp,shield:fighter.shield,maxShield:fighter.maxShield});}
 payload.battleV2.result.timeline=[];
 samples[name]={payload,code,holdAt:holdAt+skill.impactOffsetsMs[0]/1000,events:[...events,{type:'RESULT',combatAtMs:48000}].map((event,i)=>({...event,seq:i+1,combatGroup:i,combatGroupDurationMs:0,combatClock:SKILL_CHIP_CLOCK})),expectedDamage:events.filter(e=>e.type==='SKILL_CHIP_HIT').reduce((sum,e)=>sum+e.damage+e.absorbed,0)};
}
const baseHtml=fs.readFileSync(path.join(root,'preview/sx-live-v1/index.html'),'utf8').replace('<script defer src="review.js"></script>','<script defer src="/qa-boot.js"></script>');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{try{
 const data=await fetch('/qa-data?'+location.search.slice(1)).then(r=>r.json());window.cnineCardCatalog=()=>data.payload.cards;
 const api=ProjectVPixiBattle,mount=api.mountForBattle;let engine;api.mountForBattle=async(...args)=>(engine=await mount(...args));
 const modal=document.getElementById('modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:'HUNT',playerName:data.code,opponentName:'궁극기 검수'});
 await ProjectVBattleV3Live.createRenderer({...prepared,modal,data:data.payload,mode:'HUNT',playerName:data.code});api.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});
 const q=window.SuitUltimateQA={engine,data,paused:false,hits:[],casts:[],time:0};engine.accountBattleUnitIsPaused=()=>q.paused;
 q.done=engine.playEvents(data.events,{isPaused:()=>q.paused,afterEvent:event=>{if(event.type==='SKILL_CHIP_CAST')q.casts.push(event.combatAtMs);if(event.type==='SKILL_CHIP_HIT')q.hits.push({id:event.castId+':'+event.targetId+':'+event.hitIndex,damage:event.damage+event.absorbed});}});
 q.done.catch(error=>{q.error=error.stack;console.error(error);});
 await engine.skillChipPlayback.ready;q.playback=engine.skillChipPlayback;q.playback.timeline.pause();q.paused=true;
 q.advance=async(target,step=10)=>{while(q.time<target){q.time=Math.min(target,q.time+step);q.playback.timeline.time(q.time/1000,true);q.paused=false;q.playback.pump();q.paused=true;await Promise.resolve();}q.playback.render();q.playback.timeline?.pause();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
 q.ready=true;
 }catch(error){window.qaError=error.stack;console.error(error);}});`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),send=(type,data)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(data);};
 if(url.pathname==='/qa.html')return send('text/html; charset=utf-8',baseHtml);
 if(url.pathname==='/qa-boot.js')return send('text/javascript',boot);
 if(url.pathname==='/qa-data')return send('application/json',JSON.stringify(samples[url.searchParams.get('suit')]));
 if(url.pathname.startsWith('/api/'))return send('application/json','{"enabled":false,"items":[]}');
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'content-type':({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),checks=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}])for(const [name] of cases){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(base+'/qa.html?suit='+name);await page.waitForFunction(()=>window.SuitUltimateQA?.ready||window.qaError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.qaError),undefined);
  assert.deepEqual(await page.evaluate(()=>SuitUltimateQA.casts),[0]);
  await page.evaluate(()=>SuitUltimateQA.advance(SuitUltimateQA.data.holdAt*1000));
  const initial=await page.evaluate(()=>{const q=SuitUltimateQA;return {casts:q.casts,sword:q.engine.accountBattleUnit.swordAnimation.diagnostics(),effects:q.playback.fx.size,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.equal(initial.effects,1);assert.equal(initial.overflow,false);
  await page.screenshot({path:path.join(out,viewport.width+'-'+name+'-opening.png'),fullPage:true});
  await page.evaluate(async()=>{await SuitUltimateQA.advance(6000);await SuitUltimateQA.advance(39999,33999);});
  assert.deepEqual(await page.evaluate(()=>SuitUltimateQA.casts),[0]);
  await page.evaluate(()=>SuitUltimateQA.advance(40000));
  assert.deepEqual(await page.evaluate(()=>SuitUltimateQA.casts),[0,40000]);
  await page.evaluate(()=>SuitUltimateQA.advance(47000));
  const finish=await page.evaluate(async()=>{const q=SuitUltimateQA,result={casts:q.casts,hits:q.hits,error:q.error||null};q.engine.cancelTimelines();result.effects=q.playback.fx.size;const p=structuredClone(q.data.payload);p.mode=p.battleV2.mode='PVP';await q.engine.configureAccountBattleUnit(p);result.pvpSupportEnabled=q.engine.accountBattleUnitEnabled;q.engine.destroy();return result;});
  assert.equal(finish.error,null);assert.equal(finish.hits.length,50);assert.equal(new Set(finish.hits.map(h=>h.id)).size,50);assert.equal(finish.hits.reduce((sum,h)=>sum+h.damage,0),samples[name].expectedDamage);assert.equal(finish.effects,0);assert.equal(finish.pvpSupportEnabled,false);
  checks.push({width:viewport.width,suit:name,opening:initial,casts:finish.casts,hits:finish.hits.length,damage:samples[name].expectedDamage,cleanupEffects:finish.effects,pvpSupportEnabled:finish.pvpSupportEnabled});await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,errors:errors.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
