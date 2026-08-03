/* V1396 VEHICLE DRAW UI - result close controls */
(()=>{
  const esc=v=>typeof escapeHtml==='function'
    ? escapeHtml(String(v??''))
    : String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const rarity={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};

  async function open(owned=0){
    const modal=document.getElementById('modal');
    if(!modal)return;

    let closed=false;
    const close=()=>{
      if(closed)return;
      closed=true;
      document.removeEventListener('keydown',onKeyDown);
      modal.removeEventListener('click',onBackdropClick);
      modal.className='modal';
      modal.innerHTML='';
    };
    const onKeyDown=e=>{if(e.key==='Escape')close()};
    const onBackdropClick=e=>{if(e.target===modal)close()};
    document.addEventListener('keydown',onKeyDown);
    modal.addEventListener('click',onBackdropClick);

    modal.className='modal show vehicle-draw-modal-v1388';
    modal.innerHTML='<div class="modal-panel vehicle-draw-panel-v1388"><div class="vehicle-draw-loading-v1388"><i></i><b>이동수단 시스템 연결 중</b><span>뽑기 설정을 확인하고 있습니다.</span></div></div>';

    try{
      const d=await apiRequest('vehicle-draw/config',{}, {ttl:0});
      if(closed)return;
      const s=d.settings||{};
      const pool=(d.vehicles||[]).filter(x=>x.drawEnabled&&x.isActive&&x.isPublic);
      modal.innerHTML=`<div class="modal-panel vehicle-draw-panel-v1388">
        <button type="button" class="vehicle-draw-close-v1396" id="vehicleDrawCloseV1388" aria-label="이동수단 뽑기 닫기">×</button>
        <header><small>${esc(s.drawTitle||'VEHICLE ACQUISITION')}</small><h2>이동수단 뽑기</h2><p>${esc(s.drawCopy||'새로운 이동수단을 획득합니다.')}</p></header>
        <div class="vehicle-draw-stage-v1388"><span class="ring a"></span><span class="ring b"></span><div class="vehicle-draw-ticket-v1388">${s.ticketImage?`<img src="${esc(s.ticketImage)}" alt="">`:'<b>CNINE</b>'}<em>VEHICLE DRAW</em></div></div>
        <div class="vehicle-draw-meta-v1388"><span>보유 뽑기권 <b>${Number(d.ticketQuantity||owned).toLocaleString()}개</b></span><span>등록 풀 <b>${pool.length}종</b></span></div>
        <div class="vehicle-draw-bonus-v1388"><b>MASTER STAR BONUS</b><span>이동수단 결과와 별도로 ${Number(s.masterStarChance||0)}% 확률 판정</span></div>
        <button type="button" class="btn vehicle-draw-confirm-v1388" id="vehicleDrawConfirmV1388" ${Number(d.ticketQuantity||0)>0&&pool.length?'':'disabled'}>${Number(d.ticketQuantity||0)>0?(pool.length?'1회 뽑기':'뽑기 풀 준비 중'):'뽑기권 없음'}</button>
      </div>`;
      document.getElementById('vehicleDrawCloseV1388')?.addEventListener('click',close);

      const btn=document.getElementById('vehicleDrawConfirmV1388');
      if(btn)btn.onclick=async()=>{
        const panel=modal.querySelector('.vehicle-draw-panel-v1388');
        const requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
        btn.disabled=true;
        btn.textContent='이동수단 호출 중';
        panel.classList.add('opening');
        try{
          const r=await apiRequest('vehicle-draw/open',{method:'POST',body:JSON.stringify({requestId})});
          clearApiCache('inventory');
          clearApiCache('character');
          clearApiCache('shell/summary');
          await new Promise(x=>setTimeout(x,1200));
          if(closed||!panel.isConnected)return;
          panel.classList.remove('opening');
          panel.classList.add('revealed');
          panel.innerHTML=`
            <button type="button" class="vehicle-draw-close-v1396" id="vehicleResultCloseV1396" aria-label="이동수단 결과 닫기">×</button>
            <div class="vehicle-result-v1388 rarity-${esc(String(r.vehicle.rarity||'NORMAL').toLowerCase())}">
              <small>${esc(r.duplicate?'DUPLICATE VEHICLE':'NEW VEHICLE')}</small>
              <h2>${esc(r.vehicle.name)}</h2>
              <div class="vehicle-result-image-v1388">${r.vehicle.image?`<img src="${esc(r.vehicle.image)}" alt="${esc(r.vehicle.name)}">`:'<b>NO IMAGE</b>'}</div>
              <strong>${esc(rarity[r.vehicle.rarity]||r.vehicle.rarity)}</strong>
              <p>${esc(r.vehicle.description||'새로운 이동수단을 획득했습니다.')}</p>
              <div class="vehicle-result-rewards-v1388">${r.duplicate?`<span>중복 환산 <b>카드 조각 +${Number(r.shardsGained||0).toLocaleString()}</b></span>`:'<span>차고지 등록 <b>신규 획득</b></span>'}${Number(r.masterStarsGained||0)>0?`<span>보너스 <b>마스터의 별 +${Number(r.masterStarsGained).toLocaleString()}</b></span>`:''}</div>
              <div class="vehicle-result-actions-v1396">
                <button type="button" class="btn secondary" id="vehicleResultCloseButtonV1396">닫기</button>
                <button type="button" class="btn" id="vehicleResultAgainV1420" ${Number(r.ticketQuantity||0)>0?'':'disabled'}>한 번 더 뽑기 (${Number(r.ticketQuantity||0).toLocaleString()}개)</button>
                <button type="button" class="btn" id="vehicleResultDoneV1388">인벤토리로 돌아가기</button>
              </div>
            </div>`;
          document.getElementById('vehicleResultCloseV1396')?.addEventListener('click',close);
          document.getElementById('vehicleResultCloseButtonV1396')?.addEventListener('click',close);
          document.getElementById('vehicleResultAgainV1420')?.addEventListener('click',()=>{const remaining=Number(r.ticketQuantity||0);close();if(remaining>0)open(remaining)});
          document.getElementById('vehicleResultDoneV1388')?.addEventListener('click',()=>{close();renderShell('inventory')});
        }catch(e){
          if(closed)return;
          panel.classList.remove('opening');
          btn.disabled=false;
          btn.textContent='1회 뽑기';
          alert(e.message);
        }
      };
    }catch(e){
      if(closed)return;
      modal.innerHTML=`<div class="modal-panel vehicle-draw-panel-v1388"><button type="button" class="vehicle-draw-close-v1396" id="vehicleDrawErrorTopCloseV1396" aria-label="닫기">×</button><div class="vehicle-draw-error-v1388"><b>이동수단 뽑기를 열 수 없습니다.</b><span>${esc(e.message)}</span><button type="button" class="btn" id="vehicleDrawErrorCloseV1388">닫기</button></div></div>`;
      document.getElementById('vehicleDrawErrorTopCloseV1396')?.addEventListener('click',close);
      document.getElementById('vehicleDrawErrorCloseV1388')?.addEventListener('click',close);
    }
  }
  window.VehicleDrawV1388={open};
})();
