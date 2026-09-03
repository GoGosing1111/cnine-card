/* V1986 PRIME DRAW CMS */
(()=>{
  const VIEW='primedraw',ROOT_ID='primeDrawCmsV1986';
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state={data:null,kind:'equipment',busy:false,loadedAt:0,loadPromise:null};
  const labels={equipment:'프라임 아머리 상자',vehicle:'프라임 하이퍼드라이브 팩'};
  const tiers=[['STANDARD','일반'],['FEATURED','강조'],['HERO','영웅'],['CINEMATIC','시네마틱']];
  const effects={
    equipment:[['NONE','기본'],['PRIME_FORGE','프라임 포지'],['VIOLET_CORE','바이올렛 코어'],['ASTRAL_ARMORY','아스트랄 아머리']],
    vehicle:[['NONE','기본'],['SCARLET_VELOCITY','스칼렛 벨로시티'],['CRIMSON_APEX','크림슨 에이펙스'],['NOIRE_SOVEREIGN','누아르 소버린']]
  };
  const visible=()=>{const view=$(`#view-${VIEW}`);return Boolean(view&&!view.hidden&&!$('#cms')?.hidden)};
  const call=(path,options={})=>typeof api==='function'?api(path,options):Promise.reject(new Error('CMS API를 찾을 수 없습니다.'));
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const asset=value=>{const path=String(value||'').replace(/\\/g,'/');return /^https?:\/\//i.test(path)?path:`../${path.replace(/^\//,'')}`};

  function mount(){
    const cms=$('#cms');if(!cms||$(`#view-${VIEW}`))return;
    const view=document.createElement('section');view.className='view primeDrawCmsViewV1986';view.id=`view-${VIEW}`;view.hidden=true;
    view.innerHTML=`<div id="${ROOT_ID}" class="primeDrawCmsLoadingV1986">프라임 상품 설정을 불러오는 중입니다.</div>`;
    cms.appendChild(view);
    const nav=$(`#nav [data-view="${VIEW}"]`);
    nav?.addEventListener('click',()=>setTimeout(()=>{setTitle();void load(false)},0));
  }

  function setTitle(){const title=$('#pageTitle');if(visible()&&title&&title.textContent!=='프라임 뽑기 관리')title.textContent='프라임 뽑기 관리'}

  async function load(force=false){
    if(!visible())return;
    setTitle();
    if(!force&&state.data&&Date.now()-state.loadedAt<15000){render();return}
    if(state.loadPromise)return state.loadPromise;
    const root=$(`#${ROOT_ID}`);if(root)root.innerHTML='<div class="primeDrawCmsLoadingV1986">독립 드랍풀과 연출 설정을 확인하는 중입니다.</div>';
    state.loadPromise=(async()=>{
      try{state.data=await call('admin/prime-draw/status');state.loadedAt=Date.now();render()}
      catch(error){if(root)root.innerHTML=`<div class="primeDrawCmsErrorV1986"><b>프라임 설정을 불러오지 못했습니다.</b><span>${esc(error.message)}</span><button type="button" id="primeDrawRetryV1986">다시 확인</button></div>`;$('#primeDrawRetryV1986')?.addEventListener('click',()=>load(true))}
      finally{state.loadPromise=null}
    })();
    return state.loadPromise;
  }

  function product(){return state.data?.[state.kind]||{}}
  function poolRows(){return Array.isArray(product().pool?.entries)?product().pool.entries:[]}
  function weightTotal(){return poolRows().reduce((sum,row)=>sum+number(row.drawWeight),0)}
  function fmt(value,digits=0){return number(value).toLocaleString('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}
  function tierOptions(selected){return tiers.map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label} · ${value}</option>`).join('')}
  function effectOptions(selected){return effects[state.kind].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('')}

  function render(){
    const root=$(`#${ROOT_ID}`),item=product(),rows=poolRows(),settings=item.settings||{},total=weightTotal(),special=rows.filter(row=>row.presentation?.enabled).length;
    if(!root)return;
    root.innerHTML=`
      <header class="primeDrawCmsHeroV1986">
        <div><small>PRIME ACQUISITION CONTROL · V1986</small><h2>프라임 뽑기 관리</h2><p>신규 상품의 독립 확률표와 아이템별 특별 연출을 OWNER가 직접 관리합니다.</p></div>
        <div class="primeDrawCmsHeroActionsV1986"><span class="primeDrawCmsDbV1986">독립 풀 · ${esc(item.poolVersion||'-')}</span><button type="button" class="ghost" id="primeDrawReloadV1986">새로고침</button></div>
      </header>
      <nav class="primeDrawCmsTabsV1986" aria-label="프라임 상품 선택">
        ${['equipment','vehicle'].map(kind=>{const data=state.data?.[kind]||{};return `<button type="button" data-prime-kind="${kind}" class="${state.kind===kind?'active':''}"><span>${kind==='equipment'?'ARMORY':'HYPERDRIVE'}</span><b>${esc(labels[kind])}</b><small>${fmt(data.shop?.unitPrice||0)}코인 · ${fmt(data.pool?.entryCount||0)}종</small></button>`}).join('')}
      </nav>
      <section class="primeDrawCmsSummaryV1986">
        <article><small>판매 가격</small><b>${fmt(item.shop?.unitPrice||0)} 코인</b><span>기존 대비 ${fmt(item.priceRatio||1)}배</span></article>
        <article><small>독립 드랍풀</small><b>${fmt(rows.length)}종</b><span>기존 상품과 공유하지 않음</span></article>
        <article class="${Math.abs(total-100)<=.0001?'ok':'bad'}"><small>활성 확률 합계</small><b id="primeDrawTotalV1986">${fmt(total,6)}%</b><span>저장 조건 100.000000%</span></article>
        <article><small>특별 연출 대상</small><b id="primeDrawSpecialV1986">${fmt(special)}종</b><span>항목별 즉시 선택</span></article>
      </section>
      <section class="primeDrawCmsControlV1986">
        <div><small>PRODUCT SWITCH</small><h3>${esc(item.name||labels[state.kind])} 운영</h3><p>가격은 확정값으로 고정됩니다. 판매와 보유분 개봉만 독립적으로 중지할 수 있습니다.</p></div>
        <label><span>상점 판매</span><select id="primeDrawShopEnabledV1986"><option value="1" ${settings.shopEnabled!==false?'selected':''}>ON · 판매</option><option value="0" ${settings.shopEnabled===false?'selected':''}>OFF · 판매 중지</option></select></label>
        <label><span>인벤토리 개봉</span><select id="primeDrawOpenEnabledV1986"><option value="1" ${settings.openEnabled!==false?'selected':''}>ON · 개봉</option><option value="0" ${settings.openEnabled===false?'selected':''}>OFF · 개봉 중지</option></select></label>
      </section>
      <section class="primeDrawCmsPoolV1986">
        <div class="primeDrawCmsPoolHeadV1986"><div><small>INDEPENDENT WEIGHT TABLE</small><h3>아이템 확률·연출 설정</h3><p>원본 확률과 가격 보정 배율은 비교용이며, 실제 확률만 수정됩니다.</p></div><button type="button" class="ghost" id="primeDrawNormalizeV1986">현재 비율로 100% 맞추기</button></div>
        <div class="primeDrawCmsTableWrapV1986"><table><thead><tr><th>아이템</th><th>전투력</th><th>원본 확률</th><th>가격 보정</th><th>실제 확률 %</th><th>특별 연출</th><th>연출 등급</th><th>연출 테마</th></tr></thead><tbody>
          ${rows.map(row=>`<tr data-prime-row="${Number(row.id)}">
            <td><div class="primeDrawCmsItemV1986"><span>${row.image?`<img src="${esc(asset(row.image))}" alt="">`:'NO IMAGE'}</span><div><b>${esc(row.name)}</b><small>${esc(row.code)} · ${esc(row.rarity)}</small></div></div></td>
            <td><b>${fmt(row.power)}</b></td><td>${fmt(row.sourceProbability,6)}%</td><td>×${fmt(row.boostMultiplier,4)}</td>
            <td><input class="primeDrawWeightV1986" data-prime-weight type="number" min="0" max="100" step="0.000001" value="${number(row.drawWeight).toFixed(6)}"></td>
            <td><label class="primeDrawCmsCheckV1986"><input data-prime-presentation type="checkbox" ${row.presentation?.enabled?'checked':''}><span>${row.presentation?.enabled?'ON':'OFF'}</span></label></td>
            <td><select data-prime-tier>${tierOptions(String(row.presentation?.tier||'STANDARD'))}</select></td>
            <td><select data-prime-effect>${effectOptions(String(row.presentation?.effectKey||'NONE'))}</select></td>
          </tr>`).join('')}
        </tbody></table></div>
      </section>
      <footer class="primeDrawCmsSaveV1986"><div><b>${esc(labels[state.kind])}</b><span>확률 합계와 아이템별 특별 연출을 한 번에 저장합니다.</span></div><button type="button" id="primeDrawSaveV1986">현재 상품 설정 저장</button></footer>`;
    bind();sync();
  }

  function bind(){
    $('#primeDrawReloadV1986')?.addEventListener('click',()=>load(true));
    document.querySelectorAll('[data-prime-kind]').forEach(button=>button.addEventListener('click',()=>{state.kind=button.dataset.primeKind;render()}));
    $('#primeDrawNormalizeV1986')?.addEventListener('click',normalize);
    $('#primeDrawSaveV1986')?.addEventListener('click',save);
    document.querySelectorAll('[data-prime-weight]').forEach(input=>input.addEventListener('input',sync));
    document.querySelectorAll('[data-prime-presentation]').forEach(input=>input.addEventListener('change',()=>{const label=input.closest('label')?.querySelector('span');if(label)label.textContent=input.checked?'ON':'OFF';sync()}));
  }

  function sync(){
    const rows=[...document.querySelectorAll('[data-prime-row]')],total=rows.reduce((sum,row)=>sum+number(row.querySelector('[data-prime-weight]')?.value),0),special=rows.filter(row=>row.querySelector('[data-prime-presentation]')?.checked).length,totalNode=$('#primeDrawTotalV1986'),specialNode=$('#primeDrawSpecialV1986');
    if(totalNode){totalNode.textContent=`${fmt(total,6)}%`;totalNode.closest('article')?.classList.toggle('ok',Math.abs(total-100)<=.0001);totalNode.closest('article')?.classList.toggle('bad',Math.abs(total-100)>.0001)}
    if(specialNode)specialNode.textContent=`${fmt(special)}종`;
  }

  function normalize(){
    const inputs=[...document.querySelectorAll('[data-prime-weight]')],values=inputs.map(input=>Math.max(0,number(input.value))),total=values.reduce((sum,value)=>sum+value,0);
    if(!total)return alert('0보다 큰 확률이 하나 이상 필요합니다.');
    let assigned=0;
    inputs.forEach((input,index)=>{const value=index===inputs.length-1?100-assigned:Number((values[index]/total*100).toFixed(6));assigned+=value;input.value=Math.max(0,value).toFixed(6)});
    sync();
  }

  async function save(){
    if(state.busy)return;
    const rows=[...document.querySelectorAll('[data-prime-row]')],entries=rows.map(row=>({id:Number(row.dataset.primeRow),drawWeight:number(row.querySelector('[data-prime-weight]')?.value),presentation:{enabled:Boolean(row.querySelector('[data-prime-presentation]')?.checked),tier:row.querySelector('[data-prime-tier]')?.value||'STANDARD',effectKey:row.querySelector('[data-prime-effect]')?.value||'NONE'}})),total=entries.reduce((sum,row)=>sum+row.drawWeight,0);
    if(Math.abs(total-100)>.0001)return alert(`활성 확률 합계를 100%로 맞춰주세요. 현재 ${total.toFixed(6)}%입니다.`);
    const settings={shopEnabled:$('#primeDrawShopEnabledV1986')?.value==='1',openEnabled:$('#primeDrawOpenEnabledV1986')?.value==='1'},button=$('#primeDrawSaveV1986');
    state.busy=true;if(button){button.disabled=true;button.textContent='저장 중'}
    try{state.data[state.kind]=await call('admin/prime-draw/pool',{method:'POST',body:JSON.stringify({kind:state.kind,settings,entries})});state.loadedAt=Date.now();render();alert(`${labels[state.kind]} 설정을 저장했습니다.`)}
    catch(error){alert(error.message||'프라임 설정 저장에 실패했습니다.')}
    finally{state.busy=false;if(button){button.disabled=false;button.textContent='현재 상품 설정 저장'}}
  }

  function boot(){mount();setTitle();if(visible())void load(false)}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
  new MutationObserver(()=>{mount();setTitle();if(visible()&&!state.data&&!state.loadPromise)void load(false)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
})();
