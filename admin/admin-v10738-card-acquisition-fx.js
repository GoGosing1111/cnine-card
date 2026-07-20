/* v1073.8 LIMITED/FUR card acquisition cutscene management */
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function fxMarkup(c){
    const eligible=['LIMITED','FUR'].includes(String(c.grade||'').toUpperCase());
    if(!eligible)return '';
    return `<details class="cardAcquisitionFx" ${c.acquisitionFxEnabled?'open':''}>
      <summary><span><b>획득 연출 관리</b><small>LIMITED · FUR 전용 컷신</small></span><em>${c.acquisitionFxEnabled?'사용 중':'미사용'}</em></summary>
      <div class="cardAcquisitionFxBody">
        <label class="fxSwitch"><input class="acqFxEnabled" type="checkbox" ${c.acquisitionFxEnabled?'checked':''}><span>전용 획득 영상 사용</span></label>
        <label><span>영상 경로 (MP4 / WebM)</span><input class="acqMediaUrl" value="${esc(c.acquisitionMediaUrl||'')}" placeholder="/assets/card-acquisition/example.mp4"></label>
        <label><span>음향 경로 (선택)</span><input class="acqAudioUrl" value="${esc(c.acquisitionAudioUrl||'')}" placeholder="/assets/card-acquisition/example.mp3"></label>
        <div class="row"><label><span>최대 재생 시간(ms)</span><input class="acqDurationMs" type="number" min="1000" max="30000" step="100" value="${Number(c.acquisitionDurationMs||8000)}"></label><label class="fxSwitch"><input class="acqSkipAllowed" type="checkbox" ${c.acquisitionSkipAllowed!==0?'checked':''}><span>건너뛰기 허용</span></label></div>
        <div class="row"><button type="button" class="ghost acqPreview">영상 미리보기</button><small>영상은 PC·모바일 화면에 자동 맞춤되며 원본 비율을 유지합니다.</small></div>
      </div></details>`;
  }
  function install(){
    if(typeof window.cardEditorMarkup==='function'&&!window.cardEditorMarkup.__acqFx){
      const base=window.cardEditorMarkup;
      window.cardEditorMarkup=function(c){
        const html=base(c),fx=fxMarkup(c);
        return fx?html.replace('<div class="row"><button class="save"',fx+'<div class="row"><button class="save"'):html;
      };
      window.cardEditorMarkup.__acqFx=true;
    }
    if(typeof window.saveCard==='function'&&!window.saveCard.__acqFx){
      window.saveCard=async function(el){
        const p={id:el.dataset.id,memberId:Number(el.querySelector('.member').value),title:el.querySelector('.title').value.trim(),grade:el.querySelector('.rarity').value,image:el.querySelector('.image').value.trim(),focusX:Number(el.querySelector('.fx').value),focusY:Number(el.querySelector('.fy').value),isActive:el.querySelector('.active').checked,cardStatus:el.querySelector('.active').checked?'PUBLIC':'INACTIVE',drawWeight:Number(el.querySelector('.weight').value),limitedTotal:el.querySelector('.limit').value===''?null:Number(el.querySelector('.limit').value),updateVisibility:true};
        const box=el.querySelector('.cardAcquisitionFx');
        if(box){p.acquisitionFxEnabled=box.querySelector('.acqFxEnabled').checked;p.acquisitionMediaUrl=box.querySelector('.acqMediaUrl').value.trim();p.acquisitionAudioUrl=box.querySelector('.acqAudioUrl').value.trim();p.acquisitionDurationMs=Number(box.querySelector('.acqDurationMs').value||8000);p.acquisitionSkipAllowed=box.querySelector('.acqSkipAllowed').checked;if(p.acquisitionFxEnabled&&!p.acquisitionMediaUrl)return alert('획득 연출 영상 경로를 입력하세요.');}
        await api('admin/cards',{method:'PATCH',body:JSON.stringify(p)});alert('카드 정보와 획득 연출 설정이 저장되었습니다.');await loadCards();
      };
      window.saveCard.__acqFx=true;
    }
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.acqPreview');if(!b)return;
    const box=b.closest('.cardAcquisitionFx'),url=box.querySelector('.acqMediaUrl').value.trim(),audio=box.querySelector('.acqAudioUrl').value.trim();
    if(!url)return alert('영상 경로를 입력하세요.');
    const layer=document.createElement('div');layer.className='acqFxPreviewLayer';layer.innerHTML=`<video playsinline autoplay controls src="${esc(url)}"></video><button type="button">닫기</button>${audio?`<audio autoplay src="${esc(audio)}"></audio>`:''}`;document.body.appendChild(layer);layer.querySelector('button').onclick=()=>layer.remove();layer.onclick=e=>{if(e.target===layer)layer.remove()};
  });
  new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});setTimeout(install,0);
})();
