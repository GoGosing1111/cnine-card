(function(){
  'use strict';
  if(window.JokgakCity)return;
  const VERSION='20261009-cms1',ART='/assets/ui/jokgak-city/',PREVIEW=location.pathname.startsWith('/preview/jokgak-city-v1/');
  const config=Promise.all([import('/shared/jokgak-city-v1.mjs?v='+VERSION),import('/shared/jokgak-city-settings-v1.mjs?v='+VERSION)]).then(([city,settings])=>({...city,...settings}));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths={shield:'M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6ZM8 11l3 3 5-6',cross:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',medical:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6ZM5 3v2M19 19v2',person:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',bag:'M8 3h8l-2 4 6 7v6H4v-6l6-7ZM9 7h6M10 14h4',swords:'m4 2 8 8-3 3-7-7Zm16 0-8 8 3 3 7-7ZM5 11l-4 4m8 2-4 5m14-11 4 4m-8 2 4 5',bolt:'m13 2-9 12h7l-1 8 10-13h-7Z',store:'M3 9h18v12H3ZM2 9l3-6h14l3 6M8 21v-7h8v7M8 3 6 9m10-6 2 6',mail:'M2 5h20v15H2Zm0 0 10 8L22 5',market:'M3 10v11h18V10M2 10l3-7h14l3 7ZM8 3v7m8-7v7M8 21v-6h8v6',home:'m2 11 10-9 10 9M5 9v13h14V9M9 22v-8h6v8',warehouse:'M2 8 12 2l10 6v14H2ZM6 22V11h12v11M6 15h12M6 19h12',arrow:'M3 12h18m-7-7 7 7-7 7',target:'M12 3v4m0 10v4M3 12h4m10 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',clock:'M12 6v6l4 3M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',close:'m5 5 14 14M19 5 5 19',refresh:'M3 10a9 9 0 1 1 2 9M3 3v7h7',map:'m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3ZM8 2v17m8-14v17'};
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
  function css(){if(document.getElementById('jokgakStyle'))return;const link=document.createElement('link');link.id='jokgakStyle';link.rel='stylesheet';link.href='/css/jokgak-city-v1.css?v='+VERSION;document.head.append(link);}
  css();
  let C,root,state=null,selected='MARKET',selectedUser=null,cursor=0,pages=[0],busy=false,poll,clock,offset=0,seq=0,zoom=1,dialog=null,battleModal=null,lifecycle=null,fetchingKey=null;
  const pendingKey=()=>`jokgak:pending:${user()?.id||'preview'}`;
  const time=()=>Date.now()+offset;
  const role=code=>({...C.cityRole(code),...C.defaultCitySettings().roles.find(r=>r.code===code),...state?.roles?.find(r=>r.code===code)}),place=id=>C.cityPlace(id);
  const clockText=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');};
  const view=()=>'<section id="jokgakCity" class="jc" aria-label="족각도시"><div class="jc-loading" role="status">도시 전황을 불러오고 있습니다…</div></section>';
  function message(text,error=false){const node=root?.querySelector('[data-city-message]');if(node){node.textContent=text;node.hidden=!text;node.classList.toggle('is-error',error);}}
  function roleBadge(code,small=false){const r=role(code);return `<span class="jc-role${small?' small':''}" style="--role:${r.color}">${icon(r.icon)}<b>${r.name}</b></span>`;}
  function hp(value,max=100){return `<span class="jc-hp"><i style="width:${Math.max(0,Math.min(100,Number(value)/max*100))}%"></i></span>`;}
  function targetDisabled(target){const m=state?.mine;if(!m?.active)return '입장 후 가능';if(m.location!==selected)return '이동 후 가능';if(m.jailedUntil>time())return '구금 중';if(target.jailedUntil>time())return '상대 구금 중';if(m.nextActionAt>time())return '행동 대기';return '';}
  function render(){
    if(!root?.isConnected||!C)return;
    const scroll=root.querySelector('.jc-map-scroll'),listScroll=root.querySelector('.jc-people')?.scrollTop||0,mapScroll={left:scroll?.scrollLeft||0,top:scroll?.scrollTop||0};
    const mine=state?.mine,r=role(mine?.role),area=place(selected),people=state?.people||[],chosen=people.find(p=>p.userId===selectedUser);
    const active=mine?.active,here=active&&mine.location===selected;
    root.innerHTML=`<header class="jc-heading"><div class="jc-title"><span class="jc-index">PVP <i>07</i></span><div><p>도시의 판도가 바뀌는 시간</p><h1>족각도시<span>JOKGAK CITY</span></h1></div></div><div class="jc-shift">${icon('clock')}<div><small>다음 역할 교대 <span>KST</span></small><b data-city-shift>--:--:--</b></div><em>00 · 06 · 12 · 18시</em></div><button class="jc-icon-btn" data-city-rules aria-label="도시 규칙 보기">?</button></header>
      ${state?.mode==='TEST'?'<div class="jc-preview jc-test-mode"><b>TEST 운영</b> · 지정 참여자 검수 중 · 코인·아이템은 실제 지급되지 않습니다.</div>':''}${PREVIEW?'<div class="jc-preview">조작 시연 · 표시된 인원은 예시이며 실제 계정에 반영되지 않습니다.</div>':''}
      <div class="jc-status"><span class="jc-online"><i></i>${active?'도시 체류 중':'도시 입장 대기'}</span><span>${active?`${esc(mine.nickname)} <b>· ${esc(place(mine.location)?.name)}</b>`:'입장하면 다른 콘텐츠를 이용하는 동안에도 교전 대상이 됩니다.'}</span><div><button data-city-refresh>${icon('refresh')}새로고침</button><button data-city-rules>진행 방법</button>${active?'<button data-city-action="leave">도시 퇴장</button>':''}</div></div>
      <div class="jc-workspace"><section class="jc-map-panel" aria-label="도시 지도"><div class="jc-map-top"><span>${icon('map')}도시 전역 <b>8개 장소</b></span><span class="jc-map-hint">건물을 선택해 체류자를 확인하세요</span><div><button data-city-zoom="-" aria-label="지도 축소">−</button><b>${Math.round(zoom*100)}%</b><button data-city-zoom="+" aria-label="지도 확대">+</button></div></div>
        <div class="jc-map-scroll"><div class="jc-map" style="width:${zoom*100}%"><img class="jc-map-art" src="${ART}city-map-night-v1.webp" alt="경찰서와 병원, 백화점, 우체국, 시장, 주택, 항구와 뒷골목으로 이루어진 해안 도시" draggable="false"><svg class="jc-zones" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${C.CITY_PLACES.map(p=>`<polygon class="${p.id===selected?'selected':''} ${p.id===mine?.location&&active?'current':''}" points="${p.shape}" data-city-place="${p.id}"/>`).join('')}</svg>
        ${C.CITY_PLACES.map((p,i)=>`<button class="jc-pin ${p.id===selected?'selected':''} ${active&&p.id===mine.location?'current':''}" data-city-place="${p.id}" style="left:${p.labelX}%;top:${p.labelY}%" aria-pressed="${p.id===selected}">${active&&p.id===mine.location?'<small>현재 위치</small>':''}<span class="jc-pin-icon">${icon(p.icon)}</span><b>${p.name}</b><em>${String(i+1).padStart(2,'0')}</em></button>`).join('')}
        <span class="jc-compass"><b>N</b><i>⌖</i></span><div class="jc-map-coordinate">37° 33′ N <span>도시 관제망</span></div></div></div>
        <p class="jc-mobile-map-hint">← 지도를 좌우로 밀어 다른 장소를 확인하세요 →</p><div class="jc-map-footer"><span><i></i>선택한 장소 <b>${area.name}</b></span><span><i class="current"></i>내 위치 <b>${active?place(mine.location).name:'미입장'}</b></span><p>경찰의 검문 · 시민 간 교전 · 의료진의 치료</p></div>
        <section class="jc-identity" style="--role:${r.color}"><div class="jc-identity-icon">${icon(active?r.icon:'person')}</div><div class="jc-identity-copy"><small>이번 교대의 나</small><h2>${active?r.name:'오늘, 당신의 역할은?'}</h2><p>${active?r.detail:'입장 시 역할이 무작위 배정됩니다. 교대 시각까지 같은 역할로 활동합니다.'}</p></div>${active?`<div class="jc-vitals"><div><span>도시 체력</span><b>${mine.health}<small> / ${mine.maxHealth||100}</small></b></div>${hp(mine.health,mine.maxHealth||100)}<p>수배 ${'★'.repeat(mine.wanted)}${'☆'.repeat(5-mine.wanted)} <span data-city-action-clock></span></p></div>`:'<button class="jc-primary" data-city-action="join">도시 입장'+icon('arrow')+'</button>'}</section>
      </section>
      <aside class="jc-intel" aria-label="선택한 장소와 체류자"><div class="jc-location-cover" style="--crop-x:${area.x}%;--crop-y:${area.y}%"><span>${area.district}</span><div>${icon(area.icon)}<h2>${area.name}</h2><b>${C.CITY_PLACES.indexOf(area)+1<10?'0':''}${C.CITY_PLACES.indexOf(area)+1}</b></div></div><div class="jc-location-body"><p>${area.detail}</p><button class="${here?'jc-here':'jc-primary'}" data-city-action="move" ${!active||here||busy?'disabled':''}>${here?'현재 머무르는 장소':'이곳으로 이동'}${icon(here?'target':'arrow')}</button></div>
      <div class="jc-people-heading"><h3>이곳의 체류자 <b>${people.length}${state?.nextCursor?'+':''}</b></h3><span>최대 10명씩</span></div>
      <div class="jc-people" role="list">${people.length?people.map((p,i)=>{const pr=role(p.role),self=p.userId===mine?.userId;return `<button role="listitem" class="jc-person ${p.userId===selectedUser?'selected':''}" data-city-person="${p.userId}" style="--role:${pr.color}" aria-label="${esc(p.nickname)}, ${pr.name}${self?', 나':''}"><span class="jc-person-number">${String(i+1).padStart(2,'0')}</span><span class="jc-person-icon">${icon(pr.icon)}</span><span class="jc-person-copy"><b>${esc(p.nickname)}${self?'<em>나</em>':''}</b><small>${pr.name}<i>·</i>${p.jailedUntil>time()?'구금 중':p.protectedUntil>time()?'교전 보호 중':p.wanted?'수배 중':'체류 중'}</small>${hp(p.health,p.maxHealth||100)}</span><span class="jc-person-health">${p.health}<small>HP</small></span></button>`;}).join(''):'<div class="jc-empty">'+icon('person')+'<b>아직 체류자가 없습니다.</b><p>다른 장소를 확인해 보세요.</p></div>'}</div>
      <div class="jc-pagination"><button data-city-page="prev" ${pages.length<2?'disabled':''}>← 이전</button><span>${pages.length} 페이지</span><button data-city-page="next" ${!state?.nextCursor?'disabled':''}>다음 →</button></div>
      <section class="jc-target">${chosen?targetPanel(chosen):'<small>교전 대상</small><h3>체류자를 선택하세요.</h3><p>현재 장소의 상대에게 공격하거나<br>역할에 맞는 행동을 할 수 있습니다.</p>'}</section></aside></div>
      <div data-city-message class="jc-message" role="status" hidden></div><footer class="jc-footnote"><span>일반 카드 5장 + PVP 용병 · 기존 PVP 편성 사용</span><button data-city-deck>편성 확인 ↗</button><button data-city-pending ${storage.get(pendingKey())?'':'hidden'}>처리 중인 요청 확인</button></footer>`;
    const map=root.querySelector('.jc-map-scroll');if(map){map.scrollLeft=mapScroll.left;map.scrollTop=mapScroll.top;}const list=root.querySelector('.jc-people');if(list)list.scrollTop=listScroll;
    tick();
  }
  function targetPanel(target){
    const self=target.userId===state?.mine?.userId,disabled=targetDisabled(target),m=state?.mine,heal=['NURSE','DOCTOR'].includes(m?.role),police=m?.role==='POLICE',r=role(m?.role);
    return `<div class="jc-target-name"><div><small>${self?'내 상태':'선택한 대상'}</small><h3>${esc(target.nickname)}</h3></div>${roleBadge(target.role,true)}</div><div class="jc-target-actions"><button class="jc-danger" data-city-action="attack" ${busy||disabled||self||!r.attackEnabled||target.health<=0||m?.health<=0||target.protectedUntil>time()?'disabled':''}>${icon('swords')}${disabled||'공격'}</button>${police?`<button data-city-action="inspect" ${busy||disabled||self||!r.inspectEnabled?'disabled':''}>검문</button><button data-city-action="arrest" ${busy||disabled||self||!r.arrestEnabled||target.wanted<r.arrestMinWanted||target.health<=0||m.health<=0||target.protectedUntil>time()?'disabled':''}>체포</button>`:heal?`<button class="jc-heal" data-city-action="heal" ${busy||disabled||!r.healAmount||(self&&!r.selfHeal)||target.health>=(target.maxHealth||100)?'disabled':''}>${icon('cross')}치료 +${r.healAmount}</button>`:''}</div><p>${esc(police?`수배 ${r.arrestMinWanted} 이상 체포 · 성공 시 ${r.arrestMs/1000}초 구금`:heal?`치료 ${r.healAmount} · 대기 ${r.healCooldownMs/1000}초`:`승리 시 도시 피해 ${r.defeatDamage} · 선제공격 수배 +${r.wantedPerAttack}`)}</p>`;
  }
  function tick(){
    if(!root?.isConnected){stop();return;}
    const shift=root.querySelector('[data-city-shift]');if(shift&&state)shift.textContent=clockText(state.shift.endsAt-time());
    const wait=root.querySelector('[data-city-action-clock]');if(wait)wait.textContent=state.mine.jailedUntil>time()?'구금 '+clockText(state.mine.jailedUntil-time()):state.mine.nextActionAt>time()?'대기 '+Math.ceil((state.mine.nextActionAt-time())/1000)+'초':'행동 가능';
    if(state&&state.shift.endsAt<=time()&&!busy)void refresh();
  }
  async function refresh(){
    clearTimeout(poll);if(!root?.isConnected||busy)return;
    const key=selected+':'+cursor;if(fetchingKey===key)return;fetchingKey=key;
    const requestSeq=++seq;
    try{const value=await api(`status?location=${selected}&after=${cursor}`);if(requestSeq!==seq||!root?.isConnected)return;state=value;offset=value.serverNow-Date.now();if(!value.people.some(p=>p.userId===selectedUser))selectedUser=null;render();}
    catch(error){if(requestSeq===seq){if(!state||[401,403].includes(error.status)){state=null;root.innerHTML=`<div class="jc-load-error"><h1>족각도시</h1><p>${esc(error.message)}</p><button data-city-refresh>다시 확인</button></div>`;}else message(error.message,true);}}
    finally{if(requestSeq===seq){fetchingKey=null;if(root?.isConnected)poll=setTimeout(refresh,document.hidden?30000:10000);}}
  }
  function closeDialog(){dialog?.close();dialog?.remove();dialog=null;}
  function showDialog(title,body,buttons='<button data-city-dialog-close>확인</button>'){
    closeDialog();dialog=document.createElement('dialog');dialog.className='jc-dialog';dialog.innerHTML=`<header><h2>${esc(title)}</h2><button data-city-dialog-close aria-label="닫기">${icon('close')}</button></header><div class="jc-dialog-body">${body}</div><footer>${buttons}</footer>`;document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target.closest('[data-city-dialog-close]'))closeDialog();});const ownDialog=dialog;dialog.addEventListener('close',()=>{ownDialog.remove();if(dialog===ownDialog)dialog=null;},{once:true});dialog.showModal();return dialog;
  }
  function rewardHtml(reward){
    if(!reward||reward.status==='NONE')return '';
    const messages={DISABLED:'보상 사용 안 함',EMPTY:'설정된 보상 없음',DAILY_LIMIT:'오늘의 보상 횟수를 모두 사용했습니다.',TARGET_COOLDOWN:'같은 상대 보상 대기 중입니다.'};
    if(messages[reward.status])return `<p class="jc-muted">${messages[reward.status]}</p>`;
    return `<div class="jc-reward"><b>${reward.paid?'획득 보상':'TEST 보상 미리보기 · 실제 지급 없음'}</b><p>${[reward.coin?`코인 ${money(reward.coin)}`:'',...(reward.items||[]).map(item=>`${esc(item.name)} × ${money(item.quantity)}`)].filter(Boolean).join(' · ')}</p><small>오늘 남은 보상 ${reward.remaining}회</small></div>`;
  }
  async function refreshRewardAccount(result,accountId){
    if(PREVIEW||!result.reward?.paid||typeof apiRequest!=='function'||typeof mergeApiUserSummary!=='function'||typeof saveUser!=='function')return;
    if(Number(user()?.serverUserId||user()?.id)!==accountId)return;
    const epoch=typeof PLAYER_STATE_MUTATION_EPOCH==='number'?++PLAYER_STATE_MUTATION_EPOCH:null;
    for(const key of ['me','me/summary','shell/summary','inventory']){if(typeof clearApiCache==='function')clearApiCache(key);if(typeof API_INFLIGHT!=='undefined')API_INFLIGHT.delete(key);}
    try{
      const fresh=await apiRequest('me/summary',{}, {ttl:0,timeoutMs:12000});
      if(Number(user()?.serverUserId||user()?.id)!==accountId||Number(fresh.user?.id)!==accountId||epoch!==null&&epoch!==PLAYER_STATE_MUTATION_EPOCH)return;
      saveUser(mergeApiUserSummary(fresh.user),{source:'jokgak-city'});
    }catch{}
  }
  function rules(){const mine=role(state?.mine?.role),common=state?.rules||C.CITY_RULES;showDialog('족각도시 진행 방법',`<ol class="jc-guide"><li><b>장소 선택 → 이동 → 대상 선택</b><p>건물을 누르면 체류자가 최대 10명씩 표시됩니다. 같은 장소에 있어야 공격·검문·치료할 수 있습니다.</p></li><li><b>6시간마다 역할 무작위 배정</b><p>한국시간 00·06·12·18시에 교대합니다. 입·퇴장으로 다시 뽑을 수 없으며 같은 역할이 다시 나올 수도 있습니다. 배정 비중 변경은 다음 교대부터 적용됩니다.</p></li><li><b>현재 PVP 편성으로 교전</b><p>일반 카드 5장과 PVP 용병·장비·마법·펫을 사용합니다. 도시 체력이 0이면 회복 후 교전할 수 있습니다. 도시 피해와 회복량은 아래 역할 안내를 확인하세요.</p></li><li><b>경찰과 의료진</b><p>경찰은 검문으로 상대 편성을 확인하고 수배자에게 체포 전투를 걸 수 있습니다. 의료진은 같은 장소의 도시 체력을 회복합니다. 세부 사용 여부와 수치는 현재 역할 설정을 따릅니다.</p></li><li><b>다른 콘텐츠에서도 피격 알림</b><p>도시 체류 중에는 다른 콘텐츠에서도 방어 교전과 팝업 알림이 이어집니다. 도시 퇴장 후 재입장은 ${common.rejoinCooldownMs/1000}초 대기합니다.</p></li><li><b>역할별 보상</b><p>${state?.mode==='TEST'?'현재 TEST 운영으로 실제 코인·아이템은 지급하지 않습니다.':state?.rewardRules?.enabled?'설정된 행동 보상은 결과 확정 시 지급합니다.':'현재 보상 사용이 꺼져 있습니다.'} 일일 보상 횟수는 ${state?.rewardRules?.dailyLimit??20}회, 같은 상대 보상 대기는 ${(state?.rewardRules?.sameTargetCooldownMs??3600000)/1000}초입니다. 자기 치료에는 보상이 없습니다.</p></li></ol><div class="jc-role-guide">${(state?.roles||C.CITY_ROLES).map(r=>`<div>${roleBadge(r.code,true)}<p>${esc(r.detail)}</p></div>`).join('')}</div><p class="jc-muted">도시 체력·수배·구금은 역할 교대 때 초기화됩니다.</p>`);}

  async function action(kind,retry=false){
    if(busy||!state)return;
    const old=storage.get(pendingKey());
    if(old&&!retry){showDialog('처리 상태 확인',`<p>앞선 요청의 결과를 먼저 확인해야 합니다. 같은 요청 번호로 확인하여 중복 처리하지 않습니다.</p>`,'<button data-city-retry>요청 확인</button>');dialog.querySelector('[data-city-retry]').onclick=()=>{closeDialog();void action(old.kind,true);};return;}
    const target=state.people.find(p=>p.userId===selectedUser);
    if(kind==='join'&&!retry){const d=showDialog('족각도시에 입장',`<p>현재 PVP 편성으로 도시의 교전에 참여합니다.</p>${state.mode==='TEST'?'<p><b>TEST 운영 · 실제 보상 미지급</b></p>':''}<p>다른 콘텐츠를 이용하는 동안에도 이곳에서 공격받을 수 있습니다. 체류는 <b>도시 퇴장</b>을 누를 때 끝납니다.</p>`,'<button data-city-dialog-close>돌아가기</button><button class="jc-primary" data-city-confirm>입장</button>');d.querySelector('[data-city-confirm]').onclick=()=>{closeDialog();void submit(kind,{requestId:crypto.randomUUID(),epoch:state.shift.id});};return;}
    const body=retry?old.body:{requestId:crypto.randomUUID(),epoch:state.shift.id,...(kind==='move'?{location:selected}:{}),...(['attack','arrest','heal','inspect'].includes(kind)?{targetId:target?.userId}:{})};
    await submit(kind,body);
  }
  async function submit(kind,body){
    const submittedRoot=root,submissionKey=pendingKey(),accountId=Number(user()?.serverUserId||user()?.id);
    busy=true;clearTimeout(poll);++seq;fetchingKey=null;storage.set(submissionKey,{kind,body});render();message(['attack','arrest'].includes(kind)?'양쪽 PVP 편성과 전투 결과를 확인하고 있습니다…':'도시 행동을 처리하고 있습니다…');
    try{
      const result=await api(kind,body);storage.set(submissionKey,null);void refreshRewardAccount(result,accountId);
      if(root!==submittedRoot||!submittedRoot?.isConnected)return;
      if(result.battleV2)await playBattle(result);
      else if(result.inspection){const i=result.inspection;showDialog('검문 결과',`<h3>${esc(i.nickname)} · ${role(i.role).name}</h3><p>수배 ${i.wanted} · 카드 전투력 ${money(i.cardPower)}</p><ul class="jc-inspection">${i.cards.map(c=>`<li><b>${esc(c.rarity)}</b><span>${esc(c.name)} ${esc(c.title)}</span></li>`).join('')}</ul>${rewardHtml(result.reward)}`);}
      else if(kind==='heal'&&['PAID','TEST_PREVIEW'].includes(result.reward?.status)){showDialog('치료 완료',`<p>도시 체력 ${result.effects?.healed||0} 회복</p>${rewardHtml(result.reward)}`);}
      else if(kind==='join'||kind==='move'){selected=result.mine.location;cursor=0;pages=[0];}
      if(kind==='join'){storage.set('jokgak:poll-after:'+user()?.id,0);notifyPollSoon();}
    }catch(error){
      if([400,401,403,409,429].includes(error.status))storage.set(submissionKey,null);
      if(root===submittedRoot&&submittedRoot?.isConnected)showDialog('행동 확인',`<p>${esc(error.message||'응답을 받지 못했습니다. 처리 중인 요청 확인을 눌러 주세요.')}</p>`);
    }finally{if(root===submittedRoot){busy=false;await refresh();}}
  }
  async function playBattle(data){
    if(PREVIEW&&window.CityPreview?.playBattle)return window.CityPreview.playBattle(data);
    const ownerRoot=root;await ensureFeatureResources('battleV2');if(root!==ownerRoot||!ownerRoot?.isConnected)return;
    const ownModal=document.createElement('div');battleModal=ownModal;ownModal.className='jc-battle';document.body.append(ownModal);
    const loading=prepareBattleV2LiveLoading({modal:ownModal,mode:'PVP',playerName:data.attackerNickname,opponentName:data.defenderNickname,autoText:'족각도시 · '+place(data.location).name});
    loading.stage.querySelector('.battle-v3-header strong').textContent='족각도시 · '+place(data.location).name;
    loading.stage.querySelector('.battle-v3-header small').textContent='JOKGAK CITY · 교전';
    loading.host.style.backgroundImage=`linear-gradient(#07101b33,#07101b66),url('${ART}city-street-battle-v1.webp')`;
    try{await playPvpBattleV2Live({...loading,modal:ownModal,data});if(!ownModal.isConnected)return;await new Promise(resolve=>{const result=document.createElement('div');result.className='jc-battle-result';const outcome=data.result==='WIN'?'교전 승리':data.result==='DRAW'?'교전 무승부':'교전 패배';result.innerHTML=`<section><small>족각도시 · ${esc(place(data.location).name)}</small><h2>${outcome}</h2><p>${data.action==='arrest'&&data.result==='WIN'?`체포 성공 · 상대 ${(data.effects?.jailMs??60000)/1000}초 구금`:data.result==='WIN'?`상대 도시 체력 −${data.effects?.damageToTarget??25}`:data.result==='LOSE'?`내 도시 체력 −${data.effects?.damageToMine??25}`:'도시 체력 유지'}</p>${rewardHtml(data.reward)}<button class="jc-primary">도시로 돌아가기 ${icon('arrow')}</button></section>`;ownModal.append(result);result.querySelector('button').onclick=resolve;result.querySelector('button').focus();ownModal.cityFinish=resolve;});}
    catch(error){if(ownModal.isConnected)showDialog('전투 기록은 저장되었습니다',`<p>화면 재생을 완료하지 못했습니다. 승패와 도시 상태는 서버에 저장되어 있습니다.</p><p>${esc(error.message)}</p>`);}
    finally{ownModal.__battleV2Renderer?.destroy?.();ownModal.remove();if(battleModal===ownModal)battleModal=null;}
  }
  function stop(){seq++;fetchingKey=null;lifecycle?.abort();lifecycle=null;clearTimeout(poll);clearInterval(clock);poll=clock=null;root=null;if(battleModal){battleModal.cityFinish?.();battleModal.__battleV2Renderer?.destroy?.();battleModal.remove();battleModal=null;}}
  async function bind(){
    stop();root=document.getElementById('jokgakCity');if(!root)return;const mounted=root;C=await config;if(root!==mounted)return;state=null;selected='MARKET';cursor=0;pages=[0];selectedUser=null;busy=false;lifecycle=new AbortController();
    root.addEventListener('click',e=>{
      const placeButton=e.target.closest('[data-city-place]');if(placeButton){selected=placeButton.dataset.cityPlace;selectedUser=null;cursor=0;pages=[0];void refresh();return;}
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.cityPerson){selectedUser=Number(b.dataset.cityPerson);render();root.querySelector('.jc-target')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
      else if(b.hasAttribute('data-city-refresh'))void refresh();
      else if(b.hasAttribute('data-city-rules'))rules();
      else if(b.dataset.cityAction)void action(b.dataset.cityAction);
      else if(b.hasAttribute('data-city-pending')){const pending=storage.get(pendingKey());if(pending)void action(pending.kind,true);}
      else if(b.dataset.cityZoom){zoom=Math.max(1,Math.min(1.75,zoom+(b.dataset.cityZoom==='+'?.25:-.25)));render();}
      else if(b.dataset.cityPage){if(b.dataset.cityPage==='next'&&state?.nextCursor){cursor=state.nextCursor;pages.push(cursor);}else if(pages.length>1){pages.pop();cursor=pages.at(-1);}void refresh();}
      else if(b.hasAttribute('data-city-deck')){if(PREVIEW)showDialog('PVP 편성 연결','<p>운영 화면에서는 현재 PVP 덱 편성실로 이동합니다.</p>');else renderShell('pvp');}
    },{signal:lifecycle.signal});
    render();clock=setInterval(tick,1000);await refresh();
  }
  // Non-modal notifications stay above other content without touching its timers,
  // battle renderer, selected route, focus or settlement lifecycle.
  let notifyTimer,notifying=false,notice=null,noticeUserId=null;
  const seenKey=id=>'jokgak:seen:'+id;
  async function showNotice(item){
    C||=await config;if(notice)return false;noticeUserId=user()?.id||null;
    notice=document.createElement('aside');notice.className='jc-dispatch';notice.setAttribute('role','alertdialog');notice.setAttribute('aria-label','족각도시 피격 및 행동 알림');notice.setAttribute('aria-modal','false');
    const attack=['attack','arrest'].includes(item.action),title=attack?'도시에서 공격받았습니다':item.action==='heal'?'치료를 받았습니다':'검문을 받았습니다';
    notice.innerHTML=`<div class="jc-dispatch-stripe"></div><header><span>${icon(attack?'swords':'cross')}족각도시 · ${esc(place(item.location)?.name||'도시')}</span><button data-notice-dismiss aria-label="나중에">${icon('close')}</button></header><h2>${title}</h2><p><b>${esc(item.actorName)}</b> 님이 ${attack?'교전을 걸었습니다.':item.action==='heal'?'도시 체력을 회복했습니다.':'PVP 카드 편성을 확인했습니다.'}</p><div class="jc-dispatch-bottom"><span>도시 체력 <b>${item.health} / ${item.maxHealth||100}</b></span><button data-notice-record>기록 보기 →</button></div>`;
    document.body.append(notice);
    const dismiss=async()=>{notice?.remove();notice=null;if(!PREVIEW)try{await api('ack',{ids:[item.id]});}catch{};};
    notice.querySelector('[data-notice-dismiss]').onclick=dismiss;
    notice.querySelector('[data-notice-record]').onclick=async()=>{await dismiss();const outcome=item.winner==='A'?'방어 패배':item.winner==='B'?'방어 승리':item.winner==='DRAW'?'무승부':'';showDialog('족각도시 행동 기록',`<p>${esc(item.actorName)} · ${esc(place(item.location)?.name||'도시')}</p><h3>${outcome||title}</h3><p>현재 행동 이후 도시 체력 ${item.health} / ${item.maxHealth||100}</p>${item.jailedUntil>time()?`<p>체포되어 경찰서에 ${(item.jailMs??60000)/1000}초간 구금되었습니다.</p>`:''}<p>진행 중인 다른 콘텐츠는 계속 이용할 수 있습니다.</p>`);};
    return true;
  }
  function notifyPollSoon(){clearTimeout(notifyTimer);notifyTimer=setTimeout(pollNotices,1000);}
  async function pollNotices(){
    clearTimeout(notifyTimer);if(PREVIEW)return;let delay=60000;
    if(notice&&noticeUserId!==user()?.id){notice.remove();notice=null;}
    if(!document.hidden&&!notifying&&user()?.id){
      notifying=true;const uid=user().id;
      try{
        const read=async()=>{
          const leaseKey='jokgak:poll-after:'+uid,until=Number(storage.get(leaseKey)||0);
          if(until>Date.now()){delay=Math.min(8000,until-Date.now());return;}
          storage.set(leaseKey,Date.now()+12000);
          const result=await api('notifications');if(user()?.id!==uid)return;delay=result.active?8000:60000;storage.set(leaseKey,Date.now()+delay);
          const seen=storage.get(seenKey(uid))||[],alreadyShown=result.items.filter(item=>seen.includes(item.id)).map(item=>item.id);
          if(alreadyShown.length)await api('ack',{ids:alreadyShown});
          if(!notice){const next=result.items.find(item=>!seen.includes(item.id));if(next&&await showNotice(next)){storage.set(seenKey(uid),[...seen,next.id].slice(-100));await api('ack',{ids:[next.id]});}}
        };
        if(navigator.locks)await navigator.locks.request('jokgak-notices:'+uid,{ifAvailable:true},async lock=>{if(lock)await read();else delay=8000;});else await read();
      }catch{}finally{notifying=false;}
    }
    notifyTimer=setTimeout(pollNotices,delay+Math.random()*1000);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)notifyPollSoon();});
  window.addEventListener('storage',event=>{if(event.key==='cnine_card_user_v10')notifyPollSoon();});
  window.addEventListener('cnine:route-will-change',stop);
  window.JokgakCity=Object.freeze({view,bind,stop,showNotice});
  if(!PREVIEW)notifyPollSoon();
})();
