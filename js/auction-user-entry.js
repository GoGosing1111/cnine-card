(function(){
 window.auctionUserReady??=import('./auction-user-live.mjs?v=20261127-auction-cap').then(module=>module.installAuctionLive());
 window.auctionUserReady.catch(()=>{});
 if(document.currentScript)document.currentScript.dataset.loaded='1';
})();
