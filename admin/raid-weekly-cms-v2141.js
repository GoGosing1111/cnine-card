(() => {
  'use strict';
  const q=(selector,root=document)=>root.querySelector(selector),qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types=[['COIN','코인'],['CARD_SHARD','카드 조각'],['PREMIUM_CUBE','프리미엄 큐브'],['EQUIPMENT_SUPPLY_BOX','장비 보급상자'],['MAGIC_CARD_PACK','마법카드 팩'],['MASTER_STAR','마스터의 별'],['CORE_RAID_ENTRY_TICKET','붕괴 코어 입장권']];
  const days=['일','월','화','수','목','금','토'];
  const field=(key,label,value,min,max,step=1)=>`<label class="field"><span>${esc(label)}</span><input data-wk-field="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" required></label>`;
  const bundle=items=>`<div class="raid-reward-bundle">${types.map(([type,label])=>field(type,label,(items||[]).filter(x=>x.type===type).reduce((n,x)=>n+Number(x.amount),0),0,type==='COIN'?10000000000:1000000)).join('')}</div>`;
  function rewardRow(kind,row={}){
    const head=kind==='damage'?field('damage','누적 피해',row.damage??5000000,1,2000000000):kind==='rank'?field('from','시작 순위',row.from??1,1,1000)+field('to','종료 순위',row.to??1,1,1000):`<label class="field"><span>품목</span><select data-wk-type>${types.map(([code,label])=>`<option value="${code}" ${row.type===code?'selected':''}>${label}</option>`).join('')}</select></label>${field('amount','수량',row.amount??1,1,row.type==='COIN'?10000000000:1000000)}${field('chance','확률(%)',row.chance??1,0,100,.001)}`;
    return `<article class="raid-dynamic-row" data-wk-row="${kind}"><div class="raid-dynamic-row-head">${head}<button type="button" data-wk-remove>삭제</button></div>${kind==='rare'?'':bundle(row.rewards)}</article>`;
  }
  const readField=(root,key)=>Number(q(`[data-wk-field="${key}"]`,root).value);
  const readBundle=root=>types.map(([type])=>({type,amount:readField(root,type)})).filter(x=>x.amount>0);
  function sync(){
    const legacyRewards=q('#raidParticipationRewards')?.closest('section');
    const mystic=q('.raid-clear-mystic-bonus');if(mystic&&legacyRewards?.contains(mystic))legacyRewards.insertAdjacentElement('beforebegin',mystic);
    if(legacyRewards)legacyRewards.hidden=true;
    for(const id of ['#raidBossName','#raidBossAttackPower','#raidBossAttackInterval']){const el=q(id);if(el)(id==='#raidBossName'?el.closest('.panel'):el.closest('.field')).hidden=true;}
    qa('.rbName').forEach(el=>el.readOnly=true);
    qa('.rbHp').forEach(el=>{el.min='1';el.max='2000000000';el.step='1';});
    qa('.rbDefense').forEach(el=>{el.min='0';el.max='99';});
    qa('.rbOpenCost').forEach(el=>{el.min='0';el.max='100000000';el.step='1';});
    qa('.rslotBoss').forEach(el=>{el.innerHTML='<option value="0">요일 로테이션 자동 적용</option>';el.disabled=true;});
    const note=q('#raidV1293Slots')?.closest('section')?.querySelector('p');if(note)note.textContent='각 타임의 개방 시간과 참여 횟수는 유지하며, 보스는 아래 요일 로테이션을 따릅니다.';
    const save=q('#raidV1293Save');if(save)save.textContent='공통 시간·전투 설정 저장';
  }
  function render(){
    const weekly=state.raidData?.weekly;if(!weekly)return;
    let host=q('#raidWeeklyCms');
    if(!host){host=document.createElement('section');host.id='raidWeeklyCms';host.className='panel raid-weekly-cms';q('#raidV1293Shell').insertAdjacentElement('beforebegin',host);}
    const options=selected=>weekly.bosses.map(b=>`<option value="${b.code}" ${selected===b.code?'selected':''}>${esc(b.name)}</option>`).join('');
    host.innerHTML=`<header><small>WEEKLY RAID · 3 BOSSES</small><h2>요일별 보스 · 개별 전투와 보상</h2><p>나가토·요리이치·이치고 3종을 7일에 배치합니다. 변경값은 새로 생성되는 방부터 적용됩니다.</p></header><div class="raid-weekly-rotation">${[1,2,3,4,5,6,0].map(day=>`<label class="field"><span>${days[day]}요일</span><select data-wk-day="${day}">${options(weekly.config.rotation[day])}</select></label>`).join('')}</div><div class="raid-weekly-editors">${weekly.bosses.map((boss,index)=>{
      const row=weekly.config.bosses[boss.code],r=row.rewards;
      return `<details data-wk-boss="${boss.code}" ${index===0?'open':''}><summary><img src="${esc(boss.battleSprite)}" alt=""><span><b>${esc(boss.name)}</b><small>${esc(boss.ultimate.name)} · 쫄몹 2종</small></span><em>설정 열기</em></summary><div class="raid-weekly-editor"><div class="formgrid">${field('power','표시 전투력',row.powerRating,1,2000000000)}${field('attack','기본 공격력',row.bossAttackPower,1,100000000)}${field('interval','공격 간격(ms)',row.bossAttackIntervalMs,500,60000)}${field('every','궁극기 발동 주기(공격 횟수)',row.ultimate.everyAttacks,2,20)}${field('multiplier','궁극기 피해 배율',row.ultimate.multiplier,1,10,.01)}${field('guard','쫄몹 피해 분담(%)',Number((row.minionGuardRatio*100).toFixed(3)),0,95,.1)}</div><p class="muted">전투력은 작전표 표시값이며 실제 전투는 기본 공격력·공격 간격과 하단 보스 HP·방어 설정을 사용합니다.</p><div class="formgrid">${boss.minions.map((minion,i)=>field(`hp${i}`,`${minion.name} HP`,row.minions[i].maxHp,1,2000000000)+field(`spawn${i}`,`${minion.name} 등장 보스 HP(%)`,Number((row.minions[i].spawnAtHpPct*100).toFixed(3)),5,100,.1)).join('')}</div><div class="raid-weekly-rewards">${[['participation','참여 보상'],['clear','보스 처치 보상'],['minionClear','쫄몹 1기 처치 보상']].map(([key,label])=>`<h3>${label}</h3><div data-wk-bundle="${key}">${bundle(r[key])}</div>`).join('')}${[['damage','damageMilestones','누적 피해 보상'],['rank','rankRewards','최종 순위 보상'],['rare','rareDrops','희귀 드롭']].map(([kind,key,label])=>`<header><h3>${label}</h3><button type="button" data-wk-add="${kind}">+ 추가</button></header><div data-wk-list="${kind}">${r[key].map(row=>rewardRow(kind,row)).join('')}</div>`).join('')}</div></div></details>`;
    }).join('')}</div><footer><span data-wk-status role="status">보스별 보상 코인은 항목당 최대 100억입니다. HP·방어·활성·개방 비용은 하단 보스 관리에서 설정합니다.</span><button type="button" data-wk-save>요일·보스별 설정 저장</button></footer>`;
    host.onclick=event=>{
      const remove=event.target.closest('[data-wk-remove]');if(remove){remove.closest('[data-wk-row]').remove();return;}
      const add=event.target.closest('[data-wk-add]');if(add){const kind=add.dataset.wkAdd; q(`[data-wk-list="${kind}"]`,add.closest('[data-wk-boss]')).insertAdjacentHTML('beforeend',rewardRow(kind,kind==='rare'?{type:'CORE_RAID_ENTRY_TICKET'}:{}));return;}
      if(event.target.closest('[data-wk-save]'))void save();
    };
    host.onchange=event=>{if(event.target.matches('[data-wk-type]'))q('[data-wk-field="amount"]',event.target.closest('[data-wk-row]')).max=event.target.value==='COIN'?'10000000000':'1000000';};
    sync();
  }
  function draft(){
    const host=q('#raidWeeklyCms'),config={revision:state.raidData.weekly.config.revision,rotation:Array(7),bosses:{}};
    for(const el of qa('[data-wk-day]',host))config.rotation[Number(el.dataset.wkDay)]=el.value;
    for(const el of qa('[data-wk-boss]',host)){
      const rewards={};for(const key of ['participation','clear','minionClear'])rewards[key]=readBundle(q(`[data-wk-bundle="${key}"]`,el));
      rewards.damageMilestones=qa('[data-wk-row="damage"]',el).map(row=>({damage:readField(row,'damage'),rewards:readBundle(row)}));
      rewards.rankRewards=qa('[data-wk-row="rank"]',el).map(row=>({from:readField(row,'from'),to:readField(row,'to'),rewards:readBundle(row)}));
      rewards.rareDrops=qa('[data-wk-row="rare"]',el).map(row=>({type:q('[data-wk-type]',row).value,amount:readField(row,'amount'),chance:readField(row,'chance')}));
      config.bosses[el.dataset.wkBoss]={powerRating:readField(el,'power'),bossAttackPower:readField(el,'attack'),bossAttackIntervalMs:readField(el,'interval'),minionGuardRatio:readField(el,'guard')/100,ultimate:{everyAttacks:readField(el,'every'),multiplier:readField(el,'multiplier')},minions:[0,1].map(i=>({maxHp:readField(el,`hp${i}`),spawnAtHpPct:readField(el,`spawn${i}`)/100})),rewards};
    }
    return config;
  }
  async function save(){
    const host=q('#raidWeeklyCms'),button=q('[data-wk-save]',host),status=q('[data-wk-status]',host);
    if(button.disabled)return;
    for(const input of qa('input',host))if(!input.checkValidity()){input.closest('details').open=true;input.reportValidity();return;}
    button.disabled=true;status.textContent='저장 후 서버 재조회 중…';
    try{
      const result=await api('admin/raid',{method:'PATCH',body:JSON.stringify({weekly:draft()})});
      const verified=await api('admin/raid');
      if(JSON.stringify(result.weekly.config)!==JSON.stringify(verified.weekly.config))throw Error('저장 후 재조회 값이 다릅니다. 새로고침해 확인하세요.');
      state.raidData=verified;render();q('[data-wk-status]').textContent='저장 및 재조회 확인 완료 · 다음 생성 방부터 적용됩니다.';
    }catch(error){status.textContent=error.message;status.classList.add('error');}
    finally{button.disabled=false;}
  }
  window.CNineWeeklyRaidCms={render,sync};
  const prior=loadRaidAdmin;loadRaidAdmin=async function(){const result=await prior();render();return result;};
  if(state.raidData?.weekly)render();
})();
