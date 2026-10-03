import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountPetOpeningCms(root){
  root.classList.add('pet-opening-cms');let state=null,busy=false;
  root.innerHTML='<header class="poc-head"><div><small>COMPANION SANCTUM / OWNER</small><h2>펫 봉인구 · 개봉 운영</h2><p>정수 비용과 획득 풀을 관리하고 개봉 성소를 직접 검수하세요.</p></div><a href="/pets/opening/?review=1" target="_blank">개봉 성소 검수 ↗</a></header><p data-note role="status">설정을 불러오고 있습니다.</p><form hidden></form>';
  const form=root.querySelector('form'),note=text=>root.querySelector('[data-note]').textContent=text;
  const lock=value=>{busy=value;root.querySelectorAll('button,input').forEach(el=>el.disabled=value);};
  function draw(){
    const s=state.settings;form.hidden=false;
    form.innerHTML='<section class="poc-items"><article><img src="/assets/items/pet-opening-v1/pet-seal-orb.webp" alt="펫 봉인구"><div><small>SEALED COMPANION</small><h3>펫 봉인구</h3><p>봉인구 1개 → 추첨 1회<br>펫 또는 꽝 · 일괄 개봉</p></div></article><article><img src="/assets/items/pet-opening-v1/pet-essence.webp" alt="펫 정수"><div><small>LIFE ESSENCE</small><h3>펫 정수</h3><p>리치왕 클리어로 획득<br>꽝에서도 개봉 비용 소모</p></div></article></section>'+
      '<fieldset class="poc-settings"><legend>개봉 설정</legend><label>봉인구 1개당 정수<input name="essencePerOpen" type="number" min="1" max="1000000" step="1" required value="'+s.essencePerOpen+'"></label><label>1회 최대 개봉 수량<input name="maxBatch" type="number" min="1" max="1000" step="1" required value="'+s.maxBatch+'"></label><label class="poc-switch"><input name="enabled" type="checkbox" '+(s.enabled?'checked':'')+'> 실제 개봉 허용</label></fieldset>'+
      '<section class="poc-pool"><h3>획득 풀 · 꽝 확률</h3><p>선택한 펫과 꽝의 가중치를 합쳐 확률을 계산합니다. 꽝 가중치가 0이면 꽝은 나오지 않습니다.</p><div class="poc-roster">'+state.catalog.map(p=>{const row=s.pool.find(r=>r.code===p.code);return '<label class="poc-pet"><input type="checkbox" data-pool="'+p.code+'" '+(row?'checked':'')+'><img src="/'+esc(p.sourceArt.replace(/^\//,''))+'" alt=""><span><b>'+esc(p.name)+'</b><small>'+esc(p.code)+'</small></span><input type="number" aria-label="'+esc(p.name)+' 가중치" data-weight="'+p.code+'" min="1" max="1000000" step="1" value="'+(row?.weight||1)+'"><strong data-rate="'+p.code+'">—</strong></label>';}).join('')+'<label class="poc-pet poc-blank"><i class="poc-blank-mark" aria-hidden="true">∅</i><span><b>꽝</b><small>펫 지급 없음 · 비용은 소모</small></span><input name="blankWeight" type="number" aria-label="꽝 가중치" min="0" max="1000000" step="1" required value="'+s.blankWeight+'"><strong data-blank-rate>—</strong></label></div></section>'+
      '<div class="poc-note"><b>리치왕 지급 수량</b><p>리치왕 정벌 CMS에서 별도로 수정합니다. 기본 5개 · ON 공대 최종 클리어 시 참가자별 1회 지급 · TEST 지급 없음.</p><button type="button" data-raid>리치왕 정벌 설정</button><button type="button" data-grant>아이템 지급 · 유저관리</button></div>'+
      '<p class="poc-policy">펫 전투 편성·버프 활성화는 별도 준비 상태를 유지합니다. 중복 펫은 삭제하거나 다른 재화로 바꾸지 않고 보유 수량으로 누적합니다.</p><footer><button type="button" data-reload>다시 불러오기</button><button type="submit">개봉 설정 저장</button></footer>';
    rates();
  }
  function rates(){
    const selected=[...form.querySelectorAll('[data-pool]:checked')],blankWeight=Number(form.elements.blankWeight.value)||0,total=selected.reduce((n,p)=>n+(Number(form.querySelector('[data-weight="'+p.dataset.pool+'"]').value)||0),blankWeight);
    form.querySelectorAll('[data-rate]').forEach(el=>{const checked=selected.some(p=>p.dataset.pool===el.dataset.rate),weight=Number(form.querySelector('[data-weight="'+el.dataset.rate+'"]').value);el.textContent=checked&&total?(weight/total*100).toLocaleString('ko-KR',{maximumFractionDigits:4})+'%':'제외';});
    form.querySelector('[data-blank-rate]').textContent=total?(blankWeight/total*100).toLocaleString('ko-KR',{maximumFractionDigits:4})+'%':'0%';
  }
  async function load(){if(busy)return;lock(true);try{state=await api('admin/pets/opening');draw();note('저장된 설정 · 개봉 '+(state.settings.enabled?'ON':'OFF')+' · 버전 '+state.settings.revision);}catch(e){note(e.message);}finally{lock(false);}}
  form.oninput=rates;
  form.onclick=event=>{if(busy)return;if(event.target.closest('[data-reload]'))void load();if(event.target.closest('[data-raid]'))document.querySelector('#nav [data-view="raid"]')?.click();if(event.target.closest('[data-grant]'))document.querySelector('#nav [data-view="users"]')?.click();};
  form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const data=new FormData(form),settings={revision:state.settings.revision,enabled:data.has('enabled'),essencePerOpen:Number(data.get('essencePerOpen')),maxBatch:Number(data.get('maxBatch')),blankWeight:Number(data.get('blankWeight')),pool:[...form.querySelectorAll('[data-pool]:checked')].map(p=>({code:p.dataset.pool,weight:Number(form.querySelector('[data-weight="'+p.dataset.pool+'"]').value)}))};if(settings.enabled&&!settings.pool.length){note('실제 개봉을 허용하려면 획득 풀을 선택하세요.');return;}lock(true);note('저장 중입니다.');try{state=await api('admin/pets/opening',{method:'POST',body:{settings}});draw();note('저장 완료 · 개봉 '+(state.settings.enabled?'ON':'OFF')+' · 정수 '+state.settings.essencePerOpen+'개 / 봉인구');}catch(e){note(e.message);}finally{lock(false);}};
  void load();
}
function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.textContent='펫 개봉·아이템';button.dataset.view='pet-opening';button.hidden=true;panel.className='view';panel.id='view-pet-opening';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=false;
  button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='펫 개봉·아이템';if(!mounted){mountPetOpeningCms(panel);mounted=true;}},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden)panel.hidden=true;};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
  const addItems=()=>{const select=document.getElementById('inventoryItemCode');for(const [code,name] of [['PET_SEAL_ORB','펫 봉인구'],['PET_ESSENCE','펫 정수']])if(select&&!select.querySelector('option[value="'+code+'"]')){const option=document.createElement('option');option.value=code;option.textContent=name;select.append(option);}};
  const dialog=document.getElementById('userDialog');if(dialog)new MutationObserver(addItems).observe(dialog,{childList:true,subtree:true});addItems();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
