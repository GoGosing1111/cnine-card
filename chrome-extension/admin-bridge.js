(()=>{
  function sync(){
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token');
    if(token) chrome.runtime.sendMessage({type:'CNINE_SAVE_ADMIN_TOKEN',token}).catch(()=>{});
  }
  sync();
  setInterval(sync,3000);
})();
