/* V1259 NEW BACKGROUND + INSTANT EQUIP */
(()=>{
  const state={data:null,loading:false,loadedAt:0,tab:'equipment',slot:'WEAPON',garageFilter:'ALL',mutationTokens:{}};
  const slotOrder=['WEAPON','ACCESSORY','TOP','BOTTOM','SHOES'];
  const slotLabels={WEAPON:'무기',ACCESSORY:'장신구',TOP:'상의',BOTTOM:'하의',SHOES:'신발'};
  const slotDefaults={WEAPON:'현대식 무기',ACCESSORY:'듀얼디스크',TOP:'현대식 상의',BOTTOM:'현대식 하의',SHOES:'현대식 신발'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',RIFLE:'라이플',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const garageFilters=['ALL','MYTHIC','LEGENDARY','EPIC','RARE','MAGIC','NORMAL'];
  const titleStyleLabels={DEFAULT:'기본',FOREST:'숲',FLAME:'화염',FROST:'서리',STORM:'폭풍',SHADOW:'그림자',GOLD:'황금',RAINBOW:'무지개',VOID:'심연'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감',CARD_SET:'카드 세트',CONTENT_CLEAR:'콘텐츠'};
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const num=v=>Number(v||0).toLocaleString();
  const profile=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options={},extra)=>apiRequest(path,options,extra);
  const normRarity=v=>{const a={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',LEGEND:'LEGENDARY',MYTH:'MYTHIC'};const x=String(v||'NORMAL').toUpperCase();return rarityLabels[a[x]||x]?a[x]||x:'NORMAL'};
  const rarityClass=v=>`rarity-${normRarity(v).toLowerCase()}`;
  const normTitle=v=>{const x=String(v||'DEFAULT').toUpperCase();return titleStyleLabels[x]?x:'DEFAULT'};
  const titleClass=v=>`title-style-${normTitle(v).toLowerCase()}`;
  const subtypeClass=item=>`subtype-${String(item?.subtype||'unknown').toLowerCase().replace(/_/g,'-')}`;

  function equipped(slot){
    const id=Number(state.data?.loadout?.[slot]||0);
    return state.data?.instances?.find(row=>Number(row.instanceId)===id)||null;
  }
  function currentTitle(){
    const id=Number(state.data?.equippedTitleId||0);
    return state.data?.titles?.find(row=>Number(row.id)===id)||state.data?.bonuses?.title||null;
  }
  function currentVehicle(){
    const id=Number(state.data?.equippedVehicleId||0);
    return state.data?.vehicles?.find(row=>Number(row.id)===id)||state.data?.bonuses?.garage||null;
  }
  function titleText(row){return row?(row.badgeText||row.name):'칭호 없음'}
  function nicknameText(){const value=String(profile()?.nickname||'플레이어').trim();return value||'플레이어'}
  function itemImage(item){return item?.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`:''}

  function recalculateState(){
    if(!state.data)return;
    const loadout=state.data.loadout||{};
    let equipmentPve=0,equipmentPvp=0;
    for(const row of state.data.instances||[]){
      row.equipped=Number(loadout[row.item?.slot]||0)===Number(row.instanceId);
      if(row.equipped){equipmentPve+=Number(row.item?.pvePower||0);equipmentPvp+=Number(row.item?.pvpPower||0)}
    }
    const titleId=Number(state.data.equippedTitleId||0);
    let title=null;
    for(const row of state.data.titles||[]){row.equipped=titleId>0&&Number(row.id)===titleId;if(row.equipped)title=row}
    const vehicleId=Number(state.data.equippedVehicleId||0);
    let garage=null;
    for(const row of state.data.vehicles||[]){row.equipped=vehicleId>0&&Number(row.id)===vehicleId;if(row.equipped)garage=row}
    const titlePve=Number(title?.pvePower||0),garagePve=Number(garage?.pvePower||0),garagePvp=Number(garage?.pvpPower||0);
    state.data.bonuses={
      ...(state.data.bonuses||{}),
      equipmentPve,equipmentPvp,garagePve,garagePvp,titlePve,
      pve:equipmentPve+garagePve+titlePve,
      pvp:equipmentPvp+garagePvp,
      title:title?{id:Number(title.id),name:title.name,badgeText:title.badgeText||title.name,pvePower:titlePve,stylePreset:title.stylePreset,image:title.image||''}:null,
      garage:garage?{id:Number(garage.id),name:garage.name,rarity:garage.rarity,image:garage.image||'',description:garage.description||'',pvePower:garagePve,pvpPower:garagePvp}:null
    };
  }
  function nextMutationToken(key){const value=Number(state.mutationTokens[key]||0)+1;state.mutationTokens[key]=value;return value}
  function isCurrentMutation(key,token){return Number(state.mutationTokens[key]||0)===Number(token)}
  function setEquipment(slot,instanceId){
    if(!state.data)return;
    state.data.loadout={...(state.data.loadout||{})};
    if(instanceId)state.data.loadout[slot]=Number(instanceId);else delete state.data.loadout[slot];
    recalculateState();render();
  }
  function setTitle(titleId){if(!state.data)return;state.data.equippedTitleId=titleId?Number(titleId):null;recalculateState();render()}
  function setGarage(vehicleId){if(!state.data)return;state.data.equippedVehicleId=vehicleId?Number(vehicleId):null;recalculateState();render()}
  function showNotice(message,error=false){
    document.querySelector('.frame-action-toast-v1249')?.remove();
    const toast=document.createElement('div');toast.className=`frame-action-toast-v1249${error?' error':''}`;toast.textContent=message;document.body.appendChild(toast);
    requestAnimationFrame(()=>toast.classList.add('show'));
    setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),220)},error?2200:900);
  }

  function publishPowerChange(bonuses){
    if(!bonuses||typeof bonuses!=='object')return;
    state.data.bonuses={...(state.data.bonuses||{}),...bonuses};
    window.dispatchEvent(new CustomEvent('cnine:character-power-changed',{detail:{bonuses:state.data.bonuses}}));
  }

  function slotOverlay(slot){
    const row=equipped(slot),item=row?.item;
    const description=item?(item.name||subtypeLabels[item.subtype]||slotDefaults[slot]):'';
    return `<div class="frame-slot-v1249 slot-${slot.toLowerCase()} ${item?'filled':''} ${item?rarityClass(item.rarity):''} ${item?subtypeClass(item):''}">
      <button type="button" class="frame-slot-hit-v1249" data-character-filter="${slot}" aria-label="${esc(slotLabels[slot])}"></button>
      ${item?`<div class="frame-slot-image-v1249">${itemImage(item)}</div><div class="frame-slot-desc-mask-v1249"><span>${esc(description)}</span></div>`:''}
      ${item?`<button type="button" class="frame-slot-remove-v1249" data-character-unequip="${slot}" aria-label="해제">×</button>`:''}
    </div>`;
  }
  function garageSummaryCard(){
    const vehicle=currentVehicle();
    const rarity=vehicle?normRarity(vehicle.rarity):'NORMAL';
    return `<section class="garage-entry-v1340 ${vehicle?'filled':''} ${vehicle?rarityClass(rarity):''}">
      <div class="garage-entry-thumb-v1340">${vehicle?.image?`<img src="${esc(vehicle.image)}" alt="${esc(vehicle.name)}" loading="lazy">`:'<b>GARAGE</b>'}</div>
      <div class="garage-entry-copy-v1340">
        <div class="garage-entry-title-v1340"><small>차고지 · 이동수단</small><span>${vehicle?esc(rarityLabels[rarity]):'미장착'}</span></div>
        <strong>${esc(vehicle?.name||'장착된 이동수단 없음')}</strong>
        <div class="garage-entry-stats-v1340"><span>PVE <em>+${num(vehicle?.pvePower||0)}</em></span><span>PVP <em>+${num(vehicle?.pvpPower||0)}</em></span></div>
      </div>
      <button type="button" class="garage-entry-open-v1340" data-open-garage><b>차고지 열기</b><small>이동수단 장착·변경</small></button>
    </section>`;
  }
  function equipmentLayer(){
    const b=state.data?.bonuses||{},title=currentTitle();
    return `<div class="frame-equipment-layer-v1249">
      <div class="frame-nickname-v1249" data-dynamic-nickname>${esc(nicknameText())}</div>
      <div class="frame-title-v1249 ${titleClass(title?.stylePreset)}" data-dynamic-title>[${esc(titleText(title))}]</div>
      <button type="button" class="frame-garage-entry-v1342" data-open-garage><span>🚗</span><b>차고지</b></button>
      ${slotOrder.map(slotOverlay).join('')}
      <div class="frame-stat-box-v1249 pve" data-dynamic-pve><small>PVE</small><b>+${num(b.pve)}</b></div>
      <div class="frame-stat-box-v1249 pvp" data-dynamic-pvp><small>PVP</small><b>+${num(b.pvp)}</b></div>
      ${inventoryLayer()}
    </div>`;
  }
  function inventoryLayer(){
    const all=state.data?.instances||[];
    const rows=all.filter(row=>state.slot==='ALL'||row.item.slot===state.slot);
    return `<div class="frame-inventory-layer-v1249">
      <div class="frame-inventory-head-v1249"><b>보유 장비</b><span>${all.length}</span></div>
      <div class="frame-filter-row-v1249">
        <button class="${state.slot==='ALL'?'active':''}" data-character-filter="ALL">전체</button>
        ${slotOrder.map(slot=>`<button class="${state.slot===slot?'active':''}" data-character-filter="${slot}">${esc(slotLabels[slot])}</button>`).join('')}
      </div>
      <div class="frame-item-grid-v1249">
        ${rows.length?rows.map(row=>{const i=row.item;return `<button type="button" class="frame-item-card-v1249 ${row.equipped?'equipped':''} ${rarityClass(i.rarity)} ${subtypeClass(i)}" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}" title="${esc(i.name)}">
          <i class="frame-item-rarity-v1249">${esc(rarityLabels[normRarity(i.rarity)])}</i>
          <div class="frame-item-thumb-v1249">${itemImage(i)}</div>
          <div class="frame-item-info-v1249"><strong>${esc(i.name)}</strong><span class="frame-item-type-v1249">${esc(slotLabels[i.slot]||i.slot)} · ${esc(subtypeLabels[i.subtype]||i.subtype)}</span><div class="frame-item-power-v1249"><i>PVE +${num(i.pvePower)}</i><i class="pvp">PVP +${num(i.pvpPower)}</i></div></div>
        </button>`}).join(''):'<div class="frame-empty-v1249">보유 장비<br>없음</div>'}
      </div>
    </div>`;
  }
  function titleRequirement(row){
    const cfg=row.unlockConfig||{};
    switch(row.unlockType){
      case 'COLLECTION_COUNT':return `도감 ${num(cfg.count||1)}장`;
      case 'GRADE_COUNT':return `${esc(cfg.grade||'지정')} ${num(cfg.count||1)}장`;
      case 'MEMBER_COMPLETE':return '멤버 도감 완성';
      case 'CARD_SET':return '카드 세트 수집';
      case 'CONTENT_CLEAR':return '콘텐츠 클리어';
      default:return '운영 지급';
    }
  }
  function titleLayer(){
    const rows=state.data?.titles||[],equippedTitle=currentTitle();
    return `<div class="frame-title-layer-v1249">
      <div class="frame-nickname-v1249" data-dynamic-nickname>${esc(nicknameText())}</div>
      <div class="frame-title-current-v1249 ${titleClass(equippedTitle?.stylePreset)}">
        <small>현재 칭호</small><strong>[${esc(titleText(equippedTitle))}]</strong><b>PVE +${num(equippedTitle?.pvePower||state.data?.bonuses?.titlePve)}</b>
      </div>
      <div class="frame-title-list-v1249">
        ${rows.length?rows.map(row=>{
          const action=row.owned?(row.equipped?'<button type="button" data-character-title-unequip>해제</button>':`<button type="button" data-character-title-equip="${row.id}">장착</button>`):'<button type="button" disabled>미획득</button>';
          return `<article class="frame-title-card-v1249 ${row.owned?'owned':'locked'} ${row.equipped?'equipped':''} ${titleClass(row.stylePreset)}"><strong>[${esc(row.badgeText||row.name)}]</strong><small>${esc(row.owned?(unlockLabels[row.unlockType]||row.unlockType):titleRequirement(row))}</small><b>PVE +${num(row.pvePower)}</b>${action}</article>`;
        }).join(''):'<div class="frame-empty-v1249">등록된 칭호 없음</div>'}
      </div>
    </div>`;
  }
  function garageLayer(){
    const rows=Array.isArray(state.data?.vehicles)?state.data.vehicles:[];
    const vehicle=currentVehicle();
    const rarity=vehicle?normRarity(vehicle.rarity):'NORMAL';
    const stars=vehicle?'★★★★★':'';
    const visible=rows.filter(row=>state.garageFilter==='ALL'||String(row.rarity||'')===state.garageFilter);
    const ownedCount=rows.filter(row=>row.owned).length;
    return `<div class="garage-screen-v1341 ${vehicle?'has-vehicle':'no-vehicle'} ${vehicle?rarityClass(rarity):''}">
      <img class="garage-frame-art-v1341" src="assets/ui/garage/garage-frame-v1341.png?v=1341" alt="" aria-hidden="true">
      <div class="garage-live-layer-v1341">
        <button type="button" class="garage-back-v1341" data-close-garage aria-label="장비창으로 돌아가기">장비창으로</button>
        ${vehicle?`<div class="garage-live-title-v1341"><span>${esc(vehicle.name)}</span><small>${esc(rarityLabels[rarity])} 등급 ${stars}</small></div>`:''}
        <div class="garage-live-vehicle-v1341">
          ${vehicle?.image?`<img src="${esc(vehicle.image)}" alt="${esc(vehicle.name)}" loading="eager">`:'<div class="garage-empty-mask-v1342"><div class="garage-live-empty-v1341"><b>이동수단 미장착</b><span>아래 보유 이동수단에서 장착하세요</span></div></div>'}
        </div>
        <div class="garage-live-stats-v1341"><div><small>PVE</small><b>+${num(vehicle?.pvePower||0)}</b></div><div><small>PVP</small><b>+${num(vehicle?.pvpPower||0)}</b></div></div>
        ${vehicle?.equipped?'<button type="button" class="garage-unequip-v1341" data-garage-unequip>장착 해제</button>':''}
        <section class="garage-live-collection-v1341">
          <header><div><small>MY VEHICLES</small><h3>보유 이동수단</h3></div><span>${ownedCount} / ${rows.length}</span></header>
          <div class="garage-filter-row-v1341">${garageFilters.map(filter=>`<button type="button" class="${state.garageFilter===filter?'active':''}" data-garage-filter="${filter}">${filter==='ALL'?'전체':esc(rarityLabels[filter]||filter)}</button>`).join('')}</div>
          <div class="garage-card-row-v1341">${visible.length?visible.map(row=>`<article class="garage-card-v1341 ${row.owned?'owned':'locked'} ${row.equipped?'equipped':''} ${rarityClass(row.rarity)}">
            <div class="garage-card-rarity-v1341">${esc(rarityLabels[normRarity(row.rarity)])}</div>
            <div class="garage-card-image-v1341">${row.image?`<img src="${esc(row.image)}" alt="${esc(row.name)}" loading="lazy">`:'<b>VEHICLE</b>'}</div>
            <strong>${esc(row.name)}</strong>
            <div class="garage-card-power-v1341"><span>PVE <em>+${num(row.pvePower)}</em></span><span>PVP <em>+${num(row.pvpPower)}</em></span></div>
            ${row.owned?(row.equipped?'<button type="button" disabled>장착 중</button>':`<button type="button" data-garage-equip="${row.id}">장착</button>`):'<button type="button" disabled>미획득</button>'}
          </article>`).join(''):'<div class="garage-live-empty-list-v1341"><b>등록된 이동수단이 없습니다.</b><span>CMS에서 이동수단을 등록하고 지급하세요.</span></div>'}</div>
        </section>
      </div>
    </div>`;
  }
  function shellHtml(){
    const tabClass=`tab-${state.tab}-v1344`;
    const tabs=`<button type="button" class="frame-tab-hit-v1344 equipment" data-character-tab="equipment" aria-label="장비"></button><button type="button" class="frame-tab-hit-v1344 title" data-character-tab="title" aria-label="칭호"></button><button type="button" class="frame-tab-hit-v1344 garage" data-character-tab="garage" aria-label="차고"></button>`;
    return `<div class="image-frame-ui-v1249 ${state.tab==='garage'?'garage-open-v1341':''} ${tabClass}"><div class="frame-background-v1249"></div>${tabs}${state.tab==='equipment'?equipmentLayer():state.tab==='title'?titleLayer():garageLayer()}</div>`;
  }
  function bind(root){
    root.querySelectorAll('[data-character-tab]').forEach(btn=>btn.onclick=()=>{state.tab=btn.dataset.characterTab;render()});
    root.querySelectorAll('[data-character-filter]').forEach(btn=>btn.onclick=()=>{state.slot=btn.dataset.characterFilter;render()});
    root.querySelectorAll('[data-character-equip]').forEach(btn=>btn.onclick=()=>equipItem(Number(btn.dataset.characterEquip)));
    root.querySelectorAll('[data-character-unequip]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();unequipItem(btn.dataset.characterUnequip)});
    root.querySelectorAll('[data-character-title-equip]').forEach(btn=>btn.onclick=()=>equipTitle(Number(btn.dataset.characterTitleEquip)));
    root.querySelectorAll('[data-character-title-unequip]').forEach(btn=>btn.onclick=()=>unequipTitle());
    root.querySelectorAll('[data-open-garage]').forEach(btn=>btn.onclick=()=>{state.tab='garage';render()});
    root.querySelectorAll('[data-close-garage]').forEach(btn=>btn.onclick=()=>{state.tab='equipment';render()});
    root.querySelectorAll('[data-garage-filter]').forEach(btn=>btn.onclick=()=>{state.garageFilter=btn.dataset.garageFilter||'ALL';render()});
    root.querySelectorAll('[data-garage-equip]').forEach(btn=>btn.onclick=()=>equipGarage(Number(btn.dataset.garageEquip)));
    root.querySelectorAll('[data-garage-unequip]').forEach(btn=>btn.onclick=()=>unequipGarage());
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="frame-loading-v1249"><span></span><b>불러오는 중...</b></div>';return}
    if(!state.data){root.innerHTML='<div class="frame-empty-v1249">장비/칭호/차고 정보를 불러오지 못했습니다.</div>';return}
    root.innerHTML=shellHtml();bind(root);
  }

  async function equipItem(instanceId){
    const row=state.data?.instances?.find(value=>Number(value.instanceId)===Number(instanceId));
    if(!row?.item?.slot)return;
    const slot=row.item.slot,key=`equipment:${slot}`,token=nextMutationToken(key),previous=Number(state.data?.loadout?.[slot]||0)||null;
    setEquipment(slot,instanceId);
    try{
      const response=await request('character/equipment/equip',{method:'POST',body:JSON.stringify({instanceId})});
      if(response?.ok!==true)throw new Error(response?.error||'장비 장착에 실패했습니다.');
      if(isCurrentMutation(key,token)){publishPowerChange(response.bonuses);render();showNotice('장비 장착 완료')}
    }catch(error){if(isCurrentMutation(key,token))setEquipment(slot,previous);showNotice(error.message||'장비 장착에 실패했습니다.',true)}
  }
  async function unequipItem(slot){
    if(!slot)return;
    const key=`equipment:${slot}`,token=nextMutationToken(key),previous=Number(state.data?.loadout?.[slot]||0)||null;
    setEquipment(slot,null);
    try{
      const response=await request('character/equipment/unequip',{method:'POST',body:JSON.stringify({slot})});
      if(response?.ok!==true)throw new Error(response?.error||'장비 해제에 실패했습니다.');
      if(isCurrentMutation(key,token)){publishPowerChange(response.bonuses);render();showNotice('장비 해제 완료')}
    }catch(error){if(isCurrentMutation(key,token))setEquipment(slot,previous);showNotice(error.message||'장비 해제에 실패했습니다.',true)}
  }
  async function equipTitle(titleId){
    const row=state.data?.titles?.find(value=>Number(value.id)===Number(titleId)&&value.owned);
    if(!row)return;
    const key='title',token=nextMutationToken(key),previous=Number(state.data?.equippedTitleId||0)||null;
    setTitle(titleId);
    try{
      const response=await request('character/title/equip',{method:'POST',body:JSON.stringify({titleId})});
      if(response?.ok!==true)throw new Error(response?.error||'칭호 장착에 실패했습니다.');
      if(isCurrentMutation(key,token)){publishPowerChange(response.bonuses);render();showNotice('칭호 장착 완료')}
    }catch(error){if(isCurrentMutation(key,token))setTitle(previous);showNotice(error.message||'칭호 장착에 실패했습니다.',true)}
  }
  async function unequipTitle(){
    const key='title',token=nextMutationToken(key),previous=Number(state.data?.equippedTitleId||0)||null;
    setTitle(null);
    try{
      const response=await request('character/title/unequip',{method:'POST',body:'{}'});
      if(response?.ok!==true)throw new Error(response?.error||'칭호 해제에 실패했습니다.');
      if(isCurrentMutation(key,token)){publishPowerChange(response.bonuses);render();showNotice('칭호 해제 완료')}
    }catch(error){if(isCurrentMutation(key,token))setTitle(previous);showNotice(error.message||'칭호 해제에 실패했습니다.',true)}
  }
  async function equipGarage(vehicleId){
    const row=state.data?.vehicles?.find(value=>Number(value.id)===Number(vehicleId)&&value.owned);
    if(!row)return;
    const key='garage',token=nextMutationToken(key),previous=Number(state.data?.equippedVehicleId||0)||null;
    setGarage(vehicleId);
    try{
      const response=await request('character/garage/equip',{method:'POST',body:JSON.stringify({vehicleId})});
      if(response?.ok!==true)throw new Error(response?.error||'이동수단 장착에 실패했습니다.');
      if(isCurrentMutation(key,token)){publishPowerChange(response.bonuses);render();showNotice('이동수단 장착 완료')}
    }catch(error){if(isCurrentMutation(key,token))setGarage(previous);showNotice(error.message||'이동수단 장착에 실패했습니다.',true)}
  }
  async function unequipGarage(){
    const key='garage',token=nextMutationToken(key),previous=Number(state.data?.equippedVehicleId||0)||null;
    setGarage(null);
    try{
      const response=await request('character/garage/unequip',{method:'POST',body:'{}'});
      if(response?.ok!==true)throw new Error(response?.error||'이동수단 해제에 실패했습니다.');
      if(isCurrentMutation(key,token)){publishPowerChange(response.bonuses);render();showNotice('이동수단 해제 완료')}
    }catch(error){if(isCurrentMutation(key,token))setGarage(previous);showNotice(error.message||'이동수단 해제에 실패했습니다.',true)}
  }
  async function load({force=false}={}){
    if(state.loading)return;
    const now=Date.now();
    if(state.data&&!force&&now-state.loadedAt<15000){render();return}
    state.loading=true;render();
    const root=document.getElementById('characterSystemRoot');
    let slowTimer=setTimeout(()=>{
      if(root&&state.loading&&!state.data)root.innerHTML='<div class="frame-loading-v1249"><span></span><b>장비/칭호/차고 정보를 불러오는 중...</b><small>서버 응답이 지연되고 있습니다.</small></div>';
    },3500);
    try{
      state.data=await request('character/loadout',{}, {ttl:10000,timeoutMs:12000});
      state.loadedAt=Date.now();recalculateState();render();
      // Collection title checks are intentionally deferred so the equipment screen is not blocked.
      setTimeout(()=>request('character/title/sync',{method:'POST',body:'{}'},{timeoutMs:20000}).catch(()=>{}),250);
    }catch(error){
      if(state.data){render();showNotice('최신 장비 정보를 불러오지 못해 이전 정보를 표시합니다.',true)}
      else if(root)root.innerHTML=`<div class="frame-empty-v1249 frame-load-error-v1261"><b>장비/칭호/차고 정보를 불러오지 못했습니다.</b><small>${esc(error?.message||'서버 응답이 지연되었습니다.')}</small><button type="button" id="characterLoadRetry">다시 불러오기</button></div>`;
      document.getElementById('characterLoadRetry')?.addEventListener('click',()=>load({force:true}));
    }finally{clearTimeout(slowTimer);state.loading=false}
  }
  window.characterView=()=>'<section id="characterSystemRoot" class="character-system-root-v1249"><div class="frame-loading-v1249"><span></span><b>불러오는 중...</b></div></section>';
  window.bindCharacterView=load;
  window.refreshCharacterSystem=()=>load({force:true});
  window.showEquipmentDropReward=async reward=>{
    if(!reward)return;
    document.getElementById('equipmentDropToast')?.remove();
    const toast=document.createElement('div');toast.id='equipmentDropToast';toast.className='frame-drop-toast-v1249';
    if(reward.kind==='SUPPLY_BOX'||reward.itemCode==='EQUIPMENT_SUPPLY_BOX'){
      const quantity=Math.max(1,Number(reward.quantity||1));
      toast.innerHTML=`<div class="frame-drop-backdrop-v1249"></div><div class="frame-drop-card-v1249 supply-box"><h3>보급상자 ${quantity>1?`${num(quantity)}개 `:''}획득</h3><div class="frame-drop-item-v1249 supply-box"><img src="${esc(reward.image||'assets/ui/packs/supply-high.jpeg')}" alt="장비 보급상자"></div><strong>${esc(reward.name||'장비 보급상자')}${quantity>1?` ×${num(quantity)}`:''}</strong><small>인벤토리에서 최대 10개까지 개방할 수 있습니다. · 보유 ${num(reward.balance)}</small><button type="button">확인</button></div>`;
    }else if(reward.item){
      const item=reward.item;
      toast.innerHTML=`<div class="frame-drop-backdrop-v1249"></div><div class="frame-drop-card-v1249 ${rarityClass(item.rarity)}"><h3>장비 획득</h3><div class="frame-drop-item-v1249 ${subtypeClass(item)}">${itemImage(item)}</div><strong>${esc(item.name)}</strong><small>${esc(rarityLabels[normRarity(item.rarity)])} · PVE ${num(item.pvePower)} · PVP ${num(item.pvpPower)}</small><button type="button">확인</button></div>`;
    }else return;
    document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),180);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,3200)});
  };
})();
