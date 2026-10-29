import {jointAccountRequest as request} from '../../js/joint-account-transport.mjs';
import {equipmentEffectText} from '../../shared/equipment-growth-text-v1.mjs';
import {POLISH_OPTIONS} from '../../shared/equipment-polish-v1.mjs';
import {labels,icon,esc,fmt,image,itemKey,slotEmblem,socketTrim} from './ui.mjs?v=20261012-armory5';

const $=selector=>document.querySelector(selector),mobile=matchMedia('(max-width:800px)');
let mode=new URL(location.href).searchParams.get('mode')==='PVP'?'PVP':'PVE';
let state=null,account=null,view='owned',slot='',region='',query='',sort='default',layout='grid',selected=null,busy=false,flight=null,pending=null,feedback='',drag=null,suppressClick=false,toastTimer=null;
const loadout=()=>state?.loadouts[mode];
const worn=item=>Boolean(item?.instanceId&&loadout()?.items.some(row=>row.instanceId===item.instanceId));
const meta=item=>state?.catalog.find(row=>row.code===item.code)||item;
const regionMeta=id=>state?.regions.find(row=>row.id===id);
const setSteps=source=>source?.five?[2,4,5]:[2,4];
const stepEffects=(source,count)=>source?.[count===2?'two':count===4?'four':'five'];
const supportsMode=source=>source?.modes?.includes(mode)??mode==='PVE';
const power=(item,forMode=mode)=>!item?0:forMode==='PVE'?(item.pvePower??Math.floor(meta(item).totalPower*.9)):(item.pvpPower??meta(item).totalPower-Math.floor(meta(item).totalPower*.9));
function status(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error);$('#connectionIndicator').style.background=error?'#e6a38e':'#abcaa0';}
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').innerHTML=icon(error?'close':'check')+`<span>${esc(message)}</span>`;$('#toast').hidden=false;$('#toast').classList.toggle('error',error);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},5000);}
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(node=>node.innerHTML=icon(node.dataset.icon));}
function render(){
  document.body.dataset.mode=mode;
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  $('#loadoutTitle').textContent=mode+' 무장';$('#powerMode').textContent=mode;
  $('#changeMercenary').href='/mercenary-codex/?view=owned&mode='+mode;
  if(!state)return;
  const gear=loadout(),code=account?.loadouts?.[mode]?.mercenaryCode,mercenary=account?.cards?.find(card=>card.code===code);
  if($('#operator').dataset.code!==(code||'')){
    $('#operator').innerHTML=mercenary?`<img src="${esc(image(mercenary.sourceArt))}" alt="${esc(mercenary.name)} 원화">`:icon('people');
    $('#operator').dataset.code=code||'';
  }
  $('#operator').classList.toggle('no-mercenary',!mercenary);
  $('#operatorName').textContent=mercenary?.name||'용병을 편성하세요';$('#operatorRank').textContent=mercenary?mercenary.rank+' / MERCENARY':'NO MERCENARY';
  $('#equippedCount').textContent=gear.items.length+' / 5 장착';$('#gearPower').textContent='+ '+fmt(gear.power);
  $('#powerHint').textContent=mercenary?`${mercenary.name}에게 적용 · 용병을 바꿔도 장비는 유지됩니다.`:'용병을 편성하면 저장한 장비가 적용됩니다.';
  $('#slots').innerHTML=state.slots.map(part=>{
    const item=gear.items.find(row=>row.slot===part);
    return `<button class="equip-slot ${item?'is-equipped':'is-empty'}" data-slot="${part}" aria-pressed="${slot===part}" aria-label="${labels[part]} 장비 선택: ${esc(item?.name||'빈 슬롯')}"><span class="slot-face"><span class="slot-recess" aria-hidden="true"></span>${socketTrim()}<span class="slot-art">${item?`<img src="${esc(item.image)}" alt="">`:slotEmblem(part)}</span>${item?.level?`<i class="slot-level">+${item.level}</i>`:!item?'<span class="slot-add" aria-hidden="true">+</span>':''}<span class="slot-name">${labels[part]}</span></span><span class="slot-state" aria-hidden="true"><span>${item?'장착 중':'미장착'}</span><b>${slot===part?'선택 중':'장비 선택'}<i>›</i></b></span></button>`;
  }).join('');
  $('#slotGuidance').innerHTML=icon('pointer')+(slot?`${labels[slot]}에 장착할 장비를 선택하세요.`:'장비를 바꿀 부위를 선택하세요.');
  renderEffects();renderTools();renderInventory();renderInspection();
}
function renderEffects(){
  const gear=loadout();
  $('#effectsMode').textContent=mode==='PVP'?'상위 세트 적용':'전체 효과 적용';
  const groups=state.regions.map(r=>({r,count:gear.items.filter(i=>i.regionId===r.id&&meta(i).kind==='SET').length})).filter(row=>row.count);
  const unique=mode==='PVE'?gear.items.filter(i=>meta(i).kind==='UNIQUE'):[];
  $('#effects').innerHTML=groups.map(({r,count})=>`<div class="effect-row"><b>${esc(r.setName)} · ${count}/5${supportsMode(r)?'':' · PVE 전용'}</b><div class="set-pips" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="${i<count?'on':''}"></i>`).join('')}</div>${setSteps(r).map(n=>`<p class="effect-step ${count>=n&&supportsMode(r)?'active':''}"><b>${n}세트 ${count>=n&&supportsMode(r)?'ON':'OFF'}</b><span>${esc(equipmentEffectText(stepEffects(r,n)))}</span></p>`).join('')}</div>`).join('')+unique.map(i=>`<p class="effect-row"><b>${esc(i.name)}</b>${esc(meta(i).description)}</p>`).join('')+(mode==='PVE'&&gear.items.some(i=>i.polish?.values?.some(v=>v>0))?`<p class="effect-row"><b>연마 포함 최종 효과</b>${esc(gear.summary)}</p>`:'')||'<p class="effect-note">같은 세트를 모으면 효과가 활성화됩니다. 상위 장비는 2·4·5세트 효과가 PVE와 PVP에 적용됩니다.</p>';
  if(mode==='PVP')$('#effects').innerHTML+='<p class="effect-note">상위 10세트의 효과가 적용됩니다. 기존 지역 세트·고유·연마 효과는 PVE 전용입니다.</p>';
}
function renderTools(){
  if(!state)return;
  $('#ownedCount').textContent=state.items.length;$('#catalogCount').textContent=state.catalog.length;
  $('#regionLabel').textContent=regionMeta(region)?.name||'모든 세트';
  $('#regions').innerHTML=[{id:'',name:'모든 세트'},...state.regions].map(r=>{const art=r.tier?state.catalog.find(item=>item.regionId===r.id&&item.slot==='TOP')?.image:r.id?`/assets/ui/legion-regions-v1/${r.id}/background-v1.webp`:null;return `<button data-region="${esc(r.id)}" aria-pressed="${r.id===region}" ${art?`style="--region-image:url('${esc(art)}')"`:''}><b>${r.tier?r.tier+'단계 · ':''}${esc(r.name)}</b><small>${(view==='owned'?state.items:state.catalog).filter(i=>!r.id||i.regionId===r.id).length}</small></button>`;}).join('');
  $('#sortLabel').textContent=({default:'기본순',power:'전투력순',level:'강화순'})[sort];
  for(const b of document.querySelectorAll('[data-sort]'))b.setAttribute('aria-pressed',String(b.dataset.sort===sort));
  for(const b of document.querySelectorAll('[data-layout]'))b.setAttribute('aria-pressed',String(b.dataset.layout===layout));
  $('#activeFilter').innerHTML=icon(slot||'grid')+`<b>${slot?labels[slot]+' 선택 중':'모든 부위'}</b>`;
  $('#clearFilters').hidden=!slot&&!region&&!query;
  $('#goBack').setAttribute('aria-label',selected?'장비 선택 닫기':slot?'전체 장비로 돌아가기':'뒤로가기');
}
function itemsForView(){
  const order=new Map(state.catalog.map((i,n)=>[i.code,n]));
  return (view==='owned'?state.items:state.catalog).filter(i=>(!slot||i.slot===slot)&&(!region||i.regionId===region)&&(!query||i.name.toLocaleLowerCase('ko-KR').includes(query.toLocaleLowerCase('ko-KR')))).sort((a,b)=>(sort==='power'?power(b)-power(a):sort==='level'?(b.level||0)-(a.level||0):0)||(order.get(a.code)??999)-(order.get(b.code)??999)||(b.level||0)-(a.level||0));
}
function renderInventory(){
  if(!state)return;
  const items=itemsForView();$('#itemCount').textContent=items.length+(view==='owned'?'개 장비':'종 장비');
  $('#inventory').setAttribute('aria-busy','false');$('#inventory').classList.toggle('list',layout==='list');
  $('#inventory').innerHTML=items.length?items.map(item=>`<button class="gear-option" data-item="${esc(itemKey(item))}" draggable="false" aria-pressed="${selected&&itemKey(selected)===itemKey(item)?'true':'false'}" aria-label="${esc(item.name)}${item.level?' +'+item.level:''} ${mode} ${fmt(power(item))}${worn(item)?' 장착 중':''}" style="--item-accent:${esc(regionMeta(item.regionId)?.accent||'#ceaf77')}"><span class="gear-tile"><img src="${esc(item.image)}" alt="" loading="lazy">${worn(item)?`<span class="equipped-mark">${icon('check')}장착</span>`:''}${item.level?`<span class="enhance">+${item.level}</span>`:''}${meta(item).kind==='UNIQUE'?'<span class="unique-mark">UNIQUE</span>':''}</span><strong class="gear-name">${esc(item.name)}</strong><span class="gear-sub"><small>${labels[item.slot]}</small><strong>+${fmt(power(item))}</strong></span></button>`).join(''):emptyState();
}
function emptyState(){
  const filtered=Boolean(slot||region||query),hasAny=view==='owned'?state.items.length>0:state.catalog.length>0;
  return `<div class="empty-state"><div class="empty-art" aria-hidden="true">${icon('WEAPON')}${icon(slot||'TOP')}${icon('ACCESSORY')}</div><h3>${view==='owned'&&!hasAny?'보유한 '+(slot?labels[slot]:'장비')+'가 없습니다':'조건에 맞는 장비가 없습니다'}</h3><p>${view==='owned'&&!hasAny?'군단토벌에서 획득한 용병 전용 장비를<br>이곳에서 선택하고 장착할 수 있습니다.':'지역·부위·검색어를 바꾸어 다른 장비를 찾아보세요.'}</p>${view==='owned'?`<button data-open-catalog>${slot?labels[slot]+' 도감 보기':'장비 도감 살펴보기'}${icon('arrow')}</button>`:''}${filtered?`<button class="${view==='owned'?'secondary-empty':''}" data-reset-filters>모든 장비 보기${icon('refresh')}</button>`:''}</div>`;
}
function renderInspection(){
  const panel=$('#inspection'),dock=$('#inspectionDock'),sheet=$('#itemDialog');
  dock.hidden=!selected||mobile.matches;$('#inventoryGuide').hidden=Boolean(selected);
  if(!selected){panel.hidden=true;if(sheet.open)sheet.close();return;}
  const item=selected,def=meta(item),source=regionMeta(item.regionId),current=loadout()?.items.find(i=>i.slot===item.slot),owned=state.items.find(i=>i.code===item.code),expanded=panel.querySelector('.inspect-effects')?.open||false;
  const polish=item.polish?.values?.map((v,i)=>v?POLISH_OPTIONS[i].name+' +'+v+POLISH_OPTIONS[i].unit:'').filter(Boolean).join(' · ');
  panel.innerHTML=`<div class="inspect-header"><img class="inspect-art" src="${esc(item.image)}" alt="${esc(item.name)}"><div><p class="inspect-kicker">${def.kind==='UNIQUE'?'고유 장비':'세트 장비'}<span>· ${labels[item.slot]}</span></p><h3 id="itemTitle">${esc(item.name)}${item.level?` <small>+${item.level}</small>`:''}</h3><p class="inspect-source">${esc(source?.name)}${item.instanceId?' · 보유':' · 도감'}</p></div><button class="inspect-close" data-close-selection aria-label="장비 선택 닫기">${icon('close')}</button></div><div class="compare-caption"><span>현재 ${labels[item.slot]}</span><strong>${esc(current?.name||'장착한 장비 없음')}${current?.level?' +'+current.level:''}</strong></div><div class="compare-table" aria-label="장착 전후 전투력 비교"><span>전장</span><span>현재 장비</span><span>${item.instanceId?'선택한 장비':'도감 기본 수치'}</span><span>차이</span>${['PVE','PVP'].map(m=>{const diff=power(item,m)-power(current,m);return `<b class="${mode===m?'active':''}">${m}</b><strong>${fmt(power(current,m))}</strong><strong class="new-power">${fmt(power(item,m))}</strong><strong class="${diff>0?'positive':diff<0?'negative':''}">${diff>0?'+':diff<0?'−':''}${fmt(Math.abs(diff))}</strong>`;}).join('')}</div>${!item.instanceId?'<p class="inspect-note">도감은 강화 전 기본 수치입니다. 실제 보유 장비를 선택해야 장착할 수 있습니다.</p>':''}<details class="inspect-effects" ${expanded?'open':''}><summary>세트·고유·연마 효과 확인${icon('chevron')}</summary><div class="inspect-effect-body">${def.kind==='SET'?setSteps(source).map(n=>`<p><b>${n}세트</b>${esc(equipmentEffectText(stepEffects(source,n)))}</p>`).join(''):`<p><b>고유 효과</b>${esc(def.description)}</p>`}${polish?`<p><b>연마 ${item.polish.attempts}회</b>${esc(polish)}</p>`:''}<small>${source?.five?'2·4·5세트 효과는 PVE와 PVP에서 발동합니다. 연마는 PVE 전용입니다.':'세트·고유·연마 효과는 PVE에서 발동합니다.'}</small></div></details><div class="inspect-actions">${item.instanceId?`<button class="equip-action" data-save="${worn(item)?'remove':'equip'}" ${busy?'disabled':''}>${icon(worn(item)?'close':'check')}${busy?'저장 중…':worn(item)?mode+' 장착 해제':current?mode+' 장비 교체':mode+'에 장착'}</button>`:owned?`<button class="owned-action" data-select-owned="${esc(owned.instanceId)}">보유 장비 선택${icon('arrow')}</button>`:`<span class="unowned-state">${def.available===false?'준비 중인 장비':'아직 보유하지 않은 장비'}</span>`}<button class="cancel-action" data-close-selection>목록으로</button><p class="action-feedback" role="status" aria-live="polite">${esc(feedback)}</p></div>`;
  panel.hidden=false;
  if(mobile.matches){if(panel.parentNode!==sheet)sheet.append(panel);if(!sheet.open)sheet.showModal();}
  else{if(sheet.open)sheet.close();if(panel.parentNode!==dock)dock.append(panel);}
}
function closeSelection({focus=true}={}){
  const key=selected?itemKey(selected):null;selected=null;feedback='';
  renderInspection();if(state){renderInventory();renderTools();}
  if(focus&&key)$(`[data-item="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
}
function choose(item){
  if(busy){toast('장비를 저장하고 있습니다. 잠시만 기다려 주세요.');return;}
  selected=item;feedback='';renderInventory();renderInspection();renderTools();
  if(!mobile.matches)$(`[data-item="${CSS.escape(itemKey(item))}"]`)?.focus({preventScroll:true});
}
function showInventory(){
  if(mobile.matches)$('#arsenal').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
  $('#arsenal').focus({preventScroll:true});
}
function selectSlot(part){
  if(busy)return;
  slot=part;view='owned';region='';query='';$('#itemSearch').value='';selected=loadout()?.items.find(i=>i.slot===part)||null;feedback='';
  render();showInventory();
}
function resetFilters(){slot='';region='';query='';$('#itemSearch').value='';closeSelection({focus:false});render();}
async function refresh({quiet=false}={}){
  if(flight)return flight;if(!quiet)status('장비 구성을 확인하고 있습니다.');$('#refresh').disabled=true;
  flight=Promise.all([request('mercenaries/v3/equipment'),request('mercenaries/v3/state')]).then(([gear,mercenary])=>{
    state=gear;account=mercenary;
    if(selected)selected=selected.instanceId?state.items.find(i=>i.instanceId===selected.instanceId)||null:state.catalog.find(i=>i.code===selected.code)||null;
    render();status('장착 시 바로 저장 · 같은 장비를 PVE와 PVP에 각각 사용할 수 있습니다.');
  }).catch(error=>{
    status(error.status===401?'로비에서 로그인하면 장비를 확인할 수 있습니다.':error.message,true);
    if(!state){$('#inventory').setAttribute('aria-busy','false');$('#operatorName').textContent='편성 확인 대기';$('#itemCount').textContent='확인 필요';$('#inventory').innerHTML=`<div class="empty-state"><div class="empty-art">${icon('search')}${icon('box')}${icon('refresh')}</div><h3>${error.status===401?'로그인이 필요합니다':'장비를 불러오지 못했습니다'}</h3><p>${error.status===401?'상단의 리버스콜 로고나 로비 버튼으로 돌아가 로그인해 주세요.':'연결을 확인하고 다시 시도해 주세요.'}</p><button data-retry>다시 불러오기${icon('refresh')}</button></div>`;}
    throw error;
  }).finally(()=>{flight=null;$('#refresh').disabled=false;});return flight;
}
async function save(action){
  if(busy||!selected?.instanceId)return;
  const target=selected,instanceId=action==='remove'?null:target.instanceId;
  busy=true;feedback='장비 구성을 저장하고 있습니다.';renderInspection();
  try{
    if(flight)await flight;
    // Ambiguous retries retain their receipt. Mode, ownership, and revision remain server-authoritative.
    if(!pending||pending.mode!==mode||pending.slot!==target.slot||pending.instanceId!==instanceId)pending={requestId:crypto.randomUUID(),mode,slot:target.slot,instanceId,revision:loadout().revision};
    await request('mercenaries/v3/equipment',{method:'POST',body:pending});pending=null;
    try{localStorage.setItem('cnine.mercenary.loadout.changed',String(Date.now()));}catch{}
    await refresh({quiet:true});feedback=instanceId?`${mode} 장착 완료 · 용병을 바꿔도 장비는 유지됩니다.`:`${mode} 장착을 해제했습니다.`;toast(instanceId?`${target.name} · ${mode} 장착 완료`:`${target.name} 장착 해제`);
  }catch(error){
    if(error.status&&error.status<500){pending=null;await refresh({quiet:true}).catch(()=>{});}
    feedback=error.message;toast(error.message,true);
  }finally{busy=false;renderInspection();}
}
function setSearch(open){
  $('#searchDrawer').hidden=!open;$('#toggleSearch').setAttribute('aria-expanded',String(open));
  if(open)$('#itemSearch').focus();else{query='';$('#itemSearch').value='';renderInventory();if(state)renderTools();$('#toggleSearch').focus();}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button');
  for(const menu of document.querySelectorAll('.tool-menu[open],.effects-disclosure[open]'))if(!menu.contains(event.target))menu.open=false;
  if(!target)return;
  if(target.dataset.mode){if(busy)return;mode=target.dataset.mode;closeSelection({focus:false});const url=new URL(location.href);url.searchParams.set('mode',mode);history.replaceState(null,'',url);$('#effectsDisclosure').open=false;render();}
  if(target.dataset.view){if(busy)return;view=target.dataset.view;closeSelection({focus:false});render();}
  if(target.dataset.slot)selectSlot(target.dataset.slot);
  if(target.hasAttribute('data-region')){region=target.dataset.region;$('#regionMenu').open=false;closeSelection({focus:false});render();}
  if(target.dataset.sort){sort=target.dataset.sort;$('#sortMenu').open=false;renderTools();renderInventory();}
  if(target.dataset.layout){layout=target.dataset.layout;renderTools();renderInventory();}
  if(target.dataset.item){const item=(view==='owned'?state?.items:state?.catalog)?.find(i=>itemKey(i)===target.dataset.item);if(item)choose(item);}
  if(target.dataset.selectOwned){const item=state.items.find(i=>i.instanceId===target.dataset.selectOwned);if(item){view='owned';choose(item);render();}}
  if(target.hasAttribute('data-open-catalog')){view='catalog';query='';$('#itemSearch').value='';closeSelection({focus:false});render();}
  if(target.hasAttribute('data-reset-filters')||target.id==='clearFilters')resetFilters();
  if(target.hasAttribute('data-close-selection'))closeSelection();
  if(target.hasAttribute('data-retry')||target.id==='refresh')void refresh().catch(()=>{});
  if(target.dataset.save)void save(target.dataset.save);
  if(target.id==='openInventory')showInventory();
  if(target.id==='toggleSearch')setSearch($('#searchDrawer').hidden);
  if(target.id==='closeSearch')setSearch(false);
});
$('#itemSearch').addEventListener('input',event=>{query=event.target.value.trim();renderInventory();if(state)renderTools();});
$('#itemSearch').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();setSearch(false);}});
$('#goBack').addEventListener('click',()=>{
  if(selected){closeSelection();return;}if(slot||region||query){resetFilters();return;}
  let canReturn=false;try{const previous=new URL(document.referrer);canReturn=previous.origin===location.origin&&previous.pathname!==location.pathname&&history.length>1;}catch{}
  if(canReturn)history.back();else location.assign('/?screen=home');
});
$('#itemDialog').addEventListener('close',()=>{if(mobile.matches&&selected)closeSelection();});
$('#itemDialog').addEventListener('click',event=>{if(event.target!==$('#itemDialog'))return;const rect=event.target.getBoundingClientRect();if(event.clientY<rect.top||event.clientX<rect.left||event.clientX>rect.right)closeSelection();});
mobile.addEventListener('change',()=>renderInspection());
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&selected&&!$('#itemDialog').open){closeSelection();return;}
  const card=event.target.closest('.gear-option');if(!card)return;
  const cards=[...document.querySelectorAll('.gear-option')],index=cards.indexOf(card),columns=layout==='list'?1:getComputedStyle($('#inventory')).gridTemplateColumns.split(' ').length;
  const next=({ArrowRight:index+1,ArrowLeft:index-1,ArrowDown:index+columns,ArrowUp:index-columns,Home:0,End:cards.length-1})[event.key];
  if(next!==undefined){event.preventDefault();cards[Math.max(0,Math.min(cards.length-1,next))]?.focus();}
});
// Pointer dragging keeps the equipment preview under our control. Dropping never saves a loadout.
$('#inventory').addEventListener('dragstart',event=>event.preventDefault());
$('#inventory').addEventListener('pointerdown',event=>{
  const target=event.target.closest('[data-item]');
  if(!target||view!=='owned'||busy||mobile.matches||event.button!==0)return;
  const item=state.items.find(i=>i.instanceId===target.dataset.item);if(!item)return;
  drag={item,target,pointerId:event.pointerId,x:event.clientX,y:event.clientY,ghost:null};
});
document.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  if(!drag.ghost&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
  if(!drag.ghost){
    drag.target.setPointerCapture(event.pointerId);
    drag.ghost=document.createElement('div');drag.ghost.className='drag-preview';drag.ghost.setAttribute('aria-hidden','true');
    drag.ghost.innerHTML=`<img src="${esc(drag.item.image)}" alt=""><span>${esc(drag.item.name)}</span>`;
    document.body.append(drag.ghost);document.body.classList.add('dragging-equipment');
  }
  event.preventDefault();drag.ghost.style.left=event.clientX+'px';drag.ghost.style.top=event.clientY+'px';
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot]');
  document.querySelectorAll('[data-slot]').forEach(el=>el.classList.toggle('drop-target',el===target&&el.dataset.slot===drag.item.slot));
});
function finishDrag(event,cancelled=false){
  if(!drag||event.pointerId!==drag.pointerId)return;
  const {item,target,pointerId,ghost}=drag;drag=null;
  if(target.hasPointerCapture(pointerId))target.releasePointerCapture(pointerId);
  ghost?.remove();document.body.classList.remove('dragging-equipment');
  document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
  if(!ghost)return;
  suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
  if(cancelled)return;
  const destination=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot]');
  if(!destination)return;
  if(item.slot!==destination.dataset.slot){toast(labels[destination.dataset.slot]+' 슬롯에는 같은 부위의 장비를 놓아 주세요.',true);return;}
  slot=item.slot;view='owned';region='';query='';$('#itemSearch').value='';choose(item);render();toast('장착할 후보로 선택했습니다. 비교 후 장착 버튼을 눌러 주세요.');
}
document.addEventListener('pointerup',event=>finishDrag(event));
document.addEventListener('pointercancel',event=>finishDrag(event,true));
document.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
$('.skip-link').addEventListener('click',event=>{event.preventDefault();showInventory();$('#inventory').focus({preventScroll:true});});
addEventListener('focus',()=>{if(!busy)void refresh({quiet:true}).catch(()=>{});});
addEventListener('storage',event=>{if(event.key==='cnine.mercenary.loadout.changed'&&!busy)void refresh({quiet:true}).catch(()=>{});});
paintIcons();render();void refresh().catch(()=>{});
