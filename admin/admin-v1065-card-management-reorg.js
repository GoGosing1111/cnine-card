/* v1065 Card CMS cleanup + standalone breakthrough/enhancement management */
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let data = null;

  function ensureView(){
    const legacyGrade=$('#breakthroughGrade');
    if(legacyGrade&&![...legacyGrade.options].some(option=>option.value==='ZENITH'))legacyGrade.insertAdjacentHTML('beforeend','<option>ZENITH</option>');
    const nav=$('#nav');
    if(nav && !nav.querySelector('[data-view="enhancement"]')){
      const btn=document.createElement('button');btn.dataset.view='enhancement';btn.innerHTML='돌파·강화 관리 <span class="buildBadge">NEW</span>';
      const cardsBtn=nav.querySelector('[data-view="cards"]');cardsBtn?.after(btn);
    }
    const cms=$('#cms');
    if(cms && !$('#view-enhancement')){
      const section=document.createElement('section');section.className='view';section.id='view-enhancement';section.hidden=true;
      section.innerHTML=`<div class="sectionIntro"><h2>돌파·강화 관리 <span class="buildBadge">v1166</span></h2><p>등급별 강화 재료·성공 확률과 SSR 실패 천장을 독립적으로 관리합니다.</p></div><div class="panel enhancementHero"><div><small>BREAKTHROUGH CONTROL</small><h2>단계별 돌파 설정</h2><p>실패 시 단계는 유지되며 해당 단계에 설정된 강화 재료가 소모됩니다.</p></div><button type="button" id="enhancementSaveBtn">설정 저장</button></div><div class="panel"><div class="enhancementGradeTabs" id="enhancementGradeTabs"></div><div id="enhancementRows" class="enhancementRows"></div><div id="maHighEnhancementPanel" hidden><div class="maintenanceHead"><div><small>MA MASTER STAR ENHANCEMENT</small><h3>MA +10 → +13 고급 강화</h3><p>+10 이후 세 단계는 카드 조각이 아닌 마스터의 별을 사용합니다.</p></div><label class="enhancementSwitch"><input type="checkbox" id="maHighEnabled"><span>고급 강화 운영</span></label></div><div id="maHighEnhancementRows" class="enhancementRows"></div><div class="inlineNotice">퇴사 환급 카드 조각은 마스터의 별 투자분을 카드 조각으로 정산할 때 사용할 단계별 환산값입니다. 운영 ON 전에 반드시 입력하세요.</div></div></div><div class="panel pityPanel"><div class="maintenanceHead"><div><small>SSR GUARANTEE SYSTEM</small><h2>SSR 강화 천장</h2><p>설정한 횟수만큼 연속 실패하면 다음 시도가 확정 성공합니다.</p></div><label class="enhancementSwitch"><input type="checkbox" id="ssrPityEnabled"><span>천장 사용</span></label></div><div id="ssrPityRows" class="enhancementRows pityRows"></div><div class="inlineNotice">기본값: 각 단계에서 5회 실패 후 다음 시도 확정 성공. 성공하거나 단계가 오르면 실패 횟수는 0으로 초기화됩니다.</div></div>`;
      cms.appendChild(section);
    }
    // V1802: FUR/ZENITH +11~+13 패널을 눈에 띄게 (관리자 CSS 파일이 따로 없어 한 번만 주입한다)
    if(!document.getElementById('highPanelFeaturedStyle-v1802')){
      const style=document.createElement('style');style.id='highPanelFeaturedStyle-v1802';
      style.textContent='#maHighEnhancementPanel.highPanelFeatured{margin:0 0 18px;padding:16px;border:1px solid rgba(120,220,255,.45);border-radius:14px;background:linear-gradient(180deg,rgba(16,44,64,.55),rgba(10,22,36,.35));box-shadow:0 0 0 1px rgba(120,220,255,.12) inset}#maHighEnhancementPanel.highPanelFeatured .maintenanceHead h3{color:#8fe6ff}#maHighEnhancementPanel.highPanelFeatured .maintenanceHead p{line-height:1.55}';
      document.head.appendChild(style);
    }
  }

  function normalizeData(d={}){
    const fallbackGrades=['SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH','SUPERSTAR'];
    const grades=Array.isArray(d.grades)&&d.grades.length?d.grades:fallbackGrades;
    const config=d.config&&typeof d.config==='object'?d.config:{};
    const pity=d.pity&&typeof d.pity==='object'?d.pity:{enabled:true,grade:'SSR',thresholds:Array(10).fill(5)};
    if(!Array.isArray(pity.thresholds)) pity.thresholds=Array(10).fill(5);
    pity.thresholds=Array.from({length:10},(_,i)=>Math.max(1,Math.min(100,Number(pity.thresholds[i]||5))));
    // V1802: FUR/ZENITH 는 중복카드·천장·고유효과 배율 항목이 추가로 붙는다.
    const normalizeHigh=(raw,fallback)=>{const high=raw&&typeof raw==='object'?raw:fallback;if(!Array.isArray(high.steps))high.steps=[];high.steps=Array.from({length:3},(_,i)=>({cost:Math.max(1,Number(high.steps[i]?.cost||fallback.steps[i].cost)),rate:Math.max(0,Math.min(100,Number(high.steps[i]?.rate??fallback.steps[i].rate))),retirementShardRefund:Math.max(0,Number(high.steps[i]?.retirementShardRefund||fallback.steps[i].retirementShardRefund||0)),duplicateCards:Math.max(0,Math.floor(Number(high.steps[i]?.duplicateCards??fallback.steps[i].duplicateCards??0))),pityThreshold:Math.max(0,Math.floor(Number(high.steps[i]?.pityThreshold??fallback.steps[i].pityThreshold??0))),uniqueBoostPercent:Math.max(0,Math.floor(Number(high.steps[i]?.uniqueBoostPercent??fallback.steps[i].uniqueBoostPercent??0)))}));return high};
    const maHigh=normalizeHigh(d.maHigh,{enabled:true,steps:[{cost:1,rate:85,retirementShardRefund:3000},{cost:3,rate:50,retirementShardRefund:4000},{cost:5,rate:25,retirementShardRefund:5000}]}),limitedHigh=normalizeHigh(d.limitedHigh,{enabled:true,steps:[{cost:5,rate:50,retirementShardRefund:3000},{cost:10,rate:30,retirementShardRefund:4000},{cost:15,rate:20,retirementShardRefund:5000}]});
    const furHigh=normalizeHigh(d.furHigh,{enabled:false,steps:[{cost:100,duplicateCards:1,rate:35,pityThreshold:3,uniqueBoostPercent:30,retirementShardRefund:6000},{cost:150,duplicateCards:1,rate:25,pityThreshold:4,uniqueBoostPercent:60,retirementShardRefund:8000},{cost:200,duplicateCards:1,rate:15,pityThreshold:6,uniqueBoostPercent:100,retirementShardRefund:10000}]});
    const zenithHigh=normalizeHigh(d.zenithHigh,{enabled:false,steps:[{cost:2800,duplicateCards:0,rate:35,pityThreshold:3,uniqueBoostPercent:20,retirementShardRefund:6000},{cost:3400,duplicateCards:0,rate:25,pityThreshold:4,uniqueBoostPercent:40,retirementShardRefund:8000},{cost:4100,duplicateCards:0,rate:15,pityThreshold:6,uniqueBoostPercent:60,retirementShardRefund:10000}]});
    return {...d,grades,config,pity,maHigh,limitedHigh,furHigh,zenithHigh};
  }
  const HIGH_GRADES=['MA','LIMITED','FUR','ZENITH'];
  const EXTENDED_HIGH_GRADES=['FUR','ZENITH'];
  function highConfigFor(grade){
    if(grade==='LIMITED')return data.limitedHigh;
    if(grade==='FUR')return data.furHigh;
    if(grade==='ZENITH')return data.zenithHigh;
    return data.maHigh;
  }
  // V1802-fix: 탭을 옮기면 render() 가 화면을 다시 그리므로, 옮기기 전에 지금 탭의 입력값을 data 에 담아둔다.
  // 이게 없으면 FUR 를 체크하고 ZENITH 탭으로 넘어가는 순간 FUR 체크가 사라져 저장되지 않는다.
  function collectCurrentTab(){
    const grade=$('#enhancementGradeTabs')?.dataset.grade||'SR';
    if(!data)return grade;
    if(Array.isArray(data.config?.[grade]))
      $('#enhancementRows')?.querySelectorAll('input').forEach(input=>{
        const row=data.config[grade][Number(input.dataset.index)];
        if(row&&input.dataset.kind)row[input.dataset.kind]=Number(input.value);
      });
    if(HIGH_GRADES.includes(grade)){
      const high=highConfigFor(grade);
      if(high){
        $('#maHighEnhancementRows')?.querySelectorAll('input').forEach(input=>{
          const step=high.steps[Number(input.dataset.index)];
          if(step&&input.dataset.maHighKind)step[input.dataset.maHighKind]=Number(input.value);
        });
        const box=$('#maHighEnabled');
        if(box&&!$('#maHighEnhancementPanel')?.hidden)high.enabled=box.checked===true;
      }
    }
    return grade;
  }
  async function load(){
    const d=await api('admin/breakthrough-settings');data=normalizeData(d);render();
  }
  function render(){
    if(!data)return;
    const tabs=$('#enhancementGradeTabs');
    const current=tabs?.dataset.grade||'SR';
    tabs.innerHTML=data.grades.map(g=>`<button type="button" class="${g===current?'active':''}" data-grade="${g}">${g}</button>`).join('');
    tabs.dataset.grade=current;
    tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{collectCurrentTab();tabs.dataset.grade=b.dataset.grade;render()});
    const materialLabel=current==='ZENITH'?'마스터의 별 비용':'카드 조각 비용';
    $('#enhancementRows').innerHTML=(data.config[current]||[]).map((r,i)=>`<div class="enhancementRow"><div><small>STEP ${i+1}</small><b>★${i} → ★${i+1}</b></div><label><span>${materialLabel}</span><input data-kind="cost" data-index="${i}" type="number" min="1" max="10000000" value="${Number(r.cost)}"></label><label><span>성공 확률 (%)</span><input data-kind="rate" data-index="${i}" type="number" min="0" max="100" step="0.01" value="${Number(r.rate)}"></label></div>`).join('');
    const highPanel=$('#maHighEnhancementPanel');if(highPanel){const masterStarGrade=HIGH_GRADES.includes(current),extended=EXTENDED_HIGH_GRADES.includes(current),high=highConfigFor(current);highPanel.hidden=!masterStarGrade;
      // V1802: FUR/ZENITH 는 +11~+13 이 본론이라 STEP 10 아래까지 스크롤하게 두지 않는다.
      const rowsEl=$('#enhancementRows');
      if(rowsEl&&rowsEl.parentNode){
        if(extended)rowsEl.parentNode.insertBefore(highPanel,rowsEl);
        else if(highPanel.previousElementSibling!==rowsEl)rowsEl.parentNode.insertBefore(highPanel,rowsEl.nextSibling);
      }
      if(masterStarGrade){$('#maHighEnabled').checked=high?.enabled===true;$('#maHighEnhancementRows').innerHTML=high.steps.map((r,i)=>`<div class="enhancementRow maHighEnhancementRow"><div><small>${current} MASTER STAR STEP ${i+1}</small><b>★${10+i} → ★${11+i}</b></div><label><span>마스터의 별 비용</span><input data-ma-high-kind="cost" data-index="${i}" type="number" min="1" max="${extended?9999999:9999}" value="${Number(r.cost)}"></label><label><span>성공 확률 (%)</span><input data-ma-high-kind="rate" data-index="${i}" type="number" min="0" max="100" step="0.01" value="${Number(r.rate)}"></label>${extended?`<label><span>중복 카드 소모 (장)</span><input data-ma-high-kind="duplicateCards" data-index="${i}" type="number" min="0" max="99" value="${Number(r.duplicateCards||0)}"></label><label><span>천장 (연속 실패 횟수)</span><input data-ma-high-kind="pityThreshold" data-index="${i}" type="number" min="0" max="999" value="${Number(r.pityThreshold||0)}"></label><label><span>고유효과 증가 (%)</span><input data-ma-high-kind="uniqueBoostPercent" data-index="${i}" type="number" min="0" max="1000" value="${Number(r.uniqueBoostPercent||0)}"></label>`:''}<label><span>퇴사 환급 카드 조각</span><input data-ma-high-kind="retirementShardRefund" data-index="${i}" type="number" min="0" max="10000000" value="${Number(r.retirementShardRefund||0)}"></label></div>`).join('')}}
    if(highPanel&&!highPanel.hidden){const extended=EXTENDED_HIGH_GRADES.includes(current),title=highPanel.querySelector('h3'),eyebrow=highPanel.querySelector('.maintenanceHead small'),description=highPanel.querySelector('.maintenanceHead p');if(eyebrow)eyebrow.textContent=`${current} MASTER STAR ENHANCEMENT`;if(title)title.textContent=`${current} +10 → +13 고급 강화`;highPanel.classList.toggle('highPanelFeatured',extended);
      if(description)description.textContent=extended?'재료는 실패해도 돌려주지 않습니다. 천장은 그 횟수만큼 연속 실패하면 다음 시도를 100% 성공으로 확정합니다. 0 이면 천장 없음. 중복 카드는 강화 대상 1장을 제외한 여분에서 차감합니다.':'+10 이후 세 단계는 카드 조각 대신 마스터의 별을 사용합니다.'}
    $('#ssrPityEnabled').checked=data.pity?.enabled!==false;
    $('#ssrPityRows').innerHTML=Array.from({length:10},(_,i)=>`<div class="enhancementRow pityRow"><div><small>SSR STEP ${i+1}</small><b>★${i} → ★${i+1}</b></div><label><span>연속 실패 횟수</span><input data-pity-index="${i}" type="number" min="1" max="100" value="${Number(data.pity?.thresholds?.[i]||5)}"></label><em>${Number(data.pity?.thresholds?.[i]||5)}회 실패 후 다음 시도 확정</em></div>`).join('');
  }
  async function save(){
    collectCurrentTab();
    const pity={enabled:$('#ssrPityEnabled').checked,grade:'SSR',thresholds:Array.from($('#ssrPityRows').querySelectorAll('[data-pity-index]')).map(x=>Number(x.value))};
    const d=await api('admin/breakthrough-settings',{method:'PATCH',body:JSON.stringify({config:data.config,pity,maHigh:data.maHigh,limitedHigh:data.limitedHigh,furHigh:data.furHigh,zenithHigh:data.zenithHigh})});data=normalizeData(d);
    const on=[['MA',data.maHigh],['LIMITED',data.limitedHigh],['FUR',data.furHigh],['ZENITH',data.zenithHigh]].filter(([,c])=>c?.enabled===true).map(([g])=>g);
    alert(`돌파·강화 설정을 저장했습니다.\n\n+11~+13 고급 강화 운영 중: ${on.length?on.join(', '):'없음'}`);
    render();
  }

  function collapseEvolutionLogs(){
    document.querySelectorAll('.evolutionLogHead').forEach(head=>{
      if(head.dataset.collapsible==='1')return;head.dataset.collapsible='1';
      const list=head.nextElementSibling;if(!list)return;
      const btn=document.createElement('button');btn.type='button';btn.className='ghost evolutionLogToggle';btn.textContent='최근 진화 기록 50건 펼치기';
      head.appendChild(btn);list.classList.add('evolutionLogsCollapsed');
      btn.onclick=()=>{const closed=list.classList.toggle('evolutionLogsCollapsed');btn.textContent=closed?'최근 진화 기록 50건 펼치기':'최근 진화 기록 50건 접기'};
    });
  }

  function openEnhancement(){
    ensureView();
    try { if (typeof state !== 'undefined') state.view = 'enhancement'; } catch (_) {}
    document.querySelectorAll('.view').forEach(x => { x.hidden = x.id !== 'view-enhancement'; });
    document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('active', x.dataset.view === 'enhancement'));
    const title = $('#pageTitle'); if (title) title.textContent = '돌파·강화 관리';
    load().catch(e => alert(e.message));
  }

  function hookShow(){
    // 구형 CMS의 show가 전역으로 노출된 경우에도 호환한다.
    if(typeof window.show!=='function'||window.show.__v1066)return;
    const base=window.show;
    window.show=function(view,prefetched){
      if(view==='enhancement'){ openEnhancement(); return; }
      return base(view,prefetched);
    };
    window.show.__v1066=true;
  }

  function bindEnhancementControls(){
    const saveBtn = $('#enhancementSaveBtn');
    if (saveBtn && saveBtn.dataset.bound !== '1') {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click',()=>save().catch(e=>alert(e.message)));
    }
  }

  function init(){ensureView();hookShow();collapseEvolutionLogs();bindEnhancementControls();
    // 기존 CMS 설정 로더가 내부 버튼에 이벤트를 연결하므로 DOM은 유지하고 화면에서만 숨긴다.
    const legacyBreakthrough = document.querySelector('.breakthroughSettings');
    if (legacyBreakthrough) { legacyBreakthrough.hidden = true; legacyBreakthrough.style.display = 'none'; legacyBreakthrough.dataset.v1069Compat = '1'; }
  }
  // 메뉴 버튼은 기본 CMS가 클릭 이벤트를 등록한 뒤 동적으로 추가되므로 위임 클릭으로 직접 연다.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#nav button[data-view="enhancement"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEnhancement();
  }, true);

  new MutationObserver(()=>{
    ensureView();hookShow();collapseEvolutionLogs();bindEnhancementControls();
    const legacyBreakthrough = document.querySelector('.breakthroughSettings');
    if (legacyBreakthrough) { legacyBreakthrough.hidden = true; legacyBreakthrough.style.display = 'none'; legacyBreakthrough.dataset.v1069Compat = '1'; }
  }).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(init,0);
})();
