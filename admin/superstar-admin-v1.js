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
      label.innerHTML='<span>SUPERSTAR 기본 전투력</span><input class="battleGradeInput" data-grade="SUPERSTAR" type="number" min="0" value="7000">';
      battleGrid.append(label);
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
        field.innerHTML='<span>전투력 유형</span><select class="powerType" disabled><option value="FIXED" selected>챔피언형 · 7,000</option></select><small class="powerPreview">기본 전투력 7,000 · 일반 카드팩 획득 불가</small>';
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

  function enhance(root=document){
    ensureSuperstarOptions();
    if(root.matches?.('.adminCard'))enhanceCardEditor(root);
    root.querySelectorAll?.('.adminCard').forEach(enhanceCardEditor);
    if(root.matches?.('.pendingCard'))enhancePendingCard(root);
    root.querySelectorAll?.('.pendingCard').forEach(enhancePendingCard);
  }

  document.addEventListener('change',event=>{
    if(event.target.matches('.adminCard .rarity'))enhanceCardEditor(event.target.closest('.adminCard'));
    if(event.target.matches('.pendingCard .pRarity'))enhancePendingCard(event.target.closest('.pendingCard'));
  });
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
    if(node.nodeType===Node.ELEMENT_NODE)enhance(node);
  })));
  const start=()=>{enhance();observer.observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
