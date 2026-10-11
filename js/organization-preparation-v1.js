(function(global){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'일정 확인 중';
  const palettes=['#c05240','#578dd6','#5caa6e','#c88952','#55a2c0','#9671bd','#a55353','#95a5b4','#c4a342','#5398a5','#996ac6','#cc9f43','#739dbb','#8d929c','#c34c44'];
  let selected=0;
  // The original supplied concept sheet is displayed through viewports; its pixels are unchanged.
  const emblem=(p,index,large=false)=>{
    const x=[174,442,708][index%3],y=[178,405,629,854,1080][Math.floor(index/3)];
    return `<svg class="org-emblem ${large?'large':''}" viewBox="${x} ${y} 206 188" aria-hidden="true"><image href="${esc(p.emblemsImage)}" width="1086" height="1448"/></svg>`;
  };
  const detail=(p,index)=>`<span class="org-eyebrow">IDENTITY ${String(index+1).padStart(2,'0')} / 15</span><div class="org-selected-seal" style="--seal-color:${palettes[index]}">${emblem(p,index,true)}</div><h4>${esc(p.names[index])}</h4><span class="org-detail-rule"></span><p>새로운 동료들과,<br>우리만의 영역을 만들어갈 조직.</p><dl><div><dt>조직 정원</dt><dd>10명</dd></div><div><dt>모집 상태</dt><dd>준비 중</dd></div></dl><button type="button" disabled>모집 일정 추후 공개</button><small>문양 콘셉트 미리보기</small>`;
  function banner(d){
    if(!d.organizationPreparation)return'';
    return `<aside class="org-transition-banner"><span><small>THE FINAL CHAPTER</small><b>이번 챔피언스리그를 끝으로 클랜 운영 종료</b><em>마지막 우승을 기록하고, 15개 조직의 새 시대를 준비합니다.</em></span><button type="button" data-clan-tab="organization">조직 개편 보기 ↗</button></aside>`;
  }
  function render(p){
    const stage=p.retired?'클랜 운영 종료':p.settling?'우승 보상 정산 중':'마지막 챔피언스리그';
    return `<section class="org-preparation" aria-label="조직 시스템 개편 준비">
      <header class="org-hero">
        <div class="org-hero-shade"></div><div class="org-topline"><span>숲켓몬 <i>/</i> ORGANIZATION</span><span class="org-live-label"><i></i> 개편 준비 중</span></div>
        <div class="org-hero-copy"><span class="org-eyebrow">SAME CITY. NEW RULES.</span><h2>도시의 판이<br><em>다시 바뀐다.</em></h2><p>더 넓은 세력, 더 강한 동료.<br>클랜의 마지막 장을 넘어 <strong>조직</strong>으로.</p><button type="button" data-org-scroll="orgIdentities">15개 조직 살펴보기 <span>↓</span></button></div>
        <div class="org-world-caption"><span>EXPANSION CONCEPT</span><b>같은 도시, 새로운 세력도.</b></div>
        <div class="org-hero-bottom"><div class="org-numbers"><span><b>15</b><small>조직</small></span><span><b>10</b><small>조직당 인원</small></span><span><b>NEW</b><small>신규 출발</small></span></div><p>이전 클랜 편성·점수·공동 자산 승계 없이<br>새로운 조직으로 다시 시작합니다.</p></div>
      </header>
      <section class="org-last-league"><div class="org-league-title"><span class="org-eyebrow">FINAL CHAPTER</span><h3>${esc(stage)}</h3><span>${p.retired?'결승·우승 보상 정산 완료':'결승·우승 보상 정산 후 클랜 운영 종료'}</span></div><ol><li><span>01 · 2·3위전</span><b>${esc(date(p.semifinalStartsAt))}</b></li><li><span>02 · 결승</span><b>${esc(date(p.finalStartsAt))}</b></li><li><span>03 · ${p.retired?'운영 종료':'종료 예정'}</span><b>${esc(date(p.retiredAt||p.expectedEndAt))}</b></li></ol><button type="button" data-clan-tab="champions">${p.legacyClosed?'대회 기록':'대진 확인'} ↗</button><small class="org-time-note">한국 시간 기준 · 진행 중인 전투와 정산 상황에 따라 종료 시각이 달라질 수 있습니다.</small></section>
      <nav class="org-section-nav" aria-label="개편 안내"><button type="button" data-org-scroll="orgIdentities">01 <b>조직 문양</b></button><button type="button" data-org-scroll="orgHideouts">02 <b>아지트 성장</b></button><button type="button" data-org-scroll="orgVision">03 <b>새로운 세력전</b></button><span>RENEWAL IN PROGRESS</span></nav>
      <section class="org-identities" id="orgIdentities"><header class="org-section-heading"><div><span class="org-eyebrow">01 / CHOOSE YOUR IDENTITY</span><h3>당신의 이름이 될 문양.</h3></div><p>문양을 선택해 미리 살펴보세요.<br>실제 모집은 추후 시작됩니다.</p></header><div class="org-roster-layout"><ul class="org-name-list">${p.names.map((name,i)=>`<li><button type="button" class="org-seal-card ${i===selected?'selected':''}" data-org-select="${i}" aria-pressed="${i===selected}" style="--seal-color:${palettes[i]}"><span class="org-seal-number">${String(i+1).padStart(2,'0')}</span>${emblem(p,i)}<b>${esc(name)}</b><small>ORGANIZATION</small></button></li>`).join('')}</ul><aside class="org-selected" aria-live="polite">${detail(p,selected)}</aside></div></section>
      <section class="org-hideouts" id="orgHideouts"><header class="org-section-heading"><div><span class="org-eyebrow">02 / BUILD YOUR HEADQUARTERS</span><h3>낮은 골목에서,<br>도시의 가장 높은 곳까지.</h3></div><p>점령 지역으로 조직 점수를 쌓고<br>아지트를 성장시키는 구상입니다.</p></header><ol class="org-growth">${p.hideouts.map((name,i)=>`<li><div class="org-hideout-art"><svg viewBox="${i*303+12} 540 297 177" aria-hidden="true"><image href="${esc(p.conceptImage)}" width="1536" height="1024"/></svg><span>0${i+1}</span></div><small>STAGE 0${i+1}</small><b>${esc(name)}</b>${i<4?'<i aria-hidden="true">›</i>':''}</li>`).join('')}</ol><p class="org-stage-note">성장 단계 콘셉트 · 점수와 해금 조건은 추후 안내</p></section>
      <section class="org-vision" id="orgVision"><div class="org-vision-copy"><span class="org-eyebrow">03 / EXPAND YOUR INFLUENCE</span><h3>영역을 넓혀,<br>조직의 이야기를 만들다.</h3><p>주거·상업·시장·공업·항만 지구로 이어지는 점령 경쟁.<br>새 조직을 중심으로 세력전과 전용 콘텐츠를 준비합니다.</p><div class="org-content-row"><span><i>01</i>조직 내부 콘텐츠</span><span><i>02</i>전용 사냥터</span><span><i>03</i>전용 보스</span></div></div><details class="org-originals"><summary>전체 개발 구상도 펼쳐 보기 <span>＋</span></summary><a class="org-art" href="${esc(p.conceptImage)}" target="_blank" rel="noopener"><img src="${esc(p.conceptImage)}" width="1536" height="1024" alt="지역 점령, 조직 점수, 아지트 성장 및 전용 콘텐츠 구상도" loading="lazy"></a><a class="org-emblems" href="${esc(p.emblemsImage)}" target="_blank" rel="noopener">15개 조직 문양 콘셉트 원본 보기 ↗</a></details></section>
      <footer class="org-opening"><span class="org-eyebrow">A NEW BEGINNING</span><h3>새로운 시작은, 함께.</h3><p>모집 시작일과 참가 방법을 추후 안내합니다.<br>기존 대회 결과·수상 기록·이미 받은 개인 보상은 유지됩니다.</p><button type="button" disabled>참가 모집 준비 중</button><small>현재는 개편 준비 화면입니다. 조직 점수·가입·전용 콘텐츠는 아직 열리지 않았습니다.</small></footer>
    </section>`;
  }
  function bind(root){
    if(!root)return;
    root.querySelectorAll('[data-org-scroll]').forEach(button=>button.onclick=()=>root.querySelector('#'+button.dataset.orgScroll)?.scrollIntoView({behavior:global.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
    root.querySelectorAll('[data-org-select]').forEach(button=>button.onclick=()=>{
      selected=Number(button.dataset.orgSelect);
      root.querySelectorAll('[data-org-select]').forEach(b=>{const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
      const section=root.querySelector('.org-preparation');
      const p={names:[...root.querySelectorAll('.org-seal-card b')].map(b=>b.textContent),emblemsImage:section.querySelector('.org-emblem image').getAttribute('href')};
      root.querySelector('.org-selected').innerHTML=detail(p,selected);
      if(global.matchMedia('(max-width: 700px)').matches){
        document.querySelector('.org-inspect')?.remove();
        const dialog=document.createElement('dialog');dialog.className='org-inspect';dialog.setAttribute('aria-label',p.names[selected]+' 문양 미리보기');
        dialog.innerHTML='<button type="button" class="org-inspect-close" aria-label="닫기">×</button><section class="org-selected">'+detail(p,selected)+'</section>';
        const close=()=>dialog.close();dialog.querySelector('.org-inspect-close').onclick=close;
        dialog.addEventListener('click',event=>{if(event.target===dialog)close()});
        dialog.addEventListener('close',()=>{dialog.remove();button.focus()},{once:true});
        document.body.append(dialog);dialog.showModal();
      }
    });
  }
  global.OrganizationPreparation={banner,render,bind};
})(window);
