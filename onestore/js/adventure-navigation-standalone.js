/* Reuse the reviewed navigation on public pages that own their own header,
   layout and API lifecycle. This module only reads feature visibility. */
(function(global){
  'use strict';
  const route=document.currentScript?.dataset.route;
  if(!route)return;
  async function start(){
    if(!global.SoopAdventureLobby||document.querySelector('soop-adventure-lobby'))return;
    // A standalone document has a new window. The installed ONE store menu
    // reads the packaged policy synchronously when its element connects.
    if(/\bReverseCallStore\/onestore\//.test(navigator.userAgent)&&typeof global.CNineStorePolicy?.allowsRoute!=='function'){
      try{await import('/js/store-distribution-v1.js');}
      catch(error){console.warn('원스토어 메뉴 정책을 불러오지 못했습니다.',error);}
      if(typeof global.CNineStorePolicy?.allowsRoute!=='function')return;
    }
    const visibility={avatar:false,alchemy:false};
    const getUser=()=>{try{return JSON.parse(localStorage.getItem('cnine_card_user_v10')||'{}')||{};}catch{return {};}};
    const navigate=(id,href)=>location.assign(window.CNineStoreWeb.storeDocumentUrl(href||'/?screen='+encodeURIComponent(window.CNineStorePolicy.routeFor(id)),location.href)||'/onestore/');
    const element=global.SoopAdventureLobby.create({getUser,navigate,isRouteVisible:id=>visibility[id]!==false});
    element.setAttribute('data-shared-navigation','');element.dataset.standalone=route;
    element.setRoute(route);
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
