(function(global){
 'use strict';
 const ART='/assets/ui/personal-hideout-20261116/';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>Number(v||0).toLocaleString('ko-KR');
 function coinLabel(value){
  const amount=BigInt(value);
  for(const [unit,label] of [[10000000000000000n,'경'],[1000000000000n,'조']]){
   if(amount<unit)continue;
   const fraction=(amount%unit*100n/unit).toString().padStart(2,'0').replace(/0+$/,'');
   return (amount/unit).toLocaleString('ko-KR')+(fraction?'.'+fraction:'')+label;
  }
  return amount.toLocaleString('ko-KR');
 }
 let noticeText='',noticeError=false;
 let root=null,data=null,draft=[],room='main',tab='facilities',selected=null,selectedSlot=0,editing=false,dirty=false,busy=false,controller=null,epoch=0,trophies=null,uid=0,drag=null,targeting=false;
 let camera=0,scale=1,propScale=1,stopSizing=null;
 let raidView=null,openingRaid=false,projectRaidPlacement=null;
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
 const coinShort=cost=>cost!=null&&data.coinBalance!=null&&BigInt(data.coinBalance)<BigInt(cost);
 const definition=p=>(p.kind==='facility'?data.facilities:data.decor).find(f=>f.code===p.code);
 function pickerHtml(){return '<label class="ph-picker">가구 선택<select data-ph-piece-select aria-label="가구 선택"><option value="">선택하기</option>'+draft.map(p=>'<option value="'+esc(p.id)+'" '+(selected===p.id?'selected':'')+'>'+esc(definition(p)?.name||p.code)+' · '+esc(p.room===null?'보관함':data.rooms.find(r=>r.code===p.room)?.name)+'</option>').join('')+'</select></label>';}
 const partName=code=>data.parts.find(p=>p.code===code)?.name||code;
 function costHtml(cost,coinCost){
  if(!cost)return '';
  const short=coinShort(coinCost);
  const coin=coinCost&&coinCost!=='0'?'<li class="'+(short?'short':'')+'"><img src="/assets/ui/icon-fusion-20261004/coin.webp" width="32" height="32" alt=""><span>'+(short?'코인 부족':'필요 코인')+'</span><b title="'+BigInt(coinCost).toLocaleString('ko-KR')+' 코인">'+coinLabel(coinCost)+'</b></li>':'';
  return '<ul class="ph-cost">'+coin+Object.entries(cost).map(([c,q])=>'<li class="'+(data.state.parts[c]<q?'short':'')+'"><img src="'+esc(data.parts.find(part=>part.code===c)?.image||ART+'part-'+c.toLowerCase()+'.webp')+'" width="32" height="32" alt=""><span>'+esc(partName(c))+'</span><b>'+n(data.state.parts[c])+' / '+n(q)+'</b></li>').join('')+'</ul>';
 }
 const button=(action,label,extra='',disabled=false)=>'<button type="button" class="ph-button" data-ph-action="'+action+'" '+extra+' '+(disabled||busy?'disabled':'')+'>'+esc(label)+'</button>';
 const pieceWidth=p=>data.space.furnitureWidths[p.code]||320;
 const zoneFor=p=>data.space.rooms.find(z=>z.code===p.room);
 const worldX=p=>{const z=zoneFor(p),w=pieceWidth(p);return z.start+20+w/2+p.x/1000*(z.width-w-40);};
 const wall=p=>definition(p)?.surface==='wall';
 const worldY=p=>wall(p)?262+p.y*.20:512+p.y*.1024;
 const slotNames=['윗칸 왼쪽','윗칸 오른쪽','가운데 왼쪽','가운데 오른쪽','아랫칸 왼쪽','아랫칸 오른쪽'];
 const trophyCodes=p=>p.trophyCodes||[p.trophyCode||null,null,null,null,null,null];
 function placementStyle(p){return 'left:'+(worldX(p)*scale)+'px;top:'+(worldY(p)*scale)+'px;width:'+(pieceWidth(p)*propScale)+'px;z-index:'+(wall(p)?4:Math.round(p.y+10))+';';}
 function viewport(){return root?.querySelector('[data-ph-viewport]');}
 function syncCamera(){
  const view=viewport();if(!view||!data)return;
  camera=view.scrollLeft/scale;
  const visible=view.clientWidth/scale,maximum=Math.max(0,data.space.width-visible),center=camera+visible/2;
  room=(data.space.rooms.find(z=>center>=z.start&&center<z.start+z.width)||data.space.rooms.at(-1)).code;
  root.querySelectorAll('[data-ph-action="room"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.room===room)));
  root.querySelectorAll('[data-ph-action="pan"]').forEach(b=>b.disabled=busy||(Number(b.dataset.step)<0?camera<=1:camera>=maximum-1));
  const zoneLabel=root.querySelector('[data-ph-scene-zone]');
  if(zoneLabel)zoneLabel.textContent=data.space.rooms.find(z=>z.code===room).name;
  const range=root.querySelector('[data-ph-camera]');if(range){range.value=maximum?Math.round(camera/maximum*1000):0;range.disabled=!maximum;}
  const marker=root.querySelector('.ph-map-window');if(marker){marker.style.left=(camera/data.space.width*100)+'%';marker.style.width=(Math.min(1,visible/data.space.width)*100)+'%';}
  const label=root.querySelector('[data-ph-location]');if(label)label.textContent=data.space.rooms.find(z=>z.code===room).name+' · '+Math.min(Math.ceil(data.space.width/visible),Math.floor(camera/visible)+1)+' / '+Math.ceil(data.space.width/visible);
 }
 function setCamera(value){const view=viewport();if(!view)return;view.scrollLeft=Math.max(0,value)*scale;syncCamera();}
 function observeWorld(){
  const view=viewport();if(!view)return null;
  let width=0,height=0,frame=0;
  function fit(){
   frame=0;
   const w=view.clientWidth,h=view.clientHeight;
   if(!w||!h||(w===width&&h===height))return;
   width=w;height=h;measureWorld(h,w);
  }
  fit();
  const observer=new ResizeObserver(()=>{
   if(!frame&&(view.clientWidth!==width||view.clientHeight!==height))frame=requestAnimationFrame(fit);
  });
  observer.observe(view);
  return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
 }
 function measureWorld(height,width){
  const saved=camera;scale=height/data.space.height;
  propScale=Math.min(scale,width/720);
  const world=root.querySelector('[data-ph-world]');world.style.width=(data.space.width*scale)+'px';
  root.querySelectorAll('[data-ph-bay]').forEach(el=>{el.style.left=Number(el.dataset.phBay)*data.space.bayWidth*scale+'px';el.style.width=data.space.bayWidth*scale+'px';});
  root.querySelectorAll('[data-ph-zone]').forEach(el=>{const z=data.space.rooms.find(z=>z.code===el.dataset.phZone);el.style.left=z.start*scale+'px';el.style.width=z.width*scale+'px';});
  root.querySelectorAll('[data-ph-prop]').forEach(el=>{const p=draft.find(p=>p.id===el.dataset.phProp);el.setAttribute('style',placementStyle(p));});
  setCamera(saved);
 }
 function focusPlacement(){const p=draft.find(p=>p.id===selected);if(!p?.room)return;room=p.room;const view=viewport();if(view)setCamera(worldX(p)-view.clientWidth/scale/2);}
 function residenceHtml(){return '<ol class="ph-residences" aria-label="은신처 성장 단계">'+data.stages.map(t=>'<li class="'+(t.level===data.state.level?'current':t.level<data.state.level?'complete':'')+'" '+(t.level===data.state.level?'aria-current="step"':'')+'><span>'+t.level+'</span><b>'+esc(t.name)+'</b></li>').join('')+'</ol>';}
 function sceneHtml(){
  const focus=cabinetFocus();if(focus)return focus;
  const bays=Math.ceil(data.space.width/data.space.bayWidth),stage=data.stage;
  return '<div class="ph-viewport" data-ph-viewport tabindex="0" role="region" aria-label="'+esc(stage.name)+' 내부. 좌우로 이동하며 꾸밀 수 있습니다."><div class="ph-world" data-ph-world>'+Array.from({length:bays},(_,i)=>'<picture class="ph-bay" data-ph-bay="'+i+'"><img class="ph-backdrop" src="'+esc(stage.image)+'" alt="" width="1440" height="960" '+(i===0?'fetchpriority="high"':'decoding="async"')+'></picture>').join('')+data.space.rooms.map(z=>'<div class="ph-zone" data-ph-zone="'+z.code+'"></div>').join('')+draft.filter(p=>p.room!==null).sort((a,b)=>a.y-b.y).map(propHtml).join('')+'</div></div><span class="ph-scene-zone" data-ph-scene-zone aria-hidden="true"></span><div class="ph-walk-controls">'+button('pan','←','data-step="-1" aria-label="왼쪽으로 이동"')+button('pan','→','data-step="1" aria-label="오른쪽으로 이동"')+'</div>';
 }
 function cameraHtml(){return '<div class="ph-camera-bar"><div class="ph-camera-center"><div class="ph-minimap" aria-hidden="true">'+data.space.rooms.map(z=>'<span style="left:'+(z.start/data.space.width*100)+'%;width:'+(z.width/data.space.width*100)+'%"></span>').join('')+'<i class="ph-map-window"></i></div><input type="range" min="0" max="1000" value="0" data-ph-camera aria-label="은신처 이동 위치"><span data-ph-location></span></div></div><p class="ph-pan-help">빈 공간을 끌거나 좌우 버튼으로 이동하세요.</p>';}
 function cabinetArt(p,interactive=false){return '<img class="ph-cabinet-body" src="'+ART+'trophy-stand.webp" draggable="false" alt="정면 3단 트로피 진열장" width="551" height="640">'+trophyCodes(p).map((code,i)=>{const t=data.trophyCatalog?.find(t=>t.code===code),content=t?'<img class="ph-displayed-trophy" src="'+esc(t.image)+'" draggable="false" alt="'+esc(t.name)+'">':'<span class="ph-slot-empty">+</span>',attributes='class="ph-cabinet-slot '+(interactive&&selectedSlot===i?'is-selected':'')+'" style="--slot-x:'+(i%2)+';--slot-y:'+Math.floor(i/2)+'"';return interactive?'<button type="button" '+attributes+' data-ph-action="slot" data-slot="'+i+'" aria-label="'+slotNames[i]+(t?' · '+esc(t.name):' · 빈칸')+'" aria-pressed="'+(selectedSlot===i)+'">'+content+'</button>':'<span '+attributes+'>'+content+'</span>';}).join('');}
 function trophyAvailable(t,stand){return t.count-draft.reduce((sum,p)=>sum+trophyCodes(p).filter((code,i)=>code===t.code&&!(p.id===stand?.id&&i===selectedSlot)).length,0);}
 function cabinetFocus(){const p=draft.find(p=>p.id===selected&&p.code==='trophy');return tab==='trophies'&&!editing&&p?'<div class="ph-cabinet-focus"><div class="ph-cabinet-art">'+cabinetArt(p,true)+'</div><p>진열칸을 선택한 뒤 보유 트로피를 놓으세요.</p></div>':null;}
 function propHtml(p){
  const f=definition(p);if(!f)return '';
  const label=f.name+(p.kind==='facility'?' · Lv.'+data.state.facilities[p.code]:p.code==='trophy'?' · '+trophyCodes(p).filter(Boolean).length+'/6':'');
  return '<button type="button" class="ph-prop ph-prop-'+esc(p.code)+(selected===p.id?' selected':'')+'" data-ph-prop="'+esc(p.id)+'" style="'+placementStyle(p)+'" aria-label="'+esc(label)+'" aria-pressed="'+(selected===p.id)+'"><span class="ph-prop-art" style="transform:scaleX('+(p.flipped?-1:1)+')">'+(p.code==='trophy'?cabinetArt(p):'<img src="'+esc(data.skins?.find(s=>s.code===p.skin)?.image||f.image)+'" draggable="false" alt="">')+'</span><span class="ph-prop-label">'+esc(label)+'</span></button>';
 }
 function benefitsHtml(){const b=data.benefits;return '<dl class="ph-benefits"><div><dt>군단 행동력</dt><dd>+'+b.legionEnergy+'</dd></div><div><dt>파티 행동력</dt><dd>+'+b.partyEnergy+'</dd></div><div><dt>용병 장비 드랍</dt><dd>+'+b.mercenaryEquipmentPercent+'%</dd></div><div><dt>카드 고등급 가중치</dt><dd>+'+b.cardWeightPercent+'%</dd></div></dl>';}
 function skinHtml(p){
  const skin=data.skins?.find(s=>s.target===p.code);if(!skin)return '';
  const owned=data.state.unlockedSkins?.includes(skin.code),equipped=p.skin===skin.code;
  return '<div class="ph-skin"><h4>'+esc(skin.name)+'</h4>'+
   (owned?button('equipSkin',equipped?'기본 외형으로':'스킨 적용',equipped?'':'data-skin="'+esc(skin.code)+'"',dirty):
    '<p>고급 아파트 이상 · 코인 '+n(skin.coin/1e12)+'조'+' · 마스터의 별 '+n(skin.stars)+'</p>'+costHtml(skin.parts)+
    button('unlockSkin','스킨 해금','data-skin="'+esc(skin.code)+'"',dirty||data.state.level<skin.level||!allowed(skin.parts)))+'</div>';
 }
 function selectedHtml(){
  const p=draft.find(v=>v.id===selected);if(!p)return '<p class="ph-help">가구를 선택하면 배치와 진열을 변경할 수 있습니다.</p>';
  const f=definition(p);
  return '<section class="ph-selected ph-panel"><h3>'+esc(f.name)+'</h3><label>배치 공간<select data-ph-room-select '+(!editing?'disabled':'')+'>'+data.state.rooms.map(r=>'<option value="'+r+'" '+(p.room===r?'selected':'')+'>'+esc(data.rooms.find(v=>v.code===r).name)+'</option>').join('')+'<option value="storage" '+(p.room===null?'selected':'')+'>보관함</option></select></label><div class="ph-actions">'+button('flip','방향 전환','',!editing)+button('target',targeting?'방에서 위치 선택':'위치 지정','aria-pressed="'+targeting+'"',!editing)+button('store',p.room===null?'현재 방에 꺼내기':'보관하기','',!editing)+(p.code==='trophy'?button('trophies','진열장 크게 보기','',dirty):'')+'</div><p class="ph-help">가구를 끌거나 방향키로 배치합니다. 빈 공간을 끌면 화면이 이동합니다.</p>'+skinHtml(p)+'</section>';
 }
 function facilityHtml(f){
  const title=!f.cost?'최대 레벨':f.level===0?'시설 설치':'시설 업그레이드';
  const disabled=!allowed(f.cost)||coinShort(f.coinCost)||f.level>=data.facilityMaximum||dirty;
  return `<article class="ph-panel ph-facility">
   <div class="ph-facility-head"><img src="${esc(f.image)}" width="84" height="84" loading="lazy" decoding="async" alt="">
    <div><h3>${esc(f.name)} <small>Lv.${f.level}</small></h3><p>${esc(f.description)}</p>
     <strong>${esc(f.effect)} ${f.code==='workbench'?'-':'+'}${f.level*f.step}${f.unit}</strong></div>
   </div>
   ${costHtml(f.cost,f.coinCost)}
   ${button('upgrade',title,'data-target="'+f.code+'"',disabled)}
  </article>`;
 }
 function residenceUpgradeHtml(){
  const title=data.state.level===0?'은신처 무료 개방':data.roomCost?'다음 거주지로 업그레이드':'최종 단계';
  const disabled=!allowed(data.roomCost)||coinShort(data.roomCoinCost)||dirty;
  return `<article class="ph-panel ph-room-upgrade"><div>
   <small>거주 등급 ${data.state.level} / ${data.maximumLevel}</small>
   <h3>${esc(data.stage.name)}</h3><p>${esc(data.stage.description)}</p>
   <strong>${data.nextStage?'다음 거주지 · '+esc(data.nextStage.name):'최종 거주지'}</strong>
   ${data.state.level&&data.nextStage?'<p>필요한 코인과 부품을 모으면 승급할 수 있습니다.</p>':''}
   <p>건축 설계도는 한국 시간 기준 군단토벌(1인·파티 공통), 아포칼립스, 무한의탑의 하루 첫 승리에서 각각 1개를 얻습니다.</p>
   <p>시설은 Lv.${data.facilityMaximum}까지 성장할 수 있습니다.</p>
   ${data.coinBalance==null?'':'<p>보유 코인 <b data-ph-coin-balance title="'+BigInt(data.coinBalance).toLocaleString('ko-KR')+'">'+coinLabel(data.coinBalance)+'</b></p>'}
  </div>${costHtml(data.roomCost,data.roomCoinCost)}${button('upgrade',title,'data-target="room"',disabled)}</article>`;
 }
 function defenseOverview(zone){
  const space=data.space.rooms.find(r=>r.code===zone);
  if(!space||!projectRaidPlacement)return '';
  const props=data.state.placements.filter(p=>p.room===zone).map(p=>{
   const item=definition(p),skin=data.skins.find(s=>s.code===p.skin);
   const pos=projectRaidPlacement({...p,width:pieceWidth(p),surface:item.surface},space.width);
   const art=p.code==='trophy'?cabinetArt(p):'<img src="'+esc(skin?.image||item.image)+'" alt="'+esc(item.name)+'">';
   return '<div class="ph-defense-prop '+(pos.wall?'is-wall':'')+'" style="left:'+pos.x*100+'%;top:'+pos.y*100+'%;width:'+pos.width*100+'%;z-index:'+(pos.wall?0:1+p.y)+'"><span style="transform:scaleX('+(p.flipped?-1:1)+')">'+art+'</span></div>';
  }).join('');
  return '<details class="ph-defense-overview"><summary>저장된 방어 배치 보기</summary><figure aria-label="'+esc(space.name)+' 전체 방어 배치"><img class="ph-defense-backdrop" src="'+ART+'battle-'+esc(data.stage.code)+'.webp" alt="">'+props+'</figure></details>';
 }
 function panelHtml(){
  if(tab==='defense'&&data.raidEnabled) {
   const zone=data.state.defenseRoom||'main';
   const name=code=>data.rooms.find(r=>r.code===code)?.name||'보관함';
   const rareParts=['STRUCTURE','CORE'].map(code=>data.parts.find(p=>p.code===code)).filter(Boolean);
   return '<div class="ph-defense-zone"><h3>방어 구역</h3><p>내 은신처에 무인기관포와 포탑을 한 대씩 설치할 수 있습니다. 약탈전이 열리면 선택한 방의 시설이 저장된 위치에서 침입자를 막습니다.</p><div class="ph-actions">'+data.state.rooms.map(r=>button('defenseRoom',name(r),'data-room="'+r+'" aria-pressed="'+(r===zone)+'"',dirty||r===zone)).join('')+'</div></div>'+
    data.decor.filter(v=>v.defense).map(f=>{
     const p=draft.find(v=>v.code===f.code);
     const enough=allowed(f.cost);
     const header='<div class="ph-defense-head"><img class="ph-defense-art" src="'+esc(f.image)+'" alt=""><div><h3>'+esc(f.name)+'</h3><p>'+esc(f.effect)+'</p></div></div>';
     const install='<div class="ph-defense-recipe"><div><b>설치 재료</b><small>보유 / 필요</small></div>'+costHtml(f.cost)+'</div>'+
      button('installDefense',f.name+' 설치'+(enough?'':' · 재료 부족'),'data-item="'+f.code+'"',!data.state.level||!enough||dirty);
     return '<article class="ph-panel ph-facility ph-defense-card">'+header+
      (p?'<strong>'+esc(name(p.room))+' · '+(p.room===zone?'방어 중':'대기')+'</strong>'+button('select','배치 보기','data-id="'+esc(p.id)+'"'):install)+'</article>';
    }).join('')+'<details class="ph-defense-sources"><summary>희귀 재료 획득처</summary><dl>'+rareParts.map(p=>'<div><dt>'+esc(p.name)+'</dt><dd>'+esc(p.source)+'</dd></div>').join('')+'</dl></details>'+defenseOverview(zone);
  }
  if(tab==='facilities')return residenceUpgradeHtml()+data.facilities.map(facilityHtml).join('');
  if(tab==='decor')return '<p class="ph-help">가구를 추가 제작해 자유롭게 꾸미세요. 장식 복제와 위치 변경은 시설 혜택을 중복시키지 않습니다.</p>'+data.decor.filter(f=>!f.defense).map(f=>'<article class="ph-panel ph-facility"><div class="ph-facility-head"><img src="'+esc(f.image)+'" width="84" height="84" loading="lazy" decoding="async" alt=""><h3>'+esc(f.name)+'</h3></div>'+costHtml(f.cost)+button('decorate','추가 제작','data-item="'+f.code+'"',!data.state.level||!allowed(f.cost)||dirty||draft.filter(p=>p.kind==='decor').length>=114)+'</article>').join('')+'<h3>보관한 가구</h3><div class="ph-storage">'+draft.filter(p=>p.room===null).map(p=>button('select',definition(p)?.name||p.code,'data-id="'+esc(p.id)+'"')).join('')+'</div>';
  if(tab==='rooms')return '<p class="ph-help">새 구역이 집 옆으로 이어집니다. 이동하면서 구역마다 꾸밀 수 있습니다. 시설 6개와 장식 114개를 보관·배치할 수 있습니다.</p>'+data.rooms.map(r=>'<article class="ph-panel"><h3>'+esc(r.name)+'</h3><p>은신처 Lv.'+r.requiredLevel+'부터 확장 가능</p>'+costHtml(r.cost)+button('expand',data.state.rooms.includes(r.code)?'개방 완료':'공간 확장','data-room="'+r.code+'"',data.state.rooms.includes(r.code)||data.state.level<r.requiredLevel||!allowed(r.cost)||dirty)+'</article>').join('');
  const stand=draft.find(p=>p.id===selected&&p.code==='trophy');
  return '<p class="ph-help">'+(stand?'선택한 칸: '+slotNames[selectedSlot]+'. 보유 트로피를 놓으세요.':'방의 대형 트로피 진열장을 먼저 선택하세요. 가구·장식에서 제작할 수 있습니다.')+' 트로피 소유권과 기존 효과는 그대로 유지됩니다.</p>'+(trophies===null?button('load-trophies','보유 트로피 불러오기'):trophies.length?'<div class="ph-trophy-list">'+trophies.map(t=>'<article class="ph-panel"><img src="'+esc(t.image)+'" width="120" height="120" alt="" loading="lazy"><h3>'+esc(t.name)+'</h3><p>'+n(t.count)+'개 보유</p>'+button('trophy','진열하기','data-trophy="'+esc(t.code)+'"',!stand||dirty||trophyAvailable(t,stand)<1)+'</article>').join('')+'</div>':'<p>아직 진열할 트로피가 없습니다. 업적과 시즌 보상으로 획득할 수 있습니다.</p>')+(stand?button('trophy','선택한 칸 비우기','data-trophy=""',dirty):'');
 }
 function render(){
  if(!root?.isConnected||!data)return;
  stopSizing?.();
  const cabinet=cabinetFocus();
  const sections=[['facilities','시설 성장'],['decor','가구·장식'],['trophies','트로피'],['rooms','공간 확장']];
  if(data.raidEnabled===true&&data.state.level)sections.splice(1,0,['defense','방어시설']);
  root.innerHTML=`
   <header class="ph-toolbar">
    <div><small>현재 거주지</small><strong>${esc(data.stage.name)}</strong></div>
    <b>${data.state.level} <span>/ ${data.maximumLevel} 단계</span></b>
   </header>
   <div class="ph-notice" data-ph-notice role="status" aria-live="polite" data-error="${noticeError}">${esc(noticeText)}</div>
   ${data.raidEnabled===true&&data.state.level?'<button type="button" class="ph-raid-entry" data-ph-action="raid"><span><small>20:30–22:00 KST</small><strong>은신처 약탈전</strong><em>내구도 '+n(data.state.durability??100)+' / 100</em></span><b>작전실 입장 <i class="ph-raid-arrow" aria-hidden="true"></i></b></button>':''}
   ${pending()?'<div class="ph-recovery ph-panel"><p>저장 결과를 확인하지 못한 요청이 있습니다.</p>'+button('retry','같은 요청으로 결과 확인')+'</div>':''}
   <section class="ph-space" aria-label="은신처 내부">
    ${data.state.rooms.length>1?'<nav class="ph-room-tabs" aria-label="구역으로 이동">'+data.state.rooms.map(r=>button('room',data.rooms.find(v=>v.code===r).name,'data-room="'+r+'" aria-pressed="'+(r===room)+'"')).join('')+'</nav>':''}
    <div class="ph-scene ${editing?'is-editing':''}" data-ph-floor>
     ${sceneHtml()}
     ${!data.state.level?'<div class="ph-locked"><h2>판자촌에서 시작하는 나의 은신처</h2><p>무료 개방 시 군단토벌과 파티 군단토벌의 최대 행동력 +1</p>'+button('upgrade','무료 개방','data-target="room"')+'</div>':''}
    </div>
    ${cabinet?'':cameraHtml()}
    <div class="ph-scene-tools">
     <div class="ph-editbar">
      ${button('edit',editing?'꾸미기 종료':'자유롭게 꾸미기','aria-pressed="'+editing+'"',!data.state.level||dirty)}
      ${button('save','배치 저장','',!dirty)}
      ${button('reset','변경 취소','',!dirty)}
      <span>${dirty?'아직 저장하지 않은 배치입니다.':''}</span>
     </div>
     ${pickerHtml()}
    </div>
    <div data-ph-selection>${selectedHtml()}</div>
   </section>
   <section class="ph-management" aria-label="은신처 관리">
    <nav class="ph-tabs" aria-label="은신처 관리">${sections.map(([v,label])=>button('tab',label,'data-tab="'+v+'" aria-pressed="'+(tab===v)+'"')).join('')}</nav>
    ${tab==='facilities'?residenceHtml()+benefitsHtml():''}
    <div class="ph-panel-list" data-section="${tab}">${panelHtml()}</div>
   </section>
   <section class="ph-materials ph-panel">
    <h2>부품 보관함</h2>
    <div>${data.parts.map(p=>'<article><img src="'+esc(p.image)+'" width="72" height="72" loading="lazy" alt=""><b>'+esc(p.name)+'</b><strong>'+n(data.state.parts[p.code])+(p.stockLimit?' / '+n(p.stockLimit):'')+'</strong><small>'+esc(p.source)+'</small></article>').join('')}</div>
   </section>`;
  stopSizing=observeWorld();
 }
 async function refresh(){const id=epoch;try{const next=await request('hideout');if(id!==epoch||!root?.isConnected)return;accept(next);render();if(next.enabled===false)say('은신처를 준비하고 있습니다.');}catch(e){if(id!==epoch||e.name==='AbortError')return;root.innerHTML='<div class="ph-panel"><h2>은신처 연결을 확인해 주세요</h2><p>'+esc(e.message)+'</p>'+button('refresh','다시 불러오기')+'</div>';}}
 async function mutate(action,fields){
  if(busy||!data)return;const id=epoch,storageKey=key(),prior=pending();
  const job=prior||{action,body:{...fields,revision:data.state.revision,requestId:crypto.randomUUID()}};
  keep(job);busy=true;render();say('저장 중…');
  try{
   const previousIds=new Set(draft.map(p=>p.id)),next=await request('hideout/'+job.action,job.body);
   keep(null,storageKey);if(id!==epoch||!root?.isConnected)return;
   accept(next);
   const coinPaid=next.upgradePayment?.coin??next.skinPayment?.coin??'0';
   if(BigInt(coinPaid)>0n)global.dispatchEvent(new CustomEvent('cnine:account-sync',{detail:{domains:job.action==='unlockSkin'?['wallet','inventory']:['wallet']}}));
   const added=draft.find(p=>!previousIds.has(p.id));if(added)selected=added.id;
   render();if(added)focusPlacement();
   say(next.replayed?'저장된 결과를 복구했습니다.':'저장했습니다.');
   if(job.action==='trophy'&&matchMedia('(max-width:800px)').matches)root.querySelector('.ph-scene')?.scrollIntoView({block:'nearest'});
  }
  catch(e){if(id!==epoch||!root?.isConnected)return;if(e.status>=400&&e.status<500){keep(null);if(e.code==='HIDEOUT_CONFLICT'||e.code==='HIDEOUT_COINS')await refresh();}render();say(e.message,true);}
  finally{if(id===epoch){busy=false;root?.querySelectorAll('button').forEach(b=>{if(b.dataset.phBusy)b.disabled=false;});render();}}
 }
 function updateSelection(){if(!root)return;for(const el of root.querySelectorAll('[data-ph-prop]')){const active=el.dataset.phProp===selected;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));}const picker=root.querySelector('[data-ph-piece-select]');if(picker)picker.value=selected||'';const panel=root.querySelector('[data-ph-selection]');if(panel)panel.innerHTML=selectedHtml();}
 function move(x,y){const p=draft.find(p=>p.id===selected);if(!p)return;p.x=Math.max(0,Math.min(1000,Math.round(x)));p.y=Math.max(0,Math.min(1000,Math.round(y)));if(!dirty)root.querySelectorAll('[data-ph-action="upgrade"],[data-ph-action="expand"],[data-ph-action="decorate"],[data-ph-action="installDefense"],[data-ph-action="defenseRoom"],[data-ph-action="trophy"],[data-ph-action="unlockSkin"],[data-ph-action="equipSkin"]').forEach(b=>b.disabled=true);dirty=true;const el=root.querySelector('[data-ph-prop="'+CSS.escape(p.id)+'"]');if(el)el.setAttribute('style',placementStyle(p));root.querySelectorAll('[data-ph-action="save"],[data-ph-action="reset"]').forEach(b=>b.disabled=busy);const edit=root.querySelector('[data-ph-action="edit"]');if(edit)edit.disabled=true;const hint=root.querySelector('.ph-editbar > span');if(hint)hint.textContent='아직 저장하지 않은 배치입니다.';}
 function worldPoint(event){const view=viewport(),rect=view.getBoundingClientRect();return {x:(event.clientX-rect.left+view.scrollLeft)/scale,y:(event.clientY-rect.top)/scale};}
 function moveWorld(x,y){
  const p=draft.find(p=>p.id===selected);if(!p)return;
  const z=data.space.rooms.find(z=>x>=z.start&&x<z.start+z.width)||data.space.rooms[x<0?0:data.space.rooms.length-1];
  p.room=z.code;move((x-z.start-20-pieceWidth(p)/2)/(z.width-pieceWidth(p)-40)*1000,wall(p)?(y-262)/.20:(y-512)/.1024);
 }
 async function click(event){
  if(targeting&&editing&&!busy&&event.target.closest('[data-ph-world]')&&!event.target.closest('[data-ph-prop]')){
   const p=draft.find(p=>p.id===selected);
   if(p){const pt=worldPoint(event);targeting=false;moveWorld(pt.x,pt.y);render();}
   return;
  }
  if(event.detail===0&&event.target.closest('[data-ph-prop]')){selected=event.target.closest('[data-ph-prop]').dataset.phProp;updateSelection();return;}
  const b=event.target.closest('[data-ph-action]');if(!b||busy)return;const a=b.dataset.phAction;
  if(a==='raid'){
   if(data?.raidEnabled!==true)return;
   if(dirty){say('배치를 먼저 저장하거나 취소해 주세요.',true);return;}
   if(raidView||openingRaid)return;
   const id=epoch;openingRaid=true;
   try{
    const {openPlunder}=await import('/js/hideout-plunder-v1.mjs?v=20261128-ui2');
    if(id===epoch)raidView=openPlunder({request,uid,onClose:()=>{raidView=null;if(id===epoch)void refresh();}});
   }catch(e){if(id===epoch)say('약탈전 화면을 열지 못했습니다. 다시 시도하세요.',true);}
   finally{if(id===epoch)openingRaid=false;}
   return;
  }
  if(a==='refresh')return refresh();if(a==='retry')return mutate();
  if(a==='pan'){const view=viewport();if(view)setCamera(camera+Number(b.dataset.step)*view.clientWidth/scale*.75);return;}
  if(a==='room'){const z=data.space.rooms.find(z=>z.code===b.dataset.room);if(!viewport()){tab='facilities';editing=false;render();}setCamera(z.start);return;}
  if(a==='tab'){
   if(b.dataset.tab==='defense'&&data.raidEnabled&&!projectRaidPlacement){const id=epoch;({projectRaidPlacement}=await import('/shared/hideout-defense-v1.mjs'));if(id!==epoch)return;}
   tab=b.dataset.tab;if(tab==='trophies'&&!dirty){editing=false;if(!draft.find(p=>p.id===selected&&p.code==='trophy'))selected=(draft.find(p=>p.code==='trophy'&&p.room===room)||draft.find(p=>p.code==='trophy'))?.id||null;}render();return;}
  if(a==='select'){selected=b.dataset.id;render();focusPlacement();return;}
  if(a==='target'){targeting=!targeting;updateSelection();return;}
  if(a==='edit'){targeting=false;editing=!editing;render();focusPlacement();return;}
  if(a==='reset'){targeting=false;draft=structuredClone(data.state.placements);dirty=false;render();return;}
  if(a==='save')return mutate('arrange',{placements:draft.map(({id,room,x,y,flipped})=>({id,room,x,y,flipped}))});
  if(a==='flip'||a==='store'){const p=draft.find(p=>p.id===selected);if(p&&editing){if(a==='flip')p.flipped=!p.flipped;else p.room=p.room===null?room:null;dirty=true;render();}return;}
  if(a==='trophies'){tab='trophies';editing=false;selectedSlot=0;render();return;}
  if(a==='slot'){selectedSlot=Number(b.dataset.slot);render();if(matchMedia('(max-width:800px)').matches)root.querySelector('.ph-trophy-list')?.scrollIntoView({block:'nearest'});return;}
  if(a==='load-trophies'){const id=epoch;busy=true;b.disabled=true;try{const v=await request('hideout/trophies');if(id===epoch){trophies=v.trophies;render();}}catch(e){if(id===epoch)say(e.message,true);}finally{if(id===epoch){busy=false;render();}}return;}
  if(dirty){say('배치를 먼저 저장하거나 취소해 주세요.',true);return;}
  if(a==='upgrade')return mutate(a,{target:b.dataset.target,room});
  if(a==='installDefense'&&data.raidEnabled)return mutate(a,{item:b.dataset.item,room:data.state.defenseRoom||'main'});
  if(a==='defenseRoom'&&data.raidEnabled)return mutate(a,{room:b.dataset.room});
  if(a==='decorate')return mutate(a,{item:b.dataset.item,room});
  if(a==='expand')return mutate(a,{room:b.dataset.room});
  if(a==='unlockSkin'){if(confirm('표시된 코인, 마스터의 별, 은신처 재료를 사용해 스킨을 해금할까요?'))return mutate(a,{skin:b.dataset.skin});return;}
  if(a==='equipSkin')return mutate(a,{id:selected,skin:b.dataset.skin||null});
  if(a==='trophy')return mutate(a,{id:selected,slot:selectedSlot,trophyCode:b.dataset.trophy||null});
 }
 function destroy(){
  const previousRaid=raidView;raidView=null;openingRaid=false;
  if(root&&uid)try{sessionStorage.setItem('cnine-hideout-camera:'+uid,String(camera));}catch{}
  epoch++;controller?.abort();stopSizing?.();stopSizing=null;controller=null;root=null;data=null;trophies=null;drag=null;targeting=false;busy=false;editing=false;dirty=false;selected=null;noticeText='';camera=0;room='main';tab='facilities';
  previousRaid?.close();
 }
 async function bind(user){
  destroy();uid=Number(user?.serverUserId||user?.id||user?.userId||0);root=document.getElementById('personalHideoutRoot');if(!root)return;
  try{camera=Math.max(0,Number(sessionStorage.getItem('cnine-hideout-camera:'+uid))||0);}catch{}
  controller=new AbortController();const signal=controller.signal;
  root.addEventListener('click',click,{signal});
  root.addEventListener('scroll',e=>{if(e.target.matches('[data-ph-viewport]'))syncCamera();},{signal,capture:true});
  root.addEventListener('input',e=>{if(e.target.matches('[data-ph-camera]')){const view=viewport();setCamera(Number(e.target.value)/1000*Math.max(0,data.space.width-view.clientWidth/scale));}},{signal});
  root.addEventListener('change',e=>{
   if(e.target.matches('[data-ph-piece-select]')){targeting=false;selected=e.target.value||null;selectedSlot=0;if(tab==='trophies')render();else updateSelection();focusPlacement();}
   else if(e.target.matches('[data-ph-room-select]')){const p=draft.find(p=>p.id===selected);if(!editing||!p)return;p.room=e.target.value==='storage'?null:e.target.value;dirty=true;render();focusPlacement();}
  },{signal});
  root.addEventListener('pointerdown',e=>{
   if(!e.target.closest('[data-ph-viewport]')||busy)return;
   const el=e.target.closest('[data-ph-prop]');
   if(el){targeting=false;selected=el.dataset.phProp;updateSelection();}
   else if(targeting)return;
   if(el&&editing){const p=draft.find(v=>v.id===selected),pt=worldPoint(e);drag={kind:'furniture',id:e.pointerId,x:pt.x-worldX(p),y:pt.y-worldY(p)};root.setPointerCapture(e.pointerId);e.preventDefault();}
   else if(e.pointerType==='mouse'){drag={kind:'camera',id:e.pointerId,x:e.clientX,camera};root.setPointerCapture(e.pointerId);e.preventDefault();}
  },{signal});
  root.addEventListener('pointermove',e=>{
   if(!drag||e.pointerId!==drag.id)return;
   if(drag.kind==='camera'){setCamera(drag.camera+(drag.x-e.clientX)/scale);return;}
   const view=viewport(),r=view.getBoundingClientRect();
   if(e.clientX<r.left+28)setCamera(camera-12);else if(e.clientX>r.right-28)setCamera(camera+12);
   const pt=worldPoint(e);moveWorld(pt.x-drag.x,pt.y-drag.y);
  },{signal});
  const end=e=>{if(!drag||drag.id!==e.pointerId)return;const furniture=drag.kind==='furniture';drag=null;updateSelection();if(furniture)root.querySelector('[data-ph-prop="'+CSS.escape(selected)+'"]')?.focus({preventScroll:true});};
  root.addEventListener('pointerup',end,{signal});root.addEventListener('pointercancel',end,{signal});
  root.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   if(e.target.matches('[data-ph-viewport]')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setCamera(camera+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?400:80));return;}
   if(!editing||!e.target.matches('[data-ph-prop]'))return;
   selected=e.target.dataset.phProp;const p=draft.find(p=>p.id===selected),step=e.shiftKey?50:10;e.preventDefault();move(p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0));focusPlacement();
  },{signal});
  await refresh();
 }
 global.PersonalHideout={view,bind,destroy};
})(window);
