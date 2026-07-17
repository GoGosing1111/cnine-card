(()=>{
  const S={data:null,busy:false};
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function ensure(){
    const tabs=document.querySelector('.pve-mode-tabs');if(!tabs||tabs.querySelector('[data-pve-mode="tower"]'))return;
    const b=document.createElement('button');b.className='pve-mode-btn';b.dataset.pveMode='tower';b.textContent='무한의탑';tabs.appendChild(b);
    const raid=document.getElementById('pveRaidView');if(!raid)return;
    const box=document.createElement('div');box.id='pveTowerView';box.className='pve-tower-view';box.hidden=true;raid.insertAdjacentElement('afterend',box);
    tabs.addEventListener('click',e=>{const btn=e.target.closest('[data-pve-mode]');if(!btn)return;const box=document.getElementById('pveTowerView');if(btn.dataset.pveMode==='tower'){e.preventDefault();openTower();}else if(box){box.hidden=true;}});
  }
  async function openTower(){
    document.querySelectorAll('.pve-mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.pveMode==='tower'));
    ['pveHuntView','pveRaidView'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=true});
    const box=document.getElementById('pveTowerView');if(!box)return;box.hidden=false;box.innerHTML='<section class="tower-loading"><div class="tower-spinner"></div><h2>무한의탑을 불러오는 중...</h2></section>';
    try{S.data=await apiRequest('tower/status',{}, {ttl:0});render()}catch(e){box.innerHTML=`<section class="tower-empty"><h2>무한의탑</h2><p>${esc(e.message)}</p></section>`}
  }
  function render(){const d=S.data,box=document.getElementById('pveTowerView');if(!box)return;if(!d?.active){box.innerHTML='<section class="tower-empty"><h2>진행 중인 시즌이 없습니다</h2><p>다음 시즌 개방을 기다려 주세요.</p></section>';return}
    const p=d.progress||{},f=d.floor||{},rank=d.ranking||[];box.innerHTML=`
    <section class="tower-hero ${f.isBoss?'boss-ready':''}">
      <div class="tower-hero-copy"><p class="eyebrow">INFINITE TOWER</p><h2>${esc(d.season.name)}</h2><p>저장된 PVE 덱 5장으로 끝없이 올라가세요. 궁극기는 발동하지 않습니다.</p></div>
      <div class="tower-season-clock"><span>시즌 종료</span><b>${d.season.endsAt?new Date(d.season.endsAt).toLocaleDateString('ko-KR'):'미정'}</b></div>
    </section>
    <section class="tower-overview">
      <article><small>CURRENT FLOOR</small><strong>${Number(p.currentFloor||1)}F</strong><span>현재 도전층</span></article>
      <article><small>SEASON BEST</small><strong>${Number(p.highestFloor||0)}F</strong><span>시즌 최고층</span></article>
      <article><small>MY RANK</small><strong>${Number(p.rank||1)}위</strong><span>현재 순위</span></article>
      <article class="next-boss"><small>NEXT BOSS</small><strong>${Math.ceil(Number(p.currentFloor||1)/10)*10}F</strong><span>다음 보스층</span></article>
    </section>
    <section class="tower-main-grid">
      <div class="tower-floor-card ${f.isBoss?'boss-floor':''}">
        <div class="tower-floor-number"><span>${f.isBoss?'BOSS FLOOR':'FLOOR'}</span><b>${Number(f.floorNo||1)}</b></div>
        <div class="tower-monster-visual">${f.monsterImage?`<img src="${esc(f.monsterImage)}" alt="">`:'<div class="tower-monster-placeholder">👹</div>'}<i></i></div>
        <div class="tower-floor-info"><p>${f.isBoss?'강력한 층주가 기다리고 있습니다':'탑의 수문장이 길을 막고 있습니다'}</p><h3>${esc(f.monsterName||'탑의 수문장')}</h3><div><span>권장 전투력</span><b>${Number(f.monsterPower||0).toLocaleString()}</b></div><div><span>클리어 보상</span><b>◈ ${Number(f.rewardCoin||0).toLocaleString()}</b></div></div>
        <button class="btn tower-start-btn" id="towerStart">${f.isBoss?'보스층 도전':'현재 층 도전'}</button>
      </div>
      <aside class="tower-side-panel"><div class="tower-deck-preview"><div class="panel-title"><div><p class="eyebrow">PVE SAVED DECK</p><h3>현재 저장 덱</h3></div><button id="towerGoDeck" class="ghost">덱 변경</button></div><div class="tower-deck-slots">${(d.deck||[]).map(id=>{const c=cards.find(x=>String(x.id)===String(id));return c?`<div><img src="${esc(c.image)}"><span>${esc(c.title)}</span></div>`:'<div class="empty">?</div>'}).join('')}${Array.from({length:Math.max(0,5-(d.deck||[]).length)},()=>'<div class="empty">+</div>').join('')}</div><small>무한의탑은 PVE 덱 저장을 그대로 사용합니다.</small></div>
      <div class="tower-ranking"><div class="panel-title"><div><p class="eyebrow">SEASON RANKING</p><h3>최고층 랭킹</h3></div></div><div class="tower-rank-list">${rank.slice(0,10).map((r,i)=>`<div class="${Number(r.user_id)===Number(loadUser()?.id)?'me':''}"><b>${i+1}</b><span>${esc(r.nickname)}</span><strong>${Number(r.highest_floor||0)}F</strong></div>`).join('')||'<p>아직 기록이 없습니다.</p>'}</div></div></aside>
    </section>`;
    document.getElementById('towerStart').onclick=startFight;document.getElementById('towerGoDeck').onclick=()=>{document.querySelector('[data-pve-mode="hunt"]')?.click();setTimeout(()=>document.querySelector('[data-pve-tab="deck"]')?.click(),100)};
  }
  async function startFight(){if(S.busy)return;if((S.data.deck||[]).length!==5)return alert('먼저 PVE 덱 5장을 저장하세요.');S.busy=true;const f=S.data.floor,modal=document.getElementById('modal');modal.className='modal show battle-modal tower-battle-modal';modal.innerHTML=`<div class="modal-panel battle-stage tower-battle-stage intro ${f.isBoss?'tower-boss-stage':''}"><div class="battle-backdrop"></div><div class="battle-fx-layer"></div><div class="tower-battle-progress"><span>${Math.max(1,f.floorNo-1)}F</span><i><u></u></i><b>${f.floorNo}F</b><i><u></u></i><span>${f.floorNo+1}F</span></div><div class="tower-floor-intro"><small>${f.isBoss?'WARNING · BOSS FLOOR':'INFINITE TOWER'}</small><strong>${f.floorNo} FLOOR</strong><span>${esc(f.monsterName)}</span></div><div class="tower-combat-shell"><div class="tower-team" id="towerTeam"></div><div class="tower-vs">VS</div><div class="tower-enemy">${f.monsterImage?`<img src="${esc(f.monsterImage)}">`:'<div>👹</div>'}<b>${esc(f.monsterName)}</b></div></div><div class="battle-message" id="towerBattleMessage"><span>탑의 문이 열리고 있습니다</span></div></div>`;
    try{await new Promise(r=>setTimeout(r,f.isBoss?1300:850));const d=await apiRequest('tower/fight',{method:'POST',body:'{}'});const team=document.getElementById('towerTeam');team.innerHTML=(d.cards||[]).map(c=>`<div class="tower-fighter"><img src="${esc(c.image)}" style="object-position:${Number(c.focusX||50)}% ${Number(c.focusY||50)}%"><span>${esc(c.title)}</span></div>`).join('');modal.querySelector('.battle-stage').classList.add('fight');const msg=document.getElementById('towerBattleMessage');msg.innerHTML=`<span>${Number(d.playerPower).toLocaleString()} VS ${Number(d.monsterPower).toLocaleString()}</span>`;await new Promise(r=>setTimeout(r,1500));modal.querySelector('.battle-stage').classList.add(d.result==='WIN'?'battle-win-v863':'battle-lose-v863');msg.innerHTML=`<strong>${d.result==='WIN'?`${d.floorNo}층 클리어`:`${d.floorNo}층 도전 실패`}</strong><span>${d.result==='WIN'?`보상 ◈ ${Number(d.reward||0).toLocaleString()} · 다음 ${d.nextFloor}층`:'현재 층에서 다시 도전할 수 있습니다.'}</span><button type="button" class="btn" id="towerResultBtn">${d.result==='WIN'?'다음 층 확인':'다시 확인'}</button>`;document.getElementById('towerResultBtn').onclick=()=>{modal.className='modal';modal.innerHTML='';S.busy=false;openTower()};
    }catch(e){document.getElementById('towerBattleMessage').innerHTML=`<span>${esc(e.message)}</span><button class="btn" id="towerCloseErr">닫기</button>`;document.getElementById('towerCloseErr').onclick=()=>{modal.className='modal';modal.innerHTML='';S.busy=false}}
  }
  new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});ensure();
})();
