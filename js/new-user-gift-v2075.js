(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function rewardsHtml(rewards) {
    if (!rewards) return '';
    const cards = rewards.cards || [], magic = rewards.magic || [], equipment = rewards.equipment || [];
    const fur = cards.filter(c => c.grade === 'FUR'), zenith = cards.filter(c => c.grade === 'ZENITH');
    const list = (title, values) => `<details><summary>${escape(title)}</summary><div class="new-gift-list">${values.map(escape).join('<br>')}</div></details>`;
    return `<div class="new-gift-rewards"><div><span>코인</span><b>100억</b></div><div><span>FUR 전체 ${fur.length}종</span><b>각 1장 · +10</b></div><div><span>제니스 전체 ${zenith.length}종</span><b>각 1장 · +10</b></div><div><span>프라임 방어구 4종 + M200</span><b>각 1개</b></div><div><span>마법카드 전체 ${magic.length}종</span><b>각 1장 · +5</b></div></div>${list('카드 목록 확인', cards.map(c => `[${c.grade}] ${c.title} +10`))}${list('장비·마법카드 목록 확인', [...equipment.map(e => e.name), ...magic.map(m => `${m.name} +5`)])}`;
  }
  let opening = false;
  async function open(deps) {
    if (opening) return;
    const { apiRequest, clearApiCache, loadUser, saveUser, apiUserToLocal, renderShell } = deps;
    const modal = document.getElementById('modal');
    if (!modal) return;
    let busy = false, completed = false;
    const close = () => { if (busy) return; modal.className='modal'; modal.innerHTML=''; if (completed) renderShell('inventory'); };
    modal.className = 'modal show new-gift-modal';
    modal.innerHTML = '<div class="modal-panel new-gift-panel"><button type="button" class="icon-close" aria-label="닫기">×</button><p class="new-gift-kicker">NEW PLAYER GIFT</p><h2>신규유저 기프트 박스</h2><p role="status">지급 기록을 확인하고 있습니다.</p></div>';
    modal.querySelector('.icon-close').onclick = close;
    const panel = modal.querySelector('.new-gift-panel');
    try {
      const status = await apiRequest('new-user-gift', {}, { ttl: 0 });
      if (!panel.isConnected) return;
      panel.innerHTML = `<button type="button" class="icon-close" aria-label="닫기">×</button><p class="new-gift-kicker">ONCE PER VERIFIED ACCOUNT</p><h2>신규유저 기프트 박스</h2><div class="new-gift-hero"><img src="assets/ui/packs/supply-high.jpeg" alt="기프트 박스"><div><strong>100억 코인</strong><p>성장을 위한 확정 보상</p></div></div>${rewardsHtml(status.rewards)}<small>더 높은 기존 강화는 유지합니다. 기존 덱·장착 장비는 변경하지 않습니다.<br>지급 당시 2차 인증 계정을 유지해야 개봉할 수 있습니다.</small><p class="new-gift-error" role="status">${status.canOpen ? '' : escape(status.receipt?.status === 'OPENED' ? '이미 개봉한 박스입니다.' : '정상 지급 박스와 지급 당시의 2차 인증이 필요합니다.')}</p><button type="button" class="new-gift-primary" ${status.canOpen ? '' : 'disabled'}>박스 개봉 · 보상 전체 받기</button>`;
      panel.querySelector('.icon-close').onclick = close;
      const button = panel.querySelector('.new-gift-primary'), message = panel.querySelector('.new-gift-error');
      button.onclick = async () => {
        if (busy || opening) return;
        busy = opening = true; button.disabled = true; button.textContent = '보상을 지급하고 있습니다…'; message.textContent = '';
        try {
          const result = await apiRequest('new-user-gift/open', { method: 'POST', body: '{}' }, { ttl: 0, timeoutMs: 25000 });
          completed = true;
          for (const key of ['new-user-gift','inventory','me','cards','shell/summary','magic/status','equipment','avatar/status']) clearApiCache(key);
          const local = loadUser(); if (local && !result.replayed) { local.coin = Number(result.coinAfter); saveUser(local); }
          // A profile refresh failure must not turn a committed grant into a retry error.
          let refreshPending = false;
          try { const data = await apiRequest('me', {}, { ttl: 0, timeoutMs: 10000 }); saveUser(apiUserToLocal(data.user)); } catch { refreshPending = true; }
          message.textContent = refreshPending ? '보상 지급은 완료됐습니다. 목록을 새로고침하면 보유 내역이 갱신됩니다.' : '';
          panel.querySelector('h2').textContent = result.replayed ? '이미 지급 완료된 보상입니다' : '보상 전체 지급 완료';
          button.textContent = '인벤토리로 돌아가기'; button.disabled = false; button.onclick = close;
        } catch (error) {
          message.textContent = `${error.message}\n응답이 끊겼다면 다시 눌러 지급 기록을 확인할 수 있습니다. 보상은 중복 지급되지 않습니다.`;
          button.disabled = false; button.textContent = '개봉 다시 확인';
        } finally { busy = opening = false; }
      };
    } catch (error) {
      if (panel.isConnected) panel.querySelector('[role="status"]').textContent = error.message;
    }
  }
  window.NewUserGiftV2075 = Object.freeze({ open, rewardsHtml });
})();
