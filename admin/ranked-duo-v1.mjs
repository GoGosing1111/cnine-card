import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={DRAFT:'초안',RECRUITING:'모집 중',PAIRING:'전력 평가 중',PUBLISHING:'팀 공개 중',READY:'대전 준비',ACTIVE:'진행 중',SETTLING:'최종 정산 중',CLOSED:'종료'};
const local=v=>v?new Date(Date.parse(v)+9*3600000).toISOString().slice(0,16):'';
export async function mountDuoCms(root){
 let data,busy=false;
 root.innerHTML='<header><p>RANKED DUO · SEASON CONTROL</p><h2>듀오 시즌 운영</h2></header><p data-status role="status"></p><form></form>';
 const form=root.querySelector('form'),status=root.querySelector('[data-status]');
 const call=(suffix='',options={})=>api('admin/ranked-duo'+suffix,options);
 function draw(){
  const c=data.config,s=data.season,phase=s?.status,editable=!s||!s.automatic&&['DRAFT','RECRUITING','READY','CLOSED'].includes(phase);
  const number=(key,label,value,min=1)=>'<label>'+label+'<input name="'+key+'" type="number" min="'+min+'" max="100000" value="'+(value??'')+'" placeholder="직접 설정"></label>';
  form.innerHTML=(s?.automatic?'<p class="duo-admin-note"><b>'+esc(s.rankedSeason.name)+' 자동 연동</b><br>24시간 모집 → 자동 팀 편성 → 대전 → 랭크전과 동시 종료.<br>행동력 최대 '+c.energy.maximum+' · '+c.energy.rechargeMinutes+'분마다 1 충전 · 1회 '+c.energy.cost+' 소모. 두 사람의 개인 행동력은 각각 관리됩니다.<br>최종 1~10위 팀원에게 듀오 챌린저 트로피를 자동 기록합니다.</p>':'')+'<div class="duo-admin-summary"><strong>'+esc(labels[phase]||'시즌 미등록')+'</strong><span>참가 '+data.participants+'명 · 미편성 '+data.waiting+'명</span><button type="button" data-action="reload">새로고침</button></div><fieldset '+(!editable?'disabled':'')+'><legend>시즌 설정 · 시간은 모두 한국시간</legend><label>시즌 이름<input name="name" maxlength="80" value="'+esc(c.name)+'" required></label><div class="duo-admin-fields"><label>대전 시작<input name="startsAt" type="datetime-local" value="'+local(c.startsAt)+'"></label><label>대전 종료<input name="endsAt" type="datetime-local" value="'+local(c.endsAt)+'"></label></div><div class="duo-admin-fields">'+number('maximum','행동력 최대치',c.energy.maximum)+(s?.automatic?number('rechargeMinutes','1 AP 충전 간격 (분)',c.energy.rechargeMinutes):number('dailyGrant','하루 지급량',c.energy.dailyGrant))+number('cost','공격 1회 비용',c.energy.cost)+'</div><p>'+ (s?.automatic?'랭크전 시즌의 최대치·충전 간격·소모량을 사용합니다. 행동력은 개인별로 따로 충전·차감하며 최대치를 넘지 않습니다.':'개인 행동력입니다. 한국시간 날짜가 바뀐 후 1일분을 충전하며, 미접속일 수만큼 소급하지 않습니다. 최대치를 넘지 않습니다.')+'</p><div class="duo-admin-fields">'+number('initial','초기 팀 점수',c.score.initial,0)+number('win','승리 점수',c.score.win)+number('loss','패배 차감',c.score.loss,0)+'</div><details><summary>용병별 전력 평가 배율</summary><p>기본은 1배입니다. 편성 공개 후에는 수정할 수 없습니다. 예: {"V-021":1.2}</p><label>평가 배율<textarea name="weights" rows="4">'+esc(JSON.stringify(c.mercenaryWeights,null,2))+'</textarea></label></details></fieldset><div class="duo-admin-actions"><button type="submit" '+(!editable?'disabled':'')+'>'+(!s||phase==='CLOSED'?'새 시즌 초안 만들기':'설정 저장')+'</button>'+
   (['DRAFT','READY','RECRUITING','PAIRING'].includes(phase)?'<button type="button" data-action="recruit">'+(phase==='DRAFT'?'24시간 참가 모집 시작':'추가모집 / 모집 재개')+'</button>':'')+
   (!s?.automatic&&phase==='RECRUITING'?'<button type="button" data-action="pair">모집 종료 후 팀 편성</button>':'')+
   (!s?.automatic&&['PAIRING','PUBLISHING'].includes(phase)?'<button type="button" data-action="pair-step">팀 편성 이어서 진행</button>':'')+
   (!s?.automatic&&phase==='READY'?'<button type="button" data-action="start">대전 활성화</button>':'')+
   (s&&phase!=='CLOSED'?'<button type="button" data-action="close">시즌 종료</button>':'')+'</div><p class="duo-admin-note">첫 모집 24시간 → 전력 평가 → 팀 공개 → 대전 활성화 순서입니다. 추가모집은 경기 시작 전 가능하며 공개된 팀을 유지합니다. 홀수 인원의 미편성자는 대기합니다. 자동 시즌 최종 상위 10팀에는 듀오 챌린저 트로피가 지급됩니다.</p>';
 }
 function collect(){const f=new FormData(form),c=structuredClone(data.config);c.name=f.get('name');for(const k of ['startsAt','endsAt'])c[k]=f.get(k)?new Date(f.get(k)+':00+09:00').toISOString():null;for(const k of ['maximum','dailyGrant','cost'])c.energy[k]=f.get(k)===''?null:Number(f.get(k));for(const k of ['initial','win','loss'])c.score[k]=Number(f.get(k));c.mercenaryWeights=JSON.parse(f.get('weights')||'{}');return c;}
 function lock(value){busy=value;form.querySelectorAll('button').forEach(b=>b.disabled=value);}
 async function load(){data=await call();draw();}
 async function pairing(){
  for(let step=0;step<1000&&root.isConnected&&!root.hidden;step++){
   const result=await call('/pair-step',{method:'POST',body:{}});
   status.textContent=result.done?'팀 편성이 완료되었습니다.':result.phase==='PUBLISHING'?'팀 공개 중 · '+(result.published||0)+' / '+result.teams+'팀':'참가자 전력을 순서대로 평가하고 있습니다. 창을 닫아도 이어서 진행할 수 있습니다.';
   if(result.done)return;
  }
  status.textContent='팀 편성 진행 내용을 저장했습니다. 이어서 진행 버튼으로 계속하세요.';
 }
 form.onsubmit=async event=>{event.preventDefault();if(busy)return;lock(true);try{const config=collect();await call(!data.season||data.season.status==='CLOSED'?'/create':'',{method:!data.season||data.season.status==='CLOSED'?'POST':'PATCH',body:{config}});await load();status.textContent='설정을 저장했습니다. 모집 시작과 대전 활성화는 별도 버튼으로 진행하세요.';}catch(error){status.textContent=error.message;}finally{busy=false;draw();}};
 form.onclick=async event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action||busy)return;
  if(['start','close'].includes(action)&&!confirm(action==='start'?'저장된 일정과 행동력 설정으로 대전을 활성화할까요?':'시즌을 종료할까요? 접수된 전투 결과는 정상 반영됩니다.'))return;
  let body={};if(action==='recruit'&&data.season.status!=='DRAFT'){const value=prompt('추가모집 시간 (기존 팀 유지, 1~720시간)','24');if(value===null)return;body.hours=Number(value);}
  lock(true);try{
   if(action==='reload')await load();
   else{if(action!=='pair-step')await call('/'+action,{method:'POST',body});if(['pair','pair-step'].includes(action))await pairing();await load();status.textContent+=' · 최신 상태를 불러왔습니다.';}
  }catch(error){status.textContent=error.message;}finally{busy=false;draw();}
 };
 try{await load();status.textContent=data.season?.automatic?'랭크전 시즌과 자동으로 연동 중입니다. 추가모집은 대전 시작 전에만 사용할 수 있습니다.':'랭크전 새 시즌에 맞춰 자동 모집합니다. 수동 시즌이 진행 중이면 해당 시즌 종료 후 자동 연동을 시작합니다.';}catch(error){status.textContent=error.message;}
}
function install(){
 const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
 const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='랭크 듀오';button.dataset.view='ranked-duo';button.hidden=true;panel.className='view duo-admin';panel.id='view-ranked-duo';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=false;
 button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);nav.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='랭크 듀오';if(!mounted){mounted=true;void mountDuoCms(panel);}},true);
 const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}

