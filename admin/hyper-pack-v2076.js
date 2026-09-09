(() => {
  const kinds = ['MISS','MASTER_STAR','MYSTIC_ENERGY','MERCENARY'];
  const names = ['꽝','마스터의 별','미스틱 에너지','용병카드'];
  const colors = ['#777484','#f5c369','#a675ed','#e9dcff'];
  let panel, revision = null, loaded = false, busy = false;
  const token = () => localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
  async function api(body) {
    const response = await fetch('/api/admin/hyper-pack', { method: body ? 'PATCH' : 'GET', cache:'no-store',
      headers: { authorization:'Bearer '+token(), 'content-type':'application/json' },
      ...(body ? { body:JSON.stringify(body) } : {}), signal:AbortSignal.timeout(15000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '설정을 불러오지 못했습니다.'); return data;
  }
  const number = selector => { const value = panel.querySelector(selector).value.trim(); return value === '' ? null : Number(value); };
  function form() { return { revision, rates:Object.fromEntries(kinds.map(kind => [kind,number(`[data-hyper-rate="${kind}"]`)])),
    quantities:Object.fromEntries(kinds.slice(1,3).map(kind => [kind,number(`[data-hyper-qty="${kind}"]`)])) }; }
  function meter() {
    const values = Object.values(form().rates), sum = values.reduce((n,v) => n+(Number.isFinite(v)?v:0),0);
    panel.querySelector('[data-total]').textContent = `확률 합계 ${Number(sum.toFixed(4))}% / 100%${values.includes(null)?' · 미설정 항목 있음':''}`;
    panel.querySelectorAll('[data-bar]').forEach((bar,i) => { bar.style.width = `${Math.max(0,Math.min(100,values[i]||0))}%`; });
  }
  async function update(save = false) {
    if (busy) return; busy = true;
    panel.querySelectorAll('button').forEach(button => button.disabled = true);
    const out = panel.querySelector('output'); out.textContent = save?'설정 초안 저장 중…':'설정 불러오는 중…'; out.className='';
    try {
      const data = await api(save ? form() : null); revision = data.revision; loaded = true;
      for (const kind of kinds) panel.querySelector(`[data-hyper-rate="${kind}"]`).value = data.settings.rates[kind] ?? '';
      for (const kind of kinds.slice(1,3)) panel.querySelector(`[data-hyper-qty="${kind}"]`).value = data.settings.quantities[kind] ?? '';
      meter(); out.textContent = `${save?'초안 저장 완료. ':''}${data.status.complete?'확률·수량 입력 완료. ':'확률·수량 미설정. '}용병 등급·획득 승인 대기 — 실제 개봉은 잠겨 있습니다.`;
    } catch (error) { out.textContent = error.message; out.className='hyper-admin-error'; }
    finally { busy=false; panel.querySelector('[data-load]').disabled=false; panel.querySelector('[data-save]').disabled=!loaded; }
  }
  function mount() {
    const target = document.getElementById('packManager'); if (!target || panel) return;
    panel = document.createElement('section'); panel.id = 'hyperPackAdmin';
    panel.innerHTML = `<div class="hyper-admin-top"><div><small>EXTREME HYPER PACK / PREPARATION</small><h3>하이퍼팩</h3><p>1회 <b>5억 코인</b> · 최대 10회 <b>50억 코인</b><br>프리미엄 카드팩 판매 종료 → 리미티드·슈퍼스타를 한 칸씩 이동 → 마지막 칸에 하이퍼팩.</p></div><img src="/assets/ui/packs/hyper-pack-v2076.png" alt="하이퍼팩"></div><p>아래 값은 출시 전 초안입니다. 저장해도 개봉되지 않습니다. 용병 등급·개별 획득풀 확정 후 지급 기능을 별도로 연결합니다.</p><div class="hyper-admin-rows">${kinds.map((kind,i)=>`<div class="hyper-admin-row"><b style="color:${colors[i]}">${names[i]}</b><label>등장 확률 %<input type="number" min="0" max="100" step="0.0001" placeholder="미설정" data-hyper-rate="${kind}" aria-label="${names[i]} 등장 확률"></label>${i===1||i===2?`<label>당첨 시 수량<input type="number" min="1" max="1000000" step="1" placeholder="미설정" data-hyper-qty="${kind}" aria-label="${names[i]} 지급 수량"></label>`:`<small>${i===0?'획득 없음':'개별 풀 확정 대기'}</small>`}</div>`).join('')}</div><b data-total>확률 미설정</b><div class="hyper-admin-bar">${colors.map(color=>`<i data-bar style="background:${color}"></i>`).join('')}</div><div class="hyper-admin-actions"><button type="button" data-load>다시 불러오기</button><button type="button" data-save disabled>초안 저장 · 개봉 잠금 유지</button><a href="/preview/hyper-pack-v1/" target="_blank" rel="noopener">1회 / 10회 연출 검수</a></div><output aria-live="polite"></output>`;
    target.before(panel); panel.querySelector('[data-load]').onclick=()=>update(); panel.querySelector('[data-save]').onclick=()=>update(true);
    panel.addEventListener('input',meter);
    const observer = new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&token()&&!loaded&&!busy)void update();}); observer.observe(panel);
  }
  mount(); if (!panel) new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
