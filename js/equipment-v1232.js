/* V1232 CHARACTER EQUIPMENT + TITLE UI */
(()=>{
  const state={data:null,loading:false,slot:'ALL'};
  const slotIcons={WEAPON:'⚔',TOP:'◫',BOTTOM:'◪',SHOES:'⛛',ACCESSORY:'◎'};
  const slotIllustrations={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'카드 도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감 완성',CARD_SET:'지정 카드 세트',CONTENT_CLEAR:'콘텐츠 클리어'};
  const titleStyleLabels={DEFAULT:'기본',FOREST:'숲',FLAME:'화염',FROST:'서리',STORM:'폭풍',SHADOW:'그림자',GOLD:'황금',RAINBOW:'무지개',VOID:'심연'};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0).toLocaleString();
  const user=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options)=>apiRequest(path,options);
  const normRarity=value=>{const map={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',LEGEND:'LEGENDARY',MYTH:'MYTHIC'};const raw=String(value||'NORMAL').toUpperCase();return rarityLabels[raw]?raw:(rarityLabels[map[raw]]?map[raw]:'NORMAL')};
  const normTitlePreset=value=>{const raw=String(value||'DEFAULT').toUpperCase();return titleStyleLabels[raw]?raw:'DEFAULT'};
  const titleStyleClass=value=>`title-style-${normTitlePreset(value).toLowerCase()}`;
  const rarityClass=value=>`rarity-${normRarity(value).toLowerCase()}`;

  function itemVisual(item,{large=false,compact=false}={}){
    const image=item?.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`:`<span>${slotIcons[item?.slot]||'◇'}</span>`;
    return `<div class="character-item-visual ${large?'large':''} ${compact?'compact':''} ${rarityClass(item?.rarity)}">${image}<b class="character-item-rarity-chip">${esc(rarityLabels[normRarity(item?.rarity)])}</b></div>`;
  }
  function equippedFor(slot){
    if(!state.data)return null;
    const instanceId=Number(state.data.loadout?.[slot]||0);
    return state.data.instances.find(row=>Number(row.instanceId)===instanceId)||null;
  }
  function titleCondition(title){
    const cfg=title.unlockConfig||{};
    switch(title.unlockType){
      case 'COLLECTION_COUNT':return `카드 도감 ${num(cfg.count||1)}장 수집`;
      case 'GRADE_COUNT':return `${esc(cfg.grade||'지정')} 등급 카드 ${num(cfg.count||1)}장 수집`;
      case 'MEMBER_COMPLETE':return `지정 멤버 도감 완성`;
      case 'CARD_SET':return `지정 카드 ${Array.isArray(cfg.cardIds)?cfg.cardIds.length:0}장 모두 수집`;
      case 'CONTENT_CLEAR':{
        const source={PVE:'PVE',PVE_AUTO:'자동전투',TOWER:'무한의탑',RAID:'레이드',RIFT:'차원의 균열',PVP:'PVP',CAPTAIN:'대장전'}[String(cfg.sourceType||cfg.source_type||'').toUpperCase()]||'지정 콘텐츠';
        const key=String(cfg.sourceKey??cfg.sourceId??cfg.source_id??'*');
        return `${source}${key&&key!=='*'?` · 대상 ${esc(key)}`:''} ${num(cfg.count||1)}회 클리어`;
      }
      default:return '운영 이벤트 또는 CMS 지급';
    }
  }
  function currentTitle(){
    const titleId=Number(state.data?.equippedTitleId||0);
    return state.data?.titles?.find(t=>Number(t.id)===titleId)||state.data?.bonuses?.title||null;
  }
  function titleRibbon(title,{inline=false}={}){
    const name=title?(title.badgeText||title.name):'칭호 미장착';
    return `<div class="character-title-ribbon ${inline?'inline':''} ${title?titleStyleClass(title.stylePreset):'title-style-default'} ${title?'owned':'empty'}"><span>${title?`[${esc(name)}]`:'칭호 없음'}</span></div>`;
  }
  function heroHtml(){
    const d=state.data,u=user(),title=currentTitle();
    return `<section class="character-hero-v1232">
      <div class="character-hero-copy">
        <small>SOOP CHARACTER LOADOUT</small>
        ${titleRibbon(title,{inline:true})}
        <h2>${esc(u?.nickname||'플레이어')}</h2>
        <p>장비는 모든 덱에 공통 적용되며, 칭호는 PVE 전투력만 증가합니다.</p>
      </div>
      <div class="character-bonus-board-v1232">
        <span><small>총 PVE 증가</small><b>+${num(d?.bonuses?.pve)}</b><em>장비 ${num(d?.bonuses?.equipmentPve)} · 칭호 ${num(d?.bonuses?.titlePve)}</em></span>
        <span><small>총 PVP 증가</small><b>+${num(d?.bonuses?.pvp)}</b><em>장비 총 전투력의 10%</em></span>
        <span><small>장착 장비</small><b>${(d?.slots||[]).filter(slot=>equippedFor(slot.id)).length} / ${(d?.slots||[]).length||0}</b><em>닉네임 공용 장비</em></span>
      </div>
    </section>`;
  }
  function slotCard(slot){
    const row=equippedFor(slot.id),item=row?.item,filled=Boolean(row);
    return `<article class="character-slot-card slot-${slot.id.toLowerCase()} ${filled?'equipped':'empty'} ${filled?rarityClass(item.rarity):''} ${state.slot===slot.id?'focused':''}">
      <header><i>${slotIcons[slot.id]||'◇'}</i><b>${esc(slot.label)}</b></header>
      ${filled?itemVisual(item,{compact:true}):`<div class="character-slot-empty"><span>${slotIcons[slot.id]||'◇'}</span><small>${esc(slotIllustrations[slot.id]||slot.label)}</small></div>`}
      <div class="character-slot-meta">
        ${filled?`<strong>${esc(item.name)}</strong><small>${esc(subtypeLabels[item.subtype]||item.subtype||slot.label)} · ${esc(rarityLabels[normRarity(item.rarity)]||item.rarity)}</small><div class="character-slot-pill-row"><i>PVE +${num(item.pvePower)}</i><i>PVP +${num(item.pvpPower)}</i></div>`:`<strong>장비 없음</strong><small>이 슬롯에 장비를 선택하세요.</small>`}
      </div>
      <div class="character-slot-actions">
        <button type="button" data-character-filter="${slot.id}">${filled?'교체':'선택'}</button>
        ${filled?`<button type="button" class="ghost" data-character-unequip="${slot.id}">해제</button>`:''}
      </div>
    </article>`;
  }
  function showcaseHtml(){
    const title=currentTitle(),slots=state.data?.slots||[];
    const equipped=slots.map(slot=>equippedFor(slot.id)).filter(Boolean);
    return `<section class="character-showcase-shell">
      <div class="character-showcase-stage">
        <div class="character-stage-glow"></div>
        <div class="character-stage-ring ring-one"></div>
        <div class="character-stage-ring ring-two"></div>
        <div class="character-title-overhead">${titleRibbon(title)}</div>
        <img class="character-mannequin-art" src="assets/ui/character-mannequin.svg" alt="캐릭터 마네킹" loading="lazy">
        ${slots.map(slot=>slotCard(slot)).join('')}
      </div>
      <aside class="character-showcase-sidebar">
        <div class="character-sidebar-panel">
          <small>LOADOUT SUMMARY</small>
          <h3>장착 정보</h3>
          <ul>${equipped.length?equipped.map(row=>`<li><b>${esc(row.item.slotLabel)}</b><span>${esc(row.item.name)}</span></li>`).join(''):'<li class="empty"><span>아직 장착한 장비가 없습니다.</span></li>'}</ul>
        </div>
        <div class="character-sidebar-panel compact">
          <small>ACTIVE TITLE</small>
          <h3>장착 칭호</h3>
          ${title?`${titleRibbon(title)}<p>${esc(title.description||titleCondition(title))}</p><div class="character-slot-pill-row"><i>PVE +${num(title.pvePower||state.data?.bonuses?.titlePve)}</i><i>${esc(titleStyleLabels[normTitlePreset(title.stylePreset)]||'기본')} 효과</i></div>`:'<p>장착된 칭호가 없습니다. 아래 칭호 목록에서 하나를 선택할 수 있습니다.</p>'}
        </div>
      </aside>
    </section>`;
  }
  function inventoryHtml(){
    const instances=state.data?.instances||[],filter=state.slot;
    const list=instances.filter(row=>filter==='ALL'||row.item.slot===filter);
    return `<section class="character-panel-v1232">
      <div class="character-section-head-v1232"><div><small>EQUIPMENT INVENTORY</small><h3>보유 장비</h3><p>장비 칸 이미지는 자동으로 contain 정렬되며, 긴 무기 이미지도 해상도에 맞춰 축소 표시됩니다.</p></div><b>${instances.length}개</b></div>
      <div class="character-filter-row-v1232"><button class="${filter==='ALL'?'active':''}" data-character-filter="ALL">전체</button>${(state.data?.slots||[]).map(slot=>`<button class="${filter===slot.id?'active':''}" data-character-filter="${slot.id}">${esc(slot.label)}</button>`).join('')}</div>
      <div class="character-inventory-grid-v1232">${list.length?list.map(row=>{const i=row.item;return `<article class="character-item-card-v1232 ${row.equipped?'equipped':''} ${rarityClass(i.rarity)}"><div class="character-item-card-main">${itemVisual(i)}<div><small>${esc(i.slotLabel)} · ${esc(subtypeLabels[i.subtype]||i.subtype)} · ${esc(rarityLabels[normRarity(i.rarity)]||i.rarity)}</small><h4>${esc(i.name)}</h4><p>${esc(i.description||'장비 설명이 없습니다.')}</p><div class="character-slot-pill-row"><i>PVE +${num(i.pvePower)}</i><i>PVP +${num(i.pvpPower)}</i><i>총 ${num(i.totalPower)}</i></div></div></div><button type="button" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}">${row.equipped?'장착 중':'장착'}</button></article>`}).join(''):'<div class="character-empty-list-v1232">해당 부위의 보유 장비가 없습니다.</div>'}</div>
    </section>`;
  }
  function titlesHtml(){
    const titles=state.data?.titles||[];
    const owned=titles.filter(t=>t.owned);
    return `<section class="character-panel-v1232 title-panel-v1232">
      <div class="character-section-head-v1232"><div><small>CHARACTER TITLES</small><h3>칭호</h3><p>칭호별 스타일 프리셋이 적용되며, 장착하면 닉네임 위에 다른 CSS 효과로 표시됩니다.</p></div><b>${owned.length} / ${titles.length}</b></div>
      <div class="character-title-grid-v1232">${titles.length?titles.map(t=>`<article class="character-title-card-v1232 ${t.owned?'owned':'locked'} ${t.equipped?'equipped':''}"><div class="character-title-card-top">${titleRibbon(t)}${t.image?`<div class="character-title-badge-v1232"><img src="${esc(t.image)}" alt=""></div>`:`<div class="character-title-badge-v1232"><span>♛</span></div>`}</div><div class="character-title-copy"><small>${esc(unlockLabels[t.unlockType]||t.unlockType)} · ${esc(titleStyleLabels[normTitlePreset(t.stylePreset)]||'기본')}</small><h4>${esc(t.name)}</h4><p>${esc(t.description||titleCondition(t))}</p><div class="character-slot-pill-row"><i>PVE +${num(t.pvePower)}</i>${!t.owned?`<i>${esc(titleCondition(t))}</i>`:''}</div></div>${t.owned?`<button type="button" ${t.equipped?'data-character-title-unequip':'data-character-title-equip="'+t.id+'"'}>${t.equipped?'해제':'장착'}</button>`:'<button type="button" disabled>미획득</button>'}</article>`).join(''):'<div class="character-empty-list-v1232">등록된 칭호가 없습니다.</div>'}</div>
    </section>`;
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="character-loading-v1232"><span></span><b>장비와 칭호 정보를 불러오는 중...</b></div>';return}
    if(!state.data){root.innerHTML='<div class="character-empty-list-v1232">장비 정보를 불러오지 못했습니다.</div>';return}
    root.innerHTML=heroHtml()+showcaseHtml()+inventoryHtml()+titlesHtml();
    root.querySelectorAll('[data-character-filter]').forEach(button=>button.onclick=()=>{state.slot=button.dataset.characterFilter;render();document.querySelector('.character-inventory-grid-v1232')?.scrollIntoView({behavior:'smooth',block:'center'})});
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
    try{state.data=await request('character/loadout');render()}catch(error){const root=document.getElementById('characterSystemRoot');if(root)root.innerHTML=`<div class="character-empty-list-v1232"><b>장비 정보를 불러오지 못했습니다.</b><p>${esc(error.message)}</p><button type="button" id="characterRetry">다시 불러오기</button></div>`;document.getElementById('characterRetry')?.addEventListener('click',load)}finally{state.loading=false}
  }

  window.characterView=function(characterUser){return `${typeof summaryBar==='function'?summaryBar(characterUser):''}<section id="characterSystemRoot" class="character-system-root-v1232"><div class="character-loading-v1232"><span></span><b>장비와 칭호 정보를 불러오는 중...</b></div></section>`};
  window.bindCharacterView=load;
  window.refreshCharacterSystem=load;
  window.showEquipmentDropReward=async function(reward){
    if(!reward?.item)return;
    document.getElementById('equipmentDropToast')?.remove();
    const item=reward.item,toast=document.createElement('div');
    toast.id='equipmentDropToast';
    toast.className=`equipment-drop-toast-v1232 ${rarityClass(item.rarity)}`;
    toast.innerHTML=`<div class="equipment-drop-backdrop"></div><div class="equipment-drop-toast-card"><small>EQUIPMENT ACQUIRED</small><h3>장비 획득!</h3>${itemVisual(item,{large:true})}<strong>${esc(item.name)}</strong><p>${esc(item.slotLabel)} · ${esc(subtypeLabels[item.subtype]||item.subtype)} · ${esc(rarityLabels[normRarity(item.rarity)]||item.rarity)}</p><div class="character-slot-pill-row"><i>총 ${num(item.totalPower)}</i><i>PVE +${num(item.pvePower)}</i><i>PVP +${num(item.pvpPower)}</i></div><button type="button">확인</button></div>`;
    document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),220);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,3200)});
  };
})();
