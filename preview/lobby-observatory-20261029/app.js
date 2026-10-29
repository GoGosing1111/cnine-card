(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    grid:'<path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/>',
    favorites:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    messages:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 6 9 7 9-7"/>',
    settings:'<path d="m10 3-.6 2.1-2.1 1.2L5 5.8 3 9l1.7 1.6v2.8L3 15l2 3.2 2.3-.5 2.1 1.2L10 21h4l.6-2.1 2.1-1.2 2.3.5 2-3.2-1.7-1.6v-2.8L21 9l-2-3.2-2.3.5-2.1-1.2L14 3Z"/><circle cx="12" cy="12" r="3"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    motion:'<path d="M8 6v12m8-12v12M4 3h16M4 21h16"/>',
    administration:'<path d="m3 9 9-6 9 6ZM3 21h18M5 11v7m5-7v7m4-7v7m5-7v7M3 18h18"/>',
    world:'<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15M5 8h4m-4 4h4m6-4h4m-4 4h4"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${window.SoopLobbyRouteIcons?.[name] || paths[name] || paths.grid}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML=icon(el.dataset.icon); });
  const categories = {all:'전체 메뉴',pve:'모험 · PVE',pvp:'대전 · PVP',cards:'카드·용병·펫',equipment:'장비·제작',shop:'상점·교환',rewards:'임무·보상',social:'클랜',administration:'행정부',favorites:'즐겨찾기'};
  const contract = window.SoopketmonV21NavigationContract;
  const categoryOf = (id,group) => group==='administration' ? 'administration' : ['clan','clanWar','clanFaction'].includes(id) ? 'social' : ['pve','pvp'].includes(group) ? group : ['store','market'].includes(group)||id==='mineral' ? 'shop' : group==='rewards' ? 'rewards' : ['equipment','crafting'].includes(group) ? 'equipment' : 'cards';
  const entries = new Map((contract?.menuGroupOrder || []).flatMap(group => contract.groups[group].routes.map(id => [id,{id,title:contract.routes[id].title,category:categoryOf(id,group)}])));
  for (const item of [{id:'world',title:'세계관',category:'social'},{id:'equipmentForge',title:'장비 강화',category:'equipment'},{id:'mercenaryEquipment',title:'용병 장비',category:'equipment'},{id:'blackwing',title:'흑익의 맹약',category:'pve'},{id:'seasonPass',title:'시즌패스',category:'rewards'}]) entries.set(item.id,item);
  const favorites = new Set(['mercenaryDex','equipmentForge','hunt']);
  const hrefs = {world:'/world/',equipmentForge:'/equipment-forge/',mercenaryDex:'/mercenary-codex/',mercenaryEquipment:'/mercenary-codex/equipment/',petDex:'/pet-codex/',defense:'/defense/',lootShop:'/loot-shop/',blackwing:'PVE → 레이드 → 흑익의 맹약'};
  const descriptions = {deck:'보유 카드와 용병으로 출전 덱을 편성하는 화면입니다. 기존 PVE·PVP 편성 체계를 연결합니다.',mercenaryDex:'보유 용병, 상세 능력치, 성장과 편성을 확인하는 용병도감으로 연결합니다.',equipmentForge:'장비 강화와 필요한 재료, 강화 기록을 확인하는 화면으로 연결합니다.',dailyquest:'일일·주간 임무의 달성도와 받을 수 있는 보상을 확인합니다.',messages:'도착한 메시지와 미수령 보상을 확인하는 기존 메시지함을 연결합니다.',world:'리버스랜드의 이야기와 용병들의 기록으로 이어집니다.',blackwing:'6인 협동 레이드 「흑익의 맹약」 소개 자리입니다. 현재 운영 TEST 접근 조건과 보상 잠금은 그대로 적용하는 구성입니다.',auction:'현재 입찰가와 종료 시각을 기존 실시간 현황 데이터로 연결하는 자리입니다. 시안에는 경매 입찰 기능이 없습니다.',hunt:'몬스터와 내 편성을 확인하고 토벌에 출전하는 기존 전투 화면으로 연결합니다.'};
  let activeCategory = 'all', avatarIndex=0, toastTimer;
  const avatars = [{name:'푸른 서리의 지휘관',alt:'푸른 제복의 로비 아바타',file:'avatar-f01-azure-frost-strategist-equipment-v1-640.webp'},{name:'붉은 공성의 지휘관',alt:'붉은 제복의 로비 아바타',file:'avatar-f02-crimson-siege-marshal-equipment-v1-640.webp'}];
  // These are presentation labels for the study, not new catalogue names.
  const avatarUrl = file => '/assets/ui/avatars-v1/equipment-v3/'+file;
  const toast = message => {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);};
  function renderMenu(){
    const query=$('menu-search').value.trim().toLocaleLowerCase();
    const list=[...entries.values()].filter(e => (activeCategory==='all'||activeCategory==='favorites'&&favorites.has(e.id)||e.category===activeCategory)&&(e.title.toLocaleLowerCase().includes(query)||e.id.toLocaleLowerCase().includes(query)));
    $('directory-title').textContent=categories[activeCategory];
    $('result-count').textContent=String(list.length).padStart(2,'0');
    $('menu-results').innerHTML=list.map(e=>`<button class="menu-entry" data-route="${esc(e.id)}">${icon(e.id)}<b>${esc(e.title)}</b><i>↗</i></button>`).join('');
    $('empty').hidden=list.length>0;
    $('directory-tabs').innerHTML=Object.entries(categories).map(([id,title])=>`<button data-filter="${id}" aria-pressed="${id===activeCategory}">${title}</button>`).join('');
  }
  function openMenu(category){activeCategory=categories[category]?category:'all';$('menu-search').value='';renderMenu();if(!$('directory').open)$('directory').showModal();}
  function showDetail(title,content){$('detail-title').textContent=title;$('detail-content').innerHTML=content;if(!$('detail').open)$('detail').showModal();}
  function openDestination(id){
    const entry=entries.get(id)||{id,title:id,category:'all'};
    showDetail(entry.title,`<p class="detail-copy">${esc(descriptions[id]||'기존 '+entry.title+' 화면으로 이어지는 메뉴입니다. 이번 시안에서는 메뉴 배치와 이동 구성을 확인할 수 있습니다.')}</p><p class="destination-path">${esc(hrefs[id]||'기존 게임 메뉴 · '+entry.title)}</p><div class="setting-row"><span>즐겨찾기</span><button id="favorite-toggle" data-favorite="${esc(id)}" aria-pressed="${favorites.has(id)}">${favorites.has(id)?'추가됨 ★':'추가 ☆'}</button></div>`);
  }
  function setMode(mode){const pve=mode==='pve';document.querySelectorAll('[data-mode]').forEach(b=>{const selected=b.dataset.mode===mode;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});$('departure').setAttribute('aria-labelledby','mode-'+mode);$('depart-button').dataset.category=mode;$('depart-title').textContent=pve?'모험 출전':'대전 출전';$('depart-description').textContent=pve?'토벌 · 레이드 · 원정':'랭크전 · 듀오 · 영토전';$('depart-kicker').textContent=pve?'EXPEDITION / 01':'ARENA / 02';document.querySelector('.depart-watermark').textContent=pve?'01':'02';}
  function setMotion(enabled){$('lobby').classList.toggle('still',!enabled);$('motion-toggle').setAttribute('aria-pressed',String(enabled));$('motion-toggle').setAttribute('aria-label',enabled?'배경 움직임 끄기':'배경 움직임 켜기');const control=$('settings-motion');if(control){control.setAttribute('aria-pressed',String(enabled));control.textContent=enabled?'켜짐':'꺼짐';}}
  function immersive(enabled){$('lobby').classList.toggle('immersive',enabled);$('restore-ui').hidden=!enabled;$('hide-ui').setAttribute('aria-pressed',String(enabled));if(enabled){window.scrollTo(0,0);$('restore-ui').focus();}else $('hide-ui').focus();}
  function openAvatars(){showDetail('로비 아바타',`<p class="detail-copy">기존 아바타 원화를 같은 공간에 배치한 예시입니다. 아래 선택은 이 시안 화면에만 적용됩니다.</p><div class="avatar-options">${avatars.map((a,i)=>`<button class="avatar-option" data-avatar="${i}" aria-pressed="${i===avatarIndex}"><img src="${avatarUrl(a.file)}" alt="${a.alt}"><span>${a.name}</span></button>`).join('')}</div>`);}
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-close'))return b.closest('dialog').close();
    if(b.hasAttribute('data-home')){document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.scrollTo({top:0,behavior:'smooth'});return;}
    if(b.dataset.category)return openMenu(b.dataset.category);
    if(b.dataset.filter){activeCategory=b.dataset.filter;$('menu-search').value='';renderMenu();return;}
    if(b.dataset.mode)return setMode(b.dataset.mode);
    if(b.dataset.route)return openDestination(b.dataset.route);
    if(b.dataset.favorite){const id=b.dataset.favorite;if(favorites.has(id))favorites.delete(id);else favorites.add(id);b.setAttribute('aria-pressed',String(favorites.has(id)));b.textContent=favorites.has(id)?'추가됨 ★':'추가 ☆';renderMenu();return;}
    if(b.dataset.avatar){avatarIndex=Number(b.dataset.avatar);const a=avatars[avatarIndex];$('hero').src=avatarUrl(a.file);$('hero').alt=a.alt;$('hero-name').textContent=a.name;$('detail').close();toast('로비 시안의 아바타를 변경했습니다.');return;}
    if(b.dataset.info==='account')return showDetail('리버스콜 지휘관',`<p class="detail-copy">Lv.120 · 준위<br>상단에서 계급과 닉네임을 함께 확인하는 구성입니다. 현재는 화면 검토를 위한 예시 계정입니다.</p>`);
    if(b.dataset.info==='wallet')return showDetail('보유 재화',`<p class="detail-copy">상단에는 코인, 마스터의 별, 피그 코인을 간결하게 표시합니다. 현재 숫자는 시안용 예시이며 실제 계정 잔액이 아닙니다.</p>`);
    if(b.dataset.info==='settings')return showDetail('로비 설정',`<div class="setting-row"><span>장면의 미세한 움직임</span><button id="settings-motion" aria-pressed="${!$('lobby').classList.contains('still')}">${$('lobby').classList.contains('still')?'꺼짐':'켜짐'}</button></div><p class="detail-copy">기기의 움직임 줄이기 설정을 우선 적용합니다. 로비의 눈 아이콘으로 배경 감상 모드에 들어갈 수 있습니다.</p>`);
    if(b.id==='change-avatar')return openAvatars();
    if(b.id==='motion-toggle'||b.id==='settings-motion')return setMotion($('lobby').classList.contains('still'));
    if(b.id==='hide-ui')return immersive(true);
    if(b.id==='restore-ui')return immersive(false);
  });
  $('menu-search').addEventListener('input',renderMenu);
  document.querySelector('.mode-tabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const current=document.querySelector('[data-mode][aria-selected=true]').dataset.mode;const next=event.key==='Home'?'pve':event.key==='End'?'pvp':current==='pve'?'pvp':'pve';setMode(next);$('mode-'+next).focus();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const top=[...document.querySelectorAll('dialog[open]')].at(-1);if(top){event.preventDefault();top.close();return;}if($('lobby').classList.contains('immersive')){event.preventDefault();immersive(false);return;}}if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('detail').open){event.preventDefault();openMenu('all');$('menu-search').focus();}});
  for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');setMotion(!reduced.matches);reduced.addEventListener('change',e=>setMotion(!e.matches));
  // Read-only review contract. No API calls, account writes, navigation or gameplay.
  window.LobbyObservatoryPreview=Object.freeze({version:1,routeCount:entries.size,routeIds:Object.freeze([...entries.keys()])});
})();
