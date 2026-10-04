import {ICON_ROLES} from '/shared/icon-roles-v1.mjs';
import {loadIconRoleView,iconRoleDescription} from '/js/icon-role-view-v1.mjs';
let selected=ICON_ROLES.find(d=>d.code===new URL(location.href).searchParams.get('character'))||ICON_ROLES[0],renderer=null,running=false;
const tabs=document.querySelector('#role-tabs'),description=document.querySelector('#role-description'),button=document.querySelector('#review-play'),status=document.querySelector('#review-status'),modal=document.querySelector('#role-battle');
function draw(){tabs.innerHTML=ICON_ROLES.map(d=>'<button type="button" data-code="'+d.code+'" aria-pressed="'+(d===selected)+'">'+d.name+'<small>'+d.label+'</small></button>').join('');description.innerHTML=iconRoleDescription(selected.cardId);}
tabs.onclick=e=>{const code=e.target.closest('[data-code]')?.dataset.code;if(code){selected=ICON_ROLES.find(d=>d.code===code);draw();}};
const close=()=>{renderer?.destroy();renderer=null;window.ProjectVBattleV3Live?.hardReset();modal.className='modal';modal.innerHTML='';running=false;button.disabled=false;button.focus();};
async function play(){
 if(running)return;running=true;button.disabled=true;status.textContent='전투 리소스를 준비하고 있습니다…';
 try{
  const mode=document.querySelector('#review-mode').value,response=await fetch('./'+selected.code.toLowerCase()+'-'+mode.toLowerCase()+'.json',{cache:'no-store'});if(!response.ok)throw Error('검수 전투를 불러오지 못했습니다.');
  const data=await response.json();window.__iconReviewData=data;
  await window.ProjectVBattleV3Live.ensureRuntime();
  const shell=window.ProjectVBattleV3Live.prepareLoading({modal,mode,playerName:data.playerName,opponentName:data.opponentName});
  renderer=await window.ProjectVBattleV3Live.createRenderer({...shell,modal,data,mode});
  const back=document.createElement('button');back.className='ir-review-return';back.textContent='검수 화면으로 돌아가기';back.onclick=close;modal.append(back);
  status.textContent='';window.__iconReviewRenderer=renderer;
  const complete=await renderer.play();if(!running)return;
  if(complete===false)throw Error('전투 연출이 완료되지 않았습니다.');renderer.showResult();
  const result=document.createElement('div');result.className='ir-review-result';result.textContent='검수 완료 · '+(data.battleV2.result.winner==='A'?'아군 승리':'상대 승리')+' · 서버 전투 결과 반영';modal.append(result);window.__iconReviewComplete=true;
 }catch(error){status.textContent=error.message;close();}
}
button.onclick=play;window.addEventListener('pagehide',close);
draw();loadIconRoleView().then(draw).catch(()=>{status.textContent='현재 역할 수치는 CMS 연결 후 확인할 수 있습니다. 검수 전투는 출시 기본 설정으로 실행됩니다.';});
