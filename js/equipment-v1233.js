/* V1233 CHARACTER EQUIPMENT + TITLE UI */
(()=>{
  const state={data:null,loading:false,slot:'ALL'};
  const slotIcons={WEAPON:'⚔',TOP:'◫',BOTTOM:'◪',SHOES:'⛛',ACCESSORY:'◎'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'카드 도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감 완성',CARD_SET:'카드 세트',CONTENT_CLEAR:'콘텐츠 클리어'};
  const titleStyleLabels={DEFAULT:'기본',FOREST:'숲',FLAME:'화염',FROST:'서리',STORM:'폭풍',SHADOW:'그림자',GOLD:'황금',RAINBOW:'무지개',VOID:'심연'};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0).toLocaleString();
  const user=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options)=>apiRequest(path,options);
  const normRarity=value=>{const map={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',LEGEND:'LEGENDARY',MYTH:'MYTHIC'};const raw=String(value||'NORMAL').toUpperCase();return rarityLabels[raw]?raw:(rarityLabels[map[raw]]?map[raw]:'NORMAL')};
  const normTitlePreset=value=>{const raw=String(value||'DEFAULT').toUpperCase();return titleStyleLabels[raw]?raw:'DEFAULT'};
  const titleStyleClass=value=>`title-style-${normTitlePreset(value).toLowerCase()}`;
  const rarityClass=value=>`rarity-${normRarity(value).toLowerCase()}`;
  const stageColumns={left:['WEAPON','SHOES'],right:['TOP','BOTTOM','ACCESSORY']};

  function itemVisual(item,{large=false,slot}={}){
    const image=item?.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`:`<span>${slotIcons[item?.slot||slot]||'◇'}</span>`;
    return `<div class="character-item-visual ${large?'large':''} ${rarityClass(item?.rarity)}">${image}${item?`<b class="character-item-rarity-chip">${esc(rarityLabels[normRarity(item.rarity)])}</b>`:''}</div>`;
  }
  function equippedFor(slot){
    if(!state.data)return null;
    const instanceId=Number(state.data.loadout?.[slot]||0);
    return state.data.instances.find(row=>Number(row.instanceId)===instanceId)||null;
  }
  function titleCondition(title){
    const cfg=title.unlockConfig||{};
    switch(title.unlockType){
      case 'COLLECTION_COUNT':return `카드 도감 ${num(cfg.count||1)}장`;
      case 'GRADE_COUNT':return `${esc(cfg.grade||'지정')} 등급 ${num(cfg.count||1)}장`;
      case 'MEMBER_COMPLETE':return `멤버 도감 완성`;
      case 'CARD_SET':return `카드 세트 수집`;
      case 'CONTENT_CLEAR':{
        const source={PVE:'PVE',PVE_AUTO:'자동전투',TOWER:'무한의탑',RAID:'레이드',RIFT:'차원의 균열',PVP:'PVP',CAPTAIN:'대장전'}[String(cfg.sourceType||cfg.source_type||'').toUpperCase()]||'콘텐츠';
        const key=String(cfg.sourceKey??cfg.sourceId??cfg.source_id??'*');
        return `${source}${key&&key!=='*'?` ${esc(key)}`:''} ${num(cfg.count||1)}회`;
      }
      default:return '운영 지급';
    }
  }
  function currentTitle(){
    const titleId=Number(state.data?.equippedTitleId||0);
    return state.data?.titles?.find(t=>Number(t.id)===titleId)||state.data?.bonuses?.title||null;
  }
  function titleRibbon(title,{inline=false}={}){
    const name=title?(title.badgeText||title.name):'칭호 없음';
    return `<div class="character-title-ribbon ${inline?'inline':''} ${title?titleStyleClass(title.stylePreset):'title-style-default'} ${title?'owned':'empty'}"><span>${title?`[${esc(name)}]`:'[칭호 없음]'}</span></div>`;
  }
  function heroHtml(){
    const d=state.data,u=user(),title=currentTitle();
    return `<section class="character-hero-v1233">
      <div class="character-hero-main-v1233">
        ${titleRibbon(title,{inline:true})}
        <h2>${esc(u?.nickname||'플레이어')}</h2>
      </div>
      <div class="character-bonus-board-v1233">
        <span><small>PVE</small><b>+${num(d?.bonuses?.pve)}</b></span>
        <span><small>PVP</small><b>+${num(d?.bonuses?.pvp)}</b></span>
        <span><small>장착</small><b>${(d?.slots||[]).filter(slot=>equippedFor(slot.id)).length} / ${(d?.slots||[]).length||0}</b></span>
      </div>
    </section>`;
  }
  function slotTile(slot){
    const row=equippedFor(slot.id),item=row?.item;
    return `<button type="button" class="character-slot-tile-v1233 ${item?'equipped':''} ${item?rarityClass(item.rarity):''} ${state.slot===slot.id?'focused':''}" data-character-filter="${slot.id}">
      <div class="character-slot-label-v1233"><i>${slotIcons[slot.id]||'◇'}</i><span>${esc(slot.label)}</span></div>
      ${itemVisual(item,{slot:slot.id})}
      <strong>${esc(item?.name||slot.label)}</strong>
      <small>${item?esc(subtypeLabels[item.subtype]||item.subtype):'비어 있음'}</small>
    </button>`;
  }
  function summaryStrip(){
    const slots=state.data?.slots||[];
    return `<div class="character-equipped-strip-v1233">${slots.map(slot=>{const row=equippedFor(slot.id),item=row?.item;return `<div class="character-equipped-pill-v1233 ${item?'filled':''}"><b>${esc(slot.label)}</b><span>${esc(item?.name||'-')}</span>${item?`<i>${esc(rarityLabels[normRarity(item.rarity)]||item.rarity)}</i>`:''}${item?`<button type="button" class="ghost" data-character-unequip="${slot.id}">해제</button>`:''}</div>`}).join('')}</div>`;
  }
  function showcaseHtml(){
    const title=currentTitle();
    return `<section class="character-stage-shell-v1233">
      <div class="character-stage-board-v1233">
        <div class="character-stage-col-v1233 left">${stageColumns.left.map(id=>slotTile((state.data?.slots||[]).find(s=>s.id===id)||{id,label:id})).join('')}</div>
        <div class="character-center-v1233">
          <div class="character-stage-glow-v1233"></div>
          <div class="character-stage-frame-v1233">
            ${titleRibbon(title)}
            <img class="character-mannequin-art-v1233" src="assets/ui/character-mannequin-v1233.svg" alt="캐릭터 마네킹" loading="lazy">
          </div>
        </div>
        <div class="character-stage-col-v1233 right">${stageColumns.right.map(id=>slotTile((state.data?.slots||[]).find(s=>s.id===id)||{id,label:id})).join('')}</div>
      </div>
      ${summaryStrip()}
    </section>`;
  }
  function inventoryHtml(){
    const instances=state.data?.instances||[],filter=state.slot;
    const list=instances.filter(row=>filter==='ALL'||row.item.slot===filter);
    return `<section class="character-panel-v1233">
      <div class="character-section-head-v1233"><div><h3>보유 장비</h3></div><b>${instances.length}개</b></div>
      <div class="character-filter-row-v1233"><button class="${filter==='ALL'?'active':''}" data-character-filter="ALL">전체</button>${(state.data?.slots||[]).map(slot=>`<button class="${filter===slot.id?'active':''}" data-character-filter="${slot.id}">${esc(slot.label)}</button>`).join('')}</div>
      <div class="character-inventory-grid-v1233">${list.length?list.map(row=>{const i=row.item;return `<article class="character-item-card-v1233 ${row.equipped?'equipped':''} ${rarityClass(i.rarity)}"><div class="character-item-card-main-v1233">${itemVisual(i)}<div><small>${esc(i.slotLabel)} · ${esc(subtypeLabels[i.subtype]||i.subtype)} · ${esc(rarityLabels[normRarity(i.rarity)]||i.rarity)}</small><h4>${esc(i.name)}</h4><div class="character-slot-pill-row-v1233"><i>PVE +${num(i.pvePower)}</i><i>PVP +${num(i.pvpPower)}</i><i>총 ${num(i.totalPower)}</i></div></div></div><button type="button" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}">${row.equipped?'장착 중':'장착'}</button></article>`}).join(''):'<div class="character-empty-list-v1233">해당 부위 장비가 없습니다.</div>'}</div>
    </section>`;
  }
  function titlesHtml(){
    const titles=state.data?.titles||[];
    const owned=titles.filter(t=>t.owned);
    return `<section class="character-panel-v1233 title-panel-v1233">
      <div class="character-section-head-v1233"><div><h3>칭호</h3></div><b>${owned.length} / ${titles.length}</b></div>
      <div class="character-title-grid-v1233">${titles.length?titles.map(t=>`<article class="character-title-card-v1233 ${t.owned?'owned':'locked'} ${t.equipped?'equipped':''}"><div class="character-title-card-top-v1233">${titleRibbon(t)}${t.image?`<div class="character-title-badge-v1233"><img src="${esc(t.image)}" alt=""></div>`:`<div class="character-title-badge-v1233"><span>♛</span></div>`}</div><div class="character-title-copy-v1233"><small>${esc(unlockLabels[t.unlockType]||t.unlockType)} · ${esc(titleStyleLabels[normTitlePreset(t.stylePreset)]||'기본')}</small><h4>${esc(t.name)}</h4><div class="character-slot-pill-row-v1233"><i>PVE +${num(t.pvePower)}</i>${!t.owned?`<i>${esc(titleCondition(t))}</i>`:''}</div></div>${t.owned?`<button type="button" ${t.equipped?'data-character-title-unequip':'data-character-title-equip="'+t.id+'"'}>${t.equipped?'해제':'장착'}</button>`:'<button type="button" disabled>미획득</button>'}</article>`).join(''):'<div class="character-empty-list-v1233">등록된 칭호가 없습니다.</div>'}</div>
    </section>`;
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="character-loading-v1233"><span></span><b>불러오는 중...</b></div>';return}
    if(!state.data){root.innerHTML='<div class="character-empty-list-v1233">장비 정보를 불러오지 못했습니다.</div>';return}
    root.innerHTML=heroHtml()+showcaseHtml()+inventoryHtml()+titlesHtml();
    root.querySelectorAll('[data-character-filter]').forEach(button=>button.onclick=()=>{state.slot=button.dataset.characterFilter;render();document.querySelector('.character-inventory-grid-v1233')?.scrollIntoView({behavior:'smooth',block:'center'})});
    root.querySelectorAll('[data-character-equip]').forEach(button=>button.onclick=()=>mutate('character/equipment/equip',{instanceId:Number(button.dataset.characterEquip)},button));
    root.querySelectorAll('[data-character-unequip]').forEach(button=>button.onclick=()=>mutate('character/equipment/unequip',{slot:button.dataset.characterUnequip},button));
    root.querySelectorAll('[data-character-title-equip]').forEach(button=>button.onclick=()=>mutate('character/title/equip',{titleId:Number(button.dataset.characterTitleEquip)},button));
    root.querySelectorAll('[data-character-title-unequip]').forEach(button=>button.onclick=()=>mutate('character/title/unequip',{},button));
  }
  async function mutate(path,body,button){
    if(button){button.disabled=true;button.dataset.label=button.textContent;button.textContent='처리 중...'}
    try{state.data=await request(path,{method:'POST',body:JSON.stringify(body)});render()}catch(error){alert(error.message||'처리하지 못했습니다.');if(button){button.disabled=false;button.textContent=button.dataset.label||'다시 시도'}}
  }
  async function load(){
    if(state.loading)return;state.loading=true;render();
    try{state.data=await request('character/loadout');render()}catch(error){const root=document.getElementById('characterSystemRoot');if(root)root.innerHTML=`<div class="character-empty-list-v1233"><b>장비 정보를 불러오지 못했습니다.</b><p>${esc(error.message)}</p><button type="button" id="characterRetry">다시 불러오기</button></div>`;document.getElementById('characterRetry')?.addEventListener('click',load)}finally{state.loading=false}
  }
  window.characterView=function(characterUser){return `${typeof summaryBar==='function'?summaryBar(characterUser):''}<section id="characterSystemRoot" class="character-system-root-v1233"><div class="character-loading-v1233"><span></span><b>불러오는 중...</b></div></section>`};
  window.bindCharacterView=load;
  window.refreshCharacterSystem=load;
  window.showEquipmentDropReward=async function(reward){
    if(!reward?.item)return;
    document.getElementById('equipmentDropToast')?.remove();
    const item=reward.item,toast=document.createElement('div');
    toast.id='equipmentDropToast';
    toast.className=`equipment-drop-toast-v1233 ${rarityClass(item.rarity)}`;
    toast.innerHTML=`<div class="equipment-drop-backdrop-v1233"></div><div class="equipment-drop-toast-card-v1233"><h3>장비 획득</h3>${itemVisual(item,{large:true})}<strong>${esc(item.name)}</strong><p>${esc(item.slotLabel)} · ${esc(subtypeLabels[item.subtype]||item.subtype)} · ${esc(rarityLabels[normRarity(item.rarity)]||item.rarity)}</p><div class="character-slot-pill-row-v1233 centered"><i>총 ${num(item.totalPower)}</i><i>PVE +${num(item.pvePower)}</i><i>PVP +${num(item.pvpPower)}</i></div><button type="button">확인</button></div>`;
    document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),220);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,3200)});
  };
})();
