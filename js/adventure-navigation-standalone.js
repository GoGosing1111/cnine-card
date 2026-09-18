/* Reuse the reviewed navigation on public pages that own their own header,
   layout and API lifecycle. This module only reads feature visibility. */
(function(global){
  'use strict';
  const route=document.currentScript?.dataset.route;
  if(!route)return;
  function start(){
    if(!global.SoopAdventureLobby||document.querySelector('soop-adventure-lobby'))return;
    const visibility={avatar:false,alchemy:false,goldenAxe:false};
    const getUser=()=>{try{return JSON.parse(localStorage.getItem('cnine_card_user_v10')||'{}')||{};}catch{return {};}};
    const navigate=(id,href)=>location.assign(href||'/?screen='+encodeURIComponent(id));
    const element=global.SoopAdventureLobby.create({getUser,navigate,isRouteVisible:id=>visibility[id]!==false});
    element.setAttribute('data-shared-navigation','');element.dataset.standalone=route;element.dataset.route=route;
    document.body.dataset.adventureStandalone=route;
    document.body.append(element);
    async function refreshVisibility(){
      let token='';try{token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{}
      const read=async path=>{const response=await fetch('/api/'+path,{cache:'no-store',headers:token?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Feature unavailable');return response.json();};
      const [summary,axe]=await Promise.allSettled([read('shell/summary'),read('events/golden-axe/feature')]);
      if(summary.status==='fulfilled'){visibility.avatar=summary.value.avatarFeature?.visible===true;visibility.alchemy=summary.value.alchemyFeature?.visible===true;}
      if(axe.status==='fulfilled')visibility.goldenAxe=axe.value.visible===true&&axe.value.phase!=='ENDED';
      element.refreshMenus();
    }
    void refreshVisibility();
    global.addEventListener('storage',()=>void refreshVisibility());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
