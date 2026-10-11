import {jointAccountRequest as request} from '../../js/joint-account-transport.mjs';
import {equipmentEffectText} from '../../shared/equipment-growth-text-v1.mjs';
import {POLISH_OPTIONS} from '../../shared/equipment-polish-v1.mjs';

const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'},symbols={WEAPON:'⚔',TOP:'◇',BOTTOM:'Ⅱ',SHOES:'⌁',ACCESSORY:'✧'};
const fmt=value=>new Intl.NumberFormat('ko-KR').format(Number(value)||0),image=value=>'/'+String(value||'').replace(/^\/+/, '');
let mode=new URL(location.href).searchParams.get('mode')==='PVP'?'PVP':'PVE',state=null,account=null,view='owned',region='',filter='',selected=null,busy=false,flight=null,pending=null;
const loadout=()=>state?.loadouts[mode],equipped=item=>Boolean(item?.instanceId&&loadout()?.items.some(row=>row.instanceId===item.instanceId));
const regionMeta=id=>state?.regions.find(row=>row.id===id),definition=item=>state?.catalog.find(row=>row.code===item.code)||item;
function status(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error);}
function render(){
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));
  $('#loadoutTitle').textContent=mode+' 무장';$('#changeMercenary').href='/mercenary-codex/?view=owned&mode='+mode;
  if(!state)return;
  const gear=loadout(),code=account?.loadouts?.[mode]?.mercenaryCode,mercenary=account?.cards.find(card=>card.code===code);
  $('#operator').innerHTML=mercenary?`<img src="${esc(image(mercenary.sourceArt))}" alt="${esc(mercenary.name)} 원화">`:'<span class="operator-empty" aria-hidden="true">V</span>';
  $('#operatorName').textContent=mercenary?.name||'편성된 용병 없음';$('#operatorRank').textContent=mercenary?mercenary.rank+' / MERCENARY':'MERCENARY';
  $('#equippedCount').innerHTML=String(gear.items.length).padStart(2,'0')+' <small>/ 05</small>';
  $('#gearPower').textContent='+ '+fmt(gear.power);
  $('#powerHint').textContent=mercenary?`${mercenary.name}에게 적용 · 용병 교체 시에도 장비 유지`:'장비 구성은 저장되며, 용병을 편성하면 적용됩니다.';
  $('#slots').innerHTML=state.slots.map(slot=>{
    const item=gear.items.find(item=>item.slot===slot);
    return `<button class="gear-slot" data-slot="${slot}" aria-label="${labels[slot]}: ${esc(item?.name||'비어 있음')}">${item?`<img src="${esc(item.image)}" alt=""><span class="enhance">${item.level?'+'+item.level:''}</span>`:`<span class="empty-symbol" aria-hidden="true">${symbols[slot]}</span>`}<span class="slot-label">${labels[slot]}</span></button>`;
  }).join('');
  $('#effects').innerHTML=mode==='PVP'?'<p class="muted">PVP 장비 전투력이 용병에게 적용됩니다.<br>세트·고유·연마 효과는 PVE에서 발동합니다.</p>':gear.summary?`<p class="muted">${esc(gear.summary)}</p>`:'<p class="muted">세트 2개·4개를 장착하거나 고유 장비를 착용하면 효과가 활성화됩니다.</p>';
  $('#regions').innerHTML=[{id:'',name:'전체',accent:'#d5b87f'},...state.regions.map(row=>({...row,name:({coast:'해안',desert:'사막',theatre:'대극장',viscera:'거수',sky:'천공'})[row.id]}))].map(row=>`<button data-region="${row.id}" style="--accent:${esc(row.accent)}" aria-pressed="${row.id===region}">${esc(row.name)}</button>`).join('');
  renderInventory();
  if(selected&&$('#itemDialog').open){selected=(selected.instanceId?state.items.find(item=>item.instanceId===selected.instanceId):state.catalog.find(item=>item.code===selected.code))||null;if(selected)renderDetail();else $('#itemDialog').close();}
}
function renderInventory(){
  const order=new Map(state.catalog.map((item,index)=>[item.code,index]));
  const items=(view==='owned'?state.items:state.catalog).filter(item=>(!region||item.regionId===region)&&(!filter||item.slot===filter)).sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999)||(b.level||0)-(a.level||0));
  $('#itemCount').textContent=items.length+(view==='owned'?'개':'종');$('#inventory').setAttribute('aria-busy','false');
  $('#inventory').innerHTML=items.length?items.map(item=>{
    const meta=definition(item),owned=state.items.some(row=>row.code===item.code),worn=equipped(item);
    return `<button class="loot-card ${worn?'equipped':''}" data-item="${esc(item.instanceId||item.code)}" style="--accent:${esc(regionMeta(item.regionId)?.accent||'#d5b87f')}"><span class="badge">${worn?'장착 중':meta.kind==='UNIQUE'?'MYTHIC':'SET'}</span>${item.level?`<span class="enhance">+${item.level}</span>`:''}<img class="item-visual" src="${esc(item.image)}" alt="" loading="lazy"><strong>${esc(item.name)}</strong><small>${labels[item.slot]} · ${view==='owned'?'보유':meta.available===false?'준비 중':owned?'보유':'미보유'}</small></button>`;
  }).join(''):`<div class="inventory-empty"><b>${view==='owned'?'보유 장비가 없습니다':'공개된 장비가 없습니다'}</b><p>${view==='owned'?'군단토벌 지역 장비를 획득하면<br>이곳에서 용병에게 장착할 수 있습니다.':'새로운 군단토벌 장비가 준비되면<br>이곳에서 확인할 수 있습니다.'}</p>${view==='owned'&&state.catalog.length?'<button data-open-catalog>장비 도감 보기 ↗</button>':''}</div>`;
}
function renderDetail(){
  if(!selected)return;
  const item=selected,meta=definition(item),source=regionMeta(item.regionId),pve=item.pvePower??Math.floor(meta.totalPower*.9),pvp=item.pvpPower??meta.totalPower-pve;
  const polish=item.polish?.values.map((value,i)=>value?POLISH_OPTIONS[i].name+' +'+value+POLISH_OPTIONS[i].unit:'').filter(Boolean).join(' · ');
  $('#itemDetail').innerHTML=`<img class="detail-art" src="${esc(item.image)}" alt="${esc(item.name)}"><p class="detail-tag">${meta.kind==='UNIQUE'?'MYTHIC / UNIQUE':'LEGENDARY / SET'} · ${mode}</p><h2 id="itemTitle">${esc(item.name)}${item.level?' +'+item.level:''}</h2><p class="detail-desc">${esc(source?.name)} · 용병 ${labels[item.slot]}<br>${esc(meta.description)}</p><div class="detail-powers"><div><span>PVE POWER</span><strong>+${fmt(pve)}</strong></div><div><span>PVP POWER</span><strong>+${fmt(pvp)}</strong></div></div><div class="detail-effects">${meta.kind==='SET'?`<p><b>2세트</b> · ${esc(equipmentEffectText(source.two))}<br><b>4세트</b> · ${esc(equipmentEffectText(source.four))}</p>`:`<p><b>고유 효과</b> · ${esc(meta.description)}</p>`}${polish?`<p><b>연마 ${item.polish.attempts}회</b> · ${esc(polish)}</p>`:''}<p>세트·고유·연마 효과는 PVE에서 발동합니다.</p></div>`;
  $('#itemActions').innerHTML=item.instanceId?`<button data-save="${equipped(item)?'remove':'equip'}" ${busy?'disabled':''}>${busy?'저장 중…':equipped(item)?mode+' 장착 해제':mode+' 장착'}</button><button data-close class="secondary" ${busy?'disabled':''}>닫기</button>`:`<button data-close class="secondary">${meta.available===false?'준비 중인 장비':'보유 장비에서 장착'} · 닫기</button>`;
}
function openItem(item){selected=item;$('#actionStatus').textContent='';renderDetail();$('#itemDialog').showModal();}
async function refresh({quiet=false}={}){
  if(flight)return flight;if(!quiet)status('장비 구성을 확인하고 있습니다.');$('#refresh').disabled=true;
  flight=Promise.all([request('mercenaries/v3/equipment'),request('mercenaries/v3/state')]).then(([gear,mercenary])=>{state=gear;account=mercenary;render();status('PVE·PVP 장비는 각각 저장됩니다.');}).catch(error=>{status(error.status===401?'로그인 후 용병 장비를 확인할 수 있습니다.':error.message,true);throw error;}).finally(()=>{flight=null;$('#refresh').disabled=false;});return flight;
}
async function save(action){
  if(busy||!selected?.instanceId)return;
  const target=selected,instanceId=action==='remove'?null:target.instanceId;
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
document.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.mode){if(busy)return;mode=target.dataset.mode;selected=null;const url=new URL(location.href);url.searchParams.set('mode',mode);history.replaceState(null,'',url);render();}
  if(target.dataset.view){view=target.dataset.view;render();}
  if(target.hasAttribute('data-region')){region=target.dataset.region;render();}
  if(target.hasAttribute('data-open-catalog')){view='catalog';render();}
  if(target.dataset.item){const item=(view==='owned'?state.items:state.catalog).find(row=>(row.instanceId||row.code)===target.dataset.item);if(item)openItem(item);}
  if(target.dataset.slot){const item=loadout()?.items.find(row=>row.slot===target.dataset.slot);if(item)openItem(item);else{filter=target.dataset.slot;$('#slotFilter').value=filter;view='owned';render();$('#arsenal').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}}
  if(target.dataset.save)void save(target.dataset.save);
  if(target.hasAttribute('data-close')||target.id==='closeItem')$('#itemDialog').close();
});
$('#slotFilter').addEventListener('change',event=>{filter=event.target.value;renderInventory();});
$('#refresh').addEventListener('click',()=>void refresh().catch(()=>{}));
$('#itemDialog').addEventListener('click',event=>{if(event.target===$('#itemDialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
addEventListener('focus',()=>{if(!busy)void refresh({quiet:true}).catch(()=>{});});
addEventListener('storage',event=>{if(event.key==='cnine.mercenary.loadout.changed'&&!busy)void refresh({quiet:true}).catch(()=>{});});
render();void refresh().catch(()=>{});
