/* Presentation only: the native operation payload, timers and navigation own the data. */
(function(global){
  'use strict';
  const selector='soop-adventure-lobby [data-live-operations-surface="lobby-clarity"],#liveOperationsDialog[data-tactical-operations]';
  const icons={ORGANIZATION:'clan',ORGANIZATION_FACTION:'clanFaction',RANKED_DUO:'duo',TERRITORY:'territory',SEAL:'seal',AUCTION:'auction',RAID:'raid',COUP:'coup'};
  if(!document.getElementById('lobby-tactical-operations')){
    const style=document.createElement('style');style.id='lobby-tactical-operations';style.textContent=global.__TACTICAL_OPERATIONS_CSS__;document.head.append(style);
  }
  function refresh(){
    for(const surface of document.querySelectorAll(selector)){
      const opener=surface.querySelector('[data-live-operations-open]');
      if(opener&&opener.textContent!=='전체 보기')opener.textContent='전체 보기';
      for(const card of surface.querySelectorAll('[data-live-operation-kind],[data-live-burning-event]')){
        const icon=icons[card.dataset.liveOperationKind]||(card.dataset.liveBurningEvent?'gift':null),slot=card.querySelector('.live-operation-icon');
        if(icon&&slot&&!slot.querySelector('[data-tactical-icon="'+icon+'"]'))slot.innerHTML=global.SoopTacticalIcons.html(icon);
      }
    }
  }
  global.SoopLobbyOperations=Object.freeze({refresh});
})(window);
