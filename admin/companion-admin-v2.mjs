import {petBuffIcon} from '../js/pet-buff-fx-v1.mjs?v=20261003';
import {emptyPetDraft,validatePetCmsDocument,petReadiness,PET_BUFF_TYPES,PET_BUFF_TARGETS} from '../shared/pet-cms-v1.mjs?v=20261002-pet-equipment1';
import {withMercenaryDeadline} from '../shared/mercenary-loading-v1.mjs?v=20260925';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const resource=path=>path?'/'+path.replace(/^\//,''):'';
const number=value=>Math.round(Number(value)||0).toLocaleString('ko-KR');
async function request(path,options={}){
  const controller=new AbortController(),token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  try{return await withMercenaryDeadline(async()=>{
    const response=await fetch('/api/admin/'+path,{...options,signal:controller.signal,cache:'no-store',headers:{'content-type':'application/json',authorization:`Bearer ${token}`}});
    let body;try{body=await response.json();}catch{throw Error('서버 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');}
    if(!response.ok)throw Object.assign(Error(body.error||'요청을 확인하지 못했습니다.'),{status:response.status,code:body.code});
    return body;
  },{timeoutMs:20000,message:'응답 확인이 지연됩니다. 같은 저장 요청으로 결과를 재확인해 주세요.'});}finally{controller.abort();}
}

export function mountCompanionCms(root){
  root.classList.add('companion-cms');
  root.innerHTML=`<header class="cp-head"><div><p class="cp-kicker">PROJECT V / COMPANION SYSTEMS</p><h2>전투를 여는 동료들</h2><p>서로 다른 등급의 용병 두 명, 전투 시작을 지원하는 펫 한 마리.</p></div><span class="cp-release">준비 모드<span>공개 · 획득 OFF</span></span></header>
    <div class="cp-contract"><span><b>05</b> 일반 카드</span><i>+</i><span><b>02</b> 용병 <small>등급별 1명</small></span><i>+</i><span><b>01</b> 펫 <small>시작 버프</small></span></div>
    <div class="cp-workspace"><section class="cp-review"><div class="cp-section-head"><h3>출전 편성</h3><span>OWNER 검수</span></div>
      <div class="cp-selectors"><label>용병 1<select data-merc="0" aria-label="용병 1"></select></label><label>용병 2<select data-merc="1" aria-label="용병 2"></select></label><label class="cp-pet-select">시작 지원 펫<select data-review-pet aria-label="시작 지원 펫"></select></label></div>
      <div class="cp-arena" aria-label="편성 SD 프리뷰"><div class="cp-arena-grid"></div><div class="cp-mercenaries"></div><div class="cp-regulars">${['공격','방어','속도','생명','균형'].map((type,i)=>`<div data-target="A:${i}"><b>${String(i+1).padStart(2,'0')}</b><span>${type}</span></div>`).join('')}</div><div class="cp-pet-dock"></div><div class="cp-opening" hidden></div></div>
      <div class="cp-review-controls"><label>전투 모드<select data-mode><option value="PVE">PvE</option><option value="PVP">PvP</option></select></label><label>검수 시드<input data-seed type="number" value="17" min="0" max="4294967295" step="1"></label><button type="button" data-run class="cp-primary">시작 버프 검수</button></div>
      <p class="cp-review-note">저장된 CMS 설정으로 검수합니다. 일반 카드 5장은 검수용이며 계정 재화·보상을 사용하지 않습니다.</p><div class="cp-result" aria-live="polite"></div></section>
    <section class="cp-editor"><div class="cp-section-head"><h3>펫 설정</h3><a class="cp-equipment-link" href="/pets/?review=1">펫 장착창 검수 →</a><button type="button" data-add>+ 펫 추가</button></div><div class="cp-art-picker"></div><div class="cp-roster"></div><div class="cp-fields"></div></section></div>
    <footer class="cp-footer"><p data-status role="status">CMS 설정을 불러오는 중입니다.</p><div><button type="button" data-export>편집본 내려받기</button><button type="button" data-reload>다시 불러오기</button><button type="button" data-save class="cp-primary">CMS 저장</button></div></footer>`;
  const $=selector=>root.querySelector(selector);
  let state=null,draft=null,selected=null,dirty=false,busy=false,pending=null,disposed=false,timer=null,runSerial=0;
  const choices=['',''];let chosenPet='';
  const pet=()=>draft?.pets.find(row=>row.code===selected);
  const status=(message,error=false)=>{$('[data-status]').textContent=message;$('[data-status]').classList.toggle('cp-error',error);};
  function syncButtons(){
    root.querySelectorAll('button,input,select,textarea').forEach(element=>element.disabled=busy||!draft&&!element.matches('[data-reload]')||Boolean(pending)&&!element.matches('[data-save],[data-export]'));
    $('[data-save]').disabled=busy||!draft||!dirty&&!pending;
    $('[data-save]').textContent=pending?'저장 결과 재확인':'CMS 저장';
    $('[data-run]').disabled=busy||!state||dirty||Boolean(pending);
    $('[data-export]').disabled=!draft;
    root.querySelectorAll('[data-add-buff]').forEach(button=>button.disabled=busy||Boolean(pending)||!pet()||pet().buffs.length>=5);
    root.querySelectorAll('[data-remove-buff]').forEach(button=>button.disabled=busy||Boolean(pending)||!pet()||pet().buffs.length<=1);
    updateSelects();
  }
  function updateSelects(){
    if(!state)return;
    root.querySelectorAll('[data-merc]').forEach(select=>{
      const slot=Number(select.dataset.merc),other=state.mercenaries.find(row=>row.code===choices[1-slot]);
      select.innerHTML='<option value="">빈 슬롯</option>'+state.mercenaries.map(row=>`<option value="${esc(row.code)}" ${row.code===choices[slot]?'selected':''} ${other?.rank===row.rank?'disabled':''}>${esc(row.rank)} · ${esc(row.name)}</option>`).join('');
    });
    if(!draft.pets.some(row=>row.code===chosenPet))chosenPet='';
    $('[data-review-pet]').innerHTML='<option value="">펫 없이 편성</option>'+draft.pets.map(row=>`<option value="${esc(row.code)}" ${row.code===chosenPet?'selected':''}>${esc(row.name)} · ${esc(row.code)}</option>`).join('');
  }
  function stage(){
    if(!state)return;
    $('.cp-mercenaries').innerHTML=choices.map((code,index)=>{
      const row=state.mercenaries.find(row=>row.code===code);
      return `<div class="cp-merc-dock" data-code="${esc(code)}"><span class="cp-slot">용병 ${index+1}</span>${row?.battleSprite?`<img src="${esc(resource(row.battleSprite))}" alt="${esc(row.name)} 전투 SD">`:'<span class="cp-empty-sigil">◇</span>'}<p>${row?`<b>${esc(row.rank)}</b> ${esc(row.name)}`:'빈 슬롯'}</p></div>`;
    }).join('');
    const row=draft.pets.find(row=>row.code===chosenPet);
    $('.cp-pet-dock').innerHTML=`${row?.battleSprite?`<img src="${esc(resource(row.battleSprite))}" alt="${esc(row.name)} 펫 SD">`:'<span class="cp-pet-mark">✧</span>'}<div><small>OPENING SUPPORT</small><b>${esc(row?.name||'시작 지원 펫')}</b><span>${row?'전투 시작 시 1회 등장':'펫을 선택해 주세요'}</span></div>`;
    root.querySelectorAll('.cp-arena img').forEach(image=>image.addEventListener('error',()=>{image.hidden=true;const label=document.createElement('span');label.className='cp-resource-error';label.textContent='SD 경로 확인 필요';image.after(label);},{once:true}));
    $('.cp-arena').classList.remove('cp-buffed');
  }
  function editor(){
    if(!draft)return;
    $('.cp-art-picker').innerHTML=state?.artCatalog?.length?`<label>펫 일러스트<select data-art-preset><option value="">${state.artCatalog.length}종 일러스트 확인 · 선택</option>${state.artCatalog.map(art=>`<option value="${esc(art.code)}" ${draft.pets.some(row=>row.code===art.code)?'disabled':''}>${esc(art.name)} · ${esc(art.animal)} · ${art.artStatus==='SOURCE_ART_APPROVED'?'원화 승인':'검수 대기'}</option>`).join('')}</select></label><button type="button" data-register-art>펫 초안 추가</button>`:'';
    $('.cp-roster').innerHTML=`<label>등록된 펫<select data-pet-list><option value="">펫 선택</option>${draft.pets.map(row=>`<option value="${esc(row.code)}" ${row.code===selected?'selected':''}>${esc(row.name)} · ${esc(row.code)}</option>`).join('')}</select></label><span>${draft.pets.length} / 100</span>`;
    const row=pet();
    if(!row){$('.cp-fields').innerHTML='<div class="cp-empty"><span>✧</span><h4>첫 번째 동료를 등록하세요</h4><p>SD 리소스와 시작 버프를 펫마다 설정할 수 있습니다.<br>수치가 미정인 펫은 검수 전투에 사용되지 않습니다.</p><button type="button" data-add>펫 추가</button></div>';return;}
    let ready;try{ready=petReadiness(row,$('[data-mode]').value);}catch(error){ready={ok:false,reasons:[error.message]};}
    $('.cp-fields').innerHTML=`<div class="cp-pet-heading"><div><small>${esc(row.code)}</small><h4>${esc(row.name)}</h4></div><button type="button" data-delete class="cp-delete">펫 삭제</button></div>
      <div class="cp-field-grid"><label>이름<input data-field="name" maxlength="40" value="${esc(row.name)}"></label><label class="cp-switch"><input data-field="enabled" type="checkbox" ${row.enabled?'checked':''}> 검수에 사용</label><label class="cp-wide">장착창 일러스트 경로<input data-field="sourceArt" value="${esc(row.sourceArt||'')}" placeholder="assets/ui/pets/파일명.png"></label><label class="cp-wide">전투 SD 경로<input data-field="battleSprite" value="${esc(row.battleSprite)}" placeholder="assets/ui/pets/파일명.png"><small>PNG · WebP / 투명 배경 SD 리소스</small></label><label>버프 적용 대상<select data-field="target">${Object.entries(PET_BUFF_TARGETS).map(([key,label])=>`<option value="${key}" ${key===row.target?'selected':''}>${label}</option>`).join('')}</select></label><div class="cp-mode-field"><span>적용 모드</span>${['PVE','PVP'].map(mode=>`<label><input data-pet-mode="${mode}" type="checkbox" ${row.modes.includes(mode)?'checked':''}> ${mode==='PVE'?'PvE':'PvP'}</label>`).join('')}</div></div>
      <div class="cp-buff-head"><h4>전투 시작 버프</h4><a class="cp-buff-resource-link" href="/preview/pet-buffs-v1/" target="_blank" rel="noopener">버프 리소스 보기 ↗</a><button type="button" data-add-buff ${row.buffs.length>=5?'disabled':''}>+ 버프 추가</button></div><p class="cp-helper">전투 시작에 한 번 적용합니다. 능력치 증가는 해당 전투 동안 유지되고, 보호막은 피해를 흡수하면 소모됩니다.</p>
      <div class="cp-buffs">${row.buffs.map((buff,index)=>`<div class="cp-buff-row"><label><span class="cp-buff-label">${petBuffIcon(buff.type)}버프 종류</span><select data-buff-type="${index}">${Object.entries(PET_BUFF_TYPES).map(([key,label])=>`<option value="${key}" ${key===buff.type?'selected':''} ${row.buffs.some((other,i)=>i!==index&&other.type===key)?'disabled':''}>${label}</option>`).join('')}</select></label><label>증가율 <span class="cp-percent"><input data-buff-percent="${index}" type="number" min="0" max="1000" step="any" placeholder="미정" value="${buff.percent??''}"><i>%</i></span></label><button type="button" data-remove-buff="${index}" aria-label="버프 ${index+1} 삭제" ${row.buffs.length<=1?'disabled':''}>×</button></div>`).join('')}</div>
      <label class="cp-notes">운영 메모<textarea data-field="notes" maxlength="1200" rows="2">${esc(row.notes)}</textarea></label><p class="cp-readiness ${ready.ok?'cp-ready':''}">${ready.ok?'SD · 버프 설정 완료 / 저장 후 검수 가능':esc(ready.reasons.join(' '))}</p>`;
  }
  function changed(){dirty=true;pending=null;status('편집 중입니다. CMS 저장 후 편성·시작 버프를 검수해 주세요.');syncButtons();}
  async function load(){
    busy=true;syncButtons();status('CMS 설정을 불러오는 중입니다.');
    try{const loaded=await request('companions/preparation');if(disposed)return;validatePetCmsDocument(loaded.document);state=loaded;draft=structuredClone(loaded.document);dirty=false;pending=null;selected=draft.pets.some(row=>row.code===selected)?selected:draft.pets[0]?.code||null;for(let i=0;i<2;i++)if(!state.mercenaries.some(row=>row.code===choices[i]))choices[i]='';editor();stage();status(`CMS 버전 ${state.revision} · 공개·획득·실전 반영 OFF`);}
    catch(error){if(!disposed)status(error.message,true);}finally{if(!disposed){busy=false;syncButtons();}}
  }
  async function save(){
    try{if(!pending)pending={document:validatePetCmsDocument(draft),expectedRevision:state.revision,requestId:crypto.randomUUID()};}catch(error){status(error.message,true);return;}
    busy=true;syncButtons();status('CMS 설정을 저장하고 있습니다.');
    try{const saved=await request('pets',{method:'PATCH',body:JSON.stringify(pending)});if(disposed)return;validatePetCmsDocument(saved.document);state={...state,...saved};draft=structuredClone(saved.document);pending=null;dirty=false;editor();stage();status(`CMS 버전 ${saved.revision} 저장 완료. 공개·획득·실전 반영 OFF`);}
    catch(error){if(!disposed){if(error.status&&error.status<500)pending=null;status(error.message,true);}}finally{if(!disposed){busy=false;syncButtons();}}
  }
  async function run(){
    const serial=++runSerial;busy=true;syncButtons();$('.cp-result').replaceChildren();$('.cp-arena').classList.remove('cp-buffed');status('서버에서 편성과 시작 버프를 검수하고 있습니다.');
    try{
      const data=await request('companions/preparation/preview',{method:'POST',body:JSON.stringify({loadout:{cardIds:state.cards.map(row=>row.id),mercenaryCodes:choices.filter(Boolean),petCode:chosenPet||null},mode:$('[data-mode]').value,seed:Number($('[data-seed]').value),petRevision:state.revision,mercenaryRevision:state.mercenaryRevision})});
      if(disposed||serial!==runSerial)return;
      const battle=data.battle,event=battle.result.timeline.find(row=>row.type==='PET_OPENING_BUFF'&&row.actorSide==='A');
      if(event){
        const opening=$('.cp-opening');opening.innerHTML=`<img src="${esc(resource(event.battleSprite))}" alt="${esc(event.name)} 시작 버프 등장"><b>${esc(event.name)}</b><span>전투 시작 버프</span>`;opening.hidden=false;
        root.querySelectorAll('[data-code]').forEach(element=>element.classList.toggle('cp-target-buffed',event.hits.some(hit=>hit.targetId===`A:MERCENARY:${element.dataset.code}`)));
        root.querySelectorAll('.cp-regulars>div').forEach((element,index)=>element.classList.toggle('cp-target-buffed',event.hits.some(hit=>hit.targetId===battle.teams.A.cards[index]?.id)));
        $('.cp-arena').classList.add('cp-buffed');clearTimeout(timer);timer=setTimeout(()=>{opening.hidden=true;},1800);
      }
      const turns=battle.teams.A.mercenaries.map(row=>({name:row.name,count:battle.result.timeline.filter(turn=>turn.type==='TURN'&&turn.actorId===row.id).length}));
      $('.cp-result').innerHTML=`<div class="cp-result-head"><b>${event?'시작 버프 적용 완료':'펫 없이 편성 검수 완료'}</b><span>${battle.mode} · 시드 ${battle.seed}</span></div><p>${event?`${esc(event.name)} / 1회 / ${event.hits.length}명 적용`:'시작 버프 없음'}${turns.map(row=>`<span>${esc(row.name)} ${row.count}회 행동</span>`).join('')}</p>${event?`<div class="cp-table-wrap"><table><thead><tr><th>적용 대상</th><th>공격력</th><th>최대 HP</th><th>방어력</th><th>속도</th><th>보호막</th></tr></thead><tbody>${event.hits.map(hit=>{const actor=[...battle.teams.A.cards,...battle.teams.A.mercenaries].find(row=>row.id===hit.targetId);return `<tr><th>${esc(actor?.name||actor?.title||'검수 카드')}</th>${['attack','maxHp','defense','speed','shield'].map(key=>`<td><small>${number(hit.before[key])}</small><b>${number(hit.after[key])}</b></td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`:''}`;
      status('편성·시작 버프 검수 완료. 계정 편성이나 재화는 변경되지 않습니다.');
    }catch(error){if(!disposed)status(error.message,true);}finally{if(!disposed){busy=false;syncButtons();}}
  }
  function exportDraft(){const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='pet-cms-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  root.addEventListener('input',event=>{
    const target=event.target,row=pet();if(!row||busy||pending)return;
    if(target.dataset.field&&target.type!=='checkbox'&&target.tagName!=='SELECT'){row[target.dataset.field]=target.value;changed();}
    if(target.hasAttribute('data-buff-percent')){row.buffs[Number(target.dataset.buffPercent)].percent=target.value===''?null:Number(target.value);changed();}
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    if(target.hasAttribute('data-merc')){choices[Number(target.dataset.merc)]=target.value;updateSelects();stage();}
    if(target.hasAttribute('data-review-pet')){chosenPet=target.value;stage();}
    if(target.hasAttribute('data-pet-list')){selected=target.value;editor();syncButtons();}
    if(target.hasAttribute('data-mode')){editor();syncButtons();}
    const row=pet();if(!row||busy||pending)return;
    if(target.dataset.field){row[target.dataset.field]=target.type==='checkbox'?target.checked:target.value;changed();if(target.dataset.field==='target'||target.type==='checkbox'){editor();syncButtons();}stage();}
    if(target.hasAttribute('data-pet-mode')){row.modes=['PVE','PVP'].filter(mode=>mode===target.dataset.petMode?target.checked:row.modes.includes(mode));changed();editor();syncButtons();}
    if(target.hasAttribute('data-buff-type')){row.buffs[Number(target.dataset.buffType)].type=target.value;changed();editor();syncButtons();}
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-add')){let id=1;while(draft.pets.some(row=>row.code===`PET-${String(id).padStart(3,'0')}`))id++;if(draft.pets.length>=100){status('펫은 100마리까지 등록할 수 있습니다.',true);return;}const row=emptyPetDraft(`PET-${String(id).padStart(3,'0')}`);draft.pets.push(row);selected=row.code;changed();editor();syncButtons();}
    if(target.hasAttribute('data-register-art')){const art=state.artCatalog?.find(art=>art.code===$('[data-art-preset]').value);if(!art){status('일러스트를 먼저 선택해 주세요.',true);return;}if(draft.pets.some(row=>row.code===art.code)||draft.pets.length>=100){status('이미 등록했거나 등록 한도를 초과했습니다.',true);return;}draft.pets.push({...emptyPetDraft(art.code),name:art.name,sourceArt:art.sourceArt});selected=art.code;changed();editor();syncButtons();}
    if(target.hasAttribute('data-delete')){draft.pets=draft.pets.filter(row=>row.code!==selected);selected=draft.pets[0]?.code||null;changed();editor();stage();syncButtons();}
    if(target.hasAttribute('data-add-buff')){const row=pet(),type=Object.keys(PET_BUFF_TYPES).find(type=>!row.buffs.some(buff=>buff.type===type));if(type){row.buffs.push({type,percent:null});changed();editor();syncButtons();}}
    if(target.hasAttribute('data-remove-buff')&&pet().buffs.length>1){pet().buffs.splice(Number(target.dataset.removeBuff),1);changed();editor();syncButtons();}
    if(target.hasAttribute('data-save'))void save();
    if(target.hasAttribute('data-reload')&&(!dirty||window.confirm('저장하지 않은 편집 내용을 버리고 다시 불러올까요?')))void load();
    if(target.hasAttribute('data-export'))exportDraft();
    if(target.hasAttribute('data-run'))void run();
  });
  void load();
  return {dispose(){disposed=true;runSerial++;clearTimeout(timer);root.replaceChildren();}};
}

function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='펫·동료 준비';button.dataset.view='companion-preparation';button.hidden=true;panel.className='view';panel.id='view-companion-preparation';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=null;
  button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(view=>view.hidden=view!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='펫·동료 준비';if(!mounted)mounted=mountCompanionCms(panel);},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;mounted?.dispose();mounted=null;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
