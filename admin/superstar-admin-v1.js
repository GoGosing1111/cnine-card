(() => {
  'use strict';
  const GRADE='SUPERSTAR';
  const FRAME='../assets/ui/card-frames/superstar-championship-frame-v1.webp?v=1-superstar-grade';

  function ensureOption(select,afterFirst=false){
    if(!select||[...select.options].some(option=>option.value===GRADE))return;
    select.add(new Option(GRADE,GRADE),afterFirst?(select.options[1]||null):(select.options[0]||null));
  }

  function ensureSuperstarOptions(){
    ensureOption(document.querySelector('#grade'),true);
    ensureOption(document.querySelector('#cardGrade'));
    ensureOption(document.querySelector('#breakthroughGrade'));
    const battleGrid=document.querySelector('#battleGradePower');
    if(battleGrid?.children.length&&!battleGrid.querySelector('[data-grade="SUPERSTAR"]')){
      const label=document.createElement('label');
      label.className='field';
      label.innerHTML='<span>SUPERSTAR 기본 전투력</span><input class="battleGradeInput" data-grade="SUPERSTAR" type="number" min="0" value="15500" readonly aria-readonly="true">';
      battleGrid.append(label);
    }
    const input=battleGrid?.querySelector('[data-grade="SUPERSTAR"]');
    if(input){
      const reference=grade=>Math.max(0,Number(battleGrid.querySelector(`[data-grade="${grade}"]`)?.value??(grade==='FUR'?3200:5500)));
      input.value=String(Math.max(reference('FUR'),reference('ZENITH'))+10000);
      input.readOnly=true;
      if(!input.parentElement.querySelector('.superstar-power-policy')){
        const note=document.createElement('small');
        note.className='superstar-power-policy';
        note.textContent='+0~+13 동일 강화 FUR·ZENITH 중 높은 전투력 +10,000 · 덱 최대 1장';
        input.after(note);
      }
    }
  }

  function frameImage(className){
    const frame=document.createElement('img');
    frame.className=className;
    frame.src=FRAME;
    frame.alt='';
    frame.setAttribute('aria-hidden','true');
    return frame;
  }

  function enhanceCardEditor(card){
    const selectedGrade=String(card.querySelector('.rarity')?.value||'').toUpperCase();
    const isSuperstar=selectedGrade===GRADE;
    card.classList.toggle('superstarAdminCard',isSuperstar);
    const badge=card.querySelector('.gradeBadge');
    if(badge){badge.className=`gradeBadge grade-${selectedGrade}`;badge.textContent=selectedGrade}
    const thumb=card.querySelector('.cardThumbWrap');
    let frame=thumb?.querySelector('.superstarAdminFrame');
    if(isSuperstar&&thumb&&!frame){frame=frameImage('superstarAdminFrame');thumb.append(frame)}
    else if(!isSuperstar)frame?.remove();

    let field=card.querySelector('.cardPowerTypeField');
    if(isSuperstar){
      if(!field){field=document.createElement('label');card.querySelector('.weight')?.closest('.row')?.before(field)}
      if(field){
        field.className='field cardPowerTypeField superstarPowerField';
        field.innerHTML='<span>전투력 유형</span><select class="powerType" disabled><option value="FIXED" selected>챔피언형 · 등급 연동</option></select><small class="powerPreview">동일 강화 FUR·ZENITH 중 높은 전투력 +10,000 · 덱 최대 1장 · 일반 카드팩 획득 불가</small>';
      }
    }else if(field?.classList.contains('superstarPowerField'))field.remove();
  }

  function pendingGrade(card){return String(card.querySelector('.pRarity')?.value||card.dataset.grade||'').toUpperCase()}
  function enhancePendingCard(card){
    const isSuperstar=pendingGrade(card)===GRADE;
    card.dataset.grade=pendingGrade(card);
    card.classList.toggle('superstarPendingCard',isSuperstar);
    const visual=card.querySelector('.pendingCardVisual');
    let frame=visual?.querySelector('.superstarPendingFrame');
    if(isSuperstar&&visual&&!frame){frame=frameImage('superstarPendingFrame');visual.append(frame)}
    else if(!isSuperstar)frame?.remove();
  }

  function enhancePackCard(article){
    if(!article.querySelector('.cmsGrade.SUPERSTAR')||article.classList.contains('cmsSuperstarCard'))return;
    const art=[...article.children].find(node=>node.tagName==='IMG');
    if(!art)return;
    const visual=document.createElement('div');
    visual.className='cmsSuperstarVisual';
    article.insertBefore(visual,art);
    visual.append(art);
    visual.append(frameImage('cmsSuperstarFrame'));
    article.classList.add('cmsSuperstarCard');
  }

  function enhance(root=document){
    ensureSuperstarOptions();
    if(root.matches?.('.adminCard'))enhanceCardEditor(root);
    root.querySelectorAll?.('.adminCard').forEach(enhanceCardEditor);
    if(root.matches?.('.pendingCard'))enhancePendingCard(root);
    root.querySelectorAll?.('.pendingCard').forEach(enhancePendingCard);
    if(root.matches?.('.cmsNewCardGrid article'))enhancePackCard(root);
    root.querySelectorAll?.('.cmsNewCardGrid article').forEach(enhancePackCard);
  }

  document.addEventListener('change',event=>{
    if(event.target.matches('.adminCard .rarity'))enhanceCardEditor(event.target.closest('.adminCard'));
    if(event.target.matches('.pendingCard .pRarity'))enhancePendingCard(event.target.closest('.pendingCard'));
  });
  document.addEventListener('input',event=>{
    if(event.target.matches('#battleGradePower [data-grade="FUR"],#battleGradePower [data-grade="ZENITH"]'))ensureSuperstarOptions();
  });
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
    if(node.nodeType===Node.ELEMENT_NODE)enhance(node);
  })));
  const start=()=>{enhance();observer.observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
