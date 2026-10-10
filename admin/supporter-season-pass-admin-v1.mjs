import {jointAdminRequest} from '../js/joint-account-transport.mjs';
import {passImage} from '../shared/supporter-season-pass-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={INVENTORY_ITEM:'아이템 · 재료',COIN:'코인',CARD_SHARDS:'카드 조각',MAGIC_CRYSTAL:'마법 결정',EQUIPMENT:'장비',VEHICLE:'이동수단',CARD:'카드'};
export function mountPassAdmin(root,{request=jointAdminRequest,initial}={}){
  let state=initial,draft=null,day=1,busy=false,disposed=false,pending=null,search='',type='',dirty=false;
  const storageKey='cnine_season_pass_admin_pending_v1:1';
  try{pending=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
  const clean=config=>({title:config.title,enabled:config.enabled,days:config.days.map(d=>({day:d.day,rewards:d.rewards.map(r=>({code:r.code,quantity:r.quantity}))}))});
  const $=s=>root.querySelector(s);
  function status(text,error=false){const el=$('[data-pass-admin-status]');if(el){el.textContent=text;el.classList.toggle('is-error',error);}}
  function markDirty(){dirty=true;const el=$('.sp-admin-footer p');if(el)el.textContent='아직 저장하지 않은 변경 사항이 있습니다.';}
  function picker(){
    const list=state.catalog.filter(x=>(!type||x.type===type)&&(!search||(x.name+' '+x.ref).toLowerCase().includes(search.toLowerCase())));
    $('[data-pass-item]').innerHTML=list.map(x=>`<option value="${esc(x.code)}" ${x.available?'':'disabled'}>${esc(x.name)} · ${esc(x.ref||types[x.type])}${x.available?'':' · '+esc(x.unavailableReason)}</option>`).join('')||'<option value="">검색 결과 없음</option>';
    $('[data-pass-catalog-count]').textContent=`${list.length}종 / 전체 ${state.catalog.length}종 · 새 아이템은 목록을 새로 불러오면 표시됩니다.`;
  }
  function render(){
    if(disposed||!state||!draft)return;
    const byCode=new Map(state.catalog.map(x=>[x.code,x])),row=draft.days[day-1],filled=draft.days.filter(d=>d.rewards.length).length;
    root.innerHTML=`<div class="sp-admin"><header><small>후원 운영 · 30일 보상 관리</small><h2>시즌패스 보상표</h2><p>후원 적용일부터 30일, 한국시간 자정마다 당일 보상만 수령합니다. 날짜별 아이템과 수량을 등록하세요.</p><span class="sp-admin-state">현재 운영: ${state.config.enabled?'ON':'OFF'} · 저장 버전 ${state.config.revision}</span></header><div class="sp-admin-toolbar"><label>패스 이름 <input type="text" maxlength="40" data-pass-title value="${esc(draft.title)}"></label><label><input type="checkbox" data-pass-enabled ${draft.enabled?'checked':''}> 저장 시 시즌패스 ON</label><strong>${filled} / 30일 등록</strong></div><div class="sp-admin-workspace"><section><h3>편집할 날짜 선택</h3><div class="sp-admin-days">${draft.days.map(d=>`<button type="button" data-pass-edit-day="${d.day}" class="${d.rewards.length?'has-items':''}" aria-pressed="${d.day===day}"><b>${String(d.day).padStart(2,'0')}</b><small>${d.rewards.length?d.rewards.length+'종':'미등록'}</small></button>`).join('')}</div><p>보상표를 저장해도 후원 시작일과 기존 수령 기록은 초기화되지 않습니다. 이미 받은 날짜에는 당시 지급 내역이 표시됩니다.</p></section><section class="sp-admin-editor"><h3>${day}일차 선물 <small>· ${row.rewards.length} / 12종</small></h3><div>${row.rewards.map((r,i)=>{const item=byCode.get(r.code);return `<div class="sp-admin-reward">${passImage(item?.image)?`<img src="${esc(passImage(item.image))}" alt="">`:'<span>✦</span>'}<div><b>${esc(item?.name||r.code)}</b><small>${esc(types[item?.type]||'목록에서 제외된 항목')}${item?.type==='VEHICLE'?' · 중복 보유 유지':''}</small></div><input type="number" min="1" max="${item?.maxQuantity||1000000}" step="1" value="${r.quantity}" data-pass-quantity="${i}" aria-label="${esc(item?.name||r.code)} 수량"><button type="button" class="sp-remove" data-pass-remove="${i}" aria-label="${esc(item?.name||r.code)} 삭제">×</button></div>`;}).join('')||'<p>지급할 아이템을 아래에서 추가하세요.</p>'}</div><div class="sp-admin-search"><select data-pass-type aria-label="아이템 종류"><option value="">전체 종류</option>${Object.entries(types).map(([id,label])=>`<option value="${id}" ${type===id?'selected':''}>${label}</option>`).join('')}</select><input type="search" data-pass-search placeholder="아이템 이름 또는 코드 검색" aria-label="아이템 검색" value="${esc(search)}"></div><div class="sp-admin-picker"><select data-pass-item aria-label="추가할 보상"></select><button type="button" data-pass-add>추가</button></div><p data-pass-catalog-count></p><div class="sp-admin-copy"><span>이 날짜의 구성을 복사</span><input type="number" data-pass-copy-from aria-label="복사 시작일" min="1" max="30" value="1"><span>~</span><input type="number" data-pass-copy-to aria-label="복사 종료일" min="1" max="30" value="30"><button type="button" data-pass-copy>범위에 복사</button></div><p>기존 지급 제한은 유지합니다. 종료된 아이템·승인된 게임 드롭 전용 보상은 선택할 수 없습니다.</p></section></div><div class="sp-admin-footer"><p>${pending?'저장 결과 확인이 필요합니다. 같은 요청으로 다시 확인하세요.':dirty?'아직 저장하지 않은 변경 사항이 있습니다.':'현재 저장된 보상표입니다.'}</p><button type="button" data-pass-reload>목록 새로 불러오기</button><button type="button" data-pass-save>${pending?'이전 저장 결과 확인':busy?'저장 중…':'보상표 저장'}</button></div><p class="sp-status" data-pass-admin-status role="status" aria-live="polite"></p></div>`;
    picker();root.querySelectorAll('input,select,button').forEach(el=>el.disabled=busy||!!pending&&!el.hasAttribute('data-pass-save'));
  }
  async function load(){
    if(busy||pending&&state||disposed)return;
    busy=true;render();let error=null;
    try{state=await request('admin/server-support/pass');if(disposed)return;draft=pending?structuredClone(pending.document):clean(state.config);dirty=false;}
    catch(e){error=e;}
    finally{busy=false;if(!disposed){if(state)render();else root.innerHTML='<p class="sp-status is-error" data-pass-admin-status role="status"></p><button type="button" data-pass-reload>다시 불러오기</button>';if(error)status(error.message,true);}}
  }
  async function save(){
    if(busy||disposed)return;
    if(!pending){if(!draft.title.trim()){status('패스 이름을 입력하세요.',true);return;}if(!Array.from(root.querySelectorAll('input')).every(x=>x.reportValidity()))return;
      pending={expectedRevision:state.config.revision,requestId:crypto.randomUUID(),document:structuredClone(draft)};
      try{localStorage.setItem(storageKey,JSON.stringify(pending));}catch{pending=null;status('저장 요청을 보관하지 못했습니다.',true);return;}}
    busy=true;render();
    try{const result=await request('admin/server-support/pass',{method:'POST',body:pending});if(disposed)return;localStorage.removeItem(storageKey);pending=null;state.config=result.config;draft=clean(result.config);dirty=false;busy=false;render();status(`30일 보상표 저장 완료 · ${result.config.enabled?'ON':'OFF'}${result.replayed?' · 이전 저장 확인':''}`);}
    catch(e){if(disposed)return;if(!e.retryable&&e.status&&e.status<500&&![408,429].includes(e.status)){localStorage.removeItem(storageKey);pending=null;}busy=false;render();status(e.message,true);}finally{busy=false;}
  }
  const click=e=>{
    const b=e.target.closest('button');if(!b||b.disabled||busy||pending&&!b.hasAttribute('data-pass-save'))return;
    if(b.dataset.passEditDay){day=Number(b.dataset.passEditDay);render();}
    if(b.hasAttribute('data-pass-add')){const code=$('[data-pass-item]').value,item=state.catalog.find(x=>x.code===code),items=draft.days[day-1].rewards;if(!item?.available)return;if(items.some(x=>x.code===code)){status('이미 추가한 아이템입니다. 수량을 변경하세요.',true);return;}if(items.length>=12){status('하루 최대 12종까지 등록할 수 있습니다.',true);return;}items.push({code,quantity:1});dirty=true;render();}
    if(b.hasAttribute('data-pass-remove')){draft.days[day-1].rewards.splice(Number(b.dataset.passRemove),1);dirty=true;render();}
    if(b.hasAttribute('data-pass-copy')){const from=Number($('[data-pass-copy-from]').value),to=Number($('[data-pass-copy-to]').value);if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>30||from>to){status('복사 범위는 1~30일로 입력하세요.',true);return;}const items=structuredClone(draft.days[day-1].rewards);for(let d=from;d<=to;d++)draft.days[d-1].rewards=structuredClone(items);dirty=true;render();status(`${from}~${to}일차에 ${items.length}종을 복사했습니다. 저장하면 반영됩니다.`);}
    if(b.hasAttribute('data-pass-save'))void save();if(b.hasAttribute('data-pass-reload'))void load();
  };
  const input=e=>{if(busy||pending)return;const el=e.target;if(el.hasAttribute('data-pass-title')){draft.title=el.value;markDirty();}if(el.hasAttribute('data-pass-enabled')){draft.enabled=el.checked;markDirty();}if(el.hasAttribute('data-pass-quantity')){draft.days[day-1].rewards[Number(el.dataset.passQuantity)].quantity=Number(el.value);markDirty();}if(el.hasAttribute('data-pass-search')){search=el.value;picker();}if(el.hasAttribute('data-pass-type')){type=el.value;picker();}};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',input);
  if(state){draft=clean(state.config);if(pending)draft=structuredClone(pending.document);render();}else{root.innerHTML='<p>시즌패스 관리 화면을 불러오고 있습니다.</p>';void load();}
  return {dispose(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',input);root.replaceChildren();}};
}
function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms');if(!nav||!cms)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='시즌패스';button.dataset.view='supporter-pass';button.hidden=true;panel.id='view-supporter-pass';panel.className='view';panel.hidden=true;nav.append(button);cms.append(panel);
  let mounted=null,initial=null,epoch=0;
  const sync=async event=>{const turn=++epoch,identity=event?.detail||globalThis.__SOOP_CMS_IDENTITY__;button.hidden=true;panel.hidden=true;mounted?.dispose();mounted=null;if(identity?.role!=='OWNER')return;try{const result=await jointAdminRequest('admin/server-support/pass');if(turn!==epoch||result.adminId!==1)return;initial=result;button.hidden=false;}catch{}};
  button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='시즌패스';mounted||=mountPassAdmin(panel,{initial});},true);
  window.addEventListener('soop:cms-identity',sync);void sync();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
