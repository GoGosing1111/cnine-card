(()=>{
  if(!('serviceWorker' in navigator))return;
  let installPrompt=null;
  const installed=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true;
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
  window.addEventListener('appinstalled',()=>{installPrompt=null;removeButton();closeGuide()});
  new MutationObserver(renderButton).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',()=>{renderButton();navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).catch(error=>console.warn('PWA service worker registration failed',error))},{once:true});
})();
