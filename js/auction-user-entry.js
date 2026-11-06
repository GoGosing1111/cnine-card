(function(){
 window.auctionUserReady??=import('./auction-user-live.mjs?v=20261106-compact-drag-v1').then(module=>module.installAuctionLive());
 window.auctionUserReady.catch(()=>{});
 if(document.currentScript)document.currentScript.dataset.loaded='1';
})();
