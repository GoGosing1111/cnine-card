import {COOP_SPECIES} from '../shared/cooperative-roster-v3.mjs?v=20261012-random-v3';
import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {COOP_MONSTERS,validateCoopCombat,validateCoopEconomy} from '../shared/cooperative-settings-v1.mjs?v=20261002-cms1';
import {COOP_DIFFICULTIES} from '../shared/cooperative-battleground-v1.mjs?v=20261002-cms1';
import {validateCoopRewards} from '../shared/cooperative-rewards-v1.mjs?v=20261020-energy-v1';
import {cooperativeRewardsMarkup} from './cooperative-rewards.mjs?v=20261020-energy-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(path,label,value,min,max)=>`<label>${label}<input type="number" name="${path}" value="${value}" min="${min}" max="${max}" step="1" required></label>`;
const t=(path,label,value,max)=>`<label>${label}${max>=180?`<textarea name="${path}" maxlength="${max}" rows="3" required>${esc(value)}</textarea>`:`<input name="${path}" value="${esc(value)}" maxlength="${max}" required>`}</label>`;
export async function mountCooperativeCms(root){
 let settings,catalog=[],users=new Map(),results=[],busy=false,dirty=false,tab='operation',difficulty=0;
 root.innerHTML=`<header class="coop-cms-hero"><div><span class="coop-cms-eyebrow">심층 제련소 · 운영 관리</span><h2>격전지<span>(협동)</span></h2><p>세 분대가 돌파하는 하나의 전장</p><div class="coop-cms-tags"><b>3인 파티</b><b>9캐릭터</b><b>3단계 돌파</b><b data-mode>불러오는 중</b></div></div><img src="/assets/ui/cooperative-arke-v1/arke-battle-sprite-v1.png" alt="삼핵 거신 아르케"></header>
 <div class="coop-cms-toolbar"><p role="status" aria-live="polite" data-status></p><button type="button" data-reload>새로 불러오기</button></div><form hidden></form>`;
 const form=root.querySelector('form'),status=root.querySelector('[data-status]');
 const note=message=>status.textContent=message;
 function lock(value){busy=value;root.querySelectorAll('input,button,select,textarea').forEach(el=>el.disabled=value);if(!value&&settings)drawUsers();}
 function collect(){
  const next=structuredClone(settings);
  for(const input of form.querySelectorAll('[name]')){
   if(input.type==='radio'&&!input.checked)continue;
   const keys=input.name.split('.');let obj=next;for(const key of keys.slice(0,-1))obj=obj[key];
   obj[keys.at(-1)]=input.type==='number'?Number(input.value):input.type==='checkbox'?input.checked:input.value;
  }
  return next;
 }
 function markDirty(){dirty=true;form.querySelector('[data-save-state]').textContent='저장하지 않은 변경사항';}
 function showTabs(){
  form.querySelectorAll('[data-section]').forEach(el=>el.hidden=el.dataset.section!==tab);
  form.querySelectorAll('[data-tab]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.tab===tab)));
  form.querySelectorAll('[data-difficulty-panel]').forEach(el=>el.hidden=Number(el.dataset.difficultyPanel)!==difficulty);
  form.querySelectorAll('[data-difficulty]').forEach(el=>el.setAttribute('aria-selected',String(Number(el.dataset.difficulty)===difficulty)));
 }
 function drawUsers(){
  if(!settings||!form.querySelector('[data-test-selected]'))return;
  const ids=settings.testUserIds;form.querySelector('[data-test-count]').textContent=ids.length+' / 100명';
  form.querySelector('[data-test-selected]').innerHTML=ids.map(id=>`<li><span><b>${esc(users.get(id)?.nickname||'계정')}</b><small>#${id}</small></span><button type="button" data-remove="${id}">제외</button></li>`).join('')||'<li class="coop-cms-empty">지정된 참여자가 없습니다. TEST에서는 OWNER만 입장합니다.</li>';
  form.querySelector('[data-test-results]').innerHTML=results.map(u=>`<li><span><b>${esc(u.nickname)}</b><small>#${u.id}</small></span><button type="button" data-add="${u.id}" ${ids.includes(u.id)||ids.length>=100?'disabled':''}>${ids.includes(u.id)?'추가됨':'참여자 추가'}</button></li>`).join('');
 }
 function draw(){
  const c=settings.combat,p=c.patterns,e=settings.economyDraft;form.hidden=false;
  root.querySelector('[data-mode]').textContent=settings.mode+' · 저장 r'+settings.revision;
  form.innerHTML=`<nav class="coop-cms-tabs" role="tablist" aria-label="격전지 설정">${[['operation','운영·참여자'],['combat','단계·몬스터'],['mechanics','보스 특성'],['rewards','클리어 보상'],['economy','입장·이전 초안']].map(([id,label])=>`<button type="button" role="tab" data-tab="${id}" aria-controls="coop-cms-${id}">${label}</button>`).join('')}</nav>
   <section id="coop-cms-operation" data-section="operation"><div class="coop-cms-heading"><span>01</span><div><h3>운영 상태</h3><p>공개 상태와 테스트 참여자는 저장 즉시 입장 권한에 반영됩니다.</p></div></div>
   <div class="coop-cms-modes">${[['OFF','운영 중지','신규 입장 차단'],['TEST','지정 계정 테스트','OWNER + 등록한 참여자'],['ON','전체 공개','모든 유저 입장 가능']].map(([v,label,hint])=>`<label><input type="radio" name="mode" value="${v}" ${settings.mode===v?'checked':''}><span><small>${v}</small><b>${label}</b><em>${hint}</em></span></label>`).join('')}</div>
   <div class="coop-cms-grid">${n('combat.lobbySeconds','대기방 모집 시간 (초)',c.lobbySeconds,60,3600)}${n('combat.maxBattleSeconds','전체 전투 제한 (초 · 최대 180)',c.maxBattleSeconds,30,180)}</div>
   <div class="coop-cms-heading"><span>02</span><div><h3>테스트 참여자 <small data-test-count></small></h3><p>계정을 찾은 뒤 추가하고 저장하세요. OWNER는 기본 포함됩니다.</p></div></div>
   <div class="coop-cms-search"><label>정확한 닉네임 또는 계정번호<input type="search" data-query maxlength="80" placeholder="닉네임 / 계정번호"></label><button type="button" data-search>계정 찾기</button></div><ul data-test-results aria-label="계정 검색 결과"></ul><ul data-test-selected aria-label="테스트 참여자"></ul></section>
   <section id="coop-cms-combat" data-section="combat"><div class="coop-cms-heading"><span>03</span><div><h3>단계별 전장</h3><p>일반 몬스터 3종 → 준보스 → 최종 보스. 방마다 종류를 무작위로 정하며 아래 수치는 각 출현 칸의 기본 능력치입니다.</p></div></div>
   <div class="coop-cms-stage-grid">${c.stages.map((s,i)=>`<fieldset><legend>0${s.wave} · ${['일반 몬스터','준보스','최종 보스'][i]}</legend>${t('combat.stages.'+i+'.name','단계 이름',s.name,30)}${t('combat.stages.'+i+'.hint','공략 안내',s.hint,180)}</fieldset>`).join('')}</div>
   <div class="coop-cms-difficulty-tabs" role="tablist" aria-label="몬스터 난이도">${COOP_DIFFICULTIES.map((d,i)=>`<button type="button" role="tab" data-difficulty="${i}">${d.name}<small>${d.subtitle}</small></button>`).join('')}</div>
   ${c.difficulties.map((d,i)=>`<div data-difficulty-panel="${i}"><div class="coop-cms-grid">${t('combat.difficulties.'+i+'.recommendation','추천 편성 안내',d.recommendation,100)}${n('combat.difficulties.'+i+'.forcedEvery','몬스터 강제 행동 주기 (행동)',d.forcedEvery,1,12)}</div>
   <p class="coop-cms-help">전투력은 파티 전투력과 관계없는 고정값입니다. 체력·공격·방어는 기본 산출값의 배율입니다. 선택된 종의 배율·고유 방벽을 더하며 기존 방의 설정은 유지합니다.</p>
   <div class="coop-cms-monsters">${d.monsters.map((m,j)=>{const spec=COOP_MONSTERS[j],path='combat.difficulties.'+i+'.monsters.'+j+'.';return `<article><header><img src="/assets/ui/cooperative-arke-v1/${spec.sprite}" alt="" loading="lazy"><div><small>0${spec.wave} / ${spec.wave===1?'일반':spec.wave===2?'준보스':'최종 보스'}</small><h4>${['무작위 몬스터 · 선봉','무작위 몬스터 · 중앙','무작위 몬스터 · 후위','무작위 준보스','무작위 최종 보스'][j]}</h4></div></header><div class="coop-cms-stats">${n(path+'power','전투력',m.power,1000,2000000000)}${n(path+'hpPercent','체력 (%)',m.hpPercent,100,1200)}${n(path+'attackPercent','공격 (%)',m.attackPercent,100,1200)}${n(path+'defensePercent','방어 (%)',m.defensePercent,100,1200)}${n(path+'shieldPercent','방벽 (% HP)',m.shieldPercent,0,300)}${n(path+'attackCount','연속 공격 (회)',m.attackCount,1,5)}</div></article>`;}).join('')}</div></div>`).join('')}</section>
   <section id="coop-cms-mechanics" data-section="mechanics"><div class="coop-cms-heading"><span>04</span><div><h3>무작위 보스 · 자동 전투</h3><p>새 방에는 수동 차단·엄폐·교란이 없습니다. 보스의 실제 효과를 편성으로 공략합니다.</p></div></div><div class="coop-cms-monsters">${COOP_SPECIES.filter(s=>s.kind==='BOSS').map(s=>`<article><header><img src="${s.art}" alt="" loading="lazy"><div><small>준보스 / 최종 보스</small><h4>${s.name}</h4></div></header><p>${s.hint}</p><p>기본 체력 ×${s.hp} · 공격 ×${s.attack} · 고유 방벽 ${s.shield}% HP</p></article>`).join('')}</div><p class="coop-cms-help">준보스와 최종 보스는 서로 다른 종입니다. 적 종류는 편성 전 공개하고 방이 끝날 때까지 유지합니다. 이전 버전 방은 생성 당시 규칙으로 완료됩니다.</p></section>
   <section id="coop-cms-economy" data-section="economy"><div class="coop-cms-heading"><span>05</span><div><h3>입장 재료 · 이전 보상 초안</h3><p>이전 초안은 보관용입니다. 실제 지급은 클리어 보상 탭에서 설정하세요. 입장 재료 차감은 잠금 상태입니다.</p></div></div>
   <div class="coop-cms-locked"><b>초안 저장만 가능</b><span>ON으로 공개해도 이 수량이 차감되거나 지급되지 않습니다.</span></div>
   <fieldset><legend>입장 재료</legend><div class="coop-cms-grid"><label>재료 코드 (무료 입장은 비움)<input name="economyDraft.entryItemCode" maxlength="80" pattern="([A-Z][A-Z0-9_]{0,79})?" value="${esc(e.entryItemCode)}" placeholder="아이템 코드"></label>${n('economyDraft.entryQuantity','입장 시 소모 수량',e.entryQuantity,0,999)}<label>소모 대상<select name="economyDraft.payer"><option value="HOST" ${e.payer==='HOST'?'selected':''}>방장만</option><option value="EACH" ${e.payer==='EACH'?'selected':''}>각 참여자</option></select></label></div></fieldset>
   <fieldset><legend>클리어 보상 · 승리한 참여자 1인 기준</legend><div class="coop-cms-grid">${n('economyDraft.coin','코인',e.coin,0,1000000000000)}${n('economyDraft.masterStar','마스터의 별',e.masterStar,0,10000000)}${n('economyDraft.mysticEnergy','미스틱 에너지',e.mysticEnergy,0,100000)}</div></fieldset></section>
   <section id="coop-cms-rewards" data-section="rewards">${cooperativeRewardsMarkup(settings.rewards,catalog)}</section>
   <footer class="coop-cms-save"><div><b data-save-state>저장된 설정 · r${settings.revision}</b><small>전투·보상 설정은 새 대기방부터 적용</small></div><button type="submit">격전지 설정 저장</button></footer>`;
  drawUsers();showTabs();
 }
 async function load(){
  if(busy)return;if(dirty&&!confirm('저장하지 않은 변경사항을 버리고 다시 불러올까요?'))return;
  lock(true);note('격전지 설정을 불러오는 중입니다.');
  try{const [r,items]=await Promise.all([api('admin/coop/settings'),api('admin/coop/reward-catalog')]);settings=r.settings;catalog=items.items;users=new Map(r.testUsers.map(u=>[u.id,u]));results=[];dirty=false;draw();note('저장된 설정 r'+settings.revision+(settings.updatedAt?' · '+new Date(settings.updatedAt).toLocaleString('ko-KR')+' · 수정 계정 #'+settings.updatedBy:''));}
  catch(e){note(e.message);}finally{lock(false);}
 }
 root.querySelector('[data-reload]').onclick=()=>void load();
 async function search(){
  if(busy)return;const q=form.querySelector('[data-query]').value.trim();if(!q)return note('닉네임 또는 계정번호를 입력하세요.');
  lock(true);try{results=(await api('admin/coop/test-users?q='+encodeURIComponent(q))).users;drawUsers();note(results.length?'계정을 확인한 뒤 참여자 추가를 누르세요.':'일치하는 계정이 없습니다.');}catch(e){note(e.message);}finally{lock(false);}
 }
 form.addEventListener('input',e=>{if(e.target.name)markDirty();});
 form.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-query]')){e.preventDefault();void search();}});
 form.addEventListener('click',e=>{
  if(busy)return;const button=e.target.closest('button');if(!button)return;
  if(button.dataset.tab){tab=button.dataset.tab;showTabs();return;}
  if(button.dataset.difficulty!==undefined){difficulty=Number(button.dataset.difficulty);showTabs();return;}
  if(button.hasAttribute('data-search')){void search();return;}
  if(button.hasAttribute('data-reward-add')){
   const i=Number(button.dataset.rewardAdd),code=form.querySelector(`[data-reward-select="${i}"]`).value;
   if(!code)return note('추가할 아이템을 선택하세요.');settings=collect();const items=settings.rewards.difficulties[i].items;
   if(items.length<20&&!items.some(item=>item.code===code)){items.push({code,quantity:1});draw();markDirty();}return;
  }
  if(button.hasAttribute('data-reward-remove')){const [i,j]=button.dataset.rewardRemove.split(':').map(Number);settings=collect();settings.rewards.difficulties[i].items.splice(j,1);draw();markDirty();return;}
  if(button.dataset.add){const u=results.find(u=>u.id===Number(button.dataset.add));if(u&&!settings.testUserIds.includes(u.id)&&settings.testUserIds.length<100){settings.testUserIds.push(u.id);users.set(u.id,u);markDirty();drawUsers();}}
  if(button.dataset.remove){settings.testUserIds=settings.testUserIds.filter(id=>id!==Number(button.dataset.remove));markDirty();drawUsers();}
 });
 // Validation also runs for hidden tabs, with the first invalid field revealed.
 form.noValidate=true;
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!settings)return;
  const invalid=[...form.querySelectorAll('[name]')].find(el=>!el.checkValidity());
  if(invalid){tab=invalid.closest('[data-section]').dataset.section;const group=invalid.closest('[data-difficulty-panel]');if(group)difficulty=Number(group.dataset.difficultyPanel);showTabs();invalid.reportValidity();return;}
  const next=collect();try{next.combat=validateCoopCombat(next.combat);next.economyDraft=validateCoopEconomy(next.economyDraft);next.rewards=validateCoopRewards(next.rewards);next.rewardLocked=!next.rewards.enabled;}catch(e){note(e.message);return;}
  lock(true);note('격전지 설정을 저장하는 중입니다.');
  try{const r=await api('admin/coop/settings',{method:'POST',body:{settings:next}});settings=r.settings;users=new Map(r.testUsers.map(u=>[u.id,u]));dirty=false;draw();note('저장 완료 · r'+settings.revision+' · 전투 설정은 새 대기방부터 적용됩니다.');}
  catch(e){note(e.message);}finally{lock(false);}
 });
 await load();
}
function install(){
 const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role||document.getElementById('view-cooperative'))return;
 const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='격전지(협동)';button.dataset.view='cooperative';button.hidden=true;panel.id='view-cooperative';panel.className='view coop-cms';panel.hidden=true;nav.append(button);cms.append(panel);
 let mounted=false;
 button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='격전지(협동)';if(!mounted){mounted=true;void mountCooperativeCms(panel);}},true);
 const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
