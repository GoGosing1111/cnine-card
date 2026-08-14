/* Nightmare PVE control: independent difficulty profile + monster assignment helper. */
(()=>{
  const $=selector=>document.querySelector(selector);
  let loading=false;
  let pendingMonsterId=null;
  let monsterPveTabs=new Map();

  function ensureNightmareOption(){
    const select=$('#muPveTab');
    if(!select)return;
    if(!select.querySelector('option[value="NIGHTMARE"]')){
      const option=document.createElement('option');option.value='NIGHTMARE';option.textContent='나이트메어';select.append(option);
    }
    const form=select.closest('form');
    if(form&&!form.dataset.nightmareTabInitialized){
      const saved=monsterPveTabs.get(Number(pendingMonsterId));
      if(saved==='NIGHTMARE')select.value='NIGHTMARE';
      form.dataset.nightmareTabInitialized='1';
    }
  }

  function ensurePanel(){
    const view=$('#view-battle');if(!view)return null;
    let panel=$('#nightmareBattleSettings');if(panel)return panel;
    panel=document.createElement('section');
    panel.id='nightmareBattleSettings';panel.className='panel nightmareAdminPanel';
    panel.innerHTML=`
      <header class="nightmareAdminHead">
        <div class="nightmareAdminSeal" aria-hidden="true"><i></i><b>N</b></div>
        <div><small>PVE NIGHTMARE PROTOCOL</small><h2>나이트메어 전용 난이도</h2><p>기존 몬스터 이미지는 유지하고, 나이트메어 지정 시 인게임 표식·전용 전투 효과와 아래 배율이 자동 적용됩니다.</p></div>
        <span id="nightmareSaveState" class="nightmareState">불러오는 중</span>
      </header>
      <div class="nightmareAdminGrid">
        <label><span>나이트메어 운영</span><select id="nightmareEnabled"><option value="1">ON · 공개</option><option value="0">OFF · 숨김</option></select></label>
        <label><span>몬스터 HP 배율</span><div><input id="nightmareHp" type="number" min="100" max="1000" step="1"><em>%</em></div></label>
        <label><span>공격력 배율</span><div><input id="nightmareAttack" type="number" min="100" max="1000" step="1"><em>%</em></div></label>
        <label><span>방어력 배율</span><div><input id="nightmareDefense" type="number" min="100" max="1000" step="1"><em>%</em></div></label>
        <label><span>행동속도 배율</span><div><input id="nightmareSpeed" type="number" min="100" max="300" step="1"><em>%</em></div></label>
        <label><span>코인 보상 배율</span><div><input id="nightmareReward" type="number" min="100" max="2000" step="1"><em>%</em></div></label>
        <label><span>보스 궁극기 제한</span><select id="nightmareUltimateUnlocked"><option value="1">해제 · 전용 피해 적용</option><option value="0">기존 100% 제한</option></select></label>
        <label class="nightmareDangerField"><span>나이트메어 궁극기 피해</span><div><input id="nightmareUltimateDamage" type="number" min="100" max="500" step="1"><em>%</em></div><small>제한 해제 시 몬스터별 100% 입력 대신 이 수치를 사용합니다.</small></label>
      </div>
      <div class="nightmareAdminFoot"><p><b>자동 지정 대상</b><span>조로 · 사스케 · 이타치 · 젠이츠 · 코쥬로/쿄쥬로 · 슌스이 · 암부 · 셋쇼마루 · 루피</span></p><button type="button" id="saveNightmareSettings">나이트메어 설정 저장</button></div>`;
    const anchor=view.querySelector('.sectionIntro');
    if(anchor?.nextSibling)view.insertBefore(panel,anchor.nextSibling);else view.prepend(panel);
    $('#saveNightmareSettings').onclick=saveNightmare;
    return panel;
  }

  function renderNightmare(value={}){
    ensurePanel();
    $('#nightmareEnabled').value=value.enabled===false?'0':'1';
    $('#nightmareHp').value=Number(value.hpPercent??200);
    $('#nightmareAttack').value=Number(value.attackPercent??160);
    $('#nightmareDefense').value=Number(value.defensePercent??150);
    $('#nightmareSpeed').value=Number(value.speedPercent??120);
    $('#nightmareReward').value=Number(value.rewardPercent??250);
    $('#nightmareUltimateUnlocked').value=value.bossUltimateUnlocked===false?'0':'1';
    $('#nightmareUltimateDamage').value=Number(value.bossUltimateCapPercent??120);
  }

  async function loadNightmare(){
    if(loading||!ensurePanel()||document.body.classList.contains('auth-guest'))return;
    loading=true;const state=$('#nightmareSaveState');
    try{state.textContent='서버 확인 중';const data=await api('admin/battle');monsterPveTabs=new Map((data.monsters||[]).map(monster=>[Number(monster.id),String(monster.pveTab||'NORMAL').toUpperCase()]));renderNightmare(data.settings?.nightmare||{});state.textContent='D1 연결 완료';state.classList.add('ok')}
    catch(error){state.textContent='불러오기 실패';state.classList.remove('ok');console.error('nightmare admin load failed',error)}
    finally{loading=false}
  }

  async function saveNightmare(){
    const button=$('#saveNightmareSettings'),state=$('#nightmareSaveState');
    const nightmare={
      enabled:$('#nightmareEnabled').value==='1',hpPercent:Number($('#nightmareHp').value),attackPercent:Number($('#nightmareAttack').value),defensePercent:Number($('#nightmareDefense').value),speedPercent:Number($('#nightmareSpeed').value),rewardPercent:Number($('#nightmareReward').value),bossUltimateUnlocked:$('#nightmareUltimateUnlocked').value==='1',bossUltimateCapPercent:Number($('#nightmareUltimateDamage').value)
    };
    button.disabled=true;button.textContent='저장·재검증 중';state.textContent='저장 중';
    try{
      const saved=await api('admin/battle',{method:'PATCH',body:JSON.stringify({nightmare})});
      renderNightmare(saved.nightmare||saved.settings?.nightmare||nightmare);state.textContent='저장 검증 완료';state.classList.add('ok');
      alert('나이트메어 전용 난이도가 저장되었고 서버 재조회 검증까지 완료되었습니다.');
    }catch(error){state.textContent='저장 실패';state.classList.remove('ok');alert(error.message||error)}
    finally{button.disabled=false;button.textContent='나이트메어 설정 저장'}
  }

  const observer=new MutationObserver(()=>{ensureNightmareOption();ensurePanel()});
  const monsterMount=$('#monsterManagementMount');
  if(monsterMount)observer.observe(monsterMount,{subtree:true,childList:true});
  document.addEventListener('click',event=>{
    const edit=event.target.closest?.('[data-monster-edit]');
    if(edit){pendingMonsterId=Number(edit.dataset.monsterEdit||0);if(!monsterPveTabs.size)api('admin/battle').then(data=>{monsterPveTabs=new Map((data.monsters||[]).map(monster=>[Number(monster.id),String(monster.pveTab||'NORMAL').toUpperCase()]));ensureNightmareOption()}).catch(()=>{});else setTimeout(ensureNightmareOption,0)}
    if(event.target.closest?.('#monsterCreateV1045'))pendingMonsterId=0;
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    const view=$('#view-battle');ensurePanel();ensureNightmareOption();
    if(view)new MutationObserver(()=>{if(!view.hidden)loadNightmare()}).observe(view,{attributes:true,attributeFilter:['hidden']});
    $('#nav button[data-view="battle"]')?.addEventListener('click',()=>setTimeout(loadNightmare,0));
  });
  window.loadNightmareAdminV1692=loadNightmare;
})();
