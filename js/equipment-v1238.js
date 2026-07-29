/* V1238 MODERN NEON EQUIPMENT + TITLE UI */
(()=>{
  const state={data:null,loading:false,tab:'equipment',slot:'ALL'};
  const slotIcons={WEAPON:'⚔',TOP:'▣',BOTTOM:'▤',SHOES:'⛛',ACCESSORY:'◉'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감',CARD_SET:'카드 세트',CONTENT_CLEAR:'콘텐츠'};
  const titleStyleLabels={DEFAULT:'기본',FOREST:'숲',FLAME:'화염',FROST:'서리',STORM:'폭풍',SHADOW:'그림자',GOLD:'황금',RAINBOW:'무지개',VOID:'심연'};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0).toLocaleString();
  const user=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options)=>apiRequest(path,options);
  const normRarity=value=>{const aliases={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',LEGEND:'LEGENDARY',MYTH:'MYTHIC'};const raw=String(value||'NORMAL').toUpperCase();const normalized=aliases[raw]||raw;return rarityLabels[normalized]?normalized:'NORMAL'};
  const normTitle=value=>{const raw=String(value||'DEFAULT').toUpperCase();return titleStyleLabels[raw]?raw:'DEFAULT'};
  const rarityClass=value=>`rarity-${normRarity(value).toLowerCase()}`;
  const titleClass=value=>`title-style-${normTitle(value).toLowerCase()}`;

  function equippedFor(slot){
    const id=Number(state.data?.loadout?.[slot]||0);
    return state.data?.instances?.find(row=>Number(row.instanceId)===id)||null;
  }
  function currentTitle(){
    const id=Number(state.data?.equippedTitleId||0);
    return state.data?.titles?.find(row=>Number(row.id)===id)||state.data?.bonuses?.title||null;
  }
  function titleBadge(title){
    const name=title?(title.badgeText||title.name):'칭호 없음';
    return `<div class="compact-title-badge-v1238 ${titleClass(title?.stylePreset)} ${title?'owned':'empty'}"><span>[${esc(name)}]</span></div>`;
  }
  function itemImage(item,slot){
    return item?.image
      ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`
      : `<span class="compact-slot-placeholder-v1238">${slotIcons[slot]||'◇'}</span>`;
  }
  function slotHtml(slotId){
    const slot=state.data?.slots?.find(row=>row.id===slotId)||{id:slotId,label:slotId};
    const row=equippedFor(slotId),item=row?.item;
    return `<div class="compact-slot-wrapper-v1238 ${item?'filled':''} ${item?rarityClass(item.rarity):''}">
      <button type="button" class="compact-item-slot-v1238" data-character-filter="${slotId}">
        ${itemImage(item,slotId)}
        ${item?`<i class="compact-rarity-dot-v1238"></i>`:''}
      </button>
      <div class="compact-slot-label-v1238">${esc(slot.label)}</div>
      <div class="compact-slot-desc-v1238">${esc(item?(subtypeLabels[item.subtype]||item.name):(slotId==='WEAPON'?'현대식 무기':slotId==='ACCESSORY'?'듀얼디스크':slot.label))}</div>
      ${item?`<button type="button" class="compact-slot-remove-v1238" data-character-unequip="${slotId}">×</button>`:''}
    </div>`;
  }
  function equipmentPanel(){
    const title=currentTitle();
    return `<div class="compact-equipment-panel-v1238">
      <div class="compact-title-position-v1238">${titleBadge(title)}</div>
      <div class="compact-slots-column-v1238 left">
        ${slotHtml('WEAPON')}
        ${slotHtml('ACCESSORY')}
      </div>
      <div class="compact-character-display-v1238">
        <img src="assets/ui/character-avatar-modern-v1238.png" alt="캐릭터" loading="lazy">
      </div>
      <div class="compact-slots-column-v1238 right">
        ${slotHtml('TOP')}
        ${slotHtml('BOTTOM')}
        ${slotHtml('SHOES')}
      </div>
    </div>`;
  }
  function statsPanel(){
    const b=state.data?.bonuses||{};
    return `<div class="compact-stats-panel-v1238">
      <div class="compact-stat-v1238 pve"><span>◈</span><small>PVE</small><b>+${num(b.pve)}</b></div>
      <div class="compact-stat-v1238 pvp"><span>◆</span><small>PVP</small><b>+${num(b.pvp)}</b></div>
    </div>`;
  }
  function equipmentInventory(){
    const rows=state.data?.instances||[];
    const filtered=rows.filter(row=>state.slot==='ALL'||row.item.slot===state.slot);
    return `<div class="compact-subpanel-v1238">
      <div class="compact-subpanel-head-v1238"><b>보유 장비</b><span>${rows.length}</span></div>
      <div class="compact-filter-row-v1238">
        <button class="${state.slot==='ALL'?'active':''}" data-character-filter="ALL">전체</button>
        ${(state.data?.slots||[]).map(slot=>`<button class="${state.slot===slot.id?'active':''}" data-character-filter="${slot.id}">${esc(slot.label)}</button>`).join('')}
      </div>
      <div class="compact-inventory-grid-v1238">
        ${filtered.length?filtered.map(row=>{
          const item=row.item;
          return `<button type="button" class="compact-inventory-item-v1238 ${row.equipped?'equipped':''} ${rarityClass(item.rarity)}" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}" title="${esc(item.name)}">
            <div class="compact-inventory-icon-v1238">${itemImage(item,item.slot)}</div>
            <strong>${esc(item.name)}</strong>
            <small>PVE ${num(item.pvePower)} · PVP ${num(item.pvpPower)}</small>
          </button>`;
        }).join(''):'<div class="compact-empty-v1238">보유 장비 없음</div>'}
      </div>
    </div>`;
  }
  function conditionLabel(title){
    const cfg=title.unlockConfig||{};
    switch(title.unlockType){
      case 'COLLECTION_COUNT': return `도감 ${num(cfg.count||1)}장`;
      case 'GRADE_COUNT': return `${esc(cfg.grade||'지정')} ${num(cfg.count||1)}장`;
      case 'MEMBER_COMPLETE': return '멤버 도감 완성';
      case 'CARD_SET': return '카드 세트 수집';
      case 'CONTENT_CLEAR': return '콘텐츠 클리어';
      default: return '운영 지급';
    }
  }
  function titlePanel(){
    const rows=state.data?.titles||[];
    const current=currentTitle();
    return `<div class="compact-title-panel-v1238">
      <div class="compact-current-title-v1238">
        <small>장착 칭호</small>
        ${titleBadge(current)}
        <b>PVE +${num(current?.pvePower||state.data?.bonuses?.titlePve)}</b>
      </div>
      <div class="compact-title-list-v1238">
        ${rows.length?rows.map(title=>{
          const action=title.owned
            ? title.equipped
              ? '<button type="button" data-character-title-unequip>해제</button>'
              : `<button type="button" data-character-title-equip="${title.id}">장착</button>`
            : '<button type="button" disabled>미획득</button>';
          return `<article class="compact-title-row-v1238 ${title.owned?'owned':'locked'} ${title.equipped?'equipped':''}">
            <div>${titleBadge(title)}<small>${esc(titleStyleLabels[normTitle(title.stylePreset)]||'기본')} · ${esc(title.owned?(unlockLabels[title.unlockType]||title.unlockType):conditionLabel(title))}</small></div>
            <b>PVE +${num(title.pvePower)}</b>
            ${action}
          </article>`;
        }).join(''):'<div class="compact-empty-v1238">등록된 칭호 없음</div>'}
      </div>
    </div>`;
  }
  function appHtml(){
    const profile=user();
    return `<div class="compact-inventory-ui-v1238">
      <div class="compact-hologram-bg-v1238"></div>
      <div class="compact-profile-v1238"><strong>${esc(profile?.nickname||'플레이어')}</strong></div>
      <div class="compact-header-tabs-v1238">
        <button type="button" class="${state.tab==='equipment'?'active':''}" data-character-tab="equipment">⚔ EQUIPMENT</button>
        <button type="button" class="${state.tab==='title'?'active':''}" data-character-tab="title">🏆 TITLES</button>
      </div>
      ${state.tab==='equipment'?equipmentPanel()+statsPanel()+equipmentInventory():titlePanel()}
    </div>`;
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');
    if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="compact-loading-v1238"><span></span><b>불러오는 중...</b></div>';return}
    if(!state.data){root.innerHTML='<div class="compact-empty-v1238">장비 정보를 불러오지 못했습니다.</div>';return}
    root.innerHTML=appHtml();
    root.querySelectorAll('[data-character-tab]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.characterTab;render()});
    root.querySelectorAll('[data-character-filter]').forEach(button=>button.onclick=()=>{state.slot=button.dataset.characterFilter;render()});
    root.querySelectorAll('[data-character-equip]').forEach(button=>button.onclick=()=>mutate('character/equipment/equip',{instanceId:Number(button.dataset.characterEquip)},button));
    root.querySelectorAll('[data-character-unequip]').forEach(button=>button.onclick=event=>{event.stopPropagation();mutate('character/equipment/unequip',{slot:button.dataset.characterUnequip},button)});
    root.querySelectorAll('[data-character-title-equip]').forEach(button=>button.onclick=()=>mutate('character/title/equip',{titleId:Number(button.dataset.characterTitleEquip)},button));
    root.querySelectorAll('[data-character-title-unequip]').forEach(button=>button.onclick=()=>mutate('character/title/unequip',{},button));
  }
  async function mutate(path,body,button){
    if(button){button.disabled=true;button.dataset.label=button.textContent;button.textContent='처리 중'}
    try{state.data=await request(path,{method:'POST',body:JSON.stringify(body)});render()}
    catch(error){alert(error.message||'처리하지 못했습니다.');if(button){button.disabled=false;button.textContent=button.dataset.label||'다시'}}
  }
  async function load(){
    if(state.loading)return;
    state.loading=true;render();
    try{state.data=await request('character/loadout');render()}
    catch(error){const root=document.getElementById('characterSystemRoot');if(root)root.innerHTML=`<div class="compact-empty-v1238"><b>장비 정보를 불러오지 못했습니다.</b><button type="button" id="characterRetry">다시 불러오기</button></div>`;document.getElementById('characterRetry')?.addEventListener('click',load)}
    finally{state.loading=false}
  }
  window.characterView=function(characterUser){return `${typeof summaryBar==='function'?summaryBar(characterUser):''}<section id="characterSystemRoot" class="character-system-root-v1238"><div class="compact-loading-v1238"><span></span><b>불러오는 중...</b></div></section>`};
  window.bindCharacterView=load;
  window.refreshCharacterSystem=load;
  window.showEquipmentDropReward=async function(reward){
    if(!reward?.item)return;
    const item=reward.item;
    document.getElementById('equipmentDropToast')?.remove();
    const toast=document.createElement('div');toast.id='equipmentDropToast';toast.className='compact-drop-toast-v1238';
    toast.innerHTML=`<div class="compact-drop-backdrop-v1238"></div><div class="compact-drop-card-v1238 ${rarityClass(item.rarity)}"><h3>장비 획득</h3><div class="compact-drop-icon-v1238">${itemImage(item,item.slot)}</div><strong>${esc(item.name)}</strong><small>${esc(item.slotLabel)} · ${esc(subtypeLabels[item.subtype]||item.subtype)}</small><div><i>PVE +${num(item.pvePower)}</i><i>PVP +${num(item.pvpPower)}</i></div><button type="button">확인</button></div>`;
    document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),180);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,3000)});
  };
})();
