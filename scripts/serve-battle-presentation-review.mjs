// Local visual regression harness. No production API or real-account writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {legionFixture} from '../tests/helpers/legion-hunt-fixture.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const root=fs.realpathSync(process.cwd()),port=8962;
const pvp=JSON.parse(fs.readFileSync('tests/fixtures/v3-completion-payload-20260928.json','utf8'));
delete pvp.monster;pvp.mode=pvp.battlefieldMode='PVP';
pvp.battleV2.teams.B={...pvp.battleV2.teams.A,cards:pvp.battleV2.teams.A.cards.map(c=>({...c,id:c.id.replace(/^A:/,'B:'),side:'B'}))};
pvp.battleV2.result.timeline[0].targetId=pvp.battleV2.teams.B.cards[0].id;
pvp.battleV2.result.final.B=pvp.battleV2.teams.B.cards.map(c=>({id:c.id,hp:0,maxHp:c.maxHp}));
const fixture=await legionFixture({withMercenary:true});
const hunt=createHuntSession({snapshot:(await fixture.call('legion-hunt/bootstrap')).body.loadout,seed:1731}).payload;
await fixture.close();
const original=hunt.battleV2.result.timeline,counts=new Map();
for(const event of original)if(event.type==='ENEMY_SPAWN'&&!event.boss)counts.set(event.combatGroup,(counts.get(event.combatGroup)||0)+1);
const wave=original.filter(e=>e.type==='ENEMY_SPAWN'&&e.combatGroup===[...counts].find(([,n])=>n===12)[0]);
const boss=original.find(e=>e.finalBoss),clock=wave[0].combatClock;
// Rehearse two real instance transitions in six seconds, using original V3
// actors and server-generated instance IDs. This does not alter live timings.
hunt.battleV2.result.timeline=[
 ...hunt.continuousEncounter.initialIds.map(targetId=>({type:'ENEMY_DESPAWN',targetId,combatAtMs:1000,combatGroup:0})),
 ...wave.map(e=>({...e,combatAtMs:1000,combatGroup:0})),
 ...wave.map(e=>({type:'ENEMY_DESPAWN',targetId:e.targetId,combatAtMs:6000,combatGroup:1})),
 {...boss,combatAtMs:6000,combatGroup:1},
 {type:'RESULT',combatAtMs:8000,combatGroup:2}
].map((e,i)=>({...e,seq:i+1,combatClock:clock,combatGroupDurationMs:0}));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'};
const html=mode=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>전투 수정 검수</title>
<script>localStorage.setItem('cnine_battle_sound','OFF');</script>
${['style','card','battle-v2-live','battle-v3-live'].map(name=>'<link rel="stylesheet" href="/css/'+name+'.css">').join('')}
<link rel="stylesheet" href="/preview/sustained-hunt-v2/hunt.css">
<style>body{margin:0;background:#080c17;color:#eee}#controls{position:fixed;top:0;left:0;right:0;z-index:50000;background:#101b2f;padding:8px;display:flex;gap:10px;align-items:center;font:13px sans-serif;flex-wrap:wrap}#controls a{color:#bfff65}#report{white-space:pre-wrap;font-size:12px}#modal{position:fixed;inset:70px 0 0} .battle-v3-modal{inset:70px 0 0!important;height:calc(100dvh - 70px)!important}</style>
<div id="controls"><a href="/review?mode=PVP">PVP 결과</a><a href="/review?mode=HUNT">군단토벌 증원</a><button id="run">${mode==='PVP'?'PVP 종료 재현':'12마리 증원 → 보스 재현'}</button><output id="report">음소거 · 격리 검수 · ${mode==='HUNT'?'6초 대표 전환 구간':''}</output></div><div id="modal"></div>
<script src="/js/project-v-battle-art-adapter-v1.js"></script><script src="/js/project-v-tier-battle-art-adapter-v1.js"></script><script src="/js/project-v-monster-battle-art-adapter-v1.js"></script>
<script src="${mode==='HUNT'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js'}"></script><script src="/js/battle-v3-live.js"></script>
<script>
const mode=${JSON.stringify(mode)},report=document.getElementById('report'),button=document.getElementById('run'),api=ProjectVPixiBattle;
let engine,renderer;for(const key of ['mountForBattle','resetSession']){const original=api[key];api[key]=async(...args)=>engine=await original(...args);}
button.onclick=async()=>{button.disabled=true;try{
 renderer?.destroy();const payload=await fetch('/payload?mode='+mode).then(r=>r.json());const modal=document.getElementById('modal');
 const view=ProjectVBattleV3Live.prepareLoading({modal,mode,playerName:'검수 원정대',opponentName:'상대 진영'});
 renderer=await ProjectVBattleV3Live.createRenderer({...view,modal,mode,data:payload,playUltimateCinematics:false,continuousPlayback:mode==='HUNT'});
 if(mode==='PVP'){
  await renderer.play();view.msg.innerHTML=ProjectVBattleV3Live.resultHtml({mode,win:true,data:{...payload,result:'WIN',reward:100}});renderer.showResult();
  report.textContent='PVP 종료 · '+engine.enemies.filter(c=>c.battleActive!==false).map(c=>c.state+' HP='+c.hp+' 기울기='+c.view.rotation.toFixed(2)).join(' / ')+' · 렌더링 '+engine.app.ticker.started;
 }else{
  await api.restoreDeployedFormation();let picked=0,spawns=0,started=performance.now(),bossAt;
  engine.attachGroundDrops({claim:async drop=>{report.textContent='아이템 요청 처리 중';await new Promise(r=>setTimeout(r,800));return {item:drop.item};},onPicked:r=>{report.textContent='획득 완료 '+(++picked)+'개 · 보스 출현 '+bossAt+'초';},onError:e=>{report.textContent=e.message;}});
  const icon={code:'MASTER_STAR',name:'마스터의 별',image:'/assets/ui/core-raid-rewards-v2/master-star.svg',tier:'rare',quantity:1};
  for(let i=0;i<2;i++)await engine.groundDrops.add({id:'qa-'+i,token:'qa',item:icon,position:{x:.45+i*.2,y:.55},expiresAt:Date.now()+60000},Date.now());
  report.textContent='12슬롯 증원 재생 중 · 클릭 응답 800ms 모의 지연';
  await engine.playEvents(payload.battleV2.result.timeline,{sequential:true,afterEvent:e=>{if(e.type==='ENEMY_SPAWN'){spawns++;if(e.finalBoss)bossAt=((performance.now()-started)/1000).toFixed(2);report.textContent='증원 '+spawns+'명 · 보스 출현 '+(bossAt||'대기')+'초';}}});
  report.textContent='증원 '+spawns+'명 · 보스 1명 · 출현 '+bossAt+'초 · 잔여 적 '+engine.enemies.filter(c=>engine.isAlive(c)).length;
 }
}catch(e){report.textContent='오류: '+e.message;}finally{button.disabled=false;}};
</script></html>`;
const server=http.createServer((req,res)=>{
 if(req.headers.host!=='127.0.0.1:'+port){res.writeHead(403);res.end();return;}
 const url=new URL(req.url,'http://'+req.headers.host),mode=url.searchParams.get('mode')==='HUNT'?'HUNT':'PVP';
 if(url.pathname==='/review'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html(mode));return;}
 if(url.pathname==='/payload'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(mode==='HUNT'?hunt:pvp));return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!mime[path.extname(file)]){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log('Muted isolated battle review: http://127.0.0.1:'+port+'/review?mode=PVP'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
