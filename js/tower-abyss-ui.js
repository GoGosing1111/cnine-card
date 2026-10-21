(function(root){
  'use strict';
  const VERSION='20261022-abyss-settlement-v1',ART='/assets/ui/tower-abyss-20261021/',MAX_RECORDS=40;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('ko-KR'):'—';
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
  const clock=ms=>{if(finite(ms)===null)return '—';const s=Math.max(0,Math.ceil(Number(ms)/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
  const imagePath=value=>{const s=String(value||'').trim().replace(/\\/g,'/');return /^(?:https?:\/\/|\/?(?:assets|preview)\/)/.test(s)?s:'';};
  const button=(action,label,extra='',style='')=>`<button type="button" class="abyss-button ${style}" data-abyss-action="${action}" ${extra}>${label}</button>`;
  const stamp=(floor,small=false)=>`<div class="abyss-seal ${small?'is-small':''}"><span>${esc(floor)}</span><small>FLOOR</small></div>`;
  function readRecords(userId,storage){
    try{storage||=root.localStorage;const rows=JSON.parse(storage.getItem('cnine:tower:abyss-records:v1:'+Number(userId))||'[]');return Array.isArray(rows)?rows.filter(r=>r&&Number.isSafeInteger(r.floor)&&r.floor>0&&['WIN','LOSE'].includes(r.result)&&typeof r.id==='string').slice(0,MAX_RECORDS):[];}catch{return [];}
  }
  function summarize(data,at=Date.now()){
    const result=data.battleV2?.result||{},team=result.final?.A,firstFall=(result.timeline||[]).find(e=>e.type==='KO'&&(e.targetSide==='A'||(data.battleV2?.teams?.A?.cards||[]).some(c=>c.id===e.targetId)));
    return {id:String(data.requestId||''),floor:Number(data.floorNo||data.tier),result:data.result==='WIN'?'WIN':'LOSE',rulesVersion:String(data.rulesVersion||data.engineVersion||'OPERATING'),
      at,elapsed:finite(data.elapsedCombatMs),limit:finite(data.combatLimitMs),enemyPower:finite(data.monsterPower),guardianHp:finite(data.guardianHpPercent),progress:finite(data.guardianProgress),
      survivors:Array.isArray(team)?team.filter(c=>Number(c.hp)>0).length:null,total:Array.isArray(team)?team.length:null,
      firstFall:firstFall?finite(firstFall.elapsedCombatMs):null,reason:String(data.failureReason||result.reason||''),reward:finite(data.reward)};
  }
  function remember(userId,data,storage){
    const record=summarize(data);if(!record.id||!Number.isSafeInteger(record.floor)||record.floor<1)return null;
    const rows=readRecords(userId,storage),found=rows.find(r=>r.id===record.id);if(found)return found;
    try{storage||=root.localStorage;storage.setItem('cnine:tower:abyss-records:v1:'+Number(userId),JSON.stringify([record,...rows].slice(0,MAX_RECORDS)));return record;}catch{return record;}
  }
  function previousFor(record,rows){return rows.find(r=>r.id!==record.id&&r.floor===record.floor&&r.rulesVersion===record.rulesVersion&&r.limit===record.limit&&r.enemyPower===record.enemyPower)||null;}
  const reason=r=>r.result==='WIN'?'수호자 격파':({TIME_LIMIT:'제한 시간 종료',PARTY_DEFEATED:'원정대 전멸',GUARDIAN_SURVIVED:'수호자 생존',ALL_DEFEATED:'원정대 전멸'}[r.reason]||'도전 종료');
  function comparison(r,previous){
    if(!previous)return '<p class="abyss-muted">같은 층·같은 전투 조건의 기록이 쌓이면 성장 변화를 비교합니다.</p>';
    const rows=[];
    if(r.guardianHp!==null&&previous.guardianHp!==null)rows.push(`<li><span>수호자 잔여 체력</span><b>${num(previous.guardianHp)}% <i>→</i> ${num(r.guardianHp)}%</b></li>`);
    if(r.survivors!==null&&previous.survivors!==null)rows.push(`<li><span>생존 인원</span><b>${num(previous.survivors)}명 <i>→</i> ${num(r.survivors)}명</b></li>`);
    if(r.result==='WIN'&&previous.result==='WIN'&&r.elapsed!==null&&previous.elapsed!==null)rows.push(`<li><span>공식 공략 시간</span><b>${clock(previous.elapsed)} <i>→</i> ${clock(r.elapsed)}</b></li>`);
    return rows.length?`<ul class="abyss-comparison">${rows.join('')}</ul>`:'<p class="abyss-muted">이전 기록에 비교할 전투 수치가 없습니다.</p>';
  }
  function portraits(cards,large=false){
    return `<ol class="abyss-party ${large?'is-expanded':''}">${Array.from({length:5},(_,i)=>{const c=cards[i],src=imagePath(c?.image||c?.image_url||c?.sourceArt);return `<li class="${c?'':'is-empty'}"><div class="abyss-portrait">${src?`<img src="${esc(src)}" alt="${esc(c.title||c.name||'출전 카드')}" loading="lazy">`:'<span>미편성</span>'}<small>${String(i+1).padStart(2,'0')}</small></div><b>${esc(c?.title||c?.name||'빈 자리')}</b>${large&&c?`<span>${esc(c.rarity||c.grade||'')} ${Number(c.breakthroughLevel||c.breakthrough_level)>0?'· +'+Number(c.breakthroughLevel||c.breakthrough_level):''}</span>`:''}</li>`;}).join('')}</ol>`;
  }
  function shell({data,tab='challenge',power=0}){
    const p=data?.progress||{},best=Number(p.highestFloor||0);
    return `<div class="abyss-world"><header class="abyss-topbar">${button('exit','<span aria-hidden="true">‹</span> 토벌로','aria-label="PVE 토벌 화면으로"','is-quiet')}<span>INFINITE TOWER <i>/</i> THE ABYSS</span>${button('refresh','새로고침','','is-quiet')}</header><div class="abyss-title"><div><p class="abyss-eyebrow">BEYOND YOUR LIMITS</p><h2>무한의탑<span>나락의 시련</span></h2><p>당신의 성장은, 어디까지 닿았는가.</p></div><dl class="abyss-summary"><div><dt>최고 도달</dt><dd>${num(best)}<small>층</small></dd></div><div><dt>내 순위</dt><dd>${p.rank?num(p.rank):'—'}<small>${p.rank?'위':''}</small></dd></div><div><dt>출전 전투력</dt><dd class="is-power">${num(power)}</dd></div></dl></div><nav class="abyss-nav" aria-label="무한의탑 메뉴">${[['challenge','한계 도전'],['formation','출전 편성'],['records','성장 기록'],['ranking','등반 순위']].map(([id,label])=>button('tab',label,`data-tab="${id}" aria-pressed="${tab===id}"`,tab===id?'is-active':'')).join('')}</nav><div class="abyss-body" data-abyss-body data-tab="${esc(tab)}"></div><footer class="abyss-footer"><span>한 층의 승리가 다음 문을 엽니다.</span><button type="button" class="abyss-text-button" data-abyss-action="guide">도전 안내</button></footer></div>`;
  }
  function challenge({data,cards,records=[]}){
    const p=data.progress||{},f=data.floor||{},floor=Number(f.floorNo||p.currentFloor||1),best=Number(p.highestFloor||0),max=Number(data.maxFloor||0),complete=data.completed||p.completed,blocked=data.blocked||!data.floor,ready=!complete&&!blocked;
    const recent=records.find(r=>r.floor===floor),boss=imagePath(f.monsterImage);
    const path=Array.from({length:5},(_,i)=>Math.max(1,(complete?max-2:floor)-2)+i).filter(n=>n<=max);
    const title=complete?'현재 열린 모든 문을 돌파했습니다':blocked?'아직 열리지 않은 봉인':f.isBoss?'관문 앞에 선 당신':'다음 한계를 마주할 시간';
    return `<div class="abyss-challenge"><aside class="abyss-ascent"><p class="abyss-eyebrow">YOUR ASCENT</p><h3>등반의 궤적</h3><ol>${path.map(n=>`<li class="${n===floor&&!complete?'is-current':n<=best?'is-cleared':'is-locked'}"><span class="abyss-floor-mark">${n}</span><div><b>${n}층</b><small>${n===floor&&!complete?'현재 도전':n<=best?'돌파 완료':'미도달'}</small></div></li>`).join('')}</ol><p>완료한 층은 기록으로 남습니다.<br>다음 문은 직접 돌파해야 합니다.</p></aside><section class="abyss-focus"><p class="abyss-eyebrow">${complete?'ASCENT COMPLETE':f.isBoss?'GATE OF THE GUARDIAN':'THE NEXT THRESHOLD'}</p>${stamp(complete?best:floor)}<h3>${title}</h3>${ready?`<div class="abyss-guardian">${boss?`<img src="${esc(boss)}" alt="${esc(f.monsterName)}">`:''}<div><small>이번 층의 수호자</small><strong>${esc(f.monsterName||'탑의 수호자')}</strong></div></div>`:`<p class="abyss-state-copy">${esc(complete?'당신이 남긴 최고층과 보상 기록은 보존됩니다. 새로운 층이 열리면 이어서 도전할 수 있습니다.':data.message||'다음 구간이 개방되면 이곳에서 이어서 도전할 수 있습니다.')}</p>`}</section><aside class="abyss-challenge-info abyss-frame"><p class="abyss-eyebrow">CHALLENGE BRIEF</p><h3>${ready?'도전 준비':complete?'돌파의 증명':'봉인 대기'}</h3><dl class="abyss-facts"><div><dt>현재 도전층</dt><dd>${complete?'완료':floor+'층'}</dd></div><div><dt>최고 기록</dt><dd>${best}층</dd></div>${ready?`<div><dt>수호자 전투력</dt><dd>${num(f.monsterPower)}</dd></div><div class="abyss-reward"><dt>층 클리어 보상</dt><dd>${num(f.rewardCoin)} <small>코인</small></dd></div>`:''}</dl>${recent?`<div class="abyss-last-attempt"><small>최근 같은 층의 도전</small><b>${esc(reason(recent))}</b><span>${recent.guardianHp===null?'전투 종료':`수호자 체력 ${num(recent.guardianHp)}% 남음`}</span></div>`:'<p class="abyss-muted">돌파와 실패 모두<br>다음 도전의 기준이 됩니다.</p>'}${ready?button('fight',`<small>${floor}F · ENTER THE ABYSS</small><strong>${floor}층 도전 <span aria-hidden="true">→</span></strong>`,cards.length===5?'':'disabled','is-primary'):button('tab','성장 기록 보기','data-tab="records"','is-primary')}${ready?`<p class="abyss-action-note">${cards.length===5?'전투 전체를 진행한 뒤 결과를 확인합니다.':'PVE 카드 5장을 먼저 편성해 주세요.'}</p>`:''}</aside></div><section class="abyss-expedition abyss-frame"><div class="abyss-section-title"><div><small>YOUR EXPEDITION</small><h3>함께 한계를 넘을 원정대</h3></div>${button('tab','편성 확인','data-tab="formation"','is-quiet')}</div>${portraits(cards)}<p class="abyss-party-note">저장된 PVE 덱 · 카드 ${cards.length}/5 · 장비와 칭호의 PVE 효과 반영</p></section>`;
  }
  function formation({cards,power,data}){
    const bonus=Number(data.characterBonus?.pve||0);
    return `<section class="abyss-subpage abyss-frame"><div class="abyss-section-title"><div><p class="abyss-eyebrow">PREPARE YOUR EXPEDITION</p><h3>돌파는 편성에서 시작됩니다.</h3><p>현재 저장된 PVE 덱으로 무한의탑에 출전합니다.</p></div>${button('deck','PVE 덱 변경 <span aria-hidden="true">↗</span>','','is-primary')}</div>${portraits(cards,true)}<dl class="abyss-power-breakdown"><div><dt>카드 전투력</dt><dd>${num(Math.max(0,power-bonus))}</dd></div><div><dt>장비·칭호 PVE</dt><dd>+${num(bonus)}</dd></div><div><dt>총 출전 전투력</dt><dd>${num(power)}</dd></div></dl><div class="abyss-guidance"><h4>당신의 편성을 점검하세요.</h4><p>다수의 적을 빠르게 정리할 화력, 정예의 공격을 버틸 생존력, 수호자를 끝까지 상대할 지속력이 함께 필요합니다.</p><p class="abyss-muted">표시 전투력은 편성 참고값입니다. 스킬·용병·슈트와 실제 전투 효과가 승패에 함께 작용합니다.</p></div></section>`;
  }
  function recordList({records=[],filter='all'}){
    const list=records.filter(r=>filter==='all'||r.result===filter),latest=records[0];
    return `<section class="abyss-subpage abyss-frame"><div class="abyss-section-title"><div><p class="abyss-eyebrow">PROOF OF GROWTH</p><h3>당신이 남긴 도전의 흔적</h3><p>이 기기에서 확인한 최근 ${MAX_RECORDS}회의 전투 기록입니다.</p></div><label class="abyss-filter"><span>결과 필터</span><select data-abyss-filter aria-label="도전 결과 필터"><option value="all" ${filter==='all'?'selected':''}>전체 도전</option><option value="WIN" ${filter==='WIN'?'selected':''}>돌파 성공</option><option value="LOSE" ${filter==='LOSE'?'selected':''}>미돌파</option></select></label></div>${latest?`<div class="abyss-record-feature">${stamp(latest.floor,true)}<div><small>최근 도전 · ${new Date(latest.at).toLocaleDateString('ko-KR')}</small><h4>${latest.floor}층 · ${esc(reason(latest))}</h4>${comparison(latest,previousFor(latest,records))}</div></div>`:''}${list.length?`<ol class="abyss-record-list">${list.map(r=>`<li><div><strong>${r.floor}<small>층</small></strong><span class="${r.result==='WIN'?'is-clear':'is-failed'}">${r.result==='WIN'?'돌파':'미돌파'}</span></div><div><b>${esc(reason(r))}</b><small>${new Date(r.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div><div><small>공식 시간</small><b>${clock(r.elapsed)}</b></div><div><small>수호자 잔여</small><b>${r.guardianHp===null?'—':num(r.guardianHp)+'%'}</b></div><div><small>생존</small><b>${r.survivors===null?'—':r.survivors+'/'+r.total}</b></div></li>`).join('')}</ol>`:`<div class="abyss-empty">${stamp('—',true)}<h4>${records.length?'해당 결과의 도전이 없습니다':'첫 도전의 기록을 기다립니다'}</h4><p>전투 결과를 확인하면 공략 시간과 수호자 잔여 체력이 이곳에 남습니다.</p>${button('tab','한계 도전으로','data-tab="challenge"')}</div>`}</section>`;
  }
  function ranking({data,userId}){
    const rows=data.ranking||[];
    return `<section class="abyss-subpage abyss-frame"><div class="abyss-section-title"><div><p class="abyss-eyebrow">THOSE WHO WENT BEYOND</p><h3>한계 너머에 이름을 남긴 이들</h3><p>최고 도달층 기준 · 같은 층은 먼저 도달한 순서</p></div><div class="abyss-personal-rank"><small>나의 현재 순위</small><strong>${data.progress?.rank?num(data.progress.rank)+'위':'—'}</strong></div></div>${rows.length?`<ol class="abyss-ranking">${rows.map((r,i)=>`<li class="${Number(r.user_id)===Number(userId)?'is-me':''}"><span class="abyss-rank-number">${String(i+1).padStart(2,'0')}</span><strong>${esc(r.nickname)}${Number(r.user_id)===Number(userId)?'<small>나</small>':''}</strong><span class="abyss-ranking-track"><i style="width:${Math.min(100,Math.max(1,Number(r.highest_floor)/Math.max(1,Number(data.maxFloor))*100))}%"></i></span><b>${num(r.highest_floor)}<small>층</small></b></li>`).join('')}</ol>`:'<div class="abyss-empty"><h4>아직 이곳에 이름을 남긴 도전자가 없습니다.</h4></div>'}</section>`;
  }
  function render(box,options){
    box.classList.add('tower-abyss');box.innerHTML=shell(options);
    box.querySelector('[data-abyss-body]').innerHTML=({formation,records:recordList,ranking,challenge}[options.tab]||challenge)(options);
  }
  function state(box,{title='성소에 연결하는 중',description='당신의 도전 기록과 출전 편성을 확인합니다.',error=false}={}){
    box.classList.add('tower-abyss');box.innerHTML=`<div class="abyss-world abyss-state"><div class="abyss-state-panel abyss-frame">${stamp('∞')}<p class="abyss-eyebrow">${error?'CONNECTION INTERRUPTED':'THE ABYSS AWAITS'}</p><h2>${esc(title)}</h2><p role="status">${esc(description)}</p>${error?button('refresh','다시 연결'):'<span class="abyss-loading" aria-label="불러오는 중"></span>'}${button('exit','토벌로 돌아가기','','is-quiet')}</div></div>`;
  }
  function prepareBattle(view,data){
    view.stage.querySelector('.abyss-combat-hud')?.remove();
    view.stage.classList.add('tower-abyss-battle');view.stage.setAttribute('role','dialog');view.stage.setAttribute('aria-modal','true');view.stage.setAttribute('aria-label','무한의탑 전투');
    view.stage.querySelector('.battle-v3-header small').textContent='THE ABYSS · 한계 돌파';
    const loader=view.stage.querySelector('.battle-v3-loader');if(loader)loader.innerHTML=`${stamp(data?.floorNo||data?.tier||'∞',true)}<b>봉인 너머의 전장을 여는 중</b><span>출전 원정대를 준비합니다.</span>`;
    view.stage.querySelector('#battleMessage').hidden=true;
    const status=view.stage.querySelector('.battle-v3-status');if(status)status.textContent='전장을 준비하고 있습니다.';
    view.stage.insertAdjacentHTML('beforeend',`<div class="abyss-combat-hud"><div><small>도전층</small><strong data-abyss-hud-floor>${Number(data?.floorNo||data?.tier||1)}<em>F</em></strong></div><div class="abyss-combat-clock"><small>남은 공식 시간</small><strong data-abyss-clock>${clock(data?.combatLimitMs)}</strong></div><div class="abyss-combat-progress"><small data-abyss-phase>수호자 소환</small><strong data-abyss-progress>0<span>%</span></strong><progress data-abyss-meter max="100" value="0" aria-label="수호자 소환 진행도"></progress></div></div>`);
  }
  function updateBattle(stage,event,data){
    const progress=Math.max(0,Math.min(100,Number(event.guardianProgress)||0)),q=s=>stage.querySelector(s);
    if(q('[data-abyss-clock]'))q('[data-abyss-clock]').textContent=clock(event.remainingCombatMs??data.combatLimitMs);
    if(q('[data-abyss-progress]'))q('[data-abyss-progress]').innerHTML=num(progress)+'<span>%</span>';
    if(q('[data-abyss-meter]'))q('[data-abyss-meter]').value=progress;
    if(q('[data-abyss-phase]'))q('[data-abyss-phase]').textContent=progress>=100?'수호자 결전':'수호자 소환';
    stage.classList.toggle('is-guardian-phase',progress>=100);
  }
  function result(view,data,records=[]){
    const r=summarize(data),win=r.result==='WIN',previous=previousFor(r,records),msg=view.towerMsg;
    view.stage.classList.add('is-result-visible','is-abyss-result');view.stage.querySelector('[data-v3-verdict]')?.setAttribute('hidden','');
    msg.className='battle-message battle-v3-result tower-v3-result abyss-result abyss-frame';msg.hidden=false;
    msg.innerHTML=`<div class="abyss-result-heading">${stamp(r.floor,true)}<div><p class="abyss-eyebrow">${win?'LIMIT SURPASSED':'YOUR NEXT BREAKTHROUGH'}</p><h2>${win?'한계를 넘어섰습니다':'다음 돌파를 위한 기록'}</h2><p>${r.floor}층 · ${esc(reason(r))}</p></div></div><div class="abyss-result-metrics"><div><small>공식 공략 시간</small><b>${clock(r.elapsed)}</b></div><div><small>수호자 잔여 체력</small><b>${r.guardianHp===null?'—':num(r.guardianHp)+'%'}</b></div><div><small>첫 전투 불능</small><b>${r.firstFall===null?'없음':clock(r.firstFall)}</b></div><div><small>최종 생존</small><b>${r.survivors===null?'—':r.survivors+' / '+r.total}</b></div></div><div class="abyss-result-comparison"><h3>이전의 나와 비교</h3>${comparison(r,previous)}</div>${win?`<p class="abyss-earned"><span>획득 코인</span><strong>${num(data.reward)}</strong>${data.magicReward?.amount>0?`<small>마법 결정 ${num(data.magicReward.amount)}</small>`:''}${data.forgeProtectionReward?`<small>장비 보호권 ${num(data.forgeProtectionReward.quantity)}</small>`:''}</p>`:'<p class="abyss-muted">최고층은 유지됩니다. 편성을 다듬고 같은 층에 다시 도전하세요.</p>'}<div class="abyss-result-actions">${button(win?'return':'retry',win?(data.completed?'돌파 기록 확인':'다음 층 확인'):'같은 층 재도전','','is-primary')}${button('formation','편성 점검')}${button('records','성장 기록')}</div>`;
    msg.querySelector('button')?.focus({preventScroll:true});
  }
  function settling(view,seconds){
    view.stage.classList.add('is-result-visible');view.stage.querySelector('[data-v3-verdict]')?.setAttribute('hidden','');
    view.towerMsg.className='battle-message battle-v3-result tower-v3-result abyss-result abyss-frame';view.towerMsg.hidden=false;
    view.towerMsg.innerHTML=`<p class="abyss-eyebrow">TRIAL IN PROGRESS</p><h2>도전 결과를 확정하고 있습니다</h2><p role="status">${seconds>0?'전투 완료까지 '+num(seconds)+'초':'보상과 층 진행도를 확인하고 있습니다.'}</p><p class="abyss-muted">완료 전에는 다음 층으로 넘어갈 수 없습니다. 연결이 끊겨도 같은 전투를 이어 확인합니다.</p>`;
  }
  function errorResult(view,message,canResume){
    view.stage.classList.add('tower-abyss-battle','is-result-visible');
    view.towerMsg.className='battle-message battle-v3-result tower-v3-result abyss-result abyss-frame';view.towerMsg.hidden=false;
    view.towerMsg.innerHTML=`<p class="abyss-eyebrow">CONNECTION INTERRUPTED</p><h2>전장 연결이 잠시 끊겼습니다</h2><p role="alert">${esc(message)}</p><div class="abyss-result-actions">${canResume?button('resume','같은 전투 다시 연결','','is-primary'):''}${button('return','탑으로 돌아가기')}</div>`;
  }
  function guide(box){
    const details=box.querySelector('[data-abyss-guide]');if(details){details.remove();return;}
    box.querySelector('.abyss-footer').insertAdjacentHTML('beforebegin',`<section class="abyss-guide abyss-frame" data-abyss-guide><h3>봉인문 앞에서</h3><ul><li>저장된 PVE 카드 5장으로 현재 도전층에 진입합니다.</li><li>일반 몬스터와 정예를 쓰러뜨리면 수호자가 등장합니다.</li><li>전투의 남은 시간과 소환 진행도는 실제 전투 기록을 따라 표시됩니다.</li><li>전투 전체 재생과 서버의 완료 시간 확인 후 보상과 다음 층이 확정됩니다. 새로고침해도 같은 전투를 복구합니다.</li><li>120층까지 도전하며 기존 진행도와 수령 이력은 유지됩니다. 상향 보상은 새로 완료한 층부터 적용됩니다.</li><li>성장 기록은 이 기기의 계정별 기록이며 다른 기기와 동기화되지 않습니다.</li></ul>${button('guide','안내 닫기','','is-quiet')}</section>`);
    box.querySelector('[data-abyss-guide]').scrollIntoView({block:'nearest'});
  }
  root.TowerAbyssUI={VERSION,ART,render,state,prepareBattle,updateBattle,result,settling,errorResult,readRecords,remember,summarize,previousFor,clock,guide};
})(typeof window==='undefined'?globalThis:window);
