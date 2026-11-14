/* Ranked selections follow server rules; dual deployment remains release-gated. */
(()=>{
  const art='/assets/ui/ranked/series-20261019/',esc=value=>escapeHtml(String(value??''));
  const roster=()=>pvpState.rankedSeries||{codes:[],cards:[],ownedCount:0,ready:false,revision:0};
  function evenScoreText(profile){
    const points=profile?.equalPoints;
    return points?`동점 상대 승리 +${Number(points.win)} / 패배 −${Number(points.loss)}`:'동점 상대 +24 / −24';
  }
  const perRound=()=>roster().mercenariesPerRound===2?2:1;
  const required=()=>3*perRound();
  const fullDraft=()=>Array.from({length:required()},(_,i)=>draft()[i]||'');
  const roundLabel=index=>`${Math.floor(index/perRound())+1}차전${perRound()===2?' · 용병 '+(index%2+1):''}`;
  function limitedPartnerRank(index){
    if(perRound()!==2)return null;
    const partner=draft()[index%2?index-1:index+1];
    const rank=roster().cards.find(card=>card.code===partner)?.rank;
    return rank==='SSS'||rank==='SS'?rank:null;
  }
  const sameRank=(code,index)=>{const rank=limitedPartnerRank(index);return rank!==null&&roster().cards.find(c=>c.code===code)?.rank===rank;};
  const complete=()=>fullDraft().every(Boolean)&&new Set(fullDraft()).size===required()&&!fullDraft().some(sameRank);
  const draft=()=>pvpState.rankedDraft||roster().codes;
  const dirty=()=>JSON.stringify(draft())!==JSON.stringify(roster().codes);
  const ready=()=>roster().ready&&!dirty()&&!pvpState.rankedSaving;
  const identity=card=>card?.identityLabel||card?.rank||'';
  const fullName=card=>[identity(card),card?.name].filter(Boolean).join(' · ');
  const ranks=['SSS','SS','S','A','B','C'],names=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
  let preferenceKey,preferenceState,preferenceWarning='';
  const preferenceAccount=()=>{const user=loadUser(),id=Number(user?.serverUserId||user?.id);return Number.isSafeInteger(id)&&id>0?String(id):'';};
  const cleanPreferences=value=>({grade:ranks.includes(value?.grade)?value.grade:'',favoriteOnly:value?.favoriteOnly===true,favorites:[...new Set((Array.isArray(value?.favorites)?value.favorites:[]).filter(code=>typeof code==='string'&&/^V-\d{3}$/.test(code)))]});
  function preferences(){
    const account=preferenceAccount(),key=account?'cnine_ranked_mercenary_preferences_v1:'+account:'';
    if(preferenceKey!==key||!preferenceState){preferenceKey=key;preferenceWarning='';let stored;try{stored=key?JSON.parse(localStorage.getItem(key)||'null'):null;}catch(_){stored=null;}preferenceState=cleanPreferences(stored);}
    return preferenceState;
  }
  function savePreferences(next){
    preferences();preferenceState=cleanPreferences(next);preferenceWarning='';
    try{if(preferenceKey)localStorage.setItem(preferenceKey,JSON.stringify(preferenceState));else preferenceWarning='로그인 전 즐겨찾기는 이번 접속에서만 유지됩니다.';}
    catch(_){preferenceWarning='브라우저 저장이 제한되어 즐겨찾기는 이번 접속에서만 유지됩니다.';}
  }
  const rankIndex=card=>{const index=ranks.indexOf(card.rank);return index<0?ranks.length:index;};
  function sortedCards(){return [...roster().cards].sort((a,b)=>rankIndex(a)-rankIndex(b)||names.compare(a.name||'',b.name||'')||names.compare(identity(a),identity(b))||String(a.code).localeCompare(String(b.code)));}
  function selectionList(){
    const prefs=preferences(),all=sortedCards();
    const matches=all.filter(card=>(!prefs.grade||card.rank===prefs.grade)&&(!prefs.favoriteOnly||prefs.favorites.includes(card.code)));
    const showAll=all.length>0&&matches.length===0;
    return {prefs,visible:showAll?all:matches,showAll};
  }
  function selectionTools({prefs:p,visible,showAll}){
    const count=roster().cards.filter(c=>p.favorites.includes(c.code)).length,locked=pvpState.matching||pvpState.rankedSaving;
    let status=`목록 ${visible.length}종 · 높은 등급순 · 같은 등급은 이름순`;
    if(!visible.length)status='편성 가능한 보유 용병이 없습니다.';
    else if(showAll)status=(p.favoriteOnly&&!count?'즐겨찾기가 없습니다.':'선택한 조건에 맞는 용병이 없습니다.')+` 전체 편성 가능 용병 ${visible.length}종을 표시합니다.`;
    return `<div class="rs-selection-tools"><div class="rs-filter-controls"><label for="rsGradeFilter">용병 등급</label><select id="rsGradeFilter" ${locked?'disabled':''}><option value="">전체 등급</option>${ranks.map(rank=>`<option value="${rank}" ${p.grade===rank?'selected':''}>${rank} · ${roster().cards.filter(c=>c.rank===rank).length}종</option>`).join('')}</select><button type="button" id="rsFavoriteOnly" class="rs-preference-button" aria-pressed="${p.favoriteOnly}" ${locked?'disabled':''}><span aria-hidden="true">${p.favoriteOnly?'★':'☆'}</span> 즐겨찾기만 · ${count}</button></div><p id="rsFilterStatus" role="status">${status}</p><small>즐겨찾기는 이 기기에 계정별로 저장됩니다.</small>${preferenceWarning?`<p class="rs-preference-warning" role="status">${esc(preferenceWarning)}</p>`:''}</div>`;
  }
  function selectionOptions(index,{visible,prefs,showAll}){
    const codes=draft(),code=codes[index]||'',current=roster().cards.find(c=>c.code===code),partnerRank=limitedPartnerRank(index);
    const option=c=>`<option value="${esc(c.code)}" ${code===c.code?'selected':''} ${(codes.includes(c.code)&&code!==c.code)||(partnerRank!==null&&c.rank===partnerRank)?'disabled':''}>${prefs.favorites.includes(c.code)?'★ ':''}${esc(fullName(c))}</option>`;
    let html=`<option value="">${showAll?'전체 목록에서 선택하세요':visible.length?'선택하세요':'편성 가능한 보유 용병 없음'}</option>`;
    if(current&&!visible.some(c=>c.code===code))html+=`<optgroup label="현재 선택">${option(current)}</optgroup>`;
    for(const rank of [...ranks,'기타']){const group=visible.filter(c=>(ranks.includes(c.rank)?c.rank:'기타')===rank);if(group.length)html+=`<optgroup label="${rank} · ${group.length}종">${group.map(option).join('')}</optgroup>`;}
    return html;
  }
  function favoriteButton(index,card,locked,favorites){
    const favorite=favorites.includes(card?.code);
    return `<button type="button" id="rsFavorite${index}" class="rs-preference-button rs-slot-favorite" data-rs-favorite="${index}" aria-pressed="${favorite}" aria-label="${esc(card?fullName(card)+' 즐겨찾기 '+(favorite?'해제':'추가'):'용병을 선택한 뒤 즐겨찾기 추가')}" ${!card||locked?'disabled':''}><span aria-hidden="true">${favorite?'★':'☆'}</span> ${favorite?'즐겨찾기 해제':'즐겨찾기 추가'}</button>`;
  }
  function cardArt(card){const value=card?.sourceArt,src=typeof value==='string'?value:typeof value?.src==='string'?value.src:'';return src.startsWith('assets/')?'/'+src:src;}
  function portrait(card){return cardArt(card)?`<img class="rs-portrait" src="${esc(cardArt(card))}" alt="" loading="lazy">`:'<span class="rs-empty">용병 선택</span>';}
  function deckPreview(){return Array.from({length:5},(_,index)=>{const card=cards.find(c=>String(c.id)===String(pvpState.deck[index])),image=card?.image||card?.image_url||'';return `<article>${image?`<img src="${esc(image)}" alt="${esc(card.title||card.name)}" loading="lazy">`:'<span>미편성</span>'}<small>${index<2?'전열':'후열'} ${index+1}</small></article>`;}).join('');}
  function slot(index,list){
    const state=roster(),code=draft()[index]||'',card=state.cards.find(c=>c.code===code),locked=pvpState.matching||pvpState.rankedSaving;
    return `<article class="rs-slot"><div class="rs-slot-top"><b>${roundLabel(index)}</b><span>${esc(card?.rank||'미편성')}</span></div><div class="rs-art">${portrait(card)}<img class="rs-frame" src="${art}frame.webp" alt=""><strong>${esc(card?.name||'출전할 용병')}</strong></div><p class="rs-identity">${esc(identity(card))}</p><label for="rsSelect${index}">${roundLabel(index)} 선택</label><div class="rs-select-control"><select id="rsSelect${index}" data-rs-select="${index}" ${locked?'disabled':''}>${selectionOptions(index,list)}</select></div>${favoriteButton(index,card,locked,list.prefs.favorites)}${perRound()===2?'':`<div class="rs-order"><button class="rs-button" data-rs-move="${index}:0" aria-label="${index+1}차전 용병을 앞으로" ${index===0||locked?'disabled':''}>← 앞 차전</button><button class="rs-button" data-rs-move="${index}:1" aria-label="${index+1}차전 용병을 뒤로" ${index===2||locked?'disabled':''}>뒤 차전 →</button></div>`}</article>`;
  }
  function round(index,list){
    return `<section class="rs-round"><h3>${index+1}차전</h3><div class="rs-pair">${slot(index*2,list)}${slot(index*2+1,list)}</div><div class="rs-order">${[0,1].map(direction=>`<button class="rs-button" data-rs-round-move="${index}:${direction}" ${pvpState.matching||pvpState.rankedSaving||index===(direction?2:0)?'disabled':''}>${direction?'뒤 차전 →':'← 앞 차전'}</button>`).join('')}</div></section>`;
  }
  function promotionPanel(run){
    if(!run)return '';
    const name=esc(run.targetName),score=Number(run.targetScore).toLocaleString(),retry=Number(run.retryScore).toLocaleString();
    let heading,detail;
    switch(run.status){
      case 'CLIMBING':
        heading=`${name} 승급전 · ${score}점 도달 시 시작`;
        detail='이후 랭크전 최대 5경기에서 3승을 먼저 거두면 승급합니다.';
        break;
      case 'PROMOTED':
        heading=`${name} 승급 성공 · ${run.wins}승 ${run.losses}패`;
        detail=`시즌 점수 ${score}점. 이번 시즌에는 이 티어에 다시 오를 때 승급전이 면제됩니다.`;
        break;
      case 'FAILED':
        heading=`${name} 승급 실패 · ${run.wins}승 ${run.losses}패`;
        detail=`${retry}점에서 재도전합니다. ${score}점에 도달하면 새 승급전이 시작됩니다.`;
        break;
      default:
        heading=`${name} 승급전${run.status==='STARTED'?' 시작':''} · ${run.wins}승 ${run.losses}패`;
        detail=`현재 ${(run.targetScore-1).toLocaleString()}점 · 5전 3선승. 앞으로 ${3-run.wins}승이면 승급하고, 3패 시 ${retry}점으로 돌아갑니다.`;
    }
    return `<div class="rs-promotion" role="status"><strong>${heading}</strong><span>${detail}</span></div>`;
  }
  function render(){
    const state=roster(),tier=pvpState.profile?.tier?.name||'랭크전',score=Number(pvpState.profile?.season_score||0),canSave=complete(),list=selectionList();
    return `<section class="rs-console" aria-busy="${Boolean(pvpState.matching)}"><header class="rs-heading"><div><small>RANKED MATCHMAKING</small><h2>랭크전 매칭</h2><p>${perRound()===2?'차전마다 용병 두 명, 두 번의 승리.':'용병 세 명, 두 번의 승리.'}</p></div><div class="rs-rating"><b>${esc(tier)}</b><strong>${score.toLocaleString()}<small>점</small></strong></div></header><div class="rs-rules"><b>한 경기 3전 2선승</b><span>차전마다 카드 5장 + 용병 ${perRound()}명</span><span>매 차전 체력·기력 초기화</span></div>${promotionPanel(pvpState.profile?.promotion)}${selectionTools(list)}<div class="rs-roster ${perRound()===2?'rs-dual':''}">${[0,1,2].map(i=>perRound()===2?round(i,list):slot(i,list)).join('')}</div>${perRound()===2?'<p class="rs-pair-rule">차전당 SSS(리미티드 포함) 1명 · SS 1명 · 각 용병은 세트당 한 번 출전</p>':''}<div class="rs-save-row"><p id="rsNotice" role="status">${state.ownedCount<required()?`참가하려면 서로 다른 용병 ${required()}종이 필요합니다. 현재 ${state.ownedCount}종 보유`:dirty()?'출전 순서를 저장해야 매칭할 수 있습니다.':state.ready?'저장된 순서로 공격전과 방어전에 출전합니다.':'서로 다른 용병을 선택하고 출전 순서를 저장하세요.'}</p><button type="button" class="rs-button" id="rsSave" ${!canSave||!dirty()||pvpState.matching||pvpState.rankedSaving?'disabled':''}>${pvpState.rankedSaving?'저장 중…':'출전 순서 저장'}</button></div><div class="rs-deck-row"><div><b>현재 카드 덱</b><span>모든 차전에 같은 덱이 출전합니다.</span></div><button type="button" class="rs-button" id="rankedDeckShortcut">덱 편성</button><div class="rs-deck-mini">${deckPreview()}</div></div><button type="button" class="rs-button rs-start pvp-fight" id="rankedMatchStart"><strong>랭크전 매칭 시작</strong><span id="rsEnergy">행동력 ${pvpState.energy?.unlimited?'무제한':`${Number(pvpState.energy?.energy||0)} / ${Number(pvpState.energy?.maxEnergy||0)}`} · 세트당 ${Number(pvpState.energy?.costPerBattle||1)} 소모</span></button><div class="ranked-reform-rules rs-footer"><b>행동력·점수·보상은 세트당 한 번</b><span>${evenScoreText(pvpState.profile)} · 방어전 점수 변동 없음</span><small>상대의 용병 ${required()}종은 매칭 후 공개되며, 출전 순서는 숨겨집니다.</small></div></section>`;
  }
  function redraw(focus){renderPvpTab();if(focus)document.getElementById(focus)?.focus({preventScroll:true});}
  function bind(){
    const grade=document.getElementById('rsGradeFilter');if(grade)grade.onchange=()=>{if(pvpState.matching||pvpState.rankedSaving)return;savePreferences({...preferences(),grade:grade.value});redraw(grade.id);};
    const favoriteOnly=document.getElementById('rsFavoriteOnly');if(favoriteOnly)favoriteOnly.onclick=()=>{if(pvpState.matching||pvpState.rankedSaving)return;savePreferences({...preferences(),favoriteOnly:!preferences().favoriteOnly});redraw(favoriteOnly.id);};
    document.querySelectorAll('[data-rs-favorite]').forEach(button=>button.onclick=()=>{
      if(pvpState.matching||pvpState.rankedSaving)return;const code=draft()[Number(button.dataset.rsFavorite)];if(!roster().cards.some(c=>c.code===code))return;
      const p=preferences(),favorites=p.favorites.includes(code)?p.favorites.filter(c=>c!==code):[...p.favorites,code];savePreferences({...p,favorites});redraw(button.id);
    });
    document.querySelectorAll('[data-rs-select]').forEach(select=>select.onchange=()=>{if(pvpState.matching||pvpState.rankedSaving){redraw();return;}const index=Number(select.dataset.rsSelect);if(select.value&&(sameRank(select.value,index)||draft().some((code,i)=>i!==index&&code===select.value))){redraw(select.id);return;}const next=fullDraft();next[index]=select.value;pvpState.rankedDraft=next;redraw(select.id);});
    document.querySelectorAll('[data-rs-move]').forEach(button=>button.onclick=()=>{if(pvpState.matching||pvpState.rankedSaving)return;const [index,direction]=button.dataset.rsMove.split(':').map(Number),next=[...draft()],other=index+(direction?1:-1);[next[index],next[other]]=[next[other],next[index]];pvpState.rankedDraft=next;redraw('rsSelect'+other);});
    document.querySelectorAll('[data-rs-round-move]').forEach(button=>button.onclick=()=>{
      if(pvpState.matching||pvpState.rankedSaving)return;
      const [index,direction]=button.dataset.rsRoundMove.split(':').map(Number),other=index+(direction?1:-1),next=fullDraft();
      for(let i=0;i<2;i++)[next[index*2+i],next[other*2+i]]=[next[other*2+i],next[index*2+i]];
      pvpState.rankedDraft=next;redraw('rsSelect'+other*2);
    });
    const save=document.getElementById('rsSave');if(save)save.onclick=async()=>{
      if(pvpState.rankedSaving||pvpState.matching||!complete())return;pvpState.rankedSaving=true;redraw();
      try{const d=await apiRequest('pvp/series-roster',{method:'POST',body:JSON.stringify({codes:draft(),revision:roster().revision})});pvpState.rankedSeries=d.rankedSeries;pvpState.rankedDraft=[...d.rankedSeries.codes];}
      catch(error){pvpState.rankedSaveError=error.message;}
      finally{pvpState.rankedSaving=false;redraw('rsSave');if(pvpState.rankedSaveError){document.getElementById('rsNotice').textContent=pvpState.rankedSaveError;pvpState.rankedSaveError=null;}}
    };
  }
  async function preview(match){
    if(!match.series)return;const modal=document.getElementById('modal');modal.className='modal show rs-match-modal';modal.onclick=null;
    modal.innerHTML=`<section class="rs-match-reveal" role="dialog" aria-modal="true" aria-label="매칭 완료"><small>매칭 완료</small><h2>${esc(match.opponent.nickname)}</h2>${match.promotion?.status==='ACTIVE'?promotionPanel(match.promotion):''}${Number.isFinite(match.opponent.expectedWin)&&Number.isFinite(match.opponent.expectedLoss)?`<p>이번 경기 예상 점수 · 승리 +${match.opponent.expectedWin} / 패배 ${match.opponent.expectedLoss?'−'+match.opponent.expectedLoss:'0'}</p>`:''}<p>상대 용병 · 출전 순서 비공개</p><div class="rs-opponent-roster">${match.series.opponent.map(card=>`<article aria-label="${esc(fullName(card))}"><div class="rs-opponent-art">${portrait(card)}<img class="rs-frame" src="${art}frame.webp" alt=""><strong>${esc(card.name)}</strong></div><small class="rs-identity">${esc(identity(card))}</small></article>`).join('')}</div><p>내 출전 순서: ${Array.from({length:3},(_,i)=>match.series.attacker.slice(i*(match.series.mercenariesPerRound||1),(i+1)*(match.series.mercenariesPerRound||1)).map(c=>esc(fullName(c))).join(' + ')).join(' → ')}</p><button class="rs-button" id="rsBegin">전투 시작</button><span>잠시 후 자동으로 시작합니다.</span></section>`;
    await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();},timer=setTimeout(finish,4000);document.getElementById('rsBegin').onclick=finish;document.getElementById('rsBegin').focus();});
    modal.className='modal';modal.innerHTML='';
  }
  function summary(series){return series?`<div class="rs-final-score"><b>세트 결과 ${series.score.A} : ${series.score.B}</b><span>${series.rounds.map(r=>`${r.number}차전 ${r.winner==='A'?'승':'패'}`).join(' · ')}</span></div>${promotionPanel(series.promotion)}`:'';}
  function decorateResult(report,series){return series?report.replace('<div class="v3-report-body">','<div class="v3-report-body">'+summary(series)).replace('전투 상세','마지막 차전 상세').replace(/(<h2 id="v3ReportTitle">[^<]+<\/h2><p>)[^<]*/, '$1두 차전 승리로 세트 종료'):report;}
  async function play({modal,data,playerName,opponentName,onView}){
    const rounds=data.rankedSeries?.rounds||[{number:1,battleV2:data.battleV2}],series=data.rankedSeries;let live;
    for(const round of rounds){
      modal.__battleV2Renderer?.destroy?.();modal.__battleV2Renderer=null;
      live=window.prepareBattleV2LiveLoading({modal,mode:'PVP',playerName,opponentName});ensureBattleSoundButton(live.stage);
      onView?.(live);
      if(series){const bar=document.createElement('div');bar.className='rs-battle-progress';bar.setAttribute('role','status');bar.textContent=`${round.number}차전 · ${round.score.A-(round.winner==='A'?1:0)} : ${round.score.B-(round.winner==='B'?1:0)} · 2선승`;live.stage.append(bar);}
      await window.playPvpBattleV2Live({...live,modal,data:{...data,battleV2:round.battleV2,result:round.winner?(round.winner==='A'?'WIN':'LOSE'):data.result}});
      const progress=live.stage.querySelector('.rs-battle-progress');if(progress)progress.textContent=`${round.number}차전 종료 · ${round.score.A} : ${round.score.B}`;
      if(series&&round.number<rounds.length){live.msg.innerHTML=`<strong>${round.number}차전 ${round.winner==='A'?'승리':'패배'}</strong><span>${round.score.A} : ${round.score.B} · 다음 용병 출전</span>`;live.msg.classList.add('is-visible');await battleSleep(1400);}
    }
    return live;
  }
  window.CNineRankedSeries={render,bind,ready,dirty,preview,summary,decorateResult,play,evenScoreText};
})();
