(()=>{
  const num=value=>Number(value||0).toLocaleString();
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isPrestige=type=>String(type||'SSR_TO_MA')==='MA_TO_PRESTIGE';
  const typeLabel=type=>isPrestige(type)?'MA +13 → PRESTIGE':'SSR +10 → MA';

  function logMeta(row){
    if(isPrestige(row.evolution_type)){
      return `마스터의 별 ${num(row.master_star_cost)}개 · 성공률 ${num(row.success_rate)}% · ${num(row.attempt_no)}회차${row.is_pity?' · 천장':''} · 원본 카드 ${row.source_consumed?'소모':'유지'}`;
    }
    return `${num(row.coin_cost)}코인 · 카드조각 ${num(row.shard_cost)}개 · ${num(row.attempt_no)}회차${row.is_pity?' · 천장':''}`;
  }

  async function load(){
    const state=document.getElementById('evolutionCmsState');
    if(!state)return;
    try{
      const data=await api('admin/evolution/settings');
      const settings=data.settings||{};
      document.getElementById('evolutionEnabled').value=settings.enabled?'ON':'OFF';
      document.getElementById('evolutionCoinCost').value=Number(settings.coinCost||0);
      document.getElementById('evolutionShardCost').value=Number(settings.shardCost||0);
      document.getElementById('evolutionSuccessRate').value=Number(settings.successRate||0);
      document.getElementById('evolutionPityAttempts').value=Number(settings.pityAttempts||10);
      document.getElementById('evolutionPrestigeStarCost').value=Number(settings.maToPrestigeMasterStarCost||1);
      document.getElementById('evolutionPrestigeSuccessRate').value=Number(settings.maToPrestigeSuccessRate??100);
      document.getElementById('evolutionPrestigePityAttempts').value=Number(settings.maToPrestigePityAttempts||10);
      state.textContent=settings.enabled?'운영 중':'중지';
      state.className='statusPill '+(settings.enabled?'on':'off');

      const logs=document.getElementById('evolutionCmsLogs');
      logs.innerHTML=data.logs?.length?data.logs.map(row=>`<div class="evolutionCmsLog ${row.is_success?'success':''}"><div><b>${esc(row.nickname)}</b><span>${esc(row.source_title)} · ${typeLabel(row.evolution_type)}</span></div><strong>${row.is_success?`성공 · ${esc(row.reward_title||'결과 미확인')}${row.reward_duplicate?' (중복)':''}`:'실패'}</strong><small>${logMeta(row)} · ${new Date(row.created_at+'Z').toLocaleString()}</small></div>`).join(''):'<div class="muted">아직 진화 기록이 없습니다.</div>';
    }catch(error){
      state.textContent=error.message;
      state.className='statusPill off';
    }
  }

  function mount(){
    const view=document.getElementById('view-cards');
    if(!view||document.getElementById('evolutionCmsPanel'))return;
    const panel=document.createElement('div');
    panel.id='evolutionCmsPanel';
    panel.className='panel evolutionCmsPanelV1158';
    panel.innerHTML=`<div class="maintenanceHead"><div><small>STANDARD + PRESTIGE EVOLUTION</small><h2>카드 진화 설정</h2><p>SSR → MA와 MA +13 → PRESTIGE의 성공 확률·천장을 각각 관리합니다. PRESTIGE 진화 재료는 마스터의 별입니다.</p></div><span id="evolutionCmsState" class="statusPill off">불러오는 중</span></div><div class="evolutionCmsRouteGrid"><section><header><small>STANDARD EVOLUTION</small><h3>SSR +10 → MA</h3><p>실패 시 코인과 카드조각만 소모되며 원본 카드는 유지됩니다.</p></header><div class="formgrid evolutionCmsLegacyGrid"><label class="field"><span>1회 코인 비용</span><input id="evolutionCoinCost" type="number" min="0" step="1"></label><label class="field"><span>1회 카드조각 비용</span><input id="evolutionShardCost" type="number" min="0" step="1"></label><label class="field"><span>기본 성공 확률 (%)</span><input id="evolutionSuccessRate" type="number" min="0" max="100" step="0.1"></label><label class="field"><span>천장 회차</span><input id="evolutionPityAttempts" type="number" min="1" max="100" step="1"><small>현재 운영 기준 10회</small></label></div></section><section class="prestige"><header><small>PRESTIGE ASCENSION</small><h3>MA +13 → PRESTIGE</h3><p>실패 시 마스터의 별만 소모되고 MA +13 카드는 유지됩니다. 성공 시에만 원본 카드가 소모됩니다.</p></header><div class="formgrid evolutionCmsPrestigeGrid"><label class="field"><span>마스터의 별 소모량</span><input id="evolutionPrestigeStarCost" type="number" min="1" max="9999" step="1"><small>PRESTIGE 진화 1회당 소모 수량</small></label><label class="field"><span>기본 성공 확률 (%)</span><input id="evolutionPrestigeSuccessRate" type="number" min="0" max="100" step="0.1"><small>천장 회차 전까지 적용됩니다.</small></label><label class="field"><span>확정 천장 회차</span><input id="evolutionPrestigePityAttempts" type="number" min="1" max="100" step="1"><small>해당 회차에는 성공 확정</small></label></div></section></div><div class="formgrid evolutionCmsGlobalGrid"><label class="field"><span>진화 운영</span><select id="evolutionEnabled"><option value="ON">ON · 사용</option><option value="OFF">OFF · 중지</option></select></label></div><div class="evolutionCmsNotice"><b>처리 기준</b><span>SSR 진화는 기존 10회 천장 누적을 유지합니다. PRESTIGE 진화는 매 시도 마스터의 별을 차감하며, 실패 시 MA +13 카드는 유지됩니다. 천장 성공 시를 포함해 성공한 경우에만 원본 카드 소모와 결과 지급이 서버에서 함께 처리됩니다.</span></div><button id="saveEvolutionCms">진화 설정 저장</button><div class="maintenanceHead evolutionLogHead"><div><h3>최근 진화 기록</h3><p>최근 50건의 경로별 재료 사용과 성공·실패 기록입니다.</p></div><button type="button" class="ghost" id="refreshEvolutionLogs">새로고침</button></div><div id="evolutionCmsLogs"></div>`;
    view.insertBefore(panel,view.firstElementChild);

    document.getElementById('saveEvolutionCms').onclick=async()=>{
      const payload={
        enabled:document.getElementById('evolutionEnabled').value==='ON',
        coinCost:Number(document.getElementById('evolutionCoinCost').value),
        shardCost:Number(document.getElementById('evolutionShardCost').value),
        successRate:Number(document.getElementById('evolutionSuccessRate').value),
        pityAttempts:Number(document.getElementById('evolutionPityAttempts').value),
        maToPrestigeMasterStarCost:Number(document.getElementById('evolutionPrestigeStarCost').value),
        maToPrestigeSuccessRate:Number(document.getElementById('evolutionPrestigeSuccessRate').value),
        maToPrestigePityAttempts:Number(document.getElementById('evolutionPrestigePityAttempts').value)
      };
      if(payload.coinCost<0||payload.shardCost<0)return alert('코인과 카드조각 비용은 0 이상이어야 합니다.');
      if(payload.successRate<0||payload.successRate>100)return alert('성공 확률은 0~100 사이여야 합니다.');
      if(payload.pityAttempts<1)return alert('천장 회차는 1회 이상이어야 합니다.');
      if(payload.maToPrestigeMasterStarCost<1)return alert('PRESTIGE 진화의 마스터의 별 소모량은 1개 이상이어야 합니다.');
      if(payload.maToPrestigeSuccessRate<0||payload.maToPrestigeSuccessRate>100)return alert('PRESTIGE 진화 성공 확률은 0~100 사이여야 합니다.');
      if(payload.maToPrestigePityAttempts<1)return alert('PRESTIGE 진화 천장 회차는 1회 이상이어야 합니다.');
      try{
        await api('admin/evolution/settings',{method:'PATCH',body:JSON.stringify(payload)});
        alert('진화 설정이 저장되었습니다.');
        load();
      }catch(error){alert(error.message)}
    };
    document.getElementById('refreshEvolutionLogs').onclick=load;
    load();
  }

  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  mount();
})();
