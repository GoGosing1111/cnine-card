/* V1231 CHARACTER EQUIPMENT + TITLE UI */
(()=>{
  const state={data:null,loading:false,slot:'ALL'};
  const slotIcons={WEAPON:'⚔',TOP:'▰',BOTTOM:'▥',SHOES:'➤',ACCESSORY:'◎'};
  const subtypeLabels={MODERN_SWORD:'현대식 칼',AXE:'도끼',PISTOL:'권총',TOP:'상의',BOTTOM:'하의',SHOES:'신발',DUAL_DISK:'듀얼디스크'};
  const unlockLabels={MANUAL:'운영 지급',COLLECTION_COUNT:'카드 도감',GRADE_COUNT:'등급 도감',MEMBER_COMPLETE:'멤버 도감 완성',CARD_SET:'지정 카드 세트',CONTENT_CLEAR:'콘텐츠 클리어'};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0).toLocaleString();
  const user=()=>typeof loadUser==='function'?loadUser():null;
  const request=(path,options)=>apiRequest(path,options);

  function itemVisual(item,large=false){
    const image=item?.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`:`<span>${slotIcons[item?.slot]||'◇'}</span>`;
    return `<div class="character-item-visual${large?' large':''} rarity-${esc(item?.rarity||'NORMAL')}">${image}</div>`;
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
  function heroHtml(){
    const d=state.data,u=user(),title=d?.bonuses?.title;
    return `<section class="character-hero">
      <div class="character-identity"><small>SOOP CHARACTER LOADOUT</small><h2>${title?`<em>[${esc(title.name)}]</em> `:''}${esc(u?.nickname||'플레이어')}</h2><p>장비는 모든 덱에 공통 적용되며, 칭호는 PVE 전투력만 증가합니다.</p></div>
      <div class="character-bonus-board">
        <span><small>PVE 증가</small><b>+${num(d?.bonuses?.pve)}</b><em>장비 ${num(d?.bonuses?.equipmentPve)} · 칭호 ${num(d?.bonuses?.titlePve)}</em></span>
        <span><small>PVP 증가</small><b>+${num(d?.bonuses?.pvp)}</b><em>장비 효과 10%</em></span>
      </div>
    </section>`;
  }
  function loadoutHtml(){
    const slots=state.data?.slots||[];
    return `<section class="character-panel"><div class="character-section-head"><div><small>EQUIPMENT LOADOUT</small><h3>캐릭터 장비</h3><p>장비 총 전투력은 PVE 90%, PVP 10%로 자동 적용됩니다.</p></div><b>${slots.filter(slot=>equippedFor(slot.id)).length} / ${slots.length}</b></div>
      <div class="character-loadout-grid">${slots.map(slot=>{const row=equippedFor(slot.id),item=row?.item;return `<article class="character-slot ${row?'equipped':'empty'}" data-character-slot="${slot.id}">
        <header><span>${slotIcons[slot.id]||'◇'}</span><b>${esc(slot.label)}</b></header>
        ${row?`${itemVisual(item,true)}<h4>${esc(item.name)}</h4><small>${esc(subtypeLabels[item.subtype]||item.subtype||slot.label)} · ${esc(item.rarity)}</small><div class="character-power-pills"><i>PVE +${num(item.pvePower)}</i><i>PVP +${num(item.pvpPower)}</i></div><button type="button" data-character-unequip="${slot.id}">해제</button>`:`<div class="character-empty-slot"><span>+</span><p>장비 없음</p></div><button type="button" data-character-filter="${slot.id}">장비 선택</button>`}
      </article>`}).join('')}</div></section>`;
  }
  function inventoryHtml(){
    const instances=state.data?.instances||[],filter=state.slot;
    const list=instances.filter(row=>filter==='ALL'||row.item.slot===filter);
    return `<section class="character-panel"><div class="character-section-head"><div><small>EQUIPMENT INVENTORY</small><h3>보유 장비</h3><p>같은 장비도 각각 별도 아이템으로 보관됩니다.</p></div><b>${instances.length}개</b></div>
      <div class="character-filter-row"><button class="${filter==='ALL'?'active':''}" data-character-filter="ALL">전체</button>${(state.data?.slots||[]).map(slot=>`<button class="${filter===slot.id?'active':''}" data-character-filter="${slot.id}">${esc(slot.label)}</button>`).join('')}</div>
      <div class="character-inventory-grid">${list.length?list.map(row=>{const i=row.item;return `<article class="character-item-card ${row.equipped?'equipped':''}">${itemVisual(i)}<div><small>${esc(i.slotLabel)} · ${esc(subtypeLabels[i.subtype]||i.subtype)}</small><h4>${esc(i.name)}</h4><p>${esc(i.description||'장비 설명이 없습니다.')}</p><div class="character-power-pills"><i>PVE +${num(i.pvePower)}</i><i>PVP +${num(i.pvpPower)}</i></div></div><button type="button" ${row.equipped?'disabled':''} data-character-equip="${row.instanceId}">${row.equipped?'장착 중':'장착'}</button></article>`}).join(''):'<div class="character-empty-list">해당 부위의 보유 장비가 없습니다.</div>'}</div>
    </section>`;
  }
  function titlesHtml(){
    const titles=state.data?.titles||[],owned=titles.filter(t=>t.owned),locked=titles.filter(t=>!t.owned);
    return `<section class="character-panel title-panel"><div class="character-section-head"><div><small>CHARACTER TITLES</small><h3>칭호</h3><p>도감 또는 콘텐츠 조건을 달성해 해금하며 하나만 장착할 수 있습니다.</p></div><b>${owned.length} / ${titles.length}</b></div>
      <div class="character-title-grid">${titles.length?titles.map(t=>`<article class="character-title-card ${t.owned?'owned':'locked'} ${t.equipped?'equipped':''}"><div class="character-title-badge">${t.image?`<img src="${esc(t.image)}" alt="">`:`<span>♛</span>`}</div><div><small>${esc(unlockLabels[t.unlockType]||t.unlockType)}</small><h4>[${esc(t.badgeText||t.name)}]</h4><p>${esc(t.description||titleCondition(t))}</p><strong>PVE 전투력 +${num(t.pvePower)}</strong>${!t.owned?`<em>${titleCondition(t)}</em>`:''}</div>${t.owned?`<button type="button" ${t.equipped?'data-character-title-unequip':'data-character-title-equip="'+t.id+'"'}>${t.equipped?'해제':'장착'}</button>`:'<button type="button" disabled>미획득</button>'}</article>`).join(''):'<div class="character-empty-list">등록된 칭호가 없습니다.</div>'}</div>
    </section>`;
  }
  function render(){
    const root=document.getElementById('characterSystemRoot');if(!root)return;
    if(state.loading&&!state.data){root.innerHTML='<div class="character-loading"><span></span><b>장비와 칭호 정보를 불러오는 중...</b></div>';return}
    if(!state.data){root.innerHTML='<div class="character-empty-list">장비 정보를 불러오지 못했습니다.</div>';return}
    root.innerHTML=heroHtml()+loadoutHtml()+inventoryHtml()+titlesHtml();
    root.querySelectorAll('[data-character-filter]').forEach(button=>button.onclick=()=>{state.slot=button.dataset.characterFilter;render();document.querySelector('.character-inventory-grid')?.scrollIntoView({behavior:'smooth',block:'center'})});
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
    try{state.data=await request('character/loadout');render()}catch(error){const root=document.getElementById('characterSystemRoot');if(root)root.innerHTML=`<div class="character-empty-list"><b>장비 정보를 불러오지 못했습니다.</b><p>${esc(error.message)}</p><button type="button" id="characterRetry">다시 불러오기</button></div>`;document.getElementById('characterRetry')?.addEventListener('click',load)}finally{state.loading=false}
  }

  window.characterView=function(characterUser){return `${typeof summaryBar==='function'?summaryBar(characterUser):''}<section id="characterSystemRoot" class="character-system-root"><div class="character-loading"><span></span><b>장비와 칭호 정보를 불러오는 중...</b></div></section>`};
  window.bindCharacterView=load;
  window.refreshCharacterSystem=load;
  window.showEquipmentDropReward=async function(reward){
    if(!reward?.item)return;
    document.getElementById('equipmentDropToast')?.remove();
    const item=reward.item,toast=document.createElement('div');toast.id='equipmentDropToast';toast.className='equipment-drop-toast';toast.innerHTML=`<div class="equipment-drop-glow"></div><small>EQUIPMENT ACQUIRED</small>${itemVisual(item,true)}<h3>${esc(item.name)}</h3><p>${esc(item.slotLabel)} · ${esc(subtypeLabels[item.subtype]||item.subtype)}</p><div class="character-power-pills"><i>PVE +${num(item.pvePower)}</i><i>PVP +${num(item.pvpPower)}</i></div><button type="button">확인</button>`;
    document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));
    await new Promise(resolve=>{let done=false;const close=()=>{if(done)return;done=true;toast.classList.remove('show');setTimeout(()=>toast.remove(),220);resolve()};toast.querySelector('button').onclick=close;setTimeout(close,2600)});
  };
})();
