/* V1239 PREMIUM REFERENCE CHARACTER EQUIPMENT + TITLE UI */
(()=>{
  const state={data:null,loading:false,tab:'equipment',slot:'WEAPON'};
  const slotIcons={WEAPON:'⚔',TOP:'▣',BOTTOM:'▤',SHOES:'⛛',ACCESSORY:'◉'};
  const defaultSlotDesc={WEAPON:'현대식 무기',ACCESSORY:'듀얼디스크',TOP:'상의',BOTTOM:'하의',SHOES:'신발'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감',CARD_SET:'카드 세트',CONTENT_CLEAR:'콘텐츠'};
  const titleStyleLabels={DEFAULT:'기본',FOREST:'숲',FLAME:'화염',FROST:'서리',STORM:'폭풍',SHADOW:'그림자',GOLD:'황금',RAINBOW:'무지개',VOID:'심연'};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0).toLocaleString();
  const user=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options)=>apiRequest(path,options);
  const normRarity=value=>{const aliases={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',LEGEND:'LEGENDARY',MYTH:'MYTHIC'};const raw=String(value||'NORMAL').toUpperCase();const normalized=aliases[raw]||raw;return rarityLabels[normalized]?normalized:'NORMAL'};
  const normTitleStyle=value=>{const raw=String(value||'DEFAULT').toUpperCase();return titleStyleLabels[raw]?raw:'DEFAULT'};
  const rarityClass=value=>`rarity-${normRarity(value).toLowerCase()}`;
  const titleClass=value=>`title-style-${normTitleStyle(value).toLowerCase()}`;
  const equipmentSlots=['WEAPON','ACCESSORY','TOP','BOTTOM','SHOES'];

  function equippedFor(slot){
    const instanceId=Number(state.data?.loadout?.[slot]||0);
    return state.data?.instances?.find(row=>Number(row.instanceId)===instanceId)||null;
  }
  function currentTitle(){
    const titleId=Number(state.data?.equippedTitleId||0);
    return state.data?.titles?.find(row=>Number(row.id)===titleId)||state.data?.bonuses?.title||null;
  }
  function titleBadge(title){
    const name=title?(title.badgeText||title.name):'칭호 없음';
    return `<div class="premium-title-badge-v1239 ${title?titleClass(title.stylePreset):'title-style-default'} ${title?'owned':'empty'}"><span>[${esc(name)}]</span></div>`;
  }
  function itemVisual(item,slot,{small=false}={}){
    const body=item?.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">` : `<span class="premium-slot-icon-fallback-v1239">${slotIcons[slot]||'◇'}</span>`;
    return `<div class="premium-item-slot-v1239 ${small?'small':''} ${item?rarityClass(item.rarity):'empty'}">${body}</div>`;
  }
  function slotName(slot){
    return state.data?.slots?.find(row=>row.id===slot)?.label || ({WEAPON:'무기',ACCESSORY:'장신구',TOP:'상의',BOTTOM:'하의',SHOES:'신발'}[slot]||slot);
  }
  function slotDescription(slot,item){
    if(!item)return defaultSlotDesc[slot]||slotName(slot);
    return subtypeLabels[item.subtype]||item.name||defaultSlotDesc[slot]||slotName(slot);
  }
  function slotBlock(slot){
    const item=equippedFor(slot)?.item || null;
    return `<div class="premium-slot-wrapper-v1239 ${item?'filled':''} ${item?rarityClass(item.rarity):''}">
      <button type="button" class="premium-slot-hit-v1239" data-character-filter="${slot}">${itemVisual(item,slot)}${item?`<i class="premium-slot-glow-v1239"></i>`:''}</button>
      <div class="premium-slot-label-v1239">${esc(slotName(slot))}</div>
      <div class="premium-slot-desc-v1239">${esc(slotDescription(slot,item))}</div>
      ${item?`<button type="button" class="premium-slot-remove-v1239" data-character-unequip="${slot}">×</button>`:''}
    </div>`;
  }
  function equipmentPanel(){
    return `<div class="premium-equipment-panel-v1239">
      <div class="premium-char-title-v1239">${titleBadge(currentTitle())}</div>
      <div class="premium-slots-column-v1239 left" style="justify-content:center;height:100%;">
        ${slotBlock('WEAPON')}
        <div class="premium-slot-gap-v1239"></div>
        ${slotBlock('ACCESSORY')}
      </div>
      <div class="premium-character-display-v1239"><img src="assets/ui/character-avatar-modern-v1239.jpg" class="premium-character-image-v1239" alt="캐릭터" loading="lazy"></div>
      <div class="premium-slots-column-v1239 right">
        ${slotBlock('TOP')}
        ${slotBlock('BOTTOM')}
        ${slotBlock('SHOES')}
      </div>
    </div>`;
  }
  function statsPanel(){
    const bonuses=state.data?.bonuses||{};
    return `<div class="premium-stats-panel-v1239">
      <div class="premium-stat-box-v1239"><div class="premium-stat-title-v1239 pve-color"><span>💠</span> PVE</div><div class="premium-stat-value-v1239 pve-color">+${num(bonuses.pve)}</div></div>
      <div class="premium-stat-box-v1239"><div class="premium-stat-title-v1239 pvp-color"><span>♦️</span> PVP</div><div class="premium-stat-value-v1239 pvp-color">+${num(bonuses.pvp)}</div></div>
    </div>`;
  }
  function equipmentInventory(){
    const items=state.data?.instances||[];
    const filtered=items.filter(row=>state.slot==='ALL'||row.item.slot===state.slot);
    return `<div class="premium-inventory-section-v1239">
      <div class="premium-inv-header-v1239">보유 장비 <span class="premium-inv-count-v1239">${items.length}</span></div>
      <div class="premium-filter-tabs-v1239">
        <button type="button" class="premium-filter-btn-v1239 ${state.slot==='ALL'?'active':''}" data-character-filter="ALL">전체</button>
        ${equipmentSlots.map(slot=>`<button type="button" class="premium-filter-btn-v1239 ${state.slot===slot?'active':''}" data-character-filter="${slot}">${esc(slotName(slot))}</button>`).join('')}
      </div>
      <div class="premium-item-grid-v1239">
        ${filtered.length?filtered.map(row=>{const item=row.item;return `<button type="button" class="premium-grid-item-v1239 ${row.equipped?'equipped':''} ${rarityClass(item.rarity)}" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}">
          ${itemVisual(item,item.slot,{small:true})}
          <strong>${esc(item.name)}</strong>
          <small>${esc(slotName(item.slot))} · ${esc(slotDescription(item.slot,item))}</small>
          <div class="premium-item-meta-v1239"><i>${esc(rarityLabels[normRarity(item.rarity)]||item.rarity)}</i><i>PVE ${num(item.pvePower)}</i><i>PVP ${num(item.pvpPower)}</i></div>
        </button>`}).join(''):`<div class="premium-empty-state-v1239">보유 장비<br>없음</div>`}
      </div>
    </div>`;
  }
  function titleRequirement(row){
    const cfg=row.unlockConfig||{};
    switch(row.unlockType){
      case 'COLLECTION_COUNT':return `도감 ${num(cfg.count||1)}장`;
      case 'GRADE_COUNT':return `${esc(cfg.grade||'지정')} ${num(cfg.count||1)}장`;
      case 'MEMBER_COMPLETE':return '멤버 도감';
      case 'CARD_SET':return '카드 세트';
      case 'CONTENT_CLEAR':return '콘텐츠';
      default:return '운영 지급';
    }
  }
  function titlePanel(){
    const titles=state.data?.titles||[];
    const equipped=currentTitle();
    return `<div class="premium-title-section-v1239">
      <div class="premium-title-current-v1239">
        <small>현재 칭호</small>
        ${titleBadge(equipped)}
        <b>PVE +${num(equipped?.pvePower || state.data?.bonuses?.titlePve)}</b>
      </div>
      <div class="premium-title-grid-v1239">
        ${titles.length?titles.map(row=>{
          const action=row.owned ? (row.equipped ? '<button type="button" data-character-title-unequip>해제</button>' : `<button type="button" data-character-title-equip="${row.id}">장착</button>`) : '<button type="button" disabled>미획득</button>';
          return `<article class="premium-title-card-v1239 ${row.owned?'owned':'locked'} ${row.equipped?'equipped':''}">
            ${titleBadge(row)}
            <small>${esc(titleStyleLabels[normTitleStyle(row.stylePreset)]||'기본')} · ${esc(row.owned?(unlockLabels[row.unlockType]||row.unlockType):titleRequirement(row))}</small>
            <b>PVE +${num(row.pvePower)}</b>
            ${action}
          </article>`;
        }).join(''):`<div class="premium-empty-state-v1239">등록된 칭호 없음</div>`}
      </div>
    </div>`;
  }
  function appHtml(){
    const profile=user();
    return `<div class="premium-inventory-ui-v1239">
      <div class="premium-user-header-v1239">${esc(profile?.nickname||'플레이어')}</div>
      <div class="premium-header-tabs-v1239">
        <button type="button" class="premium-tab-btn-v1239 ${state.tab==='equipment'?'active':''}" data-character-tab="equipment"><span>⚔️</span> EQUIPMENT</button>
        <button type="button" class="premium-tab-btn-v1239 ${state.tab==='title'?'active':''}" data-character-tab="title"><span>🏆</span> TITLES</button>
      </div>
      ${state.tab==='equipment' ? equipmentPanel()+statsPanel()+equipmentInventory() : titlePanel()}
    </div>`;
  }
  function bind(root){
    root.querySelectorAll('[data-character-tab]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.characterTab;render()});
    root.querySelectorAll('[data-character-filter]').forEach(button=>button.onclick=()=>{state.slot=button.dataset.characterFilter;render()});
    root.querySelectorAll('[data-character-equip]').forEach(button=>button.onclick=()=>mutate('character/equipment/equip',{instanceId:Number(button.dataset.characterEquip)},button));
    root.querySelectorAll('[data-character-unequip]').forEach(button=>button.onclick=event=>{event.stopPropagation();mutate('character/equipment/unequip',{slot:button.dataset.characterUnequip},button)});
    root.querySelectorAll('[data-character-title-equip]').forEach(button=>button.onclick=()=>mutate('character/title/equip',{titleId:Number(button.dataset.characterTitleEquip)},button));
    root.querySelectorAll('[data-character-title-unequip]').forEach(button=>button.onclick=()=>mutate('character/title/unequip',{},button));
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');
    if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="premium-loading-v1239"><span></span><b>불러오는 중...</b></div>';return;}
    if(!state.data){root.innerHTML='<div class="premium-empty-state-v1239">장비 정보를 불러오지 못했습니다.</div>';return;}
    root.innerHTML=appHtml();
    bind(root);
  }
  async function mutate(path,body,button){
    if(button){button.disabled=true;button.dataset.label=button.textContent;button.textContent='처리 중'}
    try{state.data=await request(path,{method:'POST',body:JSON.stringify(body)});render();}
    catch(error){alert(error.message||'처리하지 못했습니다.');if(button){button.disabled=false;button.textContent=button.dataset.label||'다시'}}
  }
  async function load(){
    if(state.loading)return;
    state.loading=true;render();
    try{state.data=await request('character/loadout');render();}
    catch(error){const root=document.getElementById('characterSystemRoot');if(root){root.innerHTML=`<div class="premium-empty-state-v1239"><b>장비 정보를 불러오지 못했습니다.</b><button type="button" id="characterRetry">다시 불러오기</button></div>`;document.getElementById('characterRetry')?.addEventListener('click',load);}}
    finally{state.loading=false;}
  }
  window.characterView=function(characterUser){return `${typeof summaryBar==='function'?summaryBar(characterUser):''}<section id="characterSystemRoot" class="character-system-root-v1239"><div class="premium-loading-v1239"><span></span><b>불러오는 중...</b></div></section>`};
  window.bindCharacterView=load;
  window.refreshCharacterSystem=load;
  window.showEquipmentDropReward=async function(reward){
    if(!reward?.item)return;
    const item=reward.item;
    document.getElementById('equipmentDropToast')?.remove();
    const toast=document.createElement('div');
    toast.id='equipmentDropToast';
    toast.className='premium-drop-toast-v1239';
    toast.innerHTML=`<div class="premium-drop-backdrop-v1239"></div><div class="premium-drop-card-v1239 ${rarityClass(item.rarity)}"><h3>장비 획득</h3>${itemVisual(item,item.slot)}<strong>${esc(item.name)}</strong><small>${esc(slotName(item.slot))} · ${esc(slotDescription(item.slot,item))}</small><div class="premium-item-meta-v1239 center"><i>PVE ${num(item.pvePower)}</i><i>PVP ${num(item.pvpPower)}</i><i>${esc(rarityLabels[normRarity(item.rarity)]||item.rarity)}</i></div><button type="button">확인</button></div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),180);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,3200)});
  };
})();
