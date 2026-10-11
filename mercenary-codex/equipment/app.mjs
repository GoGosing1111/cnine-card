import {jointAccountRequest as request} from '../../js/joint-account-transport.mjs';
import {equipmentEffectText} from '../../shared/equipment-growth-text-v1.mjs';
import {POLISH_OPTIONS} from '../../shared/equipment-polish-v1.mjs';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
const slotPaths={WEAPON:'<path d="m16 3 5 0 0 5-11 11-5-5ZM4 12l8 8M3 21l5-5M14 10l4-4"/>',TOP:'<path d="m8 3-5 3 2 6 3-1v10h8V11l3 1 2-6-5-3M8 3c0 5 8 5 8 0M8 16h8"/>',BOTTOM:'<path d="M6 3h12l2 18h-6l-2-11-2 11H4ZM6 6h12M12 6v4"/>',SHOES:'<path d="M5 3h9v10l6 3v5H3v-7l2-3ZM4 17h5m5-4-4 2M3 18h17"/>',ACCESSORY:'<path d="m12 2 8 7-8 13L4 9ZM4 9h16M8 6l4 3 4-3M12 9v13"/>'};
const slotIcon=slot=>`<svg viewBox="0 0 24 24" aria-hidden="true">${slotPaths[slot]||'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'}</svg>`;
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const fmt=value=>new Intl.NumberFormat('ko-KR').format(Number(value)||0);
const image=value=>'/'+String(value||'').replace(/^\/+/, '');
let mode=new URL(location.href).searchParams.get('mode')==='PVP'?'PVP':'PVE';
let state=null,account=null,view='owned',region='',filter='',query='',sort='default',selected=null,busy=false,flight=null,pending=null,returnFocus=null;
const loadout=()=>state?.loadouts[mode];
const equipped=item=>Boolean(item?.instanceId&&loadout()?.items.some(row=>row.instanceId===item.instanceId));
const regionMeta=id=>state?.regions.find(row=>row.id===id);
const definition=item=>state?.catalog.find(row=>row.code===item.code)||item;
const powerOf=(item,forMode=mode)=>forMode==='PVE'?(item.pvePower??Math.floor(definition(item).totalPower*.9)):(item.pvpPower??definition(item).totalPower-Math.floor(definition(item).totalPower*.9));
function status(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error);}
function render(){
  document.body.dataset.mode=mode;
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  $('#loadoutTitle').textContent=mode+' 무장';
  $('#powerMode').textContent=mode;
  $('#changeMercenary').href='/mercenary-codex/?view=owned&mode='+mode;
  if(!state)return;
  const gear=loadout(),code=account?.loadouts?.[mode]?.mercenaryCode,mercenary=account?.cards?.find(card=>card.code===code);
  $('#operator').innerHTML=mercenary?`<img src="${esc(image(mercenary.sourceArt))}" alt="${esc(mercenary.name)} 원화">`:`<div class="operator-empty">${icon('crest')}</div>`;
  $('#operatorName').textContent=mercenary?.name||'용병을 편성하세요';
  $('#operatorRank').textContent=mercenary?mercenary.rank+' / MERCENARY':'NO MERCENARY';
  $('#equippedCount').innerHTML=String(gear.items.length).padStart(2,'0')+' <small>/ 05</small>';
  $('#gearPower').textContent='+ '+fmt(gear.power);
  $('#powerHint').textContent=mercenary?`${mercenary.name}에게 적용 · 용병을 바꿔도 장비는 유지됩니다.`:'장비는 미리 저장할 수 있습니다. 용병 편성 후 적용됩니다.';
  $('#slots').innerHTML=state.slots.map((slot,index)=>{
    const item=gear.items.find(row=>row.slot===slot);
    return `<button class="gear-slot ${item?'is-filled':''}" data-slot="${slot}" style="--accent:${esc(regionMeta(item?.regionId)?.accent||'#dfc38b')}" aria-label="${labels[slot]}: ${esc(item?.name||'비어 있음 · 장비 선택')}"><span class="slot-order" aria-hidden="true">0${index+1}</span>${item?`<img src="${esc(item.image)}" alt="">${item.level?`<span class="enhance">+${item.level}</span>`:''}`:`<span class="empty-symbol">${slotIcon(slot)}</span><span class="slot-plus" aria-hidden="true">+</span>`}<span class="slot-label">${labels[slot]}</span></button>`;
  }).join('');
  renderEffects(gear);
  $('#ownedTotal').textContent=fmt(state.items.length);
  $('#ownedTabCount').textContent=state.items.length;
  $('#catalogTabCount').textContent=state.catalog.length;
  $('#regions').innerHTML=[{id:'',name:'전체',accent:'#dfc38b'},...state.regions.map(row=>({...row,name:({coast:'해안',desert:'사막',theatre:'대극장',viscera:'거수',sky:'천공'})[row.id]||row.name}))].map(row=>{
    const count=(view==='owned'?state.items:state.catalog).filter(item=>!row.id||item.regionId===row.id).length;
    return `<button data-region="${esc(row.id)}" style="--accent:${esc(row.accent)}" aria-pressed="${row.id===region}">${row.id?'<i class="region-dot" aria-hidden="true"></i>':''}${esc(row.name)}<small>${count}</small></button>`;
  }).join('');
  const regionTabs=$('#regions'),activeRegion=regionTabs.querySelector('[aria-pressed="true"]');
  if(!region)regionTabs.scrollLeft=0;
  else if(activeRegion){
    const outer=regionTabs.getBoundingClientRect(),inner=activeRegion.getBoundingClientRect();
    if(inner.left<outer.left)regionTabs.scrollLeft+=inner.left-outer.left;
    else if(inner.right>outer.right)regionTabs.scrollLeft+=inner.right-outer.right;
  }
  $('#slotFilters').innerHTML=Object.entries({'':'전체',...labels}).map(([slot,name])=>`<button data-filter-slot="${slot}" aria-pressed="${filter===slot}">${slotIcon(slot)}<span>${name}</span></button>`).join('');
  renderInventory();
  if(selected&&$('#itemDialog').open){
    selected=(selected.instanceId?state.items.find(item=>item.instanceId===selected.instanceId):state.catalog.find(item=>item.code===selected.code))||null;
    if(selected)renderDetail();else $('#itemDialog').close();
  }
}
function renderEffects(gear){
  if(mode==='PVP'){
    $('#effects').innerHTML='<p class="effect-empty">PVP 장비 전투력으로 용병이 강해집니다.<br>세트·고유·연마 효과는 PVE에서 발동합니다.</p>';return;
  }
  const sets=state.regions.map(source=>({source,count:gear.items.filter(item=>definition(item).kind==='SET'&&item.regionId===source.id).length})).filter(row=>row.count);
  const uniques=gear.items.filter(item=>definition(item).kind==='UNIQUE');
  const rows=sets.map(({source,count})=>`<div class="set-row"><div class="set-row-head"><b>${esc(source.setName)}</b><span>${count} / 5</span><div class="set-meter" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="${i<count?'on':''}"></i>`).join('')}</div></div>${[2,4].map(step=>`<p class="set-step ${count>=step?'active':''}"><b>${step}세트 ${count>=step?'ON':'OFF'}</b><span>${esc(equipmentEffectText(step===2?source.two:source.four))}</span></p>`).join('')}</div>`).join('');
  const uniqueRows=uniques.map(item=>`<div class="unique-effect">${icon('spark')}<p><b>${esc(item.name)}</b>${esc(definition(item).description)}</p></div>`).join('');
  const polished=gear.items.some(item=>item.polish?.values?.some(value=>value>0));
  $('#effects').innerHTML=rows+uniqueRows+(polished?`<div class="unique-effect">${icon('forge')}<p><b>연마 포함 최종 효과</b>${esc(gear.summary)}</p></div>`:'')||'<p class="effect-empty">같은 세트의 장비 2개·4개를 모아 보세요.<br>고유 장비는 하나만 장착해도 효과가 발동합니다.</p>';
}
function renderInventory(){
  if(!state)return;
  const order=new Map(state.catalog.map((item,index)=>[item.code,index]));
  const items=(view==='owned'?state.items:state.catalog).filter(item=>(!region||item.regionId===region)&&(!filter||item.slot===filter)&&(!query||item.name.toLocaleLowerCase('ko-KR').includes(query.toLocaleLowerCase('ko-KR')))).sort((a,b)=>{
    const priority=sort==='power'?powerOf(b)-powerOf(a):sort==='level'?(b.level||0)-(a.level||0):0;
    return priority||(order.get(a.code)??999)-(order.get(b.code)??999)||(b.level||0)-(a.level||0);
  });
  $('#itemCount').textContent=items.length+(view==='owned'?'개 장비':'종 장비');
  $('#collectionHint').textContent=view==='owned'?'선택한 장비를 바로 비교하고 장착하세요.':'군단토벌에서 만날 수 있는 장비입니다.';
  $('#inventory').setAttribute('aria-busy','false');
  $('#inventory').innerHTML=items.length?items.map(item=>{
    const meta=definition(item),owned=state.items.some(row=>row.code===item.code),worn=equipped(item);
    return `<button class="loot-card ${worn?'equipped':''} ${meta.kind==='UNIQUE'?'unique':''}" data-item="${esc(item.instanceId||item.code)}" style="--accent:${esc(regionMeta(item.regionId)?.accent||'#dfc38b')}"><span class="badge">${icon(worn?'check':meta.kind==='UNIQUE'?'spark':'crest')}${worn?'장착 중':meta.kind==='UNIQUE'?'고유 장비':'세트 장비'}</span>${item.level?`<span class="enhance">+${item.level}</span>`:''}<div class="item-art"><img class="item-visual" src="${esc(item.image)}" alt="" loading="lazy"></div><strong>${esc(item.name)}</strong><small>${labels[item.slot]} · ${view==='owned'?'보유':meta.available===false?'준비 중':owned?'보유':'미보유'}</small><div class="item-power"><span>${mode}</span>+${fmt(powerOf(item))}${icon('arrow')}</div></button>`;
  }).join(''):emptyInventory();
}
function emptyInventory(){
  const filtered=Boolean(region||filter||query);
  const previews=!filtered&&view==='owned'?state.catalog.filter(item=>item.kind==='UNIQUE').slice(0,3):[];
  const showcase=previews.length?`<div class="empty-showcase" aria-label="장비 도감 미리보기 · 보유 장비 아님">${previews.map(item=>`<button data-preview-item="${esc(item.code)}" aria-label="${esc(item.name)} 도감 미리보기" style="--accent:${esc(regionMeta(item.regionId)?.accent||'#dfc38b')}"><img src="${esc(item.image)}" alt=""><span>${esc(item.name)}</span><small>도감 미리보기</small></button>`).join('')}</div>`:`<div class="empty-emblem">${icon(filtered?'search':'box')}</div>`;
  return `<div class="inventory-empty">${showcase}<span class="empty-kicker">${filtered?'FIND YOUR EQUIPMENT':'BEGIN YOUR COLLECTION'}</span><b>${filtered?'조건에 맞는 장비가 없습니다':view==='owned'?'당신의 첫 전리품을 기다립니다':'새로운 장비를 준비하고 있습니다'}</b><p>${filtered?'다른 지역·부위 또는 이름으로 찾아보세요.':view==='owned'?'군단토벌에서 얻은 무기와 방어구로<br>용병의 새로운 가능성을 열어 보세요.':'장비가 공개되면 이곳에서<br>능력치와 효과를 확인할 수 있습니다.'}</p>${filtered?`<button data-clear-filters>검색·필터 초기화${icon('refresh')}</button>`:view==='owned'&&state.catalog.length?`<button data-open-catalog>장비 도감 둘러보기${icon('arrow')}</button>`:''}<div class="empty-slots" aria-hidden="true">${Object.keys(labels).map(slotIcon).join('')}</div></div>`;
}
function renderDetail(){
  if(!selected)return;
  const item=selected,meta=definition(item),source=regionMeta(item.regionId),pve=powerOf(item,'PVE'),pvp=powerOf(item,'PVP');
  const polish=item.polish?.values?.map((value,i)=>value?POLISH_OPTIONS[i].name+' +'+value+POLISH_OPTIONS[i].unit:'').filter(Boolean).join(' · ');
  const current=loadout()?.items.find(row=>row.slot===item.slot),difference=powerOf(item)-(current?powerOf(current):0);
  const comparison=item.instanceId?`<div class="comparison"><span>${equipped(item)?'현재 장착 중':current?'현재 '+labels[item.slot]+' 대비':'빈 '+labels[item.slot]+' 슬롯 대비'} · ${mode}</span><b class="${difference>0?'positive':difference<0?'negative':''}">${difference>0?'↑ +':difference<0?'↓ −':''}${fmt(Math.abs(difference))}</b></div>`:`<p class="catalog-note">${meta.available===false?'아직 획득할 수 없는 준비 중인 장비입니다.':'도감에는 기본 전투력이 표시됩니다. 장비 획득 후 ‘내 장비’에서 장착할 수 있습니다.'}</p>`;
  $('#itemDetail').innerHTML=`<div class="detail-layout"><div class="detail-art-wrap" style="--accent:${esc(source?.accent||'#dfc38b')}"><img class="detail-art" src="${esc(item.image)}" alt="${esc(item.name)}"><span class="detail-art-label">${meta.kind==='UNIQUE'?'UNIQUE EQUIPMENT':'LEGION EQUIPMENT'}</span></div><div class="detail-info"><div class="detail-tag">${icon(meta.kind==='UNIQUE'?'spark':'crest')}${meta.kind==='UNIQUE'?'고유 장비':'세트 장비'} · ${labels[item.slot]}<span>${item.instanceId?'보유 장비':'도감'}</span></div><h2 id="itemTitle">${esc(item.name)}${item.level?` <small>+${item.level}</small>`:''}</h2><p class="detail-desc">${esc(source?.name)}<br>${esc(meta.description)}</p><div class="detail-powers"><div data-active="${mode==='PVE'}"><span>PVE POWER</span><strong>+${fmt(pve)}</strong></div><div data-active="${mode==='PVP'}"><span>PVP POWER</span><strong>+${fmt(pvp)}</strong></div></div>${comparison}<div class="detail-effects"><h3>${meta.kind==='SET'?esc(source?.setName)+' 세트 효과':'고유 효과'}</h3>${meta.kind==='SET'?[2,4].map(step=>`<div class="detail-effect-row"><b>${step}세트</b><span>${esc(equipmentEffectText(step===2?source?.two:source?.four))}</span></div>`).join(''):`<p>${esc(meta.description)}</p>`}${polish?`<div class="detail-effect-row"><b>연마 ${item.polish.attempts}회</b><span>${esc(polish)}</span></div>`:''}<small>세트·고유·연마 효과는 PVE에서 발동합니다.</small></div></div></div>`;
  $('#itemActions').innerHTML=item.instanceId?`<button data-save="${equipped(item)?'remove':'equip'}" ${busy?'disabled':''}>${icon(equipped(item)?'close':'check')}${busy?'저장 중…':equipped(item)?mode+' 장착 해제':mode+'에 장착하기'}</button><button data-close class="secondary" ${busy?'disabled':''}>닫기</button>`:`<button data-close class="secondary catalog-close">${view==='catalog'?'도감':'보관함'}으로 돌아가기</button>`;
}
function openItem(item,trigger){selected=item;returnFocus=trigger?.dataset.slot?`[data-slot="${trigger.dataset.slot}"]`:trigger?.dataset.previewItem?`[data-preview-item="${CSS.escape(trigger.dataset.previewItem)}"]`:`[data-item="${CSS.escape(item.instanceId||item.code)}"]`;$('#actionStatus').textContent='';renderDetail();$('#itemDialog').showModal();$('#itemDialog').scrollTop=0;}
async function refresh({quiet=false}={}){
  if(flight)return flight;
  if(!quiet)status('장비 구성을 확인하고 있습니다.');
  $('#refresh').disabled=true;
  flight=Promise.all([request('mercenaries/v3/equipment'),request('mercenaries/v3/state')]).then(([gear,mercenary])=>{
    state=gear;account=mercenary;render();status('PVE·PVP 장비는 각각 저장됩니다.');
  }).catch(error=>{
    status(error.status===401?'로그인 후 용병 장비를 확인할 수 있습니다.':error.message,true);
    if(!state){
      $('#inventory').setAttribute('aria-busy','false');$('#itemCount').textContent='확인 필요';$('#operatorName').textContent='편성 확인 대기';
      $('#inventory').innerHTML=`<div class="inventory-empty"><div class="empty-emblem">${icon('box')}</div><b>${error.status===401?'로그인이 필요합니다':'무장고를 열지 못했습니다'}</b><p>${error.status===401?'상단의 로비로 돌아가기에서 로그인해 주세요.':'연결 상태를 확인하고 다시 시도해 주세요.'}</p><button data-retry>다시 불러오기${icon('refresh')}</button></div>`;
    }
    throw error;
  }).finally(()=>{flight=null;$('#refresh').disabled=false;});
  return flight;
}
async function save(action){
  if(busy||!selected?.instanceId)return;
  const target=selected,instanceId=action==='remove'?null:target.instanceId;
  // Retain the receipt ID across ambiguous failures so retries cannot repeat a mutation.
  if(!pending||pending.mode!==mode||pending.slot!==target.slot||pending.instanceId!==instanceId)pending={requestId:crypto.randomUUID(),mode,slot:target.slot,instanceId,revision:loadout().revision};
  busy=true;renderDetail();$('#actionStatus').textContent='장비 구성을 저장하고 있습니다.';
  try{
    await request('mercenaries/v3/equipment',{method:'POST',body:pending});pending=null;
    try{localStorage.setItem('cnine.mercenary.loadout.changed',String(Date.now()));}catch{}
    await refresh({quiet:true});$('#actionStatus').textContent=instanceId?`${mode} 장착 완료. 용병을 바꿔도 이 구성이 유지됩니다.`:`${mode} 장착을 해제했습니다.`;
  }catch(error){
    if(error.status&&error.status<500){pending=null;await refresh({quiet:true}).catch(()=>{});}
    $('#actionStatus').textContent=error.message;
  }finally{busy=false;renderDetail();}
}
function resetFilters(){region='';filter='';query='';$('#itemSearch').value='';}
function showArsenal(){
  $('#arsenal').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  $('#arsenal').focus({preventScroll:true});
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.mode){
    if(busy)return;mode=target.dataset.mode;selected=null;
    const url=new URL(location.href);url.searchParams.set('mode',mode);history.replaceState(null,'',url);render();
  }
  if(target.dataset.view){view=target.dataset.view;resetFilters();render();}
  if(target.hasAttribute('data-region')){region=target.dataset.region;render();}
  if(target.hasAttribute('data-filter-slot')){filter=target.dataset.filterSlot;render();}
  if(target.hasAttribute('data-open-catalog')){view='catalog';resetFilters();render();}
  if(target.hasAttribute('data-clear-filters')){resetFilters();render();}
  if(target.hasAttribute('data-retry'))void refresh().catch(()=>{});
  if(target.dataset.previewItem){const item=state?.catalog.find(row=>row.code===target.dataset.previewItem);if(item)openItem(item,target);}
  if(target.dataset.item){const item=(view==='owned'?state?.items:state?.catalog)?.find(row=>(row.instanceId||row.code)===target.dataset.item);if(item)openItem(item,target);}
  if(target.dataset.slot){
    const item=loadout()?.items.find(row=>row.slot===target.dataset.slot);
    if(item)openItem(item,target);
    else{resetFilters();filter=target.dataset.slot;view='owned';render();showArsenal();}
  }
  if(target.dataset.save)void save(target.dataset.save);
  if(target.hasAttribute('data-close')||target.id==='closeItem')$('#itemDialog').close();
});
$('#itemSearch').addEventListener('input',event=>{query=event.target.value.trim();renderInventory();});
$('#itemSort').addEventListener('change',event=>{sort=event.target.value;renderInventory();});
$('#refresh').addEventListener('click',()=>void refresh().catch(()=>{}));
for(const link of document.querySelectorAll('a[href="#arsenal"]'))link.addEventListener('click',event=>{event.preventDefault();showArsenal();});
$('#goBack').addEventListener('click',()=>{
  if($('#itemDialog').open){$('#itemDialog').close();return;}
  // A direct/PWA launch may have unrelated browser history. Only return to a known game page.
  let canReturn=false;
  try{const previous=new URL(document.referrer);canReturn=previous.origin===location.origin&&previous.pathname!==location.pathname&&history.length>1;}catch{}
  if(canReturn)history.back();else location.assign('/?screen=home');
});
$('#itemDialog').addEventListener('close',()=>{if(returnFocus)$(returnFocus)?.focus({preventScroll:true});});
$('#itemDialog').addEventListener('click',event=>{
  if(event.target!==$('#itemDialog'))return;
  const rect=event.target.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();
});
addEventListener('focus',()=>{if(!busy)void refresh({quiet:true}).catch(()=>{});});
addEventListener('storage',event=>{if(event.key==='cnine.mercenary.loadout.changed'&&!busy)void refresh({quiet:true}).catch(()=>{});});
render();void refresh().catch(()=>{});
