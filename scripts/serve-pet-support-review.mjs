// Local, read-only battle presentation review. No live account or API writes.
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {petSupportFixture} from '../tests/helpers/pet-support-fixture.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),port=8968;
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'};
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>펫 스킬 연출 검수</title>
<script>localStorage.setItem('cnine_battle_sound','OFF');window.addEventListener('error',event=>{const el=document.getElementById('errors');if(el)el.textContent=event.message;});</script>
<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/card.css"><link rel="stylesheet" href="/css/battle-v2-live.css"><link rel="stylesheet" href="/css/battle-v3-live.css"><link rel="stylesheet" href="/raid/cooperative/style.css">
<style>body{margin:0;background:#080e19;color:#eee;font:13px sans-serif}#controls{position:fixed;inset:0 0 auto;z-index:50000;background:#101b2f;padding:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}button,select{font:inherit;padding:6px;background:#24364c;border:1px solid #61738c;color:white}#report{max-height:30px;overflow:auto;display:block;width:100%;font-size:11px;color:#bdd7e9}#errors{color:#ff9285}#modal,.battle-v3-modal{position:fixed;inset:104px 0 0!important;height:calc(100dvh - 104px)!important;min-height:0!important}#modal .battle-v3-live-shell{height:100%!important;min-height:0!important;max-height:100%!important}</style>
<div id="controls"><select id="mode" aria-label="전투 모드"><option>PVE</option><option>PVP</option><option>COOP</option></select><select id="type" aria-label="버프 종류"><option value="MAX_HP_PERCENT">체력</option><option value="ATTACK_PERCENT">공격</option><option value="DEFENSE_PERCENT">방어</option><option value="SPEED_PERCENT">속도</option><option value="START_SHIELD_PERCENT">보호막</option><option value="ALL">복합</option></select><button id="prepare">전장 준비</button><button id="cast" disabled>스킬 발동</button><button id="late" disabled>지연 입장</button><button id="close">전투 닫기</button><label><input type="checkbox" id="reduced">동작 줄이기</label><output id="report">실제 V3 번들 · 로컬 검수 · 음소거</output><output id="errors"></output></div><div id="modal"></div>
<script src="/js/project-v-battle-art-adapter-v1.js"></script><script src="/js/project-v-tier-battle-art-adapter-v1.js"></script><script src="/js/project-v-monster-battle-art-adapter-v1.js"></script><script src="/js/responsive-battle-sprites-v1815.js"></script>
<script src="/preview/project-v-v3/project-v-pixi-battle.bundle.js"></script><script src="/js/battle-v3-live.js"></script>
<script type="module">
import {mountCoopBattle} from '/raid/cooperative/battle.mjs';
const by=id=>document.getElementById(id),api=window.ProjectVPixiBattle,live=window.ProjectVBattleV3Live;let renderer,controller,payload,engine;
for(const name of ['mountForBattle','resetSession']){const original=api[name];api[name]=async(...args)=>(engine=await original(...args));}
window.addEventListener('error',event=>by('errors').textContent=event.message);window.addEventListener('unhandledrejection',event=>by('errors').textContent=String(event.reason?.stack||event.reason));
by('report').textContent='전장 준비를 눌러 주세요 · 실제 V3 번들';
const status=()=>{by('report').textContent=(by('mode').value==='COOP'?'3개 분대':'전투')+' · '+JSON.stringify(api.diagnostics().petSupport||[]);};
by('prepare').onclick=async()=>{
 by('prepare').disabled=true;by('cast').disabled=by('late').disabled=true;by('errors').textContent='';by('report').textContent='실제 전투 리소스 로딩 중';
 try{
  controller?.destroy();controller=null;renderer?.destroy();renderer=null;
  const mode=by('mode').value;payload=await fetch('/payload?mode='+mode+'&type='+by('type').value).then(r=>r.json());
  const modal=by('modal');modal.style.display='';
  if(mode==='COOP')controller=await mountCoopBattle(modal,payload);
  else{
   const view=live.prepareLoading({modal,mode,playerName:'펫 지원 원정대',opponentName:mode==='PVP'?'상대 진영':'슬라임'});
   renderer=await live.createRenderer({...view,modal,mode,data:payload,playUltimateCinematics:false});await api.restoreDeployedFormation();
  }
  engine.reducedMotion=by('reduced').checked;by('cast').disabled=by('late').disabled=false;status();
 }catch(e){by('errors').textContent=e.stack;}finally{by('prepare').disabled=false;}
};
by('cast').onclick=async()=>{try{await api.playEvents(payload.battleV2.result.timeline.filter(e=>e.type==='PET_OPENING_BUFF'),{timedInternal:true});status();}catch(e){by('errors').textContent=e.stack;}};
by('late').onclick=()=>{
 if(controller)controller.update({serverNow:Date.now(),state:{status:'ACTIVE',startsAt:Date.now()-5000},payload});
 else api.restorePetSupport(5000);status();
};
by('close').onclick=()=>{controller?.destroy();controller=null;renderer?.destroy();renderer=null;api.setVisible(false);by('modal').style.display='none';by('report').textContent='전투 닫음';};
</script></html>`;
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);return res.end();}
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/review'){res.writeHead(200,{'content-type':mime['.html']});return res.end(html);}
 if(url.pathname==='/payload'){res.writeHead(200,{'content-type':mime['.json']});return res.end(JSON.stringify(petSupportFixture({mode:url.searchParams.get('mode'),type:url.searchParams.get('type')})));}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!mime[path.extname(file)])throw Error('unsupported');
 const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-store'});res.end(bytes);
}catch(error){res.writeHead(404);res.end(error.message);}});
server.listen(port,'127.0.0.1',()=>console.log(`Pet presentation review: http://127.0.0.1:${port}/review`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
