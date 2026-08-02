(()=>{
 const $=(s,r=document)=>r.querySelector(s);
 const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const token=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
 async function api(path,opt={}){
   const r=await fetch('/api/'+path,{...opt,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token(),...(opt.headers||{})}});
   const d=await r.json().catch(()=>({}));
   if(!r.ok) throw new Error(d.error||'요청 실패');
   return d;
 }
 let state=null,root=null,ticker=null;
 function injectEntry(){
   if(document.querySelector('[data-territory-war-entry]')) return;
   const target=document.querySelector('[data-tab="pvp"]')?.parentElement||document.querySelector('.top-nav,.main-nav,.mode-tabs');
   if(!target) return;
   const b=document.createElement('button');
   b.type='button';
   b.dataset.territoryWarEntry='1';
   b.className='territory-war-entry';
   b.innerHTML='<span>영토전</span><b>WAR</b>';
   b.onclick=open;
   target.appendChild(b);
 }
 function formatRemain(endAt){
   const ms=new Date(endAt).getTime()-Date.now();
   if(!Number.isFinite(ms)) return '-';
   if(ms<=0) return '곧 갱신됩니다';
   const sec=Math.floor(ms/1000),d=Math.floor(sec/86400),h=Math.floor((sec%86400)/3600),m=Math.floor((sec%3600)/60),s=sec%60;
   if(d>0) return `${d}일 ${h}시간 ${m}분`;
   return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
 }
 function syncClocks(){
   if(!root) return;
   root.querySelectorAll('[data-tw-end-at]').forEach(el=>{ el.textContent=formatRemain(el.dataset.twEndAt); });
 }
 function startTicker(){ stopTicker(); syncClocks(); ticker=setInterval(syncClocks,1000); }
 function stopTicker(){ if(ticker){ clearInterval(ticker); ticker=null; } }
 function territoryCard(t){
   const mine=state.mine;
   const can=mine&&state.round.status==='ACTIVE'&&!String(t.kind).startsWith('BASE');
   const need=t.kind==='CENTER'?state.settings.centerCaptureWins:state.settings.normalCaptureWins;
   const cap=Math.max(Number(t.capture_a||0),Number(t.capture_b||0));
   const kindLabel=t.kind==='CENTER'?'CORE':t.kind.replace('BASE_','BASE ');
   const ownerLabel=t.owner==='NEUTRAL'?'중립':`${t.owner} 진영`;
   return `<button class="tw-node owner-${String(t.owner).toLowerCase()} kind-${String(t.kind).toLowerCase()}" data-code="${esc(t.code)}" ${can?'':'disabled'}>
     <i class="tw-flag"></i>
     <small>${esc(kindLabel)}</small>
     <b>${esc(t.name)}</b>
     <span>${esc(ownerLabel)}</span>
     ${!String(t.kind).startsWith('BASE')?`<em><u style="width:${Math.min(100,cap/need*100)}%"></u></em><strong>${cap} / ${need}</strong>`:''}
   </button>`;
 }
 function squadBlock(mine, squads){
   if(!mine) return `<div class="tw-card tw-info-card"><small>MY SQUAD</small><h3>참가하지 않았습니다</h3><p>PVP 덱 5장을 기준으로 전력이 균형 배정됩니다.</p><button class="tw-register">영토전 신청</button></div>`;
   return `<div class="tw-card tw-info-card"><small>MY SQUAD</small><h3>${mine.side||'배정 대기'} 진영 · ${mine.squad_no?`제${mine.squad_no}소대`:mine.status==='RESERVE'?'예비대':'편성 대기'}</h3>
   <p>현재 행동력 <b>${state.energy?.energy??0} / ${state.settings.energyMax}</b></p>
   <div class="tw-squad-list">${(squads[mine.side+mine.squad_no]||[]).map(x=>`<span><i>${x.position}</i><b>${esc(x.nickname)}</b><small>${Number(x.deck_power).toLocaleString()}</small></span>`).join('')||'<em>편성 정보가 아직 없습니다.</em>'}</div>
   ${state.reward&&!state.reward.claimed_at?`<button class="tw-claim">보상 수령 · 코인 ${Number(state.reward.coin||0).toLocaleString()} / 조각 ${Number(state.reward.shards||0).toLocaleString()}</button>`:''}</div>`;
 }
 function battleLogBlock(){
   return `<div class="tw-card tw-info-card tw-log"><small>RECENT BATTLES</small>${(state.battles||[]).slice(0,10).map(x=>`<p><b>${x.winner_side} 진영 승리</b><span>${esc(x.territory_code)} · +${x.points_awarded}점</span></p>`).join('')||'<p>아직 전투 기록이 없습니다.</p>'}</div>`;
 }
 function rulesBadges(){
   return `<div class="tw-rule-badges"><span>${Number(state.settings.recruitmentHours||5)}시간 모집</span><span>전투력 균형 A/B 배정</span><span>3인 소대 자동 편성</span><span>인접 영토 자유 공격</span></div>`;
 }
 function renderRecruitment(){
   const r=state.round, regs=state.registrations||[], mine=state.mine;
   const total=regs.length;
   const mineLabel=mine?`신청 완료${mine.side?` · ${mine.side} 진영`:''}`:'아직 신청하지 않았습니다';
   root.innerHTML=`<div class="tw-shell recruit-view">
     <header>
       <div><small>SOOPKETMON FRONTLINE</small><h1>영토전</h1><p>모집 화면입니다. 신청이 마감되면 자동으로 A/B 진영이 배정되고 3인 소대가 편성됩니다.</p></div>
       <button class="tw-close">닫기</button>
     </header>
     <section class="tw-recruit-hero">
       <div class="tw-recruit-main">
         <div class="tw-hero-kicker">RECRUITMENT PHASE</div>
         <h2>먼저 모집 화면부터 보여주고, <br>전투 시작 후 지도를 크게 펼칩니다.</h2>
         <p>대장전 모집화면처럼 별도 진입 화면을 제공하고, 전쟁이 시작되면 확대된 지도와 하단 정보 패널로 전환됩니다.</p>
         <div class="tw-recruit-clock">
           <small>모집 종료까지</small>
           <b data-tw-end-at="${esc(r.recruitment_ends_at||'')}">계산 중</b>
           <span>${new Date(r.recruitment_ends_at||Date.now()).toLocaleString('ko-KR')}</span>
         </div>
         ${rulesBadges()}
         <div class="tw-flow">
           <article><small>STEP 1</small><b>모집 진행</b><span>참가 등록 및 PVP 덱 스냅샷 고정</span></article>
           <article><small>STEP 2</small><b>진영 배정</b><span>A/B 진영 균형 분배 후 자동 소대 편성</span></article>
           <article><small>STEP 3</small><b>전쟁 시작</b><span>확대된 지도에서 자유롭게 영토 공략</span></article>
         </div>
       </div>
       <aside class="tw-recruit-side">
         <div class="tw-card tw-status-card">
           <small>ENTRY STATUS</small>
           <h3>${mineLabel}</h3>
           <p>현재 누적 신청 <b>${Number(total).toLocaleString()}명</b>${Number(state.settings.minParticipants||0)>0?` · 최소 ${Number(state.settings.minParticipants).toLocaleString()}명 필요`:''}</p>
           <div class="tw-side-stats">
             <span><b>${Number(total).toLocaleString()}</b><small>총 신청자</small></span>
             <span><b>${Math.floor(total/3)}</b><small>예상 소대 수</small></span>
           </div>
           ${mine?`<button class="tw-register done" disabled>신청 완료</button>`:`<button class="tw-register">영토전 신청</button>`}
           <em class="tw-hint">신청 중에는 진영이 공개되지 않으며 모집 종료 후 자동 편성됩니다.</em>
         </div>
       </aside>
     </section>
   </div>`;
   $('.tw-close',root).onclick=close;
   $('.tw-register',root)?.addEventListener('click',register);
   startTicker();
 }
 function renderBattlefield(){
   const r=state.round, regs=state.registrations||[], mine=state.mine;
   const squads=regs.reduce((o,x)=>{ if(!x.side||!x.squad_no) return o; const k=x.side+x.squad_no; (o[k]??=[]).push(x); return o; },{});
   const statusLabel=r.status==='ACTIVE'?'전쟁 진행 중':r.status==='RECRUITING'?'모집 중':'회차 종료';
   const statusEnd=r.status==='ACTIVE'?r.ends_at:r.recruitment_ends_at;
   root.innerHTML=`<div class="tw-shell battle-view">
     <header>
       <div><small>SOOPKETMON FRONTLINE</small><h1>영토전</h1><p>지도는 우측 모집칸 없이 크게 표시합니다. 전투 중 필요한 정보는 하단 패널에 분리 배치됩니다.</p></div>
       <button class="tw-close">닫기</button>
     </header>
     <section class="tw-score">
       <article class="a"><small>A 진영</small><b>${Number(r.a_score||0).toLocaleString()}</b><span>${regs.filter(x=>x.side==='A').length}명</span></article>
       <div><strong>VS</strong><small>${statusLabel}</small><time data-tw-end-at="${esc(statusEnd||'')}">계산 중</time></div>
       <article class="b"><small>B 진영</small><b>${Number(r.b_score||0).toLocaleString()}</b><span>${regs.filter(x=>x.side==='B').length}명</span></article>
     </section>
     <section class="tw-map-stage">
       <div class="tw-map-head">
         <div><small>TERRITORY MAP</small><h2>전장 지도</h2></div>
         <p>영토를 선택하면 공격을 시도합니다. 아군과 연결된 인접 영토만 공략 가능합니다.</p>
       </div>
       <section class="tw-map tw-map-expanded">${(state.territories||[]).map(territoryCard).join('')}
         <svg viewBox="0 0 1000 620" preserveAspectRatio="none"><path d="M92 312 L260 170 L428 132 L514 308 L432 486 L744 444 L902 312 M260 170 L514 308 M432 486 L514 308 L744 170 L902 312 M744 170 L514 308"/></svg>
       </section>
     </section>
     <section class="tw-panel-grid">
       ${squadBlock(mine, squads)}
       ${battleLogBlock()}
     </section>
   </div>`;
   $('.tw-close',root).onclick=close;
   $('.tw-register',root)?.addEventListener('click',register);
   $('.tw-claim',root)?.addEventListener('click',claim);
   root.querySelectorAll('.tw-node[data-code]').forEach(b=> b.onclick=()=>attack(b.dataset.code));
   startTicker();
 }
 function render(){
   if(!root||!state) return;
   stopTicker();
   if(state.round?.status==='RECRUITING') renderRecruitment();
   else renderBattlefield();
 }
 async function load(){
   try{ state=await api('territory-war/state'); render(); }
   catch(e){
     stopTicker();
     root.innerHTML=`<div class="tw-error"><h2>영토전을 불러오지 못했습니다</h2><p>${esc(e.message)}</p><button>다시 시도</button></div>`;
     root.querySelector('button').onclick=load;
   }
 }
 function open(){ if(root) return; root=document.createElement('div'); root.className='territory-war-modal'; document.body.appendChild(root); document.body.classList.add('territory-war-open'); load(); }
 function close(){ stopTicker(); root?.remove(); root=null; document.body.classList.remove('territory-war-open'); }
 async function register(){ try{ await api('territory-war/register',{method:'POST',body:'{}'}); await load(); }catch(e){ alert(e.message); } }
 async function claim(){ try{ const d=await api('territory-war/claim',{method:'POST',body:'{}'}); state=d.state; render(); alert(`보상 수령 완료: 코인 ${Number(d.coin).toLocaleString()} / 조각 ${Number(d.shards).toLocaleString()}`); }catch(e){ alert(e.message); } }
 async function attack(code){ if(!confirm(code+' 영토를 공격합니다. 소대 행동력 1을 사용합니다.')) return; try{ const d=await api('territory-war/attack',{method:'POST',body:JSON.stringify({territoryCode:code,requestId:crypto.randomUUID()})}); state=d.state; render(); alert(`${d.result.winner} 진영 승리 · ${d.result.points}점${d.result.captured?' · 영토 점령':''}`); }catch(e){ alert(e.message); } }
 const mo=new MutationObserver(injectEntry); mo.observe(document.documentElement,{childList:true,subtree:true}); addEventListener('load',injectEntry); window.openTerritoryWar=open;
})();
