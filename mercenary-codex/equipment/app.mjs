import {jointAccountRequest as request} from '../../js/joint-account-transport.mjs';
import {POLISH_OPTIONS} from '../../shared/equipment-polish-v1.mjs';
import {equipmentEffectText} from '../../shared/equipment-growth-text-v1.mjs';
import {mercenaryModeAllowed} from '../../shared/mercenary-eunseol-v1.mjs';
import {SLOTS,MODES,LABELS,gearSlots,wornItems,wearer,power,stats,previewChange} from './ui.mjs?v=20261105-mercenary-v2';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numberFormat=new Intl.NumberFormat('ko-KR'),shortFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const fmt=n=>numberFormat.format(n),compact=n=>n>=10000?shortFormat.format(n/10000)+'만':fmt(n);
const paths={back:'<path d="m10 5-7 7 7 7M3 12h18"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',refresh:'<path d="M20 5v6h-6M4 19v-6h6M5 8a8 8 0 0 1 13-2l2 5M4 13l2 5a8 8 0 0 0 13-2"/>',people:'<circle cx="9" cy="7" r="4"/><path d="M2 22v-3c0-9 14-9 14 0v3M17 4a4 4 0 0 1 0 7m2 4c3 1 3 4 3 7"/>',down:'<path d="M12 3v18m-7-7 7 7 7-7"/>',arrow:'<path d="M3 12h18m-7-7 7 7-7 7"/>',expand:'<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>',box:'<path d="m3 7 9-4 9 4v14H3ZM3 7l9 4 9-4M12 11v10"/>',WEAPON:'<path d="m16 3 5 0 0 5-11 11-5-5ZM4 12l8 8M3 21l5-5"/>',TOP:'<path d="m8 3-5 3 2 6 3-1v10h8V11l3 1 2-6-5-3M8 3c0 5 8 5 8 0"/>',BOTTOM:'<path d="M6 3h12l2 18h-6l-2-11-2 11H4ZM6 6h12"/>',SHOES:'<path d="M5 3h9v10l6 3v5H3v-7l2-3ZM3 17h17"/>',ACCESSORY:'<circle cx="12" cy="15" r="6"/><path d="M7 3c0 8 10 8 10 0M9 15l3-3 3 3-3 3Z"/>'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[n]??paths.box}</svg>`;
const effects=equipmentEffectText;
const mobile=matchMedia('(max-width:760px)');
let state,code=new URL(location.href).searchParams.get('mercenary')||'',mode=new URL(location.href).searchParams.get('mode')==='PVP'?'PVP':'PVE',view=new URL(location.href).searchParams.get('view')==='unique'?'unique':'owned',slot='',ownerFilter='',sort='default',query='',mercQuery='',selected=null,busy=false,transferInput=null,toastTimer,lastTrigger=null,pending=null,flight=null,sequence=0,queryTimer;
const pendingKey=()=>`cnine.armory.pending.v2:${state.accountId}`;
const remember=()=>{try{pending?sessionStorage.setItem(pendingKey(),JSON.stringify(pending)):sessionStorage.removeItem(pendingKey());}catch{}};

const selectedMerc=()=>state?.mercenaries.find(m=>m.code===code);
const selectedItem=()=>selected&&(view==='owned'?state.items:state.catalog).find(i=>(i.instanceId??i.code)===selected);
function notify(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.toggle('error',error);$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
function paint(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function inputFor(item,remove=false){return {mercenaryCode:code,mode,slot:item.slot,instanceId:remove?null:item.instanceId};}
function renderRoster(){
 const filtered=state.mercenaries.filter(m=>m.owned&&(!mercQuery||(m.name+' '+m.code).toLowerCase().includes(mercQuery.toLowerCase())));
 $('#mercCount').textContent=state.mercenaries.filter(m=>m.owned).length+'명';
 const markup=filtered.map(m=>`<button class="merc-option" data-merc="${m.code}" aria-pressed="${m.code===code}" aria-label="${esc(m.name)} 선택, ${mode} ${wornItems(state,m.code,mode).length}부위 착용"><img src="${esc(m.sourceArt)}" alt=""><span><b>${esc(m.name)}</b><small>Lv.${m.level}${m.rank?' · '+esc(m.rank):''}</small><small class="worn-count">${wornItems(state,m.code,mode).length} / 5 장착</small></span></button>`).join('')||'<div class="empty"><p>찾는 용병이 없습니다.</p><button class="ui-button" data-reset-merc>검색 초기화</button></div>';
 $('#mercList').innerHTML=markup;$('#mobileMercList').innerHTML=markup;
}
function renderStage(){
 const merc=selectedMerc();if(!merc)return;
 const s=stats(state,code,mode),current=gearSlots(state,code,mode);
 $('#mercName').textContent=merc.name;$('#mercMeta').textContent=[merc.rank,merc.edition==='LIMITED'?'리미티드':null,'Lv.'+merc.level].filter(Boolean).join(' · ');
 if($('#portrait').dataset.code!==code){$('#portrait').src=merc.sourceArt;$('#portrait').dataset.code=code;}$('#portrait').alt=merc.name+' 승인 원화';$('#openArt').setAttribute('aria-label',merc.name+' 원화 크게 보기');
 $('#mobileMerc').innerHTML=`<span>${esc(merc.name)} · 용병 변경</span>${icon('people')}`;
 for(const el of $$('[data-mode]')){el.setAttribute('aria-pressed',String(el.dataset.mode===mode));el.disabled=busy||!mercenaryModeAllowed(code,el.dataset.mode);}
 $('#slots').innerHTML=SLOTS.map(part=>{const item=state.items.find(i=>i.instanceId===current[part]);return `<button class="equip-slot" data-slot="${part}" aria-pressed="${slot===part}" aria-label="${LABELS[part]}: ${esc(item?.name??'빈 슬롯')}" ${busy?'disabled':''}>${item?`<img src="${esc(item.image)}" alt="">`:icon(part)}<b>${LABELS[part]}</b><small>${item?'장착 중':'미장착'}</small></button>`;}).join('');
 $('#slotCount').textContent=s.count+' / 5부위 장착';$('#powerLabel').textContent=mode+' 장비 전투력';$('#gearPower').textContent='+ '+fmt(s.power);
 const individual=wornItems(state,code,mode).filter(item=>item.individualEffects);
 $('#individualPanel').hidden=!individual.length;
 $('#individualList').innerHTML=individual.map(item=>`<div class="set-entry"><strong>${esc(item.passiveName)}<span>${esc(LABELS[item.slot])}</span></strong><p class="active">${esc(effects(item.individualEffects))}</p></div>`).join('');
 $('#setCount').textContent=s.sets.length?s.sets.map(v=>v.name+' '+v.count+'/5').join(' · '):'미적용';
 $('#setEffects').innerHTML=s.sets.map(set=>`<div class="set-entry"><strong>${esc(set.name)}<span>${set.count} / 5</span></strong>${[[2,'two'],[4,'four'],[5,'five']].filter(([,key])=>set[key]).map(([n,key])=>`<p class="${set.count>=n&&(!set.modes||set.modes.includes(mode))?'active':'inactive'}">${n}세트 ${set.modes&&!set.modes.includes(mode)?'PVE 전용':set.count>=n?'적용':'미적용'} · ${esc(effects(set[key]))}</p>`).join('')}</div>`).join('')||'<p class="set-entry">같은 세트의 장비를 모으면 효과가 적용됩니다.</p>';
}
function renderInventory(){
 const candidates=view==='owned'?state.items.filter(i=>state.inventoryIds.includes(i.instanceId)):view==='unique'?state.catalog.filter(i=>i.individualEffects):state.catalog;
 const list=candidates.filter(i=>{const w=i.instanceId?wearer(state,i.instanceId):null;return (!slot||i.slot===slot)&&(!query||(i.individualEffects?[i.name,i.family,i.passiveName,i.tier+'단계','유니크'].join(' '):i.name).toLowerCase().includes(query.toLowerCase()))&&(view!=='owned'||!ownerFilter||(ownerFilter==='free'?!w:ownerFilter==='self'?w?.code===code:w&&w.code!==code));}).sort((a,b)=>sort==='power'?power(b,mode)-power(a,mode):sort==='name'?a.name.localeCompare(b.name,'ko'):0);
 $('#ownedCount').textContent=state.inventoryIds.length+(state.nextCursor?'+':'');$('#loadMore').hidden=view!=='owned'||!state.nextCursor;$('#loadMore').disabled=busy;$('#catalogCount').textContent=state.catalog.length;$('#resultCount').textContent=list.length+(view==='owned'?'개':'종');
 $('#listContext').textContent=(slot?LABELS[slot]:'모든 부위')+' · '+mode+' 전투력';$('#slotFilter').value=slot;$('#ownerFilter').disabled=view!=='owned';
 for(const el of $$('[data-view]')){el.setAttribute('aria-pressed',String(el.dataset.view===view));el.disabled=busy;}
 $('#gearList').innerHTML=list.map(item=>{const w=item.instanceId?wearer(state,item.instanceId):null,key=item.instanceId??item.code;return `<button class="gear-option" ${item.individualEffects?'data-unique-tier="'+item.tier+'"':''} data-item="${esc(key)}" aria-pressed="${selected===key}" aria-label="${esc(item.name)}, ${item.instanceId?'실물 '+item.instanceId+', '+(w?w.name+' 착용':'미착용'):'도감'}, ${mode} ${fmt(power(item,mode))}" ${busy?'disabled':''}>${item.instanceId?`<small class="instance">#${item.instanceId}</small>`:''}<img src="${esc(item.image)}" alt="" loading="lazy"><strong>${esc(item.name)}</strong>${item.individualEffects?'<em class="unique-grade">'+item.tier+'단계 유니크</em>':''}<span>+${compact(power(item,mode))}</span><small class="${w?.code===code?'self':w?'other':''}">${w?esc(w.name)+' 착용 중':item.instanceId?'미착용':'장비 도감'}</small></button>`;}).join('')||`<div class="empty">${icon('box')}<h3>${state.items.length===0&&view==='owned'?'보유 장비가 없습니다':'조건에 맞는 장비가 없습니다'}</h3><p>${state.items.length===0&&view==='owned'?'장비를 획득하면 이곳에서 용병에게 착용할 수 있습니다.':'부위·착용 상태·검색어를 바꿔 보세요.'}</p><button class="ui-button" data-reset-filters>필터 초기화</button>${state.items.length===0&&view==='owned'?'<button class="ui-button" data-view="catalog">장비 도감 보기</button>':''}</div>`;
}
function renderInspection({open=false}={}){
 const panel=$('#inspection'),item=selectedItem();
 if(!item){panel.innerHTML='<div class="inspect-empty"><strong>장비를 선택해 비교하세요.</strong>현재 착용자와 장착 전후 수치를 보여드립니다.</div>';if($('#gearDialog').open)$('#gearDialog').close();$('#inspectionHome').append(panel);return;}
 const current=state.items.find(i=>i.instanceId===gearSlots(state,code,mode)[item.slot]),isWorn=Boolean(item.instanceId&&current?.instanceId===item.instanceId),w=item.instanceId?wearer(state,item.instanceId):null;
 const plan=item.instanceId?previewChange(state,inputFor(item,isWorn)):null;
 let setText='';if(plan){const all=[...new Set([...plan.before.sets,...plan.after.sets].map(s=>s.setId))];setText=all.map(id=>{const b=plan.before.sets.find(s=>s.setId===id),a=plan.after.sets.find(s=>s.setId===id);return (b?.count??0)!==(a?.count??0)?`${esc(a?.name??b?.name)} <b>${b?.count??0} → ${a?.count??0}세트</b>`:'';}).filter(Boolean).join('<br>');}
 const polish=item.polish?.values?.map((v,i)=>v?POLISH_OPTIONS[i].name+' +'+v+POLISH_OPTIONS[i].unit:'').filter(Boolean).join(' · ');
 const passive=item.individualEffects?'<div class="individual-detail"><b>'+item.tier+'단계 '+esc(item.family)+' · '+esc(item.passiveName)+'</b><p>'+esc(effects(item.individualEffects))+'</p><small>한 부위 착용 시 적용 · PVE / PVP</small></div>':item.kind==='UNIQUE'?'<p>고유 효과 · PVE 전용<br>'+esc(item.description)+'</p>':'';
 const details=`<div class="item-details">${item.level?'<p>강화 +'+item.level+' · 수치에 반영</p>':''}${passive}${polish?'<p>연마 '+item.polish.attempts+'회 · PVE 전용<br>'+esc(polish)+'</p>':''}</div>`;
 const targetName=selectedMerc()?.name||'용병 장비 도감';
 $('#gearDialogTitle').textContent=targetName+' · '+mode+' 장비 비교';
 panel.innerHTML=`<p class="target-context">${esc(targetName)} · ${mode} ${LABELS[item.slot]} ${isWorn?'해제':'비교'}</p><div class="inspect-heading" ${item.individualEffects?'data-unique-tier="'+item.tier+'"':''}><img src="${esc(item.image)}" alt=""><div><h3>${esc(item.name)}</h3><p>${LABELS[item.slot]} · ${item.instanceId?'실물 #'+item.instanceId+' · '+(w?esc(w.name)+' 착용 중':'미착용'):'장비 도감 · 기본 수치'}</p></div><button class="ui-button icon-button" data-close-selection aria-label="장비 선택 닫기">${icon('close')}</button></div><table class="compare"><caption class="sr-only">${esc(targetName)}의 ${LABELS[item.slot]} 장착 전후 비교. ${mode}만 변경됩니다.</caption><thead><tr><th>전장</th><th>현재</th><th>${isWorn?'해제 후':'장착 후'}</th><th>차이</th></tr></thead><tbody>${MODES.map(m=>{const currentForMode=state.items.find(i=>i.instanceId===gearSlots(state,code,m)[item.slot]),previous=power(currentForMode,m),val=m===mode?(isWorn?0:power(item,m)):previous,diff=val-previous;return `<tr data-compare-mode="${m}"><td>${m}${m===mode?'':' <small>유지</small>'}</td><td>${compact(previous)}</td><td>${compact(val)}</td><td class="${diff>0?'increase':diff<0?'decrease':''}">${diff>0?'+':diff<0?'−':''}${compact(Math.abs(diff))}</td></tr>`;}).join('')}</tbody></table>${details}${plan?`<p class="set-diff">${mode} 장비 합계 <b>${fmt(plan.before.power)} → ${fmt(plan.after.power)}</b>${setText?'<br>'+setText:''}</p>`:''}${plan?.transfer?`<p class="transfer-note">${esc(plan.transfer.name)}의 ${plan.transfer.modes.join('·')} 착용을 해제하고 ${esc(targetName)}에게 옮깁니다.</p>`:''}${item.instanceId?`<div class="inspect-actions"><button class="ui-button ${isWorn?'':'primary'}" data-save="${isWorn?'remove':'equip'}" ${busy?'disabled':''}>${busy?'저장 중…':isWorn?mode+' 장착 해제':plan.transfer?'장비 이동':current?'장비 교체':'장착하기'}</button></div>`:`<p class="catalog-note">${state.items.some(i=>i.code===item.code)?'보유한 실물을 선택하면 착용할 수 있습니다.':'보유하지 않은 장비는 착용할 수 없습니다.'}</p>${state.mercenaries.length&&state.items.some(i=>i.code===item.code)?'<div class="inspect-actions"><button class="ui-button" data-show-owned="'+esc(item.code)+'">보유 장비 선택</button></div>':''}`}`;
 if(mobile.matches){$('#gearDialogBody').append(panel);if(open&&!$('#gearDialog').open)$('#gearDialog').showModal();}
 else{if($('#gearDialog').open)$('#gearDialog').close();$('#inspectionHome').append(panel);}
}
function focusToken(){const el=document.activeElement;if(el?.dataset.merc)return {kind:'merc',value:el.dataset.merc};if(el?.dataset.item)return {kind:'item',value:el.dataset.item};if(el?.hasAttribute('data-save'))return {kind:'save'};return el?.id?{kind:'id',value:el.id}:null;}
function restoreFocus(token,{fallback=false}={}){if(!token)return;const selector=token.kind==='save'?'#inspection [data-save]':token.kind==='id'?'#'+CSS.escape(token.value):'[data-'+token.kind+'="'+CSS.escape(token.value)+'"]',target=$$(selector).find(el=>el.getClientRects().length&&!el.disabled);if(target)target.focus({preventScroll:true});else if(fallback)$('#storage').focus({preventScroll:true});}
function render(){if(!state)return;const focused=focusToken();renderRoster();renderStage();renderInventory();renderInspection();$('#refresh').disabled=busy;restoreFocus(focused);}
function selectMerc(value){if(busy)return;code=value;if(!mercenaryModeAllowed(code,mode))mode='PVE';selected=null;transferInput=null;$('#confirmDialog').close();$('#mercDialog').close();render();scheduleRefresh();notify(selectedMerc().name+'의 '+mode+' 장비를 보고 있습니다.');}
function resetFilters(){slot='';query='';ownerFilter='';$('#gearSearch').value='';$('#ownerFilter').value='';selected=null;renderInventory();renderInspection();renderStage();scheduleRefresh();}
function showStorage(){if(matchMedia('(max-width:1200px)').matches)$('#storage').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});$('#storage').focus({preventScroll:true});}
function markSelection(key,pressed){if(key)$(`[data-item="${CSS.escape(key)}"]`)?.setAttribute('aria-pressed',String(pressed));}
function choose(key,trigger){if(busy)return;markSelection(selected,false);selected=key;lastTrigger=trigger;markSelection(key,true);renderInspection({open:true});if(!mobile.matches)$(`[data-item="${CSS.escape(key)}"]`)?.focus({preventScroll:true});}
function closeSelection(){const key=selected;markSelection(key,false);selected=null;renderInspection();if(key)$(`[data-item="${CSS.escape(key)}"]`)?.focus({preventScroll:true});}
function confirmTransfer(input){
 const plan=previewChange(state,input),target=state.mercenaries.find(m=>m.code===input.mercenaryCode),item=state.items.find(i=>i.instanceId===input.instanceId);
 transferInput={...input,revision:state.revision,requestId:crypto.randomUUID(),transferConfirmed:true};
 const remaining=plan.replaced?wearer(plan.next,plan.replaced.instanceId):null;
 const replacementNote=plan.replaced?' '+esc(target.name)+'의 기존 장비('+esc(plan.replaced.name)+')는 '+(remaining?remaining.modes.join('·')+' 착용을 유지합니다.':'미착용 상태로 돌아갑니다.'):'';
 $('#confirmBody').innerHTML=`<div class="move-item"><img src="${esc(item.image)}" alt=""><strong>${esc(item.name)}</strong></div><div class="move-route"><div><strong>${esc(plan.transfer.name)}</strong><span>${plan.transfer.modes.join(' · ')} 해제</span></div>${icon('arrow')}<div><strong>${esc(target.name)}</strong><span>${input.mode} 장착</span></div></div><p>장비는 소모되지 않습니다. ${esc(plan.transfer.name)}의 ${plan.transfer.modes.join('·')} ${LABELS[input.slot]} 슬롯이 비워집니다.${replacementNote}</p>`;
 $('#confirmDialog').showModal();
}

function scheduleRefresh(){clearTimeout(queryTimer);if(view==='owned')queryTimer=setTimeout(()=>void refresh().catch(()=>{}),220);}
function normalize(gear,account,append){
 if(gear.schemaVersion!==2)throw Error('새 장비 정보를 준비하고 있습니다. 잠시 후 다시 불러오세요.');
 const mercenaries=account.cards.map(m=>({...m,owned:true,sourceArt:m.sourceArt?.startsWith('/')?m.sourceArt:'/'+m.sourceArt}));
 if(!mercenaries.some(m=>m.code===code))code=account.loadouts?.[mode]?.mercenaryCode||mercenaries[0]?.code||'';
 if(!mercenaryModeAllowed(code,mode))mode='PVE';
 const items=new Map([...(append?state.items:[]),...gear.items,...gear.equippedItems].map(i=>[i.instanceId,i]));
 const definitions=new Map(gear.catalog.map(item=>[item.code,item]));
 for(const item of items.values()){const def=definitions.get(item.code);item.description=def?.description||'';if(def?.individualEffects)Object.assign(item,{tier:def.tier,family:def.family,passiveName:def.passiveName,individualEffects:def.individualEffects});}
 return {schemaVersion:2,accountId:gear.accountId,revision:gear.revision,mercenaries,loadouts:gear.mercenaryLoadouts,items:[...items.values()],inventoryIds:[...new Set([...(append?state.inventoryIds:[]),...gear.items.map(i=>i.instanceId)])],nextCursor:gear.nextCursor,catalog:gear.catalog.map(i=>({...i,pvePower:i.pvePower??Math.floor(i.totalPower*.9),pvpPower:i.pvpPower??i.totalPower-Math.floor(i.totalPower*.9)})),sets:gear.regions.map(r=>({...r,setId:r.setId??gear.catalog.find(i=>i.regionId===r.id&&i.kind==='SET')?.setId,name:r.setName??r.name})),migration:gear.migration};
}
async function refresh({append=false}={}){
 if(busy)return;const current=++sequence,params=new URLSearchParams({slot,query,owner:ownerFilter,mercenaryCode:code});if(append&&state?.nextCursor)params.set('cursor',state.nextCursor);
 $('#refresh').disabled=true;$('#loadMore').disabled=true;
 const task=Promise.all([request('mercenaries/v3/equipment?'+params),request('mercenaries/v3/state')]);flight=task;
 try{const [gear,account]=await task;if(current!==sequence)return;if(append&&state.revision!==gear.revision)return refresh();
  const same=state?.accountId===gear.accountId;state=normalize(gear,account,append&&same);if(!same){selected=null;try{pending=JSON.parse(sessionStorage.getItem(pendingKey())||'null');}catch{pending=null;}}
  const hasMercenary=state.mercenaries.length>0;
  $('#loadStatus').hidden=hasMercenary;$('#workspace').hidden=false;$('#workspace').classList.toggle('catalog-only',!hasMercenary);
  $('[data-view="owned"]').hidden=!hasMercenary;
  if(!hasMercenary&&view==='owned'){view='unique';selected=null;}
  if(!state.mercenaries.length)$('#loadStatus').innerHTML='<strong>보유한 용병이 없습니다.</strong><p>용병을 획득하면 장비를 착용할 수 있습니다.</p><a class="ui-button" href="/mercenary-codex/">용병도감 보기</a>';
  $('#saveStatus').textContent=pending?'이전 저장의 결과 확인이 필요합니다.':state.migration?.cleared?.length?'기존 공유 장비는 PVP 용병에게 계승됐습니다. PVE 장비를 확인해 주세요.':'장착 변경은 계정에 저장됩니다.';
  $('#pendingRetry').hidden=!pending;if(selected&&!selectedItem())selected=null;render();document.documentElement.dataset.ready='true';
 }catch(error){if(current!==sequence)return;if(!state){$('#workspace').hidden=true;$('#loadStatus').hidden=false;$('#loadStatus').innerHTML='<strong>'+(error.status===401?'로그인이 필요합니다.':'장비를 불러오지 못했습니다.')+'</strong><p>'+esc(error.status===401?'로비에서 로그인한 뒤 다시 방문해 주세요.':error.message)+'</p><button class="ui-button primary" data-retry>다시 불러오기</button><a class="ui-button" href="/?screen=home">로비로</a>';}else notify(error.message,true);throw error;
 }finally{if(current===sequence){flight=null;$('#refresh').disabled=false;$('#loadMore').disabled=false;}}
}
async function save(input){
 if(busy)return;if(flight){notify('장비 정보를 불러오는 중입니다. 완료 후 다시 선택해 주세요.');return;}
 if(pending&&pending.requestId!==input.requestId){notify('이전 저장 결과를 먼저 확인해 주세요.',true);$('#pendingRetry').hidden=false;return;}
 const afterFocus=mobile.matches?{kind:'item',value:selected}:{kind:'save'};
 pending=input;remember();busy=true;$('#confirmMove').disabled=true;render();let success=false;
 try{await request('mercenaries/v3/equipment',{method:'POST',body:pending});pending=null;remember();transferInput=null;$('#confirmDialog').close();success=true;try{localStorage.setItem('cnine.mercenary.loadout.changed',String(Date.now()));}catch{}
 }catch(error){if(error.retryable===false||error.status>=400&&error.status<500&&![408,429].includes(error.status)){pending=null;remember();transferInput=null;$('#confirmDialog').close();}notify(error.message,true);
 }finally{busy=false;$('#confirmMove').disabled=false;await refresh().catch(()=>{});if(success){notify((state.mercenaries.find(m=>m.code===input.mercenaryCode)?.name||input.mercenaryCode)+' · '+input.mode+(input.instanceId?' 장착 완료':' 장착 해제 완료'));if(mobile.matches)$('#gearDialog').close();}$('#pendingRetry').hidden=!pending;render();restoreFocus(afterFocus,{fallback:true});}
}
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.close){$('#'+b.dataset.close).close();if(b.dataset.close==='confirmDialog')transferInput=null;return;}
 if(busy)return;
 if(b.dataset.merc)selectMerc(b.dataset.merc);
 if(b.dataset.mode){mode=b.dataset.mode;selected=null;transferInput=null;$('#confirmDialog').close();render();}
 if(b.dataset.view){view=b.dataset.view;selected=null;renderInventory();renderInspection();scheduleRefresh();}
 if(b.dataset.slot){slot=b.dataset.slot;view='owned';query='';ownerFilter='';$('#gearSearch').value='';$('#ownerFilter').value='';selected=null;render();showStorage();scheduleRefresh();}
 if(b.dataset.item)choose(b.dataset.item,b);
 if(b.hasAttribute('data-close-selection'))closeSelection();
 if(b.hasAttribute('data-reset-filters')||b.id==='clearSlot')resetFilters();
 if(b.hasAttribute('data-reset-merc')){mercQuery='';$('#mercSearch').value='';renderRoster();}
 if(b.hasAttribute('data-show-owned')){const item=state.items.find(i=>i.code===b.dataset.showOwned);view='owned';resetFilters();choose(item.instanceId,b);}
 if(b.dataset.save){const item=selectedItem();if(!item?.instanceId)return;const input=inputFor(item,b.dataset.save==='remove'),plan=previewChange(state,input);if(plan.transfer)confirmTransfer(input);else void save({...input,revision:state.revision,requestId:crypto.randomUUID(),transferConfirmed:false});}
 if(b.id==='confirmMove'&&transferInput)void save(transferInput);
 if(b.id==='mobileMerc'){$('#mercDialog').showModal();}
 if(b.id==='openArt'){const m=selectedMerc();$('#artTitle').textContent=m.name;$('#fullArt').src=m.sourceArt;$('#fullArt').alt=m.name+' 승인 원화';$('#artDialog').showModal();}
 if(b.id==='inventoryJump')showStorage();
 if(b.id==='refresh'||b.hasAttribute('data-retry'))void refresh().catch(()=>{});
 if(b.id==='loadMore')void refresh({append:true}).catch(()=>{});
 if(b.id==='pendingRetry'&&pending)void save(pending);
 if(b.id==='back'){if(selected)closeSelection();else if(slot||query||ownerFilter)resetFilters();else location.assign('/?screen=home');}
});
$('#gearSearch').addEventListener('input',e=>{query=e.target.value.trim();renderInventory();scheduleRefresh();});
$('#mercSearch').addEventListener('input',e=>{mercQuery=e.target.value.trim();renderRoster();});
$('#slotFilter').addEventListener('change',e=>{slot=e.target.value;selected=null;renderStage();renderInventory();renderInspection();scheduleRefresh();});
$('#ownerFilter').addEventListener('change',e=>{ownerFilter=e.target.value;selected=null;renderInventory();renderInspection();scheduleRefresh();});
$('#sortFilter').addEventListener('change',e=>{sort=e.target.value;renderInventory();});
$('#gearDialog').addEventListener('close',()=>{if(selected&&mobile.matches)$(`[data-item="${CSS.escape(selected)}"]`)?.focus({preventScroll:true});});
$('#confirmDialog').addEventListener('cancel',()=>{transferInput=null;});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&selected){closeSelection();return;}
 const card=e.target.closest('.gear-option,.merc-option');if(!card)return;
 const list=[...card.parentElement.querySelectorAll(card.classList.contains('gear-option')?'.gear-option':'.merc-option')],index=list.indexOf(card),cols=card.classList.contains('gear-option')?getComputedStyle(card.parentElement).gridTemplateColumns.split(' ').length:1;
 const next={ArrowRight:index+1,ArrowLeft:index-1,ArrowDown:index+cols,ArrowUp:index-cols,Home:0,End:list.length-1}[e.key];
 if(next!==undefined){e.preventDefault();list[Math.max(0,Math.min(list.length-1,next))]?.focus();}
});
addEventListener('storage',e=>{if(['cnine.mercenary.loadout.changed','cnine_card_api_token'].includes(e.key)&&!busy)void refresh().catch(()=>{});});
addEventListener('cnine:account-sync',event=>{if(!busy&&event.detail?.domains?.some(d=>['collection','inventory','loadout'].includes(d)))void refresh().catch(()=>{});});
addEventListener('focus',()=>{if(!busy)void refresh().catch(()=>{});});
addEventListener('pagehide',()=>{clearTimeout(queryTimer);clearTimeout(toastTimer);sequence++;});
addEventListener('pageshow',event=>{if(event.persisted&&!busy)void refresh().catch(()=>{});});
mobile.addEventListener('change',()=>renderInspection());
paint();void refresh().catch(()=>{});
