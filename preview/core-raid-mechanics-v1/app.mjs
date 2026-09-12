import {run,cancel} from './mechanics.mjs';
import {MECHANICS} from './model.mjs';
const modal=document.getElementById('modal'),closeButton=document.getElementById('closeMechanic'),recent=document.getElementById('recentResult');
let generation=0,renderer=null,seed=0,lastResult=null,mountQueue=Promise.resolve();
function close(){generation++;cancel();globalThis.ProjectVRaidQteV1924?.cancel();renderer?.destroy();renderer=null;modal.__battleV2Renderer=null;modal.className='modal cqm-modal';modal.innerHTML='';closeButton.hidden=true;document.body.classList.remove('cqm-testing');}
async function launch(kind){
 close();const stamp=generation;closeButton.hidden=false;document.body.classList.add('cqm-testing');lastResult=null;
 try{
  if(!globalThis.CNineCoreRaidBridge?.createMechanicFixture)throw Error('기믹 전장을 준비하는 중입니다. 다시 눌러주세요.');
  const payload=globalThis.CNineCoreRaidBridge.createMechanicFixture(),label=MECHANICS[kind]?.name||'모바일 방향 입력';
  // Only the local fixture owns this timeline. No live start/resolve endpoint is called.
  payload.battleV2.result.timeline=[{type:'RAID_QTE_SEQUENCE',qteId:kind,previewMechanic:kind,title:label,sequence:['UP','RIGHT','DOWN','LEFT','UP','RIGHT'],windowMs:10000,label:'화면의 방향 버튼을 누르거나 짧게 스와이프하세요.'}];
  payload.battleV2.result.winner='PENDING';
  let live;
  // The shared Pixi renderer has one mount. Serialize close/relaunch while assets load.
  const pending=mountQueue.then(async()=>{
   if(stamp!==generation)return null;
   live=globalThis.ProjectVBattleV3Live.prepareLoading({modal,mode:'RAID',playerName:'기믹 검수',opponentName:'붕괴 코어',autoText:'공용 V3 전장과 입력 장치를 준비합니다.'});
   const mounted=await globalThis.ProjectVBattleV3Live.createRenderer({...live,modal,data:payload,mode:'RAID',playUltimateCinematics:false,onInteractiveEvent:async(event,context)=>{
   if(stamp!==generation)return {success:false,cancelled:true};
   const result=kind==='SEQUENCE'?await globalThis.ProjectVRaidQteV1924.run(event,context):await run(kind,{...context,seed:seed++});
   if(stamp===generation)lastResult=result;return result;
   }});
   if(stamp!==generation){mounted.destroy();return null;}
   renderer=mounted;modal.__battleV2Renderer=mounted;return mounted;
  });
  mountQueue=pending.catch(()=>{});
  const created=await pending;if(!created)return;
  await created.play();if(stamp!==generation||!lastResult)return;
  const result=lastResult;recent.textContent=`${label} · ${result.cancelled?'체험 취소':result.success?'성공':'실패'}${result.score!==undefined?` · ${result.score}/${result.total}`:''}`;
  const recap=document.createElement('div');recap.className='cqm-recap';recap.innerHTML=`<small>MECHANIC REVIEW COMPLETE</small><h2>${result.cancelled?'체험을 종료했습니다':result.success?'코어 제어 성공':'다시 도전할 수 있습니다'}</h2><p>${label} · ${result.score!==undefined?result.score+' / '+result.total+' 성공':result.success?'방향 입력 완료':'입력 검수 종료'}</p><div><button data-retry>다시 체험 ↻</button><button data-back>기믹 목록으로</button></div>`;live.stage.append(recap);recap.querySelector('[data-retry]').onclick=()=>void launch(kind);recap.querySelector('[data-back]').onclick=close;
 }catch(error){if(stamp!==generation)return;recent.textContent=error.message;close();console.error(error);}
}
document.querySelectorAll('[data-launch]').forEach(button=>button.onclick=()=>void launch(button.dataset.launch));closeButton.onclick=close;addEventListener('pagehide',close);addEventListener('keydown',e=>{if(e.key==='Escape'&&!closeButton.hidden)close();});
globalThis.CoreMechanicsPreview=Object.freeze({launch,close,getLastResult:()=>lastResult,getActiveGeneration:()=>generation});
