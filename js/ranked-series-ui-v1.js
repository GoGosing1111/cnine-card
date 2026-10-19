/* Ranked-only UI. Shared PVE/PVP single-slot loadouts are unchanged. */
(()=>{
  const art='/assets/ui/ranked/series-20261019/',esc=value=>escapeHtml(String(value??''));
  const roster=()=>pvpState.rankedSeries||{codes:[],cards:[],ownedCount:0,ready:false,revision:0};
  const draft=()=>pvpState.rankedDraft||roster().codes;
  const dirty=()=>JSON.stringify(draft())!==JSON.stringify(roster().codes);
  const ready=()=>roster().ready&&!dirty()&&!pvpState.rankedSaving;
  function cardArt(card){const value=card?.sourceArt;return typeof value==='string'?value:typeof value?.src==='string'?value.src:'';}
  function portrait(card){return cardArt(card)?`<img class="rs-portrait" src="${esc(cardArt(card))}" alt="" loading="lazy">`:'<span class="rs-empty">용병 선택</span>';}
  function deckPreview(){return Array.from({length:5},(_,index)=>{const card=cards.find(c=>String(c.id)===String(pvpState.deck[index])),image=card?.image||card?.image_url||'';return `<article>${image?`<img src="${esc(image)}" alt="${esc(card.title||card.name)}" loading="lazy">`:'<span>미편성</span>'}<small>${index<2?'전열':'후열'} ${index+1}</small></article>`;}).join('');}
  function slot(index){
    const state=roster(),code=draft()[index]||'',card=state.cards.find(c=>c.code===code),locked=pvpState.matching||pvpState.rankedSaving;
    return `<article class="rs-slot"><div class="rs-slot-top"><b>${index+1}차전</b><span>${esc(card?.rank||'미편성')}</span></div><div class="rs-art">${portrait(card)}<img class="rs-frame" src="${art}frame.webp" alt=""><strong>${esc(card?.name||'출전할 용병')}</strong></div><label for="rsSelect${index}">${index+1}차전 용병</label><select id="rsSelect${index}" data-rs-select="${index}" ${locked?'disabled':''}><option value="">선택하세요</option>${state.cards.map(c=>`<option value="${esc(c.code)}" ${code===c.code?'selected':''} ${draft().includes(c.code)&&code!==c.code?'disabled':''}>${esc(c.rank)} · ${esc(c.name)}</option>`).join('')}</select><div class="rs-order"><button class="rs-button" data-rs-move="${index}:0" aria-label="${index+1}차전 용병을 앞으로" ${index===0||locked?'disabled':''}>← 앞 차전</button><button class="rs-button" data-rs-move="${index}:1" aria-label="${index+1}차전 용병을 뒤로" ${index===2||locked?'disabled':''}>뒤 차전 →</button></div></article>`;
  }
  function render(){
    const state=roster(),user=loadUser(),tier=pvpState.profile?.tier?.name||'랭크전',score=Number(pvpState.profile?.season_score||0),complete=draft().length===3&&draft().every(Boolean)&&new Set(draft()).size===3;
    return `<section class="rs-console" aria-busy="${Boolean(pvpState.matching)}"><header class="rs-heading"><div><small>RANKED MATCHMAKING</small><h2>랭크전 매칭</h2><p>용병 세 명, 두 번의 승리.</p></div><div class="rs-rating"><b>${esc(tier)}</b><strong>${score.toLocaleString()}<small>점</small></strong></div></header><div class="rs-rules"><b>2선승</b><span>차전마다 카드 5장 + 용병 1명</span><span>매 차전 체력·기력 초기화</span></div><div class="rs-roster">${[0,1,2].map(slot).join('')}</div><div class="rs-save-row"><p id="rsNotice" role="status">${state.ownedCount<3?`참가하려면 서로 다른 용병 3종이 필요합니다. 현재 ${state.ownedCount}종 보유`:dirty()?'출전 순서를 저장해야 매칭할 수 있습니다.':state.ready?'저장된 순서로 공격전과 방어전에 출전합니다.':'서로 다른 용병을 선택하고 출전 순서를 저장하세요.'}</p><button type="button" class="rs-button" id="rsSave" ${!complete||!dirty()||pvpState.matching||pvpState.rankedSaving?'disabled':''}>${pvpState.rankedSaving?'저장 중…':'출전 순서 저장'}</button></div><div class="rs-deck-row"><div><b>현재 카드 덱</b><span>모든 차전에 같은 덱이 출전합니다.</span></div><button type="button" class="rs-button" id="rankedDeckShortcut">덱 편성</button><div class="rs-deck-mini">${deckPreview()}</div></div><button type="button" class="rs-button rs-start pvp-fight" id="rankedMatchStart"><strong>랭크전 매칭 시작</strong><span id="rsEnergy">행동력 ${pvpState.energy?.unlimited?'무제한':`${Number(pvpState.energy?.energy||0)} / ${Number(pvpState.energy?.maxEnergy||0)}`} · 세트당 ${Number(pvpState.energy?.costPerBattle||1)} 소모</span></button><div class="ranked-reform-rules rs-footer"><b>행동력·점수·보상은 세트당 한 번</b><span>동점 상대 +24 / −24 · 방어전 점수 변동 없음</span><small>상대의 용병 3종은 매칭 후 공개되며, 출전 순서는 숨겨집니다.</small></div></section>`;
  }
  function redraw(focus){renderPvpTab();if(focus)document.getElementById(focus)?.focus({preventScroll:true});}
  function bind(){
    document.querySelectorAll('[data-rs-select]').forEach(select=>select.onchange=()=>{if(pvpState.matching||pvpState.rankedSaving){redraw();return;}const next=[draft()[0]||'',draft()[1]||'',draft()[2]||''];next[Number(select.dataset.rsSelect)]=select.value;pvpState.rankedDraft=next;redraw(select.id);});
    document.querySelectorAll('[data-rs-move]').forEach(button=>button.onclick=()=>{if(pvpState.matching||pvpState.rankedSaving)return;const [index,direction]=button.dataset.rsMove.split(':').map(Number),next=[...draft()],other=index+(direction?1:-1);[next[index],next[other]]=[next[other],next[index]];pvpState.rankedDraft=next;redraw('rsSelect'+other);});
    const save=document.getElementById('rsSave');if(save)save.onclick=async()=>{
      if(pvpState.rankedSaving||pvpState.matching)return;pvpState.rankedSaving=true;redraw();
      try{const d=await apiRequest('pvp/series-roster',{method:'POST',body:JSON.stringify({codes:draft(),revision:roster().revision})});pvpState.rankedSeries=d.rankedSeries;pvpState.rankedDraft=[...d.rankedSeries.codes];}
      catch(error){pvpState.rankedSaveError=error.message;}
      finally{pvpState.rankedSaving=false;redraw('rsSave');if(pvpState.rankedSaveError){document.getElementById('rsNotice').textContent=pvpState.rankedSaveError;pvpState.rankedSaveError=null;}}
    };
  }
  async function preview(match){
    if(!match.series)return;const modal=document.getElementById('modal');modal.className='modal show rs-match-modal';modal.onclick=null;
    modal.innerHTML=`<section class="rs-match-reveal" role="dialog" aria-modal="true" aria-label="매칭 완료"><small>매칭 완료</small><h2>${esc(match.opponent.nickname)}</h2><p>상대 용병 · 출전 순서 비공개</p><div class="rs-opponent-roster">${match.series.opponent.map(card=>`<article>${portrait(card)}<img class="rs-frame" src="${art}frame.webp" alt=""><strong>${esc(card.name)}</strong></article>`).join('')}</div><p>내 출전 순서: ${match.series.attacker.map(c=>esc(c.name)).join(' → ')}</p><button class="rs-button" id="rsBegin">전투 시작</button><span>잠시 후 자동으로 시작합니다.</span></section>`;
    await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();},timer=setTimeout(finish,4000);document.getElementById('rsBegin').onclick=finish;document.getElementById('rsBegin').focus();});
    modal.className='modal';modal.innerHTML='';
  }
  function summary(series){return series?`<div class="rs-final-score"><b>세트 결과 ${series.score.A} : ${series.score.B}</b><span>${series.rounds.map(r=>`${r.number}차전 ${r.winner==='A'?'승':'패'}`).join(' · ')}</span></div>`:'';}
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
  window.CNineRankedSeries={render,bind,ready,dirty,preview,summary,decorateResult,play};
})();
