// Local read-only fixtures; no live account action or balance change.
const $=id=>document.getElementById(id);
let fixtures,payload,engine,renderer,held,heldTimeline,busy=false;
function cleanup(){heldTimeline?.kill();held?.release();held=null;heldTimeline=null;}
function report(text){$('health').textContent=text;$('diagnostics').textContent=JSON.stringify({name:payload?.monster?.name,source:payload?.monster?.image,sd:payload?.monster?.battleSprite,videoElements:document.querySelectorAll('video').length,engine:engine?.diagnostics?.()},null,2);}
async function select(){
 if(busy)return;busy=true;cleanup();$('play').disabled=true;$('impact').disabled=true;
 try{
  renderer?.destroy();await window.ProjectVBattleV3Live.ensureRuntime({effects:true});
  await window.ProjectVMonsterBattleArtAdapter?.ready?.();
  payload=structuredClone(fixtures[$('boss').value]);$('source').src=payload.monster.image;
  const api=window.ProjectVPixiBattle,mount=api.mountForBattle,reset=api.resetSession;
  api.mountForBattle=async(...args)=>engine=await mount(...args);api.resetSession=async(...args)=>engine=await reset(...args);
  try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVE',playerName:'검수 편성',opponentName:payload.monster.name,autoText:'승인 리소스 연결 확인'});renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVE',playUltimateCinematics:false});}
  finally{api.mountForBattle=mount;api.resetSession=reset;}
  await engine.deployCards({instant:true,force:true});await engine.ensureApocalypseBossUltimateReady();
  $('play').disabled=false;$('impact').disabled=false;report(payload.monster.name+' · 승인 SD 배치 완료 · 기존 V3 궁극기 준비');
 }catch(e){report(e.message);console.error(e);}finally{busy=false;}
}
async function play(){await select();if(busy||!engine)return;busy=true;try{const e=payload.battleV2.result.timeline.find(e=>e.type==='BOSS_ULTIMATE');if(!e)throw Error('검수 궁극기 영수증 없음');await engine.playEvents([{...e,actorId:payload.battleV2.teams.B.cards[0].id,label:'궁극기'}]);report(payload.monster.name+' · 기존 V3 궁극기 재생 완료 · 동영상 0개');}catch(e){report(e.message);}finally{busy=false;}}
async function impact(){await select();if(busy||!engine)return;const targets=engine.allies.filter(t=>t.battleActive!==false),runtime=engine.apocalypseUltimateRuntime();held=runtime.create({x:targets.reduce((n,t)=>n+t.root.x,0)/targets.length,y:targets.reduce((n,t)=>n+t.root.y,0)/targets.length-150,scale:engine.mobile?.76:1.02}).attach(engine.effectLayer);void engine.timeline(t=>{heldTimeline=t;held.play(t);t.pause();},()=>{},1);heldTimeline.time(runtime.profile?.impactAt??.56,false).pause();report(payload.monster.name+' · 기존 V3 궁극기 충돌 프레임 · 동영상 0개');}
try{const r=await fetch('/__original-ip-fixtures');if(!r.ok)throw Error('로컬 검수 서버에서만 제공되는 화면입니다.');fixtures=await r.json();for(const [key,value]of Object.entries(fixtures))$('boss').add(new Option(value.monster.name+' · '+key,key));$('boss').addEventListener('change',select);$('reset').addEventListener('click',select);$('play').addEventListener('click',play);$('impact').addEventListener('click',impact);await select();}catch(e){report(e.message);}
window.addEventListener('pagehide',()=>{cleanup();renderer?.destroy();window.ProjectVPixiBattle?.destroy();},{once:true});
