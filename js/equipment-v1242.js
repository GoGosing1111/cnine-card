/* V1242 IMAGE-FRAME EQUIPMENT + TITLE UI */
(()=>{
  const state={data:null,loading:false,tab:'equipment',slot:'WEAPON'};
  const slotOrder=['WEAPON','ACCESSORY','TOP','BOTTOM','SHOES'];
  const slotLabels={WEAPON:'무기',ACCESSORY:'장신구',TOP:'상의',BOTTOM:'하의',SHOES:'신발'};
  const slotDefaults={WEAPON:'현대식 무기',ACCESSORY:'듀얼디스크',TOP:'현대식 상의',BOTTOM:'현대식 하의',SHOES:'현대식 신발'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const titleStyleLabels={DEFAULT:'기본',FOREST:'숲',FLAME:'화염',FROST:'서리',STORM:'폭풍',SHADOW:'그림자',GOLD:'황금',RAINBOW:'무지개',VOID:'심연'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감',CARD_SET:'카드 세트',CONTENT_CLEAR:'콘텐츠'};
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const num=v=>Number(v||0).toLocaleString();
  const profile=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options)=>apiRequest(path,options);
  const normRarity=v=>{const a={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',LEGEND:'LEGENDARY',MYTH:'MYTHIC'};const x=String(v||'NORMAL').toUpperCase();return rarityLabels[a[x]||x]?a[x]||x:'NORMAL'};
  const rarityClass=v=>`rarity-${normRarity(v).toLowerCase()}`;
  const normTitle=v=>{const x=String(v||'DEFAULT').toUpperCase();return titleStyleLabels[x]?x:'DEFAULT'};
  const titleClass=v=>`title-style-${normTitle(v).toLowerCase()}`;

  function equipped(slot){
    const id=Number(state.data?.loadout?.[slot]||0);
    return state.data?.instances?.find(row=>Number(row.instanceId)===id)||null;
  }
  function currentTitle(){
    const id=Number(state.data?.equippedTitleId||0);
    return state.data?.titles?.find(row=>Number(row.id)===id)||state.data?.bonuses?.title||null;
  }
  function titleText(row){return row?(row.badgeText||row.name):'칭호 없음'}
  function nicknameText(){const value=String(profile()?.nickname||'플레이어').trim();return value||'플레이어'}
  function itemImage(item){return item?.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`:''}
  function slotOverlay(slot){
    const row=equipped(slot),item=row?.item;
    const description=item?(item.name||subtypeLabels[item.subtype]||slotDefaults[slot]):'';
    return `<div class="frame-slot-v1242 slot-${slot.toLowerCase()} ${item?'filled':''} ${item?rarityClass(item.rarity):''}">
      <button type="button" class="frame-slot-hit-v1242" data-character-filter="${slot}" aria-label="${esc(slotLabels[slot])}"></button>
      ${item?`<div class="frame-slot-image-v1242">${itemImage(item)}</div><div class="frame-slot-desc-mask-v1242"><span>${esc(description)}</span></div>`:''}
      ${item?`<button type="button" class="frame-slot-remove-v1242" data-character-unequip="${slot}" aria-label="해제">×</button>`:''}
    </div>`;
  }
  function equipmentLayer(){
    const b=state.data?.bonuses||{},title=currentTitle();
    return `<div class="frame-equipment-layer-v1242">
      <div class="frame-nickname-v1242" data-dynamic-nickname>${esc(nicknameText())}</div>
      <div class="frame-title-v1242 ${titleClass(title?.stylePreset)}" data-dynamic-title>[${esc(titleText(title))}]</div>
      ${slotOrder.map(slotOverlay).join('')}
      <div class="frame-stat-box-v1242 pve" data-dynamic-pve><small>PVE</small><b>+${num(b.pve)}</b></div>
      <div class="frame-stat-box-v1242 pvp" data-dynamic-pvp><small>PVP</small><b>+${num(b.pvp)}</b></div>
      ${inventoryLayer()}
    </div>`;
  }
  function inventoryLayer(){
    const all=state.data?.instances||[];
    const rows=all.filter(row=>state.slot==='ALL'||row.item.slot===state.slot);
    return `<div class="frame-inventory-layer-v1242">
      <div class="frame-inventory-head-v1242"><b>보유 장비</b><span>${all.length}</span></div>
      <div class="frame-filter-row-v1242">
        <button class="${state.slot==='ALL'?'active':''}" data-character-filter="ALL">전체</button>
        ${slotOrder.map(slot=>`<button class="${state.slot===slot?'active':''}" data-character-filter="${slot}">${esc(slotLabels[slot])}</button>`).join('')}
      </div>
      <div class="frame-item-grid-v1242">
        ${rows.length?rows.map(row=>{const i=row.item;return `<button type="button" class="frame-item-card-v1242 ${row.equipped?'equipped':''} ${rarityClass(i.rarity)}" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}">
          <div class="frame-item-thumb-v1242">${itemImage(i)}</div>
          <strong>${esc(i.name)}</strong>
          <small>${esc(rarityLabels[normRarity(i.rarity)])} · PVE ${num(i.pvePower)} · PVP ${num(i.pvpPower)}</small>
        </button>`}).join(''):'<div class="frame-empty-v1242">보유 장비<br>없음</div>'}
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
    return `<div class="frame-title-layer-v1242">
      <div class="frame-nickname-v1242" data-dynamic-nickname>${esc(nicknameText())}</div>
      <div class="frame-title-current-v1242 ${titleClass(equippedTitle?.stylePreset)}">
        <small>현재 칭호</small><strong>[${esc(titleText(equippedTitle))}]</strong><b>PVE +${num(equippedTitle?.pvePower||state.data?.bonuses?.titlePve)}</b>
      </div>
      <div class="frame-title-list-v1242">
        ${rows.length?rows.map(row=>{
          const action=row.owned?(row.equipped?'<button type="button" data-character-title-unequip>해제</button>':`<button type="button" data-character-title-equip="${row.id}">장착</button>`):'<button type="button" disabled>미획득</button>';
          return `<article class="frame-title-card-v1242 ${row.owned?'owned':'locked'} ${row.equipped?'equipped':''} ${titleClass(row.stylePreset)}"><strong>[${esc(row.badgeText||row.name)}]</strong><small>${esc(row.owned?(unlockLabels[row.unlockType]||row.unlockType):titleRequirement(row))}</small><b>PVE +${num(row.pvePower)}</b>${action}</article>`;
        }).join(''):'<div class="frame-empty-v1242">등록된 칭호 없음</div>'}
      </div>
    </div>`;
  }
  function shellHtml(){
    return `<div class="image-frame-ui-v1242">
      <div class="frame-background-v1242"></div>
      <button type="button" class="frame-tab-hit-v1242 equipment ${state.tab==='equipment'?'active':''}" data-character-tab="equipment" aria-label="장비"></button>
      <button type="button" class="frame-tab-hit-v1242 title ${state.tab==='title'?'active':''}" data-character-tab="title" aria-label="칭호"></button>
      ${state.tab==='equipment'?equipmentLayer():titleLayer()}
    </div>`;
  }
  function bind(root){
    root.querySelectorAll('[data-character-tab]').forEach(btn=>btn.onclick=()=>{state.tab=btn.dataset.characterTab;render()});
    root.querySelectorAll('[data-character-filter]').forEach(btn=>btn.onclick=()=>{state.slot=btn.dataset.characterFilter;render()});
    root.querySelectorAll('[data-character-equip]').forEach(btn=>btn.onclick=()=>mutate('character/equipment/equip',{instanceId:Number(btn.dataset.characterEquip)},btn));
    root.querySelectorAll('[data-character-unequip]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();mutate('character/equipment/unequip',{slot:btn.dataset.characterUnequip},btn)});
    root.querySelectorAll('[data-character-title-equip]').forEach(btn=>btn.onclick=()=>mutate('character/title/equip',{titleId:Number(btn.dataset.characterTitleEquip)},btn));
    root.querySelectorAll('[data-character-title-unequip]').forEach(btn=>btn.onclick=()=>mutate('character/title/unequip',{},btn));
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="frame-loading-v1242"><span></span><b>불러오는 중...</b></div>';return}
    if(!state.data){root.innerHTML='<div class="frame-empty-v1242">장비 정보를 불러오지 못했습니다.</div>';return}
    root.innerHTML=shellHtml();bind(root);
  }
  async function mutate(path,body,button){
    if(button){button.disabled=true;button.dataset.label=button.textContent;button.textContent='처리 중'}
    try{state.data=await request(path,{method:'POST',body:JSON.stringify(body)});render()}
    catch(error){alert(error.message||'처리하지 못했습니다.');if(button){button.disabled=false;button.textContent=button.dataset.label||'다시'}}
  }
  async function load(){
    if(state.loading)return;state.loading=true;render();
    try{state.data=await request('character/loadout');render()}
    catch(error){const root=document.getElementById('characterSystemRoot');if(root)root.innerHTML='<div class="frame-empty-v1242">장비 정보를 불러오지 못했습니다.</div>'}
    finally{state.loading=false}
  }
  window.characterView=()=>'<section id="characterSystemRoot" class="character-system-root-v1242"><div class="frame-loading-v1242"><span></span><b>불러오는 중...</b></div></section>';
  window.bindCharacterView=load;
  window.refreshCharacterSystem=load;
  window.showEquipmentDropReward=async reward=>{
    if(!reward?.item)return;
    const item=reward.item;document.getElementById('equipmentDropToast')?.remove();
    const toast=document.createElement('div');toast.id='equipmentDropToast';toast.className='frame-drop-toast-v1242';
    toast.innerHTML=`<div class="frame-drop-backdrop-v1242"></div><div class="frame-drop-card-v1242 ${rarityClass(item.rarity)}"><h3>장비 획득</h3><div class="frame-drop-item-v1242">${itemImage(item)}</div><strong>${esc(item.name)}</strong><small>${esc(rarityLabels[normRarity(item.rarity)])} · PVE ${num(item.pvePower)} · PVP ${num(item.pvpPower)}</small><button type="button">확인</button></div>`;
    document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),180);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,3200)});
  };
})();
