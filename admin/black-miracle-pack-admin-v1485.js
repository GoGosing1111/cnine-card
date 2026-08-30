(()=>{
  const sources={PVE:'PVE 전투',PVE_AUTO:'PVE 자동전투',PVP:'PVP 승리',TOWER:'무한의 탑',RAID:'레이드',RIFT:'균열',CAPTAIN:'대장전'};
  const rewards={MYTHIC_EQUIPMENT:'신화 장비',MYTHIC_VEHICLE:'신화 이동수단',MASTER_STAR:'마스터의 별',COIN:'코인'};
  const powerControlIds={
    Equipment:{enabled:'bmpPowerEquipmentEnabled',mode:'bmpPowerEquipmentMode',min:'bmpPowerEquipmentMin',max:'bmpPowerEquipmentMax',curve:'bmpPowerEquipmentCurve',floor:'bmpPowerEquipmentFloor',ceiling:'bmpPowerEquipmentCeiling',maxItems:'bmpPowerEquipmentMaxItems'},
    Vehicle:{enabled:'bmpPowerVehicleEnabled',mode:'bmpPowerVehicleMode',min:'bmpPowerVehicleMin',max:'bmpPowerVehicleMax',curve:'bmpPowerVehicleCurve',floor:'bmpPowerVehicleFloor',ceiling:'bmpPowerVehicleCeiling',maxItems:'bmpPowerVehicleMaxItems'},
  };
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const numberValue=(root,id,fallback=0)=>Number(root.querySelector(`#${id}`)?.value??fallback);
  let currentSettings=null;

  async function request(method='GET',body){
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
    const response=await fetch('/api/admin/black-miracle-pack',{method,headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:body?JSON.stringify(body):undefined});
    const data=await response.json();if(!response.ok)throw Error(data.error||'설정을 불러오지 못했습니다.');return data;
  }

  function mount(){
    const host=document.querySelector('#view-settings')||document.querySelector('main');
    if(!host||document.querySelector('#blackMiracleAdmin'))return;
    const section=document.createElement('section');section.id='blackMiracleAdmin';section.className='panel';
    section.innerHTML=`<div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><div><small style="color:#58d9ff;font-weight:900;letter-spacing:.12em">MYTHIC JACKPOT CMS</small><h2>블랙 미라클 팩 관리</h2><p class="muted">전투력 기반 초희귀 보상과 콘텐츠별 팩 드랍을 독립 관리합니다. 개봉 OFF여도 드랍·보유는 유지됩니다.</p></div><img src="../assets/ui/packs/black-miracle-pack-v1485-384.jpg?v=1485" style="width:76px;height:112px;object-fit:cover;border-radius:8px" alt=""></div><div id="blackMiracleBody" class="muted">설정을 불러오는 중입니다.</div>`;
    host.append(section);load();
  }

  function groupControls(kind,label,config){
    const ids=powerControlIds[kind];
    return `<section style="margin:18px 0;padding:16px;border:1px solid rgba(88,217,255,.22);border-radius:10px"><h4 style="margin-top:0">${label} 자동 획득률</h4><div class="form-grid">
      <label>풀 사용<select id="${ids.enabled}"><option value="1">사용</option><option value="0">제외</option></select></label>
      <label>설정 방식<select id="${ids.mode}"><option value="AUTO">AUTO · 전투력 자동</option><option value="HYBRID">HYBRID · 자동+개별</option><option value="MANUAL">MANUAL · 개별만</option></select></label>
      <label>최저 획득률 (%)<input id="${ids.min}" type="number" min="0.01" max="0.1" step="0.001" value="${config.minRatePercent}"></label>
      <label>최고 획득률 (%)<input id="${ids.max}" type="number" min="0.01" max="0.1" step="0.001" value="${config.maxRatePercent}"></label>
      <label>전투력 곡선<select id="${ids.curve}"><option value="LINEAR">LINEAR</option><option value="EASE_IN">EASE IN</option><option value="EASE_OUT">EASE OUT</option></select></label>
      <label>전투력 하한 (0=자동)<input id="${ids.floor}" type="number" min="0" step="1" value="${config.powerFloor}"></label>
      <label>전투력 상한 (0=자동)<input id="${ids.ceiling}" type="number" min="0" step="1" value="${config.powerCeiling}"></label>
      <label>최대 대상 수 (0=전체)<input id="${ids.maxItems}" type="number" min="0" step="1" value="${config.maxItems}"></label>
    </div></section>`;
  }

  function catalogRows(entries,type,group){
    if(!entries?.length)return `<p class="muted">공개·활성 신화 ${type==='EQUIPMENT'?'장비':'이동수단'}가 없습니다.</p>`;
    return `<div class="table"><div class="tr"><b>보상 / 전투력</b><b>포함</b><b>개별 획득률 (%)</b><b>서버 적용률</b></div>${entries.map(item=>{
      const key=`${type}:${item.id}`,override=item.overrideRatePercent;
      const checked=group?.mode==='MANUAL'?item.selected:item.enabled!==false;
      return `<div class="tr" data-bmp-power-item="${esc(key)}"><span><b>${esc(item.name||item.code||item.id)}</b><small style="display:block">총 ${Number(item.totalPower||0).toLocaleString()} · PVE ${Number(item.pvePower||0).toLocaleString()} · PVP ${Number(item.pvpPower||0).toLocaleString()}</small></span><label><input type="checkbox" data-bmp-power-enabled ${checked?'checked':''}> 사용</label><input type="number" data-bmp-power-rate min="0.01" max="0.1" step="0.001" value="${override==null?'':Number(override)}" placeholder="AUTO ${Number(item.automaticRatePercent||item.configuredDropRatePercent||0).toFixed(3)}"><span data-bmp-rate-preview data-rate="${Number(item.dropRatePercent||0)}">${item.included?`${Number(item.dropRatePercent||0).toFixed(4)}%`:'제외'}</span></div>`;
    }).join('')}</div>`;
  }

  async function load(){
    const body=document.querySelector('#blackMiracleBody');if(!body)return;
    try{
      const data=await request(),settings=data.settings,power=settings.powerRewards,catalog=data.powerCatalog||{};currentSettings=settings;
      body.innerHTML=`<div class="form-grid"><label>인벤토리 개봉 사용<select id="bmpEnabled"><option value="1">사용</option><option value="0">중지 (드랍 유지)</option></select></label><label>팩 이름<input id="bmpName" value="${esc(settings.name)}"></label><label>미보유 신화 없음 대체 별<input id="bmpFallback" type="number" min="1" value="${Number(settings.fallbackMasterStars)}"></label><label>선택 카드 수 (3~7)<input id="bmpCardCount" type="number" min="3" max="7" step="1" value="${Number(settings.presentation?.cardCount||5)}"></label></div>
      <h3>콘텐츠별 팩 드랍</h3><div class="table"><div class="tr"><b>콘텐츠</b><b>사용</b><b>확률 (%)</b><b>수량</b></div>${Object.entries(sources).map(([key,label])=>`<div class="tr" data-bmp-source="${key}"><span>${label}</span><select><option value="1">ON</option><option value="0">OFF</option></select><input type="number" min="0" max="100" step="0.001" value="${settings.sources[key].rate}"><input type="number" min="1" max="10" value="${settings.sources[key].quantity}"></div>`).join('')}</div>
      <h3>전투력 기반 초희귀 보상</h3><p class="muted">각 항목은 팩 1개 기준 절대 확률입니다. 총 전투력이 높을수록 자동 획득률이 낮아지며 0.01%~0.1% 안에서 계산됩니다. 실패 구간은 아래 마스터의 별/코인 비중으로 채웁니다.</p><div class="form-grid"><label>전투력 자동 획득<select id="bmpPowerEnabled"><option value="1">AUTO 사용</option><option value="0">LEGACY 25%/15%</option></select></label><label>희귀 보상 합산 상한 (%)<input id="bmpPowerMaxTotal" type="number" min="0.01" max="100" step="0.001" value="${power.maxTotalRatePercent}"></label></div>
      ${groupControls('Equipment','신화 장비',power.equipment)}${groupControls('Vehicle','신화 이동수단',power.vehicle)}
      <h4>신화 장비 상세 설정</h4>${catalogRows(catalog.equipment,'EQUIPMENT',power.equipment)}<h4>신화 이동수단 상세 설정</h4>${catalogRows(catalog.vehicle,'VEHICLE',power.vehicle)}
      <p id="bmpPowerTotal">현재 서버 적용 희귀 합계: ${Number(data.totalRareRatePercent||0).toFixed(4)}% · 설정 미리보기 ${Number(data.previewTotalRareRatePercent||0).toFixed(4)}%${Number(catalog.excludedByCap||0)>0?` · 합산 상한으로 ${Number(catalog.excludedByCap)}개 제외`:''}</p>
      <h3>LEGACY 및 실패 보상 비중</h3><div class="table"><div class="tr"><b>보상</b><b>비중 / 확률 (%)</b><b>최소 수량</b><b>최대 수량</b></div>${Object.entries(rewards).map(([key,label])=>{const value=settings.rewards[key];return `<div class="tr" data-bmp-reward="${key}"><span>${label}</span><input type="number" min="0" max="100" step="0.01" value="${value.rate}">${value.min?`<input type="number" min="1" value="${value.min}"><input type="number" min="1" value="${value.max}">`:'<span>-</span><span>-</span>'}</div>`}).join('')}</div><p id="bmpTotal"></p><button class="btn" id="bmpSave">블랙 미라클 팩 설정 저장</button>`;
      body.querySelector('#bmpEnabled').value=settings.enabled?'1':'0';body.querySelector('#bmpPowerEnabled').value=power.enabled?'1':'0';
      for(const [key,value] of Object.entries(settings.sources))body.querySelector(`[data-bmp-source="${key}"] select`).value=value.enabled?'1':'0';
      for(const [kind,config] of [['Equipment',power.equipment],['Vehicle',power.vehicle]]){body.querySelector(`#bmpPower${kind}Enabled`).value=config.enabled?'1':'0';body.querySelector(`#bmpPower${kind}Mode`).value=config.mode;body.querySelector(`#bmpPower${kind}Curve`).value=config.curve;}
      body.querySelectorAll('[data-bmp-reward] input:first-of-type').forEach(input=>input.oninput=total);
      body.querySelector('#bmpPowerEnabled').onchange=total;
      body.querySelectorAll('[data-bmp-power-rate]').forEach(input=>input.oninput=()=>{const preview=input.closest('[data-bmp-power-item]')?.querySelector('[data-bmp-rate-preview]');if(preview)preview.textContent=input.value?`${Number(input.value).toFixed(4)}%`:`AUTO ${Number(preview.dataset.rate||0).toFixed(4)}%`;});
      body.querySelector('#bmpSave').onclick=save;total();
    }catch(error){body.innerHTML=`<div class="muted">${esc(error.message)}</div>`;}
  }

  function total(){const body=document.querySelector('#blackMiracleBody');if(!body)return;const rows=[...body.querySelectorAll('[data-bmp-reward]')],rates=Object.fromEntries(rows.map(row=>[row.dataset.bmpReward,Number(row.querySelector('input')?.value||0)])),value=Object.values(rates).reduce((sum,rate)=>sum+rate,0),filler=Number(rates.MASTER_STAR||0)+Number(rates.COIN||0),legacy=body.querySelector('#bmpPowerEnabled')?.value==='0',target=body.querySelector('#bmpTotal');if(target){target.textContent=legacy?`LEGACY 보상 확률 합계: ${value.toFixed(2)}%`:`실패 보상 가중치: 마스터의 별 ${Number(rates.MASTER_STAR||0).toFixed(2)} + 코인 ${Number(rates.COIN||0).toFixed(2)} = ${filler.toFixed(2)}`;target.style.color=legacy?(Math.abs(value-100)<.001?'#63efac':'#ff7272'):(filler>0?'#63efac':'#ff7272');}}

  function readPowerGroup(body,kind){
    const ids=powerControlIds[kind],overrides={},mode=body.querySelector(`#${ids.mode}`).value;
    body.querySelectorAll(`[data-bmp-power-item^="${kind==='Equipment'?'EQUIPMENT':'VEHICLE'}:"]`).forEach(row=>{const id=row.dataset.bmpPowerItem.split(':').slice(1).join(':'),enabled=row.querySelector('[data-bmp-power-enabled]').checked,rateInput=row.querySelector('[data-bmp-power-rate]'),override={enabled};if(rateInput.value!=='')override.rate=Number(rateInput.value);if(!enabled||rateInput.value!==''||mode==='MANUAL'&&enabled)overrides[id]=override;});
    return {enabled:body.querySelector(`#${ids.enabled}`).value==='1',mode,minRatePercent:numberValue(body,ids.min),maxRatePercent:numberValue(body,ids.max),curve:body.querySelector(`#${ids.curve}`).value,powerFloor:numberValue(body,ids.floor),powerCeiling:numberValue(body,ids.ceiling),maxItems:numberValue(body,ids.maxItems),overrides};
  }

  async function save(){
    const body=document.querySelector('#blackMiracleBody');if(!body||!currentSettings)return;
    const settings={...currentSettings,enabled:body.querySelector('#bmpEnabled').value==='1',name:body.querySelector('#bmpName').value,fallbackMasterStars:numberValue(body,'bmpFallback'),presentation:{cardCount:numberValue(body,'bmpCardCount')},sources:{},rewards:{},powerRewards:{enabled:body.querySelector('#bmpPowerEnabled').value==='1',maxTotalRatePercent:numberValue(body,'bmpPowerMaxTotal'),equipment:readPowerGroup(body,'Equipment'),vehicle:readPowerGroup(body,'Vehicle')}};
    body.querySelectorAll('[data-bmp-source]').forEach(row=>{const [enabled,rate,quantity]=row.querySelectorAll('select,input');settings.sources[row.dataset.bmpSource]={enabled:enabled.value==='1',rate:Number(rate.value),quantity:Number(quantity.value)};});
    body.querySelectorAll('[data-bmp-reward]').forEach(row=>{const inputs=row.querySelectorAll('input'),value={rate:Number(inputs[0].value)};if(inputs.length>1){value.min=Number(inputs[1].value);value.max=Number(inputs[2].value);}settings.rewards[row.dataset.bmpReward]=value;});
    try{await request('PATCH',{settings});alert('블랙 미라클 팩 설정을 저장했습니다.');await load();}catch(error){alert(error.message);}
  }

  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
})();

