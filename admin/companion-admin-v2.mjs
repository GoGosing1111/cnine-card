import {petBuffIcon} from '../js/pet-buff-fx-v1.mjs?v=20261003';
import {emptyPetDraft,validatePetCmsDocument,PET_BUFF_TYPES,PET_BUFF_TARGETS} from '../shared/pet-cms-v1.mjs?v=20261002-pet-equipment1';
import {withMercenaryDeadline} from '../shared/mercenary-loading-v1.mjs?v=20260925';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const resource=path=>path?'/'+path.replace(/^\//,''):'';
const number=value=>Math.round(Number(value)||0).toLocaleString('ko-KR');
const DEFAULT_BUFFS=Object.freeze({'PET-GUSUDAENG':'MAX_HP_PERCENT','PET-BONGSOON':'SPEED_PERCENT','PET-JOEUN':'ATTACK_PERCENT','PET-HEEYA':'START_SHIELD_PERCENT','PET-DIIM':'DEFENSE_PERCENT','PET-HEADSET-SHIBA':'ATTACK_PERCENT','PET-BEANIE-CAT':'DEFENSE_PERCENT'});
const newPetDraft=code=>({...emptyPetDraft(code),buffs:[{type:DEFAULT_BUFFS[code]||'ATTACK_PERCENT',percent:10}]});
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
  root.innerHTML=`<header class="cp-head"><div><p class="cp-kicker">COMPANION</p><h2>펫 관리</h2><p>펫을 선택하고 시작 버프 한 개를 설정하세요.</p></div><a class="cp-equipment-link" href="/pets/?review=1">펫 장착창 보기 ↗</a></header>
    <div class="cp-workspace"><section class="cp-library" aria-label="등록된 펫"><div class="cp-section-head"><h3>등록된 펫</h3><span data-pet-total></span></div><div class="cp-roster"></div><details class="cp-register"><summary>새 펫 등록</summary><div class="cp-art-picker"></div><button type="button" data-add>직접 추가</button></details></section>
    <section class="cp-editor"><div class="cp-fields"><div class="cp-empty">펫을 불러오는 중입니다.</div></div></section></div>
    <footer class="cp-footer"><p data-status role="status">설정을 불러오는 중입니다.</p><div><button type="button" data-reload>새로고침</button><button type="button" data-save class="cp-primary">변경사항 저장</button></div></footer>
    <details class="cp-review-fold" data-review-panel><summary>전투 검수 · 관리 도구<span>편성, SD와 시작 연출</span></summary><section class="cp-review"><div class="cp-section-head"><h3>시작 버프 검수</h3><button type="button" data-export>설정 백업</button></div>
      <div class="cp-selectors"><label>용병 1<select data-merc="0" aria-label="용병 1"></select></label><label>용병 2<select data-merc="1" aria-label="용병 2"></select></label><label class="cp-pet-select">시작 지원 펫<select data-review-pet aria-label="시작 지원 펫"></select></label></div>
      <div class="cp-arena" aria-label="편성 SD 프리뷰"><div class="cp-arena-grid"></div><div class="cp-mercenaries"></div><div class="cp-regulars">${['공격','방어','속도','생명','균형'].map((type,i)=>`<div data-target="A:${i}"><b>${String(i+1).padStart(2,'0')}</b><span>${type}</span></div>`).join('')}</div><div class="cp-pet-dock"></div><div class="cp-opening" hidden></div></div>
      <div class="cp-review-controls"><label>전투 모드<select data-mode><option value="PVE">PvE</option><option value="PVP">PvP</option></select></label><label>검수 시드<input data-seed type="number" value="17" min="0" max="4294967295" step="1"></label><button type="button" data-run class="cp-primary">시작 버프 검수</button></div>
      <p class="cp-review-note">저장한 설정으로 검수합니다. 실제 보유·편성·획득 상태는 기존 설정을 따릅니다.</p><div class="cp-result" aria-live="polite"></div></section></details>`;
  const $=selector=>root.querySelector(selector);
  let state=null,draft=null,selected=null,dirty=false,busy=false,pending=null,disposed=false,timer=null,runSerial=0,reviewLoaded=false,reviewLoading=false;
  const choices=['',''];let chosenPet='';
  const pet=()=>draft?.pets.find(row=>row.code===selected);
  const status=(message,error=false)=>{$('[data-status]').textContent=message;$('[data-status]').classList.toggle('cp-error',error);};
  function syncButtons(){
    root.querySelectorAll('button,input,select,textarea').forEach(element=>element.disabled=busy||!draft&&!element.matches('[data-reload]')||Boolean(pending)&&!element.matches('[data-save],[data-export]'));
    $('[data-save]').disabled=busy||!draft||!dirty&&!pending;
    $('[data-save]').textContent=pending?'저장 결과 재확인':'변경사항 저장';
    $('[data-run]').disabled=busy||!state||!reviewLoaded||reviewLoading||dirty||Boolean(pending);
    $('[data-export]').disabled=!draft;
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
  function library(){
    if(!draft)return;
    const present=draft.pets.filter(row=>row.sourceArt||row.battleSprite),unfinished=draft.pets.filter(row=>!row.sourceArt&&!row.battleSprite);
    const card=row=>`<button type="button" class="cp-pet-card ${row.code===selected?'is-selected':''}" data-select-pet="${esc(row.code)}" aria-pressed="${row.code===selected}" aria-label="${esc(row.name)} 선택"><span class="cp-pet-thumb">${row.sourceArt||row.battleSprite?`<img src="${esc(resource(row.sourceArt||row.battleSprite))}" alt="">`:'<span>＋</span>'}</span><span><strong>${esc(row.name)}</strong><small>${esc(PET_BUFF_TYPES[row.buffs[0]?.type]||'버프 선택')} ${row.buffs[0]?.percent===null?'미정':esc(row.buffs[0]?.percent)+'%'}</small></span></button>`;
    $('[data-pet-total]').textContent=present.length+'마리';
    $('.cp-roster').innerHTML=present.map(card).join('')+(unfinished.length?`<details class="cp-unfinished" ${unfinished.some(row=>row.code===selected)?'open':''}><summary>미완성 초안 ${unfinished.length}개</summary>${unfinished.map(card).join('')}</details>`:'');
  }
  function editor(){
    if(!draft)return;
    library();
    const unregistered=(state?.artCatalog||[]).filter(art=>!draft.pets.some(row=>row.code===art.code));
    $('.cp-art-picker').innerHTML=unregistered.length?`<label>펫 일러스트<select data-art-preset aria-label="펫 일러스트"><option value="">원화 선택</option>${unregistered.map(art=>`<option value="${esc(art.code)}">${esc(art.name)}</option>`).join('')}</select></label><button type="button" data-register-art>선택한 펫 등록</button>`:'<p class="cp-helper">준비된 원화가 모두 등록되어 있습니다.</p>';
    const row=pet();
    if(!row){$('.cp-fields').innerHTML='<div class="cp-empty"><h3>함께할 펫을 등록하세요</h3><p>목록의 새 펫 등록에서 원화를 선택할 수 있습니다.</p></div>';return;}
    const buff=row.buffs[0],art=state.artCatalog?.find(art=>art.code===row.code);
    const image=row.sourceArt||row.battleSprite;
    $('.cp-fields').innerHTML=`<div class="cp-art-stage"><span class="cp-art-status">${art?.artStatus==='SOURCE_ART_APPROVED'?'승인 원화':image?'등록 원화':'원화 미등록'}</span>${image?`<img class="cp-pet-hero" src="${esc(resource(image))}" alt="${esc(row.name)} 펫 원화">`:'<span class="cp-no-art">원화를 등록하세요</span>'}<div class="cp-art-caption"><span>${esc(art?.animal||'펫')}</span><h3>${esc(row.name)}</h3></div></div>
      <div class="cp-config"><div class="cp-config-heading"><h3>시작 버프</h3><span>펫당 1개</span></div>
      <div class="cp-buff-summary"><span data-buff-icon>${petBuffIcon(buff.type)}</span><strong data-buff-title>${esc(PET_BUFF_TYPES[buff.type])}</strong><b data-buff-value>${buff.percent===null?'미정':esc(buff.percent)+'<small>%</small>'}</b></div>
      <div class="cp-buff-row"><label>버프 종류<select data-buff-type="0" aria-label="버프 종류">${Object.entries(PET_BUFF_TYPES).map(([key,label])=>`<option value="${key}" ${key===buff.type?'selected':''}>${label}</option>`).join('')}</select></label><label>효과<span class="cp-percent"><input data-buff-percent="0" type="number" min="0" max="1000" step="any" aria-label="버프 효과" placeholder="미정" value="${buff.percent??''}"><i>%</i></span></label></div>
      ${row.buffs.length>1?'<p class="cp-legacy-buffs">기존 버프가 여러 개입니다. 버프 종류를 선택하면 한 개로 정리됩니다.</p>':''}
      <div class="cp-field-grid"><label>적용 대상<select data-field="target" aria-label="적용 대상">${Object.entries(PET_BUFF_TARGETS).map(([key,label])=>`<option value="${key}" ${key===row.target?'selected':''}>${label}</option>`).join('')}</select></label><fieldset class="cp-mode-field"><legend>사용 모드</legend>${['PVE','PVP'].map(mode=>`<label><input data-pet-mode="${mode}" type="checkbox" ${row.modes.includes(mode)?'checked':''}> ${mode==='PVE'?'PvE':'PvP'}</label>`).join('')}</fieldset></div>
      <p class="cp-helper">전투 시작에 한 번 적용합니다.</p>
      <details class="cp-advanced"><summary>상세 설정<span>이름 · 리소스 · 검수</span></summary><div class="cp-advanced-body"><label>이름<input data-field="name" maxlength="40" value="${esc(row.name)}"></label><label>장착창 일러스트 경로<input data-field="sourceArt" value="${esc(row.sourceArt||'')}" placeholder="assets/ui/pets/파일명.png"></label><label>전투 SD 경로<input data-field="battleSprite" value="${esc(row.battleSprite)}" placeholder="assets/ui/pets/파일명.png"></label><label class="cp-switch"><input data-field="enabled" type="checkbox" ${row.enabled?'checked':''}> 전투 검수에 사용</label><label>운영 메모<textarea data-field="notes" maxlength="1200" rows="2">${esc(row.notes)}</textarea></label><div class="cp-advanced-actions"><code>${esc(row.code)}</code><button type="button" data-delete class="cp-delete">펫 삭제</button></div></div></details></div>`;
  }
  function buffSummary(){
    const row=pet(),buff=row?.buffs[0];if(!buff||!$('[data-buff-value]'))return;
    $('[data-buff-icon]').innerHTML=petBuffIcon(buff.type);
    $('[data-buff-title]').textContent=PET_BUFF_TYPES[buff.type];
    $('[data-buff-value]').innerHTML=buff.percent===null?'미정':esc(buff.percent)+'<small>%</small>';
    library();
  }
  function changed(){dirty=true;pending=null;status('변경 사항이 있습니다. 저장 버튼을 눌러 반영하세요.');syncButtons();}
  async function load(){
    busy=true;syncButtons();status('펫 설정을 불러오는 중입니다.');
    try{
      const loaded=await request('pets');if(disposed)return;
      validatePetCmsDocument(loaded.document);
      state={...loaded,mercenaries:[],cards:[],mercenaryRevision:null};reviewLoaded=false;
      draft=structuredClone(loaded.document);dirty=false;pending=null;
      selected=draft.pets.some(row=>row.code===selected)?selected:draft.pets.find(row=>row.sourceArt||row.battleSprite)?.code||draft.pets[0]?.code||null;
      choices.fill('');editor();stage();status('설정을 불러왔습니다.');
    }catch(error){if(!disposed)status(error.message,true);}
    finally{if(!disposed){busy=false;syncButtons();if($('[data-review-panel]').open)void loadReview();}}
  }
  async function loadReview(){
    if(!state||reviewLoaded||reviewLoading||busy)return;
    reviewLoading=true;syncButtons();
    try{
      const data=await request('companions/preparation');if(disposed)return;
      state={...state,mercenaries:data.mercenaries,cards:data.cards,mercenaryRevision:data.mercenaryRevision};
      reviewLoaded=true;updateSelects();stage();
    }catch(error){if(!disposed)status(error.message,true);}
    finally{reviewLoading=false;if(!disposed)syncButtons();}
  }
  async function save(){
    try{if(!pending)pending={document:validatePetCmsDocument(draft),expectedRevision:state.revision,requestId:crypto.randomUUID()};}catch(error){status(error.message,true);return;}
    busy=true;syncButtons();status('CMS 설정을 저장하고 있습니다.');
    try{const saved=await request('pets',{method:'PATCH',body:JSON.stringify(pending)});if(disposed)return;validatePetCmsDocument(saved.document);state={...state,...saved};draft=structuredClone(saved.document);pending=null;dirty=false;editor();stage();status(`저장 완료 · 버전 ${saved.revision}`);}
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
    if(target.hasAttribute('data-buff-percent')){row.buffs=[{type:row.buffs[0].type,percent:target.value===''?null:Number(target.value)}];changed();buffSummary();$('.cp-legacy-buffs')?.remove();}
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    if(target.hasAttribute('data-merc')){choices[Number(target.dataset.merc)]=target.value;updateSelects();stage();}
    if(target.hasAttribute('data-review-pet')){chosenPet=target.value;stage();}
    if(target.hasAttribute('data-mode')){editor();syncButtons();}
    const row=pet();if(!row||busy||pending)return;
    if(target.dataset.field){row[target.dataset.field]=target.type==='checkbox'?target.checked:target.value;changed();if(target.dataset.field==='target'||target.type==='checkbox'){editor();syncButtons();}stage();}
    if(target.hasAttribute('data-pet-mode')){row.modes=['PVE','PVP'].filter(mode=>mode===target.dataset.petMode?target.checked:row.modes.includes(mode));changed();editor();syncButtons();}
    if(target.hasAttribute('data-buff-type')){row.buffs=[{type:target.value,percent:row.buffs[0]?.percent??10}];$('[data-buff-percent]').value=row.buffs[0].percent;changed();buffSummary();$('.cp-legacy-buffs')?.remove();}
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-select-pet')){selected=target.dataset.selectPet;editor();syncButtons();return;}
    if(target.hasAttribute('data-add')){let id=1;while(draft.pets.some(row=>row.code===`PET-${String(id).padStart(3,'0')}`))id++;if(draft.pets.length>=100){status('펫은 100마리까지 등록할 수 있습니다.',true);return;}const row=newPetDraft(`PET-${String(id).padStart(3,'0')}`);draft.pets.push(row);selected=row.code;changed();editor();syncButtons();}
    if(target.hasAttribute('data-register-art')){const art=state.artCatalog?.find(art=>art.code===$('[data-art-preset]').value);if(!art){status('일러스트를 먼저 선택해 주세요.',true);return;}if(draft.pets.some(row=>row.code===art.code)||draft.pets.length>=100){status('이미 등록했거나 등록 한도를 초과했습니다.',true);return;}draft.pets.push({...newPetDraft(art.code),name:art.name,sourceArt:art.sourceArt});selected=art.code;changed();editor();syncButtons();}
    if(target.hasAttribute('data-delete')){draft.pets=draft.pets.filter(row=>row.code!==selected);selected=draft.pets[0]?.code||null;changed();editor();stage();syncButtons();}
    if(target.hasAttribute('data-save'))void save();
    if(target.hasAttribute('data-reload')&&(!dirty||window.confirm('저장하지 않은 편집 내용을 버리고 다시 불러올까요?')))void load();
    if(target.hasAttribute('data-export'))exportDraft();
    if(target.hasAttribute('data-run'))void run();
  });
  $('[data-review-panel]').addEventListener('toggle',()=>{if($('[data-review-panel]').open)void loadReview();});
  void load();
  return {dispose(){disposed=true;runSerial++;clearTimeout(timer);root.replaceChildren();}};
}

function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='펫 관리';button.dataset.view='companion-preparation';button.hidden=true;panel.className='view';panel.id='view-companion-preparation';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=null;
  button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(view=>view.hidden=view!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='펫 관리';if(!mounted)mounted=mountCompanionCms(panel);},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;mounted?.dispose();mounted=null;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
