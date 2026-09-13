(function(global){
  'use strict';
  function mount(document,options={}){
  const lifecycle=new AbortController(),listen=(target,event,handler,settings={})=>target.addEventListener(event,handler,{...settings,signal:lifecycle.signal});
  const scroller=options.scroller||window,scrollPosition=()=>scroller===window?scrollY:scroller.scrollTop;
  const jumpTo=(node,offset=18)=>{const box=node.getBoundingClientRect();scroller.scrollTo({top:Math.max(0,scrollPosition()+box.top-offset),behavior:'instant'});};
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths={home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',swords:'<path d="m4 3 7 7-3 3-7-7ZM20 3l-7 7 3 3 7-7ZM6 11l-4 4m9 2-4 4m-4-1 6-6M18 11l4 4m-9 2 4 4m4-1-6-6"/>',cards:'<rect x="7" y="3" width="14" height="18" rx="2"/><path d="M4 6H3v15h2M11 8h6m-6 4h6m-6 4h3"/>',bag:'<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 8V6a4 4 0 0 1 8 0v2M4 13h16M10 13v3h4v-3"/>',gift:'<path d="M3 9h18v12H3zM2 5h20v4H2zM12 5v16M12 5C5 5 6 0 9 1c2 0 3 4 3 4Zm0 0c7 0 6-5 3-4-2 0-3 4-3 4Z"/>',clan:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="M12 7v10M8 12h8"/>',forge:'<path d="M3 6h18l-4 5H6ZM8 11v4l-4 6h16l-4-6v-4M11 3h7"/>'};
  paths.administration='<path d="m3 9 9-6 9 6ZM3 21h18M5 11v7m5-7v7m4-7v7m5-7v7M3 18h18"/>';
  const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${global.SoopLobbyRouteIcons?.[name]||paths[name]||paths.cards}</svg>`;
  function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}paintIcons();
  const contract=globalThis.SoopketmonV21NavigationContract;
  const categories={combat:{title:'전투',icon:'swords'},growth:{title:'성장·수집',icon:'cards'},shop:{title:'상점·교환',icon:'bag'},rewards:{title:'보상',icon:'gift'},social:{title:'클랜·생활',icon:'clan'},administration:{title:'행정부',icon:'administration'}};
  const descriptions={buy:'카드팩·장비·이동수단을 획득하는 상점',inventory:'보유 아이템과 카드팩 확인',dex:'카드 수집 현황과 보유 카드의 능력치 확인',mercenaryDex:'용병 원화·등급·배정 스킬 살펴보기',upgrade:'일반 카드 여러 장을 한 번에 강화',evolution:'재료를 모아 카드의 다음 단계에 도전',magic:'전투를 돕는 마법카드 확인과 편성',battle:'PVE 전투 콘텐츠와 덱 편성 모아 보기',deck:'보유 일반 카드 5장을 선택하고 출전 덱 저장',hunt:'몬스터를 고르고 내 덱으로 토벌',raid:'다른 플레이어와 월드 레이드 참여',escort:'호송작전에 참여하고 보상 확인',siege:'전황 지도에서 몬스터 군단과 진영전',seal:'봉인전 입장과 진행 상황 확인',idle:'방치형 원정의 진행과 회수 보상 확인',tower:'한 층씩 도전하는 무한의탑',scrapyard:'원정 구역과 출입증을 확인하고 출발',pvp:'상대 플레이어와 랭크전 대결',rank:'시즌 순위와 랭크 기록 확인',clan:'클랜 가입·활동·단체 전투',territory:'진영과 함께 영토를 두고 경쟁',character:'장비·칭호·차량을 장착하고 전투력 확인',avatar:'캐릭터 외형과 보유 아바타 확인',vehicle:'재료를 사용해 차량 제작',fusion:'보유 장비를 재료로 합성',alchemy:'연금술 재료와 제작 항목 확인',attendance:'접속 보상과 수령 상태 확인',dailyquest:'오늘 할 수 있는 퀘스트와 보상 확인',messages:'운영 소식과 도착한 보상 확인',mineral:'보유 재료와 교환 항목 확인',wishLamp:'진행 중인 소원램프 이벤트 확인',prediction:'경기 일정을 보고 결과 예측',auction:'다른 플레이어와 아이템 거래',soopketland:'숲켓랜드 입장권과 이용 정보 확인',treasury:'족장 세금징수와 행정부 활동',prison:'감옥 수감 상태와 관련 정보 확인',prisoncamp:'포로수용소와 클랜 수용 현황 확인',equipmentForge:'장비 강화·보호·파괴 기록 복구 확인',mercenaryHangar:'보유 용병을 전용 슬롯에 1명 편성'};
  const tips={attendance:'먼저 수령할 수 있는 보상이 있는지 확인하세요. 도착한 보상은 메시지함에서도 확인할 수 있어요.',dex:'카드가 없다면 상점이나 보유 카드팩부터 확인하세요. 이미 있는 카드로 먼저 덱을 만들 수 있어요.',deck:'일반 덱은 정확히 5장입니다. 용병은 별도 1명이며, 없어도 일반 카드 5장으로 출전할 수 있어요.',hunt:'저장한 덱과 상대 정보를 확인한 뒤 도전하세요. 입장 조건과 보상은 해당 전투 화면에서 확인할 수 있어요.',equipmentForge:'강화 가능 여부와 필요한 재료는 운영 화면에서 확인하세요. 시안에서 강화를 실행하지 않습니다.',mercenaryDex:'용병도감은 정보를 보는 곳입니다. 보유 용병의 실제 편성은 ‘용병 지휘소’에서 할 수 있어요.',mercenaryHangar:'용병은 일반 카드 슬롯에 넣지 않습니다. PVE와 PVP가 용병 전용 슬롯 하나를 함께 사용합니다.'};
  function categoryOf(id,group){if(group==='administration')return 'administration';if(['clan','territory'].includes(id))return 'social';if(group==='pve'||group==='pvp')return 'combat';if(['store','market'].includes(group)||id==='mineral')return 'shop';if(group==='rewards')return 'rewards';return 'growth';}
  const entries=contract?contract.menuGroupOrder.flatMap(group=>contract.groups[group].routes.map(id=>({id,title:contract.routes[id].title,category:categoryOf(id,group),description:descriptions[id]||contract.routes[id].title}))):[];
  for(const item of [{id:'equipmentForge',title:'장비 강화',category:'growth'},{id:'mercenaryHangar',title:'용병 지휘소',category:'growth'}])entries.push({...item,description:descriptions[item.id]});
  const byId=new Map(entries.map(e=>[e.id,e]));
  const hrefs={mercenaryDex:'/mercenary-codex/',equipmentForge:'/equipment-forge/',mercenaryHangar:'/mercenary-hangar/'};
  const keywords={attendance:'출석 출첵 출석체크',inventory:'인벤 가방 아이템 사용 개봉',buy:'뽑기 하이퍼팩 구매',dex:'보유카드 내카드 도감',deck:'팀 파티 덱 편성 저장',equipmentForge:'무기 방어구 강화 복구 보호권',mercenaryHangar:'용병 선택 편성',messages:'우편 선물 소식',dailyquest:'일퀘 임무 미션',vehicle:'자동차 이동수단 제작',character:'착용 무기 방어구 장착'};
  let category='combat',activeRoute='home',query='',destinationOpener,lastResults='',guideOpener,menuOpener,fromAll=false;
  const routeCategory=id=>byId.get(id)?.category||categoryOf(id,contract?.routes[id]?.group);
  function highlight(value){document.querySelectorAll('.side-link,.all-menu,.mobile-dock button').forEach(b=>{const selected=value==='home'?b.hasAttribute('data-home'):b.dataset.category===value;b.toggleAttribute('aria-current',selected);if(selected)b.setAttribute('aria-current','page');});}
  function setRoute(id){activeRoute=id||'home';if(!$('menu-dialog').open)highlight(activeRoute==='home'?'home':routeCategory(activeRoute));}
  const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  function renderDirectory(){
    const tokens=query.trim().split(/\s+/).filter(Boolean).map(normalize);
    const available=entries.filter(e=>options.isRouteVisible?.(e.id)!==false);
    const shown=available.filter(e=>(category==='all'||category===e.category)&&tokens.every(t=>normalize([e.title,e.description,e.id,keywords[e.id]||''].join(' ')).includes(t)));
    const selected=categories[category]||{title:'전체 메뉴',icon:'search'};
    $('directory-title').textContent=selected.title;
    $('directory-icon').innerHTML=icon(selected.icon);
    $('menu-dialog').dataset.menuCategory=category;
    $('menu-search').placeholder=selected.title+'에서 찾기';
    $('menu-search').setAttribute('aria-label',selected.title+' 검색');
    $('menu-all').hidden=category==='all'||!fromAll;
    document.querySelector('slot[name="streamer-lounge"]').hidden=!['social','all'].includes(category)||!!query;
    $('result-count').textContent=`${shown.length}개 메뉴`;
    $('clear-search').hidden=!query;
    $('empty-search').hidden=shown.length>0;
    const resultKey=category+':'+shown.map(e=>e.id).join('|');
    if(resultKey!==lastResults||!$('menu-results').childElementCount){
      const row=e=>`<button class="menu-result" data-route="${esc(e.id)}" data-menu-category="${e.category}"><span class="menu-route-icon" data-icon="${esc(e.id)}"></span><span><b>${esc(e.title)}</b><small>${esc(e.description)}</small></span><i aria-hidden="true">↗</i></button>`;
      $('menu-results').innerHTML=category==='all'?Object.entries(categories).map(([key,group])=>{const items=shown.filter(e=>e.category===key);return items.length?`<h3 class="category-divider"><button class="category-jump" data-category="${key}">${group.title}<span>분류 보기 →</span></button></h3>`+items.map(row).join(''):'';}).join(''):shown.map(row).join('');
      paintIcons($('menu-results'));lastResults=resultKey;
    }
    if(!contract){$('result-count').textContent='메뉴 정보를 불러오지 못했습니다. 새로고침해 주세요.';}
  }
  function selectCategory(value){if(value!=='all'&&!categories[value])return;if(!$('menu-dialog').open)fromAll=value==='all';category=value;query='';$('menu-search').value='';renderDirectory();highlight(value);$('menu-dialog').scrollTop=0;openMenu();}
  function openDestination(id,opener){const item=byId.get(id);if(!item)return;if(options.navigate){if($('menu-dialog').open)$('menu-dialog').close();if($('guide-dialog').open)$('guide-dialog').close();void Promise.resolve().then(()=>options.navigate(id,hrefs[id])).catch(error=>{$('lobby-message').textContent=error.message||'화면을 열지 못했습니다. 다시 시도해 주세요.';$('lobby-message').hidden=false;jumpTo($('lobby-message'));});return;}destinationOpener=opener;$('destination-title').textContent=item.title;$('destination-description').textContent=item.description;$('destination-tip').textContent=tips[id]||'처음부터 모든 콘텐츠를 이용할 필요는 없어요. 필요한 순간에 이 메뉴를 찾아오세요.';$('destination-location').textContent=`로비 → ${categories[item.category].title} → ${item.title}`;$('destination-link').href=hrefs[id]||'/?screen='+encodeURIComponent(id);$('destination-dialog').showModal();}
  function closeDestination(){$('destination-dialog').close();destinationOpener?.focus({preventScroll:true});}
  listen(document,'click',event=>{
    const b=event.target.closest('button,a.brand');if(!b)return;
    if(b.hasAttribute('data-home')||b.matches('a.brand')){
      event.preventDefault();if($('menu-dialog').open)closeMenu();
      if(options.navigate)void options.navigate('home');else setRoute('home');
      scroller.scrollTo({top:0,behavior:'instant'});return;
    }
    if(b.dataset.route)return openDestination(b.dataset.route,b);
    if(b.dataset.category)return selectCategory(b.dataset.category);
    if(b.hasAttribute('data-close-destination'))return closeDestination();
    if(b.hasAttribute('data-start-guide'))return openGuide(b);
  });
  listen($('destination-dialog'),'cancel',event=>{event.preventDefault();closeDestination();});
  listen($('menu-search'),'input',()=>{query=$('menu-search').value;renderDirectory();});
  function clearSearch(){query='';$('menu-search').value='';renderDirectory();$('menu-search').focus({preventScroll:true});}
  $('clear-search').onclick=clearSearch;$('reset-search').onclick=clearSearch;
  listen(document,'keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.matches('input,textarea,[contenteditable=true]')&&!document.querySelector('dialog[open]')){event.preventDefault();selectCategory(category);$('menu-search').focus();}});
  $('chief-shortcut').onclick=()=>options.openChief?options.openChief():selectCategory('administration');
  $('account-shortcut').onclick=()=>options.openAccount?.();

  // The main lobby stays quiet. Its menus and the original proposal each
  // open only in their own explicit dialog.
  function openMenu(){if($('menu-dialog').open)return;menuOpener=document.activeElement;$('menu-dialog').showModal();$('close-menu').focus({preventScroll:true});}
  function closeMenu(){$('menu-dialog').close();fromAll=false;setRoute(activeRoute);menuOpener?.focus({preventScroll:true});}
  $('close-menu').onclick=closeMenu;listen($('menu-dialog'),'cancel',event=>{event.preventDefault();closeMenu();});
  function openGuide(opener){guideOpener=opener;const frame=$('guide-frame');if(!frame.getAttribute('src')){const url=new URL(frame.dataset.src,location.origin);url.searchParams.set('account',String(options.accountId||'preview'));frame.src=url.href;}$('guide-dialog').showModal();$('close-guide').focus({preventScroll:true});}
  function closeGuide(){$('guide-dialog').close();guideOpener?.focus({preventScroll:true});}
  $('start-tutorial').onclick=event=>openGuide(event.currentTarget);$('close-guide').onclick=closeGuide;
  listen($('guide-dialog'),'cancel',event=>{event.preventDefault();closeGuide();});
  listen(window,'message',event=>{if(event.origin!==location.origin||event.source!==$('guide-frame').contentWindow)return;if(event.data?.type==='cnine:lobby-guide:close')closeGuide();if(event.data?.type==='cnine:lobby-guide:navigate'&&byId.has(event.data.route))openDestination(event.data.route,$('start-tutorial'));});
  $('fullscreen-button').onclick=()=>{const d=global.document;void Promise.resolve(d.fullscreenElement?d.exitFullscreen():d.documentElement.requestFullscreen()).catch(()=>{});};
  renderDirectory();
  return {refreshMenus:renderDirectory,setRoute,openMenu:selectCategory,openRoutes(routes){const groups=[...new Set(routes.map(routeCategory))];selectCategory(groups.length===1?groups[0]:'all');},destroy(){lifecycle.abort();document.querySelectorAll('dialog[open]').forEach(el=>el.close());}};
  }
  global.SoopLobbyInteractions=Object.freeze({mount});
  if(global.document.getElementById('menu-results'))mount(global.document);
})(window);
