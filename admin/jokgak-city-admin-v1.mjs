import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {CITY_ROLES,CITY_PLACES} from '../shared/jokgak-city-v1.mjs';
import {validateCitySettings,CITY_REWARD_EVENTS,cityRoleDescription} from '../shared/jokgak-city-settings-v1.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const modes=[['OFF','운영 중지','모든 신규 행동 차단'],['TEST','테스트 운영','OWNER·지정 참여자 / 실제 보상 없음'],['ON','정식 운영','전체 공개 / 보상 설정 적용']];
export function mountCityCms(root){
  let policy,catalog=[],tab='operation',selected='CITIZEN',busy=false,dirty=false,destroyed=false,testUsers=new Map(),results=[];
  const controller=new AbortController(),request=(path,options={})=>api(path,{...options,signal:controller.signal});
  root.innerHTML='<div class="city-cms-note" role="status" aria-live="polite"></div><form class="city-cms-form"></form>';
  const status=root.querySelector('[role=status]'),form=root.querySelector('form');
  const field=(path,label,value,min,max,scale=1)=>`<label>${label}<input type="number" data-path="${path}" data-scale="${scale}" value="${value/scale}" min="${min/scale}" max="${max/scale}" step="${scale===1000?.1:1}" required></label>`;
  const check=(path,label,value)=>`<label class="city-cms-check"><input type="checkbox" data-path="${path}" ${value?'checked':''}>${label}</label>`;
  function collect(){
    const next=structuredClone(policy);
    for(const input of form.querySelectorAll('[data-path]')){
      if(input.type==='radio'&&!input.checked)continue;
      const keys=input.dataset.path.split('.');let target=next;for(const k of keys.slice(0,-1))target=target[k];
      target[keys.at(-1)]=input.type==='checkbox'?input.checked:input.type==='number'?Math.round(Number(input.value)*Number(input.dataset.scale||1)):input.value;
    }
    return next;
  }
  function notice(text,error=false){status.textContent=text;status.classList.toggle('is-error',error);}
  function setBusy(value){busy=value;form.querySelectorAll('input,button,select').forEach(el=>el.disabled=value);}
  function roleNav(){return `<nav class="city-cms-roles" aria-label="역할 선택">${CITY_ROLES.map(r=>`<button type="button" data-role="${r.code}" aria-pressed="${selected===r.code}" style="--role:${r.color}"><i></i><b>${r.name}</b><small>${r.code}</small></button>`).join('')}</nav>`;}
  function operation(){
    const total=policy.roles.reduce((sum,r)=>sum+r.weight,0);
    return `<section><div class="city-cms-section-title"><span>01</span><div><h3>운영 모드</h3><p>저장 즉시 적용됩니다. 기존 행동 기록은 모드를 바꿔도 보존됩니다.</p></div></div><div class="city-cms-modes">${modes.map(([mode,name,detail])=>`<label><input type="radio" data-path="mode" value="${mode}" ${policy.mode===mode?'checked':''}><span><b>${mode}</b><strong>${name}</strong><small>${detail}</small></span></label>`).join('')}</div></section>
      <section><div class="city-cms-section-title"><span>02</span><div><h3>TEST 참여자 <small>${policy.testUserIds.length} / 100</small></h3><p>OWNER는 기본 포함입니다. 정확한 닉네임이나 계정번호로 찾은 뒤 추가·저장하세요.</p></div></div><div class="city-cms-search"><input type="search" data-user-query maxlength="80" aria-label="테스트 계정 검색" placeholder="정확한 닉네임 또는 계정번호"><button type="button" data-user-search>계정 찾기</button></div><div data-user-results>${results.map(u=>`<div class="city-cms-user"><span>${esc(u.nickname)} <small>#${u.id}</small></span><button type="button" data-user-add="${u.id}" ${policy.testUserIds.includes(u.id)?'disabled':''}>참여자 추가</button></div>`).join('')}</div><div class="city-cms-users">${policy.testUserIds.map(id=>`<div class="city-cms-user"><span>${esc(testUsers.get(id)?.nickname||'계정 확인 필요')} <small>#${id}</small></span><button type="button" data-user-remove="${id}">제외</button></div>`).join('')||'<p class="city-cms-empty">지정 참여자 없음 · OWNER만 테스트할 수 있습니다.</p>'}</div></section>
      <section><div class="city-cms-section-title"><span>03</span><div><h3>도시 공통 규칙</h3><p>역할 교대는 한국시간 00·06·12·18시로 고정됩니다.</p></div></div><div class="city-cms-grid">${field('rules.moveCooldownMs','이동 대기 (초)',policy.rules.moveCooldownMs,1000,60000,1000)}${field('rules.targetProtectionMs','교전 후 보호 (초)',policy.rules.targetProtectionMs,1000,3600000,1000)}${field('rules.rejoinCooldownMs','퇴장 후 재입장 (초)',policy.rules.rejoinCooldownMs,0,3600000,1000)}</div></section>
      <section><div class="city-cms-section-title"><span>04</span><div><h3>다음 교대 배정 비중</h3><p>0이면 다음 교대부터 배정하지 않습니다. 현재 역할은 교대 시각까지 유지됩니다.</p></div></div><div class="city-cms-distribution">${policy.roles.map((r,i)=>`<div class="city-cms-weight"><strong>${CITY_ROLES[i].name}</strong><div>${field('roles.'+i+'.weight','배정 비중',r.weight,0,10000)}</div><span data-role-odds="${i}">${(r.weight/total*100).toFixed(1)}%</span></div>`).join('')}</div></section>`;
  }
  function roleSettings(){
    const i=policy.roles.findIndex(r=>r.code===selected),r=policy.roles[i],base='roles.'+i+'.',meta=CITY_ROLES.find(x=>x.code===selected);
    return `${roleNav()}<section class="city-cms-role-panel" style="--role:${meta.color}"><header><div><small>${meta.code} / ROLE CONFIGURATION</small><h3>${meta.name}</h3></div><span class="city-cms-tag">현재 편성 PVP</span></header><p>도시 체력·행동 수치입니다. 기존 PVP 카드·용병 능력치는 유지됩니다.</p><div class="city-cms-grid">${field(base+'weight','다음 교대 배정 비중',r.weight,0,10000)}<label>입장 시 시작 장소<select data-path="${base}startLocation">${CITY_PLACES.map(p=>`<option value="${p.id}" ${r.startLocation===p.id?'selected':''}>${p.name}</option>`).join('')}</select></label>${field(base+'maxHealth','도시 최대 체력',r.maxHealth,10,100)}${field(base+'regenPerMinute','분당 자동 회복',r.regenPerMinute,0,100)}${field(base+'defeatDamage','승리 시 상대 도시 피해',r.defeatDamage,1,100)}${field(base+'attackCooldownMs','공격·체포 대기 (초)',r.attackCooldownMs,1000,3600000,1000)}${field(base+'wantedPerAttack','선제공격 시 수배 증가',r.wantedPerAttack,0,5)}${check(base+'attackEnabled','일반 공격 사용',r.attackEnabled)}</div>
      ${selected==='POLICE'?`<div class="city-cms-special"><h4>경찰 · 검문과 체포</h4><div class="city-cms-grid">${check(base+'inspectEnabled','검문 사용',r.inspectEnabled)}${field(base+'inspectCooldownMs','검문 대기 (초)',r.inspectCooldownMs,1000,3600000,1000)}${check(base+'arrestEnabled','체포 사용',r.arrestEnabled)}${field(base+'arrestMinWanted','체포 최소 수배 단계',r.arrestMinWanted,1,5)}${field(base+'arrestMs','체포 성공 시 구금 (초)',r.arrestMs,1000,3600000,1000)}</div></div>`:['NURSE','DOCTOR'].includes(selected)?`<div class="city-cms-special"><h4>${meta.name} · 치료</h4><div class="city-cms-grid">${field(base+'healAmount','치료 회복량 · 0이면 사용 안 함',r.healAmount,0,100)}${field(base+'healCooldownMs','치료 대기 (초)',r.healCooldownMs,1000,3600000,1000)}${check(base+'selfHeal','자기 치료 허용 · 보상 제외',r.selfHeal)}</div></div>`:''}<div class="city-cms-summary" data-role-summary>${esc(cityRoleDescription(r))}</div></section>`;
  }
  function rewardSettings(){
    const i=policy.roles.findIndex(r=>r.code===selected),r=policy.roles[i];
    return `<section><div class="city-cms-section-title"><span>01</span><div><h3>보상 지급 기준</h3><p>코인과 아이템을 함께 지급할 수 있습니다. TEST에서는 결과만 표시하고 실제 계정에는 지급하지 않습니다.</p></div></div><div class="city-cms-grid">${check('rewards.enabled','보상 사용 · TEST는 미리보기',policy.rewards.enabled)}${field('rewards.dailyLimit','계정당 일일 보상 횟수 · 0이면 지급 안 함',policy.rewards.dailyLimit,0,1000)}${field('rewards.sameTargetCooldownMs','같은 상대 보상 대기 (초)',policy.rewards.sameTargetCooldownMs,0,86400000,1000)}</div><p>매일 00시 KST 초기화 · 7역할과 모든 보상 조건이 횟수를 공유합니다. 자기 치료는 보상에서 제외합니다.</p></section>${roleNav()}<section><h3>${CITY_ROLES[i].name} · 조건별 보상</h3><div class="city-cms-reward-events">${r.rewards.map((reward,j)=>{const base=`roles.${i}.rewards.${j}`;return `<article><header><h4>${CITY_REWARD_EVENTS[reward.event]}</h4><span>${reward.items.length} / 5종</span></header>${field(base+'.coin','코인',reward.coin,0,100000000)}<div class="city-cms-reward-items">${reward.items.map((item,k)=>`<div><label>아이템<select data-path="${base}.items.${k}.code"><option value="${esc(item.code)}">${esc(catalog.find(x=>x.code===item.code)?.name||'현재 목록에서 확인되지 않는 아이템')}</option>${catalog.filter(x=>x.code!==item.code).map(x=>`<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('')}</select></label>${field(base+`.items.${k}.quantity`,'수량',item.quantity,1,1000000)}<button type="button" data-remove-item="${j}:${k}" aria-label="보상 아이템 제외">제외</button></div>`).join('')}</div><button type="button" data-add-item="${j}" ${reward.items.length>=5||!catalog.length?'disabled':''}>＋ 아이템 추가</button></article>`;}).join('')}</div></section>`;
  }
  function draw(){
    if(destroyed||!policy)return;
    form.innerHTML=`<header class="city-cms-heading"><div><small>JOKGAK CITY / CONTROL ROOM</small><h2>족각도시</h2><p>운영 · 역할 · 보상 설정</p></div><div><span class="city-cms-mode">${policy.mode}</span><small>설정 r${policy.revision}</small><button type="button" data-reload>새로 불러오기</button></div></header><nav class="city-cms-tabs" aria-label="족각도시 설정 구분">${[['operation','운영·참여자'],['roles','역할 설정'],['rewards','보상 설정']].map(([id,name])=>`<button type="button" data-tab="${id}" aria-pressed="${id===tab}">${name}</button>`).join('')}</nav><div class="city-cms-content">${tab==='operation'?operation():tab==='roles'?roleSettings():rewardSettings()}</div><footer class="city-cms-save"><div><b data-dirty>${dirty?'저장하지 않은 변경사항':'저장된 설정'}</b><small>배정 비중은 다음 교대, 나머지는 다음 행동부터 적용</small></div><button type="submit">설정 저장</button></footer>`;
  }
  async function load(){
    if(busy)return;setBusy(true);notice('족각도시 운영 설정을 불러오고 있습니다.');
    try{const data=await request('admin/jokgak-city');if(destroyed)return;policy=data.policy;catalog=data.catalog;testUsers=new Map(data.testUsers.map(u=>[u.id,u]));results=[];dirty=false;draw();notice('저장된 '+policy.mode+' 설정을 불러왔습니다.');}catch(error){if(!destroyed)notice(error.message,true);}finally{setBusy(false);}
  }
  form.addEventListener('input',()=>{dirty=true;form.querySelector('[data-dirty]').textContent='저장하지 않은 변경사항';const next=collect(),total=next.roles.reduce((n,r)=>n+r.weight,0);form.querySelectorAll('[data-role-odds]').forEach(node=>node.textContent=(total?next.roles[Number(node.dataset.roleOdds)].weight/total*100:0).toFixed(1)+'%');const summary=form.querySelector('[data-role-summary]');if(summary)summary.textContent=cityRoleDescription(next.roles.find(r=>r.code===selected));});
  form.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||busy)return;
    if(b.dataset.tab||b.dataset.role){policy=collect();if(b.dataset.tab)tab=b.dataset.tab;if(b.dataset.role)selected=b.dataset.role;draw();return;}
    if(b.hasAttribute('data-reload')){void load();return;}
    if(b.hasAttribute('data-user-search')){
      const query=form.querySelector('[data-user-query]').value.trim();if(!query){notice('정확한 닉네임 또는 계정번호를 입력하세요.',true);return;}policy=collect();setBusy(true);
      try{const data=await request('admin/jokgak-city/test-users?q='+encodeURIComponent(query));if(destroyed)return;results=data.users;draw();notice(results.length?'검색 결과에서 참여자를 추가한 뒤 저장하세요.':'일치하는 계정이 없습니다.');}catch(e){notice(e.message,true);}finally{setBusy(false);}return;
    }
    if(b.dataset.userAdd){const user=results.find(u=>u.id===Number(b.dataset.userAdd));if(!user||policy.testUserIds.includes(user.id)||policy.testUserIds.length>=100)return;policy=collect();policy.testUserIds.push(user.id);testUsers.set(user.id,user);}
    else if(b.dataset.userRemove){policy=collect();policy.testUserIds=policy.testUserIds.filter(id=>id!==Number(b.dataset.userRemove));}
    else if(b.hasAttribute('data-add-item')){policy=collect();const reward=policy.roles.find(r=>r.code===selected).rewards[Number(b.dataset.addItem)],item=catalog.find(item=>!reward.items.some(i=>i.code===item.code));if(!item||reward.items.length>=5)return;reward.items.push({code:item.code,quantity:1});}
    else if(b.dataset.removeItem){policy=collect();const [j,k]=b.dataset.removeItem.split(':').map(Number);policy.roles.find(r=>r.code===selected).rewards[j].items.splice(k,1);}
    else return;
    dirty=true;draw();
  });
  form.addEventListener('keydown',event=>{if(event.target.matches('[data-user-query]')&&event.key==='Enter'){event.preventDefault();form.querySelector('[data-user-search]').click();}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!policy)return;
    let next;try{next=validateCitySettings(collect());}catch(e){notice(e.message,true);return;}
    setBusy(true);notice('설정을 저장하고 있습니다.');
    try{const data=await request('admin/jokgak-city',{method:'PATCH',body:{policy:next}});if(destroyed)return;policy=data.policy;dirty=false;draw();notice('저장 완료 · '+policy.mode+' · r'+policy.revision+(policy.mode==='TEST'?' · 실제 보상 미지급':''));}catch(e){notice(e.message,true);}finally{setBusy(false);}
  });
  void load();return ()=>{destroyed=true;controller.abort();root.replaceChildren();};
}
function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),badge=document.getElementById('roleBadge');if(!nav||!cms||!badge)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='족각도시';button.dataset.view='jokgak-city';button.hidden=true;panel.id='view-jokgak-city';panel.className='view city-cms';panel.hidden=true;nav.append(button);cms.append(panel);let dispose;
  const open=()=>{if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='족각도시 · 운영 설정';if(!dispose)dispose=mountCityCms(panel);};
  button.addEventListener('click',event=>{event.stopImmediatePropagation();open();},true);
  const access=()=>{button.hidden=badge.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;dispose?.();dispose=null;}else if(location.hash==='#jokgak-city')open();};
  new MutationObserver(access).observe(badge,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
