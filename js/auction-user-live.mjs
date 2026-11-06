import {mountUserAuction,createAuctionOpeningNotice} from './auction-user-v1.mjs?v=20261106-volume-v1';
import {jointAccountRequest} from './joint-account-transport.mjs';
const STYLE='/css/auction-user-v1.css?v=20261106-volume-v1';
export const auctionLiveApi=(action,body)=>{
 const read=['state','catalog','lobby','bgm-events'].includes(action);
 const query=read&&body?'?'+new URLSearchParams(body):'';
 return jointAccountRequest('auction/user/'+action+query,{method:read?'GET':'POST',...(!read?{body}:{})});
};
function ensureStyle(){if(!document.querySelector('link[data-auction-live-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=STYLE;link.dataset.auctionLiveStyle='1';document.head.append(link);}}
export function installAuctionLive(){
 if(window.CNineUserAuction)return window.CNineUserAuction;
 let view=null,root=null,polling=false,lastRead=0,disposed=false;
 const context=()=>{let user=null;try{user=window.loadUser?.();}catch{}const route=window.SoopketmonV21ExactShell?.currentRoute;return {userId:Number(user?.serverUserId||user?.id||0),inLobby:route?route==='home':!!document.querySelector('.pc-lobby-scene,.mobile-command-lobby')};};
 const notice=createAuctionOpeningNotice({api:auctionLiveApi,getContext:context,onEnter:()=>window.renderShell?.('auction')});
 window.auctionHouseView=()=>'<div data-user-auction-mount><p role="status">경매장을 불러오는 중입니다.</p></div>';
 window.bindAuctionHouseView=()=>{const next=document.querySelector('[data-user-auction-mount]');if(!next||next===root)return;view?.destroy();root=next;ensureStyle();view=mountUserAuction({root,api:auctionLiveApi,onLobby:()=>window.renderShell?.('home')});};
 window.stopAuctionHouseView=()=>{view?.destroy();view=null;root=null;};
 async function sync(){
  if(disposed)return;
  const ctx=context();if(!ctx.inLobby||!ctx.userId){void notice.update(null);lastRead=0;return;}
  ensureStyle();if(polling||document.hidden||Date.now()-lastRead<15000)return;
  polling=true;lastRead=Date.now();try{await notice.update(await auctionLiveApi('lobby'));}catch{/* Read/claim retries on the next lobby poll. */}finally{polling=false;}
 }
 const interval=setInterval(sync,1000);document.addEventListener('visibilitychange',sync);void sync();
 const installed={sync,destroy(){disposed=true;clearInterval(interval);document.removeEventListener('visibilitychange',sync);notice.destroy();window.stopAuctionHouseView();}};
 window.CNineUserAuction=installed;return installed;
}
