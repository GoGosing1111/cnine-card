/* Nightmare PVE control: per-boss combat profiles and dedicated unified drops. */
(()=>{
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token=()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  const dropApi=async(body=null)=>{const response=await fetch('/api/admin/drop-pools',{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers:{'content-type':'application/json',...(token()?{authorization:`Bearer ${token()}`}:{})},...(body?{body:JSON.stringify(body)}:{})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'통합 드랍풀 요청에 실패했습니다.');return data};
  let loading=false,pendingMonsterId=null,monsterPveTabs=new Map(),battleData={settings:{nightmare:{}},monsters:[]},dropState={pools:[],bindings:[]},refreshTimer=0;

  function ensureNightmareOption(){
    const select=$('#muPveTab');if(!select)return;
    if(!select.querySelector('option[value="NIGHTMARE"]')){const option=document.createElement('option');option.value='NIGHTMARE';option.textContent='나이트메어 전용';select.append(option)}
    const form=select.closest('form');if(!form)return;
    if(!form.dataset.nightmareTabInitialized){
      const saved=monsterPveTabs.get(Number(pendingMonsterId));if(saved==='NIGHTMARE')select.value='NIGHTMARE';
      select.addEventListener('change',()=>{if(select.value!=='NIGHTMARE')return;const boss=form.querySelector('#muBoss'),category=form.querySelector('#muCategory'),pve=form.querySelector('#muPveEnabled'),towerOnly=form.querySelector('#muTowerOnly');if(boss)boss.value='1';if(category)category.value='BOSS';if(pve)pve.checked=true;if(towerOnly)towerOnly.checked=false});
      form.dataset.nightmareTabInitialized='1';
    }
  }

  function ensurePanel(){
    const view=$('#view-battle');if(!view)return null;
    let panel=$('#nightmareBattleSettings');if(panel)return panel;
    panel=document.createElement('section');panel.id='nightmareBattleSettings';panel.className='panel nightmareAdminPanel';
    panel.innerHTML=`<header class="nightmareAdminHead"><div class="nightmareAdminSeal" aria-hidden="true"><i></i><b>N</b></div><div><small>PVE NIGHTMARE PROTOCOL</small><h2>나이트메어 상세 설정</h2><p>나이트메어 전용 보스마다 전투 능력치와 통합 드랍풀을 독립적으로 지정합니다.</p></div><span id="nightmareSaveState" class="nightmareState">불러오는 중</span></header>
      <div class="nightmareAdminGrid"><label><span>나이트메어 운영</span><select id="nightmareEnabled"><option value="1">ON · 공개</option><option value="0">OFF · 숨김</option></select></label><label><span>기본 HP 배율</span><div><input id="nightmareHp" type="number" min="100" max="1000"><em>%</em></div></label><label><span>기본 공격력 배율</span><div><input id="nightmareAttack" type="number" min="100" max="1000"><em>%</em></div></label><label><span>기본 방어력 배율</span><div><input id="nightmareDefense" type="number" min="100" max="1000"><em>%</em></div></label><label><span>기본 행동속도 배율</span><div><input id="nightmareSpeed" type="number" min="100" max="300"><em>%</em></div></label><label><span>기본 코인 보상 배율</span><div><input id="nightmareReward" type="number" min="100" max="2000"><em>%</em></div></label><label><span>보스 궁극기 제한</span><select id="nightmareUltimateUnlocked"><option value="1">해제 · 개별 피해 적용</option><option value="0">기존 100% 제한</option></select></label><label class="nightmareDangerField"><span>기본 궁극기 피해</span><div><input id="nightmareUltimateDamage" type="number" min="100" max="500"><em>%</em></div></label></div>
      <section class="nightmareBossDetail"><div class="nightmareDetailHead"><div><small>INDIVIDUAL BOSS PROFILES</small><h3>나이트메어 보스별 설정</h3><p>개별값이 저장된 보스는 위 기본값 대신 아래 수치가 적용됩니다. 드랍풀 미지정 시 기존 일반 PVE 통합드랍을 유지합니다.</p></div><button type="button" class="ghost" id="refreshNightmareSettings">새로고침</button></div><div id="nightmareBossRows" class="nightmareBossRows"></div></section>
      <div class="nightmareAdminFoot"><p><b>새 보스 추가 방법</b><span>몬스터 관리에서 보스 생성 후 유저 PVE 노출 탭을 ‘나이트메어 전용’으로 선택하세요.</span></p><button type="button" id="saveNightmareSettings">상세 설정 전체 저장</button></div>`;
    const anchor=view.querySelector('.sectionIntro');if(anchor?.nextSibling)view.insertBefore(panel,anchor.nextSibling);else view.prepend(panel);
    $('#saveNightmareSettings').onclick=saveNightmare;$('#refreshNightmareSettings').onclick=loadNightmare;return panel;
  }

  function profileFor(monster,nightmare){const saved=nightmare.bossProfiles?.[String(monster.id)]||{};return {battlePower:Number(saved.battlePower??monster.battlePower??1),rewardCoin:Number(saved.rewardCoin??monster.rewardCoin??0),hpPercent:Number(saved.hpPercent??nightmare.hpPercent??200),attackPercent:Number(saved.attackPercent??nightmare.attackPercent??160),defensePercent:Number(saved.defensePercent??nightmare.defensePercent??150),speedPercent:Number(saved.speedPercent??nightmare.speedPercent??120),rewardPercent:Number(saved.rewardPercent??nightmare.rewardPercent??250),bossUltimateCapPercent:Number(saved.bossUltimateCapPercent??nightmare.bossUltimateCapPercent??120)}}
  function selectedPoolId(monsterId){const row=(dropState.bindings||[]).find(binding=>['PVE_NIGHTMARE','PVE_NIGHTMARE_AUTO'].includes(String(binding.source_type))&&String(binding.source_id)===String(monsterId)&&Number(binding.is_enabled)!==0);return Number(row?.pool_id||0)}
  function poolOptions(selected){return `<option value="0">미지정 · 기존 PVE 드랍 사용</option>${(dropState.pools||[]).map(pool=>`<option value="${Number(pool.id)}" ${Number(pool.id)===Number(selected)?'selected':''}>${esc(pool.name)} · ${esc(pool.code)}${Number(pool.is_enabled)?'':' (중지)'}</option>`).join('')}`}
  function renderBossRows(nightmare){
    const root=$('#nightmareBossRows');if(!root)return;
    const bosses=(battleData.monsters||[]).filter(monster=>String(monster.pveTab||'').toUpperCase()==='NIGHTMARE'&&Boolean(Number(monster.isBoss)));
    root.innerHTML=bosses.length?bosses.map(monster=>{const value=profileFor(monster,nightmare);return `<article class="nightmareBossRow" data-nightmare-boss="${Number(monster.id)}"><div class="nightmareBossIdentity">${monster.image?`<img src="/${esc(String(monster.image).replace(/^\/+/,''))}" alt="">`:'<i>N</i>'}<span><small>BOSS #${Number(monster.id)}</small><b>${esc(monster.name)}</b></span></div><label><span>기본 전투력</span><input data-nm-power type="number" min="1" max="1000000000" value="${value.battlePower}"></label><label><span>기본 코인</span><input data-nm-coin type="number" min="0" max="1000000000" value="${value.rewardCoin}"></label><label><span>HP %</span><input data-nm-hp type="number" min="100" max="1000" value="${value.hpPercent}"></label><label><span>공격 %</span><input data-nm-attack type="number" min="100" max="1000" value="${value.attackPercent}"></label><label><span>방어 %</span><input data-nm-defense type="number" min="100" max="1000" value="${value.defensePercent}"></label><label><span>속도 %</span><input data-nm-speed type="number" min="100" max="300" value="${value.speedPercent}"></label><label><span>코인 %</span><input data-nm-reward type="number" min="100" max="2000" value="${value.rewardPercent}"></label><label><span>궁극기 %</span><input data-nm-ultimate type="number" min="100" max="500" value="${value.bossUltimateCapPercent}"></label><label class="nightmareDropSelect"><span>전용 통합드랍</span><select data-nm-drop>${poolOptions(selectedPoolId(monster.id))}</select></label></article>`}).join(''):'<div class="nightmareBossEmpty"><b>나이트메어 전용 보스가 없습니다.</b><span>몬스터 관리에서 새 보스의 PVE 노출 탭을 나이트메어 전용으로 지정하면 여기에 나타납니다.</span></div>';
  }

  function renderNightmare(value={}){ensurePanel();$('#nightmareEnabled').value=value.enabled===false?'0':'1';$('#nightmareHp').value=Number(value.hpPercent??200);$('#nightmareAttack').value=Number(value.attackPercent??160);$('#nightmareDefense').value=Number(value.defensePercent??150);$('#nightmareSpeed').value=Number(value.speedPercent??120);$('#nightmareReward').value=Number(value.rewardPercent??250);$('#nightmareUltimateUnlocked').value=value.bossUltimateUnlocked===false?'0':'1';$('#nightmareUltimateDamage').value=Number(value.bossUltimateCapPercent??120);renderBossRows(value)}

  async function loadNightmare(){
    if(loading||!ensurePanel()||document.body.classList.contains('auth-guest'))return;loading=true;const state=$('#nightmareSaveState');
    try{state.textContent='서버 확인 중';[battleData,dropState]=await Promise.all([api('admin/battle'),dropApi()]);monsterPveTabs=new Map((battleData.monsters||[]).map(monster=>[Number(monster.id),String(monster.pveTab||'NORMAL').toUpperCase()]));renderNightmare(battleData.settings?.nightmare||{});state.textContent='상세 설정 연결 완료';state.classList.add('ok')}
    catch(error){state.textContent='불러오기 실패';state.classList.remove('ok');console.error('nightmare admin load failed',error)}finally{loading=false}
  }

  function readProfiles(){const profiles={},mappings=[];document.querySelectorAll('[data-nightmare-boss]').forEach(row=>{const id=Number(row.dataset.nightmareBoss);profiles[String(id)]={battlePower:Number(row.querySelector('[data-nm-power]').value),rewardCoin:Number(row.querySelector('[data-nm-coin]').value),hpPercent:Number(row.querySelector('[data-nm-hp]').value),attackPercent:Number(row.querySelector('[data-nm-attack]').value),defensePercent:Number(row.querySelector('[data-nm-defense]').value),speedPercent:Number(row.querySelector('[data-nm-speed]').value),rewardPercent:Number(row.querySelector('[data-nm-reward]').value),bossUltimateCapPercent:Number(row.querySelector('[data-nm-ultimate]').value)};mappings.push({monsterId:id,poolId:Number(row.querySelector('[data-nm-drop]').value||0)})});return {profiles,mappings}}
  async function saveNightmare(){
    const button=$('#saveNightmareSettings'),state=$('#nightmareSaveState'),detail=readProfiles(),nightmare={enabled:$('#nightmareEnabled').value==='1',hpPercent:Number($('#nightmareHp').value),attackPercent:Number($('#nightmareAttack').value),defensePercent:Number($('#nightmareDefense').value),speedPercent:Number($('#nightmareSpeed').value),rewardPercent:Number($('#nightmareReward').value),bossUltimateUnlocked:$('#nightmareUltimateUnlocked').value==='1',bossUltimateCapPercent:Number($('#nightmareUltimateDamage').value),bossProfiles:detail.profiles};
    button.disabled=true;button.textContent='설정 저장 중';state.textContent='능력치 저장 중';
    try{const saved=await api('admin/battle',{method:'PATCH',body:JSON.stringify({nightmare})});state.textContent='드랍 연결 저장 중';const drops=await dropApi({action:'SAVE_NIGHTMARE_BINDINGS',mappings:detail.mappings});battleData.settings={...(battleData.settings||{}),nightmare:saved.nightmare||nightmare};dropState=drops.snapshot||dropState;renderNightmare(battleData.settings.nightmare);state.textContent='전체 저장 완료';state.classList.add('ok');alert('나이트메어 보스별 능력치와 통합드랍 설정을 저장했습니다.')}
    catch(error){state.textContent='저장 실패';state.classList.remove('ok');alert(error.message||error)}finally{button.disabled=false;button.textContent='상세 설정 전체 저장'}
  }

  const observer=new MutationObserver(()=>{ensureNightmareOption();ensurePanel();clearTimeout(refreshTimer);if(!$('#view-battle')?.hidden)refreshTimer=setTimeout(loadNightmare,350)}),monsterMount=$('#monsterManagementMount');if(monsterMount)observer.observe(monsterMount,{subtree:true,childList:true});
  document.addEventListener('click',event=>{const edit=event.target.closest?.('[data-monster-edit]');if(edit){pendingMonsterId=Number(edit.dataset.monsterEdit||0);setTimeout(ensureNightmareOption,0)}if(event.target.closest?.('#monsterCreateV1045')){pendingMonsterId=0;setTimeout(ensureNightmareOption,0)}},true);
  document.addEventListener('DOMContentLoaded',()=>{const view=$('#view-battle');ensurePanel();ensureNightmareOption();if(view)new MutationObserver(()=>{if(!view.hidden)loadNightmare()}).observe(view,{attributes:true,attributeFilter:['hidden']});$('#nav button[data-view="battle"]')?.addEventListener('click',()=>setTimeout(loadNightmare,0))});
  window.loadNightmareAdminV1692=loadNightmare;
})();
