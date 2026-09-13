(function(){
  const embedded=parent!==window;
  const send=type=>parent.postMessage({type},location.origin);
  window.SoopLobbyInteractionOptions={
    tourKey:'cnine.lobby.tutorial.v1:'+String(new URLSearchParams(location.search).get('account')||'preview'),
    ...(embedded?{navigate:route=>parent.postMessage({type:'cnine:lobby-guide:navigate',route},location.origin)}:{})
  };
  if(!embedded)return;
  document.addEventListener('click',event=>{
    const link=event.target.closest('a');
    if(link&&new URL(link.href).pathname==='/'){event.preventDefault();send('cnine:lobby-guide:close');}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!document.querySelector('dialog[open]'))send('cnine:lobby-guide:close');
  });
})();
