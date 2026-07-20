/* v1073.9 LIMITED/FUR acquisition cutscene - main card management panel */
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const eligible = c => ['LIMITED','FUR'].includes(String(c?.grade || '').toUpperCase());

  function ensurePanel(){
    const view = document.querySelector('#view-cards');
    if(!view || document.querySelector('#cardAcquisitionFxMain')) return;
    const anchor = view.querySelector('.cardManageTabs') || view.querySelector('.cardAdvancedSettings') || view.firstElementChild;
    const panel = document.createElement('details');
    panel.id = 'cardAcquisitionFxMain';
    panel.className = 'cardAcquisitionFxMain panel';
    panel.innerHTML = `
      <summary>
        <span><b>LIMITED · FUR 획득 연출 관리</b><small>카드별 전용 영상·음향·스킵 설정</small></span>
        <em data-fx-summary>펼치기</em>
      </summary>
      <div class="cardAcquisitionFxMainBody">
        <div class="acqFxIntro"><div><small>ACQUISITION CUTSCENE</small><h3>고등급 카드 획득 컷신</h3><p>궁극기 컷신과 동일하게 영상 경로를 지정합니다. PC·모바일 해상도에 자동 대응하며 원본 비율을 유지합니다.</p></div><span id="acqFxSaveState">카드를 선택하세요</span></div>
        <div class="acqFxGrid">
          <label class="acqFxWide"><span>설정할 카드</span><select id="acqFxCardSelect"><option value="">LIMITED / FUR 카드 선택</option></select></label>
          <label class="acqFxSwitch"><input id="acqFxEnabled" type="checkbox"><span>전용 획득 영상 사용</span></label>
          <label class="acqFxWide"><span>영상 경로 (MP4 / WebM)</span><input id="acqFxMediaUrl" placeholder="/assets/card-acquisition/example.mp4"></label>
          <label class="acqFxWide"><span>음향 경로 (선택)</span><input id="acqFxAudioUrl" placeholder="/assets/card-acquisition/example.mp3"></label>
          <label><span>최대 재생 시간</span><select id="acqFxDurationMs"><option value="5000">5초</option><option value="8000">8초</option><option value="10000">10초</option><option value="15000">15초</option><option value="20000">20초</option><option value="30000">30초</option></select></label>
          <label class="acqFxSwitch"><input id="acqFxSkipAllowed" type="checkbox" checked><span>건너뛰기 허용</span></label>
        </div>
        <div class="acqFxActions"><button type="button" id="acqFxPreviewBtn" class="ghost">영상 미리보기</button><button type="button" id="acqFxSaveBtn">획득 연출 저장</button></div>
        <div class="acqFxCurrent" id="acqFxCurrent">카드를 선택하면 현재 설정이 표시됩니다.</div>
      </div>`;
    if(anchor?.nextSibling) anchor.parentNode.insertBefore(panel, anchor.nextSibling); else view.appendChild(panel);
    panel.addEventListener('toggle',()=>{const e=panel.querySelector('[data-fx-summary]');if(e)e.textContent=panel.open?'접기':'펼치기';if(panel.open)renderOptions();});
    panel.querySelector('#acqFxCardSelect').addEventListener('change',loadSelected);
    panel.querySelector('#acqFxPreviewBtn').addEventListener('click',preview);
    panel.querySelector('#acqFxSaveBtn').addEventListener('click',save);
  }

  function cards(){ return Array.isArray(window.state?.cards) ? window.state.cards.filter(eligible) : []; }
  function renderOptions(){
    ensurePanel();
    const select=document.querySelector('#acqFxCardSelect'); if(!select)return;
    const current=select.value;
    const list=cards().sort((a,b)=>String(a.grade).localeCompare(String(b.grade))||String(a.name).localeCompare(String(b.name),'ko')||String(a.title).localeCompare(String(b.title),'ko'));
    select.innerHTML='<option value="">LIMITED / FUR 카드 선택</option>'+list.map(c=>`<option value="${esc(c.id)}">[${esc(c.grade)}] ${esc(c.name)} · ${esc(c.title)}</option>`).join('');
    if(list.some(c=>String(c.id)===String(current))) select.value=current;
    else if(list.length===1){select.value=String(list[0].id);loadSelected();}
    const status=document.querySelector('#acqFxSaveState'); if(status)status.textContent=`대상 카드 ${list.length}장`;
  }
  function selected(){const id=document.querySelector('#acqFxCardSelect')?.value;return cards().find(c=>String(c.id)===String(id));}
  function loadSelected(){
    const c=selected(), q=s=>document.querySelector(s);
    if(!c){q('#acqFxEnabled').checked=false;q('#acqFxMediaUrl').value='';q('#acqFxAudioUrl').value='';q('#acqFxDurationMs').value='8000';q('#acqFxSkipAllowed').checked=true;q('#acqFxCurrent').textContent='카드를 선택하면 현재 설정이 표시됩니다.';return;}
    q('#acqFxEnabled').checked=Boolean(Number(c.acquisitionFxEnabled));
    q('#acqFxMediaUrl').value=c.acquisitionMediaUrl||'';
    q('#acqFxAudioUrl').value=c.acquisitionAudioUrl||'';
    const duration=String(Number(c.acquisitionDurationMs||8000));q('#acqFxDurationMs').value=[...q('#acqFxDurationMs').options].some(o=>o.value===duration)?duration:'8000';
    q('#acqFxSkipAllowed').checked=Number(c.acquisitionSkipAllowed)!==0;
    q('#acqFxCurrent').innerHTML=`<b>${esc(c.name)} · ${esc(c.title)}</b><span class="grade-${esc(c.grade)}">${esc(c.grade)}</span><small>${Number(c.acquisitionFxEnabled)?'전용 연출 사용 중':'전용 연출 미사용'}</small>`;
  }
  async function save(){
    const c=selected(); if(!c)return alert('설정할 LIMITED 또는 FUR 카드를 선택하세요.');
    const enabled=document.querySelector('#acqFxEnabled').checked,media=document.querySelector('#acqFxMediaUrl').value.trim(),audio=document.querySelector('#acqFxAudioUrl').value.trim(),duration=Number(document.querySelector('#acqFxDurationMs').value||8000),skip=document.querySelector('#acqFxSkipAllowed').checked;
    if(enabled&&!media)return alert('전용 획득 영상 경로를 입력하세요.');
    const btn=document.querySelector('#acqFxSaveBtn'); btn.disabled=true;const old=btn.textContent;btn.textContent='저장 중...';
    try{
      const d=await api('admin/cards',{method:'PATCH',body:JSON.stringify({id:c.id,acquisitionFxEnabled:enabled,acquisitionMediaUrl:media,acquisitionAudioUrl:audio,acquisitionDurationMs:duration,acquisitionSkipAllowed:skip})});
      const saved=d.card||{};Object.assign(c,{acquisitionFxEnabled:saved.acquisitionFxEnabled??(enabled?1:0),acquisitionMediaUrl:saved.acquisitionMediaUrl??media,acquisitionAudioUrl:saved.acquisitionAudioUrl??audio,acquisitionDurationMs:saved.acquisitionDurationMs??duration,acquisitionSkipAllowed:saved.acquisitionSkipAllowed??(skip?1:0)});
      loadSelected();document.querySelector('#acqFxSaveState').textContent='저장 완료';alert('획득 연출 설정이 저장되었습니다.');
    }catch(e){alert(e.message||'획득 연출 저장에 실패했습니다.');}finally{btn.disabled=false;btn.textContent=old;}
  }
  function preview(){
    const url=document.querySelector('#acqFxMediaUrl')?.value.trim(),audio=document.querySelector('#acqFxAudioUrl')?.value.trim();if(!url)return alert('영상 경로를 입력하세요.');
    const layer=document.createElement('div');layer.className='acqFxPreviewLayer';layer.innerHTML=`<div class="acqFxPreviewStage"><video playsinline autoplay controls src="${esc(url)}"></video>${audio?`<audio autoplay src="${esc(audio)}"></audio>`:''}</div><button type="button">닫기</button>`;document.body.appendChild(layer);const close=()=>layer.remove();layer.querySelector('button').onclick=close;layer.onclick=e=>{if(e.target===layer)close()};
  }
  function install(){ensurePanel();renderOptions();}
  if(typeof window.loadCards==='function'&&!window.loadCards.__acqFxMain){const base=window.loadCards;window.loadCards=async function(...args){const out=await base.apply(this,args);install();return out};window.loadCards.__acqFxMain=true;}
  new MutationObserver(()=>ensurePanel()).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',install);setTimeout(install,0);
})();
