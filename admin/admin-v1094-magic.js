(()=>{
  const magicAdmin={data:null,editingMagic:null,editingEffect:null,effectSearch:'',uniqueGrade:'ALL',uniqueStatus:'ALL',uniqueSelected:new Set(),uniqueDrafts:new Map(),uniqueDirty:new Set()};
  const h=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const number=value=>Number(value||0);
  const publicImageUrl=value=>{
    let url=String(value||'').trim().replaceAll('\\','/');
    if(!url)return '';
    if(/^(?:https?:|data:|blob:)/i.test(url)||url.startsWith('//'))return url;
    url=url.replace(/^\.\/+/, '').replace(/^(?:\.\.\/)+/, '');
    return `/${url.replace(/^\/+/, '')}`;
  };
  const adminImage=(value,alt='')=>{const src=publicImageUrl(value);return src?`<img src="${h(src)}" alt="${h(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.remove();this.parentElement.classList.add('image-missing')">`:''};
  const effectLabel=value=>({HEAL:'회복',ATTACK_BUFF:'공격 강화',DEFENSE_BUFF:'방어 강화',HP_BUFF:'최대 HP',TRAP:'함정',SHIELD:'보호막',COUNTER:'반격',OTHER:'기타',NONE:'효과 없음'})[String(value||'').toUpperCase()]||String(value||'기타');
  const triggerLabel=value=>({BATTLE_START:'전투 시작',BEFORE_ATTACK:'공격 전',AFTER_ATTACK:'공격 후',BEFORE_HIT:'피격 전',AFTER_HIT:'피격 후',LOW_HP:'HP 조건',ON_KILL:'적 처치',ON_DEATH:'카드 사망',NEXT_OPPONENT:'새 상대 출전',PASSIVE:'상시 적용'})[String(value||'').toUpperCase()]||String(value||'상시 적용');
  const prevRenderIdentity=renderIdentity;
  renderIdentity=function(){
    prevRenderIdentity();
    const role=String(state.role||'').toUpperCase();
    const magicNav=document.querySelector('#nav button[data-view="magiccards"]');
    const rewardNav=document.querySelector('#nav button[data-view="magicrewards"]');
    const uniqueNav=document.querySelector('#nav button[data-view="uniqueabilities"]');
    if(magicNav)magicNav.hidden=role!=='OWNER';
    if(uniqueNav)uniqueNav.hidden=role!=='OWNER';
    if(rewardNav)rewardNav.hidden=!['OWNER','ADMIN'].includes(role);
  };
  const prevShow=show;
  show=function(view,prefetched){
    if(!['magiccards','magicrewards','uniqueabilities'].includes(view))return prevShow(view,prefetched);
    const isReward=view==='magicrewards',isUnique=view==='uniqueabilities';
    state.view=view;
    document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==`view-${view}`);
    document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
    $('#pageTitle').textContent=isReward?'마법 결정 보상':isUnique?'카드 고유 능력치':'마법카드 관리';
    const loader=isReward?loadMagicRewards:isUnique?loadUniqueAbilityAdmin:loadMagicAdmin;
    const rootSelector=isReward?'#magicRewardAdminRoot':isUnique?'#uniqueAbilityAdminRoot':'#magicAdminRoot';
    loader().catch(e=>{const root=$(rootSelector);if(root)root.innerHTML=`<div class="panel magicAdminError">${h(e.message)}</div>`});
  };
  async function loadMagicAdmin(){
    const root=$('#magicAdminRoot');if(!root)return;
    root.innerHTML='<div class="panel magicAdminLoading">마법카드 시스템을 불러오는 중...</div>';
    magicAdmin.data=await api('admin/magic-system');
    renderMagicAdmin();
  }
  async function loadUniqueAbilityAdmin(){
    const root=$('#uniqueAbilityAdminRoot');if(!root)return;
    root.innerHTML='<div class="panel magicAdminLoading">카드별 고유 능력치를 불러오는 중...</div>';
    magicAdmin.data=await api('admin/magic-system');
    const validIds=new Set((magicAdmin.data?.uniqueEffects||[]).map(x=>String(x.cardId)));
    magicAdmin.uniqueSelected=new Set([...magicAdmin.uniqueSelected].filter(id=>validIds.has(String(id))));
    renderUniqueAbilityAdmin();
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
    const root=$('#magicAdminRoot'),d=magicAdmin.data,cfg=d.settings||{},uniqueCfg=d.uniqueEffectSettings||{},stats=d.stats||{};
    if(!root)return;
    root.innerHTML=`
      <section class="magicAdminHero panel">
        <div><small>MAGIC CARD SYSTEM · V1160</small><h2>마법카드 운영 센터</h2><p>마법카드 등록·뽑기·마법 결정 운영을 관리합니다. 카드별 고유 능력치는 전용 메뉴에서 관리합니다.</p></div>
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
      <section class="panel"><div class="maintenanceHead"><div><small>REGISTERED MAGIC CARDS</small><h2>등록된 마법카드</h2><p>삭제하지 않고 비활성화 방식으로 운영합니다.</p></div><button id="magicNewCard" class="ghost">새 마법카드</button></div><div class="magicCardAdminGrid">${(d.cards||[]).map(magicCardRow).join('')||'<div class="magicAdminEmpty">등록된 마법카드가 없습니다.</div>'}</div></section>`;
    bindMagicAdmin();
  }
  function uniqueToast(message,type='ok'){
    let host=document.querySelector('#uniqueAbilityToastHost');
    if(!host){host=document.createElement('div');host.id='uniqueAbilityToastHost';host.className='uniqueAbilityToastHost';document.body.appendChild(host)}
    const item=document.createElement('div');item.className=`uniqueAbilityToast ${type}`;item.textContent=String(message||'');host.appendChild(item);
    requestAnimationFrame(()=>item.classList.add('show'));setTimeout(()=>{item.classList.remove('show');setTimeout(()=>item.remove(),220)},3200);
  }
  async function uniqueSaveGuard(button,busyText,task){
    if(button?.dataset.busy==='1')return null;
    if(button){button.dataset.busy='1';setBusy(button,true,busyText)}
    try{return await task()}catch(error){
      const message=String(error?.message||'저장 중 오류가 발생했습니다.');
      uniqueToast(`저장 실패 · ${message}`,'error');
      alert(`저장하지 못했습니다.\n${message}\n\nCMS 로그인 정보는 삭제하지 않았습니다.`);
      return null;
    }finally{if(button){button.dataset.busy='0';setBusy(button,false)}}
  }
  function uniqueAbilityControl(cfg={}){
    const active=cfg.enabled===true,ownerTest=cfg.ownerTestEnabled!==false,detail=cfg.userDetailEnabled!==false;
    return `<details class="panel uniqueAbilityControl ${active?'live':'test'}"><summary><div><small>UNIQUE ABILITY CONTROL</small><b>전투 적용·공개 설정</b><span>${active?'일반 유저 적용 중':ownerTest?'OWNER 테스트 중':'완전 OFF'}</span></div>${statusPill(active,'일반 적용 ON',ownerTest?'OWNER 테스트':'완전 OFF')}</summary><div class="uniqueControlBody"><p>전체 적용이 OFF여도 OWNER 테스트가 허용되어 있으면 OWNER 계정에만 반영됩니다. 일반 공개 전 테스트할 때 사용하세요.</p><div class="magicSettingsGrid uniqueAbilitySwitchGrid"><label><span>일반 유저 전투 적용</span><select id="uniqueSystemEnabled"><option value="0" ${!active?'selected':''}>OFF · 일반 미적용</option><option value="1" ${active?'selected':''}>ON · 전체 적용</option></select></label><label><span>OWNER 단독 테스트</span><select id="uniqueOwnerTest"><option value="1" ${ownerTest?'selected':''}>허용</option><option value="0" ${!ownerTest?'selected':''}>차단</option></select></label><label><span>카드 상세 능력 표시</span><select id="uniqueUserDetail"><option value="1" ${detail?'selected':''}>표시</option><option value="0" ${!detail?'selected':''}>숨김</option></select></label><button type="button" id="uniqueSystemSave" class="uniqueControlSave">적용 설정 저장</button></div></div></details>`;
  }
  function uniqueBaseCard(id){return (magicAdmin.data?.uniqueEffects||[]).find(card=>String(card.cardId)===String(id))||null}
  function uniqueEditableState(card){
    if(!card)return null;const id=String(card.cardId),draft=magicAdmin.uniqueDrafts.get(id)||{};
    return {...card,...draft,scopes:{...(card.scopes||{}),...(draft.scopes||{})}};
  }
  function uniqueNormalized(card){return {cardId:String(card.cardId),attackPercent:number(card.attackPercent),defensePercent:number(card.defensePercent),hpPercent:number(card.hpPercent),speedPercent:number(card.speedPercent),scopes:{pve:card.scopes?.pve!==false,pvp:card.scopes?.pvp!==false,captain:card.scopes?.captain!==false},isActive:card.isActive===true}}
  function uniqueStateEqual(a,b){return JSON.stringify(uniqueNormalized(a))===JSON.stringify(uniqueNormalized(b))}
  function uniqueFilteredList(){
    const q=magicAdmin.effectSearch.trim().toLowerCase(),grade=magicAdmin.uniqueGrade,status=magicAdmin.uniqueStatus;
    return (magicAdmin.data?.uniqueEffects||[]).filter(base=>{
      const x=uniqueEditableState(base);
      if(q&&!String(x.title||'').toLowerCase().includes(q)&&!String(x.memberName||'').toLowerCase().includes(q))return false;
      if(grade!=='ALL'&&String(x.grade||'').toUpperCase()!==grade)return false;
      if(status==='ACTIVE'&&!x.isActive)return false;
      if(status==='INACTIVE'&&x.isActive)return false;
      if(status==='UNSET'&&(x.isActive||number(x.attackPercent)||number(x.defensePercent)||number(x.hpPercent)||number(x.speedPercent)||x.effectName))return false;
      return true;
    });
  }
  function uniqueInlineField(label,key,value,max=500){return `<label class="uniqueInlineField"><span>${label}</span><div><input data-unique-field="${key}" type="number" min="-90" max="${max}" step="0.1" value="${number(value)}"><em>%</em></div></label>`}
  function uniqueEffectRows(){
    const list=uniqueFilteredList();
    return list.map(base=>{const x=uniqueEditableState(base),id=String(x.cardId),selected=magicAdmin.uniqueSelected.has(id),dirty=magicAdmin.uniqueDirty.has(id),image=adminImage(x.imageUrl,`${x.title} 카드 이미지`);return `<article class="uniqueInlineRow ${x.isActive?'active':''} ${selected?'selected':''} ${dirty?'dirty':''}" data-unique-row="${h(id)}"><label class="uniqueCardCheck" title="선택"><input type="checkbox" data-unique-select="${h(id)}" ${selected?'checked':''}><span></span></label><div class="uniqueInlineCard"><div class="magicUniqueThumb${image?'':' image-missing'}">${image}</div><div><small>${h(x.grade)} · ${h(x.memberName)}</small><h3>${h(x.title)}</h3><p>${x.effectName?h(x.effectName):'고유 효과 미설정'}</p></div></div>${uniqueInlineField('공격','attackPercent',x.attackPercent)}${uniqueInlineField('방어','defensePercent',x.defensePercent)}${uniqueInlineField('HP','hpPercent',x.hpPercent)}${uniqueInlineField('속도','speedPercent',x.speedPercent,300)}<div class="uniqueInlineScopes"><span>적용 범위</span><label><input type="checkbox" data-unique-scope="pve" ${x.scopes?.pve!==false?'checked':''}>PVE</label><label><input type="checkbox" data-unique-scope="pvp" ${x.scopes?.pvp!==false?'checked':''}>PVP</label><label><input type="checkbox" data-unique-scope="captain" ${x.scopes?.captain!==false?'checked':''}>대장전</label></div><label class="uniqueActiveToggle"><span>카드 적용</span><input type="checkbox" data-unique-field="isActive" ${x.isActive?'checked':''}><b>${x.isActive?'ON':'OFF'}</b></label><div class="uniqueInlineActions"><span class="uniqueRowDirty">수정됨</span><button type="button" data-unique-edit="${h(id)}" class="ghost">세부 효과</button></div></article>`}).join('')||'<div class="magicAdminEmpty">조건에 맞는 카드가 없습니다.</div>';
  }
  function uniqueQuickBatch(){
    return `<div class="uniqueQuickBatch"><div class="uniqueQuickBatchTitle"><b>선택 카드 빠른 입력</b><span><strong id="uniqueSelectedCount">${magicAdmin.uniqueSelected.size}</strong>장 선택</span></div><label><span>공격</span><input id="quickUniqueAttack" type="number" step="0.1" placeholder="유지"></label><label><span>방어</span><input id="quickUniqueDefense" type="number" step="0.1" placeholder="유지"></label><label><span>HP</span><input id="quickUniqueHp" type="number" step="0.1" placeholder="유지"></label><label><span>속도</span><input id="quickUniqueSpeed" type="number" step="0.1" placeholder="유지"></label><label class="uniqueQuickState"><span>활성 상태</span><select id="quickUniqueActive"><option value="KEEP">유지</option><option value="1">ON</option><option value="0">OFF</option></select></label><div class="uniqueQuickScopes"><label><input id="quickUniqueScopeEnabled" type="checkbox"> 범위 변경</label><label><input id="quickUniquePve" type="checkbox" checked disabled>PVE</label><label><input id="quickUniquePvp" type="checkbox" checked disabled>PVP</label><label><input id="quickUniqueCaptain" type="checkbox" checked disabled>대장전</label></div><button type="button" id="uniqueApplySelected">선택 행에 입력</button></div>`;
  }
  function uniqueEffectEditor(){const base=magicAdmin.editingEffect;if(!base)return '';
    const x=uniqueEditableState(base);
    return `<dialog id="uniqueEffectDialog" class="uniqueEffectDialog"><div class="uniqueEffectDialogHead"><div><small>${h(x.grade)} UNIQUE EFFECT</small><h2>${h(x.memberName)} · ${h(x.title)}</h2><p>4종 능력치는 목록에서 바로 수정할 수 있습니다. 이 창은 효과명·설명과 발동 정보까지 세부 편집할 때 사용합니다.</p></div><button type="button" id="magicEffectCancel" class="ghost">닫기</button></div><div class="magicUniqueEditorGrid"><label><span>공격력 보정 (%)</span><input id="uniqueAttack" type="number" step="0.1" value="${number(x.attackPercent)}"></label><label><span>방어력 보정 (%)</span><input id="uniqueDefense" type="number" step="0.1" value="${number(x.defensePercent)}"></label><label><span>HP 보정 (%)</span><input id="uniqueHp" type="number" step="0.1" value="${number(x.hpPercent)}"></label><label><span>속도 보정 (%)</span><input id="uniqueSpeed" type="number" step="0.1" value="${number(x.speedPercent)}"></label><label class="wide"><span>고유 효과 이름</span><input id="uniqueName" value="${h(x.effectName||'')}"></label><label class="wide"><span>고유 효과 설명</span><textarea id="uniqueDescription" rows="3">${h(x.effectDescription||'')}</textarea></label><label><span>효과 유형</span><input id="uniqueType" value="${h(x.effectType||'NONE')}"></label><label><span>발동 시점</span><input id="uniqueTrigger" value="${h(x.triggerType||'PASSIVE')}"></label><label><span>효과 수치</span><input id="uniqueValue" type="number" step="0.1" value="${number(x.effectValue)}"></label><label><span>발동 확률 (%)</span><input id="uniqueChance" type="number" min="0" max="100" step="0.1" value="${number(x.triggerChance)}"></label><label><span>최대 발동 횟수</span><input id="uniqueMax" type="number" min="1" value="${number(x.maxActivations||1)}"></label><div class="magicScopeBox"><b>적용 범위</b><label><input id="uniquePve" type="checkbox" ${x.scopes?.pve!==false?'checked':''}> PVE</label><label><input id="uniquePvp" type="checkbox" ${x.scopes?.pvp!==false?'checked':''}> PVP</label><label><input id="uniqueCaptain" type="checkbox" ${x.scopes?.captain!==false?'checked':''}> 대장전</label><label><input id="uniqueActive" type="checkbox" ${x.isActive?'checked':''}> 능력치 활성</label></div></div><div class="magicAdminActions"><button type="button" id="magicEffectSave">세부 효과 저장</button></div></dialog>`}
  function uniqueManagerPanel(){
    const filtered=uniqueFilteredList().length,total=(magicAdmin.data?.uniqueEffects||[]).length,dirty=magicAdmin.uniqueDirty.size;
    return `<section class="panel uniqueManagerPanel"><div class="maintenanceHead uniqueManagerHead"><div><small>INLINE UNIQUE ABILITY EDITOR</small><h2>카드 목록에서 바로 편집</h2><p>각 행의 수치를 수정한 뒤 화면 하단의 ‘변경 카드 일괄 저장’을 한 번만 누르면 됩니다.</p></div><div class="uniqueManagerStats"><span>현재 목록 <b id="uniqueFilteredCount">${filtered}</b> / ${total}</span></div></div><div class="uniqueManagerToolbar"><input id="uniqueAbilitySearch" class="magicEffectSearch" value="${h(magicAdmin.effectSearch)}" placeholder="카드명 또는 멤버 검색"><select id="uniqueGradeFilter"><option value="ALL">전체 등급</option>${['SSR','MA','LIMITED','PRESTIGE','FUR'].map(v=>`<option value="${v}" ${magicAdmin.uniqueGrade===v?'selected':''}>${v}</option>`).join('')}</select><select id="uniqueStatusFilter"><option value="ALL">전체 상태</option><option value="ACTIVE" ${magicAdmin.uniqueStatus==='ACTIVE'?'selected':''}>활성 카드</option><option value="INACTIVE" ${magicAdmin.uniqueStatus==='INACTIVE'?'selected':''}>비활성 카드</option><option value="UNSET" ${magicAdmin.uniqueStatus==='UNSET'?'selected':''}>미설정 카드</option></select><button type="button" id="uniqueSelectVisible" class="ghost">현재 목록 선택</button><button type="button" id="uniqueClearSelection" class="ghost">선택 해제</button></div>${uniqueQuickBatch()}<div class="uniqueInlineHeader"><span></span><span>카드</span><span>공격</span><span>방어</span><span>HP</span><span>속도</span><span>콘텐츠</span><span>적용</span><span>세부</span></div><div id="uniqueAbilityList" class="uniqueInlineList">${uniqueEffectRows()}</div><div class="uniqueSaveDock ${dirty?'hasChanges':''}" id="uniqueSaveDock"><div><b>저장 대기 <strong id="uniqueDirtyCount">${dirty}</strong>장</b><span>행별로 다른 값을 입력해도 한 번에 저장됩니다.</span></div><button type="button" id="uniqueDiscardAll" class="ghost" ${dirty?'':'disabled'}>변경 취소</button><button type="button" id="uniqueSaveAll" ${dirty?'':'disabled'}>변경 카드 일괄 저장</button></div>${uniqueEffectEditor()}</section>`;
  }
  function renderUniqueAbilityAdmin(keepScroll=false){
    const root=$('#uniqueAbilityAdminRoot'),d=magicAdmin.data||{},cfg=d.uniqueEffectSettings||{},list=d.uniqueEffects||[],scrollY=window.scrollY;
    if(!root)return;
    const activeCount=list.filter(x=>uniqueEditableState(x).isActive).length,configuredCount=list.filter(x=>{const v=uniqueEditableState(x);return number(v.attackPercent)||number(v.defensePercent)||number(v.hpPercent)||number(v.speedPercent)||v.effectName}).length;
    root.innerHTML=`<section class="uniqueAbilitySummary"><div><small>CARD UNIQUE ABILITY · V1163</small><h2>카드별 고유 능력치</h2></div><div><span>대상 <b>${list.length}</b></span><span>설정 <b>${configuredCount}</b></span><span>활성 <b>${activeCount}</b></span><span>수정 중 <b id="uniqueHeroDirty">${magicAdmin.uniqueDirty.size}</b></span></div></section>${uniqueAbilityControl(cfg)}${uniqueManagerPanel()}`;
    bindUniqueAbilityAdmin();
    const dialog=$('#uniqueEffectDialog');if(dialog&&!dialog.open)dialog.showModal();
    if(keepScroll)requestAnimationFrame(()=>window.scrollTo({top:scrollY}));
  }
  function updateUniqueSelectionState(){
    const selected=magicAdmin.uniqueSelected.size,dirty=magicAdmin.uniqueDirty.size;
    const selectedNode=$('#uniqueSelectedCount'),dirtyNode=$('#uniqueDirtyCount'),hero=$('#uniqueHeroDirty'),save=$('#uniqueSaveAll'),discard=$('#uniqueDiscardAll'),apply=$('#uniqueApplySelected'),dock=$('#uniqueSaveDock');
    if(selectedNode)selectedNode.textContent=String(selected);if(dirtyNode)dirtyNode.textContent=String(dirty);if(hero)hero.textContent=String(dirty);
    if(save)save.disabled=dirty===0;if(discard)discard.disabled=dirty===0;if(apply)apply.disabled=selected===0;dock?.classList.toggle('hasChanges',dirty>0);
  }
  function readUniqueRow(row){
    const id=String(row.dataset.uniqueRow),base=uniqueBaseCard(id),value=uniqueEditableState(base);
    const get=key=>row.querySelector(`[data-unique-field="${key}"]`);
    return {...value,cardId:id,attackPercent:number(get('attackPercent')?.value),defensePercent:number(get('defensePercent')?.value),hpPercent:number(get('hpPercent')?.value),speedPercent:number(get('speedPercent')?.value),scopes:{pve:row.querySelector('[data-unique-scope="pve"]')?.checked!==false,pvp:row.querySelector('[data-unique-scope="pvp"]')?.checked!==false,captain:row.querySelector('[data-unique-scope="captain"]')?.checked!==false},isActive:get('isActive')?.checked===true};
  }
  function markUniqueRow(row){
    const id=String(row.dataset.uniqueRow),base=uniqueBaseCard(id),draft=readUniqueRow(row);
    if(base&&uniqueStateEqual(base,draft)){magicAdmin.uniqueDrafts.delete(id);magicAdmin.uniqueDirty.delete(id);row.classList.remove('dirty')}else{magicAdmin.uniqueDrafts.set(id,uniqueNormalized(draft));magicAdmin.uniqueDirty.add(id);row.classList.add('dirty')}
    const active=draft.isActive===true;row.classList.toggle('active',active);const toggle=row.querySelector('.uniqueActiveToggle b');if(toggle)toggle.textContent=active?'ON':'OFF';updateUniqueSelectionState();
  }
  function bindUniqueRows(){
    document.querySelectorAll('[data-unique-select]').forEach(input=>input.onchange=()=>{const id=String(input.dataset.uniqueSelect);if(input.checked&&magicAdmin.uniqueSelected.size>=100){input.checked=false;alert('한 번에 최대 100장까지 선택할 수 있습니다.');return}if(input.checked)magicAdmin.uniqueSelected.add(id);else magicAdmin.uniqueSelected.delete(id);input.closest('.uniqueInlineRow')?.classList.toggle('selected',input.checked);updateUniqueSelectionState()});
    document.querySelectorAll('.uniqueInlineRow input[data-unique-field],.uniqueInlineRow input[data-unique-scope]').forEach(input=>{input.addEventListener('input',()=>markUniqueRow(input.closest('.uniqueInlineRow')));input.addEventListener('change',()=>markUniqueRow(input.closest('.uniqueInlineRow')))});
    document.querySelectorAll('[data-unique-edit]').forEach(button=>button.onclick=event=>{event.preventDefault();openUniqueEffect(button.dataset.uniqueEdit)});
  }
  function refreshUniqueList(){
    const list=$('#uniqueAbilityList');if(!list)return;list.innerHTML=uniqueEffectRows();const count=$('#uniqueFilteredCount');if(count)count.textContent=String(uniqueFilteredList().length);bindUniqueRows();updateUniqueSelectionState();
  }
  function applyUniqueQuickBatch(){
    const ids=[...magicAdmin.uniqueSelected];if(!ids.length)return alert('빠르게 입력할 카드를 먼저 선택하세요.');
    const raw={attackPercent:$('#quickUniqueAttack')?.value,defensePercent:$('#quickUniqueDefense')?.value,hpPercent:$('#quickUniqueHp')?.value,speedPercent:$('#quickUniqueSpeed')?.value},changes={};
    for(const [key,value] of Object.entries(raw))if(String(value??'').trim()!=='')changes[key]=number(value);
    const active=$('#quickUniqueActive')?.value;if(active&&active!=='KEEP')changes.isActive=active==='1';
    if($('#quickUniqueScopeEnabled')?.checked)changes.scopes={pve:$('#quickUniquePve').checked,pvp:$('#quickUniquePvp').checked,captain:$('#quickUniqueCaptain').checked};
    if(!Object.keys(changes).length)return alert('선택 카드에 입력할 값을 하나 이상 지정하세요.');
    for(const id of ids){const base=uniqueBaseCard(id),current=uniqueEditableState(base),next={...current,...changes,scopes:changes.scopes?{...changes.scopes}:{...(current.scopes||{})}};if(base&&uniqueStateEqual(base,next)){magicAdmin.uniqueDrafts.delete(id);magicAdmin.uniqueDirty.delete(id)}else{magicAdmin.uniqueDrafts.set(id,uniqueNormalized(next));magicAdmin.uniqueDirty.add(id)}}
    refreshUniqueList();uniqueToast(`${ids.length}장에 값을 입력했습니다. 하단 저장 버튼을 눌러 확정하세요.`,'info');
  }
  function discardUniqueChanges(){if(!magicAdmin.uniqueDirty.size)return;if(!confirm(`${magicAdmin.uniqueDirty.size}장의 저장 전 변경사항을 모두 취소할까요?`))return;magicAdmin.uniqueDrafts.clear();magicAdmin.uniqueDirty.clear();refreshUniqueList();uniqueToast('저장 전 변경사항을 취소했습니다.','info')}
  async function saveUniqueRows(button){
    const ids=[...magicAdmin.uniqueDirty];if(!ids.length)return alert('저장할 변경사항이 없습니다.');
    if(!confirm(`${ids.length}장의 카드별 능력치를 일괄 저장할까요?`))return;
    await uniqueSaveGuard(button,'일괄 저장 중...',async()=>{
      let updated=0,warning='';
      for(let offset=0;offset<ids.length;offset+=100){const batch=ids.slice(offset,offset+100).map(id=>uniqueNormalized(uniqueEditableState(uniqueBaseCard(id))));const result=await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'BATCH_SAVE_UNIQUE_ROWS',items:batch})});updated+=number(result.updatedCount);if(result.warning)warning=String(result.warning)}
      for(const id of ids){const base=uniqueBaseCard(id),draft=magicAdmin.uniqueDrafts.get(id);if(base&&draft)Object.assign(base,draft,{scopes:{...draft.scopes}})}
      magicAdmin.uniqueDrafts.clear();magicAdmin.uniqueDirty.clear();refreshUniqueList();
      const message=`${updated}장의 카드 고유 능력치를 일괄 저장했습니다.${warning?'\n'+warning:''}`;uniqueToast(message,warning?'warn':'ok');alert(message);
    });
  }
  function bindUniqueAbilityAdmin(){
    $('#uniqueSystemSave')?.addEventListener('click',event=>{event.preventDefault();saveUniqueSettings(event.currentTarget)});
    const search=$('#uniqueAbilitySearch');if(search)search.oninput=()=>{magicAdmin.effectSearch=search.value;refreshUniqueList()};
    $('#uniqueGradeFilter')?.addEventListener('change',event=>{magicAdmin.uniqueGrade=event.target.value;refreshUniqueList()});
    $('#uniqueStatusFilter')?.addEventListener('change',event=>{magicAdmin.uniqueStatus=event.target.value;refreshUniqueList()});
    $('#uniqueSelectVisible')?.addEventListener('click',event=>{event.preventDefault();for(const card of uniqueFilteredList()){if(magicAdmin.uniqueSelected.size>=100)break;magicAdmin.uniqueSelected.add(String(card.cardId))}refreshUniqueList()});
    $('#uniqueClearSelection')?.addEventListener('click',event=>{event.preventDefault();magicAdmin.uniqueSelected.clear();refreshUniqueList()});
    $('#quickUniqueScopeEnabled')?.addEventListener('change',event=>['#quickUniquePve','#quickUniquePvp','#quickUniqueCaptain'].forEach(selector=>{$(selector).disabled=!event.target.checked}));
    $('#uniqueApplySelected')?.addEventListener('click',event=>{event.preventDefault();applyUniqueQuickBatch()});
    $('#uniqueDiscardAll')?.addEventListener('click',event=>{event.preventDefault();discardUniqueChanges()});
    $('#uniqueSaveAll')?.addEventListener('click',event=>{event.preventDefault();saveUniqueRows(event.currentTarget)});
    $('#magicEffectCancel')?.addEventListener('click',event=>{event.preventDefault();magicAdmin.editingEffect=null;renderUniqueAbilityAdmin(true)});
    $('#magicEffectSave')?.addEventListener('click',event=>{event.preventDefault();saveUniqueEffect(event.currentTarget)});
    $('#uniqueEffectDialog')?.addEventListener('cancel',event=>{event.preventDefault();magicAdmin.editingEffect=null;renderUniqueAbilityAdmin(true)});
    bindUniqueRows();updateUniqueSelectionState();
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
  function magicCardRow(x){const image=adminImage(x.imageUrl,`${x.name} 마법카드 이미지`);return `<article class="magicAdminCard ${x.isActive?'':'off'}"><div class="magicAdminArt${image?'':' image-missing'}">${image}<span>✦</span></div><div><small>${h(x.rarity)} · ${h(x.code)}</small><h3>${h(x.name)}</h3><p>${h(x.description||'설명 없음')}</p><div class="magicAdminTags"><b>${h(effectLabel(x.effectType))}</b><b>${h(triggerLabel(x.triggerType))}</b><b>${number(x.triggerChance)}%</b><b>최대 ${number(x.maxActivations)}회</b></div></div><div class="magicAdminCardActions">${statusPill(x.isActive)}<button data-magic-edit="${x.id}">수정</button><button data-magic-toggle="${x.id}" data-active="${x.isActive?'0':'1'}" class="ghost">${x.isActive?'비활성':'활성화'}</button></div></article>`}
  function bindMagicAdmin(){
    $('#magicSaveSettings').onclick=saveSettings;$('#magicSaveAcquisition').onclick=saveAcquisition;$('#magicSaveCard').onclick=saveMagicCard;$('#magicNewCard').onclick=()=>{magicAdmin.editingMagic=null;renderMagicAdmin()};
    $('#magicAddTowerRow')?.addEventListener('click',()=>{$('#magicTowerRows').insertAdjacentHTML('beforeend',floorRewardRow());bindRewardRemovers()});
    $('#magicAddRaidRank')?.addEventListener('click',()=>{$('#magicRaidRankRows').insertAdjacentHTML('beforeend',rankRewardRow('raid'));bindRewardRemovers()});
    $('#magicAddCaptainRank')?.addEventListener('click',()=>{$('#magicCaptainRankRows').insertAdjacentHTML('beforeend',rankRewardRow('captain'));bindRewardRemovers()});
    bindRewardRemovers();
    $('#magicCancelEdit')?.addEventListener('click',()=>{magicAdmin.editingMagic=null;renderMagicAdmin()});
    document.querySelectorAll('[data-magic-edit]').forEach(b=>b.onclick=()=>{magicAdmin.editingMagic=magicAdmin.data.cards.find(x=>Number(x.id)===Number(b.dataset.magicEdit));renderMagicAdmin();window.scrollTo({top:0,behavior:'smooth'})});
    document.querySelectorAll('[data-magic-toggle]').forEach(b=>b.onclick=()=>toggleCard(Number(b.dataset.magicToggle),b.dataset.active==='1'));
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
  async function saveUniqueSettings(button){
    const enabled=$('#uniqueSystemEnabled').value==='1';
    if(enabled&&!confirm('카드별 고유 능력치를 일반 유저 전투에 적용할까요?\n먼저 OWNER 테스트 결과를 확인했는지 점검하세요.'))return;
    const settings={enabled,ownerTestEnabled:$('#uniqueOwnerTest').value==='1',userDetailEnabled:$('#uniqueUserDetail').value==='1'};
    await uniqueSaveGuard(button,'설정 저장 중...',async()=>{
      const result=await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'SAVE_UNIQUE_SETTINGS',settings})});
      magicAdmin.data.uniqueEffectSettings=result.settings||settings;
      const message=`고유 능력 적용 설정을 저장했습니다.${result.warning?'\n'+result.warning:''}`;uniqueToast(message,result.warning?'warn':'ok');alert(message);renderUniqueAbilityAdmin(true);
    });
  }
  async function saveMagicCard(){const x=magicAdmin.editingMagic||{};await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'SAVE_MAGIC_CARD',id:x.id||null,name:$('#magicCardName').value,code:$('#magicCardCode').value,rarity:$('#magicCardRarity').value,imageUrl:$('#magicCardImage').value,description:$('#magicCardDescription').value,effectType:$('#magicCardEffectType').value,triggerType:$('#magicCardTrigger').value,effectValue:number($('#magicCardEffectValue').value),triggerChance:number($('#magicCardChance').value),maxActivations:number($('#magicCardMax').value),drawWeight:number($('#magicCardWeight').value),sortOrder:number($('#magicCardSort').value),scopes:{pve:$('#magicScopePve').checked,pvp:$('#magicScopePvp').checked,captain:$('#magicScopeCaptain').checked},isActive:$('#magicCardActive').checked})});alert('마법카드를 저장했습니다.');magicAdmin.editingMagic=null;loadMagicAdmin()}
  async function toggleCard(id,isActive){if(!confirm(`이 마법카드를 ${isActive?'활성화':'비활성화'}할까요?`))return;await api('admin/magic-system',{method:'POST',body:JSON.stringify({action:'TOGGLE_MAGIC_CARD',id,isActive})});loadMagicAdmin()}
  function openUniqueEffect(cardId){magicAdmin.editingEffect=uniqueBaseCard(cardId);renderUniqueAbilityAdmin(true)}
  async function saveUniqueEffect(button){
    const base=magicAdmin.editingEffect;if(!base)return;
    await uniqueSaveGuard(button,'세부 효과 저장 중...',async()=>{
      const payload={action:'SAVE_UNIQUE_EFFECT',cardId:base.cardId,attackPercent:number($('#uniqueAttack').value),defensePercent:number($('#uniqueDefense').value),hpPercent:number($('#uniqueHp').value),speedPercent:number($('#uniqueSpeed').value),effectName:$('#uniqueName').value,effectDescription:$('#uniqueDescription').value,effectType:$('#uniqueType').value,triggerType:$('#uniqueTrigger').value,effectValue:number($('#uniqueValue').value),triggerChance:number($('#uniqueChance').value),maxActivations:number($('#uniqueMax').value),scopes:{pve:$('#uniquePve').checked,pvp:$('#uniquePvp').checked,captain:$('#uniqueCaptain').checked},isActive:$('#uniqueActive').checked};
      const result=await api('admin/magic-system',{method:'POST',body:JSON.stringify(payload)});
      Object.assign(base,payload,{scopes:{...payload.scopes}});delete base.action;magicAdmin.uniqueDrafts.delete(String(base.cardId));magicAdmin.uniqueDirty.delete(String(base.cardId));magicAdmin.editingEffect=null;
      const message=`${base.title} 카드의 세부 효과를 저장했습니다.${result.warning?'\n'+result.warning:''}`;uniqueToast(message,result.warning?'warn':'ok');alert(message);renderUniqueAbilityAdmin(true);
    });
  }
})();
