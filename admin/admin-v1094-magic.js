(()=>{
  const magicAdmin={data:null,editingMagic:null,editingEffect:null,effectSearch:''};
  const h=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const number=value=>Number(value||0);
  const effectLabel=value=>({HEAL:'회복',ATTACK_BUFF:'공격 강화',DEFENSE_BUFF:'방어 강화',HP_BUFF:'최대 HP',TRAP:'함정',SHIELD:'보호막',COUNTER:'반격',OTHER:'기타',NONE:'효과 없음'})[String(value||'').toUpperCase()]||String(value||'기타');
  const triggerLabel=value=>({BATTLE_START:'전투 시작',BEFORE_ATTACK:'공격 전',AFTER_ATTACK:'공격 후',BEFORE_HIT:'피격 전',AFTER_HIT:'피격 후',LOW_HP:'HP 조건',ON_KILL:'적 처치',ON_DEATH:'카드 사망',NEXT_OPPONENT:'새 상대 출전',PASSIVE:'상시 적용'})[String(value||'').toUpperCase()]||String(value||'상시 적용');
  const prevRenderIdentity=renderIdentity;
  renderIdentity=function(){
    prevRenderIdentity();
    const role=String(state.role||'').toUpperCase();
    const magicNav=document.querySelector('#nav button[data-view="magiccards"]');
    const rewardNav=document.querySelector('#nav button[data-view="magicrewards"]');
    if(magicNav)magicNav.hidden=role!=='OWNER';
    if(rewardNav)rewardNav.hidden=!['OWNER','ADMIN'].includes(role);
  };
  const prevShow=show;
  show=function(view,prefetched){
    if(view!=='magiccards'&&view!=='magicrewards')return prevShow(view,prefetched);
    const isReward=view==='magicrewards';
    state.view=view;
    document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==`view-${view}`);
    document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
    $('#pageTitle').textContent=isReward?'마법 결정 보상':'마법카드 관리';
    const loader=isReward?loadMagicRewards:loadMagicAdmin;
    loader().catch(e=>{const root=$(isReward?'#magicRewardAdminRoot':'#magicAdminRoot');if(root)root.innerHTML=`<div class="panel magicAdminError">${h(e.message)}</div>`});
  };
  async function loadMagicAdmin(){
    const root=$('#magicAdminRoot');if(!root)return;
    root.innerHTML='<div class="panel magicAdminLoading">마법카드 시스템을 불러오는 중...</div>';
    magicAdmin.data=await api('admin/magic-system');
    renderMagicAdmin();
  }
  async function loadMagicRewards(){
    const root=$('#magicRewardAdminRoot');if(!root)return;
    root.innerHTML='<div class="panel magicAdminLoading">마법 결정 보상 설정을 불러오는 중...</div>';
    magicAdmin.data=await api('admin/magic-acquisition');
    root.innerHTML=acquisitionPanel(magicAdmin.data?.settings||{});
    bindAcquisitionAdmin();
  }
  function statusPill(on,onText='사용',offText='중지'){return `<span class="magicStatus ${on?'on':'off'}">${on?onText:offText}</span>`}
  function floorRewardRow(row={}){return `<div class="magicRewardRow" data-magic-floor-row><label><span>층</span><input type="number" min="1" data-floor value="${number(row.floor)||''}" placeholder="10"></label><label><span>마법 결정</span><input type="number" min="0" data-amount value="${number(row.amount)||''}" placeholder="10"></label><button type="button" class="ghost" data-remove-reward>삭제</button></div>`}
  function rankRewardRow(group,row={}){return `<div class="magicRewardRow rank" data-magic-rank-row="${group}"><label><span>시작 순위</span><input type="number" min="1" data-from value="${number(row.from)||''}" placeholder="1"></label><label><span>종료 순위</span><input type="number" min="1" data-to value="${number(row.to)||''}" placeholder="3"></label><label><span>마법 결정</span><input type="number" min="0" data-amount value="${number(row.amount)||''}" placeholder="20"></label><button type="button" class="ghost" data-remove-reward>삭제</button></div>`}
  function acquisitionPanel(cfg){const a=cfg.acquisition||{},tower=a.tower||{},raid=a.raid||{},captain=a.captain||{},pve=a.pve||{},pvp=a.pvp||{};return `<section class="panel magicAcquisitionPanel">
    <div class="maintenanceHead"><div><small>MAGIC CRYSTAL ACQUISITION</small><h2>마법 결정 획득처</h2><p>쿠폰·접속 보상·메시지함 지급 없이 인게임 플레이 보상만 관리합니다. 확률 드랍은 전투당 서버 난수 1회와 요청 영수증으로 처리됩니다.</p></div></div>
    <div class="magicAcquisitionGrid">
      <article class="magicSourceCard"><div class="magicSourceHead"><div><small>GENERAL PVE</small><h3>일반 PVE 확률 드랍</h3></div><label class="studioSwitch"><input id="magicPveEnabled" type="checkbox" ${pve.enabled?'checked':''}><span></span></label></div><div class="magicSourceFields"><label><span>드랍 확률 (%)</span><input id="magicPveChance" type="number" min="0" max="100" step="0.01" value="${number(pve.chance)}"></label><label><span>당첨 지급량</span><input id="magicPveAmount" type="number" min="0" value="${number(pve.amount)}"></label><label><span>일일 획득 제한</span><input id="magicPveDaily" type="number" min="0" value="${number(pve.dailyLimit)}"><small>0은 제한 없음</small></label></div></article>
      <article class="magicSourceCard"><div class="magicSourceHead"><div><small>GENERAL PVP</small><h3>일반 PVP 확률 드랍</h3></div><label class="studioSwitch"><input id="magicPvpEnabled" type="checkbox" ${pvp.enabled?'checked':''}><span></span></label></div><div class="magicSourceFields"><label><span>드랍 확률 (%)</span><input id="magicPvpChance" type="number" min="0" max="100" step="0.01" value="${number(pvp.chance)}"></label><label><span>당첨 지급량</span><input id="magicPvpAmount" type="number" min="0" value="${number(pvp.amount)}"></label><label><span>일일 획득 제한</span><input id="magicPvpDaily" type="number" min="0" value="${number(pvp.dailyLimit)}"><small>0은 제한 없음</small></label></div></article>
      <article class="magicSourceCard wide"><div class="magicSourceHead"><div><small>INFINITE TOWER</small><h3>무한의탑 층별 최초 클리어</h3><p>진행도 초기화 후 재클리어해도 같은 운영 기준·층 보상은 다시 지급되지 않습니다.</p></div><label class="studioSwitch"><input id="magicTowerEnabled" type="checkbox" ${tower.enabled?'checked':''}><span></span></label></div><div id="magicTowerRows" class="magicRewardRows">${(tower.floorRewards||[]).map(floorRewardRow).join('')||floorRewardRow()}</div><button type="button" class="ghost magicAddRow" id="magicAddTowerRow">＋ 층 보상 추가</button></article>
      <article class="magicSourceCard wide"><div class="magicSourceHead"><div><small>WORLD RAID</small><h3>월드레이드 참여·순위 보상</h3><p>레이드 방 생성 시점의 설정을 스냅샷으로 고정해 정산 중 설정 변경 영향을 차단합니다.</p></div><label class="studioSwitch"><input id="magicRaidEnabled" type="checkbox" ${raid.enabled?'checked':''}><span></span></label></div><div class="magicSourceFields single"><label><span>참여 마법 결정</span><input id="magicRaidParticipation" type="number" min="0" value="${number(raid.participation)}"></label></div><div id="magicRaidRankRows" class="magicRewardRows">${(raid.rankRewards||[]).map(row=>rankRewardRow('raid',row)).join('')||rankRewardRow('raid')}</div><button type="button" class="ghost magicAddRow" id="magicAddRaidRank">＋ 순위 구간 추가</button></article>
      <article class="magicSourceCard wide"><div class="magicSourceHead"><div><small>CAPTAIN BATTLE</small><h3>대장전 승리·주간 정산</h3><p>기존 코인·카드 조각 보상과 함께 지급되며 기존 지급 영수증을 그대로 사용합니다.</p></div><label class="studioSwitch"><input id="magicCaptainEnabled" type="checkbox" ${captain.enabled?'checked':''}><span></span></label></div><div class="magicSourceFields single"><label><span>공격 승리 마법 결정</span><input id="magicCaptainVictory" type="number" min="0" value="${number(captain.victory)}"></label></div><div id="magicCaptainRankRows" class="magicRewardRows">${(captain.settlement||[]).map(row=>rankRewardRow('captain',row)).join('')||rankRewardRow('captain')}</div><button type="button" class="ghost magicAddRow" id="magicAddCaptainRank">＋ 정산 구간 추가</button></article>
    </div><div class="magicAdminActions"><button id="magicSaveAcquisition">획득처 설정 저장</button></div>
  </section>`}
  function collectFloorRewards(){return [...document.querySelectorAll('[data-magic-floor-row]')].map(row=>({floor:number(row.querySelector('[data-floor]').value),amount:number(row.querySelector('[data-amount]').value)})).filter(x=>x.floor>0&&x.amount>0)}
  function collectRankRewards(group){return [...document.querySelectorAll(`[data-magic-rank-row="${group}"]`)].map(row=>({from:number(row.querySelector('[data-from]').value),to:number(row.querySelector('[data-to]').value),amount:number(row.querySelector('[data-amount]').value)})).filter(x=>x.from>0&&x.to>=x.from&&x.amount>0)}
  function renderMagicAdmin(){
    const root=$('#magicAdminRoot'),d=magicAdmin.data,cfg=d.settings||{},stats=d.stats||{};
    if(!root)return;
    root.innerHTML=`
      <section class="magicAdminHero panel">
        <div><small>MAGIC CARD SYSTEM · V1102</small><h2>마법카드·마법 결정 운영 센터</h2><p>기존 덱 효과는 폐지 상태로 고정됩니다. 마법카드와 SSR 이상 카드 고유 효과는 먼저 OWNER 테스트로 준비한 뒤 전투 적용을 진행합니다.</p></div>
        <div class="magicAdminHeroStats"><div><span>등록 마법카드</span><b>${number(stats.magicCardCount).toLocaleString()}</b></div><div><span>활성 카드</span><b>${number(stats.activeMagicCardCount).toLocaleString()}</b></div><div><span>보유 기록</span><b>${number(stats.ownedRecordCount).toLocaleString()}</b></div><div><span>전체 마법 결정</span><b>${number(stats.totalMagicCrystals).toLocaleString()}</b></div></div>
      </section>
      <section class="panel magicSettingsPanel">
        <div class="maintenanceHead"><div><small>SYSTEM CONTROL</small><h2>운영·뽑기 설정</h2><p>일반 공개 전에는 전체 공개를 끄고 OWNER 테스트만 사용하세요. 마법 결정은 쿠폰·사료 경로에 연결하지 않습니다.</p></div>${statusPill(cfg.enabled,'일반 공개','비공개')}</div>
        <div class="magicSettingsGrid">
          <label><span>전체 공개</span><select id="magicEnabled"><option value="0" ${!cfg.enabled?'selected':''}>비공개</option><option value="1" ${cfg.enabled?'selected':''}>일반 유저 공개</option></select></label>
          <label><span>OWNER 테스트</span><select id="magicOwnerTest"><option value="1" ${cfg.ownerTestEnabled!==false?'selected':''}>허용</option><option value="0" ${cfg.ownerTestEnabled===false?'selected':''}>차단</option></select></label>
          <label><span>마법카드 뽑기</span><select id="magicDrawEnabled"><option value="0" ${!cfg.drawEnabled?'selected':''}>준비 중</option><option value="1" ${cfg.drawEnabled?'selected':''}>사용</option></select></label>
          <label><span>1회 마법 결정 비용</span><input id="magicDrawCost" type="number" min="0" value="${number(cfg.drawCost)}"></label>
          <label><span>R 중복 환급</span><input id="magicRefundR" type="number" min="0" value="${number(cfg.duplicateRefund?.R)}"></label>
          <label><span>SR 중복 환급</span><input id="magicRefundSR" type="number" min="0" value="${number(cfg.duplicateRefund?.SR)}"></label>
          <label><span>SSR 중복 환급</span><input id="magicRefundSSR" type="number" min="0" value="${number(cfg.duplicateRefund?.SSR)}"></label>
          <label class="wide"><span>유저 안내 문구</span><input id="magicAcquisitionNotice" maxlength="240" value="${h(cfg.acquisitionNotice||'')}"></label>
        </div><div class="magicAdminActions"><button id="magicSaveSettings">운영 설정 저장</button></div>
      </section>
      ${acquisitionPanel(cfg)}
      ${magicCardEditor()}
      <section class="panel"><div class="maintenanceHead"><div><small>REGISTERED MAGIC CARDS</small><h2>등록된 마법카드</h2><p>삭제하지 않고 비활성화 방식으로 운영합니다.</p></div><button id="magicNewCard" class="ghost">새 마법카드</button></div><div class="magicCardAdminGrid">${(d.cards||[]).map(magicCardRow).join('')||'<div class="magicAdminEmpty">등록된 마법카드가 없습니다.</div>'}</div></section>
      ${uniqueEffectEditor()}
      <section class="panel"><div class="maintenanceHead"><div><small>SSR+ UNIQUE EFFECTS</small><h2>카드별 고유 효과 준비</h2><p>SSR·MA·LIMITED·FUR 카드만 표시됩니다. 현재는 설정 저장 단계이며 실제 전투 적용은 2차 패치에서 진행합니다.</p></div><input id="magicEffectSearch" class="magicEffectSearch" value="${h(magicAdmin.effectSearch)}" placeholder="카드명 또는 멤버 검색"></div><div id="magicUniqueList" class="magicUniqueList">${uniqueEffectRows()}</div></section>`;
    bindMagicAdmin();
  }
  function magicCardEditor(){
    const x=magicAdmin.editingMagic||{rarity:'R',effectType:'HEAL',triggerType:'BATTLE_START',effectValue:0,triggerChance:100,maxActivations:1,drawWeight:1,scopes:{pve:true,pvp:true,captain:true},isActive:true,sortOrder:0};
    return `<section class="panel magicEditorPanel"><div class="maintenanceHead"><div><small>MAGIC CARD BUILDER</small><h2>${x.id?'마법카드 수정':'새 마법카드 등록'}</h2><p>회복·공격 강화·방어 강화·함정 등 기본 효과 데이터를 준비합니다.</p></div>${x.id?`<button id="magicCancelEdit" class="ghost">수정 취소</button>`:''}</div><div class="magicEditorGrid">
      <label><span>카드명</span><input id="magicCardName" value="${h(x.name||'')}" placeholder="예: 치유의 빛"></label><label><span>고유 코드</span><input id="magicCardCode" value="${h(x.code||'')}" placeholder="HEALING_LIGHT"></label><label><span>등급</span><select id="magicCardRarity">${['R','SR','SSR'].map(v=>`<option ${x.rarity===v?'selected':''}>${v}</option>`).join('')}</select></label><label><span>정렬 순서</span><input id="magicCardSort" type="number" value="${number(x.sortOrder)}"></label>
      <label class="wide"><span>이미지 경로 또는 URL</span><input id="magicCardImage" value="${h(x.imageUrl||'')}" placeholder="/assets/magic-cards/card.png"></label><label class="wide"><span>카드 설명</span><textarea id="magicCardDescription" rows="2">${h(x.description||'')}</textarea></label>
      <label><span>효과 유형</span><select id="magicCardEffectType">${[['HEAL','회복'],['ATTACK_BUFF','공격 강화'],['DEFENSE_BUFF','방어 강화'],['HP_BUFF','최대 HP'],['TRAP','함정'],['SHIELD','보호막'],['COUNTER','반격'],['OTHER','기타']].map(([v,n])=>`<option value="${v}" ${x.effectType===v?'selected':''}>${n}</option>`).join('')}</select></label><label><span>발동 시점</span><select id="magicCardTrigger">${[['BATTLE_START','전투 시작'],['BEFORE_ATTACK','공격 전'],['AFTER_ATTACK','공격 후'],['BEFORE_HIT','피격 전'],['AFTER_HIT','피격 후'],['LOW_HP','HP 조건'],['ON_KILL','적 처치'],['ON_DEATH','카드 사망'],['NEXT_OPPONENT','새 상대 출전']].map(([v,n])=>`<option value="${v}" ${x.triggerType===v?'selected':''}>${n}</option>`).join('')}</select></label><label><span>효과 수치</span><input id="magicCardEffectValue" type="number" step="0.1" value="${number(x.effectValue)}"></label><label><span>발동 확률 (%)</span><input id="magicCardChance" type="number" min="0" max="100" step="0.1" value="${number(x.triggerChance)}"></label><label><span>최대 발동 횟수</span><input id="magicCardMax" type="number" min="1" max="99" value="${number(x.maxActivations||1)}"></label><label><span>뽑기 가중치</span><input id="magicCardWeight" type="number" min="0.0001" step="0.01" value="${number(x.drawWeight||1)}"></label>
      <div class="magicScopeBox wide"><b>적용 콘텐츠</b><label><input id="magicScopePve" type="checkbox" ${x.scopes?.pve!==false?'checked':''}> PVE</label><label><input id="magicScopePvp" type="checkbox" ${x.scopes?.pvp!==false?'checked':''}> PVP</label><label><input id="magicScopeCaptain" type="checkbox" ${x.scopes?.captain!==false?'checked':''}> 대장전</label><label><input id="magicCardActive" type="checkbox" ${x.isActive!==false?'checked':''}> 카드 활성</label></div>
    </div><div class="magicAdminActions"><button id="magicSaveCard">${x.id?'마법카드 수정 저장':'마법카드 등록'}</button></div></section>`;
  }
  function magicCardRow(x){return `<article class="magicAdminCard ${x.isActive?'':'off'}"><div class="magicAdminArt">${x.imageUrl?`<img src="${h(x.imageUrl)}" alt="" onerror="this.remove()">`:''}<span>✦</span></div><div><small>${h(x.rarity)} · ${h(x.code)}</small><h3>${h(x.name)}</h3><p>${h(x.description||'설명 없음')}</p><div class="magicAdminTags"><b>${h(effectLabel(x.effectType))}</b><b>${h(triggerLabel(x.triggerType))}</b><b>${number(x.triggerChance)}%</b><b>최대 ${number(x.maxActivations)}회</b></div></div><div class="magicAdminCardActions">${statusPill(x.isActive)}<button data-magic-edit="${x.id}">수정</button><button data-magic-toggle="${x.id}" data-active="${x.isActive?'0':'1'}" class="ghost">${x.isActive?'비활성':'활성화'}</button></div></article>`}
  function uniqueEffectEditor(){const x=magicAdmin.editingEffect;if(!x)return '';
    return `<section class="panel uniqueEffectEditor"><div class="maintenanceHead"><div><small>${h(x.grade)} UNIQUE EFFECT</small><h2>${h(x.memberName)} · ${h(x.title)}</h2><p>능력치와 고유 효과를 준비합니다. 전투 반영 전까지는 유저 능력치에 영향을 주지 않습니다.</p></div><button id="magicEffectCancel" class="ghost">편집 닫기</button></div><div class="magicUniqueEditorGrid"><label><span>공격력 보정 (%)</span><input id="uniqueAttack" type="number" step="0.1" value="${number(x.attackPercent)}"></label><label><span>방어력 보정 (%)</span><input id="uniqueDefense" type="number" step="0.1" value="${number(x.defensePercent)}"></label><label><span>HP 보정 (%)</span><input id="uniqueHp" type="number" step="0.1" value="${number(x.hpPercent)}"></label><label><span>속도 보정 (%)</span><input id="uniqueSpeed" type="number" step="0.1" value="${number(x.speedPercent)}"></label><label class="wide"><span>고유 효과 이름</span><input id="uniqueName" value="${h(x.effectName||'')}"></label><label class="wide"><span>고유 효과 설명</span><textarea id="uniqueDescription" rows="2">${h(x.effectDescription||'')}</textarea></label><label><span>효과 유형</span><input id="uniqueType" value="${h(x.effectType||'NONE')}"></label><label><span>발동 시점</span><input id="uniqueTrigger" value="${h(x.triggerType||'PASSIVE')}"></label><label><span>효과 수치</span><input id="uniqueValue" type="number" step="0.1" value="${number(x.effectValue)}"></label><label><span>발동 확률 (%)</span><input id="uniqueChance" type="number" min="0" max="100" step="0.1" value="${number(x.triggerChance)}"></label><label><span>최대 발동 횟수</span><input id="uniqueMax" type="number" min="1" value="${number(x.maxActivations||1)}"></label><div class="magicScopeBox"><b>적용 범위</b><label><input id="uniquePve" type="checkbox" ${x.scopes?.pve!==false?'checked':''}> PVE</label><label><input id="uniquePvp" type="checkbox" ${x.scopes?.pvp!==false?'checked':''}> PVP</label><label><input id="uniqueCaptain" type="checkbox" ${x.scopes?.captain!==false?'checked':''}> 대장전</label><label><input id="uniqueActive" type="checkbox" ${x.isActive?'checked':''}> 효과 활성</label></div></div><div class="magicAdminActions"><button id="magicEffectSave">고유 효과 저장</button></div></section>`}
  function uniqueEffectRows(){const q=magicAdmin.effectSearch.trim().toLowerCase(),list=(magicAdmin.data?.uniqueEffects||[]).filter(x=>!q||x.title.toLowerCase().includes(q)||x.memberName.toLowerCase().includes(q));return list.map(x=>`<article class="magicUniqueRow ${x.isActive?'active':''}"><div class="magicUniqueThumb">${x.imageUrl?`<img src="${h(x.imageUrl)}" alt="" onerror="this.remove()">`:''}</div><div><small>${h(x.grade)} · ${h(x.memberName)}</small><h3>${h(x.title)}</h3><p>${x.effectName?h(x.effectName):'고유 효과 미설정'}</p></div><div class="magicUniqueStats"><b>공격 ${number(x.attackPercent)}%</b><b>방어 ${number(x.defensePercent)}%</b><b>HP ${number(x.hpPercent)}%</b><b>속도 ${number(x.speedPercent)}%</b></div><div>${statusPill(x.isActive,'효과 ON','미설정')}<button data-unique-edit="${h(x.cardId)}">편집</button></div></article>`).join('')||'<div class="magicAdminEmpty">검색 결과가 없습니다.</div>'}
  function bindMagicAdmin(){
    $('#magicSaveSettings').onclick=saveSettings;$('#magicSaveAcquisition').onclick=saveAcquisition;$('#magicSaveCard').onclick=saveMagicCard;$('#magicNewCard').onclick=()=>{magicAdmin.editingMagic=null;renderMagicAdmin()};
    $('#magicAddTowerRow')?.addEventListener('click',()=>{$('#magicTowerRows').insertAdjacentHTML('beforeend',floorRewardRow());bindRewardRemovers()});
    $('#magicAddRaidRank')?.addEventListener('click',()=>{$('#magicRaidRankRows').insertAdjacentHTML('beforeend',rankRewardRow('raid'));bindRewardRemovers()});
    $('#magicAddCaptainRank')?.addEventListener('click',()=>{$('#magicCaptainRankRows').insertAdjacentHTML('beforeend',rankRewardRow('captain'));bindRewardRemovers()});
    bindRewardRemovers();
    $('#magicCancelEdit')?.addEventListener('click',()=>{magicAdmin.editingMagic=null;renderMagicAdmin()});
    document.querySelectorAll('[data-magic-edit]').forEach(b=>b.onclick=()=>{magicAdmin.editingMagic=magicAdmin.data.cards.find(x=>Number(x.id)===Number(b.dataset.magicEdit));renderMagicAdmin();window.scrollTo({top:0,behavior:'smooth'})});
    document.querySelectorAll('[data-magic-toggle]').forEach(b=>b.onclick=()=>toggleCard(Number(b.dataset.magicToggle),b.dataset.active==='1'));
    const search=$('#magicEffectSearch');search.oninput=()=>{magicAdmin.effectSearch=search.value;$('#magicUniqueList').innerHTML=uniqueEffectRows();document.querySelectorAll('[data-unique-edit]').forEach(b=>b.onclick=()=>openUniqueEffect(b.dataset.uniqueEdit))};
    document.querySelectorAll('[data-unique-edit]').forEach(b=>b.onclick=()=>openUniqueEffect(b.dataset.uniqueEdit));
    $('#magicEffectCancel')?.addEventListener('click',()=>{magicAdmin.editingEffect=null;renderMagicAdmin()});$('#magicEffectSave')?.addEventListener('click',saveUniqueEffect);
  }
  function bindRewardRemovers(){document.querySelectorAll('[data-remove-reward]').forEach(btn=>btn.onclick=()=>btn.closest('.magicRewardRow')?.remove())}
  function bindAcquisitionAdmin(){
    $('#magicSaveAcquisition').onclick=saveAcquisition;
    $('#magicAddTowerRow')?.addEventListener('click',()=>{$('#magicTowerRows').insertAdjacentHTML('beforeend',floorRewardRow());bindRewardRemovers()});
    $('#magicAddRaidRank')?.addEventListener('click',()=>{$('#magicRaidRankRows').insertAdjacentHTML('beforeend',rankRewardRow('raid'));bindRewardRemovers()});
    $('#magicAddCaptainRank')?.addEventListener('click',()=>{$('#magicCaptainRankRows').insertAdjacentHTML('beforeend',rankRewardRow('captain'));bindRewardRemovers()});
    bindRewardRemovers();
  }
  function collectAcquisition(){return {
    pve:{enabled:$('#magicPveEnabled').checked,chance:number($('#magicPveChance').value),amount:number($('#magicPveAmount').value),dailyLimit:number($('#magicPveDaily').value)},
    pvp:{enabled:$('#magicPvpEnabled').checked,chance:number($('#magicPvpChance').value),amount:number($('#magicPvpAmount').value),dailyLimit:number($('#magicPvpDaily').value)},
    tower:{enabled:$('#magicTowerEnabled').checked,floorRewards:collectFloorRewards()},
    raid:{enabled:$('#magicRaidEnabled').checked,participation:number($('#magicRaidParticipation').value),rankRewards:collectRankRewards('raid')},
    captain:{enabled:$('#magicCaptainEnabled').checked,victory:number($('#magicCaptainVictory').value),settlement:collectRankRewards('captain')}
  }}
  async function saveAcquisition(){
    const acquisition=collectAcquisition();
    await api('admin/magic-acquisition',{method:'POST',body:JSON.stringify({acquisition})});
    alert('마법 결정 획득처 보상 설정을 저장했습니다.');
    if(state.view==='magicrewards')loadMagicRewards();else loadMagicAdmin();
  }
  async function saveSettings(){
    const enabled=$('#magicEnabled').value==='1';
    if(enabled&&!confirm('마법카드 시스템을 일반 유저에게 공개할까요?\n아직 전투 효과 적용은 2차 단계입니다.'))return;
    const settings={
      enabled,ownerTestEnabled:$('#magicOwnerTest').value==='1',drawEnabled:$('#magicDrawEnabled').value==='1',drawCost:number($('#magicDrawCost').value),
      duplicateRefund:{R:number($('#magicRefundR').value),SR:number($('#magicRefundSR').value),SSR:number($('#magicRefundSSR').value)},
      acquisitionNotice:$('#magicAcquisitionNotice').value,
      acquisition:collectAcquisition()
    };
    await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'SAVE_SETTINGS',settings})});
    alert('마법카드 운영 및 마법 결정 획득처 설정을 저장했습니다.');
    loadMagicAdmin();
  }
  async function saveMagicCard(){const x=magicAdmin.editingMagic||{};await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'SAVE_MAGIC_CARD',id:x.id||null,name:$('#magicCardName').value,code:$('#magicCardCode').value,rarity:$('#magicCardRarity').value,imageUrl:$('#magicCardImage').value,description:$('#magicCardDescription').value,effectType:$('#magicCardEffectType').value,triggerType:$('#magicCardTrigger').value,effectValue:number($('#magicCardEffectValue').value),triggerChance:number($('#magicCardChance').value),maxActivations:number($('#magicCardMax').value),drawWeight:number($('#magicCardWeight').value),sortOrder:number($('#magicCardSort').value),scopes:{pve:$('#magicScopePve').checked,pvp:$('#magicScopePvp').checked,captain:$('#magicScopeCaptain').checked},isActive:$('#magicCardActive').checked})});alert('마법카드를 저장했습니다.');magicAdmin.editingMagic=null;loadMagicAdmin()}
  async function toggleCard(id,isActive){if(!confirm(`이 마법카드를 ${isActive?'활성화':'비활성화'}할까요?`))return;await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'TOGGLE_MAGIC_CARD',id,isActive})});loadMagicAdmin()}
  function openUniqueEffect(cardId){magicAdmin.editingEffect=magicAdmin.data.uniqueEffects.find(x=>String(x.cardId)===String(cardId));renderMagicAdmin();window.scrollTo({top:0,behavior:'smooth'})}
  async function saveUniqueEffect(){const x=magicAdmin.editingEffect;await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'SAVE_UNIQUE_EFFECT',cardId:x.cardId,attackPercent:number($('#uniqueAttack').value),defensePercent:number($('#uniqueDefense').value),hpPercent:number($('#uniqueHp').value),speedPercent:number($('#uniqueSpeed').value),effectName:$('#uniqueName').value,effectDescription:$('#uniqueDescription').value,effectType:$('#uniqueType').value,triggerType:$('#uniqueTrigger').value,effectValue:number($('#uniqueValue').value),triggerChance:number($('#uniqueChance').value),maxActivations:number($('#uniqueMax').value),scopes:{pve:$('#uniquePve').checked,pvp:$('#uniquePvp').checked,captain:$('#uniqueCaptain').checked},isActive:$('#uniqueActive').checked})});alert('카드 고유 효과를 저장했습니다.');magicAdmin.editingEffect=null;loadMagicAdmin()}
})();
