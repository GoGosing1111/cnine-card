const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('ko-KR');
const date=v=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'';
const PHASE={INVITED:'초대 수락 대기',SETUP:'대여 편성 중',READY:'전투 준비 완료',FIGHTING:'승부를 진행하는 중',COMPLETED:'경기 종료',DECLINED:'초대 거절',CANCELLED:'운영자 취소',EXPIRED:'초대 만료'};

const btn=(action,label,primary=false,attrs='')=>`<button type="button" class="cn-ui-button${primary?' primary':''}" data-classic="${action}" ${attrs}>${label}</button>`;
function style(){if(document.querySelector('[data-classic-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/classic-colosseum-v1.css?v=20261027-v2';link.dataset.classicStyle='1';document.head.append(link);}
function paper(article,compact=false){return `<article class="classic-paper${compact?' compact':''}"><div class="classic-paper-mast">콜로세움 일보</div><div class="classic-paper-dateline"><span>CLASSIC COLOSSEUM</span><time>${esc(date(article.publishedAt))}</time></div><h2>${esc(article.title)}</h2><p class="classic-paper-quote">“${esc(article.taunt)}”</p><p>${esc(article.body)}</p><footer><b>승리 ${esc(article.winnerName)}</b><span>패배 ${esc(article.loserName)}</span></footer></article>`;}
function dialog(html){
 style();const el=document.createElement('dialog');el.className='classic-dialog cn-command-ui';el.innerHTML=html;document.body.append(el);el.showModal();el.addEventListener('close',()=>el.remove(),{once:true});return el;
}
export async function showClassicNotifications({data,api,navigate}){
 if(document.hidden||document.querySelector('.classic-dialog[open],#modal.show,.battle-running'))return;
 const result=data.results?.[0],invite=data.invitation;
 if(result){
  const el=dialog(`<div class="classic-popup"><p class="classic-eyebrow">${result.loss?'DEFEAT · 긴급 속보':'VICTORY · 경기 결과'}</p><h1>${result.loss?'오늘의 1면은 당신입니다':'콜로세움의 승자가 되었습니다'}</h1>${paper(result.article,true)}<div class="classic-actions">${btn('news','일보 보기',true)}${btn('close',result.loss?'다음에는 내가 이긴다':'확인')}</div><p data-error role="alert"></p></div>`);
  let acknowledging=false;const acknowledge=async(go=false)=>{if(acknowledging)return;acknowledging=true;try{await api('classic-colosseum/ack',{method:'POST',body:{matchId:result.matchId}});el.close();if(go)navigate();}catch(error){el.querySelector('[data-error]').textContent=error.message;acknowledging=false;}};
  el.onclick=e=>{const action=e.target.closest('[data-classic]')?.dataset.classic;if(action==='close'||action==='news')void acknowledge(action==='news');};el.oncancel=e=>{e.preventDefault();void acknowledge();};return;
 }
 if(!invite)return;
 const el=dialog(`<div class="classic-popup classic-invitation"><p class="classic-eyebrow">THE CHALLENGE</p><h1>클래식 멸망전 초대</h1><p><b>${esc(invite.operatorName)}</b> 운영자가 당신을 초대했습니다.</p><div class="classic-invite-versus"><span>당신</span><strong>VS</strong><span>${esc(invite.opponentName)}</span></div><p>제니스까지 · 전부 +10 대여<br>장비·용병 없음 · 마법카드 사용 가능</p><small>${esc(date(invite.expiresAt))}까지 수락 가능</small><div class="classic-actions">${btn('accept','초대 수락',true)}${btn('decline','초대 거절')}${btn('later','나중에')}</div><p data-error role="alert"></p></div>`);
 let busy=false;el.onclick=async e=>{
  const action=e.target.closest('[data-classic]')?.dataset.classic;if(!action||busy)return;if(action==='later'){el.close();return;}
  busy=true;el.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const state=await api('classic-colosseum/status');if(state.room?.id!==invite.matchId||state.room?.status!=='INVITED')throw new Error('이미 응답했거나 만료된 초대입니다. 대전실에서 확인하세요.');await api('classic-colosseum/'+action,{method:'POST',body:{matchId:invite.matchId,revision:state.room.revision}});el.close();if(action==='accept')navigate();}
  catch(error){el.querySelector('[data-error]').textContent=error.message;busy=false;el.querySelectorAll('button').forEach(b=>b.disabled=false);}
 };
}
export async function mountClassicColosseum({root,api,ensureBattle}){
 style();let state=null,catalog=null,tab='room',busy=false,roomTimer=null,renderer=null,battleOpen=false,draft=null,draftRoomId=null,dirty=false,filter='',grade='',category='cards',newsPage=0,news=null,admin=null,searchResults=[],chosen=[null,null],inviteRequest=null;
 const call=(path,options={})=>api('classic-colosseum/'+path,options),adminCall=(path,options={})=>api('admin/classic-colosseum/'+path,options);
 const message=(text,error=false)=>{const el=root.querySelector('[data-classic-message]');if(el){el.textContent=text;el.classList.toggle('error',error);if(error)el.scrollIntoView({block:'nearest'});}};
 const own=()=>state?.room?.players.find(p=>p.id===state.user.id);
 const active=()=>root.isConnected;
 const post=(action,extra={})=>call(action,{method:'POST',body:{matchId:state.room.id,revision:state.room.revision,...extra}});
 function syncDraft(){if(draftRoomId!==state.room?.id||!dirty){draftRoomId=state.room?.id;draft=structuredClone(own()?.loadout||{cardIds:[],magicCardIds:[]});dirty=false;}}
 const art=path=>String(path||'').startsWith('/')?path:'/'+String(path||'');
 function draw(){
  if(!active()||!state)return;
  root.className='classic-colosseum cn-command-ui';
  root.innerHTML=`<header class="classic-hero"><div class="classic-hero-shade"></div><div class="classic-hero-copy"><p class="classic-eyebrow">CLASSIC COLOSSEUM · 1 VS 1</p><h1>클래식 <em>멸망전</em></h1><p>승부는 전략으로.<br>패배는 기사로.</p><span class="classic-operation ${state.settings.enabled?'on':''}"><i></i>운영 ${state.settings.enabled?'ON':'OFF'}</span></div><div class="classic-rental-seal"><small>모두 같은 조건</small><strong>+10</strong><span>전용 대여</span></div></header><nav class="classic-tabs" aria-label="클래식 멸망전 메뉴">${[['room','대전실'],['rental','대여 편성'],['news','콜로세움 일보'],...(state.user.canManage?[['admin','운영자 관리']]:[])].map(([id,label])=>btn('tab',esc(label),id===tab,`data-tab="${id}" aria-current="${id===tab?'page':'false'}"`)).join('')}</nav><p class="classic-message" data-classic-message role="status"></p><div data-classic-content></div>`;
  const content=root.querySelector('[data-classic-content]');
  if(tab==='room')content.innerHTML=roomView();
  if(tab==='rental')content.innerHTML=rentalView();
  if(tab==='news')content.innerHTML=newsView();
  if(tab==='admin')content.innerHTML=adminView();
  root.setAttribute('aria-busy',String(busy));
 }
 function roomView(){
  const room=state.room,me=own(),ongoing=room&&['INVITED','SETUP','READY','FIGHTING'].includes(room.status);
  const playerSeat=i=>{
   const player=room?.players[i],status=player?(player.ready?'편성 확정':player.accepted?'입장 완료':'초대 수락 대기'):'도전자를 기다립니다';
   return `<article class="classic-seat ${i?'is-crimson':'is-jade'} ${player?'is-occupied':''}"><span class="classic-seat-number">CHALLENGER ${i?'II':'I'}</span><div class="classic-seat-emblem"><img src="/assets/ui/classic-colosseum/20261027/duel-crest.svg" alt=""><span class="classic-seat-spark"></span>${player?`<b class="classic-seat-initial">${esc(Array.from(player.nickname)[0])}</b>`:''}</div><div class="classic-seat-name"><small>${i?'CRIMSON SIDE':'JADE SIDE'}</small><h3>${esc(player?.nickname||(i?'두 번째 도전자':'첫 번째 도전자'))}</h3></div><span class="classic-seat-status ${player?.ready?'is-ready':''}"><i></i>${status}</span><div class="classic-deck-fan" aria-label="카드 5장 · 전부 +10 대여">${Array.from({length:5},(_,n)=>`<span class="classic-deck-back" style="--fan:${n-2};--lift:${Math.abs(n-2)}"><img src="/assets/ui/classic-colosseum/20261027/card-back.svg" alt="">${n===2?'<b>+10</b>':''}</span>`).join('')}</div><span class="classic-seat-deck">${player?.hasLoadout?'RENTAL DECK · 편성 완료':'RENTAL DECK · 동일한 기회'}</span></article>`;
  };
  return `<div class="classic-room-grid"><section class="cn-ui-panel classic-match classic-match-v2"><header><div><p class="classic-eyebrow">THE COLOSSEUM · MATCH ROOM</p><h2>${room?PHASE[room.status]:'두 명의 전략가, 하나의 승부'}</h2></div>${btn('refresh','새로고침')}</header><div class="classic-duel-arena"><div class="classic-duel-backdrop"></div><span class="classic-duel-topline">EQUAL CARDS. UNEQUAL STRATEGY.</span>${playerSeat(0)}<div class="classic-duel-vs" aria-hidden="true"><span>CLASSIC</span><b>VS</b><i></i><small>오직 전략으로</small></div>${playerSeat(1)}<div class="classic-duel-bottomline"><span>5 CARDS</span><i></i><b>ALL +10</b><i></i><span>1 WINNER</span></div></div><div class="classic-match-footer">${!room?`<div class="classic-waiting-copy"><strong>도전장은 운영자가 보냅니다.</strong><p>초대를 수락하고, 승부를 결정할 다섯 장을 고르세요.</p></div>${state.user.canManage?btn('tab','참가자 초대하기',true,'data-tab="admin"'):btn('edit','대여 카드 둘러보기',true)}`:`<div class="classic-match-progress"><span>${ongoing?'참가 준비 마감':'COLOSSEUM RECORD'}</span><b>${ongoing?esc(date(room.expiresAt)):'승부의 기록은 계속 남습니다.'}</b></div><div class="classic-actions">${room.status==='INVITED'&&!me?.accepted?btn('accept','초대 수락',true)+btn('decline','초대 거절'):''}${room.status==='INVITED'&&me?.accepted?'<b>상대방의 수락을 기다리고 있습니다.</b>':''}${room.status==='SETUP'?btn('edit','대여 편성',true)+btn('ready',me?.ready?'준비 완료 · 상대 대기':'편성 확정 · 준비',false,!me?.loadout||me?.ready?'disabled':''):''}${['READY','FIGHTING'].includes(room.status)?btn('recover','전투 진행 확인',true):''}${room.status==='COMPLETED'?btn('replay','전투 보기',true):''}</div>`}</div></section><aside class="classic-rules cn-ui-panel"><p class="classic-eyebrow">EQUAL CONDITIONS</p><h2>순수 전략전</h2><ol><li><b>카드 5장</b><span>제니스 등급까지<br>FUR · 슈퍼스타 · 아이콘 제외</span></li><li><b>전부 +10 대여</b><span>카드 · 마법카드<br>대여품은 경기 안에서만 사용</span></li><li><b>선택과 배치의 승부</b><span>장비 · 용병 · 펫 · 배틀슈트 없음<br>개인 성장 보너스 제외</span></li><li><b>패자는 오늘의 1면</b><span>콜로세움 일보와<br>패배자 전용 팝업에 기록</span></li></ol><p>행동력·재화 소모와 별도 보상 없음</p></aside></div>${room?.article?paper(room.article):''}`;
 }
 function rentalView(){
  if(!catalog)return '<div class="cn-ui-panel classic-empty">대여 목록을 불러오는 중입니다.</div>';
  const editable=state.room?.status==='SETUP'&&own()?.accepted,selected=draft?.[category==='cards'?'cardIds':'magicCardIds']||[];
  let rows=catalog[category]||[];rows=rows.filter(c=>(!filter||(c.title+' '+c.name+' '+c.id).toLowerCase().includes(filter.toLowerCase()))&&(!grade||category!=='cards'||c.rarity===grade));
  return `<section class="classic-rental cn-ui-panel"><header><div><p class="classic-eyebrow">RENTAL LOADOUT</p><h2>누구에게나 같은 조건</h2><p>카드 위치 1·2는 전열, 3·4·5는 후열입니다.</p></div><span class="classic-count">${draft.cardIds.length} / 5</span></header><div class="classic-selected">${Array.from({length:5},(_,i)=>{const c=catalog.cards.find(c=>String(c.id)===String(draft.cardIds[i]));return `<article><small>${i<2?'전열':'후열'} ${i+1}</small>${c?`<img src="${esc(art(c.image))}" alt="${esc(c.title)}"><b>${esc(c.name||c.title)}</b><span>+10</span><div>${btn('move','←',false,`data-index="${i}" data-direction="-1" aria-label="카드 앞으로 이동" ${!editable||i===0?'disabled':''}`)}${btn('remove','빼기',false,`data-index="${i}" ${!editable?'disabled':''}`)}${btn('move','→',false,`data-index="${i}" data-direction="1" aria-label="카드 뒤로 이동" ${!editable||i===draft.cardIds.length-1?'disabled':''}`)}</div>`:'<div class="classic-slot-empty">+</div>'}</article>`;}).join('')}</div><div class="classic-rental-summary"><span>마법카드 ${draft.magicCardIds.length}/5 · 장비 사용 없음</span><b>${dirty?'저장하지 않은 편성':own()?.loadout?'저장된 편성':'편성을 선택하세요'}</b></div><div class="classic-actions">${btn('save','대여 편성 저장',true,!editable?'disabled':'')}${btn('ready','편성 확정 · 준비',false,!editable||dirty||!own()?.loadout||own()?.ready?'disabled':'')}</div>${!editable?'<p class="classic-hint">두 참가자가 초대를 수락하면 편성을 저장할 수 있습니다. 지금은 대여 목록을 둘러볼 수 있습니다.</p>':''}<div class="classic-rental-tools"><div class="classic-actions">${[['cards','카드'],['magic','마법카드']].map(([id,label])=>btn('category',label,category===id,`data-category="${id}"`)).join('')}</div><label>검색<input data-search value="${esc(filter)}" placeholder="이름 또는 카드 번호" maxlength="50"></label>${category==='cards'?`<label>등급<select data-grade><option value="">모든 등급</option>${catalog.rules.grades.map(g=>`<option ${grade===g?'selected':''}>${g}</option>`).join('')}</select></label>`:''}</div>${category==='magic'?`<p class="classic-hint">${esc(catalog.magicRule)}</p>`:''}<p class="classic-list-count">${rows.length}개 · 모두 +10 대여</p><div class="classic-catalog">${rows.slice(0,160).map(c=>{const picked=selected.some(id=>String(id)===String(c.id));return `<button type="button" class="classic-card ${picked?'selected':''}" data-classic="select" data-id="${esc(c.id)}" aria-pressed="${picked}" ${!editable?'disabled':''}><div class="classic-card-art"><img src="${esc(art(c.image||c.imageUrl))}" alt="" loading="lazy"><span>+10</span>${picked?'<i>선택</i>':''}</div><small>${esc(c.rarity||'MAGIC')}</small><b>${esc(c.name||c.title)}</b><span>${category==='magic'?'발동 '+fmt(c.triggerChance)+'%':'전투력 '+fmt(c.power)}</span></button>`;}).join('')}</div>${rows.length>160?'<p class="classic-hint">검색 또는 등급 선택으로 160개 이내로 좁혀 주세요.</p>':''}</section>`;
 }
 function newsView(){return `<section class="classic-news"><header><p class="classic-eyebrow">THE COLOSSEUM DAILY</p><h2>승자에겐 영광을, 패자에겐 헤드라인을.</h2></header>${news?.articles.length?news.articles.map(a=>paper(a)).join(''):'<article class="classic-paper classic-empty"><div class="classic-paper-mast">콜로세움 일보</div><h2>아직 인쇄된 패배가 없습니다.</h2><p>첫 번째 클래식 멸망전이 끝나면<br>오늘의 1면이 발행됩니다.</p></article>'}<div class="classic-actions">${btn('previous','이전',false,newsPage===0?'disabled':'')}<span>${newsPage+1}면</span>${btn('next','다음',false,!news?.hasMore?'disabled':'')}</div></section>`;}
 function adminView(){return `<section class="classic-admin"><div class="cn-ui-panel classic-operation-panel"><div><p class="classic-eyebrow">OPERATOR CONTROL</p><h2>클래식 멸망전 운영</h2><p>OFF로 전환하면 진행 중인 초대와 미확정 경기는 취소됩니다.<br>완료된 전투와 일보는 유지됩니다.</p></div>${btn('toggle',state.settings.enabled?'운영 OFF로 전환':'운영 ON으로 전환',!state.settings.enabled)}</div><div class="classic-admin-columns"><section class="cn-ui-panel"><h2>1:1 초대 보내기</h2><div class="classic-admin-pair">${chosen.map((u,i)=>`<button class="cn-ui-button" data-classic="clear-user" data-side="${i}"><small>참가자 ${i+1}</small><b>${u?esc(u.nickname)+' #'+u.id:'유저 선택'}</b></button>`).join('<span>VS</span>')}</div><form data-user-search><label>닉네임 또는 ID<input name="query" required maxlength="40" placeholder="초대할 유저 검색"></label><button class="cn-ui-button" type="submit">검색</button></form><div class="classic-search-results">${searchResults.map(u=>`<div><span><b>${esc(u.nickname)}</b><small>#${u.id}</small></span>${btn('choose-user','참가자 1',false,`data-id="${u.id}" data-side="0"`)}${btn('choose-user','참가자 2',false,`data-id="${u.id}" data-side="1"`)}</div>`).join('')}</div>${btn('invite','두 참가자에게 초대 보내기',true,!state.settings.enabled||!chosen[0]||!chosen[1]?'disabled':'')}<p class="classic-hint">각 유저가 팝업에서 수락해야 편성할 수 있습니다.<br>초대와 편성은 30분 동안 유효합니다.</p></section><section class="cn-ui-panel"><header><h2>최근 경기</h2>${btn('admin-refresh','갱신')}</header><div class="classic-admin-rooms">${admin?.rooms.length?admin.rooms.map(r=>`<article><div><b>${esc(r.players.map(p=>p.nickname).join(' VS '))}</b><small>${esc(PHASE[r.status])} · ${esc(date(r.createdAt))}</small></div>${['INVITED','SETUP','READY','FIGHTING'].includes(r.status)?btn('cancel-room','취소',false,`data-id="${r.id}" data-revision="${r.revision}"`):''}</article>`).join(''):'<p>아직 생성한 경기가 없습니다.</p>'}</div></section></div></section>`;}
 async function loadExtras(){if(tab==='rental'&&!catalog)catalog=await call('catalog');if(tab==='news')news=await call('news?page='+newsPage);if(tab==='admin')admin=await adminCall('rooms');}
 async function load({quiet=false}={}){
  const previous=JSON.stringify([state?.room?.revision,state?.room?.status,state?.settings?.revision]),previousPhase=state?.room?.status;state=await call('status');syncDraft();await loadExtras();
  if(!quiet||JSON.stringify([state.room?.revision,state.room?.status,state.settings.revision])!==previous)draw();schedule();
  if(quiet&&['SETUP','READY','FIGHTING'].includes(previousPhase)&&state.room?.status==='COMPLETED'&&!battleOpen&&!document.querySelector('#modal.show,.classic-dialog[open]'))await playback(state.room.id);
 }
 function schedule(){
  clearTimeout(roomTimer);if(!active()||!state?.room||!['INVITED','SETUP','READY','FIGHTING'].includes(state.room.status))return;
  roomTimer=setTimeout(async()=>{if(!active())return;if(document.hidden||busy||battleOpen){schedule();return;}try{await load({quiet:true});}catch(error){message(error.message,true);schedule();}},6000);
 }
 async function playback(id){
  battleOpen=true;clearTimeout(roomTimer);let data;try{data=await call('replay?id='+encodeURIComponent(id));await ensureBattle();}catch(error){battleOpen=false;schedule();throw error;}if(!active()){battleOpen=false;return;}
  const modal=document.getElementById('modal');if(!modal){battleOpen=false;throw new Error('전투 화면을 찾을 수 없습니다.');}
  let closed=false;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const close=()=>{if(closed)return;closed=true;renderer?.destroy();renderer=null;modal.__battleV2Renderer=null;modal.className='modal';modal.innerHTML='';document.body.style.overflow=overflow;battleOpen=false;void load().catch(()=>{});};
  const live=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'PVP',playerName:data.attackerName,opponentName:data.defenderName});live.stage.classList.add('classic-battle','cn-command-ui');live.stage.querySelector('.battle-v3-header strong').textContent='클래식 멸망전 · +10 대여';
  const exit=document.createElement('button');exit.className='cn-ui-button classic-battle-exit';exit.textContent='기록 닫기';exit.onclick=close;live.stage.append(exit);
  try{
   const created=await window.ProjectVBattleV3Live.createRenderer({...live,modal,data,mode:'PVP'});if(closed){created.destroy();return;}renderer=created;modal.__battleV2Renderer=renderer;
   live.stage.querySelectorAll('[data-v3-roster-label]').forEach((label,i)=>label.textContent=data.players[i]?.id===state.user.id?'내 팀':'상대 팀');
   await renderer.play();if(closed)return;renderer.showResult();
   const loss=data.article.loserId===state.user.id;
   const verdict=live.stage.querySelector('[data-v3-verdict]');if(verdict){verdict.textContent=data.article.winnerName+' 승리';verdict.classList.toggle('is-win',!loss);verdict.classList.toggle('is-lose',loss);}
   live.msg.classList.add('cn-command-ui');live.msg.innerHTML=`<div class="v3-battle-report classic-battle-result classic-report"><header class="classic-result-header"><p class="classic-eyebrow">${loss?'DEFEAT · 긴급 속보':'VICTORY'}</p><h2>${loss?'오늘의 1면은 당신입니다':esc(data.article.winnerName)+' 승리'}</h2></header><div class="v3-report-body">${paper(data.article,true)}</div><footer class="v3-report-footer">${btn('close','대전실로 돌아가기',true)}</footer></div>`;live.msg.querySelector('button').onclick=close;
   await call('ack',{method:'POST',body:{matchId:id}}).catch(()=>{});
  }catch(error){if(closed)return;renderer?.destroy();renderer=null;live.stage.classList.add('is-result-visible');modal.classList.remove('battle-v3-preparing');live.stage.querySelector('.battle-v3-loader')?.remove();live.msg.innerHTML=`<div class="classic-battle-result cn-command-ui"><h2>전투 결과는 저장되었습니다</h2><p>${esc(error.message)}</p>${btn('close','대전실로 돌아가기',true)}</div>`;live.msg.querySelector('button').onclick=close;}
 }
 root.onclick=async event=>{
  const button=event.target.closest('[data-classic]');if(!button||busy||button.disabled)return;const action=button.dataset.classic;event.preventDefault();busy=true;
  try{
   if(action==='tab'){tab=button.dataset.tab;await loadExtras();draw();}
   else if(action==='edit'){tab='rental';await loadExtras();draw();}
   else if(action==='refresh'||action==='admin-refresh')await load();
   else if(['accept','decline'].includes(action)){await post(action);await load();}
   else if(action==='category'){category=button.dataset.category;filter='';grade='';draw();}
   else if(action==='select'){
    const field=category==='cards'?'cardIds':'magicCardIds',id=category==='cards'?button.dataset.id:Number(button.dataset.id),at=draft[field].findIndex(v=>String(v)===String(id));
    if(at>=0)draft[field].splice(at,1);else {if(draft[field].length>=5)throw new Error('최대 5개까지 선택할 수 있습니다.');draft[field].push(id);}dirty=true;draw();
   }else if(action==='remove'){draft.cardIds.splice(Number(button.dataset.index),1);dirty=true;draw();}
   else if(action==='move'){const i=Number(button.dataset.index),j=i+Number(button.dataset.direction);if(j>=0&&j<draft.cardIds.length){[draft.cardIds[i],draft.cardIds[j]]=[draft.cardIds[j],draft.cardIds[i]];dirty=true;draw();}}
   else if(action==='save'){await post('loadout',{loadout:draft});dirty=false;await load();message('전용 +10 대여 편성을 저장했습니다.');}
   else if(action==='ready'){const fresh=await call('status'),mine=fresh.room?.players.find(p=>p.id===fresh.user.id);if(fresh.room?.id!==state.room?.id||JSON.stringify(mine?.loadout)!==JSON.stringify(own()?.loadout))throw new Error('다른 창에서 편성이 바뀌었습니다. 대전실을 새로 불러와 확인하세요.');state=fresh;await post('ready');await load();if(state.room.status==='COMPLETED')await playback(state.room.id);}
   else if(action==='recover'){await post('recover');await load();if(state.room.status==='COMPLETED')await playback(state.room.id);}
   else if(action==='replay')await playback(state.room.id);
   else if(action==='previous'||action==='next'){newsPage+=action==='next'?1:-1;await loadExtras();draw();}
   else if(action==='toggle'){await adminCall('settings',{method:'POST',body:{enabled:!state.settings.enabled,revision:state.settings.revision}});await load();}
   else if(action==='choose-user'){chosen[Number(button.dataset.side)]=searchResults.find(u=>Number(u.id)===Number(button.dataset.id));inviteRequest=null;draw();}
   else if(action==='clear-user'){chosen[Number(button.dataset.side)]=null;inviteRequest=null;draw();}
   else if(action==='invite'){inviteRequest??=crypto.randomUUID();await adminCall('invite',{method:'POST',body:{requestId:inviteRequest,userA:Number(chosen[0].id),userB:Number(chosen[1].id)}});inviteRequest=null;await load();message('두 참가자에게 초대를 보냈습니다.');}
   else if(action==='cancel-room'){await adminCall('cancel',{method:'POST',body:{matchId:button.dataset.id,revision:Number(button.dataset.revision)}});await load();}
  }catch(error){message(error.message,true);if(error.code==='CLASSIC_CONFLICT'){try{await load();message(error.message,true);}catch{}}}
  finally{busy=false;root.setAttribute('aria-busy','false');schedule();}
 };
 root.onchange=event=>{if(event.target.matches('[data-grade]')){grade=event.target.value;draw();}};
 let searchTimer;root.oninput=event=>{if(!event.target.matches('[data-search]'))return;filter=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const start=event.target.selectionStart;draw();const field=root.querySelector('[data-search]');field?.focus();field?.setSelectionRange(start,start);},250);};
 root.onsubmit=async event=>{if(!event.target.matches('[data-user-search]'))return;event.preventDefault();if(busy)return;busy=true;try{const q=new FormData(event.target).get('query');searchResults=(await adminCall('users?q='+encodeURIComponent(q))).users;draw();if(!searchResults.length)message('일치하는 유저가 없습니다.');}catch(error){message(error.message,true);}finally{busy=false;}};
 try{await load();}catch(error){root.className='classic-colosseum cn-command-ui';root.innerHTML=`<section class="cn-ui-panel classic-empty"><h1>클래식 멸망전</h1><p data-classic-message role="alert">${esc(error.message)}</p>${btn('refresh','다시 불러오기',true)}</section>`;}
 return {refresh:load,destroy(){clearTimeout(roomTimer);clearTimeout(searchTimer);renderer?.destroy();}};
}
