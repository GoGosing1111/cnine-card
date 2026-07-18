/* v1065 Card CMS cleanup + standalone breakthrough/enhancement management */
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let data = null;

  function ensureView(){
    const nav=$('#nav');
    if(nav && !nav.querySelector('[data-view="enhancement"]')){
      const btn=document.createElement('button');btn.dataset.view='enhancement';btn.innerHTML='돌파·강화 관리 <span class="buildBadge">NEW</span>';
      const cardsBtn=nav.querySelector('[data-view="cards"]');cardsBtn?.after(btn);
    }
    const cms=$('#cms');
    if(cms && !$('#view-enhancement')){
      const section=document.createElement('section');section.className='view';section.id='view-enhancement';section.hidden=true;
      section.innerHTML=`<div class="sectionIntro"><h2>돌파·강화 관리 <span class="buildBadge">v1065</span></h2><p>등급별 카드 조각 비용·성공 확률과 SSR 실패 천장을 독립적으로 관리합니다.</p></div><div class="panel enhancementHero"><div><small>BREAKTHROUGH CONTROL</small><h2>단계별 돌파 설정</h2><p>실패 시 단계는 유지되고 카드 조각은 소모됩니다.</p></div><button id="enhancementSaveBtn">설정 저장</button></div><div class="panel"><div class="enhancementGradeTabs" id="enhancementGradeTabs"></div><div id="enhancementRows" class="enhancementRows"></div></div><div class="panel pityPanel"><div class="maintenanceHead"><div><small>SSR GUARANTEE SYSTEM</small><h2>SSR 강화 천장</h2><p>설정한 횟수만큼 연속 실패하면 다음 시도가 확정 성공합니다.</p></div><label class="enhancementSwitch"><input type="checkbox" id="ssrPityEnabled"><span>천장 사용</span></label></div><div id="ssrPityRows" class="enhancementRows pityRows"></div><div class="inlineNotice">기본값: 각 단계에서 5회 실패 후 다음 시도 확정 성공. 성공하거나 단계가 오르면 실패 횟수는 0으로 초기화됩니다.</div></div>`;
      cms.appendChild(section);
    }
  }

  async function load(){
    const d=await api('admin/breakthrough-settings');data=d;render();
  }
  function render(){
    if(!data)return;
    const tabs=$('#enhancementGradeTabs');
    const current=tabs?.dataset.grade||'SR';
    tabs.innerHTML=data.grades.map(g=>`<button type="button" class="${g===current?'active':''}" data-grade="${g}">${g}</button>`).join('');
    tabs.dataset.grade=current;
    tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{tabs.dataset.grade=b.dataset.grade;render()});
    $('#enhancementRows').innerHTML=(data.config[current]||[]).map((r,i)=>`<div class="enhancementRow"><div><small>STEP ${i+1}</small><b>★${i} → ★${i+1}</b></div><label><span>카드 조각 비용</span><input data-kind="cost" data-index="${i}" type="number" min="1" max="10000000" value="${Number(r.cost)}"></label><label><span>성공 확률 (%)</span><input data-kind="rate" data-index="${i}" type="number" min="0" max="100" step="0.01" value="${Number(r.rate)}"></label></div>`).join('');
    $('#ssrPityEnabled').checked=data.pity?.enabled!==false;
    $('#ssrPityRows').innerHTML=Array.from({length:10},(_,i)=>`<div class="enhancementRow pityRow"><div><small>SSR STEP ${i+1}</small><b>★${i} → ★${i+1}</b></div><label><span>연속 실패 횟수</span><input data-pity-index="${i}" type="number" min="1" max="100" value="${Number(data.pity?.thresholds?.[i]||5)}"></label><em>${Number(data.pity?.thresholds?.[i]||5)}회 실패 후 다음 시도 확정</em></div>`).join('');
  }
  async function save(){
    const grade=$('#enhancementGradeTabs').dataset.grade||'SR';
    $('#enhancementRows').querySelectorAll('input').forEach(input=>{data.config[grade][Number(input.dataset.index)][input.dataset.kind]=Number(input.value)});
    const pity={enabled:$('#ssrPityEnabled').checked,grade:'SSR',thresholds:Array.from($('#ssrPityRows').querySelectorAll('[data-pity-index]')).map(x=>Number(x.value))};
    const d=await api('admin/breakthrough-settings',{method:'PATCH',body:JSON.stringify({config:data.config,pity})});data=d;alert('돌파·강화 설정을 저장했습니다.');render();
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

  const originalShow=window.show;
  function hookShow(){
    if(typeof window.show!=='function'||window.show.__v1065)return;
    const base=window.show;
    window.show=function(view,prefetched){
      if(view!=='enhancement')return base(view,prefetched);
      state.view=view;document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==`view-${view}`);document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));$('#pageTitle').textContent='돌파·강화 관리';load().catch(e=>alert(e.message));
    };window.show.__v1065=true;
  }

  function init(){ensureView();hookShow();collapseEvolutionLogs();$('#enhancementSaveBtn')?.addEventListener('click',()=>save().catch(e=>alert(e.message)));
    // 기존 설정 화면에서 돌파 패널 제거: 독립 메뉴에서만 관리
    document.querySelector('.breakthroughSettings')?.remove();
  }
  new MutationObserver(()=>{ensureView();hookShow();collapseEvolutionLogs();document.querySelector('.breakthroughSettings')?.remove();}).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(init,0);
})();
