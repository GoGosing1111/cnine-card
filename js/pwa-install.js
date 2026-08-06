(()=>{
  if(!('serviceWorker' in navigator))return;
  let installPrompt=null;
  const installed=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true;
  const removeButton=()=>document.getElementById('pwaInstallButton')?.remove();
  const renderButton=()=>{
    if(!installPrompt||installed()||document.getElementById('pwaInstallButton'))return;
    const button=document.createElement('button');
    button.type='button';button.id='pwaInstallButton';button.className='pwa-install-button';
    button.innerHTML='<span>PC 앱 설치</span><small>독립 창으로 빠르게 실행</small>';
    button.onclick=async()=>{
      const prompt=installPrompt;if(!prompt)return;
      installPrompt=null;button.disabled=true;
      try{await prompt.prompt();await prompt.userChoice}finally{removeButton()}
    };
    document.body.appendChild(button);
  };
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;renderButton()});
  window.addEventListener('appinstalled',()=>{installPrompt=null;removeButton()});
  new MutationObserver(renderButton).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).catch(error=>console.warn('PWA service worker registration failed',error)),{once:true});
})();
