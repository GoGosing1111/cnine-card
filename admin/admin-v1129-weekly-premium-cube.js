/* v1129: replace retired high-grade ownership boost CMS with weekly premium cube guarantee settings. */
(() => {
  const defaults={enabled:true,startRate:0.1,incrementRate:0.1,maxRate:10,weeklyLimit:2};
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render(cfg={}){
    const d={...defaults,...cfg};
    document.querySelector('#cubeBoostSettingsPanel')?.remove();
    const base=document.querySelector('#cubeSettingsPanel');
    if(!base)return;
    let panel=document.querySelector('#weeklyPremiumCubeSettingsPanel');
    if(!panel){
      panel=document.createElement('div');
      panel.id='weeklyPremiumCubeSettingsPanel';
      panel.className='panel cubeSettings';
      base.insertAdjacentElement('afterend',panel);
    }
    panel.innerHTML=`<div class="maintenanceHead"><div><small>WEEKLY PREMIUM CUBE</small><h2>프리미엄 큐브 주간 보장</h2><p>PVE·무한의탑·PVP·대장전 참여 완료 시 현재 확률로 판정하며, 실패 시 확률이 상승합니다.</p></div><button id="saveWeeklyPremiumCubeBtn" type="button">주간 보장 설정 저장</button></div>
      <div class="formgrid">
        <label class="field"><span>기능 상태</span><select id="weeklyPremiumEnabled"><option value="1" ${d.enabled?'selected':''}>사용</option><option value="0" ${!d.enabled?'selected':''}>중지</option></select></label>
        <label class="field"><span>시작 확률 (%)</span><input id="weeklyPremiumStart" type="number" min="0.01" max="100" step="0.01" value="${h(d.startRate)}"></label>
        <label class="field"><span>실패 시 상승폭 (%p)</span><input id="weeklyPremiumStep" type="number" min="0" max="100" step="0.01" value="${h(d.incrementRate)}"></label>
        <label class="field"><span>최대 확률 (%)</span><input id="weeklyPremiumMax" type="number" min="0.01" max="100" step="0.01" value="${h(d.maxRate)}"></label>
        <label class="field"><span>주간 최대 획득 수</span><input id="weeklyPremiumLimit" type="number" min="1" max="100" step="1" value="${h(d.weeklyLimit)}"></label>
      </div>
      <div class="inlineNotice">매주 월요일 00:00 KST에 새 주차가 시작됩니다. 큐브 획득 시 확률은 시작 확률로 초기화되며, 기존 MA·FUR·LIMITED 보유량 보정은 사용하지 않습니다.</div>`;
    panel.querySelector('#saveWeeklyPremiumCubeBtn').onclick=save;
  }

  async function save(){
    const payload={
      enabled:document.querySelector('#weeklyPremiumEnabled')?.value==='1',
      startRate:Number(document.querySelector('#weeklyPremiumStart')?.value),
      incrementRate:Number(document.querySelector('#weeklyPremiumStep')?.value),
      maxRate:Number(document.querySelector('#weeklyPremiumMax')?.value),
      weeklyLimit:Number(document.querySelector('#weeklyPremiumLimit')?.value)
    };
    if(!Number.isFinite(payload.startRate)||payload.startRate<=0)return alert('시작 확률을 0보다 크게 입력하세요.');
    if(!Number.isFinite(payload.incrementRate)||payload.incrementRate<0)return alert('상승폭을 0 이상으로 입력하세요.');
    if(!Number.isFinite(payload.maxRate)||payload.maxRate<payload.startRate)return alert('최대 확률은 시작 확률 이상이어야 합니다.');
    if(!Number.isInteger(payload.weeklyLimit)||payload.weeklyLimit<1)return alert('주간 최대 획득 수를 1 이상 정수로 입력하세요.');
    const btn=document.querySelector('#saveWeeklyPremiumCubeBtn');
    if(btn){btn.disabled=true;btn.textContent='저장 중...';}
    try{
      await api('admin/settings',{method:'POST',body:JSON.stringify({weeklyPremiumCube:payload})});
      const verified=await api('admin/settings');
      render(verified.weeklyPremiumCube||payload);
      alert('프리미엄 큐브 주간 보장 설정이 저장되었습니다.');
    }finally{if(btn){btn.disabled=false;btn.textContent='주간 보장 설정 저장';}}
  }

  const oldLoad=window.loadSettings;
  window.loadSettings=async function(){
    const result=await oldLoad.apply(this,arguments);
    try{const d=await api('admin/settings');render(d.weeklyPremiumCube||defaults);}catch(e){console.error(e);}
    return result;
  };
  setTimeout(async()=>{try{const d=await api('admin/settings');render(d.weeklyPremiumCube||defaults);}catch{}},600);
})();
