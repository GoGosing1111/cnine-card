(()=>{
  if(!('serviceWorker' in navigator))return;
  let installPrompt=null;
  const installed=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true;
  const lockPortrait=()=>{if(installed()&&screen.orientation?.lock)screen.orientation.lock('portrait-primary').catch(()=>{})};
  const appleMobile=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const removeButton=()=>document.getElementById('pwaInstallButton')?.remove();
  const closeGuide=()=>document.getElementById('pwaInstallGuide')?.remove();
  const showAppleGuide=()=>{
    closeGuide();
    const guide=document.createElement('div');guide.id='pwaInstallGuide';guide.className='pwa-install-guide';
    guide.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="pwaGuideTitle"><button type="button" class="pwa-guide-close" aria-label="닫기">×</button><small>IOS INSTALL GUIDE</small><h2 id="pwaGuideTitle">홈 화면에 숲켓몬 설치</h2><ol><li>Safari 하단의 <b>공유 버튼</b>을 누릅니다.</li><li><b>홈 화면에 추가</b>를 선택합니다.</li><li>오른쪽 위의 <b>추가</b>를 누릅니다.</li></ol><button type="button" class="pwa-guide-done">확인</button></section>';
    guide.querySelectorAll('.pwa-guide-close,.pwa-guide-done').forEach(button=>button.onclick=closeGuide);
    guide.onclick=event=>{if(event.target===guide)closeGuide()};
    document.body.appendChild(guide);
  };
  const renderButton=()=>{
    if(installed()){removeButton();return}
    if((!installPrompt&&!appleMobile)||document.getElementById('pwaInstallButton'))return;
    const button=document.createElement('button');
    button.type='button';button.id='pwaInstallButton';button.className='pwa-install-button';
    button.innerHTML=`<span>${appleMobile?'홈 화면에 설치':'앱 설치'}</span><small>${appleMobile?'Safari 설치 방법 보기':'독립 창으로 빠르게 실행'}</small>`;
    button.onclick=async()=>{
      if(appleMobile&&!installPrompt){showAppleGuide();return}
      const prompt=installPrompt;if(!prompt)return;
      installPrompt=null;button.disabled=true;
      try{await prompt.prompt();await prompt.userChoice}finally{removeButton()}
    };
    document.body.appendChild(button);
  };
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;renderButton()});
  window.addEventListener('appinstalled',()=>{installPrompt=null;removeButton();closeGuide();lockPortrait()});
  new MutationObserver(renderButton).observe(document.body,{childList:true,subtree:true});
  // 새 Worker가 활성화되어도 진행 중인 전투·개봉 화면을 강제로 새로고침하지 않는다.
  // 새 앱 셸은 다음 일반 새로고침/재실행 때 적용되고 콘텐츠 캐시는 그대로 보존된다.
  navigator.serviceWorker.addEventListener('controllerchange',()=>window.dispatchEvent(new CustomEvent('cnine:pwa-controller-updated')));
  window.addEventListener('load',async()=>{renderButton();lockPortrait();try{const registration=await navigator.serviceWorker.register('/service-worker.js',{scope:'/',updateViaCache:'none'});await registration.update();setInterval(()=>registration.update().catch(()=>{}),5*60*1000)}catch(error){console.warn('PWA service worker registration failed',error)}},{once:true});
})();
