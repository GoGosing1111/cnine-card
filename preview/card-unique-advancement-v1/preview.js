(()=>{
  'use strict';

  const requirements={eligibleGrades:['FUR','ZENITH'],minBreakthrough:13,costMasterStars:3000};
  const classInfo={code:'SERVER_PREVIEW_ATTACK',name:'파쇄자',effect:'서버 설정에서 전달된 고유 효과 설명 예시',tradeoff:'서버 설정에서 전달된 전직 대가 설명 예시',fxKey:'preview-attack'};
  const fixtures={
    ready:{label:'전직 가능 서버 응답',data:{cardId:'PREVIEW-ZENITH-13',current:null,grade:'ZENITH',breakthroughLevel:13,dominantType:'ATTACK',classInfo,requirements,wallet:{masterStars:3840},eligibility:{eligible:true,reasons:[]},canAdvance:true}},
    level:{label:'+12 조건 잠금',data:{cardId:'PREVIEW-FUR-12',current:null,grade:'FUR',breakthroughLevel:12,dominantType:'SPEED',classInfo:{...classInfo,code:'SERVER_PREVIEW_SPEED',name:'잔영자'},requirements,wallet:{masterStars:3840},eligibility:{eligible:false,reasons:['강화 +13 달성 후 전직할 수 있습니다.']},canAdvance:false}},
    stars:{label:'마스터의 별 999개',data:{cardId:'PREVIEW-ZENITH-13',current:null,grade:'ZENITH',breakthroughLevel:13,dominantType:'DEFENSE',classInfo:{...classInfo,code:'SERVER_PREVIEW_DEFENSE',name:'반격자'},requirements,wallet:{masterStars:999},eligibility:{eligible:true,reasons:['마스터의 별이 부족합니다.']},canAdvance:false}},
    completed:{label:'전직 완료 서버 응답',data:{cardId:'PREVIEW-ZENITH-13',current:{code:'SERVER_PREVIEW_HP',type:'HP',name:'불멸자',status:'COMPLETED'},grade:'ZENITH',breakthroughLevel:13,dominantType:'HP',classInfo:{...classInfo,code:'SERVER_PREVIEW_HP',name:'불멸자'},requirements,wallet:{masterStars:1840},eligibility:{eligible:true,reasons:[]},canAdvance:false}}
  };
  const api=globalThis.CNineCardUniqueAdvancementV1937,root=document.querySelector('[data-unique-advancement-root]'),label=document.getElementById('previewStateLabel');

  function show(key){
    const fixture=fixtures[key]||fixtures.ready;
    api.mountPreview(root,fixture.data);
    label.textContent=fixture.label;
    document.querySelectorAll('[data-preview-state]').forEach(button=>button.classList.toggle('active',button.dataset.previewState===key));
  }

  document.querySelectorAll('[data-preview-state]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.previewState)));
  show('ready');
})();
