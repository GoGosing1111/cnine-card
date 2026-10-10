(function(){
  'use strict';
  if(window.JokgakCity)return;
  const VERSION='20261011-comms1',ART='/assets/ui/jokgak-city/',PREVIEW=location.pathname.startsWith('/preview/jokgak-city-v1/');
  const config=Promise.all([import('/shared/jokgak-city-v1.mjs?v='+VERSION),import('/shared/jokgak-city-settings-v1.mjs?v='+VERSION),import('/js/jokgak-city-life-ui-v1.mjs?v='+VERSION),import('/js/jokgak-city-expansion-ui-v1.mjs?v='+VERSION),import('/js/jokgak-city-career-ui-v1.mjs?v='+VERSION),import('/js/jokgak-city-notice-layer-v1.mjs?v='+VERSION),import('/js/jokgak-city-comms-ui-v1.mjs?v='+VERSION)]).then(([city,settings,life,expansion,career,notices,comms])=>({...city,...settings,...life,...expansion,...career,...notices,...comms}));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths={bed:'M2 4v18m20-11v11M2 17h20M5 11h5V7H5Zm7 0h10v6H2',cash:'M2 5h20v14H2ZM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM5 9v6m14-6v6',meal:'M3 2v6m3-6v6m3-6v6M3 6h6v4H3Zm3 4v12M18 2v20m0-20c-5 2-5 9 0 9',bottle:'M9 2h6v5l3 4v11H6V11l3-4ZM9 2v5h6M6 14h12',shield:'M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6ZM8 11l3 3 5-6',cross:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',medical:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6ZM5 3v2M19 19v2',person:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',bag:'M8 3h8l-2 4 6 7v6H4v-6l6-7ZM9 7h6M10 14h4',swords:'m4 2 8 8-3 3-7-7Zm16 0-8 8 3 3 7-7ZM5 11l-4 4m8 2-4 5m14-11 4 4m-8 2 4 5',bolt:'m13 2-9 12h7l-1 8 10-13h-7Z',store:'M3 9h18v12H3ZM2 9l3-6h14l3 6M8 21v-7h8v7M8 3 6 9m10-6 2 6',mail:'M2 5h20v15H2Zm0 0 10 8L22 5',market:'M3 10v11h18V10M2 10l3-7h14l3 7ZM8 3v7m8-7v7M8 21v-6h8v6',home:'m2 11 10-9 10 9M5 9v13h14V9M9 22v-8h6v8',warehouse:'M2 8 12 2l10 6v14H2ZM6 22V11h12v11M6 15h12M6 19h12',arrow:'M3 12h18m-7-7 7 7-7 7',target:'M12 3v4m0 10v4M3 12h4m10 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',clock:'M12 6v6l4 3M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',close:'m5 5 14 14M19 5 5 19',refresh:'M3 10a9 9 0 1 1 2 9M3 3v7h7',map:'m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3ZM8 2v17m8-14v17'};
  const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.person}"/></svg>`;
  const money=n=>Number(n||0).toLocaleString('ko-KR');
  const user=()=>{try{return typeof loadUser==='function'?loadUser():JSON.parse(localStorage.getItem('cnine_card_user_v10')||'null');}catch{return null;}};
  const storage={get:key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}},set:(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
  async function api(path,body){
    if(PREVIEW&&window.CityPreview)return window.CityPreview.request(path,body);
    const token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
    const response=await fetch('/api/jokgak-city/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(body?45000:12000)});
    const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'요청을 처리하지 못했습니다.'),{status:response.status,code:value.code});return value;
  }
  function css(){const current=document.getElementById('jokgakStyle');if(current?.sheet)return Promise.resolve();const link=current||document.createElement('link');const ready=new Promise(resolve=>{link.addEventListener('load',resolve,{once:true});link.addEventListener('error',resolve,{once:true});});if(!current){link.id='jokgakStyle';link.rel='stylesheet';link.href='/css/jokgak-city-v1.css?v='+VERSION;document.head.append(link);}return ready;}
  const stylesReady=css();
  let C,root,state=null,selected='MARKET',selectedUser=null,cursor=0,pages=[0],busy=false,poll,clock,offset=0,seq=0,zoom=1,dialog=null,battleModal=null,lifecycle=null,fetchingKey=null,desk=null,deskTab='profile',organization=null,orgBusy=false;
  const pendingKey=()=>`jokgak:pending:${user()?.serverUserId||user()?.id||'preview'}`;
  let activity=null,logBusy=false,logSeq=0,prefSaving=false,broadcastDraft='',broadcastQueue=[],broadcastCurrent=null,broadcastEpoch=null,broadcastSeen=new Set();
  const time=()=>Date.now()+offset;
  const role=code=>({...C.cityRole(code),...C.defaultCitySettings().roles.find(r=>r.code===code),...state?.roles?.find(r=>r.code===code)}),place=id=>C.cityPlace(id);
  const clockText=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');};
  const view=()=>'<section id="jokgakCity" class="jc" aria-label="족각도시"><div class="jc-loading" role="status">도시 전황을 불러오고 있습니다…</div></section>';
  function message(text,error=false){const node=root?.querySelector('[data-city-message]');if(node){node.textContent=text;node.hidden=!text;node.classList.toggle('is-error',error);}}
  function roleBadge(code,small=false){const r=role(code);return `<span class="jc-role${small?' small':''}" style="--role:${r.color}">${icon(r.icon)}<b>${r.name}</b></span>`;}
  function hp(value,max=100){return `<span class="jc-hp"><i style="width:${Math.max(0,Math.min(100,Number(value)/max*100))}%"></i></span>`;}
  function targetDisabled(target){const m=state?.mine;if(!m?.active)return '입장 후 가능';if(m.restUntil>time()||target.restUntil>time())return '모텔 휴식 중';if(m.deadUntil>time())return '사망 대기';if(target.deadUntil>time())return '상대 사망 대기';if(m.hospitalRequired)return '병원 진료 필요';if(target.hospitalRequired)return '상대 진료 중';if(m.location!==selected)return '이동 후 가능';if(m.jailedUntil>time())return '구금 중';if(target.jailedUntil>time())return '상대 구금 중';if(m.nextActionAt>time())return '행동 대기';return '';}
  function render(){
    if(!root?.isConnected||!C)return;
    const scroll=root.querySelector('.jc-map-scroll'),listScroll=root.querySelector('.jc-people')?.scrollTop||0,mapScroll={left:scroll?.scrollLeft||0,top:scroll?.scrollTop||0};
    const mine=state?.mine,r=role(mine?.role),area=place(selected),people=state?.people||[],chosen=people.find(p=>p.userId===selectedUser);
    const active=mine?.active,here=active&&mine.location===selected;
    root.innerHTML=`<header class="jc-heading"><div class="jc-title"><span class="jc-index">PVP <i>07</i></span><div><p>도시의 판도가 바뀌는 시간</p><h1>족각도시<span>JOKGAK CITY</span></h1></div></div><div class="jc-shift">${icon('clock')}<div><small>다음 역할 교대 <span>KST</span></small><b data-city-shift>--:--:--</b></div><em>00 · 06 · 12 · 18시</em></div><button class="jc-icon-btn" data-city-rules aria-label="도시 규칙 보기">?</button></header>
      ${state?.mode==='TEST'?'<div class="jc-preview jc-test-mode"><b>TEST 운영</b> · 지정 참여자 검수 중 · 현금·소지품은 테스트용으로만 사용됩니다.</div>':''}${PREVIEW?'<div class="jc-preview">조작 시연 · 표시된 인원은 예시이며 실제 계정에 반영되지 않습니다.</div>':''}
      <div class="jc-status"><span class="jc-online"><i></i>${active?'도시 체류 중':'도시 입장 대기'}</span><span>${active?`${esc(mine.nickname)} <b>· ${esc(place(mine.location)?.name)}</b>`:'입장하면 다른 콘텐츠를 이용하는 동안에도 교전 대상이 됩니다.'}</span><div><button data-city-refresh>${icon('refresh')}새로고침</button><button data-city-rules>진행 방법</button>${active?'<button data-city-action="leave">도시 퇴장</button>':''}</div></div>
      ${C.cityDashboard(state,time(),icon,busy)}${C.cityCommsToolbar(state,prefSaving)}
      <div class="jc-workspace"><section class="jc-map-panel" aria-label="도시 지도"><div class="jc-map-top"><span>${icon('map')}도시 전역 <b>${C.CITY_PLACES.length}개 장소</b></span><span class="jc-map-hint">건물을 선택해 체류자를 확인하세요</span><div><button data-city-zoom="-" aria-label="지도 축소">−</button><b>${Math.round(zoom*100)}%</b><button data-city-zoom="+" aria-label="지도 확대">+</button></div></div>
        <div class="jc-map-stage"><div class="jc-map-broadcast" role="status" aria-live="polite">${C.cityBroadcastMarkup(broadcastCurrent,time())}</div>${C.cityDeathScreen(mine,time())}<div class="jc-map-scroll" ${mine?.deadUntil>time()?'hidden':''}><div class="jc-map" style="width:${zoom*100}%"><img class="jc-map-art" src="${ART}city-map-night-v1.webp" alt="경찰서와 병원, 백화점, 우체국, 시장, 주택, 항구와 뒷골목, 상점, 식당과 모텔로 이루어진 해안 도시" draggable="false"><svg class="jc-zones" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${C.CITY_PLACES.map(p=>`<polygon class="${p.id===selected?'selected':''} ${p.id===mine?.location&&active?'current':''}" points="${p.shape}" data-city-place="${p.id}"/>`).join('')}</svg>
        ${C.CITY_PLACES.map((p,i)=>`<button class="jc-pin ${p.id===selected?'selected':''} ${active&&p.id===mine.location?'current':''}" data-city-place="${p.id}" style="left:${p.labelX}%;top:${p.labelY}%" aria-pressed="${p.id===selected}">${active&&p.id===mine.location?'<small>현재 위치</small>':''}<span class="jc-pin-icon">${icon(p.icon)}</span><b>${p.name}</b><em>${String(i+1).padStart(2,'0')}</em></button>`).join('')}
        <span class="jc-compass"><b>N</b><i>⌖</i></span><div class="jc-map-coordinate">37° 33′ N <span>도시 관제망</span></div></div></div>
        <div class="jc-beg-offers" aria-label="이곳의 구걸·동냥">${C.cityBeggingOffers(state,time(),busy,icon)}</div></div><p class="jc-mobile-map-hint">← 지도를 좌우로 밀어 다른 장소를 확인하세요 →</p><div class="jc-map-footer"><span><i></i>선택한 장소 <b>${area.name}</b></span><span><i class="current"></i>내 위치 <b>${active?place(mine.location).name:'미입장'}</b></span><p>경찰의 검문 · 시민 간 교전 · 의료진의 치료</p></div>

      </section>
      <aside class="jc-intel" aria-label="선택한 장소와 체류자"><div class="jc-location-cover" style="--crop-x:${area.x}%;--crop-y:${area.y}%"><span>${area.district}</span><div>${icon(area.icon)}<h2>${area.name}</h2><b>${C.CITY_PLACES.indexOf(area)+1<10?'0':''}${C.CITY_PLACES.indexOf(area)+1}</b></div></div><div class="jc-location-body"><p>${area.detail}</p><button class="${here?'jc-here':'jc-primary'}" data-city-action="move" ${!active||here||busy||mine?.deadUntil>time()||mine?.restUntil>time()||mine?.hospitalRequired?'disabled':''}>${here?'현재 머무르는 장소':'이곳으로 이동'}${icon(here?'target':'arrow')}</button></div>
      <div data-city-facilities>${selected==='HOSPITAL'?C.cityFacilities(state,selected,time(),busy):''}</div>${['MARKET','SHOP','RESTAURANT','HOSPITAL','MOTEL'].includes(selected)?`<button class="jc-service-launch" data-city-desk="services">${icon(area.icon)}${selected==='MARKET'?'시장 상점 · 무기·확성기':selected==='SHOP'?'상점 이용':selected==='RESTAURANT'?'식사 메뉴':selected==='HOSPITAL'?'병원 진료':'객실 이용'} <span>열기 ↗</span></button>`:''}<div class="jc-people-heading"><h3>이곳의 체류자 <b>${people.length}${state?.nextCursor?'+':''}</b></h3><span>최대 10명씩</span></div>
      <div class="jc-people" role="list">${people.length?people.map((p,i)=>{const pr=role(p.role),self=p.userId===mine?.userId;return `<button role="listitem" class="jc-person ${p.userId===selectedUser?'selected':''}" data-city-person="${p.userId}" style="--role:${pr.color}" aria-label="${esc(p.nickname)}, ${pr.name}${self?', 나':''}"><span class="jc-person-number">${String(i+1).padStart(2,'0')}</span><span class="jc-person-icon">${icon(pr.icon)}</span><span class="jc-person-copy"><b>${esc(p.nickname)}${self?'<em>나</em>':''}</b><small>${pr.name}<i>·</i>${p.deadUntil>time()?'사망 · 병원 이송':p.hospitalRequired?'응급 진료 중':p.jailedUntil>time()?'구금 중':p.protectedUntil>time()?'교전 보호 중':p.wanted?'수배 중':'체류 중'}</small>${hp(p.health,p.maxHealth||100)}</span><span class="jc-person-health">${p.health}<small>HP</small></span></button>`;}).join(''):'<div class="jc-empty">'+icon('person')+'<b>아직 체류자가 없습니다.</b><p>다른 장소를 확인해 보세요.</p></div>'}</div>
      <div class="jc-pagination"><button data-city-page="prev" ${pages.length<2?'disabled':''}>← 이전</button><span>${pages.length} 페이지</span><button data-city-page="next" ${!state?.nextCursor?'disabled':''}>다음 →</button></div>
      <section class="jc-target">${chosen?targetPanel(chosen):'<small>교전 대상</small><h3>체류자를 선택하세요.</h3><p>현재 장소의 상대에게 공격하거나<br>역할에 맞는 행동을 할 수 있습니다.</p>'}</section></aside></div>
      <div data-city-message class="jc-message" role="status" hidden></div><footer class="jc-footnote"><span>일반 카드 5장 + PVP 용병 · 기존 PVP 편성 사용</span><button data-city-deck>편성 확인 ↗</button><button data-city-pending ${storage.get(pendingKey())?'':'hidden'}>처리 중인 요청 확인</button></footer>`;
    const map=root.querySelector('.jc-map-scroll');if(map){map.scrollLeft=mapScroll.left;map.scrollTop=mapScroll.top;}const list=root.querySelector('.jc-people');if(list)list.scrollTop=listScroll;
    updateGlobalDeath(state?.mine,time());drawDesk();tick();
  }
  function targetPanel(target){
    const self=target.userId===state?.mine?.userId,disabled=targetDisabled(target),m=state?.mine,heal=['NURSE','DOCTOR'].includes(m?.role),police=m?.role==='POLICE',r=role(m?.role);
    return `<div class="jc-target-name"><div><small>${self?'내 상태':'선택한 대상'}</small><h3>${esc(target.nickname)}</h3></div>${roleBadge(target.role,true)}</div><div class="jc-target-actions"><button class="jc-danger" data-city-action="attack" ${busy||disabled||self||!r.attackEnabled||target.health<=0||m?.health<=0||target.protectedUntil>time()?'disabled':''}>${icon('swords')}${disabled||(m?.protectedUntil>time()?'보호 해제 후 공격':'공격')}</button>${police?`<button data-city-action="inspect" ${busy||disabled||self||!r.inspectEnabled?'disabled':''}>검문</button><button data-city-action="arrest" ${busy||disabled||self||!r.arrestEnabled||target.wanted<r.arrestMinWanted||target.health<=0||m.health<=0||target.protectedUntil>time()?'disabled':''}>체포</button>`:heal?`<button class="jc-heal" data-city-action="heal" ${busy||disabled||!r.healAmount||(self&&!r.selfHeal)||target.health>=(target.maxHealth||100)?'disabled':''}>${icon('cross')}치료 +${r.healAmount}</button>`:''}</div><p>${esc(police?`수배 ${r.arrestMinWanted} 이상 체포 · 성공 시 ${r.arrestMs/1000}초 구금`:heal?`치료 ${r.healAmount} · 대기 ${r.healCooldownMs/1000}초`:`승리 시 도시 피해 ${r.defeatDamage} · 선제공격 수배 +${r.wantedPerAttack}`)}</p>`;
  }
  function tick(){
    if(!root?.isConnected){stop();return;}
    tickBroadcast();
    if(state?.shift.endsAt<=time()&&!state.rotationClosed){state.rotationClosed=true;if(state.mine)state.mine.active=false;state.people=[];activity={items:[],next:null};broadcastQueue=[];broadcastCurrent=null;clearNotice();clearDeathPanel();root.querySelector('.jc-map-broadcast')?.replaceChildren();closeDesk();closeDialog();render();return;}
    const shift=root.querySelector('[data-city-shift]');if(shift&&state)shift.textContent=clockText(state.shift.endsAt-time());
    tickDesk();
    const wait=root.querySelector('[data-city-action-clock]');if(wait)wait.textContent=state.mine.jailedUntil>time()?'구금 '+clockText(state.mine.jailedUntil-time()):state.mine.nextActionAt>time()?'대기 '+Math.ceil((state.mine.nextActionAt-time())/1000)+'초':'행동 가능';
    const condition=root.querySelector('[data-city-condition]');if(condition){const current=C.cityCondition(state?.mine,time());condition.textContent=current.label;condition.dataset.tone=current.tone;}
    root.querySelectorAll('[data-city-stay-clock]').forEach(node=>{const until=state?.mine?.[node.dataset.cityStayClock];if(until)node.textContent=C.deathClock(until-time());});
    if(!busy&&!fetchingKey&&root.querySelector('[data-city-stay-clock="motelNextAt"]')&&state?.mine?.motelNextAt<=time())render();
    if(state&&!busy&&!fetchingKey&&(state.mine?.restUntil&&state.mine.restUntil<=time()||state.mine?.hospitalLeaveAt&&state.mine.hospitalLeaveAt<=time()))void refresh();
    root.querySelectorAll('[data-beg-until]').forEach(node=>{const left=Number(node.dataset.begUntil)-time();if(left<=0)node.remove();else node.querySelector('[data-beg-clock]').textContent=Math.ceil(left/1000)+'초';});
    const death=root.querySelector('[data-death-clock]');if(death){death.textContent=C.deathClock(state.mine.deadUntil-time());const track=root.querySelector('[data-death-track]');if(track)track.style.width=Math.max(0,(state.mine.deadUntil-time())/1800)+'%';}
    if(state&&!busy&&(state.shift.endsAt<=time()||state.mine?.deadUntil&&state.mine.deadUntil<=time()))void refresh();
    const waits=root.querySelector('[data-city-action-clock]');if(waits&&state.mine?.deadUntil>time())waits.textContent='부활 '+C.deathClock(state.mine.deadUntil-time());
    if(state&&!busy&&state.mine?.nextActionAt&&state.mine.nextActionAt<=time()&&!fetchingKey){state.mine.nextActionAt=0;render();}
  }
  async function refresh(){
    clearTimeout(poll);if(!root?.isConnected||busy)return;
    const key=selected+':'+cursor;if(fetchingKey===key)return;fetchingKey=key;
    const requestSeq=++seq;
    try{const value=await api(`status?location=${selected}&after=${cursor}`);if(requestSeq!==seq||!root?.isConnected)return;const arrival=value.mine?.location==='HOSPITAL'&&(value.mine.hospitalRequired&&!state?.mine?.hospitalRequired||value.mine.deadUntil&&!state?.mine?.deadUntil||state?.mine?.deadUntil&&!value.mine?.deadUntil);const relocated=state?.mine?.active&&value.mine?.active&&selected===state.mine.location&&value.mine.location!==state.mine.location;state=value;offset=value.serverNow-Date.now();syncNoticeContext(value);queueBroadcasts(value.broadcasts,value.shift.id);if((arrival||relocated)&&selected!==value.mine.location){selected=value.mine.location;selectedUser=null;cursor=0;pages=[0];fetchingKey=null;return void refresh();}if(!value.people.some(p=>p.userId===selectedUser))selectedUser=null;render();}
    catch(error){if(requestSeq===seq){if(!state||[401,403].includes(error.status)){closeDesk();state=null;root.innerHTML=`<div class="jc-load-error"><h1>족각도시</h1><p>${esc(error.message)}</p><button data-city-refresh>다시 확인</button></div>`;}else message(error.message,true);}}
    finally{if(requestSeq===seq){fetchingKey=null;if(root?.isConnected)poll=setTimeout(refresh,document.hidden?30000:10000);}}
  }
  const deskTabs=[['profile','내 프로필'],['inventory','인벤토리'],['career','직업·일거리'],['police','경찰 조직'],['protection','교전 보호'],['services','장소 이용'],['logs','활동 로그'],['broadcast','확성기 방송']];
  function closeDesk(){if(desk){desk.close();desk.remove();desk=null;}}
  function openDesk(tab){
    if(desk&&deskTab!==tab)desk.querySelector('.jc-desk-content').scrollTop=0;
    deskTab=tab;
    if(!desk){desk=document.createElement('dialog');desk.className='jc jc-desk';desk.setAttribute('aria-labelledby','jc-desk-title');desk.innerHTML='<header class="jc-desk-header"><div><small>JOKGAK CITY / PERSONAL TERMINAL</small><h2 id="jc-desk-title"></h2></div><button data-city-desk-close aria-label="닫기">'+icon('close')+'</button></header><div class="jc-desk-layout"><nav class="jc-desk-tabs" aria-label="도시 정보 메뉴"></nav><div class="jc-desk-content" tabindex="-1"></div></div>';document.body.append(desk);desk.addEventListener('click',cityClick);const own=desk;own.addEventListener('close',()=>{own.remove();if(desk===own)desk=null;},{once:true});drawDesk();desk.showModal();}else drawDesk();
    if(tab==='police')void loadOrganization();
    if(tab==='logs')void loadActivity();
  }
  function drawDesk(){
    if(!desk||!C)return;
    const body=desk.querySelector('.jc-desk-content'),scroll=body.scrollTop,focus=document.activeElement;
    const messageFocus=focus?.hasAttribute?.('data-city-broadcast-text')?[focus.selectionStart,focus.selectionEnd]:null;
    const focusKey=focus&&body.contains(focus)?{action:focus.dataset.cityAction,product:focus.dataset.cityProduct,place:focus.dataset.cityPlace}:null;
    desk.querySelector('h2').textContent=deskTabs.find(t=>t[0]===deskTab)[1];
    const nav=desk.querySelector('nav');if(!nav.children.length)nav.innerHTML=deskTabs.map(([tab,name])=>'<button data-city-desk="'+tab+'">'+name+'</button>').join('');nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cityDesk===deskTab)));
    const m=state?.mine,r=role(m?.role);
    body.innerHTML=deskTab==='profile'?C.cityProfile(state,time(),icon,r,place(m?.location)?.name,busy)+C.cityWeaponProfile(state)+C.cityRoleSkill(state,time(),busy,icon,r):deskTab==='inventory'?C.cityMiniInventory(state,time(),busy)+C.cityBag(state,time(),busy,icon)||'<p>도시 입장 후 소지품을 확인하세요.</p>':deskTab==='career'?C.cityCareerPanel(state,time(),busy):deskTab==='police'?C.cityPolicePanel(state,organization):deskTab==='protection'?C.cityProtectionPanel(state,time()):'<div class="jc-service-title"><small>선택한 장소</small><h3>'+place(selected).name+'</h3></div>'+C.cityFacilities(state,selected,time(),busy)+C.cityWeapons(state,selected,time(),busy)+C.cityServices(state,selected,time(),busy,icon);
    if(deskTab==='logs')body.innerHTML=C.cityActivityPanel(activity,logBusy);
    if(deskTab==='broadcast')body.innerHTML=C.cityBroadcastComposer(state,broadcastDraft,busy,time());
    if(deskTab==='services')body.insertAdjacentHTML('beforeend',C.cityMegaphoneShop(state,selected,busy));
    if(deskTab==='inventory')body.insertAdjacentHTML('beforeend','<button data-city-desk="broadcast" style="margin-top:18px">확성기 '+(state?.mine?.megaphoneCount||0)+'개 · 방송하기 ↗</button>');
    const textarea=body.querySelector('[data-city-broadcast-text]');if(textarea)textarea.oninput=()=>{broadcastDraft=textarea.value;body.querySelector('[data-city-message-count]').textContent=Array.from(broadcastDraft).length+' / 100자';};
    body.scrollTop=scroll;
    if(messageFocus&&textarea&&!busy){textarea.focus({preventScroll:true});textarea.setSelectionRange(...messageFocus);}else if(focusKey){const node=[...body.querySelectorAll('button')].find(b=>b.dataset.cityAction===focusKey.action&&b.dataset.cityProduct===focusKey.product&&b.dataset.cityPlace===focusKey.place);node?.focus({preventScroll:true});}
    tickDesk();
  }
  function tickDesk(){
    const send=desk?.querySelector('[data-city-send-broadcast]');if(send&&state?.mine?.megaphoneNextAt<=time()&&!busy&&state.mine.active&&state.mine.megaphoneCount>0&&!state.mine.deadUntil&&!state.mine.hospitalRequired&&state.mine.jailedUntil<=time()&&state.mine.restUntil<=time()){send.disabled=false;send.textContent='확성기 사용 · 전송';}
    document.querySelectorAll('.jc [data-career-clock]').forEach(n=>{n.textContent=clockText(Number(n.dataset.careerClock)-time());});
    desk?.querySelectorAll('[data-city-stay-clock]').forEach(n=>{const until=state?.mine?.[n.dataset.cityStayClock];if(until)n.textContent=C.deathClock(until-time());});
    const done=desk?.querySelector('[data-city-action="workFinish"]');if(done&&state?.mine?.career?.work?.endsAt<=time()&&!busy&&state.mine.active&&state.mine.nextActionAt<=time()&&!state.mine.hospitalRequired&&!state.mine.deadUntil&&state.mine.jailedUntil<=time()&&state.mine.restUntil<=time())done.disabled=false;
  }
  async function loadOrganization(more=false){
    if(orgBusy)return;orgBusy=true;const owner=root;
    try{const data=await api('organization?after='+(more?organization?.nextCursor||0:0));if(root!==owner)return;organization={...data,people:more&&organization?.epoch===data.epoch?[...organization.people,...data.people]:data.people};}
    catch(e){organization={error:e.message};}finally{orgBusy=false;drawDesk();}
  }
  async function loadActivity(more=false){
    if(logBusy)return;logBusy=true;const request=++logSeq,uid=noticeAccountId(),cursor=more?activity?.next:null;
    if(!more)activity=null;drawDesk();
    try{const value=await api('log'+(cursor?'?before='+cursor.before+'&beforeId='+encodeURIComponent(cursor.beforeId):''));if(request!==logSeq||uid!==noticeAccountId())return;activity={...value,items:more&&activity?.shift?.id===value.shift.id?[...activity.items,...value.items]:value.items};if(value.shift.endsAt<=time())activity={items:[],next:null};}
    catch(error){if(request===logSeq)activity={error:error.message};}finally{if(request===logSeq){logBusy=false;drawDesk();}}
  }
  function queueBroadcasts(items,epoch){
    if(epoch!==broadcastEpoch){broadcastEpoch=epoch;broadcastSeen.clear();broadcastQueue=[];broadcastCurrent=null;}
    for(const item of items||[])if(item.epoch===epoch&&!broadcastSeen.has(item.id)&&item.createdAt>=time()-120000){broadcastSeen.add(item.id);broadcastQueue.push(item);}
    broadcastQueue=broadcastQueue.slice(-12);tickBroadcast();
  }
  function tickBroadcast(){
    if(!C||!root?.isConnected)return;
    const now=time();if(broadcastCurrent&&now-broadcastCurrent.shownAt>=C.CITY_MEGAPHONE.displayMs)broadcastCurrent=null;
    if(!broadcastCurrent&&broadcastQueue.length)broadcastCurrent={...broadcastQueue.shift(),shownAt:now};
    const host=root.querySelector('.jc-map-broadcast');if(host&&(host.firstElementChild?.dataset.broadcastId||'')!==(broadcastCurrent?.id||''))host.innerHTML=C.cityBroadcastMarkup(broadcastCurrent,now);
  }
  function syncNoticeContext(result){
    if(result.serverNow){noticeOffset=result.serverNow-Date.now();noticeThrough=result.serverNow;}
    if(result.shift){
      if(noticeWindow&&noticeWindow.id!==result.shift.id){clearNotice();clearDeathPanel();storage.set(seenKey(noticeAccountId()),[]);activity=null;}
      noticeWindow=result.shift;
    }
    if(result.noticePreferences){noticeHidden=result.noticePreferences.hidePopups===true;storage.set('jokgak:notice-prefs:'+noticeAccountId(),result.noticePreferences);if(noticeHidden){clearNotice();clearDeathPanel();}}
  }
  async function saveNoticePreference(hidePopups){
    if(prefSaving)return;prefSaving=true;const uid=noticeAccountId();render();
    try{const result=await api('notice-settings',{hidePopups});if(uid!==noticeAccountId())return;syncNoticeContext(result);if(state)state.noticePreferences=result.noticePreferences;}
    catch(error){message(error.message,true);}finally{prefSaving=false;render();notifyPollSoon(true);}
  }
  async function skipAllNotices(){
    const uid=noticeAccountId(),through=noticeThrough||state?.serverNow;
    const buttons=[...document.querySelectorAll('[data-notice-skip-all],[data-city-notice-skip-all]')];buttons.forEach(b=>b.disabled=true);
    try{await api('ack-all',{through});if(uid!==noticeAccountId())return;if(!notice||Number(notice.dataset.createdAt)<=through)clearNotice();if(state)state.unreadCount=0;if(deskTab==='logs')void loadActivity();notifyPollSoon(true);render();}
    catch(error){const line=notice?.querySelector('[data-notice-error]');if(line)line.textContent=error.message;message(error.message,true);}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  function closeDialog(){dialog?.close();dialog?.remove();dialog=null;}
  function showDialog(title,body,buttons='<button data-city-dialog-close>확인</button>'){
    closeDialog();dialog=document.createElement('dialog');dialog.className='jc-dialog';dialog.innerHTML=`<header><h2>${esc(title)}</h2><button data-city-dialog-close aria-label="닫기">${icon('close')}</button></header><div class="jc-dialog-body">${body}</div><footer>${buttons}</footer>`;document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target.closest('[data-city-dialog-close]'))closeDialog();});const ownDialog=dialog;dialog.addEventListener('close',()=>{ownDialog.remove();if(dialog===ownDialog)dialog=null;},{once:true});dialog.showModal();return dialog;
  }
  function rewardHtml(reward){
    if(!reward||reward.status==='NONE')return '';
    const messages={DISABLED:'보상 사용 안 함',EMPTY:'설정된 보상 없음',DAILY_LIMIT:'오늘의 보상 횟수를 모두 사용했습니다.',TARGET_COOLDOWN:'같은 상대 보상 대기 중입니다.'};
    if(messages[reward.status])return `<p class="jc-muted">${messages[reward.status]}</p>`;
    return `<div class="jc-reward"><b>${reward.paid?'획득 보상':'TEST 보상 미리보기 · 실제 지급 없음'}</b><p>${[reward.cash?`${reward.mode==='TEST'?'테스트 ':''}현금 ${money(reward.cash)}원`:'',reward.coin?`코인 ${money(reward.coin)}`:'',...(reward.items||[]).map(item=>`${esc(item.name)} × ${money(item.quantity)}`)].filter(Boolean).join(' · ')}</p><small>오늘 남은 보상 ${reward.remaining}회</small></div>`;
  }
  async function refreshRewardAccount(result,accountId){
    if(PREVIEW||!result.reward?.paid||!(result.reward.coin||result.reward.items?.length)||typeof apiRequest!=='function'||typeof mergeApiUserSummary!=='function'||typeof saveUser!=='function')return;
    if(Number(user()?.serverUserId||user()?.id)!==accountId)return;
    const epoch=typeof PLAYER_STATE_MUTATION_EPOCH==='number'?++PLAYER_STATE_MUTATION_EPOCH:null;
    for(const key of ['me','me/summary','shell/summary','inventory']){if(typeof clearApiCache==='function')clearApiCache(key);if(typeof API_INFLIGHT!=='undefined')API_INFLIGHT.delete(key);}
    try{
      const fresh=await apiRequest('me/summary',{}, {ttl:0,timeoutMs:12000});
      if(Number(user()?.serverUserId||user()?.id)!==accountId||Number(fresh.user?.id)!==accountId||epoch!==null&&epoch!==PLAYER_STATE_MUTATION_EPOCH)return;
      saveUser(mergeApiUserSummary(fresh.user),{source:'jokgak-city'});
    }catch{}
  }
  function rules(){const mine=role(state?.mine?.role),common=state?.rules||C.CITY_RULES;showDialog('족각도시 진행 방법',`<ol class="jc-guide"><li><b>장소 선택 → 이동 → 대상 선택</b><p>건물을 누르면 체류자가 최대 10명씩 표시됩니다. 같은 장소에 있어야 공격·검문·치료할 수 있습니다.</p></li><li><b>6시간마다 역할 무작위 배정</b><p>한국시간 00·06·12·18시에 교대하며 전원 퇴장합니다. 새 교대에는 직접 재입장해야 하고, 이전 팝업·활동 기록은 삭제됩니다. 입·퇴장으로 다시 뽑을 수 없으며 같은 역할이 다시 나올 수도 있습니다. 배정 비중 변경은 다음 교대부터 적용됩니다.</p></li><li><b>현재 PVP 편성으로 교전</b><p>일반 카드 5장과 PVP 용병 편성을 사용하되, 계정 성장·장비·마법·펫 보너스는 도시 공통 기준으로 보정합니다. 시장 무기를 장착하면 편성 전체의 도시 전투력이 올라갑니다. 공격했다가 패배하면 공격한 사람의 도시 체력이 감소합니다. 도시 체력이 0이면 3분 동안 사망 대기 후 병원에서 자동 부활합니다. 처치자와 남은 시간이 표시됩니다. 도시 피해와 회복량은 아래 역할 안내를 확인하세요.</p></li><li><b>PVP 승리 시 상대 현금 강탈</b><p>${state?.cash?.theft?.enabled?`공격·방어·체포 전투의 승리자가 패자의 소지 현금 ${state.cash.theft.percent}%를 가져갑니다. 1회 최대 ${money(state.cash.theft.maxCash)}원이며 1원 미만은 버립니다. 무승부에는 현금이 이동하지 않습니다.`:"현재 현금 강탈이 꺼져 있습니다."} 역할별 추가 보상과 별도로 정산합니다. TEST에서는 테스트 현금만 이동합니다.</p></li><li><b>거지의 구걸·동냥 / 갱단의 처치 특성</b><p>거지는 같은 장소 사람들에게 현금을 부탁할 수 있습니다. 지도 오른쪽 아래 알림에서 ‘준다’를 누르면 표시 금액을 건네며, ‘말까’는 현금을 쓰지 않습니다. 갱단은 상대 도시 체력을 0으로 만든 처치에만 추가 강탈 비율과 한도를 적용합니다.</p></li><li><b>경찰과 의료진</b><p>경찰은 검문으로 상대 편성을 확인하고 수배자에게 체포 전투를 걸 수 있습니다. 의료진은 같은 장소의 도시 체력을 회복합니다. 세부 사용 여부와 수치는 현재 역할 설정을 따릅니다.</p></li><li><b>다른 콘텐츠에서도 피격 알림</b><p>도시 체류 중에는 다른 콘텐츠에서도 방어 교전과 팝업 알림이 이어집니다. 도시 퇴장 후 재입장은 ${common.rejoinCooldownMs/1000}초 대기합니다.</p></li><li><b>역할별 보상</b><p>${state?.mode==='TEST'?'현재 TEST 운영으로 실제 코인·아이템은 지급하지 않습니다.':state?.rewardRules?.enabled?'설정된 행동 보상은 결과 확정 시 지급합니다.':'현재 보상 사용이 꺼져 있습니다.'} 일일 보상 횟수는 ${state?.rewardRules?.dailyLimit??20}회, 같은 상대 보상 대기는 ${(state?.rewardRules?.sameTargetCooldownMs??3600000)/1000}초입니다. 자기 치료에는 보상이 없습니다.</p></li></ol><div class="jc-role-guide">${(state?.roles||C.CITY_ROLES).map(r=>`<div>${roleBadge(r.code,true)}<p>${esc(r.detail)}</p></div>`).join('')}</div><p class="jc-muted">도시 체력·수배·구금은 역할 교대 때 초기화됩니다. 사망 대기와 생활 상태는 유지됩니다. 배고프면 식당에서 식사하고, 건강이 위험해 병원에 이송되면 진료를 받으세요. 병원·식당·상점은 족각도시 전용 현금(원)으로 이용합니다. 매 6시간 교대 시 현금은 시작 금액으로 복귀하고 무기·소지품·취직·실적이 초기화됩니다. 도시 밖·오프라인 시간도 직업별 자동 수입에 포함됩니다. 직업·일거리 메뉴에서 추가 근무를 할 수 있습니다. 무기는 미니 인벤토리에서 장착·해제하고 휴대품은 소지품에서 사용합니다. 모텔에서는 15분간 개인 휴식이 가능하며 퇴실 후 재이용은 1시간입니다. 일반 역할은 병원에서 5분 뒤 무작위 장소로 이동하며 의사·간호사는 상주할 수 있습니다.</p>`);}

  async function action(kind,retry=false,product=null,offer=null){
    if(busy||!state)return;
    const old=storage.get(pendingKey());
    if(old&&!retry){showDialog('처리 상태 확인',`<p>앞선 요청의 결과를 먼저 확인해야 합니다. 같은 요청 번호로 확인하여 중복 처리하지 않습니다.</p>`,'<button data-city-retry>요청 확인</button>');dialog.querySelector('[data-city-retry]').onclick=()=>{closeDialog();void action(old.kind,true);};return;}
    const target=state.people.find(p=>p.userId===selectedUser);
    if(kind==='join'&&!retry){const d=showDialog('족각도시에 입장',`<p>현재 PVP 편성으로 도시의 교전에 참여합니다.</p>${state.mode==='TEST'?'<p><b>TEST 운영 · 실제 보상 미지급</b></p>':''}<p>교전에서 패배하면 ${state.cash?.theft?.enabled?`소지 현금의 ${state.cash.theft.percent}% (최대 ${money(state.cash.theft.maxCash)}원)를 상대에게 빼앗길 수 있습니다.`:"도시 체력이 감소합니다."}</p><p>다른 콘텐츠를 이용하는 동안에도 이곳에서 공격받을 수 있습니다. 체류는 <b>도시 퇴장</b> 또는 <b>6시간 교대 종료</b> 때 끝납니다. 교대 뒤에는 직접 다시 입장해야 합니다.</p>`,'<button data-city-dialog-close>돌아가기</button><button class="jc-primary" data-city-confirm>입장</button>');d.querySelector('[data-city-confirm]').onclick=()=>{closeDialog();void submit(kind,{requestId:crypto.randomUUID(),epoch:state.shift.id});};return;}
    const body=retry?old.body:{requestId:crypto.randomUUID(),epoch:state.shift.id,...(kind==='move'?{location:selected}:{}),...(['attack','arrest','heal','inspect'].includes(kind)?{targetId:target?.userId}:{}),...(['buy','use','buyWeapon','equipWeapon','workStart'].includes(kind)?{product}:{}),...(kind==='donate'?{targetId:offer?.actorId,offerId:offer?.requestId}:{}),...(kind==='broadcast'?{message:broadcastDraft}:{})};
    if(kind==='broadcast'&&!retry&&(!broadcastDraft.trim()||Array.from(broadcastDraft).length>100)){const hint=desk?.querySelector('[data-city-comms-message]');if(hint)hint.textContent='메시지는 1~100자로 입력하세요.';return;}
    if(!retry&&['buy','eat','treat','buyWeapon','buyMegaphone'].includes(kind)){
      const cfg=state.life||C.defaultCitySettings().life,p=kind==='buyMegaphone'?C.CITY_MEGAPHONE:kind==='buyWeapon'?state.arsenal.weapons.find(w=>w.code===product):kind==='buy'?cfg.supplies.find(x=>x.code===product):kind==='eat'?cfg.meal:cfg.treatment;
      if(!p)return;const title=kind==='buyMegaphone'?'확성기 구매':kind==='buyWeapon'?'시장 무기 구매':kind==='buy'?'소지품 구매':kind==='eat'?'식당에서 식사':'병원 진료';
      const d=showDialog(title,`<div class="jc jc-item-receipt">${kind==='buyMegaphone'?'<span class="jc-item-art"><img src="/assets/ui/jokgak-city/megaphone-v1/megaphone-256.webp" alt="도시 확성기" width="256" height="256"></span>':C.cityItemArt(kind==='eat'?'SET_MEAL':kind==='treat'?'TREATMENT':product,true)}<div><p>${state.mode==='TEST'?`TEST · 테스트 현금 ${money(p.price)}원으로 결제합니다.`:`이용 시 <b>${money(p.price)}원</b>이 차감됩니다.`}</p></div></div>`,'<button data-city-dialog-close>취소</button><button class="jc-primary" data-city-confirm>이용하기</button>');
      d.querySelector('[data-city-confirm]').onclick=()=>{closeDialog();void submit(kind,body);};return;
    }
    await submit(kind,body);
  }
  async function submit(kind,body){
    const submittedRoot=root,submissionKey=pendingKey(),accountId=Number(user()?.serverUserId||user()?.id);
    let successText='';
    busy=true;clearTimeout(poll);++seq;fetchingKey=null;storage.set(submissionKey,{kind,body});render();message(['attack','arrest'].includes(kind)?'양쪽 PVP 편성과 전투 결과를 확인하고 있습니다…':'도시 행동을 처리하고 있습니다…');
    try{
      const result=await api(kind,body);storage.set(submissionKey,null);void refreshRewardAccount(result,accountId);
      if(root!==submittedRoot||!submittedRoot?.isConnected)return;
      updateGlobalDeath(result.mine,result.createdAt);state.mine=result.mine;render();
      if(result.comms){if(kind==='broadcast'){broadcastDraft='';queueBroadcasts([{id:result.requestId,...result.comms}],result.epoch);closeDesk();successText='확성기 1개를 사용해 지도에 방송했습니다.';}else successText='확성기 1개 구매 완료 · 500원 사용';}
      else if(result.battleV2){closeDesk();await playBattle(result);}
      else if(result.work){successText=result.work.kind==='workFinish'?`근무 완료 · ${money(result.work.cash.change)}원 지급`:result.work.kind==='employment'?'취직 등록 완료':result.work.kind==='workCancel'?'근무를 취소했습니다.':'근무를 시작했습니다. 이동·교전·퇴장 시 취소됩니다.';}
      else if(result.donation){successText=`${result.donation.recipientName} 님에게 ${money(result.donation.amount)}원을 건넸습니다.`;}
      else if(result.expansion){const e=result.expansion;successText=e.kind==='buyWeapon'?`${e.name} 구매 완료 · 미니 인벤토리에서 장착하세요.`:e.kind==='equipWeapon'?`${e.name} 장착 · 도시 전투력 ${money(result.mine.cityPower)}`:e.kind==='unequipWeapon'?'무기 장착을 해제했습니다.':e.kind==='rest'?'개인 객실에 입실했습니다. 휴식 중에는 공격받지 않습니다.':'퇴실했습니다. 집으로 이동합니다.';if(['rest','checkout'].includes(kind)){selected=result.mine.location;cursor=0;pages=[0];}}
      else if(['beg','alms'].includes(kind)){successText='이곳 사람들에게 도움을 요청했습니다. 동냥 알림은 지도 오른쪽 아래에 표시됩니다.';}
      else if(result.service){const s=result.service;showDialog(s.name+' 완료',`<div class="jc jc-item-receipt">${C.cityItemArt(kind==='eat'?'SET_MEAL':kind==='treat'?'TREATMENT':body.product,true)}<div><p>${kind==='buy'?'도시 소지품에 1개 보관했습니다.':`포만감 ${s.hunger} · 건강 ${s.wellness} · 체력 ${s.health}`}</p><p>${s.test?'테스트 ':''}현금 ${money(s.price)}원 사용 · 잔액 <b>${money(s.cash?.after)}원</b></p></div></div>`);}
      else if(result.inspection){const i=result.inspection;showDialog('검문 결과',`<h3>${esc(i.nickname)} · ${role(i.role).name}</h3><p>수배 ${i.wanted} · 도시 전투력 ${money(i.cardPower)} · ${esc(i.weaponName||"맨손")}</p><ul class="jc-inspection">${i.cards.map(c=>`<li><b>${esc(c.rarity)}</b><span>${esc(c.name)} ${esc(c.title)}</span></li>`).join('')}</ul>${rewardHtml(result.reward)}`);}
      else if(kind==='heal'&&['PAID','TEST_PREVIEW'].includes(result.reward?.status)){showDialog('치료 완료',`<p>도시 체력 ${result.effects?.healed||0} 회복</p>${rewardHtml(result.reward)}`);}
      else if(kind==='join'||kind==='move'){selected=result.mine.location;cursor=0;pages=[0];}
      if(kind==='join'){notifyPollSoon(true);}
    }catch(error){
      if([400,401,403,409,429].includes(error.status))storage.set(submissionKey,null);
      if(root===submittedRoot&&submittedRoot?.isConnected)showDialog('행동 확인',`<p>${esc(error.message||'응답을 받지 못했습니다. 처리 중인 요청 확인을 눌러 주세요.')}</p>`);
    }finally{if(root===submittedRoot){busy=false;await refresh();if(successText)message(successText);}}
  }
  async function playBattle(data){
    if(PREVIEW&&window.CityPreview?.playBattle)return window.CityPreview.playBattle(data);
    const ownerRoot=root;await ensureFeatureResources('battleV2');if(root!==ownerRoot||!ownerRoot?.isConnected)return;
    const ownModal=document.createElement('div');battleModal=ownModal;ownModal.className='jc-battle';document.body.append(ownModal);
    const loading=prepareBattleV2LiveLoading({modal:ownModal,mode:'PVP',playerName:data.attackerNickname,opponentName:data.defenderNickname,autoText:'족각도시 · '+place(data.location).name});
    loading.stage.querySelector('.battle-v3-header strong').textContent='족각도시 · '+place(data.location).name;
    loading.stage.querySelector('.battle-v3-header small').textContent='JOKGAK CITY · 교전';
    loading.host.style.backgroundImage=`linear-gradient(#07101b33,#07101b66),url('${ART}city-street-battle-v1.webp')`;
    try{await playPvpBattleV2Live({...loading,modal:ownModal,data});if(!ownModal.isConnected)return;await new Promise(resolve=>{const result=document.createElement('div');result.className='jc-battle-result';const outcome=data.result==='WIN'?'교전 승리':data.result==='DRAW'?'교전 무승부':'교전 패배';result.innerHTML=`<section><small>족각도시 · ${esc(place(data.location).name)}</small><h2>${outcome}</h2><p>${data.action==='arrest'&&data.result==='WIN'?`체포 성공 · 상대 ${(data.effects?.jailMs??60000)/1000}초 구금`:data.result==='WIN'?`상대 도시 체력 −${data.effects?.damageToTarget??25}`:data.result==='LOSE'?`내 도시 체력 −${data.effects?.damageToMine??25}`:'도시 체력 유지'}</p><div class="jc-combat-hp"><span>내 도시 체력 <b>${data.mine.health} / ${data.mine.maxHealth||100}</b></span><span>상대 도시 체력 <b>${data.target?.health??0} / ${data.target?.maxHealth||100}</b></span></div>${C.cityTheftHtml(data.theft)}${rewardHtml(data.reward)}<button class="jc-primary">도시로 돌아가기 ${icon('arrow')}</button></section>`;ownModal.append(result);result.querySelector('button').onclick=resolve;result.querySelector('button').focus();ownModal.cityFinish=resolve;});}
    catch(error){if(ownModal.isConnected)showDialog('전투 기록은 저장되었습니다',`<p>화면 재생을 완료하지 못했습니다. 승패와 도시 상태는 서버에 저장되어 있습니다.</p><p>${esc(error.message)}</p>${C.cityTheftHtml(data.theft)}`);}
    finally{ownModal.__battleV2Renderer?.destroy?.();ownModal.remove();if(battleModal===ownModal)battleModal=null;}
  }
  function stop(){closeDesk();closeDialog();organization=null;activity=null;logSeq++;logBusy=false;broadcastQueue=[];broadcastCurrent=null;broadcastSeen.clear();seq++;fetchingKey=null;lifecycle?.abort();lifecycle=null;clearTimeout(poll);clearInterval(clock);poll=clock=null;root=null;if(battleModal){battleModal.cityFinish?.();battleModal.__battleV2Renderer?.destroy?.();battleModal.remove();battleModal=null;}}
  async function bind(){
    stop();root=document.getElementById('jokgakCity');if(!root)return;const mounted=root;[C]=await Promise.all([config,stylesReady]);if(root!==mounted)return;state=null;selected='MARKET';cursor=0;pages=[0];selectedUser=null;busy=false;lifecycle=new AbortController();
    root.addEventListener('click',cityClick,{signal:lifecycle.signal});
    render();clock=setInterval(tick,1000);await refresh();
  }
  function cityClick(e){
      const hide=e.target.closest('[data-city-hide-popups]');if(hide){void saveNoticePreference(hide.checked);return;}
      if(e.target.closest('[data-city-notice-skip-all]')){void skipAllNotices();return;}
      if(e.target.closest('[data-city-log-refresh]')){void loadActivity();return;}
      if(e.target.closest('[data-city-log-more]')){void loadActivity(true);return;}
      if(e.target.closest('[data-city-send-broadcast]')){void action('broadcast');return;}
      if(e.target.closest('[data-city-market]')){selected='MARKET';closeDesk();void refresh().then(()=>openDesk('services'));return;}
      const placeButton=e.target.closest('[data-city-place]');if(placeButton){closeDesk();selected=placeButton.dataset.cityPlace;selectedUser=null;cursor=0;pages=[0];void refresh();return;}
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.cityDesk){openDesk(b.dataset.cityDesk);return;}
      if(b.hasAttribute('data-city-desk-close')){closeDesk();return;}
      if(b.hasAttribute('data-city-org-refresh')||b.hasAttribute('data-city-org-more')){void loadOrganization(b.hasAttribute('data-city-org-more'));return;}
      if(b.dataset.cityPerson){selectedUser=Number(b.dataset.cityPerson);render();root.querySelector('.jc-target')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
      else if(b.hasAttribute('data-city-refresh'))void refresh();
      else if(b.hasAttribute('data-city-rules'))rules();
      else if(b.dataset.cityDonate){const offer=state?.beggingOffers?.find(o=>o.requestId===b.dataset.cityDonate);if(offer)void action('donate',false,null,offer);}
      else if(b.dataset.cityDecline){if(!busy){const id=b.dataset.cityDecline;b.disabled=true;void api('ack',{ids:[id]}).then(refresh).catch(error=>{b.disabled=false;message(error.message,true);});}}
      else if(b.dataset.cityAction)void action(b.dataset.cityAction,false,b.dataset.cityProduct||null);
      else if(b.hasAttribute('data-city-pending')){const pending=storage.get(pendingKey());if(pending)void action(pending.kind,true);}
      else if(b.dataset.cityZoom){zoom=Math.max(1,Math.min(1.75,zoom+(b.dataset.cityZoom==='+'?.25:-.25)));render();}
      else if(b.dataset.cityPage){if(b.dataset.cityPage==='next'&&state?.nextCursor){cursor=state.nextCursor;pages.push(cursor);}else if(pages.length>1){pages.pop();cursor=pages.at(-1);}void refresh();}
      else if(b.hasAttribute('data-city-deck')){if(PREVIEW)showDialog('PVP 편성 연결','<p>운영 화면에서는 현재 PVP 덱 편성실로 이동합니다.</p>');else renderShell('pvp');}
  }
  // Non-modal notifications stay above other content without touching its timers,
  // battle renderer, selected route, focus or settlement lifecycle.
  const noticeAccountId=()=>String(user()?.serverUserId||user()?.id||'');
  let notifyTimer,notifying=false,notice=null,noticeUserId=null,noticeLayer=null,noticeExpiryTimer=null,noticeOffset=0,noticeWindow=null,noticeThrough=0,noticeHidden=false;
  let deathPanel=null,deathLayer=null,deathState=null,deathUser=null,deathTimer=null,deathOffset=0;
  function clearNotice(){clearTimeout(noticeExpiryTimer);noticeExpiryTimer=null;noticeLayer?.();noticeLayer=null;notice?.remove();notice=null;noticeUserId=null;}
  function clearDeathPanel(){deathLayer?.();deathLayer=null;deathPanel?.remove();deathPanel=null;}
  function updateGlobalDeath(mine,serverNow){
    if(serverNow)deathOffset=serverNow-Date.now();
    deathState=mine?.deadUntil>Date.now()+deathOffset?mine:null;deathUser=noticeAccountId();
    if(!deathState){clearDeathPanel();clearInterval(deathTimer);deathTimer=null;return;}
    if(!deathTimer)deathTimer=setInterval(drawGlobalDeath,1000);drawGlobalDeath();
  }
  function drawGlobalDeath(){
    if(noticeHidden||noticeWindow?.endsAt<=Date.now()+noticeOffset){clearDeathPanel();return;}
    if(!deathState||deathUser!==noticeAccountId()){updateGlobalDeath(null);return;}
    const left=deathState.deadUntil-Date.now()-deathOffset;
    if(left<=0){updateGlobalDeath(null);notifyPollSoon();if(root?.isConnected&&!busy)void refresh();return;}
    if(root?.isConnected){clearDeathPanel();return;}
    if(!deathPanel){deathPanel=document.createElement('aside');deathPanel.className='jc-death-global jc-dispatch';deathPanel.setAttribute('role','status');deathPanel.innerHTML=`<header><span>족각도시 · 사망</span><b data-global-death-clock></b></header><p><b>${esc(deathState.death?.killerName||'알 수 없는 상대')}</b> 님에게 처치되었습니다.</p><div class="jc-dispatch-bottom"><span>부활 장소 <b>병원</b></span><small>3분 후 자동 부활</small></div>`;deathLayer=C.mountCityNoticeLayer(deathPanel);}
    deathPanel.querySelector('[data-global-death-clock]').textContent=C.deathClock(left);
  }
  const seenKey=id=>'jokgak:seen:'+id;
  async function showNotice(item){
    const uid=noticeAccountId();C||=await config;if(notice||noticeHidden||document.hidden||uid!==noticeAccountId()||item.expiresAt&&item.expiresAt<=Date.now()+noticeOffset)return false;noticeUserId=uid;
    notice=document.createElement('aside');notice.className='jc-dispatch';notice.setAttribute('role','alertdialog');notice.setAttribute('aria-label','족각도시 피격 및 행동 알림');notice.setAttribute('aria-modal','false');
    const attack=['attack','arrest'].includes(item.action),donated=item.action==='donate',title=donated?'따뜻한 손길이 도착했습니다':item.deadUntil>time()?'사망 · 병원 부활 대기':attack?'도시에서 공격받았습니다':item.action==='heal'?'치료를 받았습니다':'검문을 받았습니다';
    notice.innerHTML=`<div class="jc-dispatch-stripe"></div><header><span>${icon(attack?'swords':'cross')}족각도시 · ${esc(place(item.location)?.name||'도시')}</span><button data-notice-dismiss aria-label="나중에">${icon('close')}</button></header><h2>${title}</h2><p><b>${esc(item.actorName)}</b> 님이 ${donated?`동냥으로 ${money(item.donation?.amount)}원을 건넸습니다.`:attack?'교전을 걸었습니다.':item.action==='heal'?'도시 체력을 회복했습니다.':'PVP 카드 편성을 확인했습니다.'}</p>${C.cityTheftHtml(item.theft,true)}<div class="jc-dispatch-bottom"><span>도시 체력 <b>${item.health} / ${item.maxHealth||100}</b>${item.deadUntil>time()?' · 부활 장소 병원':''}</span><button data-notice-record>기록 보기 →</button></div>`;
    notice.dataset.cityNoticeId=String(item.id);
    notice.dataset.createdAt=String(item.createdAt||0);
    notice.insertAdjacentHTML('beforeend','<div class="jc-notice-actions"><button data-notice-skip-all>팝업 전체 스킵</button><span data-notice-error role="status"></span></div>');
    notice.querySelector('[data-notice-skip-all]').onclick=()=>void skipAllNotices();
    if(item.expiresAt)noticeExpiryTimer=setTimeout(()=>{clearNotice();clearDeathPanel();notifyPollSoon(true);},Math.max(0,item.expiresAt-Date.now()-noticeOffset));
    const ownNotice=notice;noticeLayer=C.mountCityNoticeLayer(notice);
    const dismiss=async()=>{
      if(notice!==ownNotice||uid!==noticeAccountId())return;
      if(!PREVIEW){const seen=storage.get(seenKey(uid))||[];storage.set(seenKey(uid),[...seen.filter(id=>id!==item.id),item.id].slice(-100));}
      clearNotice();
      if(!PREVIEW){try{await api('ack',{ids:[item.id]});}catch{}finally{notifyPollSoon(true);}}
      return uid===noticeAccountId();
    };
    notice.querySelector('[data-notice-dismiss]').onclick=dismiss;
    notice.querySelector('[data-notice-record]').onclick=async()=>{if(!await dismiss())return;const outcome=item.winner==='A'?'방어 패배':item.winner==='B'?'방어 승리':item.winner==='DRAW'?'무승부':'';showDialog('족각도시 행동 기록',`<p>${esc(item.actorName)} · ${esc(place(item.location)?.name||'도시')}</p><h3>${outcome||title}</h3>${donated?`<p>동냥으로 ${money(item.donation?.amount)}원 받음</p>`:""}${C.cityTheftHtml(item.theft,true)}<p>현재 행동 이후 도시 체력 ${item.health} / ${item.maxHealth||100}</p>${item.jailedUntil>time()?`<p>체포되어 경찰서에 ${(item.jailMs??60000)/1000}초간 구금되었습니다.</p>`:''}<p>진행 중인 다른 콘텐츠는 계속 이용할 수 있습니다.</p>`);};
    return true;
  }
  function notifyPollSoon(fresh=false){if(fresh&&noticeAccountId())storage.set('jokgak:poll-after:'+noticeAccountId(),0);clearTimeout(notifyTimer);notifyTimer=setTimeout(pollNotices,1000);}
  async function pollNotices(){
    clearTimeout(notifyTimer);if(PREVIEW)return;let delay=60000;
    if(notice&&noticeUserId!==noticeAccountId())clearNotice();if(deathUser!==noticeAccountId())updateGlobalDeath(null);
    if(!document.hidden&&!notifying&&noticeAccountId()){
      notifying=true;const uid=noticeAccountId();
      try{
        const read=async()=>{
          C||=await config;
          await stylesReady;
          const leaseKey='jokgak:poll-after:'+uid,until=Number(storage.get(leaseKey)||0);
          if(until>Date.now()){delay=Math.min(8000,until-Date.now());return;}
          storage.set(leaseKey,Date.now()+12000);
          delay=8000;
          const result=await api('notifications');if(noticeAccountId()!==uid)return;syncNoticeContext(result);updateGlobalDeath(result.active?result.mine:null,result.serverNow);delay=result.active||result.mine?.deadUntil>result.serverNow?8000:60000;storage.set(leaseKey,Date.now()+delay);
          if(document.hidden)return;
          const seen=storage.get(seenKey(uid))||[],alreadyShown=result.items.filter(item=>seen.includes(item.id)).map(item=>item.id);
          if(alreadyShown.length)await api('ack',{ids:alreadyShown});
          if(uid===noticeAccountId()&&!notice&&!noticeHidden){const next=result.items.find(item=>!seen.includes(item.id));if(next)await showNotice(next);}
        };
        if(navigator.locks)await navigator.locks.request('jokgak-notices:'+uid,{ifAvailable:true},async lock=>{if(lock)await read();else delay=8000;});else await read();
      }catch{}finally{notifying=false;}
    }
    notifyTimer=setTimeout(pollNotices,delay+Math.random()*1000);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(noticeWindow?.endsAt<=Date.now()+noticeOffset){clearNotice();clearDeathPanel();}notifyPollSoon(true);}});
  window.addEventListener('pageshow',()=>notifyPollSoon(true));
  window.addEventListener('storage',event=>{if(event.key==='cnine_card_user_v10')notifyPollSoon(true);});
  let lastNoticeAccount=noticeAccountId();
  window.addEventListener('cnine:player-updated',()=>{const uid=noticeAccountId();if(uid!==lastNoticeAccount){lastNoticeAccount=uid;clearNotice();updateGlobalDeath(null);noticeWindow=null;noticeHidden=false;activity=null;logSeq++;logBusy=false;broadcastQueue=[];broadcastCurrent=null;broadcastSeen.clear();broadcastDraft='';notifyPollSoon(true);}});
  window.addEventListener('cnine:route-will-change',stop);
  window.JokgakCity=Object.freeze({view,bind,stop,showNotice});
  if(!PREVIEW)notifyPollSoon();
})();