// Keep the pack controls as a first-class CMS menu instead of burying them in global settings.
(()=>{
  function promoteBlackMiracleCms(){
    const nav=document.querySelector('#nav'),settingsButton=nav?.querySelector('[data-view="settings"]');
    if(nav&&!nav.querySelector('[data-view="blackmiracle"]')){const button=document.createElement('button');button.dataset.view='blackmiracle';button.innerHTML='블랙 미라클 팩 <span class="buildBadge">NEW</span>';nav.insertBefore(button,settingsButton||null);button.onclick=()=>{document.querySelectorAll('.view').forEach(view=>view.hidden=view.id!=='view-blackmiracle');document.querySelectorAll('#nav button').forEach(item=>item.classList.toggle('active',item===button));};}
    let view=document.querySelector('#view-blackmiracle');if(!view){view=document.createElement('section');view.className='view';view.id='view-blackmiracle';view.hidden=true;view.innerHTML='<div class="sectionIntro"><div><small>MYTHIC JACKPOT CONTROL</small><h2>블랙 미라클 팩 관리 <span class="buildBadge">NEW</span></h2><p>전투력 기반 자동 획득률과 콘텐츠별 팩 드랍을 관리합니다.</p></div></div><div id="blackMiracleAdminRoot"></div>';document.querySelector('main')?.append(view);}
    const panel=document.querySelector('#blackMiracleAdmin'),root=document.querySelector('#blackMiracleAdminRoot');if(panel&&root&&panel.parentElement!==root)root.append(panel);
  }
  new MutationObserver(promoteBlackMiracleCms).observe(document.documentElement,{childList:true,subtree:true});promoteBlackMiracleCms();
})();
