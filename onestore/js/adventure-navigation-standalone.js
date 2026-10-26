/* Reuse the reviewed navigation on public pages that own their own header,
   layout and API lifecycle. This module only reads feature visibility. */
(function(global){
  'use strict';
  const route=document.currentScript?.dataset.route;
  if(!route)return;
  function start(){
    if(!window.JokgakCity&&!document.querySelector('script[data-city-alerts]')){const alerts=document.createElement('script');alerts.src='/js/jokgak-city-v1.js?v=20261023-supply-hover1&loading=20261023-v1';alerts.dataset.cityAlerts='';document.head.append(alerts);}
    if(!global.SoopAdventureLobby||document.querySelector('soop-adventure-lobby'))return;
    const visibility={avatar:false,alchemy:false};
    const getUser=()=>{try{return JSON.parse(localStorage.getItem('cnine_card_user_v10')||'{}')||{};}catch{return {};}};
    const navigate=(id,href)=>location.assign(window.CNineStoreWeb.storeDocumentUrl(href||'/?screen='+encodeURIComponent(window.CNineStorePolicy.routeFor(id)),location.href)||'/onestore/');
    const element=global.SoopAdventureLobby.create({getUser,navigate,isRouteVisible:id=>visibility[id]!==false});
    element.setAttribute('data-shared-navigation','');element.dataset.standalone=route;element.dataset.route=route;
    document.body.dataset.adventureStandalone=route;
    document.body.append(element);
    async function refreshVisibility(){
      let token='';try{token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{}
      const read=async path=>{const response=await fetch('/api/'+path,{cache:'no-store',headers:token?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Feature unavailable');return response.json();};
      const [summary]=await Promise.allSettled([read('shell/summary')]);
      if(summary.status==='fulfilled'){visibility.avatar=summary.value.avatarFeature?.visible===true;visibility.alchemy=summary.value.alchemyFeature?.visible===true;}
      element.refreshMenus();
    }
    void refreshVisibility();
    global.addEventListener('storage',()=>void refreshVisibility());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
