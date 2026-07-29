/* V1235 CHARACTER EQUIPMENT + TITLE UI */
(()=>{
  const state={data:null,loading:false,slot:'ALL'};
  const slotIcons={WEAPON:'⚔',TOP:'▣',BOTTOM:'◫',SHOES:'⛛',ACCESSORY:'◉'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감',CARD_SET:'카드 세트',CONTENT_CLEAR:'콘텐츠'};
  const titleStyleLabels={DEFAULT:'기본',FOREST:'숲',FLAME:'화염',FROST:'서리',STORM:'폭풍',SHADOW:'그림자',GOLD:'황금',RAINBOW:'무지개',VOID:'심연'};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0).toLocaleString();
  const user=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options)=>apiRequest(path,options);
  const normRarity=value=>{const map={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',LEGEND:'LEGENDARY',MYTH:'MYTHIC'};const raw=String(value||'NORMAL').toUpperCase();return rarityLabels[raw]?raw:(rarityLabels[map[raw]]?map[raw]:'NORMAL')};
  const normTitlePreset=value=>{const raw=String(value||'DEFAULT').toUpperCase();return titleStyleLabels[raw]?raw:'DEFAULT'};
  const titleStyleClass=value=>`title-style-${normTitlePreset(value).toLowerCase()}`;
  const rarityClass=value=>`rarity-${normRarity(value).toLowerCase()}`;
  const stageLayout={left:['WEAPON','ACCESSORY'],right:['TOP','BOTTOM','SHOES']};

  function equippedFor(slot){
    if(!state.data)return null;
    const instanceId=Number(state.data.loadout?.[slot]||0);
    return state.data.instances.find(row=>Number(row.instanceId)===instanceId)||null;
  }
  function currentTitle(){
    const titleId=Number(state.data?.equippedTitleId||0);
    return state.data?.titles?.find(t=>Number(t.id)===titleId)||state.data?.bonuses?.title||null;
  }
  function titleRibbon(title,{small=false}={}){
    const name=title?(title.badgeText||title.name):'칭호 없음';
    return `<div class="character-title-ribbon-v1235 ${small?'small':''} ${title?titleStyleClass(title.stylePreset):'title-style-default'} ${title?'owned':'empty'}"><span>[${esc(name)}]</span></div>`;
  }
  function itemIcon(item,slot,{large=false}={}){
    const body=item?.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`:`<span>${slotIcons[slot]||'◇'}</span>`;
    return `<div class="equip-icon-v1235 ${large?'large':''} ${item?rarityClass(item.rarity):'empty'}">${body}${item?`<b>${esc(rarityLabels[normRarity(item.rarity)])}</b>`:''}</div>`;
  }
  function heroHtml(){
    const d=state.data,u=user(),title=currentTitle();
    return `<section class="equip-hero-v1235"><div class="equip-hero-name-v1235"><small>SOOP EQUIPMENT</small><h2>${esc(u?.nickname||'플레이어')}</h2>${titleRibbon(title,{small:true})}</div><div class="equip-hero-stats-v1235"><span><small>PVE</small><b>+${num(d?.bonuses?.pve)}</b></span><span><small>PVP</small><b>+${num(d?.bonuses?.pvp)}</b></span><span><small>칭호</small><b>+${num(d?.bonuses?.titlePve)}</b></span></div></section>`;
  }
  function slotNode(slotId){
    const slot=(state.data?.slots||[]).find(s=>s.id===slotId)||{id:slotId,label:slotId};
    const row=equippedFor(slotId),item=row?.item;
    return `<div class="equip-slot-node-v1235 ${item?'filled':''} ${item?rarityClass(item.rarity):''} ${state.slot===slotId?'focused':''}"><button type="button" class="equip-slot-hit-v1235" data-character-filter="${slotId}"></button><div class="equip-slot-label-v1235">${esc(slot.label)}</div>${itemIcon(item,slotId)}<div class="equip-slot-name-v1235">${esc(item?.name||'비어 있음')}</div>${item?`<button type="button" class="equip-slot-remove-v1235" data-character-unequip="${slotId}">×</button>`:''}</div>`;
  }
  function stageHtml(){
    const title=currentTitle();
    return `<section class="equip-stage-shell-v1235"><div class="equip-stage-board-v1235"><div class="equip-stage-column-v1235 left">${stageLayout.left.map(slotNode).join('')}</div><div class="equip-stage-center-v1235"><div class="equip-stage-frame-v1235"><div class="equip-stage-title-v1235">${titleRibbon(title)}</div><div class="equip-character-panel-v1235"><div class="equip-character-aura-v1235"></div><img src="assets/ui/character-avatar-v1235.svg" alt="캐릭터" class="equip-character-art-v1235" loading="lazy"></div><div class="equip-stage-bottomstats-v1235"><span><small>장비 PVE</small><b>+${num(state.data?.bonuses?.equipmentPve)}</b></span><span><small>장비 PVP</small><b>+${num(state.data?.bonuses?.equipmentPvp)}</b></span></div></div></div><div class="equip-stage-column-v1235 right">${stageLayout.right.map(slotNode).join('')}</div></div><div class="equip-loadout-strip-v1235">${(state.data?.slots||[]).map(slot=>{const row=equippedFor(slot.id),item=row?.item;return `<div class="equip-loadout-cell-v1235 ${item?'filled':''}"><small>${esc(slot.label)}</small><b>${esc(item?.name||'-')}</b></div>`}).join('')}</div></section>`;
  }
  function inventoryHtml(){
    const instances=state.data?.instances||[],filter=state.slot;
    const list=instances.filter(row=>filter==='ALL'||row.item.slot===filter);
    return `<section class="equip-panel-v1235"><div class="equip-panel-head-v1235"><h3>장비</h3><div class="equip-filter-row-v1235"><button class="${filter==='ALL'?'active':''}" data-character-filter="ALL">전체</button>${(state.data?.slots||[]).map(slot=>`<button class="${filter===slot.id?'active':''}" data-character-filter="${slot.id}">${esc(slot.label)}</button>`).join('')}</div></div><div class="equip-grid-v1235">${list.length?list.map(row=>{const i=row.item;return `<article class="equip-item-tile-v1235 ${row.equipped?'equipped':''} ${rarityClass(i.rarity)}"><div class="equip-item-top-v1235">${itemIcon(i,i.slot)}<button type="button" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}">${row.equipped?'장착':'착용'}</button></div><div class="equip-item-meta-v1235"><strong>${esc(i.name)}</strong><small>${esc(i.slotLabel)} · ${esc(subtypeLabels[i.subtype]||i.subtype)}</small><div class="equip-chip-row-v1235"><i>${esc(rarityLabels[normRarity(i.rarity)]||i.rarity)}</i><i>PVE ${num(i.pvePower)}</i><i>PVP ${num(i.pvpPower)}</i></div></div></article>`}).join(''):'<div class="character-empty-list-v1235">보유 장비 없음</div>'}</div></section>`;
  }
  function titleCondition(title){
    const cfg=title.unlockConfig||{};
    switch(title.unlockType){
      case 'COLLECTION_COUNT':return `도감 ${num(cfg.count||1)}장`;
      case 'GRADE_COUNT':return `${esc(cfg.grade||'지정')} ${num(cfg.count||1)}장`;
      case 'MEMBER_COMPLETE':return '멤버 도감';
      case 'CARD_SET':return '카드 세트';
      case 'CONTENT_CLEAR':return '콘텐츠';
      default:return '운영 지급';
    }
  }
  function titlesHtml(){
    const titles=state.data?.titles||[];
    const ownedCount=titles.filter(t=>t.owned).length;
    const body=titles.length?titles.map(t=>{
      const icon=t.image?`<div class="equip-title-icon-v1235"><img src="${esc(t.image)}" alt=""></div>`:'<div class="equip-title-icon-v1235"><span>♛</span></div>';
      const action=t.owned
        ? (t.equipped
            ? '<button type="button" data-character-title-unequip>해제</button>'
            : `<button type="button" data-character-title-equip="${t.id}">장착</button>`)
        : '<button type="button" disabled>미획득</button>';
      return `<article class="equip-title-tile-v1235 ${t.owned?'owned':'locked'} ${t.equipped?'equipped':''}"><div class="equip-title-head-v1235">${titleRibbon(t,{small:true})}${icon}</div><div class="equip-chip-row-v1235"><i>${esc(titleStyleLabels[normTitlePreset(t.stylePreset)]||'기본')}</i><i>PVE ${num(t.pvePower)}</i><i>${esc(t.owned?(unlockLabels[t.unlockType]||t.unlockType):titleCondition(t))}</i></div>${action}</article>`;
    }).join(''):'<div class="character-empty-list-v1235">등록된 칭호 없음</div>';
    return `<section class="equip-panel-v1235"><div class="equip-panel-head-v1235"><h3>칭호</h3><div class="equip-title-count-v1235">${ownedCount}/${titles.length}</div></div><div class="equip-title-grid-v1235">${body}</div></section>`;
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="character-loading-v1235"><span></span><b>불러오는 중...</b></div>';return}
    if(!state.data){root.innerHTML='<div class="character-empty-list-v1235">장비 정보를 불러오지 못했습니다.</div>';return}
    root.innerHTML=heroHtml()+stageHtml()+inventoryHtml()+titlesHtml();
    root.querySelectorAll('[data-character-filter]').forEach(button=>button.onclick=()=>{state.slot=button.dataset.characterFilter;render();document.querySelector('.equip-grid-v1235')?.scrollIntoView({behavior:'smooth',block:'center'})});
    root.querySelectorAll('[data-character-equip]').forEach(button=>button.onclick=()=>mutate('character/equipment/equip',{instanceId:Number(button.dataset.characterEquip)},button));
    root.querySelectorAll('[data-character-unequip]').forEach(button=>button.onclick=ev=>{ev.stopPropagation();mutate('character/equipment/unequip',{slot:button.dataset.characterUnequip},button)});
    root.querySelectorAll('[data-character-title-equip]').forEach(button=>button.onclick=()=>mutate('character/title/equip',{titleId:Number(button.dataset.characterTitleEquip)},button));
    root.querySelectorAll('[data-character-title-unequip]').forEach(button=>button.onclick=()=>mutate('character/title/unequip',{},button));
  }
  async function mutate(path,body,button){
    if(button){button.disabled=true;button.dataset.label=button.textContent;button.textContent='처리 중'}
    try{state.data=await request(path,{method:'POST',body:JSON.stringify(body)});render()}catch(error){alert(error.message||'처리하지 못했습니다.');if(button){button.disabled=false;button.textContent=button.dataset.label||'다시'}}
  }
  async function load(){
    if(state.loading)return;state.loading=true;render();
    try{state.data=await request('character/loadout');render()}catch(error){const root=document.getElementById('characterSystemRoot');if(root)root.innerHTML=`<div class="character-empty-list-v1235"><b>장비 정보를 불러오지 못했습니다.</b><p>${esc(error.message)}</p><button type="button" id="characterRetry">다시 불러오기</button></div>`;document.getElementById('characterRetry')?.addEventListener('click',load)}finally{state.loading=false}
  }
  window.characterView=function(characterUser){return `${typeof summaryBar==='function'?summaryBar(characterUser):''}<section id="characterSystemRoot" class="character-system-root-v1235"><div class="character-loading-v1235"><span></span><b>불러오는 중...</b></div></section>`};
  window.bindCharacterView=load;
  window.refreshCharacterSystem=load;
  window.showEquipmentDropReward=async function(reward){
    if(!reward?.item)return;
    document.getElementById('equipmentDropToast')?.remove();
    const item=reward.item,toast=document.createElement('div');
    toast.id='equipmentDropToast';
    toast.className=`equipment-drop-toast-v1235 ${rarityClass(item.rarity)}`;
    toast.innerHTML=`<div class="equipment-drop-backdrop-v1235"></div><div class="equipment-drop-toast-card-v1235"><div class="equipment-drop-title-v1235">장비 획득</div>${itemIcon(item,item.slot,{large:true})}<strong>${esc(item.name)}</strong><div class="equip-chip-row-v1235 centered"><i>${esc(item.slotLabel)}</i><i>${esc(subtypeLabels[item.subtype]||item.subtype)}</i><i>${esc(rarityLabels[normRarity(item.rarity)]||item.rarity)}</i></div><div class="equip-chip-row-v1235 centered"><i>총 ${num(item.totalPower)}</i><i>PVE ${num(item.pvePower)}</i><i>PVP ${num(item.pvpPower)}</i></div><button type="button">확인</button></div>`;
    document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),220);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,3200)});
  };
})();
