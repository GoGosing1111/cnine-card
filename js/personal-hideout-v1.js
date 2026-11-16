(function(global){
 'use strict';
 const ART='/assets/ui/personal-hideout-20261116/';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>Number(v||0).toLocaleString('ko-KR');
 let noticeText='',noticeError=false;
 let root=null,data=null,draft=[],room='main',tab='facilities',selected=null,selectedSlot=0,editing=false,dirty=false,busy=false,controller=null,epoch=0,trophies=null,uid=0,drag=null;
 const view=()=>'<section id="personalHideoutRoot" class="ph-root" aria-label="나의 은신처"><div class="ph-loading" role="status">은신처를 불러오는 중…</div></section>';
 const key=()=> 'cnine-hideout-pending:'+uid;
 const pending=()=>{try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}};
 const keep=(value,storageKey=key())=>{try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch{}};
 async function request(path,body){
  const options=body?{method:'POST',body:JSON.stringify(body)}:{signal:controller?.signal};
  if(typeof global.apiRequest==='function')return global.apiRequest(path,options,{ttl:0,microcache:false,replaceInflight:true});
  const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem('cnine_card_api_token')||'')}}),json=await r.json();
  if(!r.ok)throw Object.assign(Error(json.error||'연결을 확인해 주세요.'),{status:r.status,code:json.code});return json;
 }
 function say(text,error=false){noticeText=text;noticeError=error;const el=root?.querySelector('[data-ph-notice]');if(el){el.textContent=text;el.dataset.error=String(error);}}
 function accept(next){data={...data,...next};draft=structuredClone(data.state.placements);dirty=false;if(!data.state.rooms.includes(room))room=data.state.rooms[0]||'main';}
 const allowed=cost=>cost&&Object.entries(cost).every(([c,q])=>data.state.parts[c]>=q);
 const definition=p=>(p.kind==='facility'?data.facilities:data.decor).find(f=>f.code===p.code);
 function pickerHtml(){return '<label class="ph-picker">가구 선택<select data-ph-piece-select aria-label="가구 선택"><option value="">선택하기</option>'+draft.map(p=>'<option value="'+esc(p.id)+'" '+(selected===p.id?'selected':'')+'>'+esc(definition(p)?.name||p.code)+' · '+esc(p.room===null?'보관함':data.rooms.find(r=>r.code===p.room)?.name)+'</option>').join('')+'</select></label>';}
 const partName=code=>data.parts.find(p=>p.code===code)?.name||code;
 function costHtml(cost){return cost?'<ul class="ph-cost">'+Object.entries(cost).map(([c,q])=>'<li class="'+(data.state.parts[c]<q?'short':'')+'"><img src="'+ART+'part-'+c.toLowerCase()+'.webp" width="32" height="32" alt=""><span>'+esc(partName(c))+'</span><b>'+n(data.state.parts[c])+' / '+n(q)+'</b></li>').join('')+'</ul>':'';}
 const button=(action,label,extra='',disabled=false)=>'<button type="button" class="ph-button" data-ph-action="'+action+'" '+extra+' '+(disabled||busy?'disabled':'')+'>'+esc(label)+'</button>';
 const widths={workbench:22,fridge:10,garage:27,armory:18,sofa:22,lamp:7,trophy:36};
 const slotNames=['윗칸 왼쪽','윗칸 오른쪽','가운데 왼쪽','가운데 오른쪽','아랫칸 왼쪽','아랫칸 오른쪽'];
 const trophyCodes=p=>p.trophyCodes||[p.trophyCode||null,null,null,null,null,null];
 function placementStyle(p){const width=widths[p.code]||20;return 'left:'+(width/2+2+p.x/1000*(96-width))+'%;top:'+(82+p.y*.014)+'%;width:'+width+'%;z-index:'+Math.round(p.y+10)+';';}
 function cabinetArt(p,interactive=false){return '<img class="ph-cabinet-body" src="'+ART+'trophy-stand.webp" draggable="false" alt="정면 3단 트로피 진열장" width="551" height="640">'+trophyCodes(p).map((code,i)=>{const t=data.trophyCatalog?.find(t=>t.code===code),content=t?'<img class="ph-displayed-trophy" src="'+esc(t.image)+'" draggable="false" alt="'+esc(t.name)+'">':'<span class="ph-slot-empty">+</span>',attributes='class="ph-cabinet-slot '+(interactive&&selectedSlot===i?'is-selected':'')+'" style="--slot-x:'+(i%2)+';--slot-y:'+Math.floor(i/2)+'"';return interactive?'<button type="button" '+attributes+' data-ph-action="slot" data-slot="'+i+'" aria-label="'+slotNames[i]+(t?' · '+esc(t.name):' · 빈칸')+'" aria-pressed="'+(selectedSlot===i)+'">'+content+'</button>':'<span '+attributes+'>'+content+'</span>';}).join('');}
 function trophyAvailable(t,stand){return t.count-draft.reduce((sum,p)=>sum+trophyCodes(p).filter((code,i)=>code===t.code&&!(p.id===stand?.id&&i===selectedSlot)).length,0);}
 function cabinetFocus(){const p=draft.find(p=>p.id===selected&&p.code==='trophy');return tab==='trophies'&&!editing&&p?'<div class="ph-cabinet-focus"><div class="ph-cabinet-art">'+cabinetArt(p,true)+'</div><p>진열칸을 선택한 뒤 보유 트로피를 놓으세요.</p></div>':null;}
 function propHtml(p){
  const f=definition(p);if(!f)return '';
  const label=f.name+(p.kind==='facility'?' · Lv.'+data.state.facilities[p.code]:p.code==='trophy'?' · '+trophyCodes(p).filter(Boolean).length+'/6':'');
  return '<button type="button" class="ph-prop ph-prop-'+esc(p.code)+(selected===p.id?' selected':'')+'" data-ph-prop="'+esc(p.id)+'" style="'+placementStyle(p)+'" aria-label="'+esc(label)+'" aria-pressed="'+(selected===p.id)+'"><span class="ph-prop-art" style="transform:scaleX('+(p.flipped?-1:1)+')">'+(p.code==='trophy'?cabinetArt(p):'<img src="'+esc(f.image)+'" draggable="false" alt="">')+'</span><span class="ph-prop-label">'+esc(label)+'</span></button>';
 }
 function benefitsHtml(){const b=data.benefits;return '<dl class="ph-benefits"><div><dt>군단 행동력</dt><dd>+'+b.legionEnergy+'</dd></div><div><dt>파티 행동력</dt><dd>+'+b.partyEnergy+'</dd></div><div><dt>용병 장비 드랍</dt><dd>+'+b.mercenaryEquipmentPercent+'%</dd></div><div><dt>카드 고등급 가중치</dt><dd>+'+b.cardWeightPercent+'%</dd></div></dl>';}
 function selectedHtml(){
  const p=draft.find(v=>v.id===selected);if(!p)return '<p class="ph-help">가구를 선택하면 배치와 진열을 변경할 수 있습니다.</p>';
  const f=definition(p);
  return '<section class="ph-selected ph-panel"><h3>'+esc(f.name)+'</h3><label>배치 공간<select data-ph-room-select '+(!editing?'disabled':'')+'>'+data.state.rooms.map(r=>'<option value="'+r+'" '+(p.room===r?'selected':'')+'>'+esc(data.rooms.find(v=>v.code===r).name)+'</option>').join('')+'<option value="storage" '+(p.room===null?'selected':'')+'>보관함</option></select></label><div class="ph-actions">'+button('flip','방향 전환','',!editing)+button('store',p.room===null?'현재 방에 꺼내기':'보관하기','',!editing)+(p.code==='trophy'?button('trophies','진열장 크게 보기','',dirty):'')+'</div><p class="ph-help">꾸미기에서 끌기·바닥 누르기·방향키로 이동합니다. Shift + 방향키로 크게 이동합니다.</p></section>';
 }
 function panelHtml(){
  if(tab==='facilities')return '<article class="ph-panel ph-room-upgrade"><div><small>HIDEOUT</small><h3>은신처 Lv.'+data.state.level+'</h3><p>레벨을 올려 시설 성장과 새 공간을 개방하세요.</p></div>'+costHtml(data.roomCost)+button('upgrade',data.state.level===0?'은신처 무료 개방':data.roomCost?'은신처 업그레이드':'최대 레벨','data-target="room"',!data.roomCost||!allowed(data.roomCost)||dirty)+'</article>'+data.facilities.map(f=>'<article class="ph-panel ph-facility"><div class="ph-facility-head"><img src="'+esc(f.image)+'" width="84" height="84" alt=""><div><h3>'+esc(f.name)+' <small>Lv.'+f.level+'</small></h3><p>'+esc(f.description)+'</p><strong>'+esc(f.effect)+' '+(f.code==='workbench'?'-':'+')+(f.level*f.step)+f.unit+'</strong></div></div>'+costHtml(f.cost)+button('upgrade',!f.cost?'최대 레벨':f.level===0?'시설 설치':'시설 업그레이드','data-target="'+f.code+'"',!f.cost||!allowed(f.cost)||f.level>=data.state.level||dirty)+'</article>').join('');
  if(tab==='decor')return '<p class="ph-help">가구를 추가 제작해 자유롭게 꾸미세요. 장식 복제와 위치 변경은 시설 혜택을 중복시키지 않습니다.</p>'+data.decor.map(f=>'<article class="ph-panel ph-facility"><div class="ph-facility-head"><img src="'+esc(f.image)+'" width="84" height="84" alt=""><h3>'+esc(f.name)+'</h3></div>'+costHtml(f.cost)+button('decorate','추가 제작','data-item="'+f.code+'"',!data.state.level||!allowed(f.cost)||dirty||draft.filter(p=>p.kind==='decor').length>=114)+'</article>').join('')+'<h3>보관한 가구</h3><div class="ph-storage">'+draft.filter(p=>p.room===null).map(p=>button('select',definition(p)?.name||p.code,'data-id="'+esc(p.id)+'"')).join('')+'</div>';
  if(tab==='rooms')return '<p class="ph-help">공간별 가구 배치를 따로 저장합니다. 시설 6개와 장식 114개를 보관·배치할 수 있습니다.</p>'+data.rooms.map(r=>'<article class="ph-panel"><h3>'+esc(r.name)+'</h3><p>은신처 Lv.'+r.requiredLevel+'부터 확장 가능</p>'+costHtml(r.cost)+button('expand',data.state.rooms.includes(r.code)?'개방 완료':'공간 확장','data-room="'+r.code+'"',data.state.rooms.includes(r.code)||data.state.level<r.requiredLevel||!allowed(r.cost)||dirty)+'</article>').join('');
  const stand=draft.find(p=>p.id===selected&&p.code==='trophy');
  return '<p class="ph-help">'+(stand?'선택한 칸: '+slotNames[selectedSlot]+'. 보유 트로피를 놓으세요.':'방의 대형 트로피 진열장을 먼저 선택하세요. 가구·장식에서 제작할 수 있습니다.')+' 트로피 소유권과 기존 효과는 그대로 유지됩니다.</p>'+(trophies===null?button('load-trophies','보유 트로피 불러오기'):trophies.length?'<div class="ph-trophy-list">'+trophies.map(t=>'<article class="ph-panel"><img src="'+esc(t.image)+'" width="120" height="120" alt="" loading="lazy"><h3>'+esc(t.name)+'</h3><p>'+n(t.count)+'개 보유</p>'+button('trophy','진열하기','data-trophy="'+esc(t.code)+'"',!stand||dirty||trophyAvailable(t,stand)<1)+'</article>').join('')+'</div>':'<p>아직 진열할 트로피가 없습니다. 업적과 시즌 보상으로 획득할 수 있습니다.</p>')+(stand?button('trophy','선택한 칸 비우기','data-trophy=""',dirty):'');
 }
 function render(){
  if(!root?.isConnected||!data)return;
  root.innerHTML='<div class="ph-toolbar"><p>전장에서 모은 부품으로 성장시키고, 자유롭게 꾸미세요.</p><b>Lv.'+data.state.level+' <span>/ '+data.maximumLevel+'</span></b></div>'+benefitsHtml()+'<div class="ph-notice" data-ph-notice role="status" aria-live="polite" data-error="'+noticeError+'">'+esc(noticeText)+'</div>'+(pending()?'<div class="ph-recovery ph-panel"><p>저장 결과를 확인하지 못한 요청이 있습니다.</p>'+button('retry','같은 요청으로 결과 확인')+'</div>':'')+'<div class="ph-layout"><section class="ph-space"><nav class="ph-room-tabs" aria-label="공간 선택">'+data.state.rooms.map(r=>button('room',data.rooms.find(v=>v.code===r).name,'data-room="'+r+'" aria-pressed="'+(r===room)+'"')).join('')+'</nav><div class="ph-scene '+(editing?'is-editing':'')+'" data-ph-floor><picture><source media="(max-width:700px)" srcset="'+ART+'room-960.webp"><img class="ph-backdrop" src="'+ART+'room-1440.webp" alt="정면에서 본 개인 은신처" width="1440" height="960" fetchpriority="high"></picture>'+(cabinetFocus()||draft.filter(p=>p.room===room).sort((a,b)=>a.y-b.y).map(propHtml).join(''))+(!data.state.level?'<div class="ph-locked"><h2>첫 은신처를 열어보세요</h2><p>개방 시 군단토벌·파티 군단토벌의<br>최대 행동력이 각각 1 증가합니다.</p>'+button('upgrade','무료 개방','data-target="room"')+'</div>':'')+'</div><div class="ph-editbar">'+button('edit',editing?'꾸미기 종료':'자유롭게 꾸미기','aria-pressed="'+editing+'"',!data.state.level||dirty)+button('save','배치 저장','',!dirty)+button('reset','변경 취소','',!dirty)+'<span>'+(dirty?'아직 저장하지 않은 배치입니다.':'가구를 선택해 살펴보세요.')+'</span></div>'+pickerHtml()+'<div data-ph-selection>'+selectedHtml()+'</div><section class="ph-materials ph-panel"><h2>부품 보관함</h2><div>'+data.parts.map(p=>'<article><img src="'+esc(p.image)+'" width="72" height="72" alt=""><b>'+esc(p.name)+'</b><strong>'+n(data.state.parts[p.code])+'</strong><small>'+esc(p.source)+'</small></article>').join('')+'</div><p>몬스터 토벌·군단토벌·레이드의 확정 보상으로 모읍니다.</p></section></section><aside class="ph-sidebar"><nav class="ph-tabs" aria-label="은신처 관리">'+[['facilities','시설 성장'],['decor','가구·장식'],['trophies','트로피'],['rooms','공간 확장']].map(([v,label])=>button('tab',label,'data-tab="'+v+'" aria-pressed="'+(tab===v)+'"')).join('')+'</nav><div class="ph-panel-list">'+panelHtml()+'</div></aside></div>';
 }
 async function refresh(){const id=epoch;try{const next=await request('hideout');if(id!==epoch||!root?.isConnected)return;accept(next);render();if(next.enabled===false)say('은신처를 준비하고 있습니다.');}catch(e){if(id!==epoch||e.name==='AbortError')return;root.innerHTML='<div class="ph-panel"><h2>은신처 연결을 확인해 주세요</h2><p>'+esc(e.message)+'</p>'+button('refresh','다시 불러오기')+'</div>';}}
 async function mutate(action,fields){
  if(busy||!data)return;const id=epoch,storageKey=key(),prior=pending();
  const job=prior||{action,body:{...fields,revision:data.state.revision,requestId:crypto.randomUUID()}};
  keep(job);busy=true;render();say('저장 중…');
  try{const next=await request('hideout/'+job.action,job.body);keep(null,storageKey);if(id!==epoch||!root?.isConnected)return;accept(next);render();say(next.replayed?'저장된 결과를 복구했습니다.':'저장했습니다.');if(job.action==='trophy'&&matchMedia('(max-width:800px)').matches)root.querySelector('.ph-scene')?.scrollIntoView({block:'nearest'});}
  catch(e){if(id!==epoch||!root?.isConnected)return;if(e.status>=400&&e.status<500){keep(null);if(e.code==='HIDEOUT_CONFLICT')await refresh();}render();say(e.message,true);}
  finally{if(id===epoch){busy=false;root?.querySelectorAll('button').forEach(b=>{if(b.dataset.phBusy)b.disabled=false;});render();}}
 }
 function updateSelection(){if(!root)return;for(const el of root.querySelectorAll('[data-ph-prop]')){const active=el.dataset.phProp===selected;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));}const picker=root.querySelector('[data-ph-piece-select]');if(picker)picker.value=selected||'';const panel=root.querySelector('[data-ph-selection]');if(panel)panel.innerHTML=selectedHtml();}
 function move(x,y){const p=draft.find(p=>p.id===selected);if(!p)return;p.x=Math.max(0,Math.min(1000,Math.round(x)));p.y=Math.max(0,Math.min(1000,Math.round(y)));if(!dirty)root.querySelectorAll('[data-ph-action="upgrade"],[data-ph-action="expand"],[data-ph-action="decorate"],[data-ph-action="trophy"]').forEach(b=>b.disabled=true);dirty=true;const el=root.querySelector('[data-ph-prop="'+CSS.escape(p.id)+'"]');if(el)el.setAttribute('style',placementStyle(p));root.querySelectorAll('[data-ph-action="save"],[data-ph-action="reset"]').forEach(b=>b.disabled=busy);const edit=root.querySelector('[data-ph-action="edit"]');if(edit)edit.disabled=true;const hint=root.querySelector('.ph-editbar > span');if(hint)hint.textContent='아직 저장하지 않은 배치입니다.';}
 function point(event){const rect=root.querySelector('[data-ph-floor]').getBoundingClientRect(),width=widths[draft.find(p=>p.id===selected)?.code]||20;return {x:((event.clientX-rect.left)/rect.width*100-width/2-2)/(96-width)*1000,y:((event.clientY-rect.top)/rect.height*100-82)/.014};}
 async function click(event){
  if(event.detail===0&&event.target.closest('[data-ph-prop]')){selected=event.target.closest('[data-ph-prop]').dataset.phProp;updateSelection();return;}
  const b=event.target.closest('[data-ph-action]');if(!b||busy)return;const a=b.dataset.phAction;
  if(a==='refresh')return refresh();if(a==='retry')return mutate();
  if(a==='room'){room=b.dataset.room;selected=null;render();return;}
  if(a==='tab'){tab=b.dataset.tab;if(tab==='trophies'&&!dirty){editing=false;if(!draft.find(p=>p.id===selected&&p.code==='trophy'))selected=(draft.find(p=>p.code==='trophy'&&p.room===room)||draft.find(p=>p.code==='trophy'))?.id||null;}render();return;}
  if(a==='select'){selected=b.dataset.id;render();return;}
  if(a==='edit'){editing=!editing;render();return;}
  if(a==='reset'){draft=structuredClone(data.state.placements);dirty=false;render();return;}
  if(a==='save')return mutate('arrange',{placements:draft.map(({id,room,x,y,flipped})=>({id,room,x,y,flipped}))});
  if(a==='flip'||a==='store'){const p=draft.find(p=>p.id===selected);if(p&&editing){if(a==='flip')p.flipped=!p.flipped;else p.room=p.room===null?room:null;dirty=true;render();}return;}
  if(a==='trophies'){tab='trophies';editing=false;selectedSlot=0;render();return;}
  if(a==='slot'){selectedSlot=Number(b.dataset.slot);render();if(matchMedia('(max-width:800px)').matches)root.querySelector('.ph-trophy-list')?.scrollIntoView({block:'nearest'});return;}
  if(a==='load-trophies'){const id=epoch;busy=true;b.disabled=true;try{const v=await request('hideout/trophies');if(id===epoch){trophies=v.trophies;render();}}catch(e){if(id===epoch)say(e.message,true);}finally{if(id===epoch){busy=false;render();}}return;}
  if(dirty){say('배치를 먼저 저장하거나 취소해 주세요.',true);return;}
  if(a==='upgrade')return mutate(a,{target:b.dataset.target,room});
  if(a==='decorate')return mutate(a,{item:b.dataset.item,room});
  if(a==='expand')return mutate(a,{room:b.dataset.room});
  if(a==='trophy')return mutate(a,{id:selected,slot:selectedSlot,trophyCode:b.dataset.trophy||null});
 }
 function destroy(){epoch++;controller?.abort();controller=null;root=null;data=null;trophies=null;drag=null;busy=false;editing=false;dirty=false;selected=null;noticeText='';}
 async function bind(user){
  destroy();uid=Number(user?.serverUserId||user?.id||user?.userId||0);root=document.getElementById('personalHideoutRoot');if(!root)return;controller=new AbortController();const signal=controller.signal;
  root.addEventListener('click',click,{signal});
  root.addEventListener('change',e=>{if(e.target.matches('[data-ph-piece-select]')){selected=e.target.value||null;selectedSlot=0;if(tab==='trophies')render();else updateSelection();}else if(e.target.matches('[data-ph-room-select]')){const p=draft.find(p=>p.id===selected);if(!editing||!p)return;p.room=e.target.value==='storage'?null:e.target.value;dirty=true;render();}},{signal});
  root.addEventListener('pointerdown',e=>{
   const el=e.target.closest('[data-ph-prop]');if(el){selected=el.dataset.phProp;if(editing&&!busy){const p=draft.find(v=>v.id===selected);drag={id:e.pointerId,start:point(e),x:p.x,y:p.y,moved:false};root.setPointerCapture(e.pointerId);e.preventDefault();}else updateSelection();}
   else if(editing&&selected&&e.target.closest('[data-ph-floor]')){const pt=point(e);move(pt.x,pt.y);updateSelection();}
  },{signal});
  root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const pt=point(e);if(Math.abs(pt.x-drag.start.x)+Math.abs(pt.y-drag.start.y)>5){drag.moved=true;move(drag.x+pt.x-drag.start.x,drag.y+pt.y-drag.start.y);}},{signal});
  const end=e=>{if(!drag||drag.id!==e.pointerId)return;drag=null;updateSelection();root.querySelector('[data-ph-prop="'+CSS.escape(selected)+'"]')?.focus({preventScroll:true});};
  root.addEventListener('pointerup',end,{signal});root.addEventListener('pointercancel',end,{signal});
  root.addEventListener('keydown',e=>{if(!editing||!e.target.matches('[data-ph-prop]')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;selected=e.target.dataset.phProp;const p=draft.find(p=>p.id===selected),step=e.shiftKey?50:10;e.preventDefault();move(p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0));},{signal});
  await refresh();
 }
 global.PersonalHideout={view,bind,destroy};
})(window);
